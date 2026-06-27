import { Directive, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';

// Targets phones in landscape (360–430 px tall) but not tablets (768 px+) or desktop.
const LANDSCAPE_MOBILE = '(orientation: landscape) and (max-height: 550px)';

@Directive({
  selector: '[libCoverflow]',
  standalone: true,
})
export class CoverflowDirective implements OnInit, OnDestroy {
  private host: HTMLElement;
  private mq = window.matchMedia(LANDSCAPE_MOBILE);
  private rafId = 0;
  private ro: ResizeObserver;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private zone: NgZone,
  ) {
    this.host = elementRef.nativeElement;
    this.ro = new ResizeObserver(() => this.update());
  }

  ngOnInit(): void {
    this.mq.addEventListener('change', this.onMqChange);
    this.zone.runOutsideAngular(() => {
      this.host.addEventListener('scroll', this.onScroll, { passive: true });
      this.ro.observe(this.host);
    });
    this.update();
  }

  ngOnDestroy(): void {
    this.mq.removeEventListener('change', this.onMqChange);
    this.host.removeEventListener('scroll', this.onScroll);
    this.ro.disconnect();
    cancelAnimationFrame(this.rafId);
  }

  private onScroll = () => {
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => this.update());
  };

  private onMqChange = () => this.update();

  private update(): void {
    const children = Array.from(this.host.children) as HTMLElement[];

    if (!this.mq.matches) {
      children.forEach((c) => {
        c.style.transform = '';
        c.style.zIndex = '';
      });
      return;
    }

    const containerMid = this.host.scrollLeft + this.host.offsetWidth / 2;

    children.forEach((child) => {
      const childMid = child.offsetLeft + child.offsetWidth / 2;
      const offset = (childMid - containerMid) / child.offsetWidth;
      const clamped = Math.max(-2.5, Math.min(2.5, offset));

      const rotateY = -clamped * 45;
      const scale = Math.max(0.72, 1 - Math.abs(clamped) * 0.14);
      const tz = -Math.abs(clamped) * 60;

      child.style.transform = `perspective(600px) rotateY(${rotateY}deg) scale(${scale}) translateZ(${tz}px)`;
      child.style.zIndex = String(Math.round(10 - Math.abs(clamped) * 4));
    });
  }
}
