import { ITrackItem } from '../models';

export const TRACK_CREATED_EVENT_TYPE = 'track.created';
export const TRACK_INDEX_JOB_TYPE = 'track.index';
export const TRACK_INDEX_SCHEMA_VERSION = 1;

export interface TrackCreatedEvent {
  type: typeof TRACK_CREATED_EVENT_TYPE;
  version: number;
  occurredAt: string;
  source: 'single-tunes';
  track: {
    id: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface TrackIndexJob {
  jobType: typeof TRACK_INDEX_JOB_TYPE;
  version: number;
  enqueuedAt: string;
  trackId: string;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
}

export interface TrackSearchDocument {
  id: string;
  type: 'track';
  version: number;
  updatedAt: string;
  searchableText: string;
  metadata: {
    ID?: number;
    Title: string;
    FileKey: string;
    albumImage: string | null;
    trackId: unknown;
    Genre: string;
    genreKey: unknown;
    albumFk?: unknown;
    artistFk?: number | null;
    discNumber: number | null;
    trackTime: unknown;
    trackNumber: number | null;
    explicit: unknown;
    artistName: string;
    albumName: string;
  };
}

export function buildTrackCreatedEvent(
  trackId: string | number,
  createdAt: string,
  updatedAt: string,
  occurredAt: string = updatedAt,
): TrackCreatedEvent {
  return {
    type: TRACK_CREATED_EVENT_TYPE,
    version: TRACK_INDEX_SCHEMA_VERSION,
    occurredAt,
    source: 'single-tunes',
    track: {
      id: String(trackId),
      createdAt,
      updatedAt,
    },
  };
}

export function buildTrackIndexJob(event: TrackCreatedEvent, enqueuedAt: string): TrackIndexJob {
  return {
    jobType: TRACK_INDEX_JOB_TYPE,
    version: TRACK_INDEX_SCHEMA_VERSION,
    enqueuedAt,
    trackId: event.track.id,
    createdAt: event.track.createdAt,
    updatedAt: event.track.updatedAt,
    idempotencyKey: buildTrackIndexIdempotencyKey(event.track.id, event.track.updatedAt),
  };
}

export function buildTrackIndexIdempotencyKey(
  trackId: string | number,
  updatedAt: string,
): string {
  return `${TRACK_INDEX_JOB_TYPE}:${hashString(`${trackId}:${updatedAt}`)}`;
}

export function buildTrackSearchDocument(
  track: ITrackItem,
  updatedAt: string,
): TrackSearchDocument {
  return {
    id: `track-${track.ID}`,
    type: 'track',
    version: TRACK_INDEX_SCHEMA_VERSION,
    updatedAt,
    searchableText: normalizeTrackSearchText(track),
    metadata: {
      ID: track.ID,
      Title: normalizeField(track.Title),
      FileKey: track.FileKey,
      albumImage: track.albumImage ?? null,
      trackId: track.trackId,
      Genre: normalizeField(track.Genre),
      genreKey: track.genreKey ?? null,
      albumFk: track.albumFk ?? null,
      artistFk: track.artistFk ?? null,
      discNumber: track.discNumber ?? null,
      trackTime: track.trackTime,
      trackNumber: track.trackNumber ?? null,
      explicit: track.explicit ?? false,
      artistName: normalizeField(track.artistName),
      albumName: normalizeField(track.albumName),
    },
  };
}

export function normalizeTrackSearchText(track: Pick<ITrackItem, 'Title' | 'artistName' | 'albumName' | 'Genre'>): string {
  return [
    `track ${normalizeField(track.Title)}`,
    `artist ${normalizeField(track.artistName)}`,
    `album ${normalizeField(track.albumName)}`,
    `genre ${normalizeField(track.Genre) || 'unknown'}`,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

function normalizeField(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
