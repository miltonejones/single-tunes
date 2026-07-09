import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DownloadsResolvedData } from './downloads.resolver';
import {
  AudioPlayerCommandService,
  Breadcrumbs,
  BreadcrumbItem,
  formatDuration,
  ImgFallbackDirective,
  ITrackItem,
  LoadingAnimation,
  PlayHistoryService,
  TrackDownloadService,
  TrackMenu,
} from 'shared-utils';

interface DownloadedTrack {
  ID: number;
  Title: string;
  artistName: string;
  albumName: string;
  albumImage: string;
  trackTime: number;
  discNumber?: number | null;
  trackNumber?: number | null;
  FileKey: string;
  albumFk?: any;
  artistFk?: number | null;
  Genre?: string | null;
  genreKey?: any;
}

function toITrackItem(track: DownloadedTrack): ITrackItem {
  return {
    ID: track.ID,
    Title: track.Title,
    artistName: track.artistName,
    albumName: track.albumName,
    albumImage: track.albumImage,
    trackTime: track.trackTime,
    discNumber: track.discNumber ?? null,
    trackNumber: track.trackNumber ?? null,
    FileKey: track.FileKey,
    trackId: track.ID,
    Genre: track.Genre ?? '',
    genreKey: track.genreKey ?? null,
    albumFk: track.albumFk ?? null,
    artistFk: track.artistFk ?? null,
    explicit: false,
  };
}

@Component({
  selector: 'app-downloads-page',
  imports: [RouterLink, ImgFallbackDirective, Breadcrumbs, LoadingAnimation, TrackMenu],
  templateUrl: './downloads.html',
  styleUrl: './downloads.css',
})
export class DownloadsPage implements OnInit {
  protected readonly title = signal('Downloads');
  protected readonly formatDuration = formatDuration;
  protected readonly toITrackItem = toITrackItem;

  private route = inject(ActivatedRoute);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private playHistory = inject(PlayHistoryService);
  protected downloadService = inject(TrackDownloadService);

  tracks = signal<DownloadedTrack[]>([]);
  loading = signal(true);
  currentTrackId = signal<number | null>(null);
  menuTrack = signal<DownloadedTrack | null>(null);
  confirmingClear = signal(false);
  searchQuery = signal('');
  viewMode = signal<'all' | 'by-artist' | 'by-album'>('all');

  filteredTracks = computed(() => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.tracks();
    return this.tracks().filter(
      (t) =>
        t.Title.toLowerCase().includes(q) ||
        t.artistName.toLowerCase().includes(q) ||
        t.albumName.toLowerCase().includes(q),
    );
  });

  groupedByArtist = computed(() => {
    const map = new Map<string, DownloadedTrack[]>();
    for (const t of this.filteredTracks()) {
      const key = t.artistName || 'Unknown Artist';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  groupedByAlbum = computed(() => {
    const map = new Map<string, DownloadedTrack[]>();
    for (const t of this.filteredTracks()) {
      const key = t.albumName || 'Unknown Album';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  constructor() {
    effect(() => {
      const downloaded = this.downloadService.downloadedIds();
      this.tracks.update((list) => list.filter((t) => downloaded.has(t.ID)));
    });
  }

  isPlayingThisList = computed(() => {
    const id = this.currentTrackId();
    return !!id && this.tracks().some((t) => t.ID === id);
  });

  bannerImage = computed(() => this.tracks().find((t) => t.albumImage)?.albumImage ?? null);

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'], icon: 'fa-house' },
    { label: 'Downloads', icon: 'fa-download' },
  ]);

  ngOnInit(): void {
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.currentTrackId.set(track?.ID ?? null);
    });

    const resolved = this.route.snapshot.data['downloads'] as DownloadsResolvedData;
    const trackItems: DownloadedTrack[] = resolved.map(item => ({
      ID: item.trackId,
      Title: item.title,
      artistName: item.artistName ?? '',
      albumName: item.albumName ?? '',
      albumImage: item.albumImage ?? '',
      trackTime: item.trackTime ?? 0,
      discNumber: item.discNumber,
      trackNumber: item.trackNumber,
      FileKey: item.FileKey,
      albumFk: item.albumFk ?? null,
      artistFk: item.artistFk ?? null,
      Genre: item.Genre ?? null,
      genreKey: item.genreKey ?? null,
    }));
    this.tracks.set(trackItems);
    this.loading.set(false);
  }

  playTrack(track: DownloadedTrack): void {
    const trackItem = toITrackItem(track);
    const trackList = this.tracks().map(toITrackItem);

    this.recordPlay(trackItem);
    this.audioPlayerCommand.openTrack(trackItem, trackList);
  }

  togglePlayList(): void {
    if (this.isPlayingThisList()) {
      this.audioPlayerCommand.clearQueue();
    } else {
      const tracks = this.tracks();
      if (tracks.length > 0) {
        const firstTrack = toITrackItem(tracks[0]);
        const trackList = tracks.map(toITrackItem);
        this.recordPlay(firstTrack);
        this.audioPlayerCommand.openTrack(firstTrack, trackList);
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
      const firstTrack = toITrackItem(tracks[0]);
      const trackList = tracks.map(toITrackItem);
      this.recordPlay(firstTrack);
      this.audioPlayerCommand.openTrack(firstTrack, trackList);
    }
  }

  removeTrack(track: DownloadedTrack): void {
    // Convert to ITrackItem for the remove method
    const trackItem = toITrackItem(track);

    this.downloadService.remove(trackItem);
    // Remove from the displayed list
    this.tracks.update(tracks => tracks.filter(t => t.ID !== track.ID));
  }

  openMenu(track: DownloadedTrack, event: Event): void {
    event.stopPropagation();
    this.menuTrack.set(track);
  }

  closeMenu(): void {
    this.menuTrack.set(null);
  }

  async clearAllDownloads(): Promise<void> {
    const tracks = this.tracks();
    if (tracks.length === 0) return;
    for (const track of tracks) {
      await this.downloadService.remove(toITrackItem(track));
    }
    this.tracks.set([]);
    this.confirmingClear.set(false);
    this.audioPlayerCommand.clearQueue();
  }

  private recordPlay(track: ITrackItem): void {
    this.playHistory.recordPlay('library', 'Downloads', ['/downloads'], track);
  }
}