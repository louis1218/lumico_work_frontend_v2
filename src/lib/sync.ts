// Uploads what offlineQueue.ts has stored: photos to S3 first, then the record to the API.
// Safe to call at any time: it stops quietly when there is no signal and keeps everything.
//
// Nothing here is allowed to hang. Every request has a time limit, a photo upload is dropped
// and retried if it stops moving data, and a newer run can replace a stuck one (syncQueue with
// force = true), for example when the phone comes back from the background.
import { ApiError, SESSION_EXPIRED_EVENT, api, apiJson, authHeader } from "../api";
import { log } from "./debugLog";
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
  startMs: 8_000, // a photo that has not started sending after this long is dropped and retried at once
  stallMs: 25_000, // a photo that has started but then moves no data for this long is dropped and retried
  presignMs: 10_000, // longest the request for a photo's upload address may take
  retryDelayMs: 1500, // pause between those quick tries, so a network that is just coming back has a moment
  tries: 3, // how many times one photo is tried straight away before the whole run waits and retries
  apiFallbackMs: 10 * 60_000, // after S3 fails while online, send photos through the API for this long
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

async function call<T>(path: string, init: RequestInit, parent: AbortSignal, ms = timing.apiMs): Promise<T> {
  const l = limit(parent, ms);
  try {
    return await apiJson<T>(path, { ...init, signal: l.signal });
  } catch (err) {
    const timedOut = l.signal.aborted && !parent.aborted;
    log(`API ${path.split("?")[0]} failed: ${err instanceof ApiError ? `${err.status} ${err.detail || err.message}` : String(err)}${timedOut ? " (timed out)" : ""} online=${navigator.onLine}`);
    throw err;
  } finally {
    l.clear();
  }
}

/**
 * Send a request with upload progress. Gives up if nothing starts sending within startMs, or
 * if sending stops moving for stallMs, so a dead connection can never hang the queue.
 */
function send(
  what: string,
  method: string,
  url: string,
  headers: Record<string, string>,
  body: Blob | string,
  parent: AbortSignal,
  onProgress: (sent: number, total: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let idle: ReturnType<typeof setTimeout> | undefined;
    let started = false;
    const kick = () => {
      clearTimeout(idle);
      idle = setTimeout(() => xhr.abort(), started ? timing.stallMs : timing.startMs);
    };
    const onParentAbort = () => xhr.abort();
    const finish = (err?: Error) => {
      clearTimeout(idle);
      parent.removeEventListener("abort", onParentAbort);
      if (err) reject(err);
      else resolve({ status: xhr.status, text: xhr.responseText });
    };
    parent.addEventListener("abort", onParentAbort, { once: true });
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      started = true;
      kick();
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => finish();
    xhr.onerror = () => {
      log(`${what} error: status=${xhr.status} started=${started} online=${navigator.onLine}`);
      finish(new Error("No connection."));
    };
    xhr.onabort = () => {
      log(`${what} stopped: ${parent.aborted ? "replaced by a newer run" : started ? "no data moving" : "never started"}`);
      finish(new Error("Upload stopped."));
    };
    kick();
    xhr.send(body);
  });
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// After a phone loses and regains signal, iOS can keep a dead connection to the S3 address for about
// a minute, while the API address works at once. So when S3 fails while online, photos go through
// the API for a while instead (the API writes them to S3).
export const route = { apiUntil: 0 }; // exported so tests can reset it

/** One photo, tried a few times straight away: straight to S3, or through the API while S3 is stuck. */
async function uploadPhoto(item: QueuedItem, photo: QueuedPhoto, signal: AbortSignal): Promise<string> {
  let s3Only = false; // the API cannot take this photo (too big, or an older backend): only S3 will do
  for (let attempt = 1; ; attempt++) {
    const via = s3Only || Date.now() >= route.apiUntil ? "s3" : "api";
    try {
      return await uploadPhotoOnce(item, photo, signal, via);
    } catch (err) {
      if (signal.aborted) throw err;
      const status = err instanceof ApiError ? err.status : 0;
      if (via === "api" && (status === 413 || status === 404)) {
        s3Only = true;
      } else if (via === "s3" && !s3Only && navigator.onLine) {
        route.apiUntil = Date.now() + timing.apiFallbackMs;
        log("S3 not reachable: sending photos through the API for the next 10 minutes");
      }
      const refused = status >= 400 && status < 500 && status !== 408 && status !== 429 && status !== 413 && status !== 404;
      if (refused) throw err;
      if (attempt >= timing.tries) throw status === 413 || status === 404 ? new Error("A photo did not upload.") : err; // try again later
      log(`photo try ${attempt} of ${timing.tries} (${via}) failed, trying again`);
      report(item, "photos"); // back to the start of this photo, then go again
      await new Promise((r) => setTimeout(r, timing.retryDelayMs));
      if (signal.aborted) throw err;
    }
  }
}

async function uploadPhotoOnce(item: QueuedItem, photo: QueuedPhoto, signal: AbortSignal, via: "s3" | "api"): Promise<string> {
  if (photo.key) return photo.key;
  const where = {
    project: `inspection_${item.site}`,
    mode: `block${item.block}`,
    filename: `${isRepair(item) ? "repair_" : ""}t${item.tracker}_${photo.label}_${photo.id.slice(0, 8)}`,
    contentType: "image/jpeg",
  };
  let last = 0;
  const onProgress = (sent: number, total: number) => {
    const part = total > 0 ? sent / total : 0;
    if (part - last >= 0.03 || part >= 1) {
      last = part;
      report(item, "photos", part);
    }
  };

  let key: string;
  if (via === "s3") {
    const signed = await call<{ uploadURL: string; key: string }>(`/uploads/presign?${new URLSearchParams(where)}`, {}, signal, timing.presignMs);
    const res = await send("S3 upload", "PUT", signed.uploadURL, { "Content-Type": "image/jpeg" }, photo.blob, signal, onProgress);
    if (res.status < 200 || res.status >= 300) throw new Error("A photo did not upload.");
    key = signed.key;
  } else {
    const body = JSON.stringify({ ...where, data: await toBase64(photo.blob) });
    const res = await send("API upload", "POST", api("/uploads/photo"), { "Content-Type": "application/json", ...authHeader() }, body, signal, onProgress);
    let data: { key?: string; error?: string } | null = null;
    try {
      data = JSON.parse(res.text);
    } catch {
      /* not JSON */
    }
    if (res.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    if (res.status < 200 || res.status >= 300 || !data?.key) {
      log(`API upload refused: ${res.status} ${data?.error ?? ""}`);
      throw new ApiError(res.status || 0, data?.error ?? "A photo did not upload.");
    }
    key = data.key;
    log("photo sent through the API");
  }
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
  log(`sync ${force ? "RESTART" : "start"} online=${navigator.onLine}`);
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
        item.lastError = err instanceof Error ? err.message : "Upload failed.";
        if (item.attempts >= MAX_ATTEMPTS) item.error = "This keeps failing to upload.";
        await saveItem(item);
        out.stopped = "offline";
        return out;
      }
    }
  } finally {
    log(`sync end: uploaded=${out.uploaded} stopped=${out.stopped ?? "no"}${signal.aborted ? " (replaced)" : ""}`);
    if (current === mine) {
      current = null;
      emit(null);
    }
    if (out.uploaded > 0) window.dispatchEvent(new Event(SYNCED_EVENT));
  }
  return out;
}
