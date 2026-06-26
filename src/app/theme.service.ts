import { Injectable, signal } from '@angular/core';

export interface Theme {
  key: string;
  name: string;
  description: string;
}

export const THEMES: Theme[] = [
  {
    key: 'midnight-synth',
    name: 'Midnight Synth',
    description: 'Dark and dreamy purple-pink vibes',
  },
  {
    key: 'disco-inferno',
    name: 'Disco Inferno',
    description: 'Burn, baby, burn! Fiery reds and oranges',
  },
  {
    key: 'minty-fresh',
    name: 'Minty Fresh',
    description: 'Cool as the other side of the pillow',
  },
];

const STORAGE_KEY = 'sky-tunes-theme';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  currentTheme = signal<Theme>(loadTheme());

  constructor() {
    applyTheme(this.currentTheme().key);
  }

  setTheme(theme: Theme): void {
    this.currentTheme.set(theme);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme.key));
    applyTheme(theme.key);
  }
}

function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const key = JSON.parse(raw);
      const found = THEMES.find((t) => t.key === key);
      if (found) return found;
    }
  } catch {
    // ignore
  }
  return THEMES[0];
}

function applyTheme(key: string): void {
  document.documentElement.setAttribute('data-theme', key);
}
