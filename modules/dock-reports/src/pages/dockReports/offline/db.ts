// Ported 1:1 from the NPM tool (app/src/pages/dockReports/offline/db.ts).
// Minimal promise-based wrapper over the native IndexedDB API - no library,
// this is genuinely all the surface area this needs (two object stores, a
// handful of get/put/delete calls). IndexedDB (not localStorage) is the
// actual mechanism that makes a Dock Report survive a closed tab/browser
// with no connection - see ~/npm_tool/docs/dock-report-offline-sync.md.
const DB_NAME = "npm-tool-offline";
const DB_VERSION = 1;
export const DRAFTS_STORE = "dock_report_drafts";
export const BLOBS_STORE = "dock_report_blobs";
export const REFERENCE_STORE = "dock_report_reference_cache";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(REFERENCE_STORE)) {
        db.createObjectStore(REFERENCE_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbGet = <T>(store: string, key: string): Promise<T | undefined> => withStore<T>(store, "readonly", (s) => s.get(key));

export const idbPut = (store: string, value: unknown): Promise<void> =>
  withStore<IDBValidKey>(store, "readwrite", (s) => s.put(value)).then(() => undefined);

export const idbDelete = (store: string, key: string): Promise<void> =>
  withStore<undefined>(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
