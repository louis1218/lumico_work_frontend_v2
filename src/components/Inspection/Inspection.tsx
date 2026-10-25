import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { FaCamera, FaCheck, FaImages, FaPlus, FaTimes } from "react-icons/fa";
import type { Session } from "../../App";
import { apiJson } from "../../api";
import {
  FALLBACK_OPTIONS,
  PHOTO_BASE,
  type InspectionOptions,
  compressImage,
  dateTimeOf,
  fullName,
  localDate,
  longDate,
  timeOf,
  watermarkImage,
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
  notes: string;
  photo_keys: string[];
  panels: { panel: number; defects: string[]; notes: string; photo_keys: string[] }[];
}

interface Photo {
  id: string;
  file: File;
  url: string;
  key?: string; // set once uploaded, so a retry never uploads twice
}

/** One broken panel on the tracker being checked */
interface Entry {
  id: string;
  panel: string;
  defects: string[];
  otherText: string;
  notes: string;
  kept: string[]; // photos already saved by an earlier check of this tracker
  photos: Photo[];
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
  notes: string | null;
  photo_keys: string[] | null;
  panels: TrackerStatus["panels"] | null;
}

type Condition = "ok" | "issue" | null;
const MAX_PHOTOS = 10;
const LAST_BLOCK_KEY = "lumico:lastBlock";
const newId = () => crypto.randomUUID();
const blankEntry = (): Entry => ({ id: newId(), panel: "", defects: [], otherText: "", notes: "", kept: [], photos: [] });

const withOther = (e: Entry) =>
  e.defects.includes("Other") ? `Other: ${e.otherText.trim()}${e.notes.trim() ? `\n${e.notes.trim()}` : ""}` : e.notes.trim();

export default function Inspection({ session }: Props) {
  const site = session.site.toLowerCase();
  const siteName = site.charAt(0).toUpperCase() + site.slice(1);
  const today = localDate();

  const [options, setOptions] = useState<InspectionOptions>(FALLBACK_OPTIONS);
  const [block, setBlock] = useState<string>(() => localStorage.getItem(LAST_BLOCK_KEY) ?? "");
  const [tracker, setTracker] = useState<string>("");
  const [statuses, setStatuses] = useState<Map<number, TrackerStatus>>(new Map());
  const [mine, setMine] = useState<MySummary | null>(null);

  const [condition, setCondition] = useState<Condition>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [okPhotos, setOkPhotos] = useState<Photo[]>([]);
  const [okKept, setOkKept] = useState<string[]>([]);
  const [okNotes, setOkNotes] = useState("");
  const [adding, setAdding] = useState(false);

  const [viewing, setViewing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const topRef = useRef<HTMLDivElement>(null);
  const allPhotosRef = useRef<Photo[]>([]);
  allPhotosRef.current = [...okPhotos, ...entries.flatMap((e) => e.photos)];

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
              notes: t.notes ?? "",
              photo_keys: t.photo_keys ?? [],
              panels: t.panels ?? [],
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
      allPhotosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [],
  );

  // ── Form helpers ──────────────────────────────────────────────────────────
  const resetForm = () => {
    allPhotosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    setEntries([]);
    setOkPhotos([]);
    setOkKept([]);
    setOkNotes("");
    setCondition(null);
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

  const chooseCondition = (c: Exclude<Condition, null>) => {
    setCondition(c);
    if (c === "issue" && entries.length === 0) setEntries([blankEntry()]);
  };

  const addToExisting = () => {
    setCondition("issue");
    setEntries((prev) => (prev.length === 0 ? [blankEntry()] : prev));
    setTimeout(() => document.getElementById("pn")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const patchEntry = (id: string, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const removeEntry = (id: string) =>
    setEntries((prev) => {
      prev.find((e) => e.id === id)?.photos.forEach((p) => URL.revokeObjectURL(p.url));
      return prev.filter((e) => e.id !== id);
    });

  const makePhotos = async (files: File[], room: number): Promise<Photo[]> => {
    const out: Photo[] = [];
    for (const f of files.slice(0, room)) {
      const file = await compressImage(f);
      out.push({ id: newId(), file, url: URL.createObjectURL(file) });
    }
    return out;
  };

  const addEntryPhotos = async (id: string, e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // lets the same photo be picked again
    const entry = entries.find((x) => x.id === id);
    if (!files.length || !entry) return;
    setAdding(true);
    const added = await makePhotos(files, MAX_PHOTOS - entry.kept.length - entry.photos.length);
    setEntries((prev) => prev.map((x) => (x.id === id ? { ...x, photos: [...x.photos, ...added] } : x)));
    setAdding(false);
  };

  const addOkPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setAdding(true);
    const added = await makePhotos(files, MAX_PHOTOS - okKept.length - okPhotos.length);
    setOkPhotos((prev) => [...prev, ...added]);
    setAdding(false);
  };

  const removeEntryPhoto = (id: string, photoId: string) =>
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        e.photos.filter((p) => p.id === photoId).forEach((p) => URL.revokeObjectURL(p.url));
        return { ...e, photos: e.photos.filter((p) => p.id !== photoId) };
      }),
    );

  const removeOkPhoto = (photoId: string) =>
    setOkPhotos((prev) => {
      prev.filter((p) => p.id === photoId).forEach((p) => URL.revokeObjectURL(p.url));
      return prev.filter((p) => p.id !== photoId);
    });

  const toggleDefect = (id: string, d: string) =>
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, defects: e.defects.includes(d) ? e.defects.filter((x) => x !== d) : [...e.defects, d] } : e,
      ),
    );

  const existing = trackerNo !== null ? statuses.get(trackerNo) : undefined;
  // Every submission is new: what was saved earlier is listed above the form and never edited here.

  // The first thing stopping a save, shown under the Save button
  const problem = useMemo(() => {
    if (blockNo === null || trackerNo === null) return "Choose a block and tracker to start.";
    if (condition === null) return "Choose the condition to save.";
    if (condition === "ok") return existing && existing.panels.length > 0 ? "This tracker already has broken panels recorded. Choose Issues found to add more." : "";
    for (const [i, e] of entries.entries()) {
      const label = e.panel ? `panel ${e.panel}` : `broken panel ${i + 1}`;
      if (!e.panel) return `Choose which panel is broken (broken panel ${i + 1}).`;
      if (e.defects.includes("Other") && !e.otherText.trim()) return `Describe the other problem on ${label}.`;
      if (e.kept.length + e.photos.length === 0) return `Add a photo of ${label}.`;
    }
    return entries.length === 0 ? "Add at least one broken panel." : "";
  }, [blockNo, trackerNo, condition, entries, existing]);
  const canSave = problem === "" && !saving && !adding;

  // ── Save ──────────────────────────────────────────────────────────────────
  const uploadPhotos = async (photos: Photo[], lines: string[], label: string, done: { n: number; of: number }): Promise<string[]> => {
    const keys: string[] = [];
    for (const [i, photo] of photos.entries()) {
      if (photo.key) {
        keys.push(photo.key);
        continue;
      }
      done.n += 1;
      setProgress(`Uploading photo ${done.n} of ${done.of}…`);
      const stamped = await watermarkImage(photo.file, lines);
      const { uploadURL, key } = await apiJson<{ uploadURL: string; key: string }>(
        `/uploads/presign?${new URLSearchParams({
          project: `inspection_${site}`,
          mode: `block${blockNo}`,
          filename: `t${trackerNo}_${label}_${Date.now()}_${i + 1}`,
          contentType: "image/jpeg",
        })}`,
      );
      // Straight to S3. No login header here: the upload address is already signed.
      const up = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: stamped });
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
      const stamp = dateTimeOf(new Date().toISOString());
      const where = `Block ${blockNo} · Tracker ${trackerNo}`;
      const sub = `${siteName} · ${stamp}`;
      const total = (condition === "issue" ? entries.flatMap((e) => e.photos) : okPhotos).filter((p) => !p.key).length;
      const done = { n: 0, of: total };
      let payload: Record<string, unknown>;

      if (condition === "issue") {
        const panels = [];
        for (const e of entries) {
          const keys = await uploadPhotos(e.photos, [`${where} · Panel ${e.panel}`, sub], `p${e.panel}`, done);
          panels.push({ panel: Number(e.panel), defects: e.defects, notes: withOther(e), photo_keys: [...e.kept, ...keys] });
        }
        payload = { panels };
      } else {
        const keys = await uploadPhotos(okPhotos, [where, sub], "ok", done);
        payload = { panels: [], notes: okNotes.trim(), photo_keys: [...okKept, ...keys] };
      }

      setProgress("Saving…");
      await apiJson("/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, block: blockNo, tracker: trackerNo, work_date: today, ...payload }),
      });

      const fresh = await loadBlock(blockNo);
      setStatuses(fresh);
      loadMine();
      setToast(
        condition === "issue"
          ? `Saved ${entries.length === 1 ? `panel ${entries[0].panel}` : `${entries.length} panels`} on tracker ${trackerNo}. Add another, or choose a different tracker.`
          : `Tracker ${trackerNo} saved as no issues.`,
      );
      resetForm();
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
      setProgress("");
    }
  };

  useEffect(() => {
    if (!viewing) return;
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && setViewing(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const saveLabel =
    condition === "issue"
      ? `Save ${entries.length} broken ${entries.length === 1 ? "panel" : "panels"}`
      : condition === "ok"
        ? "Save: no issues"
        : "Save inspection";

  const usedPanels = (exceptId: string) => new Set(entries.filter((e) => e.id !== exceptId && e.panel).map((e) => e.panel));

  const recordedPanels = new Set((existing?.panels ?? []).map((p) => String(p.panel)));
  const existingPhotos = existing ? [...existing.photo_keys, ...existing.panels.flatMap((p) => p.photo_keys)] : [];

  const photoButtons = (onPick: (e: ChangeEvent<HTMLInputElement>) => void, full: boolean) => (
    <div className={styles.photoButtons}>
      <label className={styles.photoBtn}>
        <FaCamera aria-hidden="true" /> Take photo
        <input type="file" accept="image/*" capture="environment" onChange={onPick} disabled={full} />
      </label>
      <label className={styles.photoBtn}>
        <FaImages aria-hidden="true" /> From gallery
        <input type="file" accept="image/*" multiple onChange={onPick} disabled={full} />
      </label>
    </div>
  );

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
            <section className={styles.recorded} aria-labelledby="rec">
              <h2 id="rec" className={styles.recordedTitle}>
                <FaCheck aria-hidden="true" />
                {existing.panels.length > 0
                  ? `Already reported on this tracker: ${existing.panels.length} broken ${existing.panels.length === 1 ? "panel" : "panels"}`
                  : "Already reported on this tracker: no issues"}
              </h2>
              <p className={styles.recordedBy}>
                Last saved by {existing.name} at {timeOf(existing.inspected_at)}
              </p>

              {existing.panels.length > 0 ? (
                <ul className={styles.recordedList}>
                  {existing.panels.map((p) => (
                    <li key={p.panel}>
                      <div className={styles.recordedHead}>
                        <strong>Panel {p.panel}</strong>
                        <span>{p.defects.length > 0 ? p.defects.join(", ") : "No type chosen"}</span>
                      </div>
                      {p.notes && <p className={styles.recordedNote}>{p.notes}</p>}
                      {p.photo_keys.length > 0 && (
                        <ul className={styles.prevPhotos}>
                          {p.photo_keys.map((k, n) => (
                            <li key={k}>
                              <button type="button" onClick={() => setViewing(`${PHOTO_BASE}/${k}`)} aria-label={`Enlarge photo ${n + 1} of panel ${p.panel}`}>
                                <img src={`${PHOTO_BASE}/${k}`} alt={`Panel ${p.panel} photo ${n + 1}`} loading="lazy" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                existingPhotos.length > 0 && (
                  <ul className={styles.prevPhotos}>
                    {existingPhotos.map((k, n) => (
                      <li key={k}>
                        <button type="button" onClick={() => setViewing(`${PHOTO_BASE}/${k}`)} aria-label={`Enlarge saved photo ${n + 1}`}>
                          <img src={`${PHOTO_BASE}/${k}`} alt={`Saved photo ${n + 1}`} loading="lazy" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}

              <button type="button" className={styles.addToExisting} onClick={addToExisting}>
                <FaPlus aria-hidden="true" /> Add another broken panel
              </button>
            </section>
          )}

          {/* 2 Condition */}
          <section className={styles.section} aria-labelledby="cond">
            <h2 id="cond" className={styles.heading}>
              <span className={styles.step}>2</span> Condition
            </h2>
            <div className={styles.segment} role="radiogroup" aria-label="Tracker condition">
              <button type="button" role="radio" aria-checked={condition === "ok"} data-tone="ok" onClick={() => chooseCondition("ok")}>
                <FaCheck aria-hidden="true" /> No issues
              </button>
              <button type="button" role="radio" aria-checked={condition === "issue"} data-tone="issue" onClick={() => chooseCondition("issue")}>
                Issues found
              </button>
            </div>
          </section>

          {/* 3a Broken panels: one card per panel */}
          {condition === "issue" && (
            <section className={styles.section} aria-labelledby="pn">
              <h2 id="pn" className={styles.heading}>
                <span className={styles.step}>3</span> Broken panels
                <span className={styles.hint}>
                  {entries.length} of {options.panels_per_tracker} panels
                </span>
              </h2>
              <p className={styles.muted}>Add each broken panel with its own photos.</p>

              {entries.map((e, i) => {
                const used = usedPanels(e.id);
                const photoCount = e.kept.length + e.photos.length;
                return (
                  <article key={e.id} className={styles.entry} aria-label={`Broken panel ${i + 1}`}>
                    <div className={styles.entryHead}>
                      <strong>{e.panel ? `Panel ${e.panel}` : `Broken panel ${i + 1}`}</strong>
                      {entries.length > 1 && (
                        <button type="button" className={styles.removeBtn} onClick={() => removeEntry(e.id)} disabled={saving}>
                          Remove
                        </button>
                      )}
                    </div>

                    <Dropdown
                      label="Which panel is broken?"
                      value={e.panel}
                      searchable
                      numeric
                      searchPlaceholder="Type a panel number"
                      placeholder="Select panel"
                      options={Array.from({ length: options.panels_per_tracker }, (_, n) => String(n + 1))
                        .filter((v) => !used.has(v))
                        .map((v) => ({
                          value: v,
                          label: `Panel ${v}`,
                          note: recordedPanels.has(v) ? "recorded" : undefined,
                          tone: recordedPanels.has(v) ? ("issue" as const) : undefined,
                        }))}
                      onChange={(v) =>
                        setEntries((prev) =>
                          // a changed panel number means any uploaded photo needs a fresh stamp
                          prev.map((x) => (x.id === e.id ? { ...x, panel: v, photos: x.photos.map((p) => ({ ...p, key: undefined })) } : x)),
                        )
                      }
                    />

                    <div>
                      <span className={styles.label}>What is wrong? Choose all that apply</span>
                      <div className={styles.chips}>
                        {options.defect_types.map((d) => (
                          <button key={d} type="button" aria-pressed={e.defects.includes(d)} className={styles.chip} onClick={() => toggleDefect(e.id, d)}>
                            {d}
                          </button>
                        ))}
                      </div>
                      {e.defects.includes("Other") && (
                        <input
                          className={styles.otherInput}
                          type="text"
                          maxLength={200}
                          value={e.otherText}
                          onChange={(ev) => patchEntry(e.id, { otherText: ev.target.value })}
                          placeholder="Describe the other problem"
                          aria-label="Describe the other problem"
                        />
                      )}
                    </div>

                    <div>
                      <span className={styles.label}>
                        Photos <em className={styles.req}>Required</em>
                      </span>
                      {photoButtons((ev) => addEntryPhotos(e.id, ev), photoCount >= MAX_PHOTOS)}
                      {photoCount > 0 && (
                        <ul className={styles.thumbs}>
                          {e.kept.map((k, n) => (
                            <li key={k}>
                              <img src={`${PHOTO_BASE}/${k}`} alt={`Saved photo ${n + 1}`} />
                              <button type="button" className={styles.thumbRemove} aria-label={`Remove saved photo ${n + 1}`} onClick={() => patchEntry(e.id, { kept: e.kept.filter((x) => x !== k) })} disabled={saving}>
                                <FaTimes aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                          {e.photos.map((p, n) => (
                            <li key={p.id}>
                              <button type="button" className={styles.openBtn} aria-label={`Enlarge photo ${n + 1}`} onClick={() => setViewing(p.url)}>
                                <img src={p.url} alt={`New photo ${n + 1}`} />
                              </button>
                              <button type="button" className={styles.thumbRemove} aria-label={`Remove new photo ${n + 1}`} onClick={() => removeEntryPhoto(e.id, p.id)} disabled={saving}>
                                <FaTimes aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={e.notes}
                      onChange={(ev) => patchEntry(e.id, { notes: ev.target.value })}
                      placeholder="Notes for this panel (optional)"
                      aria-label={`Notes for broken panel ${i + 1}`}
                    />
                  </article>
                );
              })}

              <button
                type="button"
                className={styles.addPanel}
                onClick={() => setEntries((prev) => [...prev, blankEntry()])}
                disabled={saving || entries.length >= options.panels_per_tracker}
              >
                <FaPlus aria-hidden="true" /> Add another broken panel
              </button>
            </section>
          )}

          {/* 3b Nothing broken: optional photos and notes for the tracker */}
          {condition === "ok" && (
            <>
              <section className={styles.section} aria-labelledby="ph">
                <h2 id="ph" className={styles.heading}>
                  <span className={styles.step}>3</span> Photos<span className={styles.hint}>Optional</span>
                </h2>
                {photoButtons(addOkPhotos, okKept.length + okPhotos.length >= MAX_PHOTOS)}
                {okKept.length + okPhotos.length > 0 && (
                  <ul className={styles.thumbs}>
                    {okKept.map((k, n) => (
                      <li key={k}>
                        <img src={`${PHOTO_BASE}/${k}`} alt={`Saved photo ${n + 1}`} />
                        <button type="button" aria-label={`Remove saved photo ${n + 1}`} onClick={() => setOkKept((prev) => prev.filter((x) => x !== k))} disabled={saving}>
                          <FaTimes aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                    {okPhotos.map((p, n) => (
                      <li key={p.id}>
                        <button type="button" className={styles.openBtn} aria-label={`Enlarge photo ${n + 1}`} onClick={() => setViewing(p.url)}>
                          <img src={p.url} alt={`New photo ${n + 1}`} />
                        </button>
                        <button type="button" className={styles.thumbRemove} aria-label={`Remove new photo ${n + 1}`} onClick={() => removeOkPhoto(p.id)} disabled={saving}>
                          <FaTimes aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className={styles.section} aria-labelledby="nt">
                <h2 id="nt" className={styles.heading}>
                  <span className={styles.step}>4</span> Notes<span className={styles.hint}>Optional</span>
                </h2>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={okNotes}
                  onChange={(e) => setOkNotes(e.target.value)}
                  placeholder="Anything the next person should know"
                  aria-label="Notes"
                />
              </section>
            </>
          )}
        </>
      )}

      {adding && <p className={styles.muted}>Preparing photos…</p>}
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
          <img src={viewing} alt="Photo enlarged" onClick={(e) => e.stopPropagation()} />
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
        {!saving && problem && <p className={styles.actionHint}>{problem}</p>}
      </div>
    </div>
  );
}
