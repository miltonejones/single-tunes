import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NavigationEnd, Router } from '@angular/router';
import {
  AnnouncementCommandService,
  AudioPlayerCommandService,
  CastService,
  FEATURE_FLAGS,
  formatDuration,
  ImgFallbackDirective,
  ITrackItem,
  LocationService,
  PlayHistoryService,
  shouldAnnounceForFrequency,
  SpeechPlaybackService,
  SyncService,
  TrackDownloadService,
  TrackMenu,
} from 'shared-utils';
import { AnnouncerSettingsService } from './announcer-settings.service';
import { AudioAnalyserService } from './audio-analyser.service';
import { AudioVisualizer } from './audio-visualizer';
import { AudioVisualizerPanelService } from './audio-visualizer-panel.service';
import { ArtistBioPanelService } from './artist-bio-panel.service';
import { CastButton } from './cast-button';
import { TrackQueuePanelService } from './track-queue-panel.service';
import { TrackDedicationService } from './track-dedication.service';

const ANNOUNCING_VOLUME = 0.3;

@Component({
  selector: 'app-audio-player',
  imports: [CastButton, ImgFallbackDirective, AudioVisualizer, TrackMenu],
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.css',
})
export class AudioPlayer implements OnInit, OnDestroy {
  @ViewChild('audioEl') private audioElRef!: ElementRef<HTMLAudioElement>;

  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private announcementCommand = inject(AnnouncementCommandService);
  private announcerSettings = inject(AnnouncerSettingsService);
  private locationService = inject(LocationService);
  private speechPlayback = inject(SpeechPlaybackService);
  private audioAnalyser = inject(AudioAnalyserService);
  private castService = inject(CastService);
  private playHistory = inject(PlayHistoryService);
  private trackDownload = inject(TrackDownloadService);
  private trackDedication = inject(TrackDedicationService);
  protected sync = inject(SyncService);
  private router = inject(Router);
  protected readonly featureFlags = FEATURE_FLAGS;
  private blobUrl: string | null = null;
  protected queuePanel = inject(TrackQueuePanelService);
  protected visualizerPanel = inject(AudioVisualizerPanelService);
  protected bioPanel = inject(ArtistBioPanelService);
  private subscriptions: Subscription[] = [];

  track = signal<ITrackItem | null>(null);
  isPlaying = signal(false);
  announcing = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  isExpanded = signal(false);
  protected isCasting = signal(false);
  protected showTrackMenu = signal(false);
  protected volume = signal(1);
  protected dominantColor = signal<string | null>(null);
  protected hasDominantColor = computed(() => this.dominantColor() !== null);
  protected isMuted = signal(false);

  private playRequestId = 0;
  private loadingTrack = false;
  private lastReportedTime = -1;
  private wasLeader = false;

  /** The source context (list type + name) of the most recently played track. */
  protected currentSource = computed(() => {
    const h = this.playHistory.history();
    return h.length > 0 ? { type: h[0].sourceType, name: h[0].sourceName } : null;
  });
  private corsRetryAttempted = false;
  private castTransitioning = false;
  private wakeLock: WakeLockSentinel | null = null;
  private originalVolume = 1;
  progress = computed(() => (this.duration() ? (this.currentTime() / this.duration()) * 100 : 0));
  currentTimeLabel = computed(() => formatDuration(this.currentTime()));
  durationLabel = computed(() => formatDuration(this.duration()));

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Listen for track changes from the queue / global command service.
    this.subscriptions.push(
      this.audioPlayerCommand.currentTrack$.subscribe((track) => {
        this.track.set(track);
        // Followers mirror the leader's UI without producing audio or TTS.
        if (this.sync.following()) {
          if (track) {
            this.mirrorTrack(track);
            this.updateMediaSession(track);
          } else {
            this.clearMediaSession();
          }
          return;
        }
        if (track) {
          this.loadAndPlay(track);
          this.updateMediaSession(track);
        } else {
          this.stopInternal();
          this.clearMediaSession();
        }
      }),
    );

    // Listen for seek relative requests
    this.subscriptions.push(
      this.audioPlayerCommand.seekRelative$.subscribe((seconds) => {
        this.seekRelative(seconds);
      }),
    );

    // Listen for toggle play/pause requests
    this.subscriptions.push(
      this.audioPlayerCommand.togglePlayPause$.subscribe(() => {
        this.togglePlayPause();
      }),
    );

    // Watch Cast connection state — hand off / reclaim playback.
    this.subscriptions.push(
      this.castService.isConnected$.subscribe((connected) => {
        const previouslyCasting = this.isCasting();
        this.isCasting.set(connected);

        if (connected && !previouslyCasting) {
          // User just connected to a Cast device while playing locally.
          this.onCastConnected();
        } else if (!connected && previouslyCasting) {
          // User just disconnected / session ended while Cast was playing.
          this.onCastDisconnected();
        }
      }),
    );

    // During Cast, drive UI from CastService observables instead of <audio> events.
    this.subscriptions.push(
      this.castService.isPlaying$.subscribe((v) => {
        if (this.isCasting()) this.isPlaying.set(v);
      }),
      this.castService.currentTime$.subscribe((v) => {
        if (this.isCasting()) this.currentTime.set(v);
      }),
      this.castService.duration$.subscribe((v) => {
        if (this.isCasting()) this.duration.set(v);
      }),
    );

    // Auto-advance when a track finishes on the Cast device.
    // The IDLE state fires both when a track ends naturally AND transiently
    // while a new track is being loaded. We use a guard to suppress the
    // transient IDLE that occurs between loadTrack() and the first PLAYING
    // state of the new track.
    this.subscriptions.push(
      this.castService.playerState$.subscribe((state) => {
        if (this.isCasting() && state === 'IDLE' && this.castService.isConnected$.value) {
          if (!this.castTransitioning) {
            this.castTransitioning = true;
            this.advanceTrack(1);
          }
        } else if (state === 'PLAYING' || state === 'BUFFERING') {
          this.castTransitioning = false;
        }
      }),
    );

    // Collapse the mobile fullscreen player whenever the user navigates away.
    this.subscriptions.push(
      this.router.events
        .pipe(filter((e) => e instanceof NavigationEnd))
        .subscribe(() => this.isExpanded.set(false)),
    );
  }

  ngOnDestroy(): void {
    for (const s of this.subscriptions) s.unsubscribe();
    this.revokeBlobUrl();
  }

  // ── Cast transition helpers ──────────────────────────────────────────────────

  /**
   * The user connected to a Cast device while something was playing locally.
   * Pause the native element, hand the current track + position to the Cast
   * device, then let CastService drive the UI.
   */
  private onCastConnected(): void {
    const currentTrack = this.track();
    const position = this.audioEl.currentTime;

    // Pause native playback
    this.audioEl.pause();
    this.speechPlayback.pause();

    if (currentTrack) {
      this.castService.loadTrack(currentTrack, position);
    }
  }

  /**
   * The Cast session ended while playing. Read the Cast position, load
   * the same track on the native <audio> element, seek to the position,
   * and resume local playback.
   */
  private onCastDisconnected(): void {
    const currentTrack = this.track();
    const castPosition = this.castService.currentTime$.value;

    if (currentTrack && castPosition > 0) {
      this.loadAudioElement(currentTrack, castPosition);
    }
  }

  // ─── Core playback ───────────────────────────────────────────────────────────

  private get audioEl(): HTMLAudioElement {
    return this.audioElRef.nativeElement;
  }

  /** Extracts a dominant color from the album art image for dynamic background tinting.
   *  Tries with CORS first (allows canvas pixel reading); if the server doesn't support
   *  CORS, retries without it so the image at least loads (canvas read will be blocked,
   *  but that's handled gracefully). */
  private extractDominantColor(imageUrl: string): void {
    this.tryExtractColor(imageUrl, true);
  }

  private tryExtractColor(imageUrl: string, useCors: boolean): void {
    const img = new Image();
    if (useCors) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const size = 10;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Skip very dark or very bright pixels
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (brightness > 30 && brightness < 225) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }
        if (count > 0) {
          this.dominantColor.set(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);
        }
      } catch {
        // Canvas tainted (CORS without permissive server) or other error.
        // If we haven't tried without CORS yet, retry.
        if (useCors) {
          this.tryExtractColor(imageUrl, false);
        }
      }
    };
    img.onerror = () => {
      if (useCors) {
        // CORS preflight failed — retry without CORS so the image at least loads
        // (canvas pixel read will be blocked, but the catch above handles that).
        this.tryExtractColor(imageUrl, false);
      } else {
        this.dominantColor.set(null);
      }
    };
    img.src = imageUrl;
  }

  private async loadAndPlay(track: ITrackItem): Promise<void> {
    const requestId = ++this.playRequestId;
    this.loadingTrack = true;
    try {
      await this.loadAndPlayInner(track, requestId);
    } finally {
      this.loadingTrack = false;
    }
  }

  private async loadAndPlayInner(track: ITrackItem, requestId: number): Promise<void> {
    if (this.isCasting()) {
      // Suppress the auto-advance guard: the Cast device may briefly go IDLE
      // while transitioning to the new track, and we don't want that to
      // trigger skip-to-next.
      this.castTransitioning = true;
      this.castService.loadTrack(track);

      // Announcement — TTS plays locally while volume ducks on Cast.
      const settings = this.announcerSettings.settings();

      // Check if this track has a dedication
      let announcerName = settings.name;
      if (track.ID !== undefined) {
        const dedicationName = this.trackDedication.getDedication(track.ID);
        if (dedicationName) {
          announcerName = dedicationName;
        }
      }

      if (shouldAnnounceForFrequency(settings.frequency)) {
        this.announcing.set(true);
        await this.announcementCommand.announceTrackChange(
          track.artistName, track.Title, track.trackTime,
          announcerName, this.locationService.resolvedZip(), settings.chatType, settings.voiceURI,
          () => {
            this.originalVolume = this.castService.getVolume();
            this.setVolume(ANNOUNCING_VOLUME);
          },
          (_e, messageContent) => {
            this.setVolume(this.originalVolume);
            if (messageContent) this.sync.reportAnnouncement(messageContent);
          },
          () => this.setVolume(this.originalVolume),
        );
      }

      this.announcing.set(false);
      return;
    }

    // Extract dominant color from album art for dynamic background
    if (track.albumImage) {
      this.extractDominantColor(track.albumImage);
    } else {
      this.dominantColor.set(null);
    }

    // Local playback
    this.corsRetryAttempted = false;
    this.audioAnalyser.setAvailable(true);
    this.audioAnalyser.initialize(this.audioEl);
    this.revokeBlobUrl();
    const { src, isBlob } = await this.trackDownload.getAudioSrc(track);
    if (isBlob) this.blobUrl = src;
    this.audioEl.crossOrigin = isBlob ? '' : 'anonymous';
    this.audioEl.src = src;

    const settings = this.announcerSettings.settings();

    // Check if this track has a dedication
    let announcerName = settings.name;
    if (track.ID !== undefined) {
      const dedicationName = this.trackDedication.getDedication(track.ID);
      if (dedicationName) {
        announcerName = dedicationName;
      }
    }

    if (shouldAnnounceForFrequency(settings.frequency)) {
      this.announcing.set(true);
      await this.announcementCommand.announceTrackChange(
        track.artistName, track.Title, track.trackTime,
        announcerName, this.locationService.resolvedZip(), settings.chatType, settings.voiceURI,
        () => {
          this.originalVolume = this.audioEl.volume;
          this.setVolume(ANNOUNCING_VOLUME);
        },
        (_e, messageContent) => {
          this.setVolume(this.originalVolume);
          if (messageContent) this.sync.reportAnnouncement(messageContent);
        },
        () => this.setVolume(this.originalVolume),
      );
    }

    if (requestId !== this.playRequestId) return;

    this.announcing.set(false);
    this.play();
    this.sync.reportPlayback({ isPlaying: true, duration: this.audioEl.duration || 0 });
  }

  /** Load a track on the native <audio> element, optionally seeking to a position. */
  private async loadAudioElement(track: ITrackItem, seekToPosition = 0): Promise<void> {
    this.corsRetryAttempted = false;
    this.audioAnalyser.setAvailable(true);
    this.audioAnalyser.initialize(this.audioEl);
    this.revokeBlobUrl();
    const { src, isBlob } = await this.trackDownload.getAudioSrc(track);
    if (isBlob) this.blobUrl = src;
    this.audioEl.crossOrigin = isBlob ? '' : 'anonymous';
    this.audioEl.src = src;

    if (seekToPosition > 0) {
      const onLoaded = () => {
        this.audioEl.currentTime = Math.min(seekToPosition, this.audioEl.duration || seekToPosition);
        this.audioEl.removeEventListener('loadedmetadata', onLoaded);
      };
      this.audioEl.addEventListener('loadedmetadata', onLoaded);
    }

    this.play();
  }

  private revokeBlobUrl(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  // ── Wake lock (keep screen on while playing) ───────────────────────────────

  private async acquireWakeLock(): Promise<void> {
    if (this.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch {
      // Wake Lock API not supported or denied — fine to ignore.
    }
  }

  private releaseWakeLock(): void {
    this.wakeLock?.release();
    this.wakeLock = null;
  }

  // ── Media Session (lock screen / control center integration) ──────────────

  private updateMediaSession(track: ITrackItem): void {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.Title,
      artist: track.artistName,
      album: track.albumName ?? undefined,
      artwork: track.albumImage
        ? [{ src: track.albumImage, sizes: '512x512', type: 'image/jpeg' }]
        : undefined,
    });
  }

  private clearMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = null;
  }

  /** Sync playback position to the OS media controls. */
  private syncMediaSessionPosition(): void {
    if (!('mediaSession' in navigator)) return;
    const dur = this.duration();
    if (dur <= 0) return;
    navigator.mediaSession.setPositionState({
      duration: dur,
      playbackRate: 1,
      position: this.currentTime(),
    });
  }

  constructor() {
    // Keep the screen awake whenever audio is playing (local or Cast).
    effect(() => {
      if (this.isPlaying()) {
        this.acquireWakeLock();
      } else {
        this.releaseWakeLock();
      }
    });

    // Broadcast play/pause state so track lists can reflect it (e.g. pausing
    // the "now playing" spin animation).
    effect(() => {
      this.audioPlayerCommand.setIsPlaying(this.isPlaying());
    });

    // Sync media session position state to lock screen / control center.
    effect(() => {
      if (this.isPlaying()) {
        this.currentTime();
        this.duration();
        this.syncMediaSessionPosition();
      }
    });

    // Wire media session action handlers (safe to do even if unsupported).
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.advanceTrack(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => this.advanceTrack(1));
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) this.seekTo(details.seekTime);
      });
    }

    // ── Cross-instance sync ───────────────────────────────────────────────────
    // Follower: drive display signals from the leader's mirrored state.
    effect(() => {
      if (!this.sync.following()) return;
      const m = this.sync.mirrored();
      if (!m) return;
      this.isPlaying.set(m.isPlaying);
      this.currentTime.set(m.currentTime);
      this.duration.set(m.duration);
      this.volume.set(m.volume);
      this.isMuted.set(m.muted);
      this.announcing.set(!!m.announcement?.text);
    });

    // Leadership changes: take over audible playback, or mute+release on stand-down.
    // Only act on an actual idle/follower -> leader *transition* — reading
    // this.track() unconditionally here would also re-run this effect on every
    // ordinary track advance while already leading (mode unchanged), racing
    // and duplicating the load that the currentTrack$ subscription already
    // does and restarting playback from position 0.
    effect(() => {
      const mode = this.sync.mode();
      const tookOverLeadership = mode === 'leader' && !this.wasLeader;
      this.wasLeader = mode === 'leader';

      if (tookOverLeadership && this.track() && !this.isCasting() && !this.loadingTrack) {
        // Resume from the mirrored position when continuing the same track;
        // start from 0 when the user picked a different track.
        const mirrored = this.sync.mirrored();
        const sameTrack = mirrored?.track?.ID != null && mirrored.track.ID === this.track()?.ID;
        const pos = sameTrack ? mirrored!.currentTime : 0;
        void this.loadAudioElement(this.track()!, pos);
        this.sync.reportPlayback({ isPlaying: true });
      } else if (mode === 'follower') {
        this.muteAndReleaseAudio();
      }
    });
  }

  // ── Public methods ───────────────────────────────────────────────────────────

  play(): void {
    if (this.isCasting()) {
      this.castService.play();
      return;
    }

    const context = this.audioAnalyser.audioContext();
    if (context?.state === 'suspended') {
      context.resume();
    }
    this.audioEl.play().catch((error) => console.error('Play failed:', error));
    this.speechPlayback.resume();
  }

  pause(): void {
    if (this.isCasting()) {
      this.castService.pause();
      return;
    }
    this.audioEl.pause();
    this.speechPlayback.pause();
  }

  togglePlayPause(): void {
    this.isPlaying() ? this.pause() : this.play();
  }

  stop(): void {
    if (this.isCasting()) {
      this.castService.disconnect();
    }
    this.stopInternal();
    this.audioPlayerCommand.clearQueue();
  }

  /** Stops current playback without touching the queue. Does NOT disconnect Cast —
   *  that only happens from the user-facing stop() method, so auto-join sessions
   *  survive the initial null emission from currentTrack$. */
  private stopInternal(): void {
    if (!this.audioElRef?.nativeElement) return;
    this.audioEl.pause();
    this.speechPlayback.stop();
    this.audioEl.currentTime = 0;
    this.isExpanded.set(false);
  }

  /**
   * Follower mirror: render the leader's track in the UI (album art tint,
   * media session) without producing audio or TTS. Display signals
   * (isPlaying/position/duration/volume) are driven by the sync effect in the
   * constructor from `sync.mirrored()`.
   */
  private mirrorTrack(track: ITrackItem): void {
    if (track.albumImage) {
      this.extractDominantColor(track.albumImage);
    } else {
      this.dominantColor.set(null);
    }
    this.audioEl?.pause();
    this.speechPlayback.stop();
    this.announcing.set(false);
  }

  /**
   * Called when this instance is displaced from leadership: stop emitting audio
   * but leave the current track in place so the UI continues mirroring the new
   * leader. Does NOT clear the queue — SyncService drives mirror state next.
   */
  private muteAndReleaseAudio(): void {
    if (!this.audioElRef?.nativeElement) return;
    this.audioEl.pause();
    this.speechPlayback.stop();
    this.releaseWakeLock();
  }

  seekTo(time: number): void {
    if (this.isCasting()) {
      this.castService.seekTo(time);
      return;
    }
    if (isFinite(this.audioEl.duration)) {
      this.audioEl.currentTime = Math.max(0, Math.min(time, this.audioEl.duration));
    }
  }

  setVolume(volume: number): void {
    if (this.isCasting()) {
      this.castService.setVolume(volume);
    } else {
      this.audioEl.volume = Math.max(0, Math.min(1, volume));
    }
    if (this.sync.mode() === 'leader' && !this.isMuted()) {
      this.sync.reportPlayback({ volume: this.audioEl.volume, muted: false });
    }
  }

  advanceTrack(offset: number): void {
    if (!this.audioPlayerCommand.advance(offset)) {
      this.stop();
    }
  }

  /** Seek relative to the current position. */
  seekRelative(seconds: number): void {
    const currentTime = this.isCasting() ? this.currentTime() : this.audioEl.currentTime;
    const newTime = currentTime + seconds;
    this.seekTo(newTime);
  }

  protected toggleMute(): void {
    if (this.isMuted()) {
      this.setVolume(this.volume());
      this.isMuted.set(false);
      this.sync.reportPlayback({ muted: false });
    } else {
      this.volume.set(this.audioEl.volume);
      this.setVolume(0);
      this.isMuted.set(true);
      this.sync.reportPlayback({ muted: true });
    }
  }

  closeTrackMenu(): void {
    this.showTrackMenu.set(false);
    this.isExpanded.set(false);
  }

  // ── Template-bound <audio> event handlers ────────────────────────────────────

  onSeekInput(event: Event): void {
    const percent = Number((event.target as HTMLInputElement).value);
    const dur = this.isCasting() ? this.duration() : this.audioEl.duration;
    this.seekTo((percent / 100) * dur);
  }

  onPlay(): void {
    if (!this.isCasting()) this.isPlaying.set(true);
    this.sync.reportPlayback({ isPlaying: true });
  }

  onPause(): void {
    if (!this.isCasting()) this.isPlaying.set(false);
    this.sync.reportPlayback({ isPlaying: false });
  }

  onEnded(): void {
    if (!this.isCasting()) this.advanceTrack(1);
  }

  onTimeUpdate(): void {
    if (!this.isCasting()) this.currentTime.set(this.audioEl.currentTime);
    // Report position to peers ~1/sec while leading (avoids SQS spam).
    if (this.sync.mode() === 'leader' && !this.isCasting()) {
      const t = this.audioEl.currentTime;
      if (Math.abs(t - this.lastReportedTime) >= 1) {
        this.lastReportedTime = t;
        this.sync.reportPlayback({ currentTime: t });
      }
    }
  }

  onLoadedMetadata(): void {
    if (!this.isCasting()) this.duration.set(this.audioEl.duration);
    this.sync.reportPlayback({ duration: this.audioEl.duration || 0 });
  }

  /** Fires when the audio element fails to load/play its current source. The most
   * common cause is requesting with crossOrigin set against a track whose host
   * doesn't actually support CORS — fall back to a non-CORS load so playback still
   * works, at the cost of the analyser not getting readable data. */
  onAudioError(): void {
    if (this.isCasting() || this.corsRetryAttempted || this.audioEl.crossOrigin === null) {
      return;
    }

    this.corsRetryAttempted = true;
    this.audioAnalyser.setAvailable(false);
    this.audioEl.crossOrigin = null;
    this.audioEl.load();
    this.play();
  }
}