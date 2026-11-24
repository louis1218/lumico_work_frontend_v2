// Uploads what offlineQueue.ts has stored: photos to S3 first, then the record to the API.
// Safe to call at any time: it stops quietly when there is no signal and keeps everything.
//
// Nothing here is allowed to hang. Every request has a time limit, a photo upload is dropped
// and retried if it stops moving data, and a newer run can replace a stuck one (syncQueue with
// force = true), for example when the phone comes back from the background.
import { ApiError, apiJson } from "../api";
import { isRepair, listQueue, removeItem, saveItem, type QueuedItem, type QueuedPhoto, type QueuedRepair } from "./offlineQueue";

export const SYNCED_EVENT = "lumico:synced";
export const PROGRESS_EVENT = "lumico:sync-progress";

/** What the item being uploaded right now is doing, for the status list. */
export interface SyncProgress {
  id: string;
  done: number; // photos already in S3
  total: number; // photos in this inspection
  part: number; // 0 to 1: how much of the photo being sent has gone
  stage: "photos" | "saving";
}

export interface SyncOutcome {
  uploaded: number;
  stopped: "offline" | "login" | null;
}

const MAX_ATTEMPTS = 10; // after this many failures a person has to look at it

// Exported so tests can shorten them
export const timing = {
  stallMs: 25_000, // a photo that moves no data for this long is dropped and retried
  apiMs: 20_000, // longest a small request (upload address, saving the record) may take
};

function emit(detail: SyncProgress | null) {
  window.dispatchEvent(new CustomEvent<SyncProgress | null>(PROGRESS_EVENT, { detail }));
}

export const photosOf = (item: QueuedItem): QueuedPhoto[] =>
  isRepair(item)
    ? item.panels.flatMap((p) => [...p.before, ...p.after])
    : [...item.panels.flatMap((p) => p.photos), ...item.okPhotos];

function report(item: QueuedItem, stage: SyncProgress["stage"], part = 0) {
  const all = photosOf(item);
  emit({ id: item.id, done: all.filter((p) => p.key).length, total: all.length, part, stage });
}

/** An abort signal that also fires after ms, and when the parent run is replaced. */
function limit(parent: AbortSignal, ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  if (parent.aborted) ctrl.abort();
  else parent.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, ms);
  return {
    signal: ctrl.signal,
    clear: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", stop);
    },
  };
}

async function call<T>(path: string, init: RequestInit, parent: AbortSignal): Promise<T> {
  const l = limit(parent, timing.apiMs);
  try {
    return await apiJson<T>(path, { ...init, signal: l.signal });
  } finally {
    l.clear();
  }
}

/** PUT a photo straight to S3 (no login header: the address is already signed), reporting progress. */
function putPhoto(url: string, blob: Blob, parent: AbortSignal, onProgress: (sent: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let idle: ReturnType<typeof setTimeout> | undefined;
    const kick = () => {
      clearTimeout(idle);
      idle = setTimeout(() => xhr.abort(), timing.stallMs);
    };
    const onParentAbort = () => xhr.abort();
    const finish = (err?: Error) => {
      clearTimeout(idle);
      parent.removeEventListener("abort", onParentAbort);
      if (err) reject(err);
      else resolve();
    };
    parent.addEventListener("abort", onParentAbort, { once: true });
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "image/jpeg");
    xhr.upload.onprogress = (e) => {
      kick();
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? finish() : finish(new Error("A photo did not upload.")));
    xhr.onerror = () => finish(new Error("No connection."));
    xhr.onabort = () => finish(new Error("Upload stopped."));
    kick();
    xhr.send(blob);
  });
}

async function uploadPhoto(item: QueuedItem, photo: QueuedPhoto, signal: AbortSignal): Promise<string> {
  if (photo.key) return photo.key;
  const { uploadURL, key } = await call<{ uploadURL: string; key: string }>(
    `/uploads/presign?${new URLSearchParams({
      project: `inspection_${item.site}`,
      mode: `block${item.block}`,
      filename: `${isRepair(item) ? "repair_" : ""}t${item.tracker}_${photo.label}_${photo.id.slice(0, 8)}`,
      contentType: "image/jpeg",
    })}`,
    {},
    signal,
  );
  let last = 0;
  await putPhoto(uploadURL, photo.blob, signal, (sent, total) => {
    const part = total > 0 ? sent / total : 0;
    if (part - last >= 0.03 || part >= 1) {
      last = part;
      report(item, "photos", part);
    }
  });
  photo.key = key;
  await saveItem(item); // remember it, so a retry skips this photo
  report(item, "photos");
  return key;
}

async function uploadRepair(item: QueuedRepair, signal: AbortSignal): Promise<void> {
  report(item, "photos");
  const panels = [];
  for (const p of item.panels) {
    const before: string[] = [];
    const after: string[] = [];
    for (const photo of p.before) before.push(await uploadPhoto(item, photo, signal));
    for (const photo of p.after) after.push(await uploadPhoto(item, photo, signal));
    panels.push({ panel: p.panel, action: p.action, notes: p.notes, before_keys: before, after_keys: after });
  }
  report(item, "saving");
  await call(
    "/repairs",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site: item.site,
        block: item.block,
        tracker: item.tracker,
        work_date: item.work_date,
        batch_id: item.id,
        repaired_at: item.inspected_at,
        panels,
      }),
    },
    signal,
  );
}

async function uploadOne(item: QueuedItem, signal: AbortSignal): Promise<void> {
  if (isRepair(item)) return uploadRepair(item, signal);
  report(item, "photos");
  const panels = [];
  for (const p of item.panels) {
    const keys: string[] = [];
    for (const photo of p.photos) keys.push(await uploadPhoto(item, photo, signal));
    panels.push({ panel: p.panel, defects: p.defects, notes: p.notes, photo_keys: [...p.kept, ...keys] });
  }
  const okKeys: string[] = [];
  for (const photo of item.okPhotos) okKeys.push(await uploadPhoto(item, photo, signal));

  report(item, "saving");
  const detail = item.panels.length > 0 ? { panels } : { panels: [], notes: item.okNotes, photo_keys: [...item.okKept, ...okKeys] };

  await call(
    "/inspections",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site: item.site,
        block: item.block,
        tracker: item.tracker,
        work_date: item.work_date,
        batch_id: item.id, // the server ignores a batch it has already saved
        inspected_at: item.inspected_at,
        ...detail,
      }),
    },
    signal,
  );
}

let current: { ctrl: AbortController } | null = null;

/**
 * Upload everything waiting for this user, oldest first.
 * force = true replaces a run that is hanging (no signal, or the phone paused the app) with a fresh one.
 */
export async function syncQueue(username: string, force = false): Promise<SyncOutcome> {
  const out: SyncOutcome = { uploaded: 0, stopped: null };
  if (current) {
    if (!force) return out;
    current.ctrl.abort(); // drop whatever is hanging; the new run below takes over
  }
  const mine = { ctrl: new AbortController() };
  current = mine;
  const signal = mine.ctrl.signal;

  try {
    const items = (await listQueue()).filter((i) => i.username === username && !i.error);
    for (const item of items) {
      if (signal.aborted) return out; // replaced by a newer run
      try {
        await uploadOne(item, signal);
        await removeItem(item.id);
        out.uploaded += 1;
      } catch (err) {
        if (signal.aborted) return out; // replaced: the newer run owns the queue now, leave the item alone
        item.attempts += 1;
        if (err instanceof ApiError && err.status === 401) {
          out.stopped = "login"; // nothing is lost; log in again and it carries on
          await saveItem(item);
          return out;
        }
        const refused = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
        if (refused) {
          item.error = (err as ApiError).message; // the server will never accept this one as it is
          await saveItem(item);
          continue; // later items may still be fine
        }
        // No signal, a stalled upload or a server hiccup: keep it and try again later.
        if (item.attempts >= MAX_ATTEMPTS) item.error = "This keeps failing to upload.";
        await saveItem(item);
        out.stopped = "offline";
        return out;
      }
    }
  } finally {
    if (current === mine) {
      current = null;
      emit(null);
    }
    if (out.uploaded > 0) window.dispatchEvent(new Event(SYNCED_EVENT));
  }
  return out;
}
