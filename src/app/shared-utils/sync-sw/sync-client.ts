import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { HeartbeatResultMessage } from './sync-messages';

export interface HeartbeatResult {
  leaderInstanceId?: string;
  stale?: boolean;
  state?: any;
}

/**
 * Client-side interface to the sync service worker.
 *
 * Registers the sync SW, sends INIT to start the background heartbeat, and
 * forwards heartbeat results back to SyncService via an observable.
 */
@Injectable({
  providedIn: 'root',
})
export class SyncClient {
  /** Emits each time the SW forwards a heartbeat result. */
  readonly heartbeatResults = new Subject<HeartbeatResult>();

  private registration: ServiceWorkerRegistration | null = null;
  private swReady = false;

  /**
   * Register the sync service worker and start the background heartbeat.
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

      // Send INIT to start the heartbeat.
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

  /** Forward a queue URL to the SW after a successful /sync/register. */
  sendRegister(queueUrl: string): void {
    if (this.registration?.active) {
      this.registration.active.postMessage({
        type: 'REGISTER',
        queueUrl,
      });
    }
  }

  /** True when the SW is registered and ready. */
  get isReady(): boolean {
    return this.swReady;
  }

  /** Clean up — complete the subject. */
  destroy(): void {
    this.heartbeatResults.complete();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private handleMessage(event: MessageEvent): void {
    const msg = event.data as HeartbeatResultMessage;
    if (!msg || msg.type !== 'HEARTBEAT_RESULT') return;

    this.heartbeatResults.next({
      leaderInstanceId: msg.leaderInstanceId,
      stale: msg.stale,
      state: msg.state,
    });
  }
}
