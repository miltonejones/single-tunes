import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { CatalogQueryService, IGridResponse, ISortProp } from 'shared-utils';

const SORT_DEFAULTS: Record<string, ISortProp> = {
  artist:   { field: 'Name',  direction: 'ASC' },
  album:    { field: 'Name',  direction: 'ASC' },
  genre:    { field: 'Genre', direction: 'ASC' },
  playlist: { field: 'Title', direction: 'DESC' },
};

export const gridResolver: ResolveFn<IGridResponse> = (route) => {
  const catalogQuery = inject(CatalogQueryService);
  const gridType = route.paramMap.get('gridType') ?? 'artist';
  const pageNum = Number(route.paramMap.get('pageNum')) || 1;
  const sort = SORT_DEFAULTS[gridType] ?? SORT_DEFAULTS['artist'];

  switch (gridType) {
    case 'album':    return catalogQuery.getAlbumGrid(pageNum, sort);
    case 'genre':    return catalogQuery.getGenreGrid(pageNum, sort);
    case 'playlist': return catalogQuery.getPlaylistGrid(pageNum, sort);
    default:         return catalogQuery.getArtistGrid(pageNum, sort);
  }
};
