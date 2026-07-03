import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { CatalogQueryService, IPlaylistSummary, ITrackItem } from 'shared-utils';

const RECENTLY_ADDED_COUNT = 12;

export interface HomeResolvedData {
  dashItems: Awaited<ReturnType<CatalogQueryService['getDashboard']>>;
  playlists: IPlaylistSummary[];
  recentlyAdded: ITrackItem[];
}

export const homeResolver: ResolveFn<HomeResolvedData> = () => {
  const catalogQuery = inject(CatalogQueryService);
  return Promise.all([
    catalogQuery.getDashboard(),
    catalogQuery.getPlaylists(),
    catalogQuery.getLibrary(1),
  ]).then(([dashItems, playlists, library]) => ({
    dashItems,
    playlists,
    recentlyAdded: library.related.records.slice(0, RECENTLY_ADDED_COUNT),
  }));
};
