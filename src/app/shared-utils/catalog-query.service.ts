import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import { PHOTO_ENDPOINT, TUNE_API_ENDPOINT } from './api-config';
import { DashItem, IArtistBio, IDetailResponse, IGridResponse, IPlaylistSummary, ISortProp, ITrackItem } from './models';
import { buildAppendFilterPath, buildSwitchedFilterPath } from './domain/listing';
import { createKey } from './domain/text';

@Injectable({
  providedIn: 'root',
})
export class CatalogQueryService {
  private readonly dashCache = new Map<string, Promise<DashItem[]>>();

  constructor(private http: HttpClient) {}

  getDashboard(): Promise<DashItem[]> {
    const url = `${TUNE_API_ENDPOINT}/dash`;
    if (!this.dashCache.has(url)) {
      this.dashCache.set(url, firstValueFrom(this.http.get<DashItem[]>(url)));
    }
    return this.dashCache.get(url)!;
  }

  /** Fetches an artist's editorial bio + hero image, keyed by the internal artistFk. */
  async getExtendedArtistDetail(id: number): Promise<IArtistBio> {
    const storageKey = `extendedArtistDetail_${id}`;

    const cachedData = localStorage.getItem(storageKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const detail: any = await firstValueFrom(
      this.http.get(`${TUNE_API_ENDPOINT}/request/discNumber,trackNumber/ASC/1/artist/${id}`),
    );
    const [row] = detail.row;
    const { iArtistID } = row;
    if (!iArtistID) {
      return {};
    }

    const detailData = await firstValueFrom(
      this.http.post<IArtistBio>(`${PHOTO_ENDPOINT}artist`, { id: iArtistID }),
    );

    localStorage.setItem(storageKey, JSON.stringify(detailData));
    return detailData;
  }

  getAlbumDetail(
    id: number,
    page: number = 1,
    sort: ISortProp = { field: 'discNumber,trackNumber', direction: 'ASC' },
  ): Promise<IDetailResponse> {
    return firstValueFrom(
      this.http.get<IDetailResponse>(
        `${TUNE_API_ENDPOINT}${buildAppendFilterPath('album', sort, page, id)}`,
      ),
    );
  }

  getGenreDetail(
    id: string,
    page: number = 1,
    sort: ISortProp = { field: 'artistName', direction: 'ASC' },
  ): Promise<IDetailResponse> {
    // Replace forward slashes with asterisks — the API uses * as a
    // separator-safe stand-in for / in genre names (e.g. "Hip-Hop*Rap")
    const safeId = id.replace(/\//g, '*');
    return firstValueFrom(
      this.http.get<IDetailResponse>(
        `${TUNE_API_ENDPOINT}${buildAppendFilterPath('genre', sort, page, safeId)}`,
      ),
    );
  }

  getPlaylistDetail(
    id: string,
    page: number = 1,
    sort: ISortProp = { field: 'trackNumber', direction: 'DESC' },
  ): Promise<IDetailResponse> {
    return firstValueFrom(
      this.http.get<IDetailResponse>(
        `${TUNE_API_ENDPOINT}${buildAppendFilterPath('playlist', sort, page, id)}`,
      ),
    );
  }

  getArtistDetail(
    id: number,
    page: number = 1,
    sort: ISortProp = { field: 'artistName', direction: 'ASC' },
  ): Promise<IDetailResponse> {
    return firstValueFrom(
      this.http.get<IDetailResponse>(
        `${TUNE_API_ENDPOINT}${buildAppendFilterPath('artist', sort, page, id)}`,
      ),
    );
  }

  getLibrary(
    page: number,
    sort: ISortProp = { field: 'ID', direction: 'DESC' },
    cacheBust = false,
  ): Promise<IDetailResponse> {
    let url = `${TUNE_API_ENDPOINT}${buildAppendFilterPath('music', sort, page)}`;
    if (cacheBust) {
      url += `?_t=${Date.now()}`;
    }
    return firstValueFrom(
      this.http
        .get<{ count: number; records: ITrackItem[] }>(url)
        .pipe(map((related) => ({ row: [], related }))),
    );
  }

  getAlbumGrid(
    page: number = 1,
    sort: ISortProp = { field: 'Name', direction: 'ASC' },
  ): Promise<IGridResponse> {
    return firstValueFrom(
      this.http.get<IGridResponse>(
        `${TUNE_API_ENDPOINT}${buildSwitchedFilterPath('album', sort, page)}`,
      ),
    );
  }

  getArtistGrid(
    page: number = 1,
    sort: ISortProp = { field: 'Name', direction: 'ASC' },
  ): Promise<IGridResponse> {
    return firstValueFrom(
      this.http.get<IGridResponse>(
        `${TUNE_API_ENDPOINT}${buildSwitchedFilterPath('artist', sort, page)}`,
      ),
    );
  }

  getGenreGrid(
    page: number = 1,
    sort: ISortProp = { field: 'Genre', direction: 'ASC' },
  ): Promise<IGridResponse> {
    return firstValueFrom(
      this.http
        .get<{
          count: number;
          records: Array<{ ID: string; Genre: string; TrackCount: number; albumImage: string | null }>;
        }>(`${TUNE_API_ENDPOINT}${buildSwitchedFilterPath('genre', sort, page)}`)
        .pipe(
          map(({ count, records }) => ({
            count,
            records: records.map(({ ID, Genre, TrackCount, albumImage }) => ({
              ID,
              Name: Genre,
              Thumbnail: albumImage,
              TrackCount,
            })),
          })),
        ),
    );
  }

  /**
   * Unlike the other `*Grid` endpoints, the playlist endpoint ignores the page
   * segment and always returns every playlist in one response, so pagination
   * has to be applied client-side to the full result instead of trusting the
   * server's `count`/`records` for the requested page.
   */
  getPlaylistGrid(
    page: number = 1,
    sort: ISortProp = { field: 'Title', direction: 'ASC' },
    pageSize: number = 100,
  ): Promise<IGridResponse> {
    return firstValueFrom(
      this.http
        .get<{
          count: number;
          records: Array<{ Title: string; image: string | null; TrackCount: number; listKey?: string }>;
        }>(`${TUNE_API_ENDPOINT}${buildSwitchedFilterPath('playlist', sort, 1)}`)
        .pipe(
          map(({ records }) => {
            const mapped = records.map(({ Title, image, TrackCount, listKey }) => ({
              ID: listKey || createKey(Title),
              Name: Title,
              Thumbnail: image,
              TrackCount,
            }));
            const start = (page - 1) * pageSize;
            return { count: mapped.length, records: mapped.slice(start, start + pageSize) };
          }),
        ),
    );
  }

  /**
   * Fetches every playlist (with its member track FileKeys), assuming they all fit on one page.
   * Preserves every field on each raw record (not just the ones we read) so a playlist object
   * can be safely mutated and PUT back via `CatalogCommandService.savePlaylist` without losing data.
   */
  getPlaylists(
    sort: ISortProp = { field: 'Title', direction: 'ASC' },
  ): Promise<IPlaylistSummary[]> {
    return firstValueFrom(
      this.http
        .get<{
          count: number;
          records: Array<
            Record<string, unknown> & { Title: string; TrackCount: number; listKey?: string; related?: string[] }
          >;
        }>(`${TUNE_API_ENDPOINT}${buildSwitchedFilterPath('playlist', sort, 1)}`)
        .pipe(
          map(({ records }) =>
            records.map((record) => ({
              ...record,
              listKey: record.listKey || createKey(record.Title),
              related: record.related ?? [],
            })),
          ),
        ),
    );
  }

  getTrackDetail(id: string): Promise<unknown> {
    return firstValueFrom(this.http.get(`${TUNE_API_ENDPOINT}/track/${id}`));
  }

  getSearch(type: 'music', param: string): Promise<{ count: number; records: ITrackItem[] }>;
  getSearch(type: 'artist' | 'album', param: string): Promise<IGridResponse>;
  getSearch(type: string, param: string): Promise<{ count: number; records: unknown[] }> {
    return firstValueFrom(
      this.http.get<{ count: number; records: unknown[] }>(
        `${TUNE_API_ENDPOINT}/search/1/${type}/${encodeURIComponent(param)}`,
      ),
    );
  }

  getImageLg(address: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${PHOTO_ENDPOINT}lookup`, { address }));
  }

  /** Fetches an artist image from iTunes via the photo endpoint. */
  fetchArtistImage(iArtistID: number): Promise<{ messageContent?: string }> {
    return firstValueFrom(
      this.http.post<{ messageContent?: string }>(`${PHOTO_ENDPOINT}artist`, { id: iArtistID }),
    );
  }
}
