import { Injectable, signal } from '@angular/core';
import { IPodcast } from './podcast-models';
import { ToastService } from './toast.service';

const STORAGE_KEY = 'skytunes.podcast.subscriptions';

@Injectable({
  providedIn: 'root',
})
export class PodcastSubscriptionsService {
  private readonly toast: ToastService;

  readonly subscriptions = signal<IPodcast[]>(this.load());

  constructor(toast: ToastService) {
    this.toast = toast;
  }

  isSubscribed(podcast: IPodcast | null | undefined): boolean {
    if (!podcast) return false;
    return this.subscriptions().some((sub) => sub.feedUrl === podcast.feedUrl);
  }

  toggle(podcast: IPodcast): 'subscribed' | 'unsubscribed' {
    const current = this.subscriptions();
    const existingIndex = current.findIndex((sub) => sub.feedUrl === podcast.feedUrl);
    const wasSubscribed = existingIndex >= 0;

    if (wasSubscribed) {
      this.subscriptions.set(current.filter((_, index) => index !== existingIndex));
    } else {
      this.subscriptions.set([...current, podcast]);
    }

    this.persist();
    this.toast.show(`${wasSubscribed ? 'Unsubscribed from' : 'Subscribed to'} "${podcast.collectionName}"`);

    return wasSubscribed ? 'unsubscribed' : 'subscribed';
  }

  private load(): IPodcast[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.subscriptions()));
  }
}
