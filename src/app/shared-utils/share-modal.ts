import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShareService, KtunesUser, ShareContext } from './share.service';

@Component({
  selector: 'app-share-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './share-modal.html',
  styleUrl: './share-modal.css',
})
export class ShareModal implements OnInit {
  context = input.required<ShareContext>();
  closed = output<void>();

  private shareService = inject(ShareService);

  email = signal('');
  password = signal('');
  loginError = signal('');
  loginBusy = signal(false);

  users = signal<KtunesUser[]>([]);
  selectedUserId = signal<number | null>(null);
  shareBusy = signal(false);
  shareResult = signal<{ shared: number; skipped: number } | null>(null);
  shareError = signal('');

  isLoggedIn = computed(() => this.shareService.isLoggedIn());

  ngOnInit(): void {
    if (this.isLoggedIn()) {
      this.loadUsers();
    }
  }

  async doLogin(): Promise<void> {
    this.loginBusy.set(true);
    this.loginError.set('');
    try {
      await this.shareService.login(this.email(), this.password());
      await this.loadUsers();
    } catch (e: any) {
      this.loginError.set(e?.error?.error || e?.message || 'Login failed');
    } finally {
      this.loginBusy.set(false);
    }
  }

  private async loadUsers(): Promise<void> {
    try {
      const users = await this.shareService.getUsers();
      this.users.set(users);
    } catch {
      this.shareError.set('Could not load users. Session may have expired.');
    }
  }

  async doShare(): Promise<void> {
    const targetUserId = this.selectedUserId();
    if (!targetUserId) return;
    this.shareBusy.set(true);
    this.shareError.set('');
    this.shareResult.set(null);
    try {
      const ctx = this.context();
      const result =
        ctx.type === 'playlist'
          ? await this.shareService.shareTracks(ctx.trackIds ?? [], targetUserId)
          : await this.shareService.share({ type: ctx.type, id: ctx.id!, targetUserId });
      this.shareResult.set(result);
    } catch (e: any) {
      const msg = e?.error?.error || e?.message || 'Share failed';
      if (e?.status === 401) {
        this.shareService.logout();
        this.shareError.set('Session expired. Please log in again.');
      } else {
        this.shareError.set(msg);
      }
    } finally {
      this.shareBusy.set(false);
    }
  }

  close(): void {
    this.closed.emit();
  }

  logout(): void {
    this.shareService.logout();
  }
}
