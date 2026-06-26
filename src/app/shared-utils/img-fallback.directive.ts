import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';

const DEFAULT_FALLBACK_SRC = 'https://www.sky-tunes.com/assets/default_album_cover.jpg';

@Directive({
  selector: 'img[appImgFallback]',
})
export class ImgFallbackDirective {
  private readonly el = inject(ElementRef<HTMLImageElement>);

  fallbackSrc = input(DEFAULT_FALLBACK_SRC);

  @HostListener('error')
  onError(): void {
    const img = this.el.nativeElement;
    if (img.src !== this.fallbackSrc()) {
      img.src = this.fallbackSrc();
    }
  }
}
