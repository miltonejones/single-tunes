import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  Breadcrumbs,
  BreadcrumbItem,
  IPodcast,
  LoadingAnimation,
  PodcastCard,
  PodcastQueryService,
} from 'shared-utils';

const HISTORY_KEY = 'podcast-search-history';
const MAX_HISTORY = 10;

@Component({
  selector: 'app-podcast-search',
  imports: [PodcastCard, Breadcrumbs, LoadingAnimation, FormsModule],
  templateUrl: './podcast-search.html',
  styleUrl: './podcast-search.css',
})
export class PodcastSearchPage {
  private podcastQuery = inject(PodcastQueryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  query = signal('');
  results = signal<IPodcast[] | null>(null);
  loading = signal(false);
  error = signal('');
  searchHistory = signal<string[]>(this.loadHistory());

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'], icon: 'fa-house' },
    { label: 'Podcasts', link: ['/podcasts'], icon: 'fa-podcast' },
    { label: `Search: "${this.query()}"`, icon: 'fa-magnifying-glass' },
  ]);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const query = decodeURIComponent(params.get('query') || '');
      this.query.set(query);
      this.search(query);
    });
  }

  submitSearch(term: string): void {
    const trimmed = term.trim();
    if (!trimmed) return;
    this.saveHistory(trimmed);
    this.router.navigate(['/podcasts/search', encodeURIComponent(trimmed)]);
  }

  clearHistory(): void {
    this.searchHistory.set([]);
    localStorage.removeItem(HISTORY_KEY);
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

  private loadHistory(): string[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  private saveHistory(term: string): void {
    const updated = [term, ...this.searchHistory().filter((h) => h !== term)].slice(0, MAX_HISTORY);
    this.searchHistory.set(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }
}
