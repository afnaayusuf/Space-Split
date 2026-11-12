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
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as StoredFile | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Stores the file, or removes it when `file` is null. False when the browser refuses. */
export async function saveFile(key: string, file: StoredFile | null): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      const req = file ? store.put(file, key) : store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
