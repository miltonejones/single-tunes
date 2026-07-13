import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TRIVIA_ENDPOINT } from './api-config';
import { AnnounceFetchProps } from './models';

interface TriviaApiResponse {
  messageContent?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TriviaQueryService {
  constructor(private http: HttpClient) {}

  async fetchTrivia(props: AnnounceFetchProps): Promise<string> {
    const time = new Date().toLocaleTimeString();
    // Sent as a string body (not an object), same as AnnouncementQueryService, to keep
    // this a CORS "simple request" and skip the preflight OPTIONS call.
    const response = await firstValueFrom(
      this.http.post<TriviaApiResponse>(TRIVIA_ENDPOINT, JSON.stringify({ ...props, time })),
    );
    return response.messageContent || '';
  }
}
