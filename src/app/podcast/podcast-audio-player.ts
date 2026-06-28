import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  PodcastAudioPlayerCommandService,
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
  protected queuePanel = inject(EpisodeQueuePanelService);
  private subscription?: Subscription;

  private audio = new Audio();

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
    // Body class toggling is handled by the app component
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
  }

  private loadAndPlay(track: ITrack): void {
    // Set the audio source and load it
    this.audio.src = track.audioUrl;
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
