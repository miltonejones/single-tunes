import { Component, computed, effect, inject, signal } from '@angular/core';
import { RecorderPanelService } from './recorder-panel.service';
import { RecorderService, RecorderResult } from './recorder.service';
import { ToastService } from './toast.service';
import { formatDuration } from './domain/track';

/**
 * Search YouTube, tick the results you want, and queue them for recording.
 * Selection accumulates across searches so a batch can be built up before
 * submitting; progress afterwards is shown by RecorderProgress, not here.
 */
@Component({
  selector: 'app-recorder-modal',
  imports: [],
  templateUrl: './recorder-modal.html',
  styleUrl: './recorder-modal.css',
})
export class RecorderModal {
  protected panel = inject(RecorderPanelService);
  private recorder = inject(RecorderService);
  private toast = inject(ToastService);

  protected readonly formatDuration = formatDuration;

  searchTerm = signal('');
  count = signal(5);
  isSearching = signal(false);
  results = signal<RecorderResult[]>([]);
  error = signal('');
  submitting = signal(false);
  // Selected jobs keyed by url so selection survives across searches.
  private selected = signal<Map<string, RecorderResult>>(new Map());

  queue = computed(() => [...this.selected().values()]);
  queueCount = computed(() => this.selected().size);

  constructor() {
    // Seed the search box from whoever opened the modal (e.g. artist banner).
    effect(() => {
      if (this.panel.isOpen()) {
        const seed = this.panel.seedTerm();
        if (seed) this.searchTerm.set(seed);
      }
    });
  }

  isQueued(result: RecorderResult): boolean {
    return this.selected().has(result.url);
  }

  toggle(result: RecorderResult): void {
    this.selected.update((map) => {
      const next = new Map(map);
      if (next.has(result.url)) next.delete(result.url);
      else next.set(result.url, result);
      return next;
    });
  }

  removeFromQueue(url: string): void {
    this.selected.update((map) => {
      const next = new Map(map);
      next.delete(url);
      return next;
    });
  }

  search(): void {
    const term = this.searchTerm().trim();
    if (!term) return;

    this.isSearching.set(true);
    this.error.set('');
    this.results.set([]);

    this.recorder
      .search(term, this.count())
      .then((results) => {
        this.results.set(results);
        if (results.length === 0) this.toast.show('No YouTube results for that search.');
      })
      .catch((err) => {
        this.error.set(err?.message || 'Search failed');
        this.toast.show('Recorder search failed');
      })
      .finally(() => this.isSearching.set(false));
  }

  record(): void {
    const jobs = this.queue();
    if (jobs.length === 0) return;

    this.submitting.set(true);
    const label = this.searchTerm().trim() || `${jobs.length} tracks`;
    this.recorder
      .submit(jobs, label)
      .then(() => {
        this.toast.show(`Queued ${jobs.length} track${jobs.length === 1 ? '' : 's'} for recording.`);
        this.close();
      })
      .catch((err) => {
        this.error.set(err?.message || 'Failed to queue recording');
        this.toast.show('Failed to queue recording');
      })
      .finally(() => this.submitting.set(false));
  }

  close(): void {
    this.panel.close();
    // Reset transient search state; the queue clears too so the next open is fresh.
    this.results.set([]);
    this.error.set('');
    this.selected.set(new Map());
  }

  displayName(output: string): string {
    return output.replace(/\.mp4$/i, '');
  }
}
