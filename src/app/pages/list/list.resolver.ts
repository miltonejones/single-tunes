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

  // Collect up to 3 distinct artist FKs from the track list
  const seen = new Set<number>();
  const candidateFks: number[] = [];
  for (const t of detail.related.records) {
    const fk = t.artistFk;
    if (fk && !seen.has(fk)) {
      seen.add(fk);
      candidateFks.push(fk);
      if (candidateFks.length >= 3) break;
    }
  }

  // Try each candidate until we find one with an imageLg
  for (const fk of candidateFks) {
    try {
      const artistRes = await catalogQuery.getArtistDetail(fk);
      const artist = artistRes.row[0];
      if (artist?.imageLg) {
        return { detail, bannerImage: artist.imageLg, bannerName: artist?.Name ?? null };
      }
    } catch {
      // skip to next candidate
    }
  }

  return { detail, bannerImage: null, bannerName: null };
};
