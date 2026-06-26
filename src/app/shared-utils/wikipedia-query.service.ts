import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { WIKIMEDIA_SEARCH_ENDPOINT } from './api-config';

@Injectable({
  providedIn: 'root',
})
export class WikipediaQueryService {
  constructor(private http: HttpClient) {}

  search(searchParam: string, searchLimit: number = 2): Promise<unknown> {
    return firstValueFrom(
      this.http.get(WIKIMEDIA_SEARCH_ENDPOINT, {
        params: { q: searchParam, limit: searchLimit },
      }),
    );
  }
}
