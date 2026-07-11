import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  PodcastAudioPlayerCommandService,
  PodcastEpisodeDownloadService,
  PodcastSelectionService,
  formatDuration,
  ITrack,
} from 'shared-utils';
import { EpisodeQueuePanelService } from './episode-queue-panel.service';

const RESUME_THRESHOLD = 97;

@Component({
  selector: 'app-podcast-audio-player',
  imports: [],
  templateUrl: './podcast-audio-player.html',
  styleUrl: './podcast-audio-player.css',
  host: {
    id: 'podcast-player-container',
    '[class.expanded]': 'isExpanded()',
  },
})
export class PodcastAudioPlayer implements OnInit, OnDestroy {
  private audioPlayerCommand = inject(PodcastAudioPlayerCommandService);
  private podcastSelection = inject(PodcastSelectionService);
  private episodeDownload = inject(PodcastEpisodeDownloadService);
  protected queuePanel = inject(EpisodeQueuePanelService);
  private subscription?: Subscription;

  private audio = new Audio();
  private blobUrl: string | null = null;

  track = signal<ITrack | null>(null);
  isPlaying = signal(false);
  isExpanded = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  private audioReadyPromise: Promise<void> | null = null;

  podcastArt = computed(() => this.podcastSelection.current()?.artworkUrl600 || '');
  podcastName = computed(() => this.podcastSelection.current()?.collectionName || '');
  progress = computed(() => (this.duration() ? (this.currentTime() / this.duration()) * 100 : 0));
  currentTimeLabel = computed(() => formatDuration(this.currentTime()));
  durationLabel = computed(() => formatDuration(this.duration()));

  constructor() {
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
      navigator.mediaSession.setActionHandler('seekbackward', () => this.skip(-30));
      navigator.mediaSession.setActionHandler('seekforward', () => this.skip(30));
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) this.seekTo(details.seekTime);
      });
    }
  }

  ngOnInit(): void {
    this.audio.addEventListener('play', () => this.isPlaying.set(true));
    this.audio.addEventListener('pause', () => this.isPlaying.set(false));
    this.audio.addEventListener('ended', () => {
      this.isPlaying.set(false);
      if (!this.audioPlayerCommand.advance(1)) {
        this.audioPlayerCommand.clearQueue();
      }
    });
    this.audio.addEventListener('timeupdate', () => {
      const currentTime = this.audio.currentTime;
      this.currentTime.set(currentTime);

      const track = this.track();
      if (track && this.duration()) {
        const progress = (currentTime / this.duration()) * 100;
        this.audioPlayerCommand.setProgress(track.guid, progress, track.podcastFeedUrl);
      }
    });
    this.audio.addEventListener('loadedmetadata', () => {
      this.duration.set(this.audio.duration);
    });

    this.subscription = this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.track.set(track);
      if (track) {
        this.loadAndPlay(track);
        this.updateMediaSession(track);
      } else {
        this.clearMediaSession();
      }
    });

    // Listen for seek relative requests
    this.audioPlayerCommand.seekRelative$.subscribe((seconds) => {
      this.skip(seconds);
    });

    // Listen for toggle play/pause requests
    this.audioPlayerCommand.togglePlayPause$.subscribe(() => {
      this.togglePlayPause();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.audio.pause();
    this.audio.src = '';
    this.releaseBlobUrl();
  }

  // ── Media Session (lock screen / control center integration) ──────────────

  private updateMediaSession(track: ITrack): void {
    if (!('mediaSession' in navigator)) return;
    const artwork = this.podcastArt();
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: this.podcastName(),
      album: this.podcastName(),
      artwork: artwork ? [{ src: artwork, sizes: '600x600', type: 'image/jpeg' }] : undefined,
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
    if (!dur || !isFinite(dur)) return;
    navigator.mediaSession.setPositionState({
      duration: dur,
      playbackRate: 1,
      position: Math.min(this.currentTime(), dur),
    });
  }

  private releaseBlobUrl(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  private async loadAndPlay(track: ITrack): Promise<void> {
    // Prefer a locally downloaded copy so episodes play offline
    const { src, isBlob } = await this.episodeDownload.getAudioSrc(track);

    // A newer track may have been requested while the blob was being read
    if (this.track()?.guid !== track.guid) {
      if (isBlob) URL.revokeObjectURL(src);
      return;
    }

    this.releaseBlobUrl();
    if (isBlob) {
      this.blobUrl = src;
    }

    this.audio.src = src;
    this.audio.load();

    // Set up a promise that resolves when the audio is ready to play
    this.audioReadyPromise = new Promise<void>((resolve) => {
      this.audio.addEventListener(
        'canplay',
        () => resolve(),
        { once: true },
      );
    });

    // Handle progress restoration
    const progress = this.audioPlayerCommand.getProgress(track.guid);
    if (progress > 0 && progress < RESUME_THRESHOLD) {
      const resume = () => {
        if (isFinite(this.audio.duration)) {
          this.audio.currentTime = (progress / 100) * this.audio.duration;
        }
        this.audio.removeEventListener('loadedmetadata', resume);
      };

      this.audio.addEventListener('loadedmetadata', resume, { once: true });
    }

    // Actually start playback once the audio is ready
    this.play().catch((err) => console.warn('Auto-play failed:', err));
  }

  async play(): Promise<void> {
    // Wait for the audio to be ready if it's still loading
    if (this.audioReadyPromise) {
      try {
        await this.audioReadyPromise;
      } catch (error) {
        console.warn('Audio ready promise failed:', error);
      } finally {
        this.audioReadyPromise = null;
      }
    }

    return this.audio.play().catch((error) => {
      console.error('Play failed:', error);
      throw error;
    });
  }

  pause(): void {
    this.audio.pause();
  }

  togglePlayPause(): void {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play().catch((error) => {
        console.warn('Play failed:', error);
      });
    }
  }

  skip(seconds: number): void {
    this.audio.currentTime += seconds;
  }

  /** Seek relative to the current position. */
  seekRelative(seconds: number): void {
    this.skip(seconds);
  }

  seekTo(time: number): void {
    if (isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration));
    }
  }

  advanceTrack(offset: number): void {
    if (!this.audioPlayerCommand.advance(offset)) {
      this.close();
    }
  }

  close(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audioPlayerCommand.clearQueue();
    this.isExpanded.set(false);
  }

  onSeekInput(event: Event): void {
    const percent = Number((event.target as HTMLInputElement).value);
    if (isFinite(this.audio.duration)) {
      this.audio.currentTime = (percent / 100) * this.audio.duration;
    }
  }
}
