import { Component, Input } from '@angular/core';

export type SkeletonVariant = 'grid' | 'list' | 'track-list';

@Component({
  selector: 'lib-skeleton-loader',
  template: `
    @switch (variant) {
      @case ('grid') {
        <div class="skeleton-grid">
          @for (_ of [].constructor(count); track $index) {
            <div class="skeleton-card">
              <div class="skeleton-img skeleton-pulse"></div>
              <div class="skeleton-line skeleton-pulse skeleton-line-sm"></div>
              <div class="skeleton-line skeleton-pulse skeleton-line-xs"></div>
            </div>
          }
        </div>
      }
      @case ('list') {
        <div class="skeleton-list">
          @for (_ of [].constructor(count); track $index) {
            <div class="skeleton-list-row">
              <div class="skeleton-icon skeleton-pulse"></div>
              <div class="skeleton-list-info">
                <div class="skeleton-line skeleton-pulse skeleton-line-md"></div>
                <div class="skeleton-line skeleton-pulse skeleton-line-xs"></div>
              </div>
            </div>
          }
        </div>
      }
      @case ('track-list') {
        <div class="skeleton-track-list">
          @for (_ of [].constructor(count); track $index) {
            <div class="skeleton-track-row">
              <div class="skeleton-icon skeleton-pulse"></div>
              <div class="skeleton-line skeleton-pulse skeleton-line-sm"></div>
              <div class="skeleton-line skeleton-pulse skeleton-line-md"></div>
              <div class="skeleton-line skeleton-pulse skeleton-line-xs" style="margin-left: auto;"></div>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [`
    .skeleton-pulse {
      background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-hover) 50%, var(--surface-2) 75%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s ease-in-out infinite;
      border-radius: var(--radius-sm);
    }

    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 1rem;
      padding: 0 1rem;
    }

    .skeleton-card {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .skeleton-img {
      width: 100%;
      aspect-ratio: 1;
      border-radius: var(--radius-md);
    }

    .skeleton-line {
      height: 0.85rem;
    }

    .skeleton-line-xs { width: 60%; }
    .skeleton-line-sm { width: 85%; }
    .skeleton-line-md { width: 70%; }

    .skeleton-list,
    .skeleton-track-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0 1rem;
    }

    .skeleton-list-row,
    .skeleton-track-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0;
    }

    .skeleton-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .skeleton-list-info {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      flex: 1;
    }

    .skeleton-track-row .skeleton-line:last-child {
      flex-shrink: 0;
    }

    @media (max-width: 576px) {
      .skeleton-grid {
        display: flex;
        flex-wrap: nowrap;
        overflow-x: hidden;
        gap: 0.75rem;
      }

      .skeleton-card {
        flex: 0 0 calc(50vw - 1rem);
      }
    }
  `],
  standalone: true,
})
export class SkeletonLoader {
  @Input() variant: SkeletonVariant = 'grid';
  @Input() count = 8;
}
