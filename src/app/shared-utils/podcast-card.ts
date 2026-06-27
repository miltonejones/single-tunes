import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { PodcastAudioPlayerCommandService } from './podcast-audio-player-command.service';
import { IPodcast } from './podcast-models';
import { PodcastSelectionService } from './podcast-selection.service';
import { PodcastSubscriptionsService } from './podcast-subscriptions.service';
import { PodcastToastService } from './podcast-toast.service';

@Component({
  selector: 'lib-podcast-card',
  imports: [],
  templateUrl: './podcast-card.html',
  styleUrl: './podcast-card.css',
})
export class PodcastCard {
  podcast = input.required<IPodcast>();

  private router = inject(Router);
  private podcastSelection = inject(PodcastSelectionService);
  private subscriptions = inject(PodcastSubscriptionsService);
  private audioPlayerCommand = inject(PodcastAudioPlayerCommandService);
  private toast = inject(PodcastToastService);

  get subscribed(): boolean {
    return this.subscriptions.isSubscribed(this.podcast());
  }

  get progress(): number {
    return this.audioPlayerCommand.getPodcastProgress(this.podcast().feedUrl || '');
  }

  open(): void {
    const podcast = this.podcast();
    this.podcastSelection.select(podcast);
    this.router.navigate(['/podcasts/detail', encodeURIComponent(podcast.feedUrl || '')]);
  }

  toggleSubscribe(event: Event): void {
    event.stopPropagation();
    const podcast = this.podcast();
    const result = this.subscriptions.toggle(podcast);
    this.toast.alert(`${result === 'subscribed' ? 'Subscribed to' : 'Unsubscribed from'} "${podcast.collectionName}"`);
  }
}
