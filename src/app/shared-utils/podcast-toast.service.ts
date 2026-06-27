import { Injectable, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root',
})
export class PodcastToastService {
  private toast = inject(ToastService);

  alert(body: string, _title: string = 'SkyTunes', _caption: string = ''): void {
    this.toast.show(body);
  }
}
