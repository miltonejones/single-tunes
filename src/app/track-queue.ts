import { Component, inject, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { AudioPlayerCommandService, ImgFallbackDirective, ITrackItem } from 'shared-utils';
import { TrackQueuePanelService } from './track-queue-panel.service';
import { TrackDedicationService } from './track-dedication.service';

@Component({
  selector: 'app-track-queue',
  imports: [ImgFallbackDirective],
  templateUrl: './track-queue.html',
  styleUrl: './track-queue.css',
})
export class TrackQueue implements AfterViewInit {
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  protected panel = inject(TrackQueuePanelService);
  private dedicationService = inject(TrackDedicationService);

  queue = signal<ITrackItem[]>([]);
  currentTrackId = signal<number | null>(null);
  editingDedicationTrackId = signal<number | null>(null);
  dedicationInput = signal<string>('');

  @ViewChild('dedicationInputEl') dedicationInputEl!: ElementRef<HTMLInputElement>;

  constructor() {
    this.audioPlayerCommand.queue$.subscribe((queue) => this.queue.set(queue));
    this.audioPlayerCommand.currentTrack$.subscribe((track) => {
      this.currentTrackId.set(track?.ID ?? null);
    });
  }

  ngAfterViewInit(): void {
    // Focus the input when editing mode is activated
    // We need to watch for changes to editingDedicationTrackId
  }

  selectTrack(track: ITrackItem): void {
    this.audioPlayerCommand.selectTrack(track);
    this.panel.close();
  }

  toggleDedicationEdit(track: ITrackItem): void {
    if (this.editingDedicationTrackId() === track.ID) {
      // Close the edit mode
      this.editingDedicationTrackId.set(null);
      this.dedicationInput.set('');
    } else {
      // Open the edit mode for this track
      this.editingDedicationTrackId.set(track.ID ?? null);
      this.dedicationInput.set(this.dedicationService.getDedication(track.ID!) || '');

      // Focus the input after a short delay to ensure it's rendered
      setTimeout(() => {
        if (this.dedicationInputEl?.nativeElement) {
          this.dedicationInputEl.nativeElement.focus();
        }
      }, 0);
    }
  }

  saveDedication(track: ITrackItem): void {
    if (track.ID !== undefined) {
      const name = this.dedicationInput().trim();
      if (name) {
        this.dedicationService.setDedication(track.ID, name);
        // Update the track in the queue with the dedication
        const updatedQueue = this.queue().map(t =>
          t.ID === track.ID ? { ...t, dedicationName: name } : t
        );
        this.queue.set(updatedQueue);
      } else {
        this.dedicationService.removeDedication(track.ID);
        // Remove dedication from the track
        const updatedQueue = this.queue().map(t =>
          t.ID === track.ID ? { ...t, dedicationName: undefined } : t
        );
        this.queue.set(updatedQueue);
      }
    }
    this.editingDedicationTrackId.set(null);
    this.dedicationInput.set('');
  }

  cancelDedicationEdit(): void {
    this.editingDedicationTrackId.set(null);
    this.dedicationInput.set('');
  }

  getDedicationName(track: ITrackItem): string | undefined {
    if (track.dedicationName) {
      return track.dedicationName;
    }
    if (track.ID !== undefined) {
      return this.dedicationService.getDedication(track.ID);
    }
    return undefined;
  }
}