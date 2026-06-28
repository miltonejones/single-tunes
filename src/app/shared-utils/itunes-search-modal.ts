import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ImgFallbackDirective } from './img-fallback.directive';
import { TrackQueryService } from './track-query.service';
import { TrackCommandService } from './track-command.service';
import { ToastService } from './toast.service';
import { ITrackItem, ItunesItem } from './models';
import { formatDuration } from './domain/track';

@Component({
  selector: 'app-itunes-search-modal',
  imports: [ImgFallbackDirective],
  templateUrl: './itunes-search-modal.html',
  styleUrl: './itunes-search-modal.css',
})
export class ItunesSearchModal {
  track = input<ITrackItem | null>(null);
  closed = output<void>();
  trackUpdated = output<ITrackItem>();

  private trackQuery = inject(TrackQueryService);
  private trackCommand = inject(TrackCommandService);
  private toast = inject(ToastService);

  searchTerm = signal('');
  isSearching = signal(false);
  results = signal<ItunesItem[]>([]);
  selectedResult = signal<ItunesItem | null>(null);
  error = signal('');

  protected readonly formatDuration = formatDuration;

  constructor() {
    effect(() => {
      const track = this.track();
      if (track) {
        // Set default search term to "track name by artist name"
        this.searchTerm.set(`${track.Title} by ${track.artistName}`);
      }
    });
  }

  close(): void {
    this.closed.emit();
  }

  search(): void {
    const term = this.searchTerm().trim();
    if (!term) return;

    this.isSearching.set(true);
    this.error.set('');
    this.results.set([]);
    this.selectedResult.set(null);

    this.trackQuery
      .searchAppleCatalog(term)
      .then((response) => {
        this.results.set(response.results);
        if (response.results.length === 0) {
          this.toast.show('No results found on iTunes for this search term.');
        }
      })
      .catch((err) => {
        this.error.set(err?.message || 'Failed to search iTunes catalog');
        this.toast.show('Failed to search iTunes catalog');
      })
      .finally(() => {
        this.isSearching.set(false);
      });
  }

  selectResult(result: ItunesItem): void {
    this.selectedResult.set(result);
  }

  applyChanges(): void {
    const track = this.track();
    const result = this.selectedResult();
    if (!track || !result) return;

    this.trackCommand
      .applyAppleLookupResult(result, track)
      .then((updatedTrack) => {
        this.toast.show(`Track "${updatedTrack.Title}" updated successfully!`);
        this.trackUpdated.emit(updatedTrack);
        this.close();
      })
      .catch((err) => {
        this.error.set(err?.message || 'Failed to update track');
        this.toast.show('Failed to update track metadata');
      });
  }
}