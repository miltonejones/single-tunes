import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ListResolvedData } from './list.resolver';
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
  ItunesItem,
  MediaCard,
  OfflineService,
  PlayHistoryService,
  RecorderPanelService,
  RecorderService,
  SkeletonLoader,
  ToastService,
  TrackDownloadService,
  TrackMenu,
  TrackQueryService,
} from 'shared-utils';

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
  imports: [RouterOutlet, RouterLink, ImgFallbackDirective, Breadcrumbs, SkeletonLoader, TrackMenu],
  templateUrl: './list.html',
  styleUrl: './list.css',
})
export class ListPage implements OnInit, OnDestroy {
  protected readonly title = signal('list');
  protected readonly formatDuration = formatDuration;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private catalogQuery = inject(CatalogQueryService);
  private catalogCommand = inject(CatalogCommandService);
  private trackQuery = inject(TrackQueryService);
  private toast = inject(ToastService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private playHistory = inject(PlayHistoryService);
  protected offline = inject(OfflineService);
  protected downloadService = inject(TrackDownloadService);
  private recorderPanel = inject(RecorderPanelService);
  private recorder = inject(RecorderService);
  private recorderSub?: Subscription;
  private libraryRefreshTimer?: ReturnType<typeof setTimeout>;

  listType = signal<ListType>('album');
  listId = signal('');
  pageNum = signal(1);
  detail = signal<IDetailResponse | null>(null);
  loading = signal(false);
  refreshing = signal(false);
  error = signal('');
  currentTrackId = signal<number | null>(null);
  isPlaying = signal(false);
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
  bannerTitle = computed(() => {
    const name = this.bannerName();
    if (!name) return '';
    switch (this.listType()) {
      case 'artist':
        return name;
      case 'album': {
        const albumName = this.entity()?.Name ?? name;
        return albumName;
      }
      case 'genre':
        return name;
      default:
        return name;
    }
  });
  bannerTrackCount = computed(() => {
    const count = this.detail()?.related.count ?? 0;
    return count > 0 ? `${count} tracks` : '';
  });
  playlists = signal<IPlaylistSummary[]>([]);

  menuTrack = signal<ITrackItem | null>(null);
  editMode = signal(false);
  orderedTracks = signal<ITrackItem[]>([]);
  savingOrder = signal(false);
  private dragFromIndex = -1;
  protected viewMode = signal<'tracks' | 'albums'>('tracks');

  // Signals for Apple Search functionality
  isSearchingApple = signal(false);
  appleSearchResults = signal<ItunesItem[]>([]);
  missingTracks = signal<ItunesItem[]>([]);

  /** Groups tracks by album for the album grid view. */
  protected albumGrid = computed(() => {
    const seen = new Map<string, { name: string; image: string; trackCount: number; routerLink: any[] | null }>();
    for (const t of this.tracks()) {
      const key = t.albumName || 'Unknown';
      if (!seen.has(key)) {
        seen.set(key, {
          name: t.albumName || 'Unknown',
          image: t.albumImage || '',
          trackCount: 0,
          routerLink: t.albumFk ? ['/list', 'album', t.albumFk, 1] : null,
        });
      }
      seen.get(key)!.trackCount++;
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

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

  allTracksDownloaded = computed(() => {
    const tracks = this.tracks();
    return tracks.length > 0 && tracks.every((t) => this.downloadService.isDownloaded(t.ID));
  });

  anyTrackDownloading = computed(() =>
    this.tracks().some((t) => this.downloadService.isDownloading(t.ID)),
  );

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
    this.audioPlayerCommand.isPlaying$.subscribe((playing) => {
      this.isPlaying.set(playing);
    });

    this.catalogQuery.getPlaylists().then((playlists) => this.playlists.set(playlists));

    this.route.data.subscribe((data) => {
      const params = this.route.snapshot.paramMap;
      const pageNum = Number(params.get('pageNum')) || 1;
      const rawListType = params.get('listType');

      if (rawListType === null) {
        this.listType.set('library');
        this.listId.set('');
      } else {
        this.listType.set(this.parseListType(rawListType));
        this.listId.set(params.get('listId') ?? '');
      }
      this.pageNum.set(pageNum);

      const resolved = data['list'] as ListResolvedData;
      this.detail.set(resolved.detail);
      this.bannerImage.set(resolved.bannerImage);
      this.bannerName.set(resolved.bannerName);

      // Reset view mode to tracks when navigating to a new list
      this.viewMode.set('tracks');
    });

    // When a recording batch finishes, give the S3->library ingest a moment
    // to land, then refresh — but only if the user is still on the library.
    this.recorderSub = this.recorder.batchCompleted$.subscribe((batch) => {
      if (!batch.jobs.some((j) => j.status === 'done')) return;
      clearTimeout(this.libraryRefreshTimer);
      this.libraryRefreshTimer = setTimeout(() => {
        if (this.listType() === 'library') this.loadLibrary(this.pageNum());
      }, 5000);
    });
  }

  ngOnDestroy(): void {
    this.recorderSub?.unsubscribe();
    clearTimeout(this.libraryRefreshTimer);
  }

  private parseListType(value: string | null): ListType {
    return value === 'artist' || value === 'genre' || value === 'playlist' ? value : 'album';
  }

  playTrack(track: ITrackItem): void {
    this.recordPlay(track);
    this.audioPlayerCommand.openTrack(track, this.tracks());
  }

  togglePlayList(): void {
    if (this.isPlayingThisList()) {
      this.audioPlayerCommand.clearQueue();
    } else {
      const tracks = this.tracks();
      if (tracks.length > 0) {
        this.recordPlay(tracks[0]);
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
      this.recordPlay(tracks[0]);
      this.audioPlayerCommand.openTrack(tracks[0], tracks);
    }
  }

  downloadAllTracks(): void {
    this.downloadService.downloadAll(this.tracks());
  }

  /** Opens the recorder modal from the library page (no artist-specific seed). */
  openRecorder(): void {
    this.recorderPanel.open();
  }

  isInPlaylist(track: ITrackItem): boolean {
    return this.playlistFileKeys().has(track.FileKey);
  }

  openMenu(track: ITrackItem, event: Event): void {
    event.stopPropagation();
    this.menuTrack.set(track);
  }

  closeMenu(): void {
    this.menuTrack.set(null);
  }

  enterEditMode(): void {
    this.orderedTracks.set([...this.tracks()]);
    this.editMode.set(true);
  }

  cancelEditMode(): void {
    this.editMode.set(false);
    this.orderedTracks.set([]);
  }

  onDragStart(index: number): void {
    this.dragFromIndex = index;
  }

  onDragOver(index: number, event: DragEvent): void {
    event.preventDefault();
    this.moveItem(index);
  }

  onTouchStart(index: number, event: TouchEvent): void {
    event.preventDefault();
    this.dragFromIndex = index;
  }

  onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    if (this.dragFromIndex === -1) return;
    const touch = event.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = el?.closest('[data-drag-index]') as HTMLElement | null;
    if (!row) return;
    const toIndex = Number(row.getAttribute('data-drag-index'));
    if (!isNaN(toIndex)) this.moveItem(toIndex);
  }

  onTouchEnd(): void {
    this.dragFromIndex = -1;
  }

  private moveItem(toIndex: number): void {
    if (toIndex === this.dragFromIndex) return;
    const tracks = [...this.orderedTracks()];
    const [moved] = tracks.splice(this.dragFromIndex, 1);
    tracks.splice(toIndex, 0, moved);
    this.dragFromIndex = toIndex;
    this.orderedTracks.set(tracks);
  }

  async saveOrder(): Promise<void> {
    const playlist = this.playlists().find((p) => p.listKey === this.listId());
    if (!playlist) return;

    this.savingOrder.set(true);
    const updated: IPlaylistSummary = {
      ...playlist,
      related: this.orderedTracks().map((t) => t.FileKey),
    };
    try {
      await this.catalogCommand.savePlaylist(updated);
      this.editMode.set(false);
      this.orderedTracks.set([]);
      this.loadDetail('playlist', this.listId(), this.pageNum());
      inject(ToastService).show('Playlist order saved.');
    } catch {
      inject(ToastService).show('Failed to save order.');
    } finally {
      this.savingOrder.set(false);
    }
  }

  onPlaylistToggled(playlists: IPlaylistSummary[]): void {
    this.playlists.set(playlists);
    if (this.listType() === 'playlist') {
      this.loadDetail('playlist', this.listId(), this.pageNum());
    }
  }

  /**
   * Find missing tracks on the current album using Apple Search API
   */
  async findMissingTracks(): Promise<void> {
    // Only works for album lists
    if (this.listType() !== 'album') {
      this.toast.show('This feature is only available for albums.');
      return;
    }

    const albumEntity = this.entity();
    if (!albumEntity) {
      this.toast.show('No album information found.');
      return;
    }

    const albumName = albumEntity.Name;
    if (!albumName) {
      this.toast.show('Album name not found.');
      return;
    }

    // Get the artist name from the first track if available
    const firstTrack = this.tracks()[0];
    const artistName = firstTrack?.artistName;

    this.isSearchingApple.set(true);
    this.appleSearchResults.set([]);
    this.missingTracks.set([]);

    try {
      const response = await this.trackQuery.searchAppleAlbumTracks(albumName, artistName);

      // Filter to only include tracks that are part of the album (collectionName matches)
      const albumTracks = response.results.filter(track =>
        track.wrapperType === 'track' &&
        track.kind === 'song' &&
        track.collectionName &&
        track.collectionName.toLowerCase().includes(albumName.toLowerCase())
      );

      // Find missing tracks by comparing track numbers
      const existingTrackNumbers = new Set(
        this.tracks()
          .map(t => t.trackNumber)
          .filter((n): n is number => n !== null && n !== undefined)
      );

      const missing = albumTracks.filter(track =>
        track.trackNumber !== null &&
        track.trackNumber !== undefined &&
        !existingTrackNumbers.has(track.trackNumber)
      );

      this.appleSearchResults.set(albumTracks);
      this.missingTracks.set(missing);

      if (missing.length > 0) {
        this.toast.show(`Found ${missing.length} missing track(s) on iTunes.`);
      } else {
        this.toast.show('No missing tracks found on iTunes.');
      }
    } catch (error) {
      console.error('Error searching Apple catalog:', error);
      this.toast.show('Failed to search iTunes catalog.');
    } finally {
      this.isSearchingApple.set(false);
    }
  }

  /**
   * Opens the recorder modal seeded with the missing track and runs the
   * in-app YouTube search immediately, so the result can be recorded.
   */
  searchYouTubeForTrack(track: ItunesItem, event?: Event): void {
    event?.stopPropagation();
    this.recorderPanel.open(`${track.artistName} - ${track.trackName}`, true);
  }

  onTrackUpdated(updatedTrack: ITrackItem): void {
    // Update the track in the current list
    this.detail.update((currentDetail) => {
      if (!currentDetail) return currentDetail;

      const updatedRecords = currentDetail.related.records.map((track) =>
        track.ID === updatedTrack.ID ? updatedTrack : track
      );

      return {
        ...currentDetail,
        related: {
          ...currentDetail.related,
          records: updatedRecords,
        },
      };
    });

    // Also update the menu track if it's the same track
    if (this.menuTrack()?.ID === updatedTrack.ID) {
      this.menuTrack.set(updatedTrack);
    }

    // Show a success message
    inject(ToastService).show(`Track "${updatedTrack.Title}" updated successfully!`);
  }

  private recordPlay(track: ITrackItem): void {
    this.playHistory.recordPlay(
      this.listType() === 'library' ? 'library' : this.listType(),
      this.currentLabel(),
      this.listType() === 'library'
        ? ['/list', this.pageNum()]
        : ['/list', this.listType(), this.listId(), this.pageNum()],
      track,
    );
  }

  protected goToPage(page: number): void {
    const clamped = Math.max(1, Math.min(page, this.totalPages()));
    if (clamped !== this.pageNum()) {
      this.pageNum.set(clamped);
      this.loadDetail(this.listType(), this.listId(), clamped);
    }
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
      .getLibrary(pageNum, undefined, true)
      .then((res) => {
        this.detail.set(res);
        this.loadArtistBanner(res.related.records);
      })
      .catch(() => {
        if (!this.offline.isOnline()) {
          this.error.set('This content isn\'t available offline. Download tracks to listen offline.');
        } else {
          this.error.set('Failed to load. Check your connection and try again.');
        }
      })
      .finally(() => {
        this.loading.set(false);
        this.refreshing.set(false);
      });
  }

  /** Manual refresh for the library view — useful when the auto-refresh
   *  after a recording batch completes doesn't pick up new tracks because
   *  the S3→library ingest pipeline hadn't finished yet. */
  protected refreshLibrary(): void {
    if (this.listType() !== 'library') return;
    this.refreshing.set(true);
    this.loadLibrary(this.pageNum());
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
        // Reset view mode to tracks when loading new detail
        this.viewMode.set('tracks');
      })
      .catch((err) => this.error.set(err?.message || 'Failed to load list'))
      .finally(() => this.loading.set(false));
  }

  /** Finds the first track with an artistFk whose artist has an imageLg for the banner,
   *  trying up to 3 distinct artists before giving up. */
  private loadArtistBanner(tracks: ITrackItem[]): void {
    const seen = new Set<number>();
    const candidateFks: number[] = [];
    for (const track of tracks) {
      const fk = track.artistFk;
      if (fk && !seen.has(fk)) {
        seen.add(fk);
        candidateFks.push(fk);
        if (candidateFks.length >= 3) break;
      }
    }
    if (candidateFks.length === 0) return;

    this.tryNextArtistBanner(candidateFks, 0);
  }

  private tryNextArtistBanner(artistFks: number[], index: number): void {
    if (index >= artistFks.length) {
      this.bannerImage.set(null);
      this.bannerName.set(null);
      return;
    }

    this.catalogQuery
      .getArtistDetail(artistFks[index])
      .then((res) => {
        const artist = res.row[0];
        if (artist?.imageLg) {
          this.bannerImage.set(artist.imageLg);
          this.bannerName.set(artist.Name ?? null);
        } else if (artist?.iArtistID) {
          // No imageLg but has an iTunes ID — try to fetch one
          this.catalogQuery.fetchArtistImage(artist.iArtistID).then((data) => {
            if (data?.messageContent) {
              // Persist so subsequent loads find it immediately
              this.catalogCommand.updateArtist(data.messageContent, artistFks[index], artist.iArtistID!);
              this.bannerImage.set(data.messageContent);
              this.bannerName.set(artist.Name ?? null);
            } else {
              this.tryNextArtistBanner(artistFks, index + 1);
            }
          }).catch(() => {
            this.tryNextArtistBanner(artistFks, index + 1);
          });
        } else {
          this.tryNextArtistBanner(artistFks, index + 1);
        }
      })
      .catch(() => {
        this.tryNextArtistBanner(artistFks, index + 1);
      });
  }

  // Method to handle album card clicks and ensure view mode is reset
  protected navigateToAlbum(routerLink: any[]): void {
    // Reset view mode to tracks before navigating
    this.viewMode.set('tracks');
    // Navigate to the album
    this.router.navigate(routerLink);
  }
}