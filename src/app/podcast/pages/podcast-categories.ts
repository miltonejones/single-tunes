import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  Breadcrumbs,
  BreadcrumbItem,
  IPodcast,
  LoadingAnimation,
  PodcastCard,
  PodcastQueryService,
} from 'shared-utils';

const MIN_GROUP_SIZE = 5;

@Component({
  selector: 'app-podcast-categories',
  imports: [PodcastCard, Breadcrumbs, LoadingAnimation],
  templateUrl: './podcast-categories.html',
  styleUrl: './podcast-categories.css',
})
export class PodcastCategoriesPage implements OnInit {
  private podcastQuery = inject(PodcastQueryService);

  podcasts = signal<IPodcast[] | null>(null);
  loading = signal(false);
  error = signal('');

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'] },
    { label: 'Podcasts', link: ['/podcasts'] },
    { label: 'Categories' },
  ]);

  groups = computed(() => {
    const byGenre = (this.podcasts() || []).reduce<Record<string, IPodcast[]>>((out, podcast) => {
      const genre = podcast.primaryGenreName || 'unknown';
      out[genre] = (out[genre] || []).concat(podcast);
      return out;
    }, {});

    return Object.entries(byGenre).filter(([, podcasts]) => podcasts.length > MIN_GROUP_SIZE);
  });

  ngOnInit(): void {
    this.loading.set(true);
    this.podcastQuery
      .search('popular')
      .then((res) => this.podcasts.set(res.results || []))
      .catch((err) => this.error.set(err?.message || 'Failed to load categories'))
      .finally(() => this.loading.set(false));
  }
}
