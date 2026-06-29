import { Injectable, signal } from '@angular/core';
import { ITrackItem } from 'shared-utils';

@Injectable({
  providedIn: 'root',
})
export class TrackDedicationService {
  // Store dedications in localStorage with track ID as key
  private readonly STORAGE_KEY = 'sky-tunes-track-dedications';

  // In-memory cache of dedications for quick access
  private dedications = signal<Record<number, string>>(this.loadDedications());

  getDedication(trackId: number): string | undefined {
    return this.dedications()[trackId];
  }

  setDedication(trackId: number, name: string): void {
    const current = this.dedications();
    const updated = { ...current, [trackId]: name };
    this.dedications.set(updated);
    this.saveDedications(updated);
  }

  removeDedication(trackId: number): void {
    const current = this.dedications();
    const updated = { ...current };
    delete updated[trackId];
    this.dedications.set(updated);
    this.saveDedications(updated);
  }

  private loadDedications(): Record<number, string> {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveDedications(dedications: Record<number, string>): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dedications));
    } catch (error) {
      console.error('Failed to save track dedications:', error);
    }
  }
}