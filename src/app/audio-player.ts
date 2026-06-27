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
import {
  AnnouncementCommandService,
  AudioPlayerCommandService,
  buildPlayerUrl,
  CastService,
  formatDuration,
  ImgFallbackDirective,
  ITrackItem,
  PlayHistoryService,
  shouldAnnounceForFrequency,
  SpeechPlaybackService,
} from 'shared-utils';
import { AnnouncerSettingsService } from './announcer-settings.service';
import { AudioAnalyserService } from './audio-analyser.service';
import { AudioVisualizerPanelService } from './audio-visualizer-panel.service';
import { CastButton } from './cast-button';
import { TrackQueuePanelService } from './track-queue-panel.service';

const ANNOUNCING_VOLUME = 0.3;

@Component({
  selector: 'app-audio-player',
  imports: [CastButton, ImgFallbackDirective],
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.css',
})
export class AudioPlayer implements OnInit, OnDestroy {
  @ViewChild('audioEl') private audioElRef!: ElementRef<HTMLAudioElement>;

  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private announcementCommand = inject(AnnouncementCommandService);
  private announcerSettings = inject(AnnouncerSettingsService);
  private speechPlayback = inject(SpeechPlaybackService);
  private audioAnalyser = inject(AudioAnalyserService);
  private castService = inject(CastService);
  private playHistory = inject(PlayHistoryService);
  protected queuePanel = inject(TrackQueuePanelService);
  protected visualizerPanel = inject(AudioVisualizerPanelService);
  private subscriptions: Subscription[] = [];

  track = signal<ITrackItem | null>(null);
  isPlaying = signal(false);
  announcing = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  isExpanded = signal(false);
  protected isCasting = signal(false);

  private playRequestId = 0;

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
        if (track) {
          this.loadAndPlay(track);
          this.updateMediaSession(track);
        } else {
          this.stopInternal();
          this.clearMediaSession();
        }
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
  }

  ngOnDestroy(): void {
    for (const s of this.subscriptions) s.unsubscribe();
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

  private async loadAndPlay(track: ITrackItem): Promise<void> {
    const requestId = ++this.playRequestId;

    if (this.isCasting()) {
      // Suppress the auto-advance guard: the Cast device may briefly go IDLE
      // while transitioning to the new track, and we don't want that to
      // trigger skip-to-next.
      this.castTransitioning = true;
      this.castService.loadTrack(track);

      // Announcement — TTS plays locally while volume ducks on Cast.
      const settings = this.announcerSettings.settings();
      if (shouldAnnounceForFrequency(settings.frequency)) {
        this.announcing.set(true);
        await this.announcementCommand.announceTrackChange(
          track.artistName, track.Title, track.trackTime,
          settings.name, settings.zip, settings.chatType, settings.voiceURI,
          () => {
            this.originalVolume = this.castService.getVolume();
            this.setVolume(ANNOUNCING_VOLUME);
          },
          () => this.setVolume(this.originalVolume),
          () => this.setVolume(this.originalVolume),
        );
      }

      this.announcing.set(false);
      return;
    }

    // Local playback
    this.corsRetryAttempted = false;
    this.audioAnalyser.setAvailable(true);
    this.audioAnalyser.initialize(this.audioEl);
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.src = buildPlayerUrl(track.FileKey);

    const settings = this.announcerSettings.settings();
    if (shouldAnnounceForFrequency(settings.frequency)) {
      this.announcing.set(true);
      await this.announcementCommand.announceTrackChange(
        track.artistName, track.Title, track.trackTime,
        settings.name, settings.zip, settings.chatType, settings.voiceURI,
        () => {
          this.originalVolume = this.audioEl.volume;
          this.setVolume(ANNOUNCING_VOLUME);
        },
        () => this.setVolume(this.originalVolume),
        () => this.setVolume(this.originalVolume),
      );
    }

    if (requestId !== this.playRequestId) return;

    this.announcing.set(false);
    this.play();
  }

  /** Load a track on the native <audio> element, optionally seeking to a position. */
  private loadAudioElement(track: ITrackItem, seekToPosition = 0): void {
    this.corsRetryAttempted = false;
    this.audioAnalyser.setAvailable(true);
    this.audioAnalyser.initialize(this.audioEl);
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.src = buildPlayerUrl(track.FileKey);

    if (seekToPosition > 0) {
      const onLoaded = () => {
        this.audioEl.currentTime = Math.min(seekToPosition, this.audioEl.duration || seekToPosition);
        this.audioEl.removeEventListener('loadedmetadata', onLoaded);
      };
      this.audioEl.addEventListener('loadedmetadata', onLoaded);
    }

    this.play();
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
  }

  advanceTrack(offset: number): void {
    if (!this.audioPlayerCommand.advance(offset)) {
      this.stop();
    }
  }

  // ── Template-bound <audio> event handlers ────────────────────────────────────

  onSeekInput(event: Event): void {
    const percent = Number((event.target as HTMLInputElement).value);
    const dur = this.isCasting() ? this.duration() : this.audioEl.duration;
    this.seekTo((percent / 100) * dur);
  }

  onPlay(): void {
    if (!this.isCasting()) this.isPlaying.set(true);
  }

  onPause(): void {
    if (!this.isCasting()) this.isPlaying.set(false);
  }

  onEnded(): void {
    if (!this.isCasting()) this.advanceTrack(1);
  }

  onTimeUpdate(): void {
    if (!this.isCasting()) this.currentTime.set(this.audioEl.currentTime);
  }

  onLoadedMetadata(): void {
    if (!this.isCasting()) this.duration.set(this.audioEl.duration);
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
