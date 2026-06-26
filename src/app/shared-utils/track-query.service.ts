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
}
