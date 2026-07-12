import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * AirPlay routes audio through WebKit's own remote-playback picker
 * (`webkitShowPlaybackTargetPicker`), which only exists on Safari/WebKit —
 * this is how iOS gets remote-playback support since Google's Cast Sender
 * SDK never runs there. Unlike Chromecast, WebKit keeps driving the same
 * `<audio>` element and just routes its output elsewhere, so no separate
 * session/mirroring logic is needed here.
 */
@Injectable({ providedIn: 'root' })
export class AirplayService {
  readonly isAvailable$ = new BehaviorSubject(false);
  readonly isConnected$ = new BehaviorSubject(false);

  private audioEl: HTMLAudioElement | null = null;

  constructor(private zone: NgZone) {}

  registerAudioElement(audioEl: HTMLAudioElement): void {
    if (this.audioEl === audioEl) return;
    this.audioEl = audioEl;

    const supported = typeof audioEl.webkitShowPlaybackTargetPicker === 'function';
    this.isAvailable$.next(supported);
    if (!supported) return;

    audioEl.addEventListener('webkitplaybacktargetavailabilitychanged', (event: any) =>
      this.zone.run(() => this.isAvailable$.next(event?.availability === 'available')),
    );

    audioEl.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () =>
      this.zone.run(() => this.isConnected$.next(!!audioEl.webkitCurrentPlaybackTargetIsWireless)),
    );
  }

  showPicker(): void {
    this.audioEl?.webkitShowPlaybackTargetPicker?.();
  }
}

declare global {
  interface HTMLMediaElement {
    webkitShowPlaybackTargetPicker?: () => void;
    webkitCurrentPlaybackTargetIsWireless?: boolean;
  }
}
