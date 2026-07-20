import { Component, effect, inject, OnDestroy, signal } from '@angular/core';
import { AnnouncerSettings, AnnouncerSettingsService } from './announcer-settings.service';
import { SettingsPanelService } from './settings-panel.service';
import { ThemeService, THEMES } from './theme.service';
import { TriviaSettings, TriviaSettingsService } from './trivia-settings.service';
import { FEATURE_FLAGS } from 'shared-utils';
import { LocationService, SpeechPlaybackService } from 'shared-utils';

@Component({
  selector: 'app-settings-modal',
  imports: [],
  templateUrl: './settings-modal.html',
  styleUrl: './settings-modal.css',
})
export class SettingsModal implements OnDestroy {
  private announcerSettings = inject(AnnouncerSettingsService);
  private triviaSettings = inject(TriviaSettingsService);
  private speechPlayback = inject(SpeechPlaybackService);
  protected locationService = inject(LocationService);
  protected panel = inject(SettingsPanelService);
  protected themeService = inject(ThemeService);
  protected readonly themes = THEMES;

  form = signal<AnnouncerSettings>(this.announcerSettings.settings());
  triviaForm = signal<TriviaSettings>(this.triviaSettings.settings());
  voices = signal<SpeechSynthesisVoice[]>(this.speechPlayback.getEnglishVoices());
  featureFlags = signal({ ...FEATURE_FLAGS });

  private onVoicesChanged = () => this.voices.set(this.speechPlayback.getEnglishVoices());

  constructor() {
    effect(() => {
      if (this.panel.isOpen()) {
        this.form.set(this.announcerSettings.settings());
        this.triviaForm.set(this.triviaSettings.settings());
        this.voices.set(this.speechPlayback.getEnglishVoices());
      }
    });

    window.speechSynthesis?.addEventListener('voiceschanged', this.onVoicesChanged);
  }

  ngOnDestroy(): void {
    window.speechSynthesis?.removeEventListener('voiceschanged', this.onVoicesChanged);
  }

  setField<K extends keyof AnnouncerSettings>(key: K, event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    this.form.update((current) => ({ ...current, [key]: value }) as AnnouncerSettings);
  }

  setTriviaField<K extends keyof TriviaSettings>(key: K, event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    this.triviaForm.update((current) => ({ ...current, [key]: value }) as TriviaSettings);
  }

  setFeatureFlag<K extends keyof typeof FEATURE_FLAGS>(key: K, event: Event): void {
    const target = event.target as HTMLInputElement;
    FEATURE_FLAGS[key].set(target.checked);
  }

  setTheme(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    const theme = THEMES.find((t) => t.key === key);
    if (theme) this.themeService.setTheme(theme);
  }

  save(): void {
    this.announcerSettings.update(this.form());
    this.triviaSettings.update(this.triviaForm());
    this.panel.close();
  }

  close(): void {
    this.panel.close();
  }
}
