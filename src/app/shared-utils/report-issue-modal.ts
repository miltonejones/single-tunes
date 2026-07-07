import { Component, inject, output, signal } from '@angular/core';
import { GithubCommandService } from './github-command.service';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-report-issue-modal',
  imports: [],
  templateUrl: './report-issue-modal.html',
  styleUrl: './report-issue-modal.css',
})
export class ReportIssueModal {
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

    try {
      const issue = await this.githubCommand.createIssue({
        title,
        body: this.description().trim(),
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
