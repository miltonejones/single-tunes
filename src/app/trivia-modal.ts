import { Component, inject } from '@angular/core';
import { SpeechPlaybackService } from 'shared-utils';
import { TriviaPanelService } from './trivia-panel.service';
import { TriviaSettingsService } from './trivia-settings.service';

@Component({
  selector: 'app-trivia-modal',
  imports: [],
  templateUrl: './trivia-modal.html',
  styleUrl: './trivia-modal.css',
})
export class TriviaModal {
  private speechPlayback = inject(SpeechPlaybackService);
  protected panel = inject(TriviaPanelService);
  protected triviaSettings = inject(TriviaSettingsService);

  toggleSpoken(): void {
    const enabled = this.triviaSettings.settings().spokenEnabled;
    if (enabled) {
      // Cancelling here fires the in-flight utterance's onerror handler, which
      // AudioPlayer already wires up to restore the ducked volume — so muting
      // mid-speech doesn't leave playback stuck at ANNOUNCING_VOLUME.
      this.speechPlayback.stop();
    }
    this.triviaSettings.setSpokenEnabled(!enabled);
  }

  close(): void {
    this.panel.close();
  }
}
