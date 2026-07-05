import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ShazamService } from './shazam.service';
import { SHAZAM_API_ENDPOINT } from './api-config';

const RESULTS_URL = `${SHAZAM_API_ENDPOINT}/results/job-1`;

describe('ShazamService', () => {
  let svc: ShazamService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(ShazamService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('recognize posts the clip and returns the job uuid', async () => {
    const clip = new Blob(['audio'], { type: 'audio/webm' });
    const promise = svc.recognize(clip);

    const req = httpMock.expectOne(`${SHAZAM_API_ENDPOINT}/recognize`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(clip);
    req.flush({ uuid: 'job-1', status: 'processing' });

    await expect(promise).resolves.toBe('job-1');
  });

  it('recognize rejects when no uuid comes back', async () => {
    const promise = svc.recognize(new Blob(['audio']));
    httpMock.expectOne(`${SHAZAM_API_ENDPOINT}/recognize`).flush({ status: 'failed' });
    await expect(promise).rejects.toThrow(/no job id/i);
  });

  it('waitForResults resolves with the first matched track once completed', async () => {
    const promise = svc.waitForResults('job-1');

    httpMock.expectOne(RESULTS_URL).flush({
      status: 'completed',
      results: [{ timecode: '00:00:15', track: { title: 'Song Title', subtitle: 'Artist' } }],
    });

    await expect(promise).resolves.toEqual({ title: 'Song Title', subtitle: 'Artist' });
  });

  it('waitForResults keeps polling while processing and returns null on an empty match', async () => {
    vi.useFakeTimers();
    const promise = svc.waitForResults('job-1');

    httpMock.expectOne(RESULTS_URL).flush({ status: 'processing' });
    await vi.runAllTimersAsync();

    httpMock.expectOne(RESULTS_URL).flush({ status: 'completed', results: [] });
    await expect(promise).resolves.toBeNull();
  });

  it('waitForResults gives up after the poll cap', async () => {
    vi.useFakeTimers();
    const promise = svc.waitForResults('job-1');
    const settled = promise.catch((err: Error) => err);

    for (let i = 0; i < 20; i++) {
      httpMock.expectOne(RESULTS_URL).flush({ status: 'processing' });
      await vi.runAllTimersAsync();
    }

    expect(await settled).toMatchObject({ message: expect.stringMatching(/timed out/i) });
  });
});
