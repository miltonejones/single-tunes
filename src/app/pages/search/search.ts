import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import {
  AudioPlayerCommandService,
  Breadcrumbs,
  BreadcrumbItem,
  CatalogQueryService,
  formatDuration,
  IGridItem,
  ImgFallbackDirective,
  IPodcast,
  ITrackItem,
  LoadingAnimation,
  MediaCard,
  PlayHistoryService,
  PodcastCard,
  PodcastQueryService,
  TrackMenu,
} from 'shared-utils';

type ResultTab = 'artists' | 'albums' | 'tracks' | 'podcasts';

@Component({
  selector: 'app-search-page',
  imports: [RouterOutlet, RouterLink, Breadcrumbs, MediaCard, ImgFallbackDirective, LoadingAnimation, PodcastCard, TrackMenu],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class SearchPage implements OnInit {
  protected readonly title = signal('search');
  protected readonly formatDuration = formatDuration;

  private route = inject(ActivatedRoute);
  private catalogQuery = inject(CatalogQueryService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private podcastQuery = inject(PodcastQueryService);
  private playHistory = inject(PlayHistoryService);

  query = signal('');
  loading = signal(false);
  error = signal('');
  artists = signal<IGridItem[]>([]);
  albums = signal<IGridItem[]>([]);
  tracks = signal<ITrackItem[]>([]);
  podcasts = signal<IPodcast[]>([]);
  activeTab = signal<ResultTab>('artists');
  menuTrack = signal<ITrackItem | null>(null);
  currentTrackId = signal<number | null>(null);
  viewMode = signal<'tabs' | 'list'>(
    (localStorage.getItem('sky-tunes-search-view') as 'tabs' | 'list') ?? 'tabs',
  );

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'] },
    { label: `Search: "${this.query()}"` },
  ]);

  hasResults = computed(
    () => this.artists().length > 0 || this.albums().length > 0 || this.tracks().length > 0 || this.podcasts().length > 0,
  );

  tabsWithResults = computed<ResultTab[]>(() => {
    const tabs: ResultTab[] = [];
    if (this.artists().length > 0) tabs.push('artists');
    if (this.albums().length > 0) tabs.push('albums');
    if (this.tracks().length > 0) tabs.push('tracks');
    if (this.podcasts().length > 0) tabs.push('podcasts');
    return tabs;
  });

  constructor() {
    effect(() => localStorage.setItem('sky-tunes-search-view', this.viewMode()));
  }

  ngOnInit(): void {
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.currentTrackId.set(track?.ID ?? null);
    });

    this.route.paramMap.subscribe((params) => {
      const query = params.get('query') ?? '';
      this.query.set(query);

      if (query) {
        this.runSearch(query);
      }
    });
  }

  playTrack(track: ITrackItem): void {
    this.playHistory.recordPlay('search', `Search: "${this.query()}"`, ['/search', this.query()], track);
    this.audioPlayerCommand.openTrack(track, this.tracks());
  }

  openMenu(track: ITrackItem, event: Event): void {
    event.stopPropagation();
    this.menuTrack.set(track);
  }

  closeMenu(): void {
    this.menuTrack.set(null);
  }

  private runSearch(query: string): void {
    this.loading.set(true);
    this.error.set('');

    Promise.all([
      this.catalogQuery.getSearch('artist', query),
      this.catalogQuery.getSearch('album', query),
      this.catalogQuery.getSearch('music', query),
      this.podcastQuery.search(query).catch(() => ({ resultCount: 0, results: [] })),
    ])
      .then(([artistRes, albumRes, musicRes, podcastRes]) => {
        this.artists.set(artistRes.records);
        this.albums.set(albumRes.records);
        this.tracks.set(musicRes.records);
        this.podcasts.set(podcastRes.results || []);

        // Set the active tab to the first tab with results, or default to 'artists'
        const tabsWithResults = [
          artistRes.records.length > 0 ? 'artists' : null,
          albumRes.records.length > 0 ? 'albums' : null,
          musicRes.records.length > 0 ? 'tracks' : null,
          (podcastRes.results?.length || 0) > 0 ? 'podcasts' : null
        ].filter(Boolean) as ResultTab[];

        this.activeTab.set(tabsWithResults.length > 0 ? tabsWithResults[0] : 'artists');
      })
      .catch((err) => this.error.set(err?.message || 'Search failed'))
      .finally(() => this.loading.set(false));
  }
}
