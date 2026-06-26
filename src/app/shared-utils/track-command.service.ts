import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TUNE_API_ENDPOINT } from './api-config';
import { ITrackItem, ItunesItem, UpdateTrackRequest } from './models';
import { applyItunesMetadata, stripTrack } from './domain/track';

@Injectable({
  providedIn: 'root',
})
export class TrackCommandService {
  constructor(private http: HttpClient) {}

  /** Finds an existing album/artist by name, or creates one, returning its id. */
  resolveAlbumOrArtistId(
    type: 'album' | 'artist',
    name: string,
    image?: string,
  ): Promise<string> {
    return firstValueFrom(
      this.http.put<string>(`${TUNE_API_ENDPOINT}/find`, { type, name, image }),
    );
  }

  updateTrack(track: UpdateTrackRequest): Promise<unknown> {
    return firstValueFrom(
      this.http.put(`${TUNE_API_ENDPOINT}/update/s3Music`, track),
    );
  }

  /**
   * Applies an iTunes catalog lookup result to a track: merges the metadata,
   * resolves (or creates) its album/artist records, and persists the result.
   */
  async applyAppleLookupResult(itunes: ItunesItem, track: ITrackItem): Promise<ITrackItem> {
    const convertedTrack = applyItunesMetadata(itunes, track);

    const albumFk = await this.resolveAlbumOrArtistId(
      'album',
      itunes.collectionName,
      itunes.artworkUrl100,
    );
    const withAlbum: ITrackItem = { ...convertedTrack, albumFk };

    const artistFk = await this.resolveAlbumOrArtistId(
      'artist',
      itunes.artistName,
      itunes.artworkUrl100,
    );
    const withArtist: ITrackItem = { ...withAlbum, artistFk: Number(artistFk) };

    await this.updateTrack(stripTrack(withArtist));

    return withArtist;
  }
}
