import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PODCAST_SEARCH_ENDPOINT, RSS_FEED_ENDPOINT } from './podcast-api-config';
import { IPodcastResponse, ParsedEpisode } from './podcast-models';
import { getChannelDescription, parseRssFeed } from './domain/podcast-rss';

export interface IPodcastFeed {
  episodes: ParsedEpisode[];
  description: string;
}

@Injectable({
  providedIn: 'root',
})
export class PodcastQueryService {
  constructor(private http: HttpClient) {}

  /** Searches the iTunes podcast directory for the given term. */
  search(term: string): Promise<IPodcastResponse> {
    return firstValueFrom(
      this.http.get<IPodcastResponse>(`${PODCAST_SEARCH_ENDPOINT}?term=${encodeURIComponent(term)}`),
    );
  }

  /** Fetches a podcast's RSS feed (via the RSS-to-JSON lambda) and returns its parsed episodes + description. */
  async getFeed(feedUrl: string): Promise<IPodcastFeed> {
    const raw = await firstValueFrom(
      this.http.post(RSS_FEED_ENDPOINT, { url: feedUrl }, { responseType: 'text' }),
    );
    return { episodes: parseRssFeed(raw), description: getChannelDescription(raw) };
  }
}
