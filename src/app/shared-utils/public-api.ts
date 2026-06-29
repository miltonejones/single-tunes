/*
 * Public API Surface of shared-utils
 */

export * from './models';

export * from './domain/text';
export * from './domain/track';
export * from './domain/announcement';
export * from './domain/listing';

export { AnnouncementQueryService } from './announcement-query.service';
export { AnnouncementCommandService } from './announcement-command.service';
export { SpeechPlaybackService } from './speech-playback.service';

export { TrackQueryService } from './track-query.service';
export { TrackCommandService } from './track-command.service';
export { AudioPlayerCommandService } from './audio-player-command.service';

export { CatalogQueryService } from './catalog-query.service';
export { CatalogCommandService } from './catalog-command.service';
export { WikipediaQueryService } from './wikipedia-query.service';

export { CastService } from './cast.service';
export { OfflineService } from './offline.service';
export { ServiceWorkerUpdateService } from './service-worker-update.service';
export { ToastService } from './toast.service';
export { TrackDownloadService } from './track-download.service';
export type { ToastMessage } from './toast.service';
export { Toast } from './toast';
export { faveIcon } from './favorite-icon';
export { ImgFallbackDirective } from './img-fallback.directive';
export { CoverflowDirective } from './coverflow.directive';
export { MediaCard } from './media-card';
export { Breadcrumbs } from './breadcrumbs';
export type { BreadcrumbItem } from './breadcrumbs';
export { LoadingAnimation } from './loading-animation';
export type { LoadingVariant } from './loading-animation';
export { SkeletonLoader } from './skeleton-loader';
export type { SkeletonVariant } from './skeleton-loader';
export { TrackMenu } from './track-menu';
export { ItunesSearchModal } from './itunes-search-modal';

// ── Podcast exports ──────────────────────────────────────────────────────

export * from './podcast-models';
export * from './domain/podcast-rss';
export * from './domain/podcast-track';
export { shuffleArray, sortTrackList, usePagination } from './domain/podcast-format';

export { PodcastQueryService } from './podcast-query.service';
export type { IPodcastFeed } from './podcast-query.service';
export { PodcastSelectionService } from './podcast-selection.service';
export { PodcastAudioPlayerCommandService } from './podcast-audio-player-command.service';
export { PodcastSubscriptionsService } from './podcast-subscriptions.service';
export { PodcastToastService } from './podcast-toast.service';
export { PodcastCard } from './podcast-card';
export { PlayHistoryService } from './play-history.service';
export type { PlayHistoryEntry, RecentPlayItem } from './play-history.service';
