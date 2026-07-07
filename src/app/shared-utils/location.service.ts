import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AnnouncerSettingsService } from '../announcer-settings.service';

export type ZipSource = 'geolocation' | 'ip' | 'settings' | 'none';

interface NominatimResponse {
  address?: {
    postcode?: string;
  };
}

interface IpApiResponse {
  zip?: string;
  status?: 'success' | 'fail';
}

const SESSION_ZIP_KEY = 'sky-tunes-location-zip';
const SESSION_SOURCE_KEY = 'sky-tunes-location-source';
const GEO_TIMEOUT_MS = 5000;

/**
 * Resolves the user's zip/postal code through a priority chain:
 *
 *   1. Browser Geolocation API → Nominatim reverse geocode
 *   2. IP-based geolocation (ip-api.com)
 *   3. Settings zip (manual entry, from AnnouncerSettingsService)
 *
 * The result is cached in sessionStorage so it survives page navigation
 * within the same tab session. Failures are silent — the service always
 * produces a value (possibly empty) without user-facing errors.
 */
@Injectable({
  providedIn: 'root',
})
export class LocationService {
  /** The best available zip code, resolved through the priority chain. */
  readonly resolvedZip = signal<string>('');

  /** Where the current resolvedZip came from. */
  readonly source = signal<ZipSource>('none');

  /** True while resolution is in progress (browser geo or IP lookup). */
  readonly resolving = signal(false);

  constructor(private http: HttpClient, private announcerSettings: AnnouncerSettingsService) {
    // Try sessionStorage cache first
    const cachedZip = sessionStorage.getItem(SESSION_ZIP_KEY);
    const cachedSource = sessionStorage.getItem(SESSION_SOURCE_KEY) as ZipSource | null;

    if (cachedZip && cachedSource) {
      this.resolvedZip.set(cachedZip);
      this.source.set(cachedSource);
      return;
    }

    // Initialize fallback from settings
    const initialZip = this.announcerSettings.settings().zip;
    this.resolvedZip.set(initialZip);
    this.source.set(initialZip ? 'settings' : 'none');

    // Attempt auto-detection
    this.resolve();
  }

  /** Runs the full priority chain to resolve the zip code. */
  async resolve(): Promise<void> {
    if (this.resolving()) return;
    this.resolving.set(true);

    try {
      // Step 1: Browser Geolocation → Nominatim reverse geocode
      const geoZip = await this.tryGeolocation();
      if (geoZip) {
        this.resolvedZip.set(geoZip);
        this.source.set('geolocation');
        this.cacheResult(geoZip, 'geolocation');
        return;
      }

      // Step 2: IP-based geolocation
      const ipZip = await this.tryIpGeolocation();
      if (ipZip) {
        this.resolvedZip.set(ipZip);
        this.source.set('ip');
        this.cacheResult(ipZip, 'ip');
        return;
      }

      // Step 3: Fall back to settings zip (already set in constructor)
      const settingsZip = this.announcerSettings.settings().zip;
      if (settingsZip) {
        this.source.set('settings');
      } else {
        this.source.set('none');
      }
    } finally {
      this.resolving.set(false);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Step 1: Use the browser Geolocation API to get coordinates, then
   * reverse-geocode via Nominatim to extract the postal code.
   */
  private async tryGeolocation(): Promise<string | null> {
    try {
      const coords = await this.getCurrentPosition();
      const postcode = await this.reverseGeocode(coords.latitude, coords.longitude);
      return postcode;
    } catch {
      return null;
    }
  }

  /** Wraps navigator.geolocation.getCurrentPosition in a Promise with timeout. */
  private getCurrentPosition(): Promise<GeolocationCoordinates> {
    return new Promise<GeolocationCoordinates>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not available'));
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('Geolocation timed out'));
      }, GEO_TIMEOUT_MS);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          resolve(position.coords);
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 300000 },
      );
    });
  }

  /** Calls Nominatim reverse geocode API and returns the postal code, if any. */
  private async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const headers = new HttpHeaders({ 'User-Agent': 'SkyTunes/1.0' });
      const response = await firstValueFrom(
        this.http.get<NominatimResponse>(url, { headers }),
      );
      return response?.address?.postcode || null;
    } catch {
      return null;
    }
  }

  /**
   * Step 2: Use the free ip-api.com service to get an approximate
   * location from the user's IP address.
   */
  private async tryIpGeolocation(): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<IpApiResponse>('https://ip-api.com/json/'),
      );
      return response?.zip || null;
    } catch {
      return null;
    }
  }

  /** Persists the resolved result in sessionStorage. */
  private cacheResult(zip: string, source: ZipSource): void {
    try {
      sessionStorage.setItem(SESSION_ZIP_KEY, zip);
      sessionStorage.setItem(SESSION_SOURCE_KEY, source);
    } catch {
      // sessionStorage may be full or unavailable — ignore.
    }
  }
}
