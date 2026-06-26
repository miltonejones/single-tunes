import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { Breadcrumbs, BreadcrumbItem, CatalogQueryService, IGridItem, LoadingAnimation, MediaCard } from 'shared-utils';

const PAGE_SIZE = 100;

type GridType = 'artist' | 'album' | 'genre' | 'playlist';

const GRID_TYPE_LABELS: Record<GridType, string> = {
  artist: 'Artists',
  album: 'Albums',
  genre: 'Genres',
  playlist: 'Playlists',
};

@Component({
  selector: 'app-grid-page',
  imports: [RouterOutlet, RouterLink, MediaCard, Breadcrumbs, LoadingAnimation],
  templateUrl: './grid.html',
  styleUrl: './grid.css'
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

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)));

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
      this.loadGrid(gridType, pageNum);
    });
  }

  private parseGridType(value: string | null): GridType {
    return value === 'album' || value === 'genre' || value === 'playlist' ? value : 'artist';
  }

  private loadGrid(gridType: GridType, pageNum: number): void {
    this.loading.set(true);
    this.error.set('');

    let request;
    switch (gridType) {
      case 'album':
        request = this.catalogQuery.getAlbumGrid(pageNum);
        break;
      case 'genre':
        request = this.catalogQuery.getGenreGrid(pageNum);
        break;
      case 'playlist':
        request = this.catalogQuery.getPlaylistGrid(pageNum);
        break;
      default:
        request = this.catalogQuery.getArtistGrid(pageNum);
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
