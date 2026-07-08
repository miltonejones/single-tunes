import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import {
  HeartbeatResultMessage,
  StateUpdateMessage,
  ModeMessage,
} from './sync-messages';

export interface HeartbeatResult {
  leaderInstanceId?: string;
  stale?: boolean;
  state?: any;
}

export interface SyncState {
  leaderInstanceId: string;
  updatedAt: number;
  track: any;
  queue: any[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  announcement: { text: string; ts: number } | null;
}

/**
 * Client-side interface to the sync service worker.
 *
 * Registers the sync SW, sends INIT to start the background sync engine,
 * relays tab→SW actions, and exposes SW→tab state/mode updates as observables.
 */
@Injectable({
  providedIn: 'root',
})
export class SyncClient {
  /** Emits each time the SW broadcasts a full state update. */
  readonly stateUpdates$ = new Subject<SyncState>();

  /** Emits when the SW changes this tab's leadership mode. */
  readonly modeChanges$ = new Subject<'leader' | 'follower' | 'idle'>();

  /** Emits each time the SW forwards a heartbeat result (existing). */
  readonly heartbeatResults = new Subject<HeartbeatResult>();

  private registration: ServiceWorkerRegistration | null = null;
  private swReady = false;

  /**
   * Register the sync service worker and start the background sync engine.
   * Resolves when the SW is active and INIT has been sent.
   * Rejects if SW are unsupported or registration fails.
   */
  async init(userKey: string, instanceId: string): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers not supported');
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sync-service-worker.js', {
        scope: '/',
      });

      await navigator.serviceWorker.ready;
      this.swReady = true;

      // Listen for messages from the SW.
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
        this.handleMessage(event);
      });

      // Send INIT to start the sync engine.
      if (this.registration.active) {
        this.registration.active.postMessage({
          type: 'INIT',
          userKey,
          instanceId,
        });
      }
    } catch (error) {
      this.swReady = false;
      throw error;
    }
  }

  // ── Tab → SW ──────────────────────────────────────────────────────────────

  /** Send a user action (play, pause, skip, track change) to the SW. */
  sendUserAction(action: {
    track?: any;
    queue?: any[];
    isPlaying?: boolean;
  }): void {
    this.postToSw({ type: 'USER_ACTION', ...action });
  }

  /** Send periodic playback position/volume state to the SW. */
  sendPlaybackState(state: {
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
    isPlaying: boolean;
  }): void {
    this.postToSw({ type: 'PLAYBACK_STATE', ...state });
  }

  /** Send an announcement text to the SW for fan-out. */
  sendAnnouncement(text: string): void {
    this.postToSw({ type: 'ANNOUNCEMENT', text });
  }

  /** Forward a queue URL to the SW after a re-registration (fallback). */
  sendRegister(queueUrl: string): void {
    this.postToSw({ type: 'REGISTER', queueUrl });
  }

  /** True when the SW is registered and ready. */
  get isReady(): boolean {
    return this.swReady;
  }

  /** Clean up — complete all subjects. */
  destroy(): void {
    this.stateUpdates$.complete();
    this.modeChanges$.complete();
    this.heartbeatResults.complete();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private postToSw(message: any): void {
    if (this.registration?.active) {
      this.registration.active.postMessage(message);
    }
  }

  private handleMessage(event: MessageEvent): void {
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'STATE_UPDATE':
        this.stateUpdates$.next((msg as StateUpdateMessage).state);
        break;
      case 'MODE':
        this.modeChanges$.next((msg as ModeMessage).mode);
        break;
      case 'HEARTBEAT_RESULT':
        this.heartbeatResults.next({
          leaderInstanceId: (msg as HeartbeatResultMessage).leaderInstanceId,
          stale: (msg as HeartbeatResultMessage).stale,
          state: (msg as HeartbeatResultMessage).state,
        });
        break;
    }
  }
}
