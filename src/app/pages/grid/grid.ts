import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import {
  Breadcrumbs,
  BreadcrumbItem,
  CatalogQueryService,
  CoverflowDirective,
  IGridItem,
  ISortProp,
  LoadingAnimation,
  MediaCard,
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
  playlist: { field: 'Title', direction: 'ASC' },
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
  imports: [RouterOutlet, RouterLink, MediaCard, Breadcrumbs, LoadingAnimation, CoverflowDirective],
  templateUrl: './grid.html',
  styleUrl: './grid.css',
})
export class GridPage implements OnInit {
  protected readonly title = signal('grid');

  private route = inject(ActivatedRoute);
  private catalogQuery = inject(CatalogQueryService);

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
    this.route.paramMap.subscribe((params) => {
      const gridType = this.parseGridType(params.get('gridType'));
      const pageNum = Number(params.get('pageNum')) || 1;

      this.gridType.set(gridType);
      this.pageNum.set(pageNum);
      this.sort.set(SORT_DEFAULTS[gridType]);
      this.loadGrid(gridType, pageNum);
    });
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
      .catch((err) => this.error.set(err?.message || 'Failed to load grid'))
      .finally(() => this.loading.set(false));
  }
}
