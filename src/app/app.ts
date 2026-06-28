import { Component, computed, ElementRef, HostListener, inject, signal, ViewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { animate, group, query, style, transition, trigger } from '@angular/animations';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { AudioPlayerCommandService, PodcastAudioPlayerCommandService, Toast } from 'shared-utils';

const SEARCH_HISTORY_KEY = 'toolbar-search-history';
const MAX_SEARCH_HISTORY = 10;
import { AudioPlayer } from './audio-player';
import { AudioVisualizer } from './audio-visualizer';
import { SettingsModal } from './settings-modal';
import { SettingsPanelService } from './settings-panel.service';
import { TrackQueue } from './track-queue';
import { PodcastAudioPlayer } from './podcast/podcast-audio-player';
import { EpisodeQueue } from './podcast/episode-queue';

type NavSection = 'home' | 'artist' | 'album' | 'genre' | 'playlist' | 'library' | 'downloads' | 'podcasts' | 'search' | null;

const GRID_TYPES = ['artist', 'album', 'genre', 'playlist'];

const SECTION_LABELS: Record<string, string> = {
  artist: 'Artists',
  album: 'Albums',
  genre: 'Genres',
  playlist: 'Playlists',
  library: 'Library',
  home: 'Home',
  podcasts: 'Podcasts',
};

interface NavItem {
  section: NavSection;
  icon: string;
  label: string;
  routerLink: any[];
}

const NAV_ITEMS: NavItem[] = [
  { section: 'home', icon: 'fa-house', label: 'Home', routerLink: ['/'] },
  { section: 'artist', icon: 'fa-microphone', label: 'Artists', routerLink: ['/grid', 'artist', 1] },
  { section: 'album', icon: 'fa-compact-disc', label: 'Albums', routerLink: ['/grid', 'album', 1] },
  { section: 'genre', icon: 'fa-tags', label: 'Genres', routerLink: ['/grid', 'genre', 1] },
  { section: 'playlist', icon: 'fa-list-ul', label: 'Playlists', routerLink: ['/grid', 'playlist', 1] },
  { section: 'library', icon: 'fa-music', label: 'Library', routerLink: ['/list', 1] },
  { section: 'downloads', icon: 'fa-download', label: 'Downloads', routerLink: ['/downloads'] },
  { section: 'podcasts', icon: 'fa-podcast', label: 'Podcasts', routerLink: ['/podcasts'] },
];

/** Resolves which nav button represents a URL, ignoring trailing page-number params. */
function resolveNavSection(url: string): NavSection {
  const segments = url.split('?')[0].split('/').filter(Boolean);

  if (segments.length === 0) {
    return 'home';
  }
  if (segments[0] === 'podcasts') {
    return 'podcasts';
  }
  if (segments[0] === 'downloads') {
    return 'downloads';
  }
  if (segments[0] === 'search') {
    return 'search';
  }
  if (segments[0] === 'grid' && GRID_TYPES.includes(segments[1])) {
    return segments[1] as NavSection;
  }
  if (segments[0] === 'list') {
    if (segments.length === 2) {
      return 'library';
    }
    if (GRID_TYPES.includes(segments[1])) {
      return segments[1] as NavSection;
    }
  }
  return null;
}

/** Derives a breadcrumb-like page title from the current URL. */
function pageTitleFromUrl(url: string): string {
  const segments = url.split('?')[0].split('/').filter(Boolean);

  if (segments.length === 0) {
    return 'SkyTunes | Home';
  }

  if (segments[0] === 'podcasts') {
    if (segments.length === 1) return 'SkyTunes | Podcasts';
    if (segments[1] === 'search') return `SkyTunes | Podcasts: Search`;
    if (segments[1] === 'subscriptions') return 'SkyTunes | Podcasts: Subscriptions';
    if (segments[1] === 'categories') return 'SkyTunes | Podcasts: Categories';
    if (segments[1] === 'detail') return 'SkyTunes | Podcasts: Episode List';
    return 'SkyTunes | Podcasts';
  }

  if (segments[0] === 'downloads') {
    return 'SkyTunes | Downloads';
  }

  if (segments[0] === 'search') {
    const query = decodeURIComponent(segments[1] ?? '');
    return `SkyTunes | Search: ${query}`;
  }

  if (segments[0] === 'grid' && GRID_TYPES.includes(segments[1])) {
    return `SkyTunes | Home > ${SECTION_LABELS[segments[1]]}`;
  }

  if (segments[0] === 'list') {
    if (segments.length === 2) {
      return 'SkyTunes | Home > Library';
    }
    if (GRID_TYPES.includes(segments[1])) {
      return `SkyTunes | Home > ${SECTION_LABELS[segments[1]]}`;
    }
  }

  return 'SkyTunes';
}

const routeAnimation = trigger('routeAnimation', [
  transition('* => *', [
    query(':leave', [
      style({ transform: 'translateX(0)', opacity: 1 }),
      animate('200ms ease-in', style({ transform: 'translateX(-25%)', opacity: 0.4 })),
    ], { optional: true }),
    query(':enter', [
      style({ transform: 'translateX(100%)', opacity: 0 }),
      animate('350ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
    ], { optional: true }),
  ]),
]);

@Component({
  selector: 'app-root',
  imports: [
    RouterLink, RouterOutlet, AudioPlayer, AudioVisualizer, TrackQueue, SettingsModal, Toast,
    PodcastAudioPlayer, EpisodeQueue, FormsModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  animations: [routeAnimation],
})
export class App {
  private router = inject(Router);
  private titleService = inject(Title);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private podcastAudioPlayerCommand = inject(PodcastAudioPlayerCommandService);
  protected settingsPanel = inject(SettingsPanelService);
  protected readonly NAV_ITEMS = NAV_ITEMS;
  activeSection = signal<NavSection>(resolveNavSection(this.router.url));
  searchOpen = signal(false);
  navDropdownOpen = signal(false);
  protected activeItem = computed(() => NAV_ITEMS.find((i) => i.section === this.activeSection()));
  protected podcastPlaying = signal(false);
  protected searchHistory = signal<string[]>(this.loadSearchHistory());

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      const navEvent = event as NavigationEnd;
      this.activeSection.set(resolveNavSection(navEvent.urlAfterRedirects));
      this.searchOpen.set(false);
      this.navDropdownOpen.set(false);
      this.titleService.setTitle(pageTitleFromUrl(navEvent.urlAfterRedirects));
    });

    // Add/remove body class so page padding thickens when a music track is loaded
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      document.body.classList.toggle('track-playing', !!track);
      // Stop podcast player when music starts
      if (track) {
        this.podcastAudioPlayerCommand.clearQueue();
      }
    });

    // Track podcast playback for dual-player visibility + body class
    this.podcastAudioPlayerCommand.currentTrack$.subscribe((track) => {
      this.podcastPlaying.set(!!track);
      document.body.classList.toggle('podcast-playing', !!track);
      // Stop music player when podcast starts
      if (track) {
        this.audioPlayerCommand.clearQueue();
      }
    });
  }

  openSearch(): void {
    this.searchOpen.set(true);
    setTimeout(() => this.searchInputRef?.nativeElement.focus());
  }

  closeSearch(): void {
    this.searchOpen.set(false);
  }

  onSearch(event: Event, query: string): void {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      this.saveSearchHistory(trimmed);
      this.router.navigate(['/search', trimmed]);
      this.searchOpen.set(false);
    }
  }

  private loadSearchHistory(): string[] {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  private saveSearchHistory(term: string): void {
    const updated = [term, ...this.searchHistory().filter((h) => h !== term)].slice(0, MAX_SEARCH_HISTORY);
    this.searchHistory.set(updated);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
  }

  protected navigateTo(item: NavItem): void {
    this.router.navigate(item.routerLink);
    this.navDropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.navDropdownOpen()) {
      const target = event.target as HTMLElement;
      if (!target.closest('.mobile-nav-dropdown')) {
        this.navDropdownOpen.set(false);
      }
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    // Only handle global shortcuts when not in an input field
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (!isInput) {
      // Spacebar to play/pause
      if (event.code === 'Space') {
        event.preventDefault();
        // Check if we have a music track playing first, then podcast
        if (this.audioPlayerCommand.currentTrack$.value) {
          this.audioPlayerCommand.togglePlayPause();
        } else if (this.podcastAudioPlayerCommand.currentTrack$.value) {
          this.podcastAudioPlayerCommand.togglePlayPause();
        }
      }
      // Left arrow to seek backward 10 seconds
      else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        if (this.audioPlayerCommand.currentTrack$.value) {
          this.audioPlayerCommand.seekRelative(-10);
        } else if (this.podcastAudioPlayerCommand.currentTrack$.value) {
          this.podcastAudioPlayerCommand.seekRelative(-10);
        }
      }
      // Right arrow to seek forward 10 seconds
      else if (event.code === 'ArrowRight') {
        event.preventDefault();
        if (this.audioPlayerCommand.currentTrack$.value) {
          this.audioPlayerCommand.seekRelative(10);
        } else if (this.podcastAudioPlayerCommand.currentTrack$.value) {
          this.podcastAudioPlayerCommand.seekRelative(10);
        }
      }
    }
  }

  /** Returns a unique key per route so the slide animation fires on every navigation. */
  protected getRouteAnimationState(): string {
    return this.router.url.split('?')[0];
  }
}
