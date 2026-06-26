import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TrackQueuePanelService {
  isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    this.isOpen.set(!this.isOpen());
  }
}
