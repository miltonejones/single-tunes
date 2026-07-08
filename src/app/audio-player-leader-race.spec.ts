import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AudioPlayer } from './audio-player';
import { AudioAnalyserService } from './audio-analyser.service';
import {
  AnnouncementCommandService,
  AudioPlayerCommandService,
  ITrackItem,
  SyncService,
  TrackDownloadService,
} from 'shared-utils';

/**
 * Isolates the theory that AudioPlayer's "Leadership changes" effect
 * (constructor, keyed off sync.mode()) can redundantly reload the <audio>
 * element — resetting playback to position 0 — merely because the current
 * track signal changes while this tab is already the leader, independent of
 * any actual leadership hand-off. The normal currentTrack$ subscription in
 * ngOnInit already owns loading a newly-selected track; this effect should
 * only act on a genuine idle/follower -> leader transition.
 */
function track(id: number): ITrackItem {
  return {
    ID: id,
    Title: `Track ${id}`,
    FileKey: `key-${id}`,
    albumImage: null,
    trackId: id,
    Genre: '',
    genreKey: null,
    discNumber: null,
    trackTime: 200,
    trackNumber: null,
    explicit: false,
    artistName: 'Artist',
    albumName: 'Album',
  };
}

describe('AudioPlayer leadership-changes effect race', () => {
  let originalServiceWorker: any;
  let originalSpeechSynthesis: any;

  beforeEach(() => {
    localStorage.clear();

    originalSpeechSynthesis = (window as any).speechSynthesis;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        pending: false,
        paused: false,
        speak: () => {},
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        getVoices: () => [],
      },
    });
    // Stub enough of the ServiceWorker container that SyncClient/SyncService
    // fail gracefully ("running unsynced") instead of throwing — leadership
    // (sync.mode()) is driven directly via onLocalOrigin() in this test, not
    // through the SW round-trip.
    originalServiceWorker = (navigator as any).serviceWorker;
    const notReady = Promise.reject(new Error('no SW in test env'));
    notReady.catch(() => {}); // pre-handled here; SyncService awaits/catches its own copy
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        ready: notReady,
        addEventListener: () => {},
      },
    });

    TestBed.configureTestingModule({
      imports: [AudioPlayer],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: originalServiceWorker,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: originalSpeechSynthesis,
    });
  });

  it('does not reload the <audio> element a second time on a normal track advance while already leading', async () => {
    // Stub the Web Audio analyser graph (not implemented in the test DOM) and
    // the TTS announcer (network + speechSynthesis) — neither is relevant to
    // the leadership-effect race under test.
    const analyser = TestBed.inject(AudioAnalyserService);
    vi.spyOn(analyser, 'initialize').mockReturnValue({} as AnalyserNode);
    const announcement = TestBed.inject(AnnouncementCommandService);
    vi.spyOn(announcement, 'announceTrackChange').mockResolvedValue(false);

    const fixture = TestBed.createComponent(AudioPlayer);
    fixture.detectChanges();

    const sync = TestBed.inject(SyncService);
    const command = TestBed.inject(AudioPlayerCommandService);
    const download = TestBed.inject(TrackDownloadService);

    // Avoid real network for the audio src.
    vi.spyOn(download, 'getAudioSrc').mockResolvedValue({ src: 'blob:track-a', isBlob: false });

    // Track how many times the <audio> element's src is (re)assigned.
    const audioEl: HTMLAudioElement = (fixture.componentInstance as any).audioElRef.nativeElement;
    const srcWrites: string[] = [];
    let currentSrc = '';
    Object.defineProperty(audioEl, 'src', {
      configurable: true,
      get: () => currentSrc,
      set: (v: string) => {
        currentSrc = v;
        srcWrites.push(v);
      },
    });
    audioEl.play = vi.fn().mockResolvedValue(undefined);
    audioEl.pause = vi.fn();

    // Become leader the same way a real user action does.
    sync.onLocalOrigin();
    expect(sync.mode()).toBe('leader');

    // Select the first track — the normal ngOnInit subscription path.
    command.openTrack(track(1), [track(1), track(2)]);
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();

    const writesAfterFirstTrack = srcWrites.length;
    expect(writesAfterFirstTrack).toBeGreaterThanOrEqual(1);

    // Advance to the next track while remaining leader the whole time — mode
    // never changes value here, only the track signal does.
    command.advance(1);
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();

    const writesAfterSecondTrack = srcWrites.length - writesAfterFirstTrack;

    // Exactly one load per track selection is correct. If the leadership
    // effect also fires (because it depends on track() while mode stays
    // 'leader'), the src gets reassigned twice for the same advance — once
    // from the normal currentTrack$ subscription and once from the
    // leadership-changes effect reloading from position 0.
    expect(writesAfterSecondTrack).toBe(1);
  });
});
