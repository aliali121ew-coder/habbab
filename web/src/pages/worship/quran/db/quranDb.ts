/**
 * Lightweight zero-dependency IndexedDB wrapper (~1.5 KB) for the Quran module.
 * Stores Mushaf pages, cached tafsirs, colored bookmarks, Khatmah progress, and audio blobs.
 */

const DB_NAME = 'ahbab-quran-db';
const DB_VERSION = 1;

export type QuranStoreName = 'pages' | 'tafsirs' | 'bookmarks' | 'khatmah' | 'audio';

export interface StoredBookmark {
  id: string;
  surah: number;
  ayah: number;
  page: number;
  color: string;
  label: string;
  note: string;
  createdAt: number;
}

export interface KhatmahRecord {
  id: string;
  startDate: string;
  targetDays: number;
  completedPages: number[];
  completedDays: string[];
  finishedAt?: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const stores: QuranStoreName[] = ['pages', 'tafsirs', 'bookmarks', 'khatmah', 'audio'];
        for (const name of stores) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

export async function idbGet<T>(store: QuranStoreName, key: IDBValidKey): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function idbSet<T>(store: QuranStoreName, key: IDBValidKey, value: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Gracefully degrade if storage quota is full or private mode blocks IDB.
  }
}

export async function idbDelete(store: QuranStoreName, key: IDBValidKey): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function idbGetAll<T>(store: QuranStoreName): Promise<T[]> {
  try {
    const db = await openDb();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbCount(store: QuranStoreName): Promise<number> {
  try {
    const db = await openDb();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}
