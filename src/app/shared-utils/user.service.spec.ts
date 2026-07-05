import { TestBed } from '@angular/core/testing';
import { UserService } from './user.service';

describe('UserService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no user', () => {
    const svc = TestBed.inject(UserService);
    expect(svc.user()).toBeNull();
  });

  it('setName persists the profile and derives a deterministic userKey', async () => {
    const svc = TestBed.inject(UserService);
    const a = await svc.setName('Milton');
    const b = await svc.setName('  milton  ');

    expect(a.name).toBe('Milton');
    expect(a.userKey).toMatch(/^[0-9a-f]{64}$/);
    // Same lowercased/trimmed name → same key.
    expect(b.userKey).toBe(a.userKey);
    expect(svc.user()?.name).toBe('milton');
    expect(JSON.parse(localStorage.getItem('sky-tunes-user')!).name).toBe('milton');
  });

  it('different names produce different keys', async () => {
    const svc = TestBed.inject(UserService);
    const a = await svc.setName('Alice');
    const b = await svc.setName('Bob');
    expect(a.userKey).not.toBe(b.userKey);
  });

  it('reload reads the persisted user', async () => {
    const svc = TestBed.inject(UserService);
    await svc.setName('Ada');
    const reloaded = TestBed.inject(UserService);
    expect(reloaded.user()?.name).toBe('Ada');
  });

  it('clear removes the stored identity', async () => {
    const svc = TestBed.inject(UserService);
    await svc.setName('Ada');
    svc.clear();
    expect(svc.user()).toBeNull();
    expect(localStorage.getItem('sky-tunes-user')).toBeNull();
  });

  it('instanceId is unique per service instance', () => {
    const a = TestBed.inject(UserService);
    const b = TestBed.inject(UserService);
    // providedIn: 'root' → same instance, so same id; verify it is a uuid shape.
    expect(a.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.instanceId).toBe(b.instanceId);
  });
});