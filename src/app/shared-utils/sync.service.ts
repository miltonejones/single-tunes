import { Injectable, effect, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AudioPlayerCommandService } from './audio-player-command.service';
import { ITrackItem } from './models';
import { UserService } from './user.service';
import { ToastService } from './toast.service';
import { SyncClient } from './sync-sw/sync-client';

/**
 * Cross-instance playback sync — thin relay between the sync service worker
 * and the AudioPlayerCommandService.
 *
 * The service worker owns all backend communication (register, heartbeat,
 * poll, publish). Tabs send user actions and playback state to the SW via
 * postMessage; the SW broadcasts state updates and mode changes back.
 *
 * Leadership is "newest play wins": any local user action optimistically
 * claims leadership; the SW confirms via the backend lease. If another
 * device holds the lease, the SW tells this tab to stand down.
 */

export type SyncMode = 'idle' | 'leader' | 'follower';

/** Minimal track shape shipped over the wire — enough for followers to render. */
export interface SyncTrack {
  ID?: number;
  Title: string;
  artistName: string;
  albumName: string;
  FileKey: string;
  albumImage: string | null;
  trackTime: any;
}

export interface SyncAnnouncement {
  text: string;
  ts: number;
}

export interface SyncState {
  leaderInstanceId: string;
  updatedAt: number;
  track: SyncTrack | null;
  queue: SyncTrack[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  announcement: SyncAnnouncement | null;
}

@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private userService = inject(UserService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private toastService = inject(ToastService);
  private syncClient = inject(SyncClient);

  /** Current role of this instance. */
  readonly mode = signal<SyncMode>('idle');
  /** Latest state mirrored from the leader (null when leading/idle). */
  readonly mirrored = signal<SyncState | null>(null);
  /** Silent announcement status text for followers. */
  readonly mirroredAnnouncement = signal<string>('');

  private instanceId = this.userService.instanceId;
  /** ts of the newest announcement already toasted — everything older is a rebroadcast. */
  private lastAnnouncementTs = 0;
  private subscriptions: Subscription[] = [];
  private heartbeatSub: Subscription | null = null;
  private stateSub: Subscription | null = null;
  private modeSub: Subscription | null = null;
  private isApplyingMirror = false;

  constructor() {
    // Start syncing the moment a user identity exists (after the first-run gate).
    effect(() => {
      const user = this.userService.user();
      if (user) {
        void this.start(user.userKey);
      } else {
        this.stop();
      }
    });
  }

  private async start(userKey: string): Promise<void> {
    // React to local command-service changes — forward to SW as user actions.
    // Any non-mirror emission is treated as a local user action (leadership
    // takeover), since applyMirroredState sets isApplyingMirror around its own
    // emissions.
    this.subscriptions.push(
      this.audioPlayerCommand.currentTrack$.subscribe((track) => {
        if (this.isApplyingMirror) return;
        this.onLocalOrigin();
        this.syncClient.sendUserAction({ track: toSyncTrack(track) });
      }),
      this.audioPlayerCommand.queue$.subscribe((queue) => {
        if (this.isApplyingMirror) return;
        this.onLocalOrigin();
        this.syncClient.sendUserAction({
          queue: queue.map(toSyncTrack).filter((t): t is SyncTrack => !!t),
        });
      }),
      this.audioPlayerCommand.togglePlayPause$.subscribe(() => {
        if (this.isApplyingMirror) return;
        this.onLocalOrigin();
        this.syncClient.sendUserAction({ isPlaying: undefined });
      }),
      this.audioPlayerCommand.seekRelative$.subscribe(() => {
        if (this.isApplyingMirror) return;
        this.onLocalOrigin();
        this.syncClient.sendUserAction({});
      }),
    );

    // Try the service-worker-backed sync; fall back to in-tab if unavailable.
    try {
      await this.syncClient.init(userKey, this.instanceId);

      // SW → Tab: state updates from other devices.
      this.stateSub = this.syncClient.stateUpdates$.subscribe((state) => {
        // Leader tabs ignore their own state echoed back.
        if (this.mode() === 'leader') return;
        if (state.leaderInstanceId === this.instanceId) return;
        this.applyMirror(state);
      });

      // SW → Tab: mode changes.
      this.modeSub = this.syncClient.modeChanges$.subscribe((mode) => {
        this.mode.set(mode);
        if (mode === 'follower') {
          // AudioPlayer reacts to mode() and mutes/releases its audio element.
        }
      });

      // SW → Tab: heartbeat results (stale detection, leadership stand-down).
      this.heartbeatSub = this.syncClient.heartbeatResults.subscribe((result) => {
        if (result.stale) {
          this.syncClient.sendRegister(''); // trigger SW re-registration
        }
        if (
          this.mode() === 'leader' &&
          result.leaderInstanceId &&
          result.leaderInstanceId !== this.instanceId
        ) {
          this.mode.set('follower');
          if (result.state) this.applyMirror(result.state);
        }
      });
    } catch {
      console.warn('sync: SW unavailable, running unsynced');
    }
  }

  private stop(): void {
    this.stateSub?.unsubscribe();
    this.stateSub = null;
    this.modeSub?.unsubscribe();
    this.modeSub = null;
    this.heartbeatSub?.unsubscribe();
    this.heartbeatSub = null;
    this.syncClient.destroy();
    for (const s of this.subscriptions) s.unsubscribe();
    this.subscriptions = [];
    this.mode.set('idle');
    this.mirrored.set(null);
    this.mirroredAnnouncement.set('');
  }

  // ── Leadership ───────────────────────────────────────────────────────────

  /**
   * Called by AudioPlayerCommandService on any user-originated action. The
   * newest action wins, so we optimistically become leader immediately and
   * let the SW confirm via the backend lease.
   */
  onLocalOrigin(): void {
    if (this.mode() === 'leader') return;
    this.mode.set('leader');
    this.mirrored.set(null);
  }

  /** True when this instance should render the leader's UI without audio. */
  following(): boolean {
    return this.mode() === 'follower';
  }

  /** AudioPlayer reports mutable playback fields while leading. */
  reportPlayback(partial: {
    isPlaying?: boolean;
    currentTime?: number;
    duration?: number;
    volume?: number;
    muted?: boolean;
  }): void {
    if (this.mode() !== 'leader') return;
    this.syncClient.sendPlaybackState({
      currentTime: partial.currentTime ?? 0,
      duration: partial.duration ?? 0,
      volume: partial.volume ?? 1,
      muted: partial.muted ?? false,
      isPlaying: partial.isPlaying ?? false,
    });
  }

  /** AudioPlayer reports the announcement text it just generated (leader only). */
  reportAnnouncement(text: string): void {
    if (this.mode() !== 'leader' || !text) return;
    this.syncClient.sendAnnouncement(text);
  }

  // ── Mirror application ───────────────────────────────────────────────────

  private applyMirror(state: SyncState): void {
    this.isApplyingMirror = true;
    try {
      this.mirrored.set(state);
      this.mode.set('follower');
      if (state.announcement?.text && state.announcement.ts > this.lastAnnouncementTs) {
        this.lastAnnouncementTs = state.announcement.ts;
        this.toastService.show(state.announcement.text);
        this.mirroredAnnouncement.set(state.announcement.text);
      } else if (!state.announcement?.text && this.mirroredAnnouncement()) {
        this.mirroredAnnouncement.set('');
      }
      // Drive the command service so TrackQueue / now-playing render the leader's view.
      this.audioPlayerCommand.applyMirroredState(state);
    } finally {
      this.isApplyingMirror = false;
    }
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function toSyncTrack(track: ITrackItem | null): SyncTrack | null {
  if (!track) return null;
  return {
    ID: track.ID,
    Title: track.Title,
    artistName: track.artistName,
    albumName: track.albumName,
    FileKey: track.FileKey,
    albumImage: track.albumImage,
    trackTime: track.trackTime,
  };
}
