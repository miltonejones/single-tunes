import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import {
  CatalogQueryService,
  CoverflowDirective,
  DashItem,
  ImgFallbackDirective,
  IPlaylistSummary,
  LoadingAnimation,
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
  imports: [RouterOutlet, RouterLink, MediaCard, ImgFallbackDirective, LoadingAnimation, PodcastCard, CoverflowDirective],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomePage implements OnInit, OnDestroy {
  protected readonly title = signal('home');

  private catalogQuery = inject(CatalogQueryService);
  protected subscriptionsService = inject(PodcastSubscriptionsService);
  protected playHistory = inject(PlayHistoryService);
  private carouselTimer?: ReturnType<typeof setInterval>;

  dashItems = signal<DashItem[]>([]);
  featuredPlaylists = signal<IPlaylistSummary[]>([]);
  loading = signal(false);
  error = signal('');
  carouselIndex = signal(0);

  topArtists = computed(() => this.topByTrackCount('artist'));
  topAlbums = computed(() => this.topByTrackCount('album'));

  carouselItems = computed(() =>
    pickRandom(
      this.dashItems().filter((item) => item.Type === 'artist' && item.imageLg && item.imageLg !== 'no image'),
      20,
    ),
  );

  ngOnInit(): void {
    this.loading.set(true);
    this.error.set('');

    this.catalogQuery
      .getDashboard()
      .then((items) => {
        this.dashItems.set(items);
        this.startCarousel();
      })
      .catch((err) => this.error.set(err?.message || 'Failed to load dashboard'))
      .finally(() => this.loading.set(false));

    this.catalogQuery
      .getPlaylists()
      .then((playlists) => this.featuredPlaylists.set(pickRandom(playlists, FEATURED_PLAYLIST_COUNT)));
  }

  ngOnDestroy(): void {
    clearInterval(this.carouselTimer);
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
