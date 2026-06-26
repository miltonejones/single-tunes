import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TUNE_API_ENDPOINT } from './api-config';
import { IPlaylistSummary } from './models';

@Injectable({
  providedIn: 'root',
})
export class CatalogCommandService {
  constructor(private http: HttpClient) {}

  updateArtist(imageLg: string, ID: number, iArtistID: number | undefined): Promise<unknown> {
    return firstValueFrom(
      this.http.put(`${TUNE_API_ENDPOINT}/update/s3Artist`, { imageLg, ID, iArtistID }),
    );
  }

  savePlaylist(playlist: IPlaylistSummary): Promise<unknown> {
    return firstValueFrom(this.http.put(`${TUNE_API_ENDPOINT}/playlist`, playlist));
  }
}
