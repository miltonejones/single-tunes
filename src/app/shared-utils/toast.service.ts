import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ToastMessage {
  id: number;
  text: string;
  persistent?: boolean;
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

  /** Shows a toast that stays until manually dismissed. Returns the id. */
  showPersistent(text: string): number {
    const id = ++this.nextId;
    this.toasts$.next([...this.toasts$.value, { id, text, persistent: true }]);
    return id;
  }

  /** Updates the text of an existing toast in place. */
  update(id: number, text: string): void {
    this.toasts$.next(this.toasts$.value.map((t) => (t.id === id ? { ...t, text } : t)));
  }

  dismiss(id: number): void {
    this.toasts$.next(this.toasts$.value.filter((toast) => toast.id !== id));
  }
}
