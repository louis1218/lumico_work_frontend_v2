import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { FaCamera, FaCheck, FaImages, FaMinus, FaPlus, FaTimes } from "react-icons/fa";
import type { Session } from "../../App";
import { apiJson } from "../../api";
import {
  FALLBACK_OPTIONS,
  PHOTO_BASE,
  type InspectionOptions,
  compressImage,
  fullName,
  localDate,
  longDate,
  timeOf,
} from "../../lib/inspection";
import Dropdown from "../Dropdown/Dropdown";
import styles from "./Inspection.module.scss";

interface Props {
  session: Session;
}

export interface TrackerStatus {
  broken_panels: number;
  username: string;
  name: string;
  inspected_at: string;
  defects: string[];
  notes: string;
  photo_keys: string[];
}

interface Photo {
  id: string;
  file: File;
  url: string;
  key?: string; // set once uploaded, so a retry never uploads twice
}

interface MySummary {
  trackers_checked: number;
  issues: number;
  broken_panels: number;
}

interface StatusRow {
  tracker: number;
  broken_panels: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  inspected_at: string;
  defects: string[] | null;
  notes: string | null;
  photo_keys: string[] | null;
}

type Condition = "ok" | "issue" | null;
const MAX_PHOTOS = 10;
const LAST_BLOCK_KEY = "lumico:lastBlock";

export default function Inspection({ session }: Props) {
  const site = session.site.toLowerCase();
  const today = localDate();

  const [options, setOptions] = useState<InspectionOptions>(FALLBACK_OPTIONS);
  const [block, setBlock] = useState<string>(() => localStorage.getItem(LAST_BLOCK_KEY) ?? "");
  const [tracker, setTracker] = useState<string>("");
  const [statuses, setStatuses] = useState<Map<number, TrackerStatus>>(new Map());
  const [mine, setMine] = useState<MySummary | null>(null);

  const [condition, setCondition] = useState<Condition>(null);
  const [broken, setBroken] = useState(1);
  const [defects, setDefects] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [otherText, setOtherText] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [adding, setAdding] = useState(false);

  const [viewing, setViewing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const topRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;

  const blockNo = block ? Number(block) : null;
  const trackerNo = tracker ? Number(tracker) : null;
  const perBlock = options.trackers_per_block;

  // ── Data ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiJson<InspectionOptions>("/inspections/options").then(setOptions).catch(() => {});
  }, []);

  const loadMine = useCallback(() => {
    apiJson<MySummary>(`/inspections/mine?${new URLSearchParams({ site, work_date: today })}`)
      .then(setMine)
      .catch(() => {});
  }, [site, today]);

  const loadBlock = useCallback(
    (b: number) =>
      apiJson<{ trackers: StatusRow[] }>(
        `/inspections/block-status?${new URLSearchParams({ site, block: String(b), work_date: today })}`,
      )
        .then((r) => {
          const map = new Map<number, TrackerStatus>();
          for (const t of r.trackers) {
            map.set(t.tracker, {
              broken_panels: t.broken_panels,
              username: t.username,
              name: fullName(t.first_name, t.last_name, t.username),
              inspected_at: t.inspected_at,
              defects: t.defects ?? [],
              notes: t.notes ?? "",
              photo_keys: t.photo_keys ?? [],
            });
          }
          return map;
        })
        .catch(() => new Map<number, TrackerStatus>()),
    [site, today],
  );

  useEffect(loadMine, [loadMine]);

  useEffect(() => {
    if (blockNo === null) {
      setStatuses(new Map());
      return;
    }
    let cancelled = false;
    loadBlock(blockNo).then((m) => {
      if (!cancelled) setStatuses(m);
    });
    return () => {
      cancelled = true;
    };
  }, [blockNo, loadBlock]);

  // Free the photo previews when leaving the screen
  useEffect(
    () => () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [],
  );

  // ── Form helpers ──────────────────────────────────────────────────────────
  const resetForm = () => {
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setCondition(null);
    setBroken(1);
    setDefects([]);
    setNotes("");
    setOtherText("");
    setError("");
  };

  const changeBlock = (value: string) => {
    setBlock(value);
    setTracker("");
    resetForm();
    if (value) localStorage.setItem(LAST_BLOCK_KEY, value);
  };

  const changeTracker = (value: string) => {
    setTracker(value);
    resetForm();
  };

  const addPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // lets the same photo be picked again
    if (!files.length) return;
    setAdding(true);
    const added: Photo[] = [];
    for (const f of files.slice(0, MAX_PHOTOS - photos.length)) {
      const file = await compressImage(f);
      added.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) });
    }
    setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    setAdding(false);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const toggleDefect = (d: string) =>
    setDefects((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const existing = trackerNo !== null ? statuses.get(trackerNo) : undefined;
  const needsPhoto = condition === "issue" && photos.length === 0;
  const needsOther = condition === "issue" && defects.includes("Other") && !otherText.trim();
  const canSave =
    blockNo !== null && trackerNo !== null && condition !== null && !needsPhoto && !needsOther && !saving && !adding;

  const nextUnchecked = useMemo(() => {
    return (done: Map<number, TrackerStatus>, from: number): number | null => {
      for (let n = from + 1; n <= perBlock; n++) if (!done.has(n)) return n;
      for (let n = 1; n < from; n++) if (!done.has(n)) return n;
      return null;
    };
  }, [perBlock]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const uploadPhotos = async (): Promise<string[]> => {
    const keys: string[] = [];
    for (const [i, photo] of photos.entries()) {
      if (photo.key) {
        keys.push(photo.key);
        continue;
      }
      setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
      const { uploadURL, key } = await apiJson<{ uploadURL: string; key: string }>(
        `/uploads/presign?${new URLSearchParams({
          project: `inspection_${site}`,
          mode: `block${blockNo}`,
          filename: `t${trackerNo}_${Date.now()}_${i + 1}`,
          contentType: photo.file.type || "image/jpeg",
        })}`,
      );
      // Straight to S3. No login header here: the upload address is already signed.
      const up = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": photo.file.type || "image/jpeg" },
        body: photo.file,
      });
      if (!up.ok) throw new Error("A photo did not upload. Check your signal and press Save again.");
      photo.key = key;
      keys.push(key);
    }
    return keys;
  };

  const save = async () => {
    if (!canSave || blockNo === null || trackerNo === null) return;
    setSaving(true);
    setError("");
    try {
      const photo_keys = await uploadPhotos();
      setProgress("Saving…");
      await apiJson("/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site,
          block: blockNo,
          tracker: trackerNo,
          broken_panels: condition === "issue" ? broken : 0,
          defects: condition === "issue" ? defects : [],
          notes:
            condition === "issue" && defects.includes("Other")
              ? `Other: ${otherText.trim()}${notes.trim() ? `\n${notes.trim()}` : ""}`
              : notes,
          photo_keys,
          work_date: today,
        }),
      });

      const fresh = await loadBlock(blockNo);
      setStatuses(fresh);
      loadMine();
      const next = nextUnchecked(fresh, trackerNo);
      setToast(
        next === null
          ? `Tracker ${trackerNo} saved. Block ${blockNo} is complete.`
          : `Tracker ${trackerNo} saved. Next is tracker ${next}.`,
      );
      resetForm();
      setTracker(next === null ? "" : String(next));
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
      setProgress("");
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const saveLabel =
    condition === "issue"
      ? `Save ${broken} broken ${broken === 1 ? "panel" : "panels"}`
      : condition === "ok"
        ? "Save: no issues"
        : "Save inspection";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page} ref={topRef}>
      <header className={styles.top}>
        <div>
          <h1 className={styles.title}>Inspect trackers</h1>
          <p className={styles.sub}>
            <span className={styles.site}>{session.site}</span> solar farm, {longDate(today)}
          </p>
        </div>
        {mine && (
          <p className={styles.tally} aria-label="Your totals today">
            <strong>{mine.trackers_checked}</strong> checked
            <span className={styles.dot} aria-hidden="true" />
            <strong className={mine.issues ? styles.bad : ""}>{mine.issues}</strong> with issues
          </p>
        )}
      </header>

      <div className={styles.live} role="status" aria-live="polite">
        {toast && (
          <p className={styles.toast}>
            <FaCheck aria-hidden="true" /> {toast}
          </p>
        )}
      </div>

      {/* 1 Location */}
      <section className={styles.section} aria-labelledby="loc">
        <h2 id="loc" className={styles.heading}>
          <span className={styles.step}>1</span> Location
        </h2>
        <div className={styles.pickers}>
          <Dropdown
            label="Block"
            value={block}
            placeholder="Select block"
            options={Array.from({ length: options.blocks }, (_, i) => ({ value: String(i + 1), label: `Block ${i + 1}` }))}
            onChange={changeBlock}
          />
          <Dropdown
            label="Tracker"
            value={tracker}
            searchable
            numeric
            align="right"
            searchPlaceholder="Type a number to find a tracker"
            disabled={!block}
            placeholder={block ? "Select tracker" : "Pick a block first"}
            options={Array.from({ length: perBlock }, (_, i) => {
              const st = statuses.get(i + 1);
              return {
                value: String(i + 1),
                label: `Tracker ${i + 1}`,
                note: st ? (st.broken_panels > 0 ? `${st.broken_panels} broken` : "checked") : undefined,
                tone: st ? (st.broken_panels > 0 ? ("issue" as const) : ("ok" as const)) : undefined,
              };
            })}
            onChange={changeTracker}
          />
        </div>
      </section>

      {blockNo !== null && trackerNo !== null && (
        <>
          <div className={styles.ticket}>
            <span className={styles.ticketBlock}>Block {blockNo}</span>
            <span className={styles.ticketTracker}>Tracker {trackerNo}</span>
          </div>

          {existing && (
            <div className={styles.notice}>
              <p>
                Already checked today by <strong>{existing.name}</strong> at {timeOf(existing.inspected_at)}
                {existing.broken_panels > 0
                  ? `: ${existing.broken_panels} broken ${existing.broken_panels === 1 ? "panel" : "panels"}`
                  : ": no issues"}
                . Saving again adds a new check and replaces it in the report.
              </p>
              {existing.defects.length > 0 && <p>{existing.defects.join(", ")}</p>}
              {existing.notes && <p className={styles.noticeNotes}>{existing.notes}</p>}
              {existing.photo_keys.length > 0 && (
                <ul className={styles.prevPhotos}>
                  {existing.photo_keys.map((k, n) => (
                    <li key={k}>
                      <button type="button" onClick={() => setViewing(`${PHOTO_BASE}/${k}`)} aria-label={`Open saved photo ${n + 1}`}>
                        <img src={`${PHOTO_BASE}/${k}`} alt={`Saved photo ${n + 1}`} loading="lazy" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 2 Condition */}
          <section className={styles.section} aria-labelledby="cond">
            <h2 id="cond" className={styles.heading}>
              <span className={styles.step}>2</span> Condition
            </h2>
            <div className={styles.segment} role="radiogroup" aria-label="Tracker condition">
              <button
                type="button"
                role="radio"
                aria-checked={condition === "ok"}
                data-tone="ok"
                onClick={() => setCondition("ok")}
              >
                <FaCheck aria-hidden="true" /> No issues
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={condition === "issue"}
                data-tone="issue"
                onClick={() => setCondition("issue")}
              >
                Issues found
              </button>
            </div>

            {condition === "issue" && (
              <div className={styles.issueBox}>
                <div className={styles.stepperRow}>
                  <span id="brokenLabel" className={styles.label}>
                    Broken panels
                  </span>
                  <div className={styles.stepper} role="group" aria-labelledby="brokenLabel">
                    <button
                      type="button"
                      aria-label="One fewer"
                      onClick={() => setBroken((n) => Math.max(1, n - 1))}
                      disabled={broken <= 1}
                    >
                      <FaMinus aria-hidden="true" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      value={broken}
                      aria-labelledby="brokenLabel"
                      onChange={(e) => setBroken(Math.min(999, Math.max(1, Number(e.target.value) || 1)))}
                    />
                    <button type="button" aria-label="One more" onClick={() => setBroken((n) => Math.min(999, n + 1))}>
                      <FaPlus aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className={styles.label}>What is wrong? Choose all that apply</span>
                  <div className={styles.chips}>
                    {options.defect_types.map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={defects.includes(d)}
                        className={styles.chip}
                        onClick={() => toggleDefect(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  {defects.includes("Other") && (
                    <input
                      className={styles.otherInput}
                      type="text"
                      maxLength={200}
                      autoFocus
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      placeholder="Describe the other problem"
                      aria-label="Describe the other problem"
                    />
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 3 Photos */}
          <section className={styles.section} aria-labelledby="ph">
            <h2 id="ph" className={styles.heading}>
              <span className={styles.step}>3</span> Photos
              <span className={styles.hint}>{condition === "issue" ? "Required for issues" : "Optional"}</span>
            </h2>
            <div className={styles.photoButtons}>
              <label className={styles.photoBtn}>
                <FaCamera aria-hidden="true" /> Take photo
                <input type="file" accept="image/*" capture="environment" onChange={addPhotos} disabled={photos.length >= MAX_PHOTOS} />
              </label>
              <label className={styles.photoBtn}>
                <FaImages aria-hidden="true" /> From gallery
                <input type="file" accept="image/*" multiple onChange={addPhotos} disabled={photos.length >= MAX_PHOTOS} />
              </label>
            </div>
            {adding && <p className={styles.muted}>Preparing photos…</p>}
            {photos.length > 0 && (
              <ul className={styles.thumbs}>
                {photos.map((p, i) => (
                  <li key={p.id}>
                    <img src={p.url} alt={`Photo ${i + 1}`} />
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(p.id)} disabled={saving}>
                      <FaTimes aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {needsPhoto && <p className={styles.muted}>Add at least one photo of the damage to save.</p>}
          </section>

          {/* 4 Notes */}
          <section className={styles.section} aria-labelledby="nt">
            <h2 id="nt" className={styles.heading}>
              <span className={styles.step}>4</span> Notes<span className={styles.hint}>Optional</span>
            </h2>
            <textarea
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Where on the tracker, anything the next person should know"
              aria-label="Notes"
            />
          </section>
        </>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {viewing && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setViewing(null)}>
          <button type="button" aria-label="Close photo" onClick={() => setViewing(null)}>
            <FaTimes aria-hidden="true" />
          </button>
          <img src={viewing} alt="Saved inspection" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <div className={styles.actionBar}>
        <button type="button" className={styles.save} onClick={save} disabled={!canSave}>
          {saving ? (
            <>
              <span className={styles.spinner} aria-hidden="true" /> {progress || "Saving…"}
            </>
          ) : (
            saveLabel
          )}
        </button>
        {!saving && trackerNo === null && <p className={styles.actionHint}>Choose a block and tracker to start.</p>}
        {!saving && needsOther && <p className={styles.actionHint}>Describe the other problem to save.</p>}
        {!saving && trackerNo !== null && condition === null && (
          <p className={styles.actionHint}>Choose the condition to save.</p>
        )}
      </div>
    </div>
  );
}
