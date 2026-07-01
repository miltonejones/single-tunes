import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { HomeResolvedData } from './home.resolver';
import {
  AiSearchQueryService,
  AiSearchStatus,
  AudioPlayerCommandService,
  CoverflowDirective,
  DashItem,
  formatDuration,
  IGridItem,
  ImgFallbackDirective,
  IPlaylistSummary,
  ITrackItem,
  MediaCard,
  PlayHistoryService,
  PodcastCard,
  PodcastSubscriptionsService,
} from 'shared-utils';

const TRACK_COUNT_PATTERN = /(\d+)\s*tracks?/i;
const CAROUSEL_INTERVAL_MS = 5000;
const FEATURED_PLAYLIST_COUNT = 8;

function trackCountOf(item: DashItem): number {
  const match = item.Caption?.match(TRACK_COUNT_PATTERN);
  return match ? Number(match[1]) : 0;
}

function pickRandom<T>(items: T[], count: number): T[] {
  return items
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

@Component({
  selector: 'app-home-page',
  imports: [RouterOutlet, RouterLink, MediaCard, ImgFallbackDirective, PodcastCard, CoverflowDirective],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomePage implements OnInit, OnDestroy {
  protected readonly title = signal('home');
  protected readonly formatDuration = formatDuration;

  private route = inject(ActivatedRoute);
  protected subscriptionsService = inject(PodcastSubscriptionsService);
  protected playHistory = inject(PlayHistoryService);
  private aiSearch = inject(AiSearchQueryService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private carouselTimer?: ReturnType<typeof setInterval>;
  private touchStartX = 0;
  private touchStartY = 0;

  dashItems = signal<DashItem[]>([]);
  featuredPlaylists = signal<IPlaylistSummary[]>([]);
  carouselIndex = signal(0);

  aiStatus = signal<AiSearchStatus>('idle');
  aiTracks = signal<ITrackItem[]>([]);
  aiAlbums = signal<IGridItem[]>([]);
  aiArtists = signal<IGridItem[]>([]);
  currentTrackId = signal<number | null>(null);

  topArtists = computed(() => this.topByTrackCount('artist'));
  topAlbums = computed(() => this.topByTrackCount('album'));

  carouselItems = computed(() =>
    pickRandom(
      this.dashItems().filter((item) => item.Type === 'artist' && item.imageLg && item.imageLg !== 'no image'),
      20,
    ),
  );

  ngOnInit(): void {
    const data = this.route.snapshot.data['home'] as HomeResolvedData;
    this.dashItems.set(data.dashItems);
    this.featuredPlaylists.set(pickRandom(data.playlists, FEATURED_PLAYLIST_COUNT));
    this.startCarousel();
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.currentTrackId.set(track?.ID ?? null);
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.carouselTimer);
  }

  async runAiSearch(query: string): Promise<void> {
    if (!query.trim()) return;
    this.aiStatus.set('loading');
    this.aiTracks.set([]);
    this.aiAlbums.set([]);
    this.aiArtists.set([]);
    try {
      const result = await this.aiSearch.search(query);
      this.aiTracks.set(result.tracks);
      this.aiAlbums.set(result.albums);
      this.aiArtists.set(result.artists);
      this.aiStatus.set('success');
    } catch {
      this.aiStatus.set('error');
    }
  }

  playAiTrack(track: ITrackItem): void {
    this.playHistory.recordPlay('home-ai', 'AI Search', ['/'], track);
    this.audioPlayerCommand.openTrack(track, this.aiTracks());
  }

  nextSlide(): void {
    const total = this.carouselItems().length;
    if (total > 0) {
      this.carouselIndex.set((this.carouselIndex() + 1) % total);
    }
  }

  prevSlide(): void {
    const total = this.carouselItems().length;
    if (total > 0) {
      this.carouselIndex.set((this.carouselIndex() - 1 + total) % total);
    }
  }

  goToSlide(index: number): void {
    this.carouselIndex.set(index);
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  protected onTouchEnd(event: TouchEvent): void {
    const deltaX = event.changedTouches[0].clientX - this.touchStartX;
    const deltaY = event.changedTouches[0].clientY - this.touchStartY;
    // Only trigger swipe if horizontal movement exceeds vertical (avoids conflict with page scroll)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        this.prevSlide();
      } else {
        this.nextSlide();
      }
    }
  }

  private startCarousel(): void {
    this.carouselTimer = setInterval(() => this.nextSlide(), CAROUSEL_INTERVAL_MS);
  }

  private topByTrackCount(type: string): DashItem[] {
    return this.dashItems()
      .filter((item) => item.Type === type)
      .slice()
      .sort((a, b) => trackCountOf(b) - trackCountOf(a))
      .slice(0, 12);
  }
}
