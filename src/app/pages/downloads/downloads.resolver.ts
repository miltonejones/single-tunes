import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { TrackDownloadService } from 'shared-utils';

export type DownloadsResolvedData = Awaited<ReturnType<TrackDownloadService['getAllDownloadedTracks']>>;

export const downloadsResolver: ResolveFn<DownloadsResolvedData> = () => {
  return inject(TrackDownloadService).getAllDownloadedTracks();
};
