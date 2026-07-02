import { Injectable, signal } from '@angular/core';

/**
 * Open/close state for the recorder modal, mirroring SettingsPanelService.
 * `open(seed)` lets a caller (e.g. the artist banner) prefill the search box.
 */
@Injectable({ providedIn: 'root' })
export class RecorderPanelService {
  readonly isOpen = signal(false);
  readonly seedTerm = signal('');

  open(seedTerm = ''): void {
    this.seedTerm.set(seedTerm);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
