import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AudioAnalyserService {
  analyser = signal<AnalyserNode | null>(null);
  audioContext = signal<AudioContext | null>(null);

  // Whether the analyser is actually getting readable data for the track currently
  // loaded. False while a track is playing via the no-CORS fallback (see AudioPlayer).
  available = signal(true);

  setAvailable(isAvailable: boolean): void {
    this.available.set(isAvailable);
  }

  /** Wires the given audio element into a Web Audio analyser graph. Safe to call more than once. */
  initialize(audioElement: HTMLAudioElement): AnalyserNode {
    const existing = this.analyser();
    if (existing) {
      return existing;
    }

    const audioContext = new AudioContext();
    this.audioContext.set(audioContext);
    const analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;

    // createMediaElementSource reroutes the element's output through the Web Audio
    // graph, so the analyser must be chained back to the destination or playback goes silent.
    const source = audioContext.createMediaElementSource(audioElement);
    source.connect(analyserNode);
    analyserNode.connect(audioContext.destination);

    this.analyser.set(analyserNode);
    return analyserNode;
  }
}
