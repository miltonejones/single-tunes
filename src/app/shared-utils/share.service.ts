import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { KTUNES_API_ENDPOINT } from './api-config';

const STORAGE_KEY = 'ktunes_share_token';

export interface KtunesUser {
  Id: number;
  Name: string;
  Email: string;
  BucketName: string;
}

export interface ShareRequest {
  type: 'track' | 'album' | 'artist';
  id: number;
  targetUserId: number;
}

export interface ShareResult {
  shared: number;
  skipped: number;
}

export interface ShareContext {
  type: 'track' | 'album' | 'artist';
  id: number;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class ShareService {
  readonly token = signal<string | null>(null);

  constructor(private http: HttpClient) {
    try {
      this.token.set(localStorage.getItem(STORAGE_KEY));
    } catch {
      // SSR or storage unavailable
    }
  }

  isLoggedIn(): boolean {
    return !!this.token();
  }

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ token: string }>(`${KTUNES_API_ENDPOINT}/login`, { email, password }),
    );
    this.token.set(res.token);
    localStorage.setItem(STORAGE_KEY, res.token);
  }

  logout(): void {
    this.token.set(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  getUsers(): Promise<KtunesUser[]> {
    return firstValueFrom(
      this.http.get<KtunesUser[]>(`${KTUNES_API_ENDPOINT}/users`, {
        headers: { Authorization: `Bearer ${this.token()}` },
      }),
    );
  }

  share(req: ShareRequest): Promise<ShareResult> {
    return firstValueFrom(
      this.http.post<ShareResult>(`${KTUNES_API_ENDPOINT}/share`, req, {
        headers: { Authorization: `Bearer ${this.token()}` },
      }),
    );
  }
}
