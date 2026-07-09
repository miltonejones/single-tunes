import { Component, computed, inject } from '@angular/core';
import {
  Breadcrumbs,
  BreadcrumbItem,
  PodcastCard,
  PodcastSubscriptionsService,
} from 'shared-utils';

@Component({
  selector: 'app-podcast-subscriptions',
  imports: [PodcastCard, Breadcrumbs],
  templateUrl: './podcast-subscriptions.html',
  styleUrl: './podcast-subscriptions.css',
})
export class PodcastSubscriptionsPage {
  protected subscriptionsService = inject(PodcastSubscriptionsService);

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'], icon: 'fa-house' },
    { label: 'Podcasts', link: ['/podcasts'], icon: 'fa-podcast' },
    { label: 'Subscriptions', icon: 'fa-rss' },
  ]);
}
