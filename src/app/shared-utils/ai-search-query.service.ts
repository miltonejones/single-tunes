import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AI_SEARCH_ENDPOINT } from './api-config';
import { AiSearchRequest, AiSearchResponse } from './models';

@Injectable({ providedIn: 'root' })
export class AiSearchQueryService {
  private readonly cache = new Map<string, AiSearchResponse>();

  constructor(private http: HttpClient) {}

  search(query: string, limit = 20): Promise<AiSearchResponse> {
    const key = `${query}::${limit}`;
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);

    const body: AiSearchRequest = { query, types: ['track', 'album', 'artist'], limit };
    return firstValueFrom(
      this.http.post<AiSearchResponse>(`${AI_SEARCH_ENDPOINT}/search`, body),
    ).then((result) => {
      this.cache.set(key, result);
      return result;
    });
  }
}
