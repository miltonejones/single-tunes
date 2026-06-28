import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from './toast.service';
import { ITrackItem } from './models';
import { buildPlayerUrl } from './domain/track';

const DB_NAME = 'sky-tunes-downloads';
const STORE_NAME = 'downloads';
const DB_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class TrackDownloadService {
  downloadedIds = signal<Set<number>>(new Set());
  downloadingIds = signal<Set<number>>(new Set());

  private toast = inject(ToastService);
  private db: IDBDatabase | null = null;

  constructor() {
    this.openDb().then(() => this.loadDownloadedIds());
  }

  isDownloaded(trackId: number | undefined): boolean {
    return !!trackId && this.downloadedIds().has(trackId);
  }

  isDownloading(trackId: number | undefined): boolean {
    return !!trackId && this.downloadingIds().has(trackId);
  }

  async download(track: ITrackItem): Promise<void> {
    if (!track.ID || !this.db) return;
    const trackId = track.ID;

    this.downloadingIds.update((s) => new Set([...s, trackId]));
    try {
      const url = buildPlayerUrl(track.FileKey);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      await this.put({ trackId, blob, title: track.Title });
      this.downloadedIds.update((s) => new Set([...s, trackId]));
    } catch (err: any) {
      this.toast.show(`Download failed: ${err?.message ?? 'unknown error'}`);
    } finally {
      this.downloadingIds.update((s) => {
        const next = new Set(s);
        next.delete(trackId);
        return next;
      });
    }
  }

  downloadAll(tracks: ITrackItem[]): void {
    const pending = tracks.filter((t) => t.ID && !this.isDownloaded(t.ID));
    if (pending.length === 0) return;

    const total = pending.length;
    let completed = 0;
    const toastId = this.toast.showPersistent(`Downloading 0 of ${total}…`);

    for (const track of pending) {
      this.download(track).then(() => {
        completed++;
        if (completed < total) {
          this.toast.update(toastId, `Downloading ${completed} of ${total}…`);
        } else {
          this.toast.dismiss(toastId);
          this.toast.show(`${total} track${total === 1 ? '' : 's'} downloaded`);
        }
      });
    }
  }

  /** Returns a blob: URL for local playback, or the CloudFront URL as fallback. Caller must revoke blob URLs when done. */
  async getAudioSrc(track: ITrackItem): Promise<{ src: string; isBlob: boolean }> {
    if (track.ID && this.isDownloaded(track.ID) && this.db) {
      const blob = await this.getBlob(track.ID);
      if (blob) {
        return { src: URL.createObjectURL(blob), isBlob: true };
      }
    }
    return { src: buildPlayerUrl(track.FileKey), isBlob: false };
  }

  private getBlob(trackId: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      const req = this.db!.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(trackId);
      req.onsuccess = () => resolve(req.result?.blob ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async remove(track: ITrackItem): Promise<void> {
    if (!track.ID || !this.db) return;
    const trackId = track.ID;
    await this.delete(trackId);
    this.downloadedIds.update((s) => {
      const next = new Set(s);
      next.delete(trackId);
      return next;
    });
    this.toast.show(`"${track.Title}" removed from downloads`);
  }

  private openDb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'trackId' });
        }
      };
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  private loadDownloadedIds(): void {
    if (!this.db) return;
    const req = this.db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => this.downloadedIds.set(new Set(req.result as number[]));
  }

  private put(value: { trackId: number; blob: Blob; title: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db!.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private delete(trackId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db!.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(trackId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
