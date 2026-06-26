import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { AudioPlayerCommandService, CastService } from 'shared-utils';
import { AudioAnalyserService } from './audio-analyser.service';
import { AudioVisualizerPanelService } from './audio-visualizer-panel.service';

const BAR_GRADIENT_START = '#4f46e5';
const BAR_GRADIENT_END = '#ec4899';
const GRID_LINE_SPACING = 20;
/** Distance (px) from the bottom of the page at which the visualizer starts sliding away. */
const SCROLL_HIDE_THRESHOLD_PX = 300;

const VISUALIZER_MODES = [
  'bars',
  'mirroredBars',
  // 'radial',
  'area',
  'waveform',
  // 'blob',
  // 'waterfall',
] as const;
type VisualizerMode = (typeof VISUALIZER_MODES)[number];

@Component({
  selector: 'app-audio-visualizer',
  imports: [],
  templateUrl: './audio-visualizer.html',
  styleUrl: './audio-visualizer.css',
})
export class AudioVisualizer implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvasEl') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private audioAnalyserService = inject(AudioAnalyserService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private visualizerPanel = inject(AudioVisualizerPanelService);
  private castService: CastService = inject(CastService);
  private animationFrameId?: number;
  private frequencyData?: Uint8Array<ArrayBuffer>;
  private timeDomainData?: Uint8Array<ArrayBuffer>;
  private subs: Subscription[] = [];

  hasTrack = signal(false);

  private modeIndex = signal(0);
  protected mode = computed(() => VISUALIZER_MODES[this.modeIndex()]);

  /** Advances to the next visualization style; called on click. */
  protected cycleMode(): void {
    this.modeIndex.set((this.modeIndex() + 1) % VISUALIZER_MODES.length);
  }

  /** Whether a Cast session is active — synced from CastService for reactive templates. */
  protected isCasting = signal(false);

  isVisible = computed(
    () => this.hasTrack() && this.audioAnalyserService.available() && this.visualizerPanel.isOpen(),
  );

  showPanel = computed(() => this.hasTrack() && !this.isCasting() && this.visualizerPanel.isOpen());

  /** 0 = resting in place above the player, 1 = fully slid out of view. */
  private scrollHideProgress = signal(0);

  protected dockStyle = computed(() => {
    const progress = this.scrollHideProgress();
    return {
      transform: `translateY(${progress * 100}%)`,
      opacity: `${1 - progress}`,
      'pointer-events': progress > 0 ? 'none' : 'auto',
    };
  });

  private readonly onWindowScroll = (): void => this.updateScrollHide();

  ngOnInit(): void {
    this.subs.push(
      this.audioPlayerCommand.currentTrack$.subscribe((track) => {
        this.hasTrack.set(!!track);
      }),
      this.castService.isConnected$.subscribe((v) => this.isCasting.set(v)),
    );
  }

  ngAfterViewInit(): void {
    window.addEventListener('scroll', this.onWindowScroll, { passive: true });
    window.addEventListener('resize', this.onWindowScroll);
    this.updateScrollHide();

    const draw = () => {
      this.animationFrameId = requestAnimationFrame(draw);
      this.drawFrame();
    };
    draw();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('scroll', this.onWindowScroll);
    window.removeEventListener('resize', this.onWindowScroll);
    for (const s of this.subs) s.unsubscribe();
  }

  /** Slides the visualizer out of view once the user scrolls within
   * SCROLL_HIDE_THRESHOLD_PX of the bottom of the page, so it doesn't
   * permanently obscure the end of the page's content. */
  private updateScrollHide(): void {
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollableHeight <= 0) {
      this.scrollHideProgress.set(0);
      return;
    }
    const distanceFromBottom = scrollableHeight - window.scrollY;
    const progress = 1 - Math.min(1, Math.max(0, distanceFromBottom / SCROLL_HIDE_THRESHOLD_PX));
    this.scrollHideProgress.set(progress);
  }

  private drawFrame(): void {
    const analyser = this.audioAnalyserService.analyser();
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!analyser || !ctx) {
      return;
    }

    if (!this.frequencyData || this.frequencyData.length !== analyser.frequencyBinCount) {
      this.frequencyData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }
    if (!this.timeDomainData || this.timeDomainData.length !== analyser.fftSize) {
      this.timeDomainData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    }
    analyser.getByteFrequencyData(this.frequencyData);
    analyser.getByteTimeDomainData(this.timeDomainData);

    const { width, height } = canvas;
    const mode = this.mode();

    // Waterfall scrolls the existing canvas content rather than clearing it.
    // if (mode !== 'waterfall') {
    //
    // }
    ctx.clearRect(0, 0, width, height);
    switch (mode) {
      case 'bars':
        this.drawBars(ctx, width, height);
        break;
      case 'mirroredBars':
        this.drawMirroredBars(ctx, width, height);
        break;
      // case 'radial':
      //   this.drawRadial(ctx, width, height);
      //   break;
      case 'area':
        this.drawArea(ctx, width, height);
        break;
      case 'waveform':
        this.drawWaveform(ctx, width, height);
        break;
      // case 'blob':
      //   this.drawBlob(ctx, width, height);
      //   break;
      // case 'waterfall':
      //   this.drawWaterfall(ctx, width, height);
      //   break;
    }

    // if (mode !== 'waterfall') {
    this.drawGridOverlay(ctx, width, height);
    // }
  }

  private drawBars(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const data = this.frequencyData!;
    const barWidth = (width / data.length) * 2.5;
    let x = 0;

    for (let i = 0; i < data.length; i++) {
      const barHeight = (data[i] / 255) * height;
      const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
      gradient.addColorStop(0, BAR_GRADIENT_END);
      gradient.addColorStop(1, BAR_GRADIENT_START);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  private drawMirroredBars(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const data = this.frequencyData!;
    const barWidth = (width / data.length) * 2.5;
    const center = height / 2;
    let x = 0;

    for (let i = 0; i < data.length; i++) {
      const halfHeight = (data[i] / 255) * center;
      const gradient = ctx.createLinearGradient(0, center - halfHeight, 0, center + halfHeight);
      gradient.addColorStop(0, BAR_GRADIENT_START);
      gradient.addColorStop(0.5, BAR_GRADIENT_END);
      gradient.addColorStop(1, BAR_GRADIENT_START);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, center - halfHeight, barWidth, halfHeight * 2);
      x += barWidth + 1;
    }
  }

  private drawRadial(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const data = this.frequencyData!;
    const cx = width / 2;
    const cy = height / 2;
    const innerRadius = Math.min(width, height) * 0.18;
    const maxBarLength = Math.min(width, height) * 0.42;

    ctx.lineWidth = 2;
    for (let i = 0; i < data.length; i++) {
      const angle = (i / data.length) * Math.PI * 2;
      const magnitude = (data[i] / 255) * maxBarLength;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      ctx.strokeStyle = i % 2 === 0 ? BAR_GRADIENT_START : BAR_GRADIENT_END;
      ctx.beginPath();
      ctx.moveTo(cx + cos * innerRadius, cy + sin * innerRadius);
      ctx.lineTo(cx + cos * (innerRadius + magnitude), cy + sin * (innerRadius + magnitude));
      ctx.stroke();
    }
  }

  private drawArea(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const data = this.frequencyData!;
    const stepX = width / (data.length - 1);

    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height - (data[0] / 255) * height);
    for (let i = 1; i < data.length; i++) {
      const prevX = (i - 1) * stepX;
      const prevY = height - (data[i - 1] / 255) * height;
      const x = i * stepX;
      const y = height - (data[i] / 255) * height;
      const midX = (prevX + x) / 2;
      const midY = (prevY + y) / 2;
      ctx.quadraticCurveTo(prevX, prevY, midX, midY);
    }
    ctx.lineTo(width, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, BAR_GRADIENT_END);
    gradient.addColorStop(1, BAR_GRADIENT_START);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  private drawWaveform(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const data = this.timeDomainData!;
    const stepX = width / (data.length - 1);

    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = i * stepX;
      const y = (data[i] / 255) * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = BAR_GRADIENT_END;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawBlob(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const data = this.frequencyData!;
    const bassBinCount = Math.max(1, Math.floor(data.length * 0.12));
    let sum = 0;
    for (let i = 0; i < bassBinCount; i++) {
      sum += data[i];
    }
    const bassLevel = sum / bassBinCount / 255;

    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = Math.min(width, height) * 0.18;
    const radius = baseRadius + bassLevel * baseRadius * 1.5;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, BAR_GRADIENT_END);
    gradient.addColorStop(1, BAR_GRADIENT_START);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Scrolls existing canvas content left by one pixel and paints a new frequency column
   * at the right edge, building a scrolling spectrogram instead of redrawing each frame. */
  private drawWaterfall(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const data = this.frequencyData!;
    ctx.drawImage(ctx.canvas, -1, 0);

    const binHeight = height / data.length;
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      const hue = 260 - (value / 255) * 260;
      const lightness = 10 + (value / 255) * 40;
      ctx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;
      ctx.fillRect(width - 1, height - (i + 1) * binHeight, 1, binHeight + 1);
    }
  }

  private drawGridOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    for (let y = 0; y < height; y += GRID_LINE_SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }
}
