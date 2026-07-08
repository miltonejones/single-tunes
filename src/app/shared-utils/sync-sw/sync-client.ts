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
 * Client-side interface to the sync engine running inside the main service
 * worker (/sw.js). Does NOT register its own SW — it communicates with the
 * already-active SW via postMessage.
 */
@Injectable({
  providedIn: 'root',
})
export class SyncClient {
  /** Emits each time the SW broadcasts a full state update. */
  readonly stateUpdates$ = new Subject<SyncState>();

  /** Emits when the SW changes this tab's leadership mode. */
  readonly modeChanges$ = new Subject<'leader' | 'follower' | 'idle'>();

  /** Emits each time the SW forwards a heartbeat result. */
  readonly heartbeatResults = new Subject<HeartbeatResult>();

  private swReady = false;

  /**
   * Wait for the main SW to be ready and send INIT to start the sync engine.
   * Rejects if SW are unsupported or no SW is active.
   */
  async init(userKey: string, instanceId: string): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers not supported');
    }

    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) {
      throw new Error('No active service worker');
    }

    this.swReady = true;

    // Listen for messages from the SW.
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(event);
    });

    // Send INIT to start the sync engine inside the main SW.
    reg.active.postMessage({ type: 'INIT', userKey, instanceId });
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

  /** True when the SW is ready. */
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
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
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
