/** Files too big for localStorage (an uploaded truck model) are kept in IndexedDB, in this browser. */
const DB = 'waveforce';
const STORE = 'files';

export interface StoredFile {
  name: string;
  data: ArrayBuffer;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function loadFile(key: string): Promise<StoredFile | null> {
  try {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result as StoredFile | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Stores the file, or removes it when `file` is null. False when the browser refuses. */
export async function saveFile(key: string, file: StoredFile | null): Promise<boolean> {
  try {
    const db = await open();
    try {
      return await new Promise((resolve) => {
        // a write only counts once the transaction commits: a full disk shows up as an abort, after the request succeeded
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        if (file) store.put(file, key);
        else store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onabort = () => resolve(false);
        tx.onerror = () => resolve(false);
      });
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}
