import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { IGridResponse } from 'shared-utils';
import { gridResolver } from './grid.resolver';
import {
  Breadcrumbs,
  BreadcrumbItem,
  CatalogQueryService,
  CoverflowDirective,
  IGridItem,
  ISortProp,
  MediaCard,
  OfflineService,
  SkeletonLoader,
} from 'shared-utils';

const PAGE_SIZE = 100;

type GridType = 'artist' | 'album' | 'genre' | 'playlist';

interface SortOption {
  field: string;
  label: string;
}

const GRID_TYPE_LABELS: Record<GridType, string> = {
  artist: 'Artists',
  album: 'Albums',
  genre: 'Genres',
  playlist: 'Playlists',
};

const SORT_DEFAULTS: Record<GridType, ISortProp> = {
  artist: { field: 'Name', direction: 'ASC' },
  album: { field: 'Name', direction: 'ASC' },
  genre: { field: 'Genre', direction: 'ASC' },
  playlist: { field: 'Title', direction: 'DESC' },
};

const SORT_OPTIONS: Record<GridType, SortOption[]> = {
  artist: [
    { field: 'Name', label: 'Name' },
    { field: 'TrackCount', label: 'Tracks' },
  ],
  album: [
    { field: 'Name', label: 'Name' },
    { field: 'artistName', label: 'Artist' },
    { field: 'TrackCount', label: 'Tracks' },
  ],
  genre: [
    { field: 'Genre', label: 'Genre' },
    { field: 'TrackCount', label: 'Tracks' },
  ],
  playlist: [
    { field: 'Title', label: 'Title' },
    { field: 'TrackCount', label: 'Tracks' },
  ],
};

@Component({
  selector: 'app-grid-page',
  imports: [RouterOutlet, RouterLink, MediaCard, Breadcrumbs, CoverflowDirective, SkeletonLoader],
  templateUrl: './grid.html',
  styleUrl: './grid.css',
})
export class GridPage implements OnInit, OnDestroy {
  protected readonly title = signal('grid');

  private route = inject(ActivatedRoute);
  private catalogQuery = inject(CatalogQueryService);
  protected offline = inject(OfflineService);
  private routeSub?: Subscription;

  gridType = signal<GridType>('artist');
  pageNum = signal(1);
  items = signal<IGridItem[]>([]);
  totalCount = signal(0);
  loading = signal(false);
  error = signal('');
  sort = signal<ISortProp>(SORT_DEFAULTS['artist']);

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)));
  sortOptions = computed(() => SORT_OPTIONS[this.gridType()]);

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'] },
    { label: GRID_TYPE_LABELS[this.gridType()] },
  ]);

  ngOnInit(): void {
    this.routeSub = this.route.data.subscribe((data) => {
      const params = this.route.snapshot.paramMap;
      const gridType = this.parseGridType(params.get('gridType'));
      const pageNum = Number(params.get('pageNum')) || 1;
      this.gridType.set(gridType);
      this.pageNum.set(pageNum);
      this.sort.set(SORT_DEFAULTS[gridType]);

      const resolved = data['grid'] as IGridResponse;
      this.items.set(resolved.records);
      this.totalCount.set(resolved.count);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  setSort(field: string): void {
    const current = this.sort();
    const direction =
      current.field === field && current.direction === 'ASC' ? 'DESC' : 'ASC';
    this.sort.set({ field, direction });
    this.loadGrid(this.gridType(), this.pageNum());
  }

  private parseGridType(value: string | null): GridType {
    return value === 'album' || value === 'genre' || value === 'playlist' ? value : 'artist';
  }

  protected goToPage(page: number): void {
    const clamped = Math.max(1, Math.min(page, this.totalPages()));
    if (clamped !== this.pageNum()) {
      this.pageNum.set(clamped);
      this.loadGrid(this.gridType(), clamped);
    }
  }

  private loadGrid(gridType: GridType, pageNum: number): void {
    this.loading.set(true);
    this.error.set('');
    const sort = this.sort();

    let request;
    switch (gridType) {
      case 'album':
        request = this.catalogQuery.getAlbumGrid(pageNum, sort);
        break;
      case 'genre':
        request = this.catalogQuery.getGenreGrid(pageNum, sort);
        break;
      case 'playlist':
        request = this.catalogQuery.getPlaylistGrid(pageNum, sort);
        break;
      default:
        request = this.catalogQuery.getArtistGrid(pageNum, sort);
    }

    request
      .then((res) => {
        this.items.set(res.records);
        this.totalCount.set(res.count);
      })
      .catch(() => {
        if (!this.offline.isOnline()) {
          this.error.set('This content isn\'t available offline. Download tracks to listen offline.');
        } else {
          this.error.set('Failed to load. Check your connection and try again.');
        }
      })
      .finally(() => this.loading.set(false));
  }
}
