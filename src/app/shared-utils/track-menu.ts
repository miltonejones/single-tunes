import { Component, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioPlayerCommandService } from './audio-player-command.service';
import { CatalogCommandService } from './catalog-command.service';
import { CatalogQueryService } from './catalog-query.service';
import { ImgFallbackDirective } from './img-fallback.directive';
import { IPlaylistSummary, ITrackItem } from './models';
import { TrackQueryService } from './track-query.service';
import { TrackCommandService } from './track-command.service';
import { ItunesSearchModal } from './itunes-search-modal';
import { TrackEditModal } from './track-edit-modal';
import { ReportIssueModal } from './report-issue-modal';
import { FEATURE_FLAGS } from './feature-flags';
import { TrackDownloadService } from './track-download.service';
import { createKey } from './domain/text';

type MenuView = 'main' | 'playlists';

@Component({
  selector: 'app-track-menu',
  imports: [RouterLink, ImgFallbackDirective, ItunesSearchModal, TrackEditModal, ReportIssueModal],
  templateUrl: './track-menu.html',
  styleUrl: './track-menu.css',
})
export class TrackMenu implements OnInit {
  track = input<ITrackItem | null>(null);
  closed = output<void>();
  trackUpdated = output<ITrackItem>();
  playlistToggled = output<IPlaylistSummary[]>();

  private catalogQuery = inject(CatalogQueryService);
  private catalogCommand = inject(CatalogCommandService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private trackQuery = inject(TrackQueryService);
  private trackCommand = inject(TrackCommandService);
  protected downloadService = inject(TrackDownloadService);
  protected readonly featureFlags = FEATURE_FLAGS;

  menuView = signal<MenuView>('main');
  playlists = signal<IPlaylistSummary[]>([]);
  private queueLength = signal(0);
  showEditModal = signal(false);
  editTrackItem = signal<ITrackItem | null>(null);
  showTrackEditModal = signal(false);
  editTrackItemProps = signal<ITrackItem | null>(null);
  showReportIssueModal = signal(false);
  reportIssueTrack = signal<ITrackItem | null>(null);
  newPlaylistName = signal('');
  showNewPlaylistInput = signal(false);

  canAddToQueue = computed(() => this.queueLength() > 0);

  constructor() {
    effect(() => {
      if (this.track()) {
        this.menuView.set('main');
      }
    });
  }

  ngOnInit(): void {
    this.catalogQuery.getPlaylists({ field: 'Title', direction: 'DESC' }).then((playlists) => this.playlists.set(playlists));
    this.audioPlayerCommand.queue$.subscribe((queue) => this.queueLength.set(queue.length));
  }

  close(): void {
    this.closed.emit();
    this.showEditModal.set(false);
    this.editTrackItem.set(null);
  }

  addToQueue(): void {
    const track = this.track();
    if (!track) return;
    this.audioPlayerCommand.addToQueue(track);
    this.close();
  }

  isTrackInPlaylist(playlist: IPlaylistSummary): boolean {
    const track = this.track();
    return !!track && playlist.related.includes(track.FileKey);
  }

  togglePlaylist(playlist: IPlaylistSummary): void {
    const track = this.track();
    if (!track) return;

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
      this.playlistToggled.emit(this.playlists());
    });
  }

  createPlaylist(): void {
    const name = this.newPlaylistName().trim();
    const track = this.track();
    if (!name || !track) return;

    const newPlaylist: IPlaylistSummary = {
      listKey: createKey(name),
      Title: name,
      TrackCount: 1,
      related: [track.FileKey],
    };

    this.catalogCommand.savePlaylist(newPlaylist).then(() => {
      this.playlists.update((list) => [...list, newPlaylist]);
      this.playlistToggled.emit(this.playlists());
      this.newPlaylistName.set('');
      this.showNewPlaylistInput.set(false);
    });
  }

  editTrack(): void {
    const track = this.track();
    if (!track) return;

    // Close the main menu and open the iTunes search modal
    this.close();
    this.editTrackItem.set(track);
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.editTrackItem.set(null);
  }

  editTrackProperties(): void {
    const track = this.track();
    if (!track) return;

    // Close the main menu and open the properties edit modal
    this.close();
    this.editTrackItemProps.set(track);
    this.showTrackEditModal.set(true);
  }

  closeTrackEditModal(): void {
    this.showTrackEditModal.set(false);
    this.editTrackItemProps.set(null);
  }

  onTrackUpdated(updatedTrack: ITrackItem): void {
    this.trackUpdated.emit(updatedTrack);
  }

  reportIssue(): void {
    const track = this.track();
    if (!track) return;

    // Close the main menu and open the report-an-issue modal
    this.close();
    this.reportIssueTrack.set(track);
    this.showReportIssueModal.set(true);
  }

  closeReportIssueModal(): void {
    this.showReportIssueModal.set(false);
    this.reportIssueTrack.set(null);
  }

  downloadTrack(): void {
    const track = this.track();
    if (!track) return;
    this.downloadService.download(track);
    this.close();
  }

  removeDownload(): void {
    const track = this.track();
    if (!track) return;
    this.downloadService.remove(track);
    this.close();
  }
}
