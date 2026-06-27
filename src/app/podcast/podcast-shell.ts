import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PodcastAudioPlayerCommandService } from 'shared-utils';

@Component({
  selector: 'app-podcast-shell',
  imports: [RouterOutlet],
  templateUrl: './podcast-shell.html',
  styleUrl: './podcast-shell.css',
})
export class PodcastShell {
  protected audioPlayerCommand = inject(PodcastAudioPlayerCommandService);
}
