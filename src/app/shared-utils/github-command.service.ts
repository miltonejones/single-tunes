import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GITHUB_PROXY_ENDPOINT } from './api-config';

export interface GithubIssueRequest {
  title: string;
  body: string;
}

export interface GithubIssueResult {
  number: number;
  html_url: string;
}

@Injectable({
  providedIn: 'root',
})
export class GithubCommandService {
  constructor(private http: HttpClient) {}

  createIssue(issue: GithubIssueRequest): Promise<GithubIssueResult> {
    return firstValueFrom(
      this.http.post<GithubIssueResult>(`${GITHUB_PROXY_ENDPOINT}/issues`, issue),
    );
  }
}
