// Web / Windows desktop: parsed books live in IndexedDB (localStorage is capped at ~5 MB).
const DB_NAME = 'unfold';
const STORE = 'books';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = run(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function writeBookFile(id: string, json: string): Promise<void> {
  await tx('readwrite', (s) => s.put(json, id));
}

export async function readBookFile(id: string): Promise<string | null> {
  const v = await tx<unknown>('readonly', (s) => s.get(id));
  return typeof v === 'string' ? v : null;
}

export async function deleteBookFile(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}
