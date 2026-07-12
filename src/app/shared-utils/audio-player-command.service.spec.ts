import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { AudioPlayerCommandService } from './audio-player-command.service';
import type { ITrackItem } from './models';
import type { SyncState } from './sync.service';

function track(id: number): ITrackItem {
  return {
    ID: id,
    Title: `Track ${id}`,
    FileKey: `k${id}`,
    albumImage: null,
    trackId: id,
    Genre: '',
    genreKey: null,
    discNumber: null,
    trackTime: 0,
    trackNumber: null,
    explicit: false,
    artistName: 'A',
    albumName: 'B',
  };
}

const state: SyncState = {
  leaderInstanceId: 'leader-x',
  updatedAt: 1,
  track: {
    ID: 99,
    Title: 'Mirror Song',
    artistName: 'Mirror Artist',
    albumName: 'Mirror Album',
    FileKey: 'filekey',
    albumImage: null,
    trackTime: 200,
  },
  queue: [
    {
      ID: 99,
      Title: 'Mirror Song',
      artistName: 'Mirror Artist',
      albumName: 'Mirror Album',
      FileKey: 'filekey',
      albumImage: null,
      trackTime: 200,
    },
  ],
  isPlaying: true,
  currentTime: 12,
  duration: 200,
  volume: 0.8,
  muted: false,
  announcement: null,
};

describe('AudioPlayerCommandService.applyMirroredState', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideHttpClient()] }),
  );

  it('sets the current track and queue from the mirrored state', () => {
    const svc = TestBed.inject(AudioPlayerCommandService);
    svc.applyMirroredState(state);
    expect(svc.currentTrack$.value?.ID).toBe(99);
    expect(svc.currentTrack$.value?.Title).toBe('Mirror Song');
    expect(svc.queue$.value).toHaveLength(1);
    expect(svc.queue$.value[0].Title).toBe('Mirror Song');
  });

  it('handles a null track (leader stopped)', () => {
    const svc = TestBed.inject(AudioPlayerCommandService);
    svc.applyMirroredState({ ...state, track: null, queue: [] });
    expect(svc.currentTrack$.value).toBeNull();
    expect(svc.queue$.value).toEqual([]);
  });

  it('does not touch the local leader queue bookkeeping', () => {
    const svc = TestBed.inject(AudioPlayerCommandService);
    // Prime the leader queue with a different track.
    svc.openTrack(
      { Title: 'Local', FileKey: 'k', albumImage: null, trackId: 1, Genre: '', genreKey: null, discNumber: null, trackTime: 0, trackNumber: null, explicit: false, artistName: 'A', albumName: 'B' },
      [],
    );
    // After mirroring, advancing from the mirrored track finds nothing in the
    // local queue (applyMirroredState resets the queue to the mirror's queue).
    svc.applyMirroredState({ ...state, queue: [] });
    expect(svc.advance(1)).toBe(false);
  });
});

describe('AudioPlayerCommandService.advanceOrFetch', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideHttpClient()] }),
  );

  it('advances within the current queue without calling the provider', async () => {
    const svc = TestBed.inject(AudioPlayerCommandService);
    const fetchNextPage = vi.fn().mockResolvedValue([]);
    svc.openTrack(track(1), [track(1), track(2)], fetchNextPage);

    expect(await svc.advanceOrFetch(1)).toBe(true);
    expect(svc.currentTrack$.value?.ID).toBe(2);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('fetches and appends the next page, then advances into it', async () => {
    const svc = TestBed.inject(AudioPlayerCommandService);
    const fetchNextPage = vi.fn().mockResolvedValue([track(2), track(3)]);
    svc.openTrack(track(1), [track(1)], fetchNextPage);

    expect(await svc.advanceOrFetch(1)).toBe(true);
    expect(svc.currentTrack$.value?.ID).toBe(2);
    expect(svc.queue$.value.map((t) => t.ID)).toEqual([1, 2, 3]);
  });

  it('returns false when the provider has no more tracks', async () => {
    const svc = TestBed.inject(AudioPlayerCommandService);
    const fetchNextPage = vi.fn().mockResolvedValue([]);
    svc.openTrack(track(1), [track(1)], fetchNextPage);

    expect(await svc.advanceOrFetch(1)).toBe(false);
  });

  it('returns false with no provider registered', async () => {
    const svc = TestBed.inject(AudioPlayerCommandService);
    svc.openTrack(track(1), [track(1)]);

    expect(await svc.advanceOrFetch(1)).toBe(false);
  });

  it('does not fetch for backward (prev) advancement', async () => {
    const svc = TestBed.inject(AudioPlayerCommandService);
    const fetchNextPage = vi.fn().mockResolvedValue([track(0)]);
    svc.openTrack(track(1), [track(1)], fetchNextPage);

    expect(await svc.advanceOrFetch(-1)).toBe(false);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('discards a stale fetch if the queue was replaced meanwhile', async () => {
    const svc = TestBed.inject(AudioPlayerCommandService);
    let resolveFetch: (tracks: ITrackItem[]) => void;
    const fetchNextPage = vi.fn(
      () => new Promise<ITrackItem[]>((resolve) => (resolveFetch = resolve)),
    );
    svc.openTrack(track(1), [track(1)], fetchNextPage);

    const advancePromise = svc.advanceOrFetch(1);
    // A new track is opened (e.g. the user picked something else) while the fetch is in flight.
    svc.openTrack(track(99), [track(99)]);
    resolveFetch!([track(2)]);

    expect(await advancePromise).toBe(false);
    expect(svc.queue$.value.map((t) => t.ID)).toEqual([99]);
  });
});