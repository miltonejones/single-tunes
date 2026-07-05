// IndexedDB storage for offline state

export interface SyncStateRecord {
  id: string;
  userKey: string;
  state: any;
  timestamp: number;
  synced: boolean;
}

export class SyncStorage {
  private db: IDBDatabase | null = null;
  private dbName = 'sync-db';
  private storeName = 'sync-states';
  private version = 1;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store for sync states
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('userKey', 'userKey', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async saveState(record: SyncStateRecord): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingStates(userKey: string): Promise<SyncStateRecord[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const transaction = this.db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('userKey');

    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(userKey));
      request.onsuccess = () => {
        const records = request.result.filter(record => !record.synced);
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async markAsSynced(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.synced = true;
        const putRequest = store.put(record);
        putRequest.onerror = () => console.error('Failed to mark as synced:', putRequest.error);
      }
    };
    getRequest.onerror = () => console.error('Failed to get record:', getRequest.error);
  }
}