import { Component, inject, signal } from '@angular/core';
import { AudioPlayerCommandService, ImgFallbackDirective, ITrackItem } from 'shared-utils';
import { TrackQueuePanelService } from './track-queue-panel.service';

@Component({
  selector: 'app-track-queue',
  imports: [ImgFallbackDirective],
  templateUrl: './track-queue.html',
  styleUrl: './track-queue.css',
})
export class TrackQueue {
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  protected panel = inject(TrackQueuePanelService);

  queue = signal<ITrackItem[]>([]);
  currentTrackId = signal<number | null>(null);

  constructor() {
    this.audioPlayerCommand.queue$.subscribe((queue) => this.queue.set(queue));
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.currentTrackId.set(track?.ID ?? null);
    });
  }

  selectTrack(track: ITrackItem): void {
    this.audioPlayerCommand.selectTrack(track);
    this.panel.close();
  }
}
