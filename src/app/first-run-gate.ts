import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserService } from './shared-utils/user.service';
import { AnnouncerSettingsService } from './announcer-settings.service';

/**
 * Full-screen gate shown on first run (before a name is stored). The entered
 * first name is persisted by `UserService` and also becomes the default
 * announcer name. Until submit, the rest of the SkyTunes UI is not rendered.
 */
@Component({
  selector: 'app-first-run-gate',
  imports: [FormsModule],
  templateUrl: './first-run-gate.html',
  styleUrl: './first-run-gate.css',
})
export class FirstRunGate {
  private userService = inject(UserService);
  private announcerSettings = inject(AnnouncerSettingsService);

  name = signal('');
  protected submitting = signal(false);

  get canSubmit(): boolean {
    return this.name().trim().length > 0 && !this.submitting();
  }

  async submit(): Promise<void> {
    if (!this.canSubmit) return;
    this.submitting.set(true);
    const profile = await this.userService.setName(this.name());
    // Seed the announcer name with the entered first name (only if the user
    // hasn't already customized it away from the default).
    this.announcerSettings.setNameDefault(profile.name);
    this.submitting.set(false);
  }
}