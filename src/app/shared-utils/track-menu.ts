import { Component, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioPlayerCommandService } from './audio-player-command.service';
import { CatalogCommandService } from './catalog-command.service';
import { CatalogQueryService } from './catalog-query.service';
import { ImgFallbackDirective } from './img-fallback.directive';
import { IPlaylistSummary, ITrackItem } from './models';

type MenuView = 'main' | 'playlists';

@Component({
  selector: 'app-track-menu',
  imports: [RouterLink, ImgFallbackDirective],
  templateUrl: './track-menu.html',
  styleUrl: './track-menu.css',
})
export class TrackMenu implements OnInit {
  track = input<ITrackItem | null>(null);
  closed = output<void>();

  private catalogQuery = inject(CatalogQueryService);
  private catalogCommand = inject(CatalogCommandService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);

  menuView = signal<MenuView>('main');
  playlists = signal<IPlaylistSummary[]>([]);
  private queueLength = signal(0);

  canAddToQueue = computed(() => this.queueLength() > 0);

  constructor() {
    effect(() => {
      if (this.track()) {
        this.menuView.set('main');
      }
    });
  }

  ngOnInit(): void {
    this.catalogQuery.getPlaylists().then((playlists) => this.playlists.set(playlists));
    this.audioPlayerCommand.queue$.subscribe((queue) => this.queueLength.set(queue.length));
  }

  close(): void {
    this.closed.emit();
  }

  addToQueue(): void {
    const track = this.track();
    if (!track) return;
    this.audioPlayerCommand.addToQueue(track);
    this.close();
  }

  isTrackInPlaylist(playlist: IPlaylistSummary): boolean {
    const track = this.track();
    return !!track && playlist.related.includes(track.FileKey);
  }

  togglePlaylist(playlist: IPlaylistSummary): void {
    const track = this.track();
    if (!track) return;

    const alreadyIn = playlist.related.includes(track.FileKey);
    const updated: IPlaylistSummary = {
      ...playlist,
      related: alreadyIn
        ? playlist.related.filter((fileKey) => fileKey !== track.FileKey)
        : [...playlist.related, track.FileKey],
    };

    this.catalogCommand.savePlaylist(updated).then(() => {
      this.playlists.update((list) =>
        list.map((p) => (p.listKey === playlist.listKey ? updated : p)),
      );
    });
  }
}
