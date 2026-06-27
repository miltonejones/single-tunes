import { Component, inject } from '@angular/core';
import { PodcastCard, PodcastSubscriptionsService } from 'shared-utils';

@Component({
  selector: 'app-podcast-subscriptions',
  imports: [PodcastCard],
  templateUrl: './podcast-subscriptions.html',
  styleUrl: './podcast-subscriptions.css',
})
export class PodcastSubscriptionsPage {
  protected subscriptionsService = inject(PodcastSubscriptionsService);
}
