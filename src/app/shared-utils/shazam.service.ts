import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SHAZAM_API_ENDPOINT } from './api-config';

/** A recognized song: `subtitle` is the artist in Shazam's response shape. */
export interface ShazamTrack {
  title: string;
  subtitle: string;
}

interface RecognizeResponse {
  uuid: string;
  status: string;
}

interface ResultsResponse {
  status: string;
  results?: { timecode?: string; track?: ShazamTrack }[];
}

const POLL_MS = 3000;
const MAX_POLLS = 20;

/**
 * Submits a recorded clip to the Shazam API (via the shazam-proxy Lambda,
 * which holds the Bearer key) and polls the returned job until it completes.
 */
@Injectable({ providedIn: 'root' })
export class ShazamService {
  private http = inject(HttpClient);

  /** Uploads the clip and returns the recognition job's uuid. */
  async recognize(clip: Blob): Promise<string> {
    const res = await firstValueFrom(
      this.http.post<RecognizeResponse>(`${SHAZAM_API_ENDPOINT}/recognize`, clip),
    );
    if (!res?.uuid) throw new Error('Recognition service returned no job id');
    return res.uuid;
  }

  /**
   * Polls the job until completed; resolves with the first matched track,
   * or null when the job completes without a match.
   */
  async waitForResults(uuid: string): Promise<ShazamTrack | null> {
    const url = `${SHAZAM_API_ENDPOINT}/results/${encodeURIComponent(uuid)}`;
    for (let attempt = 1; ; attempt++) {
      const res = await firstValueFrom(this.http.post<ResultsResponse>(url, null));
      if (res?.status === 'completed') {
        return res.results?.find((r) => r.track)?.track ?? null;
      }
      if (attempt >= MAX_POLLS) throw new Error('Timed out waiting for song recognition');
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
}
