import { Component, Input } from '@angular/core';

export type LoadingVariant = 'visualizer' | 'vinyl' | 'notes';

@Component({
  selector: 'lib-loading-animation',
  templateUrl: './loading-animation.html',
  styleUrl: './loading-animation.css',
  standalone: true,
})
export class LoadingAnimation {
  @Input() variant: LoadingVariant = 'visualizer';
  @Input() label = 'Loading';
}
