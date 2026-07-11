import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, firstValueFrom } from 'rxjs';
import { RECORDER_API_ENDPOINT, LOCAL_RECORDER_API_ENDPOINT } from './api-config';

/** One YouTube search hit, shaped as a ready-to-record job. */
export interface RecorderResult {
  url: string;
  output: string;
  duration?: number;
}

export type RecorderJobStatus =
  | 'queued'
  | 'starting'
  | 'extracting'
  | 'downloading'
  | 'processing'
  | 'recording'
  | 'uploading'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface RecorderJob extends RecorderResult {
  batchId: string;
  jobId: string;
  status: RecorderJobStatus;
  /** Download percent (0-100), present only while status is 'downloading'. */
  progress?: number;
  updatedAt?: number;
  error?: string;
}

/** A submitted batch tracked app-wide until the user dismisses it. */
export interface RecorderBatch {
  batchId: string;
  label: string;
  jobs: RecorderJob[];
  startedAt: number;
}

const STORAGE_KEY = 'sky-tunes-recorder-batches';
const POLL_MS = 3000;
const TERMINAL: RecorderJobStatus[] = ['done', 'failed', 'cancelled'];

function batchRunning(batch: RecorderBatch): boolean {
  return batch.jobs.length === 0 || batch.jobs.some((j) => !TERMINAL.includes(j.status));
}

/**
 * Talks to the recorder cloud API (search / record / status) and holds the
 * state of every submitted batch so progress can be shown anywhere in the app.
 * A single interval polls all still-running batches until they finish.
 */
@Injectable({ providedIn: 'root' })
export class RecorderService {
  private http = inject(HttpClient);

  /** Current recorder mode — 'aws' (cloud API + SQS) or 'local' (sandbox EC2 + file queue). */
  private readonly _mode = signal<'aws' | 'local'>(
    (localStorage.getItem('recorderMode') as 'aws' | 'local') || 'aws',
  );
  readonly mode = this._mode.asReadonly();

  /** Endpoint selected by the current mode. */
  private readonly endpoint = computed(() =>
    this._mode() === 'local' ? LOCAL_RECORDER_API_ENDPOINT : RECORDER_API_ENDPOINT,
  );

  private readonly _batches = signal<RecorderBatch[]>(this.load());
  readonly batches = this._batches.asReadonly();
  readonly hasRunning = computed(() => this._batches().some(batchRunning));

  private readonly completed$ = new Subject<RecorderBatch>();
  /** Emits a batch the moment its last job reaches a terminal state. */
  readonly batchCompleted$ = this.completed$.asObservable();

  private pollTimer?: ReturnType<typeof setInterval>;

  constructor() {
    if (this._batches().some(batchRunning)) this.ensurePolling();
  }

  /** Toggle between AWS and local recorder mode. */
  toggleMode(): void {
    this._mode.update((m) => {
      const next = m === 'aws' ? 'local' : 'aws';
      localStorage.setItem('recorderMode', next);
      return next;
    });
  }

  /** YouTube search; `duration` (seconds) overrides each clip's full length. */
  async search(term: string, count = 5, duration?: number): Promise<RecorderResult[]> {
    const url = `${this.endpoint()}/search/${encodeURIComponent(term)}/${count}`;
    const res = await firstValueFrom(this.http.get<{ results: RecorderResult[] }>(url));
    const results = res.results ?? [];
    return duration ? results.map((r) => ({ ...r, duration })) : results;
  }

  /** Queues jobs on the pipeline and starts tracking the returned batch. */
  async submit(jobs: RecorderResult[], label: string): Promise<string> {
    const res = await firstValueFrom(
      this.http.post<{ batchId: string; jobs: RecorderJob[] }>(
        `${this.endpoint()}/record`,
        { jobs },
      ),
    );
    const batch: RecorderBatch = {
      batchId: res.batchId,
      label,
      jobs: res.jobs ?? [],
      startedAt: Date.now(),
    };
    this._batches.update((list) => [batch, ...list]);
    this.persist();
    this.ensurePolling();
    return res.batchId;
  }

  dismiss(batchId: string): void {
    this._batches.update((list) => list.filter((b) => b.batchId !== batchId));
    this.persist();
  }

  /** Cancels all running jobs in a batch. */
  async cancel(batchId: string): Promise<void> {
    // Optimistically mark all non-terminal jobs as cancelled so the UI
    // responds instantly; the poller will confirm by writing the status doc.
    this._batches.update((list) =>
      list.map((b) => {
        if (b.batchId !== batchId) return b;
        return {
          ...b,
          jobs: b.jobs.map((j) =>
            TERMINAL.includes(j.status) ? j : { ...j, status: 'cancelled' as const },
          ),
        };
      }),
    );
    this.persist();
    try {
      await firstValueFrom(
        this.http.post(`${this.endpoint()}/record/${encodeURIComponent(batchId)}/cancel`, {}),
      );
    } catch {
      // Optimistic update already applied — the next poll tick will reconcile.
    }
  }

  private async refresh(batchId: string): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ jobs: RecorderJob[] }>(
          `${this.endpoint()}/record/${encodeURIComponent(batchId)}`,
        ),
      );
      let finished: RecorderBatch | null = null;
      this._batches.update((list) =>
        list.map((b) => {
          if (b.batchId !== batchId) return b;
          const updated = { ...b, jobs: res.jobs ?? b.jobs };
          if (batchRunning(b) && !batchRunning(updated)) finished = updated;
          return updated;
        }),
      );
      this.persist();
      if (finished) this.completed$.next(finished);
    } catch {
      // Transient failure — leave the batch as-is and retry on the next tick.
    }
  }

  private ensurePolling(): void {
    if (this.pollTimer) return;
    const tick = () => {
      const running = this._batches().filter(batchRunning);
      if (running.length === 0) {
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
        return;
      }
      running.forEach((b) => this.refresh(b.batchId));
    };
    this.pollTimer = setInterval(tick, POLL_MS);
    tick();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._batches()));
    } catch {
      /* storage full or unavailable — progress just won't survive a reload */
    }
  }

  private load(): RecorderBatch[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as RecorderBatch[]) : [];
    } catch {
      return [];
    }
  }
}
