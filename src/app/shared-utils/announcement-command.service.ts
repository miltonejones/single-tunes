import { Injectable } from '@angular/core';
import { AnnouncementQueryService } from './announcement-query.service';
import { SpeechPlaybackService } from './speech-playback.service';
import { buildAnnounceProps, shouldAnnounce } from './domain/announcement';
import { SpeechCallback } from './models';

@Injectable({
  providedIn: 'root',
})
export class AnnouncementCommandService {
  constructor(
    private announcementQuery: AnnouncementQueryService,
    private speech: SpeechPlaybackService,
  ) {}

  /** Fetches a spoken announcement for a track change and speaks it, unless the track is too short. */
  async announceTrackChange(
    artist: string | null | undefined,
    title: string | null | undefined,
    trackDurationMs: number,
    chatName: string,
    chatZip: string,
    chatType: string = 'deep',
    voiceURI: string = '',
    onSpeechStart: SpeechCallback | null = null,
    onSpeechEnd: SpeechCallback | null = null,
    onSpeechError: SpeechCallback | null = null,
  ): Promise<boolean> {
    if (!shouldAnnounce(trackDurationMs)) {
      onSpeechEnd?.();
      return false;
    }

    const props = buildAnnounceProps(artist, title, chatName, chatZip);

    try {
      const messageContent = await this.announcementQuery.fetchAnnouncement(props, chatType);
      if (!messageContent) {
        onSpeechError?.();
        return false;
      }

      this.speech.speak(messageContent, onSpeechStart, onSpeechEnd, voiceURI);
      return true;
    } catch (error) {
      console.error('Announcement failed:', error);
      onSpeechError?.();
      return false;
    }
  }
}
