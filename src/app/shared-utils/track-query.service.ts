import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TUNE_API_ENDPOINT } from './api-config';
import { AppleLookupResponse } from './models';

@Injectable({
  providedIn: 'root',
})
export class TrackQueryService {
  constructor(private http: HttpClient) {}

  searchAppleCatalog(searchTerm: string): Promise<AppleLookupResponse> {
    return firstValueFrom(
      this.http.get<AppleLookupResponse>(
        `${TUNE_API_ENDPOINT}/apple/${encodeURIComponent(searchTerm)}`,
      ),
    );
  }

  /**
   * Search for all tracks on an album using the Apple Search API
   * @param albumName The name of the album to search for
   * @param artistName The name of the artist (optional but improves accuracy)
   * @returns Promise with AppleLookupResponse containing all tracks
   */
  searchAppleAlbumTracks(albumName: string, artistName?: string): Promise<AppleLookupResponse> {
    // Construct search term with album and artist for better accuracy
    const searchTerm = artistName ? `${albumName} ${artistName}` : albumName;
    return firstValueFrom(
      this.http.get<AppleLookupResponse>(
        `${TUNE_API_ENDPOINT}/apple/${encodeURIComponent(searchTerm)}`,
      ),
    );
  }
}
