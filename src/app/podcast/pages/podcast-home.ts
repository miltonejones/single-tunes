import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  Breadcrumbs,
  BreadcrumbItem,
  IPodcast,
  LoadingAnimation,
  PodcastCard,
  PodcastQueryService,
  PodcastSelectionService,
  shuffleArray,
  PodcastSubscriptionsService,
} from 'shared-utils';

const FEATURED_COUNT = 12;
const SUBSCRIPTIONS_PREVIEW_COUNT = 6;
const CAROUSEL_INTERVAL_MS = 6000;
const SLIDE_ANIMATION_MS = 500;

type SlideDirection = 'forward' | 'backward';

@Component({
  selector: 'app-podcast-home',
  imports: [RouterLink, PodcastCard, NgTemplateOutlet, LoadingAnimation, Breadcrumbs],
  templateUrl: './podcast-home.html',
  styleUrl: './podcast-home.css',
})
export class PodcastHomePage implements OnInit, OnDestroy {
  @ViewChild('slideEl') private slideElRef?: ElementRef<HTMLElement>;

  private podcastQuery = inject(PodcastQueryService);
  private podcastSelection = inject(PodcastSelectionService);
  private router = inject(Router);
  protected subscriptionsService = inject(PodcastSubscriptionsService);

  private carouselTimer?: ReturnType<typeof setInterval>;
  private previousSlideTimer?: ReturnType<typeof setTimeout>;

  podcasts = signal<IPodcast[]>([]);
  loading = signal(false);
  error = signal('');
  carouselIndex = signal(0);

  /** The slide animating out, rendered layered behind/with the incoming slide for the
   *  duration of the transition, then cleared once its exit animation finishes. */
  previousSlide = signal<IPodcast | null>(null);
  exitDirection = signal<SlideDirection>('forward');

  featuredPodcasts = computed(() => this.podcasts().slice(0, FEATURED_COUNT));
  subscriptionsPreview = computed(() => this.subscriptionsService.subscriptions().slice(0, SUBSCRIPTIONS_PREVIEW_COUNT));
  currentSlide = computed<IPodcast | null>(() => this.podcasts()[this.carouselIndex()] ?? null);

  breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', link: ['/'] },
    { label: 'Podcasts' },
  ]);

  ngOnInit(): void {
    this.loading.set(true);
    this.podcastQuery
      .search('popular')
      .then((res) => {
        this.podcasts.set(shuffleArray(res.results || []));
        this.startCarousel();
      })
      .catch((err) => this.error.set(err?.message || 'Failed to load popular podcasts'))
      .finally(() => this.loading.set(false));
  }

  ngOnDestroy(): void {
    clearInterval(this.carouselTimer);
    clearTimeout(this.previousSlideTimer);
  }

  nextSlide(): void {
    const total = this.podcasts().length;
    if (total > 0) {
      this.transitionTo((this.carouselIndex() + 1) % total, 'forward');
    }
  }

  prevSlide(): void {
    const total = this.podcasts().length;
    if (total > 0) {
      this.transitionTo((this.carouselIndex() - 1 + total) % total, 'backward');
    }
  }

  goToSlide(index: number): void {
    this.transitionTo(index, index >= this.carouselIndex() ? 'forward' : 'backward');
  }

  openPodcast(podcast: IPodcast): void {
    this.podcastSelection.select(podcast);
    this.router.navigate(['/podcasts/detail', encodeURIComponent(podcast.feedUrl || '')]);
  }

  private startCarousel(): void {
    clearInterval(this.carouselTimer);
    if (this.podcasts().length > 1) {
      this.carouselTimer = setInterval(() => this.nextSlide(), CAROUSEL_INTERVAL_MS);
    }
  }

  /** Swaps to a new slide index, animating the outgoing and incoming images simultaneously
   *  in the same direction: forward = old exits left / new enters from the right, backward = the mirror. */
  private transitionTo(index: number, direction: SlideDirection): void {
    const outgoing = this.currentSlide();

    this.carouselIndex.set(index);
    this.restartSlideAnimation(direction === 'forward' ? 'slide-in-right' : 'slide-in-left');

    clearTimeout(this.previousSlideTimer);
    this.exitDirection.set(direction);
    this.previousSlide.set(outgoing);
    this.previousSlideTimer = setTimeout(() => this.previousSlide.set(null), SLIDE_ANIMATION_MS);
  }

  /**
   * The incoming slide is a single persistent DOM node (not recreated per index), so its
   * entrance animation needs to be explicitly restarted: remove the class, force a reflow,
   * then re-add it. Deferred a frame so it runs after the new background-image/title bindings
   * have actually painted, avoiding a flash of the old content mid-animation.
   */
  private restartSlideAnimation(enterClass: 'slide-in-right' | 'slide-in-left'): void {
    requestAnimationFrame(() => {
      const el = this.slideElRef?.nativeElement;
      if (!el) return;
      el.classList.remove('slide-in-right', 'slide-in-left');
      void el.offsetWidth;
      el.classList.add(enterClass);
    });
  }
}
