import { Injectable } from '@angular/core';
import { SpeechCallback } from './models';

@Injectable({
  providedIn: 'root',
})
export class SpeechPlaybackService {
  // Chrome garbage-collects a SpeechSynthesisUtterance that has no
  // outside reference, silently dropping speech with no error event —
  // keeping one around for the engine's duration is what makes speak()
  // reliably produce sound instead of just queuing a no-op.
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  // cancel() can't remove an utterance that hasn't been queued yet (see
  // the deferred speak() below), so a token marks each call's deferred
  // speak as stale the moment a newer one arrives. Without this, rapid
  // track changes leave several real, un-cancelled utterances queued —
  // the engine speaks them back to back, surfacing as the announcer
  // starting minutes late instead of not at all.
  private speakToken = 0;

  speak(
    messageContent: string,
    onSpeechStart: SpeechCallback | null = null,
    onSpeechEnd: SpeechCallback | null = null,
    voiceURI?: string,
  ): void {
    const token = ++this.speakToken;
    const utterance = new SpeechSynthesisUtterance(messageContent);
    this.currentUtterance = utterance;

    utterance.onstart = (event) => onSpeechStart?.(event, messageContent);
    utterance.onend = (event) => {
      if (this.currentUtterance === utterance) this.currentUtterance = null;
      onSpeechEnd?.(event, messageContent);
    };
    utterance.onerror = (event) => {
      if (this.currentUtterance === utterance) this.currentUtterance = null;
      console.error('Speech synthesis error:', event.error);
      onSpeechEnd?.();
    };

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    const voice = voiceURI ? this.getAvailableVoices().find((v) => v.voiceURI === voiceURI) : undefined;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    // Only cancel when the engine actually has something queued. On Chrome
    // desktop, calling cancel() while idle still flips it into a momentary
    // "cancelling" state that interrupts the very next speak() — even one
    // deferred a tick — which is what silently killed the very first
    // announcement of a session (nothing to cancel, yet cancel() ran anyway).
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
      // cancel() doesn't take effect instantly — speak()-ing again in the
      // same tick races it in Chrome and the new utterance gets silently
      // swallowed. Deferring to the next tick lets cancel() actually flush.
      setTimeout(() => {
        if (token !== this.speakToken) return;
        window.speechSynthesis.speak(utterance);
      }, 0);
    } else {
      window.speechSynthesis.speak(utterance);
    }
  }

  stop(): void {
    this.speakToken++;
    this.currentUtterance = null;
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
  }

  pause(): void {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
  }

  resume(): void {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }

  isSpeaking(): boolean {
    return window.speechSynthesis.speaking;
  }

  getAvailableVoices(): SpeechSynthesisVoice[] {
    return window.speechSynthesis.getVoices();
  }

  getEnglishVoices(): SpeechSynthesisVoice[] {
    return this.getAvailableVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  }
}
