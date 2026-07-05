import { TestBed } from '@angular/core/testing';
import { AnnouncerSettingsService } from './announcer-settings.service';

describe('AnnouncerSettingsService.setNameDefault', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('seeds the name when still the default', () => {
    const svc = TestBed.inject(AnnouncerSettingsService);
    svc.setNameDefault('Milton');
    expect(svc.settings().name).toBe('Milton');

    svc.setNameDefault('Ada');
    expect(svc.settings().name).toBe('Ada');
    expect(JSON.parse(localStorage.getItem('sky-tunes-announcer-settings')!).name).toBe('Ada');
  });

  it('does not clobber a user-customized name', () => {
    const svc = TestBed.inject(AnnouncerSettingsService);
    svc.update({ ...svc.settings(), name: 'MyCustomName' });
    svc.setNameDefault('SomeoneElse');
    expect(svc.settings().name).toBe('MyCustomName');
  });

  it('is a no-op when the default already matches', () => {
    const svc = TestBed.inject(AnnouncerSettingsService);
    // Default is 'Milton'; setting the same default should not error or change anything.
    svc.setNameDefault('Milton');
    expect(svc.settings().name).toBe('Milton');
  });
});