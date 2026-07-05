import { Injectable, signal } from '@angular/core';

/**
 * Identity of the person using this browser tab.
 *
 * `name` is what the user types at the first-run gate. `userKey` is a
 * SHA-256 hash of the lowercased, trimmed name and is the sync group key:
 * every instance (tab/window/device) that enters the same first name lands
 * in the same sync group.
 *
 * ⚠️ Privacy/collision note: the key is derived from a first name only, by
 * design (so the same user can sync across devices without sharing a
 * secret). That means anyone who enters the same first name joins your
 * sync group and can observe your playback. Acceptable for this feature;
 * do not use it for anything sensitive.
 *
 * `instanceId` is a fresh `crypto.randomUUID()` per tab load, kept in
 * memory only — two tabs on the same browser are two distinct instances
 * that sync with each other.
 */
export interface UserProfile {
  name: string;
  userKey: string;
  createdAt: number;
}

const STORAGE_KEY = 'sky-tunes-user';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  /** The persisted user, or null until the first-run gate is completed. */
  readonly user = signal<UserProfile | null>(loadUser());

  /** Unique per tab load — regenerated every time the page (re)loads. */
  readonly instanceId = crypto.randomUUID();

  /** Records the first name entered at the gate and derives the sync key. */
  async setName(name: string): Promise<UserProfile> {
    const trimmed = name.trim();
    const userKey = await deriveUserKey(trimmed);
    const profile: UserProfile = {
      name: trimmed,
      userKey,
      createdAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    this.user.set(profile);
    return profile;
  }

  /** Clears the stored identity — used by tests / a "sign out" action. */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.user.set(null);
  }
}

function loadUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.name === 'string' && typeof parsed?.userKey === 'string') {
      return parsed as UserProfile;
    }
    return null;
  } catch {
    return null;
  }
}

/** SHA-256 of the lowercased, trimmed name → hex string. */
async function deriveUserKey(name: string): Promise<string> {
  const data = new TextEncoder().encode(name.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}