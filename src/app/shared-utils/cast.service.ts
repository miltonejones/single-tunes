import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ITrackItem } from './models';
import { buildPlayerUrl } from './domain/track';
import { ToastService } from './toast.service';

/**
 * Lightweight ambient declarations for the Cast CAF Sender SDK globals
 * that are loaded at runtime from:
 *   https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1
 *
 * Full type definitions are available via @types/chromecast-caf-sender.
 */
declare namespace cast.framework {
  const CastContext: {
    getInstance(): CastContext;
  };
  const CastState: { NO_DEVICES_AVAILABLE: string; NOT_CONNECTED: string; CONNECTING: string; CONNECTED: string };
  const SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDING: string; SESSION_ENDED: string };
  const RemotePlayer: new () => RemotePlayer;
  const RemotePlayerController: new (player: RemotePlayer) => RemotePlayerController;
  const CastContextEventType: { SESSION_STATE_CHANGED: string };
  const RemotePlayerEventType: {
    IS_PLAYING_CHANGED: string; CURRENT_TIME_CHANGED: string; DURATION_CHANGED: string;
    PLAYER_STATE_CHANGED: string; VOLUME_LEVEL_CHANGED: string; IS_MUTED_CHANGED: string;
  };

  interface CastContext {
    setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
    getCastState(): string;
    getSessionState(): string;
    getCurrentSession(): CastSession | null;
    addEventListener(type: string, handler: (event: any) => void): void;
    requestSession(): Promise<void>;
    endCurrentSession(stopCasting: boolean): void;
  }

  interface CastSession {
    getSessionId(): string;
    loadMedia(loadRequest: chrome.cast.media.LoadRequest): Promise<void>;
    addMessageListener(namespace: string, listener: (ns: string, msg: string) => void): void;
    addEventListener(type: string, handler: (event: any) => void): void;
    receiver: { friendlyName: string };
  }

  interface RemotePlayer {
    isConnected: boolean; isPaused: boolean; isPlaying: boolean;
    currentTime: number; duration: number; volumeLevel: number; isMuted: boolean; playerState: string;
  }

  interface RemotePlayerController {
    addEventListener(type: string, handler: (event: any) => void): void;
    playOrPause(): void; seek(): void; setVolumeLevel(): void;
  }
}

declare namespace chrome.cast.media {
  const MetadataType: { MUSIC_TRACK: number };
  class MediaInfo {
    constructor(contentId: string, contentType: string);
    metadata?: MusicTrackMediaMetadata;
    streamDuration?: number;
  }
  class MusicTrackMediaMetadata { metadataType: number; title?: string; artist?: string; albumName?: string; images?: chrome.cast.Image[]; }
  class LoadRequest { constructor(mediaInfo: MediaInfo); autoplay?: boolean; currentTime?: number; }
}

declare namespace chrome.cast {
  class Image { constructor(url: string); url: string; }
}

const RECEIVER_APP_ID = 'CC1AD845';

@Injectable({ providedIn: 'root' })
export class CastService {
  readonly isAvailable$ = new BehaviorSubject(false);

  isAvailable(): boolean { return this.isAvailable$.value; }

  readonly isConnected$ = new BehaviorSubject(false);

  isConnected(): boolean { return this.isConnected$.value; }

  readonly isPlaying$ = new BehaviorSubject(false);
  readonly currentTime$ = new BehaviorSubject(0);
  readonly duration$ = new BehaviorSubject(0);
  readonly deviceName$ = new BehaviorSubject('');
  readonly playerState$ = new BehaviorSubject('');

  private remotePlayer: cast.framework.RemotePlayer | null = null;
  private controller: cast.framework.RemotePlayerController | null = null;
  private timePollId: ReturnType<typeof setInterval> | null = null;

  constructor(private zone: NgZone, private toast: ToastService) { this.initWhenReady(); }

  connect(): void {
    getContext()?.requestSession().catch((err: any) => {
      console.warn('[CastService] requestSession failed:', err);
      const reason = err?.description || err?.code || 'unknown error';
      this.toast.show(`Cast failed: ${reason}`);
    });
  }

  disconnect(): void { getContext()?.endCurrentSession(true); }

  play(): void { this.controller?.playOrPause(); }

  pause(): void { if (this.isPlaying$.value) this.controller?.playOrPause(); }

  seekTo(time: number): void {
    if (!this.remotePlayer || !this.controller) return;
    this.remotePlayer.currentTime = Math.max(0, time);
    this.controller.seek();
  }

  getVolume(): number {
    return this.remotePlayer?.volumeLevel ?? 1;
  }

  setVolume(level: number): void {
    if (!this.remotePlayer || !this.controller) return;
    this.remotePlayer.volumeLevel = Math.max(0, Math.min(1, level));
    this.controller.setVolumeLevel();
  }

  loadTrack(track: ITrackItem, startTime = 0): void {
    const ctx = getContext();
    const session = ctx?.getCurrentSession();
    if (!session) return;

    const audioUrl = buildPlayerUrl(track.FileKey);
    const metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    metadata.metadataType = chrome.cast.media.MetadataType.MUSIC_TRACK;
    metadata.title = track.Title;
    metadata.artist = track.artistName;
    metadata.albumName = track.albumName;
    if (track.albumImage) metadata.images = [new chrome.cast.Image(track.albumImage)];

    const mediaInfo = new chrome.cast.media.MediaInfo(audioUrl, 'audio/mpeg');
    mediaInfo.metadata = metadata;
    if (track.trackTime) mediaInfo.streamDuration = track.trackTime / 1000;

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;
    if (startTime > 0) request.currentTime = startTime;
    session.loadMedia(request).catch(() => {});
  }

  private initWhenReady(): void {
    if (sdkLoaded()) { this.initialize(); return; }
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (sdkLoaded()) { clearInterval(poll); this.zone.run(() => this.initialize()); }
      else if (attempts > 100) { clearInterval(poll); }
    }, 100);
  }

  private initialize(): void {
    try {
      this.setupContext();
      this.setupRemotePlayer();
      setTimeout(() => this.syncAvailability(), 2000);
    } catch (e) {
      console.warn('[CastService] initialization failed (Cast SDK not available):', e);
    }
  }

  private setupContext(): void {
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({ receiverApplicationId: RECEIVER_APP_ID, autoJoinPolicy: 'origin_scoped' });
    context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (event: any) =>
      this.zone.run(() => this.onSessionChanged(event)),
    );
  }

  private setupRemotePlayer(): void {
    this.remotePlayer = new cast.framework.RemotePlayer();
    this.controller = new cast.framework.RemotePlayerController(this.remotePlayer);
    this.controller.addEventListener(cast.framework.RemotePlayerEventType.IS_PLAYING_CHANGED, () =>
      this.zone.run(() => this.isPlaying$.next(this.remotePlayer!.isPlaying)),
    );
    this.controller.addEventListener(cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED, () =>
      this.zone.run(() => this.currentTime$.next(this.remotePlayer!.currentTime)),
    );
    this.controller.addEventListener(cast.framework.RemotePlayerEventType.DURATION_CHANGED, () =>
      this.zone.run(() => this.duration$.next(this.remotePlayer!.duration)),
    );
    this.controller.addEventListener(cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED, () =>
      this.zone.run(() => {
        const state = this.remotePlayer!.playerState;
        this.playerState$.next(state);
        state === 'PLAYING' ? this.startTimePoll() : this.stopTimePoll();
      }),
    );
  }

  private onSessionChanged(event: any): void {
    const connected =
      event.sessionState === cast.framework.SessionState.SESSION_STARTED ||
      event.sessionState === cast.framework.SessionState.SESSION_RESUMED;
    this.isConnected$.next(connected);
    if (connected) {
      const friendlyName = (event.session as any)?.receiver?.friendlyName ?? '';
      this.deviceName$.next(friendlyName);
      if (friendlyName) this.toast.show(`Casting to ${friendlyName}`);
    } else {
      this.deviceName$.next('');
      this.isPlaying$.next(false);
      this.currentTime$.next(0);
      this.duration$.next(0);
      this.playerState$.next('');
      this.stopTimePoll();
    }
  }

  private syncAvailability(): void {
    const ctx = getContext();
    if (!ctx) { this.isAvailable$.next(false); return; }
    const state = ctx.getCastState();
    this.isAvailable$.next(
      state === cast.framework.CastState.NOT_CONNECTED ||
      state === cast.framework.CastState.CONNECTING ||
      state === cast.framework.CastState.CONNECTED,
    );
  }

  private startTimePoll(): void {
    if (this.timePollId !== null) return;
    this.timePollId = setInterval(() => {
      if (this.remotePlayer) this.currentTime$.next(this.remotePlayer.currentTime);
    }, 1000);
  }

  private stopTimePoll(): void {
    if (this.timePollId !== null) { clearInterval(this.timePollId); this.timePollId = null; }
  }
}

function getContext(): cast.framework.CastContext | null {
  try { return cast?.framework?.CastContext?.getInstance?.() ?? null; } catch { return null; }
}

function sdkLoaded(): boolean {
  return typeof cast !== 'undefined' && typeof cast.framework !== 'undefined' && typeof cast.framework.CastContext !== 'undefined';
}
