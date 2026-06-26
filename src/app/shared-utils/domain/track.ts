import { ITrackItem, ItunesItem, UpdateTrackRequest } from '../models';
import { CLOUD_FRONT_URL } from '../api-config';
import { createKey } from './text';

/** Narrows a full track entity down to the fields the update API accepts. */
export function stripTrack(track: ITrackItem): UpdateTrackRequest {
  const {
    Genre,
    Title,
    albumFk,
    artistFk,
    discNumber,
    trackNumber,
    ID,
    albumImage,
    trackTime,
  } = track;
  return {
    Genre,
    Title,
    albumFk,
    artistFk: artistFk?.toString(),
    discNumber: Number(discNumber),
    trackNumber: Number(trackNumber),
    ID: ID!.toString(),
    trackTime,
    albumImage: albumImage!,
  };
}

/** Merges an iTunes catalog lookup result onto an existing track. */
export function applyItunesMetadata(itunes: ItunesItem, track: ITrackItem): ITrackItem {
  return {
    ...track,
    Title: itunes.trackName,
    trackId: itunes.trackId,
    ID: track.ID || 1,
    albumName: itunes.collectionName,
    albumImage: itunes.artworkUrl100,
    Genre: itunes.primaryGenreName,
    genreKey: createKey(itunes.primaryGenreName),
    discNumber: itunes.discNumber,
    trackTime: itunes.trackTimeMillis,
    trackNumber: itunes.trackNumber,
    artistName: itunes.artistName,
    explicit: false,
  };
}

/** Builds a playable, URL-encoded CloudFront URL for a track's file key. */
export function buildPlayerUrl(fileKey: string): string {
  return `${CLOUD_FRONT_URL}${fileKey}`.replace('#', '%23').replace(/\+/g, '%2B');
}

/** Formats a duration in seconds as m:ss. */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
