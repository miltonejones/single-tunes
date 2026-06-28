import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
    Genre: '',
    genreKey: null,
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

  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private playHistory = inject(PlayHistoryService);
  protected downloadService = inject(TrackDownloadService);

  tracks = signal<DownloadedTrack[]>([]);
  loading = signal(true);
  currentTrackId = signal<number | null>(null);
  menuTrack = signal<DownloadedTrack | null>(null);

  isPlayingThisList = computed(() => {
    const id = this.currentTrackId();
    return !!id && this.tracks().some((t) => t.ID === id);
  });

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'] },
    { label: 'Downloads' },
  ]);

  ngOnInit(): void {
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.currentTrackId.set(track?.ID ?? null);
    });

    this.loadDownloadedTracks();
  }

  private async loadDownloadedTracks(): Promise<void> {
    this.loading.set(true);
    try {
      const downloadedItems = await this.downloadService.getAllDownloadedTracks();
      // Convert the stored items to DownloadedTrack format
      const trackItems: DownloadedTrack[] = downloadedItems.map(item => ({
        ID: item.trackId,
        Title: item.title,
        artistName: item.artistName ?? '',
        albumName: item.albumName ?? '',
        albumImage: item.albumImage ?? '',
        trackTime: item.trackTime ?? 0,
        discNumber: item.discNumber,
        trackNumber: item.trackNumber,
        FileKey: item.FileKey,
      }));
      this.tracks.set(trackItems);
    } catch (error) {
      console.error('Failed to load downloaded tracks:', error);
      this.tracks.set([]);
    } finally {
      this.loading.set(false);
    }
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

  private recordPlay(track: ITrackItem): void {
    this.playHistory.recordPlay('library', 'Downloads', ['/downloads'], track);
  }
}