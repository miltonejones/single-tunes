import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { ITrack, ITrackMemory } from './podcast-models';

const TRACK_MEMORY_KEY = 'skytunes.podcast.trackMemory';
const FINISHED_THRESHOLD = 98;

@Injectable({
  providedIn: 'root',
})
export class PodcastAudioPlayerCommandService {
  private queue: ITrack[] = [];

  readonly currentTrack$ = new BehaviorSubject<ITrack | null>(null);
  readonly queue$ = new BehaviorSubject<ITrack[]>([]);
  readonly seekRelative$ = new Subject<number>();
  readonly togglePlayPause$ = new Subject<void>();

  readonly trackMemory = signal<Record<string, ITrackMemory>>(this.loadTrackMemory());

  private pendingGuid: string | null = null;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushPending();
      }
    });
  }

  /** Starts playing a track, optionally alongside sibling tracks for next/previous. */
  openTrack(track: ITrack, queue: ITrack[] = [track]): void {
    this.queue = queue;
    this.queue$.next(queue);
    this.currentTrack$.next(track);
  }

  /** Jumps directly to a track already in the current queue. */
  selectTrack(track: ITrack): void {
    this.currentTrack$.next(track);
  }

  /** Moves to the next (1) or previous (-1) track in the queue. Returns false if there isn't one. */
  advance(offset: number): boolean {
    const current = this.currentTrack$.value;
    const index = this.queue.findIndex((track) => track.guid === current?.guid);
    const nextTrack = index === -1 ? undefined : this.queue[index + offset];

    if (!nextTrack) {
      return false;
    }

    this.currentTrack$.next(nextTrack);
    return true;
  }

  clearQueue(): void {
    this.queue = [];
    this.queue$.next([]);
    this.currentTrack$.next(null);
  }

  /** Broadcasts a request to seek relative to the current position. */
  seekRelative(seconds: number): void {
    this.seekRelative$.next(seconds);
  }

  /** Broadcasts a request to toggle play/pause. */
  togglePlayPause(): void {
    this.togglePlayPause$.next();
  }

  getProgress(guid: string): number {
    return this.trackMemory()[guid]?.progress ?? 0;
  }

  isFinished(guid: string): boolean {
    return this.getProgress(guid) > FINISHED_THRESHOLD;
  }

  setProgress(guid: string, progress: number, podcastFeedUrl: string): void {
    const next = {
      ...this.trackMemory(),
      [guid]: { progress, podcastFeedUrl, updatedAt: Date.now() },
    };
    this.trackMemory.set(next);
    localStorage.setItem(TRACK_MEMORY_KEY, JSON.stringify(next));
    this.pendingGuid = guid;
  }

  /** Progress of the most recent unfinished episode belonging to a podcast, for its card's progress bar. */
  getPodcastProgress(podcastFeedUrl: string): number {
    const memory = this.trackMemory();
    const entry = Object.values(memory).find(
      (m) => m.podcastFeedUrl === podcastFeedUrl && m.progress < FINISHED_THRESHOLD + 1,
    );
    return entry?.progress ?? 0;
  }

  private loadTrackMemory(): Record<string, ITrackMemory> {
    try {
      return JSON.parse(localStorage.getItem(TRACK_MEMORY_KEY) || '{}');
    } catch {
      return {};
    }
  }

  private flushPending(): void {
    const guid = this.pendingGuid;
    this.pendingGuid = null;

    if (!guid) return;

    const entry = this.trackMemory()[guid];
    if (entry) {
      // Already persisted to localStorage in setProgress — this just ensures
      // the latest value is saved before page unload.
      localStorage.setItem(TRACK_MEMORY_KEY, JSON.stringify(this.trackMemory()));
    }
  }
}
