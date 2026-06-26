import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { CastService } from 'shared-utils';

@Component({
  selector: 'app-cast-button',
  templateUrl: './cast-button.html',
  styleUrl: './cast-button.css',
})
export class CastButton implements OnDestroy {
  protected cast = inject(CastService);

  protected isAvailable = signal(false);
  protected isConnected = signal(false);
  protected deviceName = signal('');

  private subs: Subscription[] = [
    this.cast.isAvailable$.subscribe((v) => this.isAvailable.set(v)),
    this.cast.isConnected$.subscribe((v) => this.isConnected.set(v)),
    this.cast.deviceName$.subscribe((v) => this.deviceName.set(v)),
  ];

  ngOnDestroy(): void {
    for (const s of this.subs) s.unsubscribe();
  }

  toggleCast(): void {
    if (this.isConnected()) {
      this.cast.disconnect();
    } else {
      this.cast.connect();
    }
  }
}
