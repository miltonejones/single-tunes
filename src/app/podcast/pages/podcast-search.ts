import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IPodcast, PodcastCard, PodcastQueryService } from 'shared-utils';

@Component({
  selector: 'app-podcast-search',
  imports: [PodcastCard],
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
