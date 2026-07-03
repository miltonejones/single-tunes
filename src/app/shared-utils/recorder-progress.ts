import { Component, computed, inject, signal } from '@angular/core';
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
};

const TERMINAL: RecorderJobStatus[] = ['done', 'failed'];

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
export class RecorderProgress {
  private recorder = inject(RecorderService);
  protected readonly STATUS_ICON = STATUS_ICON;

  collapsed = signal(false);
  batches = this.recorder.batches;
  recorderRunning = this.recorder.hasRunning;

  hasBatches = computed(() => this.batches().length > 0);

  dismiss(batchId: string): void {
    this.recorder.dismiss(batchId);
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

  summary(batch: RecorderBatch): string {
    const total = batch.jobs.length;
    const done = this.doneCount(batch);
    if (this.isRunning(batch)) return `${done}/${total} done`;
    const failed = this.failedCount(batch);
    return failed > 0 ? `${done}/${total} done · ${failed} failed` : `All ${total} done`;
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
    return job.status;
  }
}
