import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { ITrackItem } from './models';
import { ToastService } from './toast.service';
import type { SyncState, SyncTrack } from './sync.service';

@Injectable({
  providedIn: 'root',
})
export class AudioPlayerCommandService {
  private toast = inject(ToastService);
  private queue: ITrackItem[] = [];

  // Where the next manually-queued track should be inserted. Reset whenever the
  // current track changes, so it's always recomputed relative to "now playing".
  private nextInsertIndex: number | null = null;

  // Supplied by openTrack() when the queue represents one page of a larger,
  // paginated list. Called when playback runs off the end of `queue` so the
  // next page can be fetched and appended instead of stopping.
  private fetchNextPage: (() => Promise<ITrackItem[]>) | null = null;
  private fetchingNextPage = false;

  readonly currentTrack$ = new BehaviorSubject<ITrackItem | null>(null);
  readonly queue$ = new BehaviorSubject<ITrackItem[]>([]);
  readonly seekRelative$ = new Subject<number>();
  readonly togglePlayPause$ = new Subject<void>();
  readonly isPlaying$ = new BehaviorSubject<boolean>(false);

  /** Broadcasts whether the current track is actively playing vs. paused,
   *  so track lists can reflect pause state (e.g. stop a "now playing" spin). */
  setIsPlaying(playing: boolean): void {
    this.isPlaying$.next(playing);
  }

  /**
   * Broadcasts a request to open and play a track, optionally alongside sibling
   * tracks for next/prev. `fetchNextPage`, if given, is called when playback
   * reaches the end of `queue` — its result (if non-empty) is appended and
   * playback continues instead of stopping.
   */
  openTrack(
    track: ITrackItem,
    queue: ITrackItem[] = [track],
    fetchNextPage?: () => Promise<ITrackItem[]>,
  ): void {
    this.queue = queue;
    this.fetchNextPage = fetchNextPage ?? null;
    this.queue$.next(queue);
    this.setCurrentTrack(track);
  }

  /** Jumps directly to a track already in the current queue. */
  selectTrack(track: ITrackItem): void {
    this.setCurrentTrack(track);
  }

  /** Inserts a track right after the currently playing track, and after any tracks already added this way. */
  addToQueue(track: ITrackItem): void {
    if (this.nextInsertIndex === null) {
      const currentIndex = this.queue.findIndex((t) => t.ID === this.currentTrack$.value?.ID);
      this.nextInsertIndex = currentIndex === -1 ? this.queue.length : currentIndex + 1;
    }

    this.queue = [
      ...this.queue.slice(0, this.nextInsertIndex),
      track,
      ...this.queue.slice(this.nextInsertIndex),
    ];
    this.nextInsertIndex += 1;
    this.queue$.next(this.queue);
    this.toast.show(`"${track.Title}" added to queue`);
  }

  /** Moves to the next (1) or previous (-1) track in the current queue. Returns false if there isn't one. */
  advance(offset: number): boolean {
    const current = this.currentTrack$.value;
    const index = this.queue.findIndex((track) => track.ID === current?.ID);
    const nextTrack = index === -1 ? undefined : this.queue[index + offset];

    if (!nextTrack) {
      return false;
    }

    this.setCurrentTrack(nextTrack);
    return true;
  }

  /**
   * Like `advance()`, but when moving forward (offset 1) off the end of the
   * queue and a `fetchNextPage` provider is registered, fetches the next page
   * and appends it before giving up. Returns false only once there's truly
   * nothing left (either no provider, or the provider returned no tracks).
   */
  async advanceOrFetch(offset: number): Promise<boolean> {
    if (this.advance(offset)) return true;
    if (offset !== 1 || !this.fetchNextPage || this.fetchingNextPage) return false;

    const provider = this.fetchNextPage;
    this.fetchingNextPage = true;
    try {
      const nextTracks = await provider();
      // The queue may have been replaced (new track opened, queue cleared)
      // while this fetch was in flight — discard a stale result.
      if (this.fetchNextPage !== provider || nextTracks.length === 0) return false;

      this.queue = [...this.queue, ...nextTracks];
      this.queue$.next(this.queue);
      return this.advance(offset);
    } catch {
      return false;
    } finally {
      this.fetchingNextPage = false;
    }
  }

  /** Clears the queue and broadcasts that nothing is playing. */
  clearQueue(): void {
    this.queue = [];
    this.fetchNextPage = null;
    this.queue$.next([]);
    this.setCurrentTrack(null);
  }

  /** Broadcasts a request to seek relative to the current position. */
  seekRelative(seconds: number): void {
    this.seekRelative$.next(seconds);
  }

  /** Broadcasts a request to toggle play/pause. */
  togglePlayPause(): void {
    this.togglePlayPause$.next();
  }

  /**
   * Applies a leader state snapshot on a follower instance — sets the now-playing
   * track and queue subjects so the UI mirrors the leader, WITHOUT touching the
   * local queue bookkeeping that drives leader playback. The SyncService wraps
   * calls to this in an `isApplyingMirror` guard so its own subject subscriptions
   * don't republish the mirrored values.
   */
  applyMirroredState(state: SyncState): void {
    this.queue = state.queue.map(fromSyncTrack);
    this.fetchNextPage = null;
    this.queue$.next(this.queue);
    this.setCurrentTrack(state.track ? fromSyncTrack(state.track) : null);
  }

  private setCurrentTrack(track: ITrackItem | null): void {
    this.nextInsertIndex = null;
    this.currentTrack$.next(track);
  }
}

/** Reconstructs an ITrackItem from the minimal SyncTrack shipped over the wire. */
function fromSyncTrack(t: SyncTrack): ITrackItem {
  return {
    ID: t.ID,
    Title: t.Title,
    FileKey: t.FileKey,
    albumImage: t.albumImage,
    trackId: t.ID ?? 0,
    Genre: '',
    genreKey: null,
    discNumber: null,
    trackTime: t.trackTime,
    trackNumber: null,
    explicit: false,
    artistName: t.artistName,
    albumName: t.albumName,
  };
}
