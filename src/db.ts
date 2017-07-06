import { ChannelServiceDescription } from "channels-common";

const DB_NAME = 'channels-db';
const DB_VERSION = 2;

const STORE_PROVIDER_INFO = "providers";

const MODE_READWRITE = "readwrite";
const MODE_READ = "readonly";

export interface ProviderInfo {
  id?: number;
  providerUrl: string;
  details: ChannelServiceDescription;
}

export class ClientDb {

  private db: IDBDatabase;

  open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.db) {
        resolve();
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = (event) => {
        console.error("Failed to load DB: ", event);
        reject(new Error("Error loading database: " + event));
      };
      request.onsuccess = (event) => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as any).result as IDBDatabase;
        if (!db.objectStoreNames.contains(STORE_PROVIDER_INFO)) {
          const store = db.createObjectStore(STORE_PROVIDER_INFO, { keyPath: 'id', autoIncrement: true });
          store.createIndex('providerUrl', 'providerUrl', { unique: true });
        }
      };
    });
  }

  getStore(name: string, mode: IDBTransactionMode): IDBObjectStore {
    const tx = this.db.transaction(name, mode);
    return tx.objectStore(name);
  }

  saveProvider(url: string, details: ChannelServiceDescription): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const store = this.getStore(STORE_PROVIDER_INFO, MODE_READWRITE);
      try {
        const request = store.add({
          providerUrl: url,
          details: details
        });
        request.onerror = (event) => {
          reject(new Error("Error saving provider info: " + event));
        };
        request.onsuccess = (event) => {
          resolve();
        };
      } catch (ex) {
        reject(ex);
      }
    });
  }

  getProviderByUrl(url: string): Promise<ProviderInfo> {
    return new Promise<ProviderInfo>((resolve, reject) => {
      const store = this.getStore(STORE_PROVIDER_INFO, MODE_READ);
      const index = store.index('providerUrl');
      const request = index.get(url);
      request.onerror = (event) => {
        console.error("Failed to load registry from DB: ", event);
        reject(new Error("Failed to load registry: " + event));
      };
      request.onsuccess = (event) => {
        resolve(request.result as ProviderInfo);
      };
    });
  }

  getProviderById(id: number): Promise<ProviderInfo> {
    return new Promise<ProviderInfo>((resolve, reject) => {
      const store = this.getStore(STORE_PROVIDER_INFO, MODE_READ);
      const request = store.get(id);
      request.onerror = (event) => {
        console.error("Failed to load registry from DB: ", event);
        reject(new Error("Failed to load registry: " + event));
      };
      request.onsuccess = (event) => {
        resolve(request.result);
      };
    });
  }

  getAllProviders(): Promise<ProviderInfo[]> {
    return new Promise<ProviderInfo[]>((resolve, reject) => {
      const store = this.getStore(STORE_PROVIDER_INFO, MODE_READ);
      const request = store.openCursor();
      const result: ProviderInfo[] = [];
      request.onerror = (event) => {
        console.error("Failed to open registry cursor: ", event);
        reject(new Error("Failed to open registry cursor: " + event));
      };
      request.onsuccess = (event) => {
        const cursor = (event.target as any).result as IDBCursor;
        if (cursor) {
          result.push((cursor as any).value);
          cursor.continue();
        } else {
          resolve(result);
        }
      };
    });
  }
}
