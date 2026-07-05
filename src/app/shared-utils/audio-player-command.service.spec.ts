import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { AudioPlayerCommandService } from './audio-player-command.service';
import type { SyncState } from './sync.service';

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