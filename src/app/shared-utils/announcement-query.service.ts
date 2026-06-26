import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ANNOUNCE_ENDPOINT } from './api-config';
import { AnnounceFetchProps } from './models';

interface AnnounceApiResponse {
  messageContent?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AnnouncementQueryService {
  constructor(private http: HttpClient) {}

  async fetchAnnouncement(props: AnnounceFetchProps, chatType: string = 'deep'): Promise<string> {
    const time = new Date().toLocaleTimeString();
    // Sent as a string body (not an object) so the browser defaults to a
    // text/plain Content-Type instead of application/json. That keeps this a
    // CORS "simple request" and skips the preflight OPTIONS call entirely —
    // the API's preflight handling is broken for this HTTP API v2 deployment.
    const response = await firstValueFrom(
      this.http.post<AnnounceApiResponse>(
        `${ANNOUNCE_ENDPOINT}/${chatType}`,
        JSON.stringify({ ...props, time }),
      ),
    );
    return response.messageContent || '';
  }
}
