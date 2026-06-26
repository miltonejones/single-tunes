import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastMessage, ToastService } from './toast.service';

@Component({
  selector: 'lib-toast',
  templateUrl: './toast.html',
  styleUrl: './toast.css',
})
export class Toast implements OnDestroy {
  private toastService = inject(ToastService);

  protected toasts = signal<ToastMessage[]>([]);

  private sub: Subscription = this.toastService.toasts$.subscribe((toasts) => this.toasts.set(toasts));

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
