import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { RecorderService, RecorderBatch, RecorderJob, RecorderJobStatus } from './recorder.service';

const STATUS_ICON: Record<RecorderJobStatus, string> = {
  queued: 'fa-clock',
  starting: 'fa-hourglass-start',
  extracting: 'fa-magnifying-glass',
  downloading: 'fa-download',
  processing: 'fa-gears',
  recording: 'fa-video',
  uploading: 'fa-cloud-arrow-up',
  done: 'fa-circle-check',
  failed: 'fa-circle-xmark',
  cancelled: 'fa-ban',
};

const TERMINAL: RecorderJobStatus[] = ['done', 'failed', 'cancelled'];

/**
 * App-wide recorder progress. Hosted once in the app shell so any submitted
 * batch stays visible (and keeps updating) regardless of the current route.
 */
@Component({
  selector: 'app-recorder-progress',
  imports: [],
  templateUrl: './recorder-progress.html',
  styleUrl: './recorder-progress.css',
})
export class RecorderProgress implements OnDestroy {
  private recorder = inject(RecorderService);
  protected readonly STATUS_ICON = STATUS_ICON;

  collapsed = signal(false);
  batches = this.recorder.batches;
  recorderRunning = this.recorder.hasRunning;

  hasBatches = computed(() => this.batches().length > 0);
  cancelling = signal<Set<string>>(new Set());

  // ── Recording countdown ──────────────────────────────────────────────────
  /** Tracks when each job first entered `recording` status (client timestamp). */
  private recordingStartedAt = new Map<string, number>();
  /** Previous status per job, so we can detect transitions into `recording`. */
  private prevStatuses = new Map<string, RecorderJobStatus>();
  /** Reactive "now" updated every 500ms while any job is recording. */
  private recordingNow = signal(Date.now());
  private recordingTimer?: ReturnType<typeof setInterval>;

  constructor() {
    // Watch for jobs entering/leaving `recording` status on each poll tick.
    effect(() => {
      const batches = this.batches();
      let hasRecording = false;

      for (const batch of batches) {
        for (const job of batch.jobs) {
          const prev = this.prevStatuses.get(job.jobId);
          this.prevStatuses.set(job.jobId, job.status);

          if (job.status === 'recording' && prev !== 'recording') {
            this.recordingStartedAt.set(job.jobId, Date.now());
          }
          if (job.status !== 'recording') {
            this.recordingStartedAt.delete(job.jobId);
          }
          if (job.status === 'recording') {
            hasRecording = true;
          }
        }
      }

      if (hasRecording && !this.recordingTimer) {
        this.recordingTimer = setInterval(() => this.recordingNow.set(Date.now()), 500);
      } else if (!hasRecording && this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = undefined;
      }
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.recordingTimer);
    this.recordingTimer = undefined;
  }

  /** Returns 0–100 progress for a job in `recording` status, or 0 if unknown. */
  recordingProgress(job: RecorderJob): number {
    const startedAt = this.recordingStartedAt.get(job.jobId);
    if (!startedAt || !job.duration || job.duration <= 0) return 0;
    const elapsed = (this.recordingNow() - startedAt) / 1000;
    return Math.min(100, Math.round((elapsed / job.duration) * 100));
  }

  dismiss(batchId: string): void {
    this.recorder.dismiss(batchId);
  }

  cancelBatch(batchId: string): void {
    this.cancelling.update((s) => new Set(s).add(batchId));
    this.recorder.cancel(batchId).finally(() => {
      this.cancelling.update((s) => {
        const next = new Set(s);
        next.delete(batchId);
        return next;
      });
    });
  }

  isRunning(batch: RecorderBatch): boolean {
    return batch.jobs.length === 0 || batch.jobs.some((j) => !TERMINAL.includes(j.status));
  }

  doneCount(batch: RecorderBatch): number {
    return batch.jobs.filter((j) => j.status === 'done').length;
  }

  failedCount(batch: RecorderBatch): number {
    return batch.jobs.filter((j) => j.status === 'failed').length;
  }

  cancelledCount(batch: RecorderBatch): number {
    return batch.jobs.filter((j) => j.status === 'cancelled').length;
  }

  summary(batch: RecorderBatch): string {
    const total = batch.jobs.length;
    const done = this.doneCount(batch);
    if (this.isRunning(batch)) return `${done}/${total} done`;
    const parts: string[] = [];
    if (done > 0) parts.push(`${done} done`);
    const failed = this.failedCount(batch);
    if (failed > 0) parts.push(`${failed} failed`);
    const cancelled = this.cancelledCount(batch);
    if (cancelled > 0) parts.push(`${cancelled} cancelled`);
    return parts.length > 0 ? parts.join(' · ') : `All ${total} done`;
  }

  displayName(output: string): string {
    return output.replace(/\.mp4$/i, '');
  }

  // Older status docs (or future phases) may carry values this build doesn't
  // know — fall back rather than rendering a broken icon class.
  icon(status: RecorderJobStatus): string {
    return STATUS_ICON[status] ?? 'fa-circle-question';
  }

  isTerminal(job: RecorderJob): boolean {
    return TERMINAL.includes(job.status);
  }

  phaseLabel(job: RecorderJob): string {
    if (job.status === 'downloading' && job.progress != null) {
      return `downloading ${job.progress}%`;
    }
    if (job.status === 'recording' && job.duration) {
      return `recording ${this.recordingProgress(job)}%`;
    }
    return job.status;
  }
}
