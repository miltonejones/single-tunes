import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FirstRunGate } from './first-run-gate';
import { UserService } from './shared-utils/user.service';
import { AnnouncerSettingsService } from './announcer-settings.service';

describe('FirstRunGate', () => {
  let fixture: ComponentFixture<FirstRunGate>;
  let component: FirstRunGate;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [FirstRunGate] });
    fixture = TestBed.createComponent(FirstRunGate);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('cannot submit with an empty name', () => {
    expect(component.canSubmit).toBe(false);
  });

  it('submit stores the user and seeds the announcer name', async () => {
    component.name.set('Grace');
    expect(component.canSubmit).toBe(true);

    await component.submit();
    await Promise.resolve(); // let the setName promise settle

    const user = TestBed.inject(UserService);
    expect(user.user()?.name).toBe('Grace');

    const announcer = TestBed.inject(AnnouncerSettingsService);
    expect(announcer.settings().name).toBe('Grace');
  });
});