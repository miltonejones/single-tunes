export interface IPodcast {
  wrapperType?: string;
  kind?: string;
  artistId?: number;
  collectionId?: number;
  trackId?: number;
  artistName?: string;
  collectionName?: string;
  trackName?: string;
  collectionCensoredName?: string;
  trackCensoredName?: string;
  artistViewUrl?: string;
  collectionViewUrl?: string;
  feedUrl?: string;
  trackViewUrl?: string;
  artworkUrl30?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  collectionPrice?: number;
  trackPrice?: number;
  collectionHdPrice?: number;
  releaseDate?: string;
  collectionExplicitness?: string;
  trackExplicitness?: string;
  trackCount?: number;
  trackTimeMillis?: number;
  country?: string;
  currency?: string;
  primaryGenreName?: string;
  contentAdvisoryRating?: string;
  artworkUrl600?: string;
  genreIds?: string[];
  genres?: string[];
}

export interface IPodcastResponse {
  resultCount: number;
  results: IPodcast[];
}

export interface Enclosure {
  url: string;
  type: string;
  length: string;
}

export interface ParsedEpisode {
  title: string;
  description: string;
  pubDate: string;
  link: string;
  guid: string;
  enclosure: Enclosure | null;
  duration: string;
  author: string;
}

export interface ITrack {
  title: string;
  audioUrl: string;
  guid: string;
  description: string;
  duration: string;
  episode: ParsedEpisode;
  /** Source podcast's feedUrl, used to find "in progress" episodes for a podcast card. */
  podcastFeedUrl: string;
}

export interface ITrackMemory {
  progress: number;
  podcastFeedUrl: string;
  /** Local write time (epoch ms), used to reconcile against the server's updatedAt on sync. */
  updatedAt?: number;
}

export interface PaginationResult {
  visible: ParsedEpisode[];
  pageCount: number;
  startNum: number;
}

export interface ISortOption {
  field: 'title' | 'pubDate';
  ascOffset: 1 | -1;
}
