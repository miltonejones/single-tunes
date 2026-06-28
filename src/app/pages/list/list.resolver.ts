import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { CatalogQueryService, IDetailResponse } from 'shared-utils';

export interface ListResolvedData {
  detail: IDetailResponse;
  bannerImage: string | null;
  bannerName: string | null;
}

export const listResolver: ResolveFn<ListResolvedData> = async (route) => {
  const catalogQuery = inject(CatalogQueryService);
  const listType = route.paramMap.get('listType') ?? null;
  const listId   = route.paramMap.get('listId') ?? null;
  const pageNum  = Number(route.paramMap.get('pageNum')) || 1;

  let detail: IDetailResponse;

  if (!listType && !listId) {
    detail = await catalogQuery.getLibrary(pageNum);
  } else {
    switch (listType) {
      case 'artist':
        detail = await catalogQuery.getArtistDetail(Number(listId), pageNum);
        break;
      case 'genre':
        detail = await catalogQuery.getGenreDetail(listId!, pageNum);
        break;
      case 'playlist':
        detail = await catalogQuery.getPlaylistDetail(listId!, pageNum);
        break;
      default:
        detail = await catalogQuery.getAlbumDetail(Number(listId), pageNum);
    }
  }

  const artistFk = detail.related.records.find((t) => t.artistFk)?.artistFk;
  if (!artistFk) {
    return { detail, bannerImage: null, bannerName: null };
  }

  try {
    const artistRes = await catalogQuery.getArtistDetail(artistFk);
    const artist = artistRes.row[0];
    return { detail, bannerImage: artist?.imageLg ?? null, bannerName: artist?.Name ?? null };
  } catch {
    return { detail, bannerImage: null, bannerName: null };
  }
};
