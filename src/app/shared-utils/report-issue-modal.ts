import { Component, inject, input, output, signal } from '@angular/core';
import { GithubCommandService } from './github-command.service';
import { ToastService } from './toast.service';
import { ITrackItem } from './models';

@Component({
  selector: 'app-report-issue-modal',
  imports: [],
  templateUrl: './report-issue-modal.html',
  styleUrl: './report-issue-modal.css',
})
export class ReportIssueModal {
  track = input<ITrackItem | null>(null);
  closed = output<void>();

  private githubCommand = inject(GithubCommandService);
  private toast = inject(ToastService);

  title = signal('');
  description = signal('');
  submitting = signal(false);
  error = signal('');

  close(): void {
    this.closed.emit();
  }

  async submit(): Promise<void> {
    const title = this.title().trim();
    if (!title) return;

    this.submitting.set(true);
    this.error.set('');

    const track = this.track();
    const context = track
      ? `\n\n---\n**Track:** ${track.Title}\n**Artist:** ${track.artistName}\n**Album:** ${track.albumName}\n**File key:** ${track.FileKey}`
      : '';

    try {
      const issue = await this.githubCommand.createIssue({
        title,
        body: `${this.description().trim()}${context}`,
      });
      this.toast.show(`Issue #${issue.number} created`);
      this.title.set('');
      this.description.set('');
      this.close();
    } catch {
      this.error.set('Failed to submit issue');
      this.toast.show('Failed to submit issue');
    } finally {
      this.submitting.set(false);
    }
  }
}
