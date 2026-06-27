import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
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
  @ViewChild('audioEl') private audioElRef!: ElementRef<HTMLAudioElement>;

  private audioPlayerCommand = inject(PodcastAudioPlayerCommandService);
  private podcastSelection = inject(PodcastSelectionService);
  protected queuePanel = inject(EpisodeQueuePanelService);
  private subscription?: Subscription;

  track = signal<ITrack | null>(null);
  isPlaying = signal(false);
  isExpanded = signal(false);
  currentTime = signal(0);
  duration = signal(0);

  podcastArt = computed(() => this.podcastSelection.current()?.artworkUrl600 || '');
  progress = computed(() => (this.duration() ? (this.currentTime() / this.duration()) * 100 : 0));
  currentTimeLabel = computed(() => formatDuration(this.currentTime()));
  durationLabel = computed(() => formatDuration(this.duration()));

  constructor() {
    // Body class toggling is handled by the app component
  }

  ngOnInit(): void {
    this.subscription = this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.track.set(track);
      if (track) {
        this.loadAndPlay(track);
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private get audioEl(): HTMLAudioElement {
    return this.audioElRef.nativeElement;
  }

  private loadAndPlay(track: ITrack): void {
    this.audioEl.src = track.audioUrl;
    this.audioEl.load();
    this.play();

    const progress = this.audioPlayerCommand.getProgress(track.guid);
    if (progress > 0 && progress < RESUME_THRESHOLD) {
      const resume = () => {
        this.audioEl.currentTime = (progress / 100) * this.audioEl.duration;
        this.audioEl.removeEventListener('loadedmetadata', resume);
      };
      this.audioEl.addEventListener('loadedmetadata', resume);
    }
  }

  play(): void {
    this.audioEl.play().catch((error) => console.error('Play failed:', error));
  }

  pause(): void {
    this.audioEl.pause();
  }

  togglePlayPause(): void {
    this.isPlaying() ? this.pause() : this.play();
  }

  skip(seconds: number): void {
    this.audioEl.currentTime += seconds;
  }

  close(): void {
    this.audioEl.pause();
    this.audioEl.currentTime = 0;
    this.audioPlayerCommand.clearQueue();
    this.isExpanded.set(false);
  }

  onSeekInput(event: Event): void {
    const percent = Number((event.target as HTMLInputElement).value);
    if (isFinite(this.audioEl.duration)) {
      this.audioEl.currentTime = (percent / 100) * this.audioEl.duration;
    }
  }

  onPlay(): void {
    this.isPlaying.set(true);
  }

  onPause(): void {
    this.isPlaying.set(false);
  }

  onEnded(): void {
    this.isPlaying.set(false);
    if (!this.audioPlayerCommand.advance(1)) {
      this.audioPlayerCommand.clearQueue();
    }
  }

  onTimeUpdate(): void {
    const currentTime = this.audioEl.currentTime;
    this.currentTime.set(currentTime);

    const track = this.track();
    if (track && this.duration()) {
      const progress = (currentTime / this.duration()) * 100;
      this.audioPlayerCommand.setProgress(track.guid, progress, track.podcastFeedUrl);
    }
  }

  onLoadedMetadata(): void {
    this.duration.set(this.audioEl.duration);
  }
}
