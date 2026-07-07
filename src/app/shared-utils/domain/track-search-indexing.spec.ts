import {
  buildTrackCreatedEvent,
  buildTrackIndexIdempotencyKey,
  buildTrackIndexJob,
  buildTrackSearchDocument,
} from './track-search-indexing';
import type { ITrackItem } from '../models';

const track: ITrackItem = {
  ID: 42,
  Title: '  My Song!!!  ',
  FileKey: 'music/my-song.mp3',
  albumImage: 'cover.png',
  trackId: 99,
  Genre: '  Alt   Rock ',
  genreKey: 'alt-rock',
  albumFk: '12',
  artistFk: 34,
  discNumber: 1,
  trackTime: 210000,
  trackNumber: 7,
  explicit: false,
  artistName: ' The   Artist ',
  albumName: ' The Album ',
};

describe('track search indexing helpers', () => {
  it('builds a normalized searchable track document', () => {
    const doc = buildTrackSearchDocument(track, '2026-07-05T23:00:00.000Z');

    expect(doc).toMatchObject({
      id: 'track-42',
      type: 'track',
      updatedAt: '2026-07-05T23:00:00.000Z',
      searchableText: 'track my song artist the artist album the album genre alt rock',
    });
    expect(doc.metadata).toMatchObject({
      Title: 'my song',
      artistName: 'the artist',
      albumName: 'the album',
      Genre: 'alt rock',
    });
  });

  it('uses a stable idempotency key for the same track version', () => {
    const first = buildTrackIndexIdempotencyKey('42', '2026-07-05T23:00:00.000Z');
    const second = buildTrackIndexIdempotencyKey(42, '2026-07-05T23:00:00.000Z');
    const changed = buildTrackIndexIdempotencyKey('42', '2026-07-05T23:01:00.000Z');

    expect(first).toBe(second);
    expect(changed).not.toBe(first);
  });

  it('derives queue jobs from stable track.created payloads', () => {
    const event = buildTrackCreatedEvent(
      42,
      '2026-07-05T22:59:00.000Z',
      '2026-07-05T23:00:00.000Z',
      '2026-07-05T23:00:01.000Z',
    );
    const job = buildTrackIndexJob(event, '2026-07-05T23:00:02.000Z');

    expect(event).toEqual({
      type: 'track.created',
      version: 1,
      occurredAt: '2026-07-05T23:00:01.000Z',
      source: 'single-tunes',
      track: {
        id: '42',
        createdAt: '2026-07-05T22:59:00.000Z',
        updatedAt: '2026-07-05T23:00:00.000Z',
      },
    });
    expect(job).toMatchObject({
      jobType: 'track.index',
      trackId: '42',
      createdAt: '2026-07-05T22:59:00.000Z',
      updatedAt: '2026-07-05T23:00:00.000Z',
      enqueuedAt: '2026-07-05T23:00:02.000Z',
    });
    expect(job.idempotencyKey).toBe(buildTrackIndexIdempotencyKey('42', '2026-07-05T23:00:00.000Z'));
  });
});
