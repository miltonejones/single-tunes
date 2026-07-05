import { Injectable } from '@angular/core';
import { SyncMessage, InitMessage, UserActionMessage } from './sync-messages';

@Injectable({
  providedIn: 'root'
})
export class SyncClient {
  private registration: ServiceWorkerRegistration | null = null;
  private messageQueue: SyncMessage[] = [];
  private isReady = false;

  async init(userKey: string, instanceId: string): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service workers not supported');
      return;
    }

    try {
      // Register the service worker
      this.registration = await navigator.serviceWorker.register('/sync-service-worker.js');

      // Wait for the service worker to be ready
      await navigator.serviceWorker.ready;
      this.isReady = true;

      // Send initialization message
      const initMessage: InitMessage = {
        type: 'INIT',
        userKey,
        instanceId
      };

      this.sendMessage(initMessage);

      // Process any queued messages
      this.processMessageQueue();

    } catch (error) {
      console.error('Failed to initialize service worker:', error);
    }
  }

  private sendMessage(message: SyncMessage): void {
    if (this.isReady && this.registration?.active) {
      this.registration.active.postMessage(message);
    } else {
      // Queue the message for later
      this.messageQueue.push(message);
    }
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isReady && this.registration?.active) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
  }

  sendUserAction(action: string, data?: any): void {
    const message: UserActionMessage = {
      type: 'USER_ACTION',
      action,
      data
    };

    this.sendMessage(message);
  }

  // Add more methods for other message types as needed
}