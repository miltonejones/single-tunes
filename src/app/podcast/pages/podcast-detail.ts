import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  Breadcrumbs,
  BreadcrumbItem,
  LoadingAnimation,
  PodcastAudioPlayerCommandService,
  PodcastEpisodeDownloadService,
  PodcastQueryService,
  PodcastSelectionService,
  PodcastSubscriptionsService,
  PodcastToastService,
  formatDuration,
  IPodcast,
  ITrack,
  ParsedEpisode,
  sortTrackList,
  toTrack,
  usePagination,
} from 'shared-utils';

type SortField = 'title' | 'pubDate';

const PAGE_SIZE = 10;
const SORT_STORAGE_KEY = 'podcast-detail-sort';

interface StoredSort {
  field: SortField;
  ascOffset: 1 | -1;
}

function loadSortPreference(): StoredSort {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return { field: 'title', ascOffset: 1 };
    const parsed = JSON.parse(raw);
    return {
      field: parsed.field === 'pubDate' ? 'pubDate' : 'title',
      ascOffset: parsed.ascOffset === -1 ? -1 : 1,
    };
  } catch {
    return { field: 'title', ascOffset: 1 };
  }
}

@Component({
  selector: 'app-podcast-detail',
  imports: [DatePipe, LoadingAnimation, Breadcrumbs],
  templateUrl: './podcast-detail.html',
  styleUrl: './podcast-detail.css',
})
export class PodcastDetailPage {
  private route = inject(ActivatedRoute);
  protected podcastQuery = inject(PodcastQueryService);
  protected podcastSelection = inject(PodcastSelectionService);
  protected subscriptionsService = inject(PodcastSubscriptionsService);
  protected audioPlayerCommand = inject(PodcastAudioPlayerCommandService);
  protected episodeDownload = inject(PodcastEpisodeDownloadService);
  private toast = inject(PodcastToastService);

  episodes = signal<ParsedEpisode[]>([]);
  description = signal('');
  loading = signal(false);
  error = signal('');

  private readonly storedSort = loadSortPreference();
  sortField = signal<SortField>(this.storedSort.field);
  ascOffset = signal<1 | -1>(this.storedSort.ascOffset);
  page = signal(1);
  expandedNodes = signal<Record<string, boolean>>({});

  currentGuid = signal<string | null>(null);

  podcast = computed<IPodcast | null>(() => this.podcastSelection.current());
  subscribed = computed(() => this.subscriptionsService.isSubscribed(this.podcast()));

  sortedEpisodes = computed(() => sortTrackList(this.episodes(), this.sortField(), this.ascOffset()));
  pages = computed(() => usePagination(this.sortedEpisodes(), { page: this.page(), pageSize: PAGE_SIZE }));

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'], icon: 'fa-house' },
    { label: 'Podcasts', link: ['/podcasts'], icon: 'fa-podcast' },
    { label: this.podcast()?.collectionName ?? 'Podcast', icon: 'fa-podcast' },
  ]);

  protected readonly formatDuration = formatDuration;

  constructor() {
    this.audioPlayerCommand.currentTrack$.subscribe((track) => this.currentGuid.set(track?.guid ?? null));

    this.route.paramMap.subscribe((params) => {
      const feedUrl = decodeURIComponent(params.get('feedUrl') || '');
      this.loadFeed(feedUrl);
    });
  }

  private loadFeed(feedUrl: string): void {
    if (!feedUrl) return;

    this.loading.set(true);
    this.error.set('');
    this.page.set(1);

    this.podcastQuery
      .getFeed(feedUrl)
      .then(({ episodes, description }) => {
        this.episodes.set(episodes);
        this.description.set(description);
      })
      .catch((err) => this.error.set(err?.message || 'Failed to load episodes'))
      .finally(() => this.loading.set(false));
  }

  toggleSubscribe(): void {
    const podcast = this.podcast();
    if (!podcast) return;

    const result = this.subscriptionsService.toggle(podcast);
    this.toast.alert(`${result === 'subscribed' ? 'Subscribed to' : 'Unsubscribed from'} "${podcast.collectionName}"`);
  }

  setSort(field: SortField): void {
    this.sortField.set(field);
    this.ascOffset.set((this.ascOffset() * -1) as 1 | -1);
    localStorage.setItem(
      SORT_STORAGE_KEY,
      JSON.stringify({ field: this.sortField(), ascOffset: this.ascOffset() }),
    );
  }

  toggleExpand(guid: string): void {
    this.expandedNodes.update((nodes) => ({ ...nodes, [guid]: !nodes[guid] }));
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  playEpisode(episode: ParsedEpisode): void {
    const podcast = this.podcast();
    if (!podcast) return;

    const track = toTrack(episode, podcast);
    if (!track) return;

    const queue = this.sortedEpisodes()
      .map((ep) => toTrack(ep, podcast))
      .filter((t): t is ITrack => t !== null);

    this.audioPlayerCommand.openTrack(track, queue);
  }

  downloadEpisode(episode: ParsedEpisode): void {
    const podcast = this.podcast();
    if (!podcast) return;
    this.episodeDownload.download(episode, podcast);
  }

  removeDownload(episode: ParsedEpisode): void {
    this.episodeDownload.remove(episode.guid, episode.title);
  }

  isFinished(guid: string): boolean {
    return this.audioPlayerCommand.isFinished(guid);
  }

  getProgress(guid: string): number {
    return this.audioPlayerCommand.getProgress(guid);
  }
}
