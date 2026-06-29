import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { ITrackItem } from './models';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root',
})
export class AudioPlayerCommandService {
  private toast = inject(ToastService);
  private queue: ITrackItem[] = [];

  // Where the next manually-queued track should be inserted. Reset whenever the
  // current track changes, so it's always recomputed relative to "now playing".
  private nextInsertIndex: number | null = null;

  readonly currentTrack$ = new BehaviorSubject<ITrackItem | null>(null);
  readonly queue$ = new BehaviorSubject<ITrackItem[]>([]);
  readonly seekRelative$ = new Subject<number>();
  readonly togglePlayPause$ = new Subject<void>();

  /** Broadcasts a request to open and play a track, optionally alongside sibling tracks for next/prev. */
  openTrack(track: ITrackItem, queue: ITrackItem[] = [track]): void {
    this.queue = queue;
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

  /** Clears the queue and broadcasts that nothing is playing. */
  clearQueue(): void {
    this.queue = [];
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

  private setCurrentTrack(track: ITrackItem | null): void {
    this.nextInsertIndex = null;
    this.currentTrack$.next(track);
  }
}
