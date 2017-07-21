const DB_NAME = 'channels-web-lib';
const DB_VERSION = 1;

const STORE_SWITCHES = "switches";

const MODE_READWRITE = "readwrite";
const MODE_READ = "readonly";

export interface SwitchInfo {
  id?: number;
  url: string;
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
        if (!db.objectStoreNames.contains(STORE_SWITCHES)) {
          const store = db.createObjectStore(STORE_SWITCHES, { keyPath: 'id', autoIncrement: true });
          store.createIndex('url', 'url', { unique: true });
        }
      };
    });
  }

  getStore(name: string, mode: IDBTransactionMode): IDBObjectStore {
    const tx = this.db.transaction(name, mode);
    return tx.objectStore(name);
  }

  saveProvider(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const store = this.getStore(STORE_SWITCHES, MODE_READWRITE);
      try {
        const switchInfo: SwitchInfo = {
          url: url
        };
        const request = store.add(switchInfo);
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

  getProviderByUrl(url: string): Promise<SwitchInfo> {
    return new Promise<SwitchInfo>((resolve, reject) => {
      const store = this.getStore(STORE_SWITCHES, MODE_READ);
      const index = store.index('url');
      const request = index.get(url);
      request.onerror = (event) => {
        console.error("Failed to load registry from DB: ", event);
        reject(new Error("Failed to load registry: " + event));
      };
      request.onsuccess = (event) => {
        resolve(request.result as SwitchInfo);
      };
    });
  }

  getProviderById(id: number): Promise<SwitchInfo> {
    return new Promise<SwitchInfo>((resolve, reject) => {
      const store = this.getStore(STORE_SWITCHES, MODE_READ);
      const request = store.get(id);
      request.onerror = (event) => {
        console.error("Failed to load registry from DB: ", event);
        reject(new Error("Failed to load registry: " + event));
      };
      request.onsuccess = (event) => {
        resolve(request.result as SwitchInfo);
      };
    });
  }

  getAllProviders(): Promise<SwitchInfo[]> {
    return new Promise<SwitchInfo[]>((resolve, reject) => {
      const store = this.getStore(STORE_SWITCHES, MODE_READ);
      const request = store.openCursor();
      const result: SwitchInfo[] = [];
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
