// Offline save queue.
//
// A finished inspection is stored on the phone (IndexedDB) first, photos included, and uploaded
// to AWS afterwards by sync.ts. IndexedDB is used, not localStorage, because photos are too big
// for localStorage and because the app clears localStorage when a login expires.

export interface QueuedPhoto {
  id: string;
  blob: Blob; // already compressed and stamped with the location and time
  label: string; // used in the S3 file name, e.g. "p12" or "ok"
  key?: string; // set once the photo is in S3, so a retry never uploads it twice
}

export interface QueuedPanel {
  panel: number;
  defects: string[];
  notes: string;
  kept: string[]; // S3 keys of photos saved by an earlier check
  photos: QueuedPhoto[];
}

export interface QueuedInspection {
  id: string; // also sent to the server as batch_id, so a repeat upload is recognised
  username: string; // who did the check; only this person's login uploads it
  name: string;
  site: string;
  block: number;
  tracker: number;
  work_date: string; // YYYY-MM-DD, the day the check was done
  inspected_at: string; // ISO time the check was done
  panels: QueuedPanel[]; // empty = tracker checked, no issues
  okPhotos: QueuedPhoto[];
  okKept: string[];
  okNotes: string;
  createdAt: number;
  attempts: number;
  error?: string; // set when the server refused it; needs a person to look at it
}

export const QUEUE_CHANGED = "lumico:queue-changed";

const DB_NAME = "lumico-offline";
const STORE = "inspections";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot save on the phone."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open phone storage."));
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    let result!: T;
    const req = work(t.objectStore(STORE));
    req.onsuccess = () => {
      result = req.result;
    };
    t.oncomplete = () => {
      db.close();
      resolve(result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error ?? req.error ?? new Error("Phone storage failed."));
    };
    t.onabort = () => {
      db.close();
      reject(t.error ?? new Error("Phone storage is full or unavailable."));
    };
  });
}

const changed = () => window.dispatchEvent(new Event(QUEUE_CHANGED));

/** Store a new inspection on the phone and tell the app (which then tries to upload it). */
export async function enqueue(item: QueuedInspection): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(item));
  } catch {
    throw new Error("Could not save on this phone. Free up some storage and try again.");
  }
  changed();
}

/** Everything waiting on this phone, oldest first. */
export async function listQueue(): Promise<QueuedInspection[]> {
  const all = await run<QueuedInspection[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/** Update an item (photo keys, attempts, error). Does not announce a change. */
export async function saveItem(item: QueuedInspection): Promise<void> {
  await run("readwrite", (s) => s.put(item));
}

export async function removeItem(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
  changed();
}

/** Ask the browser not to clear this data when the phone is short on space. Best effort. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not supported; nothing to do */
  }
}
