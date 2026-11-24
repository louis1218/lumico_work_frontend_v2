import { useCallback, useEffect, useRef, useState } from "react";
import { FaCloudUploadAlt, FaCheck, FaChevronDown, FaChevronUp, FaExclamationTriangle } from "react-icons/fa";
import type { Session } from "../../App";
import { timeOf } from "../../lib/inspection";
import { QUEUE_CHANGED, isRepair, listQueue, removeItem, requestPersistence, saveItem, type QueuedItem } from "../../lib/offlineQueue";
import { useNavigate } from "react-router-dom";
import { log } from "../../lib/debugLog";
import { isDirty } from "../../lib/dirty";
import { PROGRESS_EVENT, STUCK_EVENT, photosOf, syncQueue, type SyncOutcome, type SyncProgress } from "../../lib/sync";
import styles from "./SyncStatus.module.scss";

interface Props {
  session: Session;
}

const RELOAD_KEY = "lumico:autoReload";
// Reloading is only safe when the app can start with no signal (installed from Safari, worker running)
const canAutoReload = () => "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
const STALLED_AFTER_MS = 20_000; // no sign of progress for this long = "taking long"
const AWAY_LONG_MS = 5_000; // the app was in the background at least this long

const describe = (i: QueuedItem) => {
  const list = `${i.panels.length === 1 ? "Panel" : "Panels"} ${i.panels.map((p) => p.panel).join(", ")}`;
  const what = isRepair(i) ? `Repair · ${list}` : i.panels.length === 0 ? "No issues" : list;
  const photos = photosOf(i).length;
  return `${what} · ${photos} ${photos === 1 ? "photo" : "photos"} · saved ${timeOf(i.inspected_at)}`;
};

/** Reload the page to get a fresh connection, but only when that is safe: online, no half-filled form, the app can start offline, and not more than once every 2 minutes. */
function reloadIfSafe(why: string): boolean {
  if (!navigator.onLine || isDirty() || !canAutoReload()) return false;
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) < 120_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  log(`auto reload to reconnect (${why})`);
  window.location.reload();
  return true;
}

/**
 * Lists what is saved on the phone but not yet uploaded, shows each one's progress, and uploads
 * it by itself whenever the app opens, the phone comes back online, or something new is saved.
 */
export default function SyncStatus({ session }: Props) {
  const navigate = useNavigate();
  const [items, setItems] = useState<QueuedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [stopped, setStopped] = useState<SyncOutcome["stopped"]>(null);
  const [fails, setFails] = useState(0); // upload rounds in a row that failed while the phone says it is online
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [batchTotal, setBatchTotal] = useState(0); // how many were waiting when this upload round began
  const [open, setOpen] = useState(true);
  const [allDone, setAllDone] = useState(false); // briefly true after the last waiting inspection uploads
  const busyRef = useRef(false);
  const roundRef = useRef(0);
  const lastActivity = useRef(Date.now());
  const hiddenAt = useRef<number | null>(null);
  const hadWaiting = useRef(false);

  const refresh = useCallback(() => {
    listQueue()
      .then(setItems)
      .catch(() => {});
  }, []);

  // force = replace an upload that is hanging with a fresh one
  const startSync = useCallback(
    async (force: boolean) => {
      if (busyRef.current && !force) return;
      const round = ++roundRef.current;
      busyRef.current = true;
      lastActivity.current = Date.now();
      setBusy(true);
      setStalled(false);
      try {
        const waitingNow = (await listQueue()).filter((i) => i.username === session.username && !i.error);
        if (round === roundRef.current) setBatchTotal(waitingNow.length);
        const result = await syncQueue(session.username, force);
        if (round === roundRef.current) {
          setStopped(result.stopped);
          setFails((n) => (result.stopped === "offline" && navigator.onLine ? n + 1 : 0));
        }
      } catch {
        if (round === roundRef.current) setStopped("offline");
      } finally {
        if (round === roundRef.current) {
          busyRef.current = false;
          setBusy(false);
          setProgress(null);
          refresh();
        }
      }
    },
    [session.username, refresh],
  );

  const trySync = useCallback(() => {
    void startSync(false);
  }, [startSync]);

  const restart = useCallback(() => {
    void startSync(true);
  }, [startSync]);

  // For the app log: was this page just (re)loaded, and is it being closed or reloaded
  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    log(`screen opened (page load type: ${nav?.type ?? "?"}) worker=${"serviceWorker" in navigator ? (navigator.serviceWorker.controller ? "on" : "none") : "n/a"}`);
    const onHide = (e: PageTransitionEvent) => log(`PAGE CLOSING OR RELOADING (persisted=${e.persisted})`);
    const onError = (e: ErrorEvent) => log(`JS error: ${e.message}`);
    const onReject = (e: PromiseRejectionEvent) => log(`unhandled error: ${String(e.reason)}`);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);

  useEffect(() => {
    requestPersistence();
    refresh();
    trySync();
  }, [refresh, trySync]);

  useEffect(() => {
    const onChange = () => {
      lastActivity.current = Date.now();
      refresh();
      trySync();
    };
    const onProgress = (e: Event) => {
      lastActivity.current = Date.now();
      setStalled(false);
      setProgress((e as CustomEvent<SyncProgress | null>).detail);
    };
    // Coming back to the app: a phone may have frozen or dropped the upload while it was away
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      log(`app visible again after ${Math.round(away / 1000)}s`);
      hiddenAt.current = null;
      if (busyRef.current && away > AWAY_LONG_MS) restart();
      else trySync();
    };
    const onNet = () => log(`phone says: ${navigator.onLine ? "online" : "offline"}`);
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    window.addEventListener("online", restart); // a run that began while offline is stuck: start a fresh one
    window.addEventListener("pageshow", onVisible);
    window.addEventListener(QUEUE_CHANGED, onChange);
    window.addEventListener(PROGRESS_EVENT, onProgress);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
      window.removeEventListener("online", restart);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener(QUEUE_CHANGED, onChange);
      window.removeEventListener(PROGRESS_EVENT, onProgress);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, trySync, restart]);

  // The page can lose its connection for good after the phone changes network (a reload always
  // fixes it). So reload by itself, but never while a form is half filled in and at most every 2 minutes.
  useEffect(() => {
    if (fails < 1 || busy) return;
    reloadIfSafe("upload keeps failing while online");
  }, [fails, busy]);

  // A photo that never starts sending, with the phone online, is the stuck connection: reload at once
  useEffect(() => {
    const onStuck = () => {
      reloadIfSafe("photo upload never started");
    };
    window.addEventListener(STUCK_EVENT, onStuck);
    return () => window.removeEventListener(STUCK_EVENT, onStuck);
  }, []);

  // Keep trying while anything is waiting (a phone can be "online" with no real signal)
  const waiting = items.filter((i) => i.username === session.username && !i.error);
  useEffect(() => {
    if (waiting.length === 0) return;
    const t = setInterval(trySync, 20_000);
    return () => clearInterval(t);
  }, [waiting.length, trySync]);

  // Notice an upload that has stopped moving
  useEffect(() => {
    if (!busy) {
      setStalled(false);
      return;
    }
    const t = setInterval(() => setStalled(Date.now() - lastActivity.current > STALLED_AFTER_MS), 3000);
    return () => clearInterval(t);
  }, [busy]);

  // Keep the screen on while uploading: a locked phone pauses the app and the upload with it
  useEffect(() => {
    if (!busy || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock
      .request("screen")
      .then((l) => {
        if (cancelled) l.release().catch(() => {});
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      lock?.release().catch(() => {});
    };
  }, [busy]);

  // Say so when the last one goes up, so the bar does not just vanish
  useEffect(() => {
    if (waiting.length > 0) {
      hadWaiting.current = true;
      setAllDone(false);
      return;
    }
    if (!hadWaiting.current) return;
    hadWaiting.current = false;
    setAllDone(true);
    const t = setTimeout(() => setAllDone(false), 6000);
    return () => clearTimeout(t);
  }, [waiting.length]);

  const failed = items.filter((i) => i.username === session.username && i.error);
  const others = items.filter((i) => i.username !== session.username);
  if (waiting.length === 0 && failed.length === 0 && others.length === 0 && !allDone) return null;

  const retry = async (item: QueuedItem) => {
    await saveItem({ ...item, error: undefined, attempts: 0 });
    refresh();
    trySync();
  };

  const discard = async (item: QueuedItem) => {
    if (!window.confirm(`Delete block ${item.block}, tracker ${item.tracker} from this phone? It will never be uploaded.`)) return;
    await removeItem(item.id);
    refresh();
  };

  const otherNames = [...new Set(others.map((i) => i.name || i.username))].join(", ");
  const doneThisRound = Math.max(0, batchTotal - waiting.length);

  const status = (item: QueuedItem) => {
    const retry = item.attempts > 0 ? ` · try ${item.attempts + 1}` : "";
    if (progress?.id === item.id) {
      if (progress.stage === "saving") return { text: "Saving…", pct: 100, live: true };
      const pct = progress.total > 0 ? Math.round(((progress.done + progress.part) / progress.total) * 100) : 0;
      const n = Math.min(progress.done + 1, progress.total);
      return {
        text: progress.total > 0 ? `Photo ${n} of ${progress.total} · ${pct}%${retry}` : "Uploading…",
        pct,
        live: true,
      };
    }
    if (busy) return { text: `Waiting in line${retry}`, pct: 0, live: false };
    return { text: `Not uploaded yet${retry}`, pct: 0, live: false };
  };

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      {waiting.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.bar}>
            <FaCloudUploadAlt aria-hidden="true" className={styles.icon} />
            <p className={styles.text}>
              <strong>
                {waiting.length} {waiting.every(isRepair) ? (waiting.length === 1 ? "repair" : "repairs") : waiting.length === 1 ? "job" : "jobs"}
              </strong>{" "}
              saved on this phone, not uploaded yet.{" "}
              <span className={styles.sub}>
                {busy
                  ? stalled
                    ? "This is taking long. Check your signal, or restart the upload."
                    : batchTotal > 1
                      ? `Uploading ${Math.min(doneThisRound + 1, batchTotal)} of ${batchTotal}. Keep the app open.`
                      : "Uploading. Keep the app open."
                  : stopped === "login"
                    ? "Your login has expired. Log in again to upload."
                    : stopped === "offline"
                      ? fails >= 1
                        ? canAutoReload()
                          ? "The phone says it is online but the upload cannot connect. The app reloads itself to reconnect when no form is open, or tap Reload app. Your repairs are safe on this phone."
                          : "The phone says it is online but the upload cannot connect. Tap Reload app, or swipe the app away and open it again. Your repairs are safe on this phone."
                        : "No signal. They upload automatically when you are back online. Keep the app installed and do not log out."
                      : ""}
              </span>
            </p>
            <div className={styles.actions}>
              {busy ? (
                stalled && (
                  <button type="button" className={styles.btn} onClick={restart}>
                    Restart upload
                  </button>
                )
              ) : (
                <>
                  <button type="button" className={styles.btn} onClick={trySync}>
                    Upload now
                  </button>
                  {fails >= 1 && (
                    <button type="button" className={styles.btn} onClick={() => window.location.reload()}>
                      Reload app
                    </button>
                  )}
                </>
              )}
              <button type="button" className={styles.btnQuiet} onClick={() => navigate("/debug")}>
                Log
              </button>
              <button type="button" className={styles.toggle} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Hide list" : "Show list"}>
                {open ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />}
              </button>
            </div>
          </div>

          {open && (
            <ul className={styles.list}>
              {waiting.map((item) => {
                const s = status(item);
                return (
                  <li key={item.id} className={styles.row} data-live={s.live}>
                    <div className={styles.rowMain}>
                      <strong className={styles.rowTitle}>
                        Block {item.block} · Tracker {item.tracker}
                      </strong>
                      <span className={styles.rowSub}>{describe(item)}</span>
                      {item.attempts > 0 && item.lastError && <span className={styles.rowSub}>Last try failed: {item.lastError}</span>}
                    </div>
                    <div className={styles.rowStatus}>
                      <span>{s.text}</span>
                      {s.live && (
                        <span className={styles.meter} aria-hidden="true">
                          <span style={{ width: `${s.pct}%` }} />
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {failed.map((item) => (
        <div key={item.id} className={`${styles.bar} ${styles.bad}`}>
          <FaExclamationTriangle aria-hidden="true" className={styles.icon} />
          <p className={styles.text}>
            <strong>
              Block {item.block}, tracker {item.tracker}
            </strong>{" "}
            could not be uploaded. <span className={styles.sub}>{item.error}</span>
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={() => retry(item)}>
              Try again
            </button>
            <button type="button" className={styles.btnQuiet} onClick={() => discard(item)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {others.length > 0 && (
        <div className={styles.bar}>
          <FaExclamationTriangle aria-hidden="true" className={styles.icon} />
          <p className={styles.text}>
            <strong>
              {others.length} {others.length === 1 ? "inspection" : "inspections"}
            </strong>{" "}
            from {otherNames} {others.length === 1 ? "is" : "are"} still on this phone.{" "}
            <span className={styles.sub}>They need to log in here to upload.</span>
          </p>
        </div>
      )}

      {allDone && waiting.length === 0 && (
        <div className={`${styles.bar} ${styles.good}`}>
          <FaCheck aria-hidden="true" className={styles.icon} />
          <p className={styles.text}>
            <strong>All uploaded.</strong> <span className={styles.sub}>Everything saved on this phone is now in the system.</span>
          </p>
        </div>
      )}
    </div>
  );
}
