import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaCloudUploadAlt,
  FaCheck,
  FaChevronDown,
  FaChevronUp,
  FaExclamationTriangle,
} from "react-icons/fa";
import type { Session } from "../../App";
import { timeOf } from "../../lib/inspection";
import {
  QUEUE_CHANGED,
  listQueue,
  removeItem,
  requestPersistence,
  saveItem,
  type QueuedInspection,
} from "../../lib/offlineQueue";
import {
  PROGRESS_EVENT,
  syncQueue,
  type SyncOutcome,
  type SyncProgress,
} from "../../lib/sync";
import styles from "./SyncStatus.module.scss";

interface Props {
  session: Session;
}

const photoCount = (i: QueuedInspection) =>
  i.panels.reduce((n, p) => n + p.photos.length, 0) + i.okPhotos.length;

const describe = (i: QueuedInspection) => {
  const what =
    i.panels.length === 0
      ? "No issues"
      : `${i.panels.length === 1 ? "Panel" : "Panels"} ${i.panels.map((p) => p.panel).join(", ")}`;
  const photos = photoCount(i);
  return `${what} · ${photos} ${photos === 1 ? "photo" : "photos"} · saved ${timeOf(i.inspected_at)}`;
};

/**
 * Lists what is saved on the phone but not yet uploaded, shows each one's progress, and uploads
 * it by itself whenever the app opens, the phone comes back online, or something new is saved.
 */
export default function SyncStatus({ session }: Props) {
  const [items, setItems] = useState<QueuedInspection[]>([]);
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState<SyncOutcome["stopped"]>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [batchTotal, setBatchTotal] = useState(0); // how many were waiting when this upload round began
  const [open, setOpen] = useState(true);
  const [allDone, setAllDone] = useState(false); // briefly true after the last waiting inspection uploads
  const busyRef = useRef(false);
  const hadWaiting = useRef(false);

  const refresh = useCallback(() => {
    listQueue()
      .then(setItems)
      .catch(() => {});
  }, []);

  const trySync = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const waitingNow = (await listQueue()).filter(
        (i) => i.username === session.username && !i.error,
      );
      setBatchTotal(waitingNow.length);
      const result = await syncQueue(session.username);
      setStopped(result.stopped);
    } catch {
      setStopped("offline");
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
      refresh();
    }
  }, [session.username, refresh]);

  useEffect(() => {
    requestPersistence();
    refresh();
    trySync();
  }, [refresh, trySync]);

  useEffect(() => {
    const onChange = () => {
      refresh();
      trySync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") trySync();
    };
    const onProgress = (e: Event) =>
      setProgress((e as CustomEvent<SyncProgress | null>).detail);
    window.addEventListener("online", trySync);
    window.addEventListener(QUEUE_CHANGED, onChange);
    window.addEventListener(PROGRESS_EVENT, onProgress);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", trySync);
      window.removeEventListener(QUEUE_CHANGED, onChange);
      window.removeEventListener(PROGRESS_EVENT, onProgress);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, trySync]);

  // Keep trying while anything is waiting (a phone can be "online" with no real signal)
  const waiting = items.filter(
    (i) => i.username === session.username && !i.error,
  );
  useEffect(() => {
    if (waiting.length === 0) return;
    const t = setInterval(trySync, 20_000);
    return () => clearInterval(t);
  }, [waiting.length, trySync]);

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

  const failed = items.filter(
    (i) => i.username === session.username && i.error,
  );
  const others = items.filter((i) => i.username !== session.username);
  if (
    waiting.length === 0 &&
    failed.length === 0 &&
    others.length === 0 &&
    !allDone
  )
    return null;

  const retry = async (item: QueuedInspection) => {
    await saveItem({ ...item, error: undefined, attempts: 0 });
    refresh();
    trySync();
  };

  const discard = async (item: QueuedInspection) => {
    if (
      !window.confirm(
        `Delete block ${item.block}, tracker ${item.tracker} from this phone? It will never be uploaded.`,
      )
    )
      return;
    await removeItem(item.id);
    refresh();
  };

  const otherNames = [...new Set(others.map((i) => i.name || i.username))].join(
    ", ",
  );
  const doneThisRound = Math.max(0, batchTotal - waiting.length);

  const status = (item: QueuedInspection) => {
    if (progress?.id === item.id) {
      if (progress.stage === "saving")
        return { text: "Saving…", pct: 100, live: true };
      const pct =
        progress.total > 0
          ? Math.round((progress.done / progress.total) * 100)
          : 0;
      return {
        text:
          progress.total > 0
            ? `Uploading photo ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
            : "Uploading…",
        pct,
        live: true,
      };
    }
    if (busy) return { text: "Waiting in line", pct: 0, live: false };
    return { text: "Not uploaded yet", pct: 0, live: false };
  };

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      {waiting.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.bar}>
            <FaCloudUploadAlt aria-hidden="true" className={styles.icon} />
            <p className={styles.text}>
              <strong>
                {waiting.length}{" "}
                {waiting.length === 1 ? "inspection" : "inspections"}
              </strong>{" "}
              saved on this phone, not uploaded yet.{" "}
              <span className={styles.sub}>
                {busy
                  ? batchTotal > 1
                    ? `Uploading ${Math.min(doneThisRound + 1, batchTotal)} of ${batchTotal}…`
                    : "Uploading…"
                  : stopped === "login"
                    ? "Your login has expired. Log in again to upload."
                    : stopped === "offline"
                      ? "No signal. They upload automatically when you are back online. Keep the app installed and do not log out."
                      : ""}
              </span>
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btn}
                onClick={trySync}
                disabled={busy}
              >
                Upload now
              </button>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-label={open ? "Hide list" : "Show list"}
              >
                {open ? (
                  <FaChevronUp aria-hidden="true" />
                ) : (
                  <FaChevronDown aria-hidden="true" />
                )}
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
            could not be uploaded.{" "}
            <span className={styles.sub}>{item.error}</span>
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btn}
              onClick={() => retry(item)}
            >
              Try again
            </button>
            <button
              type="button"
              className={styles.btnQuiet}
              onClick={() => discard(item)}
            >
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
              {others.length}{" "}
              {others.length === 1 ? "inspection" : "inspections"}
            </strong>{" "}
            from {otherNames} {others.length === 1 ? "is" : "are"} still on this
            phone.{" "}
            <span className={styles.sub}>
              They need to log in here to upload.
            </span>
          </p>
        </div>
      )}

      {allDone && waiting.length === 0 && (
        <div className={`${styles.bar} ${styles.good}`}>
          <FaCheck aria-hidden="true" className={styles.icon} />
          <p className={styles.text}>
            <strong>All uploaded.</strong>{" "}
            <span className={styles.sub}>
              Everything saved on this phone is now in the system.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
