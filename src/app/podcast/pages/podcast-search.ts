import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  Breadcrumbs,
  BreadcrumbItem,
  IPodcast,
  LoadingAnimation,
  PodcastCard,
  PodcastQueryService,
} from 'shared-utils';

@Component({
  selector: 'app-podcast-search',
  imports: [PodcastCard, Breadcrumbs, LoadingAnimation],
  templateUrl: './podcast-search.html',
  styleUrl: './podcast-search.css',
})
export class PodcastSearchPage {
  private podcastQuery = inject(PodcastQueryService);
  private route = inject(ActivatedRoute);

  query = signal('');
  results = signal<IPodcast[] | null>(null);
  loading = signal(false);
  error = signal('');

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'] },
    { label: 'Podcasts', link: ['/podcasts'] },
    { label: `Search: "${this.query()}"` },
  ]);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const query = decodeURIComponent(params.get('query') || '');
      this.query.set(query);
      this.search(query);
    });
  }

  private search(term: string): void {
    if (!term) {
      this.results.set([]);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.podcastQuery
      .search(term)
      .then((res) => this.results.set(res.results || []))
      .catch((err) => this.error.set(err?.message || 'Search failed'))
      .finally(() => this.loading.set(false));
  }
}
