import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { CatalogQueryService, IGridResponse, IPodcast, ITrackItem, PodcastQueryService } from 'shared-utils';

export interface SearchResolvedData {
  artists: IGridResponse;
  albums: IGridResponse;
  tracks: { count: number; records: ITrackItem[] };
  podcasts: IPodcast[];
}

export const searchResolver: ResolveFn<SearchResolvedData> = (route) => {
  const catalogQuery = inject(CatalogQueryService);
  const podcastQuery = inject(PodcastQueryService);
  const query = route.paramMap.get('query') ?? '';

  return Promise.all([
    catalogQuery.getSearch('artist', query),
    catalogQuery.getSearch('album', query),
    catalogQuery.getSearch('music', query),
    podcastQuery.search(query).catch(() => ({ resultCount: 0, results: [] as IPodcast[] })),
  ]).then(([artists, albums, tracks, podcastRes]) => ({
    artists,
    albums,
    tracks,
    podcasts: podcastRes.results ?? [],
  }));
};
