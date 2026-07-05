import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ShazamPanelService } from './shazam-panel.service';
import { ShazamService, ShazamTrack } from './shazam.service';
import { RecorderPanelService } from './recorder-panel.service';
import { ToastService } from './toast.service';

const RECORD_SECONDS = 5;
// webm/opus everywhere except Safari, which only records audio/mp4.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

type ShazamPhase = 'requesting' | 'recording' | 'identifying' | 'result' | 'no-match' | 'error';

/**
 * Records 5 seconds of mic audio, sends it to the Shazam API for
 * recognition, and offers to look the match up in the YouTube search modal.
 * Rendered @if-gated by ShazamPanelService, so recording starts on init.
 */
@Component({
  selector: 'app-shazam-modal',
  imports: [],
  templateUrl: './shazam-modal.html',
  styleUrl: './shazam-modal.css',
})
export class ShazamModal implements OnInit, OnDestroy {
  protected panel = inject(ShazamPanelService);
  private shazam = inject(ShazamService);
  private recorderPanel = inject(RecorderPanelService);
  private toast = inject(ToastService);

  phase = signal<ShazamPhase>('requesting');
  secondsLeft = signal(RECORD_SECONDS);
  track = signal<ShazamTrack | null>(null);
  error = signal('');

  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private countdownTimer?: ReturnType<typeof setInterval>;
  // Bumped whenever a capture is abandoned so stale async results are dropped.
  private session = 0;

  ngOnInit(): void {
    this.listen();
  }

  ngOnDestroy(): void {
    this.session++;
    this.stopCapture();
  }

  async listen(): Promise<void> {
    const session = ++this.session;
    this.stopCapture();
    this.track.set(null);
    this.error.set('');
    this.secondsLeft.set(RECORD_SECONDS);
    this.phase.set('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (session !== this.session) return;
      this.error.set('Microphone access is required to identify songs.');
      this.phase.set('error');
      return;
    }
    if (session !== this.session) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    this.stream = stream;
    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.recorder = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      this.stopCapture();
      if (session !== this.session) return;
      this.identify(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), session);
    };
    recorder.start();
    this.phase.set('recording');

    this.countdownTimer = setInterval(() => {
      const next = this.secondsLeft() - 1;
      this.secondsLeft.set(next);
      if (next <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = undefined;
        if (recorder.state !== 'inactive') recorder.stop();
      }
    }, 1000);
  }

  private async identify(clip: Blob, session: number): Promise<void> {
    this.phase.set('identifying');
    try {
      const uuid = await this.shazam.recognize(clip);
      const track = await this.shazam.waitForResults(uuid);
      if (session !== this.session) return;
      if (track) {
        this.track.set(track);
        this.phase.set('result');
      } else {
        this.phase.set('no-match');
      }
    } catch (err) {
      if (session !== this.session) return;
      this.error.set(err instanceof Error ? err.message : 'Song recognition failed');
      this.phase.set('error');
      this.toast.show('Song recognition failed');
    }
  }

  findOnYouTube(): void {
    const track = this.track();
    if (!track) return;
    this.close();
    this.recorderPanel.open(`${track.subtitle} - ${track.title}`, true);
  }

  close(): void {
    this.session++;
    this.stopCapture();
    this.panel.close();
  }

  /** Stops the recorder and releases the mic; safe to call in any state. */
  private stopCapture(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
    if (this.recorder) {
      const recorder = this.recorder;
      this.recorder = undefined;
      if (recorder.state !== 'inactive') {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }
}
