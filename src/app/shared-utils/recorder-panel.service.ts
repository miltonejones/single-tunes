import { Injectable, signal } from '@angular/core';

/**
 * Open/close state for the recorder modal, mirroring SettingsPanelService.
 * `open(seed)` lets a caller (e.g. the artist banner) prefill the search box.
 */
@Injectable({ providedIn: 'root' })
export class RecorderPanelService {
  readonly isOpen = signal(false);
  readonly seedTerm = signal('');
  /** When true, the modal runs the seeded search immediately on open. */
  readonly autoSearch = signal(false);

  open(seedTerm = '', autoSearch = false): void {
    this.seedTerm.set(seedTerm);
    this.autoSearch.set(autoSearch && !!seedTerm);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
