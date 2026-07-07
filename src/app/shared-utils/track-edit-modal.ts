import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CatalogQueryService } from './catalog-query.service';
import { TrackCommandService } from './track-command.service';
import { ToastService } from './toast.service';
import { IGridItem, ITrackItem } from './models';
import { stripTrack } from './domain/track';

@Component({
  selector: 'app-track-edit-modal',
  imports: [],
  templateUrl: './track-edit-modal.html',
  styleUrl: './track-edit-modal.css',
})
export class TrackEditModal {
  track = input<ITrackItem | null>(null);
  closed = output<void>();
  trackUpdated = output<ITrackItem>();

  private catalogQuery = inject(CatalogQueryService);
  private trackCommand = inject(TrackCommandService);
  private toast = inject(ToastService);

  // Form fields
  title = signal('');
  genre = signal('');
  trackNumber = signal<number | null>(null);
  discNumber = signal<number | null>(null);
  albumImage = signal('');
  albumFk = signal<number | null>(null);
  artistFk = signal<number | null>(null);

  // Album/Artist search state
  albumSearchTerm = signal('');
  artistSearchTerm = signal('');
  albumSearchResults = signal<IGridItem[]>([]);
  artistSearchResults = signal<IGridItem[]>([]);
  isSearchingAlbum = signal(false);
  isSearchingArtist = signal(false);
  selectedAlbumName = signal('');
  selectedArtistName = signal('');

  saving = signal(false);
  error = signal('');

  constructor() {
    effect(() => {
      const t = this.track();
      if (t) {
        this.title.set(t.Title);
        this.genre.set(t.Genre);
        this.trackNumber.set(t.trackNumber);
        this.discNumber.set(t.discNumber);
        this.albumImage.set(t.albumImage ?? '');
        this.albumFk.set(t.albumFk ?? null);
        this.artistFk.set(t.artistFk ?? null);
        this.selectedAlbumName.set(t.albumName);
        this.selectedArtistName.set(t.artistName);
      }
    });
  }

  close(): void {
    this.closed.emit();
  }

  async searchAlbum(): Promise<void> {
    const term = this.albumSearchTerm().trim();
    if (!term) return;
    this.isSearchingAlbum.set(true);
    try {
      const res = await this.catalogQuery.getSearch('album', term);
      this.albumSearchResults.set(res.records);
    } catch {
      this.toast.show('Failed to search albums');
    } finally {
      this.isSearchingAlbum.set(false);
    }
  }

  async searchArtist(): Promise<void> {
    const term = this.artistSearchTerm().trim();
    if (!term) return;
    this.isSearchingArtist.set(true);
    try {
      const res = await this.catalogQuery.getSearch('artist', term);
      this.artistSearchResults.set(res.records);
    } catch {
      this.toast.show('Failed to search artists');
    } finally {
      this.isSearchingArtist.set(false);
    }
  }

  selectAlbum(item: IGridItem): void {
    this.albumFk.set(Number(item.ID));
    this.selectedAlbumName.set(item.Name ?? '');
    this.albumSearchResults.set([]);
    this.albumSearchTerm.set('');
  }

  selectArtist(item: IGridItem): void {
    this.artistFk.set(Number(item.ID));
    this.selectedArtistName.set(item.Name ?? '');
    this.artistSearchResults.set([]);
    this.artistSearchTerm.set('');
  }

  async save(): Promise<void> {
    const t = this.track();
    if (!t) return;
    this.saving.set(true);
    this.error.set('');

    const updated: ITrackItem = {
      ...t,
      Title: this.title(),
      Genre: this.genre(),
      trackNumber: this.trackNumber(),
      discNumber: this.discNumber(),
      albumImage: this.albumImage() || null,
      albumFk: this.albumFk(),
      artistFk: this.artistFk(),
      albumName: this.selectedAlbumName() || t.albumName,
      artistName: this.selectedArtistName() || t.artistName,
    };

    try {
      await this.trackCommand.updateTrack(stripTrack(updated));
      this.toast.show(`Track "${updated.Title}" updated successfully!`);
      this.trackUpdated.emit(updated);
      this.close();
    } catch (err) {
      this.error.set('Failed to save track properties');
      this.toast.show('Failed to save track properties');
    } finally {
      this.saving.set(false);
    }
  }
}
