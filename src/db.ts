import { RegistrationResponse } from './interfaces';

const DB_NAME = 'channels-db';
const DB_VERSION = 1;

const STORE_REGISTRIES = "registries";

const MODE_READWRITE = "readwrite";
const MODE_READ = "readonly";

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
        if (!event.oldVersion) {
          const store = db.createObjectStore(STORE_REGISTRIES, { keyPath: "services.registrationUrl" });
          store.createIndex("providerUrl", "services.providerUrl", { unique: true });
        }
      };
    });
  }

  getStore(name: string, mode: IDBTransactionMode): IDBObjectStore {
    const tx = this.db.transaction(name, mode);
    return tx.objectStore(name);
  }

  saveRegistry(registry: RegistrationResponse): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const store = this.getStore(STORE_REGISTRIES, MODE_READWRITE);
      try {
        const request = store.add(registry);
        request.onerror = (event) => {
          reject(new Error("Error saving registry: " + event));
        };
        request.onsuccess = (event) => {
          resolve();
        };
      } catch (ex) {
        reject(ex);
      }
    });
  }

  getRegistry(registerUrl?: string, providerUrl?: string): Promise<RegistrationResponse> {
    return new Promise<RegistrationResponse>((resolve, reject) => {
      const store = this.getStore(STORE_REGISTRIES, MODE_READ);
      let request: IDBRequest;
      if (registerUrl) {
        request = store.get(registerUrl);
      } else if (providerUrl) {
        const index = store.index('providerUrl');
        request = index.get(providerUrl);
      } else {
        resolve(null);
        return;
      }
      request.onerror = (event) => {
        console.error("Failed to load registry from DB: ", event);
        reject(new Error("Failed to load registry: " + event));
      };
      request.onsuccess = (event) => {
        resolve(request.result as RegistrationResponse);
      };
    });
  }

  getAllRegistries(): Promise<RegistrationResponse[]> {
    return new Promise<RegistrationResponse[]>((resolve, reject) => {
      const store = this.getStore(STORE_REGISTRIES, MODE_READ);
      const request = store.openCursor();
      const result: RegistrationResponse[] = [];
      request.onerror = (event) => {
        console.error("Failed to open registry cursor: ", event);
        reject(new Error("Failed to open registry cursor: " + event));
      };
      request.onsuccess = (event) => {
        const cursor = (event.target as any).result as IDBCursor;
        if (cursor) {
          result.push((cursor as any).value as RegistrationResponse);
          cursor.continue();
        } else {
          resolve(result);
        }
      };
    });
  }
}
