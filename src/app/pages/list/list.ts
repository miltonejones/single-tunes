import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import {
  AudioPlayerCommandService,
  Breadcrumbs,
  BreadcrumbItem,
  CatalogCommandService,
  CatalogQueryService,
  formatDuration,
  IDetailResponse,
  ImgFallbackDirective,
  IPlaylistSummary,
  ITrackItem,
  LoadingAnimation,
  MediaCard,
} from 'shared-utils';

type MenuView = 'main' | 'playlists';

const PAGE_SIZE = 100;

type ListType = 'album' | 'artist' | 'genre' | 'playlist' | 'library';

const LIST_TYPE_LABELS: Record<Exclude<ListType, 'library'>, string> = {
  artist: 'Artists',
  album: 'Albums',
  genre: 'Genres',
  playlist: 'Playlists',
};

@Component({
  selector: 'app-list-page',
  imports: [RouterOutlet, RouterLink, ImgFallbackDirective, Breadcrumbs, LoadingAnimation],
  templateUrl: './list.html',
  styleUrl: './list.css',
})
export class ListPage implements OnInit {
  protected readonly title = signal('list');
  protected readonly formatDuration = formatDuration;

  private route = inject(ActivatedRoute);
  private catalogQuery = inject(CatalogQueryService);
  private catalogCommand = inject(CatalogCommandService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);

  listType = signal<ListType>('album');
  listId = signal('');
  pageNum = signal(1);
  detail = signal<IDetailResponse | null>(null);
  loading = signal(false);
  error = signal('');
  currentTrackId = signal<number | null>(null);
  bannerImage = signal<string | null>(null);
  bannerName = signal<string | null>(null);
  bannerLabel = computed(() => {
    switch (this.listType()) {
      case 'artist': return 'Artist';
      case 'album': return 'Album';
      case 'genre': return 'Genre';
      case 'playlist': return 'Playlist';
      default: return '';
    }
  });
  playlists = signal<IPlaylistSummary[]>([]);
  queueLength = signal(0);

  menuTrack = signal<ITrackItem | null>(null);
  menuView = signal<MenuView>('main');

  entity = computed(() => this.detail()?.row[0] ?? null);
  hasMultipleDiscs = computed(() => {
    if (this.listType() !== 'album') return false;
    const discs = new Set(this.tracks().map((t) => t.discNumber));
    discs.delete(null as any);
    discs.delete(undefined as any);
    return discs.size > 1;
  });
  tracks = computed(() => {
    const records = this.detail()?.related.records ?? [];
    if (this.listType() !== 'album') return records;
    const sorted = [...records].sort((a, b) => {
      const discA = a.discNumber ?? 0;
      const discB = b.discNumber ?? 0;
      if (discA !== discB) return discA - discB;
      const trackA = a.trackNumber ?? 0;
      const trackB = b.trackNumber ?? 0;
      if (trackA !== trackB) return trackA - trackB;
      return (a.ID ?? 0) - (b.ID ?? 0);
    });
    // Deduplicate by disc+track combination (keep first occurrence)
    const seen = new Set<string>();
    return sorted.filter((t) => {
      const key = `${t.discNumber ?? 0}|${t.trackNumber ?? 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  totalPages = computed(() =>
    Math.max(1, Math.ceil((this.detail()?.related.count ?? 0) / PAGE_SIZE)),
  );

  isPlayingThisList = computed(() => {
    const id = this.currentTrackId();
    return !!id && this.tracks().some((t) => t.ID === id);
  });

  prevLink = computed(() => this.buildPageLink(this.pageNum() - 1));
  nextLink = computed(() => this.buildPageLink(this.pageNum() + 1));

  playlistFileKeys = computed(() => {
    const fileKeys = new Set<string>();
    for (const playlist of this.playlists()) {
      for (const fileKey of playlist.related) {
        fileKeys.add(fileKey);
      }
    }
    return fileKeys;
  });

  canAddToQueue = computed(() => this.queueLength() > 0);

  currentLabel = computed(() => {
    if (this.listType() === 'playlist') {
      const playlist = this.playlists().find((p) => p.listKey === this.listId());
      if (playlist) {
        return playlist.Title;
      }
    }
    return this.entity()?.Name ?? this.entity()?.Genre ?? this.listId();
  });

  breadcrumbItems = computed<BreadcrumbItem[]>(() => {
    if (this.listType() === 'library') {
      return [{ label: 'Home', link: ['/'] }, { label: 'Library' }];
    }

    return [
      { label: 'Home', link: ['/'] },
      { label: LIST_TYPE_LABELS[this.listType() as Exclude<ListType, 'library'>], link: ['/grid', this.listType(), 1] },
      { label: this.currentLabel() },
    ];
  });

  ngOnInit(): void {
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.currentTrackId.set(track?.ID ?? null);
    });

    this.audioPlayerCommand.queue$.subscribe((queue) => {
      this.queueLength.set(queue.length);
    });

    this.catalogQuery.getPlaylists().then((playlists) => this.playlists.set(playlists));

    this.route.paramMap.subscribe((params) => {
      const pageNum = Number(params.get('pageNum')) || 1;
      const rawListType = params.get('listType');

      if (rawListType === null) {
        this.listType.set('library');
        this.listId.set('');
        this.pageNum.set(pageNum);
        this.loadLibrary(pageNum);
        return;
      }

      const listType = this.parseListType(rawListType);
      const listId = params.get('listId') ?? '';

      this.listType.set(listType);
      this.listId.set(listId);
      this.pageNum.set(pageNum);
      this.loadDetail(listType, listId, pageNum);
    });
  }

  private parseListType(value: string | null): ListType {
    return value === 'artist' || value === 'genre' || value === 'playlist' ? value : 'album';
  }

  playTrack(track: ITrackItem): void {
    this.audioPlayerCommand.openTrack(track, this.tracks());
  }

  togglePlayList(): void {
    if (this.isPlayingThisList()) {
      this.audioPlayerCommand.clearQueue();
    } else {
      const tracks = this.tracks();
      if (tracks.length > 0) {
        this.audioPlayerCommand.openTrack(tracks[0], tracks);
      }
    }
  }

  shuffleAndPlay(): void {
    const tracks = [...this.tracks()];
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    if (tracks.length > 0) {
      this.audioPlayerCommand.openTrack(tracks[0], tracks);
    }
  }

  isInPlaylist(track: ITrackItem): boolean {
    return this.playlistFileKeys().has(track.FileKey);
  }

  openMenu(track: ITrackItem, event: Event): void {
    event.stopPropagation();
    this.menuTrack.set(track);
    this.menuView.set('main');
  }

  closeMenu(): void {
    this.menuTrack.set(null);
  }

  addSelectedTrackToQueue(): void {
    const track = this.menuTrack();
    if (!track) {
      return;
    }
    this.audioPlayerCommand.addToQueue(track);
    this.closeMenu();
  }

  isTrackInPlaylist(playlist: IPlaylistSummary): boolean {
    const track = this.menuTrack();
    return !!track && playlist.related.includes(track.FileKey);
  }

  togglePlaylist(playlist: IPlaylistSummary): void {
    const track = this.menuTrack();
    if (!track) {
      return;
    }

    const alreadyIn = playlist.related.includes(track.FileKey);
    const updated: IPlaylistSummary = {
      ...playlist,
      related: alreadyIn
        ? playlist.related.filter((fileKey) => fileKey !== track.FileKey)
        : [...playlist.related, track.FileKey],
    };

    this.catalogCommand.savePlaylist(updated).then(() => {
      this.playlists.update((list) =>
        list.map((p) => (p.listKey === playlist.listKey ? updated : p)),
      );
    });
  }

  private buildPageLink(pageNum: number): unknown[] {
    return this.listType() === 'library'
      ? ['/list', pageNum]
      : ['/list', this.listType(), this.listId(), pageNum];
  }

  private loadLibrary(pageNum: number): void {
    this.loading.set(true);
    this.error.set('');
    this.bannerImage.set(null);
    this.bannerName.set(null);

    this.catalogQuery
      .getLibrary(pageNum)
      .then((res) => {
        this.detail.set(res);
        this.loadArtistBanner(res.related.records);
      })
      .catch((err) => this.error.set(err?.message || 'Failed to load list'))
      .finally(() => this.loading.set(false));
  }

  private loadDetail(listType: ListType, listId: string, pageNum: number): void {
    this.loading.set(true);
    this.error.set('');
    this.bannerImage.set(null);
    this.bannerName.set(null);

    let request: Promise<IDetailResponse>;
    switch (listType) {
      case 'artist':
        request = this.catalogQuery.getArtistDetail(Number(listId), pageNum);
        break;
      case 'genre':
        request = this.catalogQuery.getGenreDetail(listId, pageNum);
        break;
      case 'playlist':
        request = this.catalogQuery.getPlaylistDetail(listId, pageNum);
        break;
      default:
        request = this.catalogQuery.getAlbumDetail(Number(listId), pageNum);
    }

    request
      .then((res) => {
        this.detail.set(res);
        this.loadArtistBanner(res.related.records);
      })
      .catch((err) => this.error.set(err?.message || 'Failed to load list'))
      .finally(() => this.loading.set(false));
  }

  /** Finds the first track with an artistFk and fetches that artist's imageLg for the banner. */
  private loadArtistBanner(tracks: ITrackItem[]): void {
    const artistFk = tracks.find((track) => track.artistFk)?.artistFk;
    if (!artistFk) {
      return;
    }

    this.catalogQuery
      .getArtistDetail(artistFk)
      .then((res) => {
        const artist = res.row[0];
        this.bannerImage.set(artist?.imageLg ?? null);
        this.bannerName.set(artist?.Name ?? null);
      })
      .catch(() => {
        this.bannerImage.set(null);
        this.bannerName.set(null);
      });
  }
}
