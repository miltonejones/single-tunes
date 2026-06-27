import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import {
  AudioPlayerCommandService,
  CatalogQueryService,
  formatDuration,
  IGridItem,
  ImgFallbackDirective,
  IPodcast,
  ITrackItem,
  LoadingAnimation,
  MediaCard,
  PodcastCard,
  PodcastQueryService,
} from 'shared-utils';

type ResultTab = 'artists' | 'albums' | 'tracks' | 'podcasts';

@Component({
  selector: 'app-search-page',
  imports: [RouterOutlet, MediaCard, ImgFallbackDirective, LoadingAnimation, PodcastCard],
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

  query = signal('');
  loading = signal(false);
  error = signal('');
  artists = signal<IGridItem[]>([]);
  albums = signal<IGridItem[]>([]);
  tracks = signal<ITrackItem[]>([]);
  podcasts = signal<IPodcast[]>([]);
  activeTab = signal<ResultTab>('artists');

  hasResults = computed(
    () => this.artists().length > 0 || this.albums().length > 0 || this.tracks().length > 0 || this.podcasts().length > 0,
  );

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const query = params.get('query') ?? '';
      this.query.set(query);

      if (query) {
        this.runSearch(query);
      }
    });
  }

  playTrack(track: ITrackItem): void {
    this.audioPlayerCommand.openTrack(track, this.tracks());
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
        this.activeTab.set(
          artistRes.records.length > 0 ? 'artists' : albumRes.records.length > 0 ? 'albums' : 'tracks',
        );
      })
      .catch((err) => this.error.set(err?.message || 'Search failed'))
      .finally(() => this.loading.set(false));
  }
}
