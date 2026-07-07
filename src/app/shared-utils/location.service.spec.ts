import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LocationService } from './location.service';
import { AnnouncerSettingsService } from '../announcer-settings.service';

const NOMINATIM_URL = /nominatim\.openstreetmap\.org/;
const IP_API_URL = /ip-api\.com\/json/;

describe('LocationService', () => {
  let httpMock: HttpTestingController;
  let announcerSettings: AnnouncerSettingsService;

  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    announcerSettings = TestBed.inject(AnnouncerSettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  function mockGeolocation(success: boolean, coords?: GeolocationCoordinates): void {
    const mockCoords = coords ?? {
      latitude: 40.7128,
      longitude: -74.006,
      accuracy: 100,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    };

    const geoMock = success
      ? { getCurrentPosition: (cb: Function) => cb({ coords: mockCoords }) }
      : { getCurrentPosition: (_cb: Function, eb: Function) => eb(new Error('Permission denied')) };

    Object.defineProperty(navigator, 'geolocation', {
      value: geoMock,
      configurable: true,
      writable: true,
    });
  }

  /** Wait for pending microtasks (Promise callbacks) to settle. */
  async function tick(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  describe('priority chain', () => {
    it('uses browser geolocation → Nominatim when both succeed', async () => {
      mockGeolocation(true);
      const svc = TestBed.inject(LocationService);

      // Wait for the constructor's async resolve() to make the HTTP request
      await tick();

      // Nominatim request
      const nomReq = httpMock.expectOne((req) => NOMINATIM_URL.test(req.url));
      expect(nomReq.request.method).toBe('GET');
      expect(nomReq.request.headers.get('User-Agent')).toBe('SkyTunes/1.0');
      nomReq.flush({ address: { postcode: '10001' } });

      await tick();

      expect(svc.resolvedZip()).toBe('10001');
      expect(svc.source()).toBe('geolocation');
      expect(svc.resolving()).toBe(false);
    });

    it('falls through to IP geolocation when Nominatim returns no postcode', async () => {
      mockGeolocation(true);
      const svc = TestBed.inject(LocationService);

      await tick();
      httpMock.expectOne((req) => NOMINATIM_URL.test(req.url)).flush({ address: { city: 'New York' } });

      await tick();
      const ipReq = httpMock.expectOne((req) => IP_API_URL.test(req.url));
      ipReq.flush({ zip: '10002', status: 'success' });

      await tick();

      expect(svc.resolvedZip()).toBe('10002');
      expect(svc.source()).toBe('ip');
    });

    it('falls through to IP geolocation when browser geolocation is denied', async () => {
      mockGeolocation(false);
      const svc = TestBed.inject(LocationService);

      await tick();
      const ipReq = httpMock.expectOne((req) => IP_API_URL.test(req.url));
      ipReq.flush({ zip: '10003', status: 'success' });

      await tick();

      expect(svc.resolvedZip()).toBe('10003');
      expect(svc.source()).toBe('ip');
    });

    it('falls through to IP geolocation when browser geolocation times out', async () => {
      vi.useFakeTimers();

      // Geolocation that never responds (simulate timeout)
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: () => {} },
        configurable: true,
        writable: true,
      });

      const svc = TestBed.inject(LocationService);

      // Advance past the 5s timeout
      await vi.advanceTimersByTimeAsync(5000);

      // IP API fallback
      const ipReq = httpMock.expectOne((req) => IP_API_URL.test(req.url));
      ipReq.flush({ zip: '10004', status: 'success' });

      await tick();

      expect(svc.resolvedZip()).toBe('10004');
      expect(svc.source()).toBe('ip');
    });

    it('falls back to settings zip when both geolocation and IP fail', async () => {
      // Set a settings zip first
      announcerSettings.update({ ...announcerSettings.settings(), zip: '90210' });

      mockGeolocation(false);
      const svc = TestBed.inject(LocationService);

      await tick();
      httpMock.expectOne((req) => IP_API_URL.test(req.url)).flush({ status: 'fail' });

      await tick();

      expect(svc.resolvedZip()).toBe('90210');
      expect(svc.source()).toBe('settings');
    });

    it('returns empty string when everything fails and no settings zip', async () => {
      // Ensure settings zip is empty
      announcerSettings.update({ ...announcerSettings.settings(), zip: '' });

      mockGeolocation(false);
      const svc = TestBed.inject(LocationService);

      await tick();
      httpMock.expectOne((req) => IP_API_URL.test(req.url)).flush({ status: 'fail' });

      await tick();

      expect(svc.resolvedZip()).toBe('');
      expect(svc.source()).toBe('none');
    });
  });

  describe('caching', () => {
    it('uses sessionStorage cache on construction when available', () => {
      sessionStorage.setItem('sky-tunes-location-zip', '60606');
      sessionStorage.setItem('sky-tunes-location-source', 'ip');

      const svc = TestBed.inject(LocationService);

      // No HTTP requests should be made
      expect(svc.resolvedZip()).toBe('60606');
      expect(svc.source()).toBe('ip');
    });
  });

  describe('resolving signal', () => {
    it('is true during resolution and false after', async () => {
      mockGeolocation(true);
      const svc = TestBed.inject(LocationService);

      expect(svc.resolving()).toBe(true);

      await tick();
      httpMock.expectOne((req) => NOMINATIM_URL.test(req.url)).flush({ address: { postcode: '10001' } });

      await tick();

      expect(svc.resolving()).toBe(false);
      expect(svc.resolvedZip()).toBe('10001');
    });
  });
});
