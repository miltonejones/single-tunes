import { Injectable, signal } from '@angular/core';

/** Open/close state for the Shazam recognition modal, mirroring RecorderPanelService. */
@Injectable({ providedIn: 'root' })
export class ShazamPanelService {
  readonly isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
