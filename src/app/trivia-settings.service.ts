import { Injectable, signal } from '@angular/core';
import { AnnouncerFrequency } from 'shared-utils';

export interface TriviaSettings {
  frequency: AnnouncerFrequency;
  spokenEnabled: boolean;
}

const STORAGE_KEY = 'sky-tunes-trivia-settings';

const DEFAULT_SETTINGS: TriviaSettings = {
  frequency: 'sometimes',
  spokenEnabled: true,
};

@Injectable({
  providedIn: 'root',
})
export class TriviaSettingsService {
  settings = signal<TriviaSettings>(loadSettings());

  update(next: TriviaSettings): void {
    this.settings.set(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  setSpokenEnabled(enabled: boolean): void {
    this.update({ ...this.settings(), spokenEnabled: enabled });
  }
}

function loadSettings(): TriviaSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
