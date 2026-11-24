import { useEffect, useState } from "react";
import { FaCloudUploadAlt } from "react-icons/fa";
import { timeOf } from "../../lib/inspection";
import type { QueuedInspection, QueuedPhoto } from "../../lib/offlineQueue";
import styles from "./WaitingChecks.module.scss";

interface Props {
  checks: QueuedInspection[]; // checks for the chosen tracker that are saved on this phone but not uploaded yet
  onView: (url: string) => void;
}

/** What was saved on this phone for the chosen tracker: panels, defects, notes and photos. */
export default function WaitingChecks({ checks, onView }: Props) {
  // A preview address for each saved photo; released when the list changes or the screen closes
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();
    for (const c of checks) {
      for (const p of [...c.okPhotos, ...c.panels.flatMap((x) => x.photos)])
        map.set(p.id, URL.createObjectURL(p.blob));
    }
    setUrls(map);
    return () => map.forEach((u) => URL.revokeObjectURL(u));
  }, [checks]);

  if (checks.length === 0) return null;

  const thumbs = (photos: QueuedPhoto[], label: string) =>
    photos.length > 0 && (
      <ul className={styles.thumbs}>
        {photos.map((p, n) => {
          const url = urls.get(p.id);
          return url ? (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onView(url)}
                aria-label={`Enlarge ${label} photo ${n + 1}`}
              >
                <img src={url} alt={`${label} photo ${n + 1}`} />
              </button>
            </li>
          ) : null;
        })}
      </ul>
    );

  return (
    <section className={styles.waiting} aria-labelledby="waiting-title">
      <h2 id="waiting-title" className={styles.title}>
        <FaCloudUploadAlt aria-hidden="true" /> Saved on this phone, not
        uploaded yet
      </h2>

      {checks.map((c) => (
        <div key={c.id} className={styles.check}>
          <p className={styles.when}>
            Saved at {timeOf(c.inspected_at)}
            {c.error ? " · could not upload" : ""}
          </p>

          {c.panels.length === 0 ? (
            <div className={styles.item}>
              <div className={styles.head}>
                <strong>No issues</strong>
              </div>
              {c.okNotes && <p className={styles.note}>{c.okNotes}</p>}
              {thumbs(c.okPhotos, "Saved")}
            </div>
          ) : (
            c.panels.map((p) => (
              <div key={p.panel} className={styles.item}>
                <div className={styles.head}>
                  <strong>Panel {p.panel}</strong>
                  <span>
                    {p.defects.length > 0
                      ? p.defects.join(", ")
                      : "No type chosen"}
                  </span>
                </div>
                {p.notes && <p className={styles.note}>{p.notes}</p>}
                {thumbs(p.photos, `Panel ${p.panel}`)}
              </div>
            ))
          )}
        </div>
      ))}
    </section>
  );
}
