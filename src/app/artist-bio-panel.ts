import { Component, inject, signal } from '@angular/core';
import { AudioPlayerCommandService, CatalogQueryService, IArtistBio, ITrackItem } from 'shared-utils';
import { ArtistBioPanelService } from './artist-bio-panel.service';

@Component({
  selector: 'app-artist-bio-panel',
  imports: [],
  templateUrl: './artist-bio-panel.html',
  styleUrl: './artist-bio-panel.css',
})
export class ArtistBioPanel {
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private catalogQuery = inject(CatalogQueryService);
  protected panel = inject(ArtistBioPanelService);

  track = signal<ITrackItem | null>(null);
  bio = signal<IArtistBio | null>(null);
  loading = signal(false);

  // Tracks which artist the in-flight/last-resolved bio belongs to, so consecutive
  // tracks by the same artist (e.g. an album) don't trigger a redundant fetch, and
  // a stale response from a since-superseded artist never overwrites a newer one.
  private lastArtistFk: number | null = null;
  private requestId = 0;

  constructor() {
    this.audioPlayerCommand.currentTrack$.subscribe((track) => this.handleTrack(track));
  }

  private handleTrack(track: ITrackItem | null): void {
    this.track.set(track);

    const artistFk = track?.artistFk ?? null;
    if (artistFk === this.lastArtistFk) {
      return;
    }
    this.lastArtistFk = artistFk;

    if (!artistFk) {
      this.bio.set(null);
      this.loading.set(false);
      return;
    }

    const requestId = ++this.requestId;
    this.loading.set(true);
    this.bio.set(null);

    this.catalogQuery
      .getExtendedArtistDetail(artistFk)
      .then((bio) => {
        if (requestId !== this.requestId) return;
        this.bio.set(bio?.messageContent || bio?.description ? bio : null);
      })
      .catch(() => {
        if (requestId !== this.requestId) return;
        this.bio.set(null);
      })
      .finally(() => {
        if (requestId !== this.requestId) return;
        this.loading.set(false);
      });
  }
}
