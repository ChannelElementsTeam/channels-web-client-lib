import { ChannelServiceDescription } from "channels-common";

const DB_NAME = 'channels-db';
const DB_VERSION = 1;

const STORE_PROVIDER_INFO = "providers";

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
        if (!db.objectStoreNames.contains(STORE_PROVIDER_INFO)) {
          db.createObjectStore(STORE_PROVIDER_INFO, { keyPath: "providerUrl" });
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

  getProvider(url: string): Promise<ChannelServiceDescription> {
    return new Promise<ChannelServiceDescription>((resolve, reject) => {
      const store = this.getStore(STORE_PROVIDER_INFO, MODE_READ);
      const request = store.get(url);
      request.onerror = (event) => {
        console.error("Failed to load registry from DB: ", event);
        reject(new Error("Failed to load registry: " + event));
      };
      request.onsuccess = (event) => {
        let response: ChannelServiceDescription = null;
        if (request.result) {
          response = request.result.details as ChannelServiceDescription;
        }
        resolve(response);
      };
    });
  }

  getAllProviders(): Promise<ChannelServiceDescription[]> {
    return new Promise<ChannelServiceDescription[]>((resolve, reject) => {
      const store = this.getStore(STORE_PROVIDER_INFO, MODE_READ);
      const request = store.openCursor();
      const result: ChannelServiceDescription[] = [];
      request.onerror = (event) => {
        console.error("Failed to open registry cursor: ", event);
        reject(new Error("Failed to open registry cursor: " + event));
      };
      request.onsuccess = (event) => {
        const cursor = (event.target as any).result as IDBCursor;
        if (cursor) {
          result.push((cursor as any).value.details as ChannelServiceDescription);
          cursor.continue();
        } else {
          resolve(result);
        }
      };
    });
  }
}
