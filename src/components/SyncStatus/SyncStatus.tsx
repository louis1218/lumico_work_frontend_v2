import { useCallback, useEffect, useRef, useState } from "react";
import { FaCloudUploadAlt, FaExclamationTriangle } from "react-icons/fa";
import type { Session } from "../../App";
import { QUEUE_CHANGED, listQueue, removeItem, requestPersistence, saveItem, type QueuedInspection } from "../../lib/offlineQueue";
import { syncQueue, type SyncOutcome } from "../../lib/sync";
import styles from "./SyncStatus.module.scss";

interface Props {
  session: Session;
}

/**
 * Shows what is saved on the phone but not yet uploaded, and uploads it by itself whenever
 * the app opens, the phone comes back online, or something new is saved.
 */
export default function SyncStatus({ session }: Props) {
  const [items, setItems] = useState<QueuedInspection[]>([]);
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState<SyncOutcome["stopped"]>(null);
  const busyRef = useRef(false);

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
      const result = await syncQueue(session.username);
      setStopped(result.stopped);
    } catch {
      setStopped("offline");
    } finally {
      busyRef.current = false;
      setBusy(false);
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
    window.addEventListener("online", trySync);
    window.addEventListener(QUEUE_CHANGED, onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", trySync);
      window.removeEventListener(QUEUE_CHANGED, onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, trySync]);

  // Keep trying while anything is waiting (a phone can be "online" with no real signal)
  const waiting = items.filter((i) => i.username === session.username && !i.error);
  useEffect(() => {
    if (waiting.length === 0) return;
    const t = setInterval(trySync, 20_000);
    return () => clearInterval(t);
  }, [waiting.length, trySync]);

  const failed = items.filter((i) => i.username === session.username && i.error);
  const others = items.filter((i) => i.username !== session.username);
  if (waiting.length === 0 && failed.length === 0 && others.length === 0) return null;

  const retry = async (item: QueuedInspection) => {
    await saveItem({ ...item, error: undefined, attempts: 0 });
    refresh();
    trySync();
  };

  const discard = async (item: QueuedInspection) => {
    if (!window.confirm(`Delete block ${item.block}, tracker ${item.tracker} from this phone? It will never be uploaded.`)) return;
    await removeItem(item.id);
    refresh();
  };

  const otherNames = [...new Set(others.map((i) => i.name || i.username))].join(", ");

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      {waiting.length > 0 && (
        <div className={styles.bar}>
          <FaCloudUploadAlt aria-hidden="true" className={styles.icon} />
          <p className={styles.text}>
            <strong>
              {waiting.length} {waiting.length === 1 ? "inspection" : "inspections"}
            </strong>{" "}
            saved on this phone, not uploaded yet.{" "}
            <span className={styles.sub}>
              {busy
                ? "Uploading…"
                : stopped === "login"
                  ? "Your login has expired. Log in again to upload."
                  : stopped === "offline"
                    ? "No signal. They upload automatically when you are back online. Keep the app installed and do not log out."
                    : ""}
            </span>
          </p>
          <button type="button" className={styles.btn} onClick={trySync} disabled={busy}>
            Upload now
          </button>
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
    </div>
  );
}
