import { SyncClient } from './sync-client';
import { SyncStorage } from './sync-storage';
import { SyncStrategy } from './sync-strategy';

describe('Sync Service Worker Module', () => {
  it('should export SyncClient', () => {
    expect(SyncClient).toBeDefined();
  });

  it('should export SyncStorage', () => {
    expect(SyncStorage).toBeDefined();
  });

  it('should export SyncStrategy', () => {
    expect(SyncStrategy).toBeDefined();
  });
});