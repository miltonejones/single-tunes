import { computed, Injectable, signal } from '@angular/core';
import { ITrackItem } from './models';

export interface PlayHistoryEntry {
  sourceType: 'album' | 'artist' | 'playlist' | 'genre' | 'library' | 'search';
  sourceName: string;
  sourceLink: unknown[];
  trackTitle: string;
  trackArtist: string;
  trackImage: string | null;
  timestamp: number;
}

export interface RecentPlayItem {
  thumbnail: string | null;
  title: string;
  eyebrow: string;
  caption: string;
  routerLink: unknown[];
}

const HISTORY_KEY = 'skytunes-play-history';
const MAX_ENTRIES = 50;
const RECENT_COUNT = 6;

@Injectable({
  providedIn: 'root',
})
export class PlayHistoryService {
  private historySignal = signal<PlayHistoryEntry[]>(this.load());

  /** All entries, newest first. */
  readonly history = this.historySignal.asReadonly();

  /** Up to 6 random source items, deduplicated by sourceType+sourceName. */
  readonly recentItems = computed<RecentPlayItem[]>(() => {
    const seen = new Set<string>();
    const unique: PlayHistoryEntry[] = [];

    for (const entry of this.historySignal()) {
      const key = `${entry.sourceType}:${entry.sourceName}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(entry);
      }
    }

    // Pick up to 6 random
    const shuffled = [...unique].sort(() => Math.random() - 0.5).slice(0, RECENT_COUNT);

    return shuffled.map((e) => ({
      thumbnail: e.trackImage,
      title: e.sourceName,
      eyebrow: e.sourceType,
      caption: e.trackTitle ? `${e.trackArtist} — ${e.trackTitle}` : e.trackArtist,
      routerLink: e.sourceLink,
    }));
  });

  recordPlay(
    sourceType: PlayHistoryEntry['sourceType'],
    sourceName: string,
    sourceLink: unknown[],
    track: ITrackItem,
  ): void {
    const entry: PlayHistoryEntry = {
      sourceType,
      sourceName,
      sourceLink,
      trackTitle: track.Title,
      trackArtist: track.artistName,
      trackImage: track.albumImage,
      timestamp: Date.now(),
    };

    this.historySignal.update((prev) => {
      const updated = [entry, ...prev].slice(0, MAX_ENTRIES);
      this.persist(updated);
      return updated;
    });
  }

  private load(): PlayHistoryEntry[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? (JSON.parse(raw) as PlayHistoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  private persist(entries: PlayHistoryEntry[]): void {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }
}
