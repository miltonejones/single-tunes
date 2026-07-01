export interface ITrackItem {
  ID?: number;
  Title: string;
  FileKey: string;
  albumImage: string | null;
  trackId: any;
  Genre: string;
  genreKey: any;
  albumFk?: any;
  albumArtistFk?: any;
  artistFk?: number | null;
  discNumber: number | null;
  trackTime: any;
  trackNumber: number | null;
  FileSize?: any;
  explicit: any;
  artistName: string;
  albumName: string;
  albumArtistName?: string;
  favorite?: boolean;
  queued?: boolean;
  dedicationName?: string; // Added for song dedication feature
}

export interface UpdateTrackRequest {
  Genre?: string;
  Title?: string;
  albumFk?: string;
  artistFk?: string;
  discNumber?: number;
  trackNumber?: number;
  ID: string;
  trackTime?: number;
  albumImage?: string;
}

export interface ItunesItem {
  wrapperType: string;
  kind: string;
  artistId: number;
  collectionId: number;
  trackId: number;
  artistName: string;
  collectionName: string;
  trackName: string;
  collectionCensoredName: string;
  trackCensoredName: string;
  artistViewUrl: string;
  collectionViewUrl: string;
  trackViewUrl: string;
  previewUrl: string;
  artworkUrl30: string;
  artworkUrl60: string;
  artworkUrl100: string;
  discNumber: number;
  trackNumber: number;
  trackTimeMillis: number;
  primaryGenreName: string;
}

export interface AppleLookupResponse {
  results: ItunesItem[];
}

export interface AnnounceFetchProps {
  artist: string;
  title: string;
  name: string;
  location: string;
}

export type SpeechCallback = (event?: Event, messageContent?: string) => void;

export interface ISortProp {
  field: string;
  direction: 'ASC' | 'DESC';
  filter?: string;
}

export interface DashItem {
  Type: string;
  ID: number;
  Name: string;
  imageLg: string;
  Caption: string;
  Thumbnail: string;
}

export interface IGridItem {
  ID: number | string;
  Name: string | null;
  Thumbnail: string | null;
  TrackCount: number;
  artistName?: string | null;
}

export interface IGridResponse {
  count: number;
  records: IGridItem[];
}

export interface IDetailRow {
  ID: number | string;
  Name?: string | null;
  Genre?: string;
  Thumbnail?: string | null;
  albumImage?: string | null;
  imageLg?: string | null;
  artistName?: string | null;
  TrackCount: number;
}

export interface IDetailResponse {
  row: IDetailRow[];
  related: {
    count: number;
    records: ITrackItem[];
  };
}

export interface IPlaylistSummary {
  listKey: string;
  Title: string;
  TrackCount: number;
  related: string[];
  image?: string | null;
  [key: string]: unknown;
}

// ── AI vector search ──────────────────────────────────────────────────────────

export type AiEntityType = 'track' | 'album' | 'artist';

export interface AiSearchRequest {
  query: string;
  types?: AiEntityType[];
  limit?: number;
}

export interface AiSearchResponse {
  tracks: ITrackItem[];
  albums: IGridItem[];
  artists: IGridItem[];
}

export type AiSearchStatus = 'idle' | 'loading' | 'success' | 'error';