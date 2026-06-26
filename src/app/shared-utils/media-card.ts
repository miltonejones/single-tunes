import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ImgFallbackDirective } from './img-fallback.directive';

@Component({
  selector: 'lib-media-card',
  imports: [RouterLink, ImgFallbackDirective],
  templateUrl: './media-card.html',
  styleUrl: './media-card.css',
})
export class MediaCard {
  thumbnail = input<string | null>(null);
  alt = input<string | null>(null);
  eyebrow = input<string | null>(null);
  title = input<string | null>(null);
  subtitle = input<string | null>(null);
  caption = input<string | null>(null);
  routerLink = input<readonly unknown[] | null>(null);
}
