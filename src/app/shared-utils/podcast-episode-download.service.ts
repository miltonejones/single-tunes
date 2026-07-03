import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from './toast.service';
import { IPodcast, ITrack, ParsedEpisode } from './podcast-models';

const DB_NAME = 'sky-tunes-podcast-downloads';
const STORE_NAME = 'episodes';
const DB_VERSION = 1;

export interface DownloadedEpisode {
  guid: string;
  blob: Blob;
  title: string;
  description: string;
  pubDate: string;
  duration: string;
  author: string;
  enclosureType: string;
  podcastFeedUrl: string;
  podcastName: string;
  artworkUrl: string;
}

@Injectable({ providedIn: 'root' })
export class PodcastEpisodeDownloadService {
  downloadedGuids = signal<Set<string>>(new Set());
  downloadingGuids = signal<Set<string>>(new Set());

  private toast = inject(ToastService);
  private db: IDBDatabase | null = null;

  constructor() {
    this.openDb().then(() => this.loadDownloadedGuids());
  }

  isDownloaded(guid: string | undefined): boolean {
    return !!guid && this.downloadedGuids().has(guid);
  }

  isDownloading(guid: string | undefined): boolean {
    return !!guid && this.downloadingGuids().has(guid);
  }

  async download(episode: ParsedEpisode, podcast: IPodcast): Promise<void> {
    if (!episode.guid || !episode.enclosure?.url || !this.db) return;
    const guid = episode.guid;

    this.downloadingGuids.update((s) => new Set([...s, guid]));
    try {
      const response = await fetch(episode.enclosure.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      await this.put({
        guid,
        blob,
        title: episode.title,
        description: episode.description,
        pubDate: episode.pubDate,
        duration: episode.duration,
        author: episode.author,
        enclosureType: episode.enclosure.type,
        podcastFeedUrl: podcast.feedUrl ?? '',
        podcastName: podcast.collectionName ?? '',
        artworkUrl: podcast.artworkUrl600 ?? '',
      });
      this.downloadedGuids.update((s) => new Set([...s, guid]));
      this.toast.show(`"${episode.title}" downloaded`);
    } catch (err: any) {
      this.toast.show(`Download failed: ${err?.message ?? 'unknown error'}`);
    } finally {
      this.downloadingGuids.update((s) => {
        const next = new Set(s);
        next.delete(guid);
        return next;
      });
    }
  }

  /** Returns a blob: URL for local playback, or the enclosure URL as fallback. Caller must revoke blob URLs when done. */
  async getAudioSrc(track: ITrack): Promise<{ src: string; isBlob: boolean }> {
    if (track.guid && this.isDownloaded(track.guid) && this.db) {
      const blob = await this.getBlob(track.guid);
      if (blob) {
        return { src: URL.createObjectURL(blob), isBlob: true };
      }
    }
    return { src: track.audioUrl, isBlob: false };
  }

  async remove(guid: string, title?: string): Promise<void> {
    if (!guid || !this.db) return;
    await this.delete(guid);
    this.downloadedGuids.update((s) => {
      const next = new Set(s);
      next.delete(guid);
      return next;
    });
    this.toast.show(`"${title ?? 'Episode'}" removed from downloads`);
  }

  /** Get all downloaded episodes from IndexedDB. */
  async getAllDownloadedEpisodes(): Promise<DownloadedEpisode[]> {
    if (!this.db) return [];

    return new Promise((resolve) => {
      const req = this.db!.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve([]);
    });
  }

  private getBlob(guid: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      const req = this.db!.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(guid);
      req.onsuccess = () => resolve(req.result?.blob ?? null);
      req.onerror = () => resolve(null);
    });
  }

  private openDb(): Promise<void> {
    if (typeof indexedDB === 'undefined') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'guid' });
        }
      };
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  private loadDownloadedGuids(): void {
    if (!this.db) return;
    const req = this.db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => this.downloadedGuids.set(new Set(req.result as string[]));
  }

  private put(value: DownloadedEpisode): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db!.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private delete(guid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.db!.transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .delete(guid);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
