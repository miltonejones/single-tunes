import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { CatalogQueryService, IPlaylistSummary } from 'shared-utils';

export interface HomeResolvedData {
  dashItems: Awaited<ReturnType<CatalogQueryService['getDashboard']>>;
  playlists: IPlaylistSummary[];
}

export const homeResolver: ResolveFn<HomeResolvedData> = () => {
  const catalogQuery = inject(CatalogQueryService);
  return Promise.all([
    catalogQuery.getDashboard(),
    catalogQuery.getPlaylists(),
  ]).then(([dashItems, playlists]) => ({ dashItems, playlists }));
};
