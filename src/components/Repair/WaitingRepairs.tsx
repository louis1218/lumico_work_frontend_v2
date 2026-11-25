import { useEffect, useState } from "react";
import { FaCloudUploadAlt } from "react-icons/fa";
import { FIXED_ENABLED } from "../../lib/features";
import { timeOf } from "../../lib/inspection";
import type { QueuedPhoto, QueuedRepair } from "../../lib/offlineQueue";
import styles from "../Inspection/WaitingChecks.module.scss";

interface Props {
  repairs: QueuedRepair[]; // repairs for the chosen tracker that are saved on this phone but not uploaded yet
  onView: (url: string) => void;
}

/** What was saved on this phone for the chosen tracker: panels, fixed or replaced, notes, before and after photos. */
export default function WaitingRepairs({ repairs, onView }: Props) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();
    for (const r of repairs) {
      for (const p of r.panels.flatMap((x) => [...x.before, ...x.after])) map.set(p.id, URL.createObjectURL(p.blob));
    }
    setUrls(map);
    return () => map.forEach((u) => URL.revokeObjectURL(u));
  }, [repairs]);

  if (repairs.length === 0) return null;

  const thumbs = (photos: QueuedPhoto[], label: string) =>
    photos.length > 0 && (
      <ul className={styles.thumbs}>
        {photos.map((p, n) => {
          const url = urls.get(p.id);
          return url ? (
            <li key={p.id}>
              <button type="button" onClick={() => onView(url)} aria-label={`Enlarge ${label} photo ${n + 1}`}>
                <img src={url} alt={`${label} photo ${n + 1}`} />
              </button>
            </li>
          ) : null;
        })}
      </ul>
    );

  return (
    <section className={styles.waiting} aria-labelledby="waiting-repairs-title">
      <h2 id="waiting-repairs-title" className={styles.title}>
        <FaCloudUploadAlt aria-hidden="true" /> Repairs saved on this phone, not uploaded yet
      </h2>
      {repairs.map((r) => (
        <div key={r.id} className={styles.check}>
          <p className={styles.when}>
            Saved at {timeOf(r.inspected_at)}
            {r.error ? " · could not upload" : ""}
          </p>
          {r.panels.map((p) => (
            <div key={p.panel} className={styles.item}>
              <div className={styles.head}>
                <strong>Panel {p.panel}</strong>
                {FIXED_ENABLED && <span>{p.action === "fix" ? "Fixed" : "Replaced"}</span>}
              </div>
              {p.notes && <p className={styles.note}>{p.notes}</p>}
              <p className={styles.note}>Before</p>
              {thumbs(p.before, `Panel ${p.panel} before`)}
              <p className={styles.note}>After</p>
              {thumbs(p.after, `Panel ${p.panel} after`)}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
