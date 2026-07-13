import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TriviaPanelService {
  isOpen = signal(false);
  text = signal('');

  open(text: string): void {
    this.text.set(text);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
