import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AirplayService } from 'shared-utils';

@Component({
  selector: 'app-airplay-button',
  templateUrl: './airplay-button.html',
  styleUrl: './airplay-button.css',
})
export class AirplayButton implements OnDestroy {
  protected airplay = inject(AirplayService);

  protected isAvailable = signal(false);
  protected isConnected = signal(false);

  private subs: Subscription[] = [
    this.airplay.isAvailable$.subscribe((v) => this.isAvailable.set(v)),
    this.airplay.isConnected$.subscribe((v) => this.isConnected.set(v)),
  ];

  ngOnDestroy(): void {
    for (const s of this.subs) s.unsubscribe();
  }

  showPicker(): void {
    this.airplay.showPicker();
  }
}
