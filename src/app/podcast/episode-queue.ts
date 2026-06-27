import { Component, inject, signal } from '@angular/core';
import { PodcastAudioPlayerCommandService, PodcastSelectionService, formatDuration, ITrack } from 'shared-utils';
import { EpisodeQueuePanelService } from './episode-queue-panel.service';

@Component({
  selector: 'app-episode-queue',
  imports: [],
  templateUrl: './episode-queue.html',
  styleUrl: './episode-queue.css',
})
export class EpisodeQueue {
  private audioPlayerCommand = inject(PodcastAudioPlayerCommandService);
  protected podcastSelection = inject(PodcastSelectionService);
  protected panel = inject(EpisodeQueuePanelService);

  queue = signal<ITrack[]>([]);
  currentGuid = signal<string | null>(null);

  protected readonly formatDuration = formatDuration;

  constructor() {
    this.audioPlayerCommand.queue$.subscribe((queue) => this.queue.set(queue));
    this.audioPlayerCommand.currentTrack$.subscribe((track) => this.currentGuid.set(track?.guid ?? null));
  }

  selectTrack(track: ITrack): void {
    this.audioPlayerCommand.selectTrack(track);
    this.panel.close();
  }
}
