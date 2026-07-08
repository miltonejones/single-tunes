import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { SearchResolvedData } from './search.resolver';
import {
  AiSearchQueryService,
  AiSearchStatus,
  AudioPlayerCommandService,
  Breadcrumbs,
  BreadcrumbItem,
  formatDuration,
  IGridItem,
  ImgFallbackDirective,
  IPodcast,
  ITrackItem,
  MediaCard,
  OfflineService,
  PlayHistoryService,
  PodcastCard,
  PodcastSelectionService,
  TrackDownloadService,
  TrackMenu,
} from 'shared-utils';

type ResultTab = 'artists' | 'albums' | 'tracks' | 'podcasts' | 'ai';

@Component({
  selector: 'app-search-page',
  imports: [RouterOutlet, RouterLink, Breadcrumbs, MediaCard, ImgFallbackDirective, PodcastCard, TrackMenu],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class SearchPage implements OnInit {
  protected readonly title = signal('search');
  protected readonly formatDuration = formatDuration;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private playHistory = inject(PlayHistoryService);
  protected offline = inject(OfflineService);
  private podcastSelection = inject(PodcastSelectionService);
  private trackDownload = inject(TrackDownloadService);
  private aiSearchQuery = inject(AiSearchQueryService);

  query = signal('');
  artists = signal<IGridItem[]>([]);
  albums = signal<IGridItem[]>([]);
  tracks = signal<ITrackItem[]>([]);
  podcasts = signal<IPodcast[]>([]);
  aiTracks = signal<ITrackItem[]>([]);
  aiAlbums = signal<IGridItem[]>([]);
  aiArtists = signal<IGridItem[]>([]);
  aiSearchStatus = signal<AiSearchStatus>('idle');
  activeTab = signal<ResultTab>('artists');
  menuTrack = signal<ITrackItem | null>(null);
  currentTrackId = signal<number | null>(null);
  isPlaying = signal(false);
  searchMode = signal<'keyword' | 'ai'>('keyword');

  viewMode = signal<'tabs' | 'list'>(
    (localStorage.getItem('sky-tunes-search-view') as 'tabs' | 'list') ?? 'tabs',
  );

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'] },
    { label: `Search: "${this.query()}"` },
  ]);

  hasResults = computed(() => {
    if (this.searchMode() === 'ai') {
      // Only check AI results for AI search mode
      return this.aiArtists().length > 0 ||
             this.aiAlbums().length > 0 ||
             this.aiTracks().length > 0;
    } else {
      // Check keyword results for keyword search mode
      return this.artists().length > 0 ||
             this.albums().length > 0 ||
             this.tracks().length > 0 ||
             this.podcasts().length > 0 ||
             this.aiSearchStatus() === 'success';
    }
  });

  tabsWithResults = computed<ResultTab[]>(() => {
    if (this.searchMode() === 'ai') {
      // Only show tabs with AI results
      const tabs: ResultTab[] = [];
      if (this.aiArtists().length > 0) tabs.push('artists');
      if (this.aiAlbums().length > 0) tabs.push('albums');
      if (this.aiTracks().length > 0) tabs.push('tracks');
      return tabs;
    } else {
      // Show tabs with keyword results (existing logic)
      const tabs: ResultTab[] = [];
      if (this.artists().length > 0) tabs.push('artists');
      if (this.albums().length > 0) tabs.push('albums');
      if (this.tracks().length > 0) tabs.push('tracks');
      if (this.podcasts().length > 0) tabs.push('podcasts');
      if (this.offline.isOnline() && this.aiSearchStatus() !== 'idle') tabs.push('ai');
      return tabs;
    }
  });

  constructor() {
    effect(() => localStorage.setItem('sky-tunes-search-view', this.viewMode()));
  }

  ngOnInit(): void {
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.currentTrackId.set(track?.ID ?? null);
    });
    this.audioPlayerCommand.isPlaying$.subscribe((playing) => {
      this.isPlaying.set(playing);
    });

    // paramMap fires on every navigation to this route (including re-searches)
    this.route.paramMap.subscribe((params) => {
      const query = params.get('query') ?? '';
      this.query.set(query);
      if (!this.offline.isOnline()) {
        this.searchOffline(query);
      }
    });

    // Handle query parameters for search mode
    this.route.queryParamMap.subscribe((params) => {
      const mode = params.get('mode');
      this.searchMode.set(mode === 'ai' ? 'ai' : 'keyword');

      if (mode === 'ai') {
        // Clear keyword results for AI-only search
        this.artists.set([]);
        this.albums.set([]);
        this.tracks.set([]);
        this.podcasts.set([]);
        // Load AI results only
        this.loadAiResults(this.query());
      }
    });

    // data fires with fresh resolver output on every navigation
    this.route.data.subscribe((data) => {
      if (!this.offline.isOnline() || this.searchMode() === 'ai') return;
      const resolved = data['search'] as SearchResolvedData;
      this.artists.set(resolved.artists.records);
      this.albums.set(resolved.albums.records);
      this.tracks.set(resolved.tracks.records);
      this.podcasts.set(resolved.podcasts);
      const firstTab = this.tabsWithResults()[0];
      if (firstTab) this.activeTab.set(firstTab);
      this.loadAiResults(this.query());
    });
  }

  private async loadAiResults(query: string): Promise<void> {
    if (!this.offline.isOnline() || !query.trim()) return;
    this.aiSearchStatus.set('loading');
    this.aiTracks.set([]);
    this.aiAlbums.set([]);
    this.aiArtists.set([]);
    try {
      const result = await this.aiSearchQuery.search(query);
      this.aiTracks.set(result.tracks);
      this.aiAlbums.set(result.albums);
      this.aiArtists.set(result.artists);
      this.aiSearchStatus.set('success');
    } catch {
      this.aiSearchStatus.set('error');
    }
  }

  private async searchOffline(query: string): Promise<void> {
    const q = query.toLowerCase();
    const all = await this.trackDownload.getAllDownloadedTracks();
    const tracks = all.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artistName ?? '').toLowerCase().includes(q) ||
        (t.albumName ?? '').toLowerCase().includes(q),
    );
    this.tracks.set(
      tracks.map((t) => ({
        ID: t.trackId,
        Title: t.title,
        FileKey: t.FileKey,
        albumImage: t.albumImage ?? null,
        trackId: t.trackId,
        Genre: '',
        genreKey: null,
        albumFk: t.albumFk ?? null,
        artistFk: t.artistFk ?? null,
        discNumber: t.discNumber ?? null,
        trackTime: t.trackTime ?? 0,
        trackNumber: t.trackNumber ?? null,
        explicit: false,
        artistName: t.artistName ?? '',
        albumName: t.albumName ?? '',
      })),
    );
    const firstTab = this.tabsWithResults()[0];
    if (firstTab) this.activeTab.set(firstTab);
  }

  playTrack(track: ITrackItem): void {
    let queue: ITrackItem[] = [];
    if (this.searchMode() === 'ai') {
      queue = this.aiTracks();
    } else {
      queue = this.activeTab() === 'ai' ? this.aiTracks() : this.tracks();
    }
    this.playHistory.recordPlay('search', `Search: "${this.query()}"`, ['/search', this.query()], track);
    this.audioPlayerCommand.openTrack(track, queue);
  }

  openMenu(track: ITrackItem, event: Event): void {
    event.stopPropagation();
    this.menuTrack.set(track);
  }

  closeMenu(): void {
    this.menuTrack.set(null);
  }

  protected openPodcast(podcast: IPodcast): void {
    this.podcastSelection.select(podcast);
    this.router.navigate(['/podcasts/detail', encodeURIComponent(podcast.feedUrl || '')]);
  }

}
