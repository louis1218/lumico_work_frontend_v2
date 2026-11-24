// Uploads what offlineQueue.ts has stored: photos to S3 first, then the record to the API.
// Safe to call at any time: it stops quietly when there is no signal and keeps everything.
import { ApiError, apiJson } from "../api";
import { listQueue, removeItem, saveItem, type QueuedInspection, type QueuedPhoto } from "./offlineQueue";

export const SYNCED_EVENT = "lumico:synced";

export interface SyncOutcome {
  uploaded: number;
  stopped: "offline" | "login" | null;
}

const MAX_ATTEMPTS = 10; // after this many failures a person has to look at it

function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

async function uploadPhoto(item: QueuedInspection, photo: QueuedPhoto): Promise<string> {
  if (photo.key) return photo.key;
  const { uploadURL, key } = await apiJson<{ uploadURL: string; key: string }>(
    `/uploads/presign?${new URLSearchParams({
      project: `inspection_${item.site}`,
      mode: `block${item.block}`,
      filename: `t${item.tracker}_${photo.label}_${photo.id.slice(0, 8)}`,
      contentType: "image/jpeg",
    })}`,
    { signal: timeoutSignal(20_000) },
  );
  // Straight to S3. No login header: the upload address is already signed.
  const up = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: photo.blob,
    signal: timeoutSignal(90_000),
  });
  if (!up.ok) throw new Error("A photo did not upload.");
  photo.key = key;
  await saveItem(item); // remember it, so a retry skips this photo
  return key;
}

async function uploadOne(item: QueuedInspection): Promise<void> {
  const panels = [];
  for (const p of item.panels) {
    const keys: string[] = [];
    for (const photo of p.photos) keys.push(await uploadPhoto(item, photo));
    panels.push({ panel: p.panel, defects: p.defects, notes: p.notes, photo_keys: [...p.kept, ...keys] });
  }
  const okKeys: string[] = [];
  for (const photo of item.okPhotos) okKeys.push(await uploadPhoto(item, photo));

  const detail = item.panels.length > 0 ? { panels } : { panels: [], notes: item.okNotes, photo_keys: [...item.okKept, ...okKeys] };

  await apiJson("/inspections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: timeoutSignal(30_000),
    body: JSON.stringify({
      site: item.site,
      block: item.block,
      tracker: item.tracker,
      work_date: item.work_date,
      batch_id: item.id, // the server ignores a batch it has already saved
      inspected_at: item.inspected_at,
      ...detail,
    }),
  });
}

let running = false;

/** Upload everything waiting for this user, oldest first. */
export async function syncQueue(username: string): Promise<SyncOutcome> {
  const out: SyncOutcome = { uploaded: 0, stopped: null };
  if (running) return out;
  running = true;

  const work = async () => {
    const items = (await listQueue()).filter((i) => i.username === username && !i.error);
    for (const item of items) {
      try {
        await uploadOne(item);
        await removeItem(item.id);
        out.uploaded += 1;
      } catch (err) {
        item.attempts += 1;
        if (err instanceof ApiError && err.status === 401) {
          out.stopped = "login"; // nothing is lost; log in again and it carries on
          await saveItem(item);
          return;
        }
        const refused = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
        if (refused) {
          item.error = (err as ApiError).message; // the server will never accept this one as it is
          await saveItem(item);
          continue; // later items may still be fine
        }
        // No signal, a slow network or a server hiccup: keep it and try again later.
        if (item.attempts >= MAX_ATTEMPTS) item.error = "This keeps failing to upload.";
        await saveItem(item);
        out.stopped = "offline";
        return;
      }
    }
  };

  try {
    if (navigator.locks) {
      // Stops two open tabs from uploading the same thing at once
      await navigator.locks.request("lumico-sync", { ifAvailable: true }, async (lock) => {
        if (lock) await work();
      });
    } else {
      await work();
    }
  } finally {
    running = false;
  }

  if (out.uploaded > 0) window.dispatchEvent(new Event(SYNCED_EVENT));
  return out;
}
