import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ToastMessage {
  id: number;
  text: string;
}

const DEFAULT_DURATION_MS = 3500;

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts$ = new BehaviorSubject<ToastMessage[]>([]);

  private nextId = 0;

  show(text: string, duration = DEFAULT_DURATION_MS): void {
    const id = ++this.nextId;
    this.toasts$.next([...this.toasts$.value, { id, text }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number): void {
    this.toasts$.next(this.toasts$.value.filter((toast) => toast.id !== id));
  }
}
