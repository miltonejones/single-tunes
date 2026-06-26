import { Injectable, signal } from '@angular/core';
import { AnnouncerFrequency } from 'shared-utils';

export interface AnnouncerSettings {
  frequency: AnnouncerFrequency;
  name: string;
  zip: string;
  chatType: 'deep' | 'announce' | 'claude';
  voiceURI: string;
}

const STORAGE_KEY = 'sky-tunes-announcer-settings';

const DEFAULT_SETTINGS: AnnouncerSettings = {
  frequency: 'always',
  name: 'Milton',
  zip: '',
  chatType: 'deep',
  voiceURI: '',
};

@Injectable({
  providedIn: 'root',
})
export class AnnouncerSettingsService {
  settings = signal<AnnouncerSettings>(loadSettings());

  update(next: AnnouncerSettings): void {
    this.settings.set(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

function loadSettings(): AnnouncerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw);
    // Migrate the old boolean `enabled` flag to the new `frequency` setting.
    const frequency: AnnouncerFrequency =
      parsed.frequency ?? (parsed.enabled === false ? 'never' : 'always');
    return { ...DEFAULT_SETTINGS, ...parsed, frequency };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
