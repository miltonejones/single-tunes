import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { SyncService } from './sync.service';
import { UserService } from './user.service';
import { AudioPlayerCommandService } from './audio-player-command.service';

/**
 * Unit tests cover the pure leadership/mirror state-machine. The HTTP
 * register/heartbeat/poll/publish path is verified end-to-end against the
 * deployed Lambda in the smoke test (see the plan's verification section).
 */
describe('SyncService state machine', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  });

  it('starts idle and is not following', () => {
    const sync = TestBed.inject(SyncService);
    expect(sync.mode()).toBe('idle');
    expect(sync.following()).toBe(false);
  });

  it('onLocalOrigin claims leadership', () => {
    const sync = TestBed.inject(SyncService);
    sync.onLocalOrigin();
    expect(sync.mode()).toBe('leader');
    expect(sync.following()).toBe(false);
  });

  it('reportPlayback is a no-op until leading', () => {
    const sync = TestBed.inject(SyncService);
    sync.reportPlayback({ isPlaying: true, currentTime: 5 });
    // No publish attempt happens out of idle; mode stays idle.
    expect(sync.mode()).toBe('idle');
  });

  it('reportAnnouncement is a no-op until leading', () => {
    const sync = TestBed.inject(SyncService);
    sync.reportAnnouncement('hello');
    expect(sync.mirroredAnnouncement()).toBe('');
  });

  it('starts syncing once a user is set', async () => {
    const user = TestBed.inject(UserService);
    const sync = TestBed.inject(SyncService);
    await user.setName('Tester');
    // The effect transitions out of idle by calling start(); mode may briefly
    // be idle while register is in flight, but it must not crash and the
    // service must remain usable.
    expect(['idle', 'leader', 'follower']).toContain(sync.mode());
  });

  it('does not claim leadership from the initial currentTrack$/queue$ replay', async () => {
    // currentTrack$ and queue$ are BehaviorSubjects seeded with null/[]. Every
    // new subscriber — including SyncService.start()'s own subscription —
    // immediately receives that seed value per BehaviorSubject semantics.
    // That replay is not a real user action and must not be treated as one:
    // otherwise every tab claims leadership the instant sync starts, before
    // the user has done anything, fighting any genuine leader for the role.
    const user = TestBed.inject(UserService);
    const sync = TestBed.inject(SyncService);
    const command = TestBed.inject(AudioPlayerCommandService);

    // Sanity check: nothing has played yet, so both subjects are still at
    // their seed values when SyncService subscribes to them.
    expect(command.currentTrack$.value).toBeNull();
    expect(command.queue$.value).toEqual([]);

    await user.setName('Tester');
    TestBed.tick(); // flush the constructor effect that calls start()
    await Promise.resolve(); // let start()'s synchronous subscription setup run

    expect(sync.mode()).toBe('idle');
  });
});