import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { FaCamera, FaCheck, FaImages, FaPlus, FaTimes } from "react-icons/fa";
import type { Session } from "../../App";
import { apiJson } from "../../api";
import { FALLBACK_OPTIONS, PHOTO_BASE, type InspectionOptions, compressImage, dateTimeOf, fullName, localDate, longDate, watermarkImage } from "../../lib/inspection";
import { QUEUE_CHANGED, enqueue, listRepairs, type QueuedPhoto, type QueuedRepair } from "../../lib/offlineQueue";
import { setDirty } from "../../lib/dirty";
import { SYNCED_EVENT } from "../../lib/sync";
import Dropdown from "../Dropdown/Dropdown";
import styles from "../Inspection/Inspection.module.scss"; // same look as the inspection form
import ModeSwitch from "../ModeSwitch/ModeSwitch";
import WaitingRepairs from "./WaitingRepairs";

interface Props {
  session: Session;
}

interface Photo {
  id: string;
  file: File;
  url: string;
}

type Action = "fix" | "replace" | "";
type Side = "before" | "after";

/** One repaired panel on the tracker */
interface Entry {
  id: string;
  panel: string;
  action: Action;
  notes: string;
  before: Photo[];
  after: Photo[];
}

interface MySummary {
  panels: number;
  fixed: number;
  replaced: number;
  trackers: number;
}

/** A repair already recorded on the server */
interface Done {
  tracker: number;
  panel: number;
  action: "fix" | "replace";
  notes: string;
  before_keys: string[];
  after_keys: string[];
  username: string;
  first_name: string | null;
  last_name: string | null;
  repaired_at: string;
}

const MAX_PHOTOS = 10;
const LAST_BLOCK_KEY = "lumico:lastBlock";
const newId = () => crypto.randomUUID();
const blankEntry = (): Entry => ({ id: newId(), panel: "", action: "", notes: "", before: [], after: [] });

/** Record panels that were fixed or replaced, with before and after photos. Works with no signal. */
export default function Repair({ session }: Props) {
  const site = session.site.toLowerCase();
  const siteName = site.charAt(0).toUpperCase() + site.slice(1);
  const today = localDate();

  const [options, setOptions] = useState<InspectionOptions>(FALLBACK_OPTIONS);
  const [block, setBlock] = useState<string>(() => localStorage.getItem(LAST_BLOCK_KEY) ?? "");
  const [tracker, setTracker] = useState("");
  const [entries, setEntries] = useState<Entry[]>([blankEntry()]);
  const [mine, setMine] = useState<MySummary | null>(null);
  const [done, setDone] = useState<Done[]>([]); // already uploaded, this block
  const [pending, setPending] = useState<QueuedRepair[]>([]); // saved on this phone, not uploaded yet
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const topRef = useRef<HTMLDivElement>(null);
  const allPhotosRef = useRef<Photo[]>([]);
  allPhotosRef.current = entries.flatMap((e) => [...e.before, ...e.after]);

  // Tell the app when this form holds something unsaved (it will not reload itself then)
  useEffect(() => {
    setDirty("repair", saving || adding || entries.some((e) => e.panel || e.action || e.notes || e.before.length || e.after.length));
    return () => setDirty("repair", false);
  }, [entries, saving, adding]);

  const blockNo = block ? Number(block) : null;
  const trackerNo = tracker ? Number(tracker) : null;

  useEffect(() => {
    apiJson<InspectionOptions>("/inspections/options").then(setOptions).catch(() => {});
  }, []);

  const loadMine = useCallback(() => {
    apiJson<MySummary>(`/repairs/today?${new URLSearchParams({ site, work_date: today })}`)
      .then(setMine)
      .catch(() => {});
  }, [site, today]);

  useEffect(loadMine, [loadMine]);

  const loadBlock = useCallback(
    (b: number) =>
      apiJson<{ repairs: Done[] }>(`/repairs/block?${new URLSearchParams({ site, block: String(b) })}`)
        .then((r) => r.repairs)
        .catch(() => [] as Done[]),
    [site],
  );

  useEffect(() => {
    if (blockNo === null) {
      setDone([]);
      return;
    }
    let cancelled = false;
    loadBlock(blockNo).then((r) => !cancelled && setDone(r));
    return () => {
      cancelled = true;
    };
  }, [blockNo, loadBlock]);

  // Repairs saved on this phone but not uploaded yet
  useEffect(() => {
    const load = () => {
      listRepairs()
        .then(setPending)
        .catch(() => {});
    };
    load();
    window.addEventListener(QUEUE_CHANGED, load);
    return () => window.removeEventListener(QUEUE_CHANGED, load);
  }, []);

  // When waiting repairs finish uploading, show the server's up-to-date list
  useEffect(() => {
    const refresh = () => {
      if (blockNo !== null) loadBlock(blockNo).then(setDone);
    };
    window.addEventListener(SYNCED_EVENT, refresh);
    return () => window.removeEventListener(SYNCED_EVENT, refresh);
  }, [blockNo, loadBlock]);

  useEffect(() => {
    window.addEventListener(SYNCED_EVENT, loadMine);
    return () => window.removeEventListener(SYNCED_EVENT, loadMine);
  }, [loadMine]);

  // Free the photo previews when leaving the screen
  useEffect(
    () => () => {
      allPhotosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [],
  );

  const resetForm = () => {
    allPhotosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    setEntries([blankEntry()]);
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

  const patchEntry = (id: string, patch: Partial<Entry>) => setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const removeEntry = (id: string) =>
    setEntries((prev) => {
      const gone = prev.find((e) => e.id === id);
      [...(gone?.before ?? []), ...(gone?.after ?? [])].forEach((p) => URL.revokeObjectURL(p.url));
      return prev.filter((e) => e.id !== id);
    });

  const addPhotos = async (id: string, side: Side, ev: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(ev.target.files ?? []);
    ev.target.value = ""; // lets the same photo be picked again
    const entry = entries.find((x) => x.id === id);
    if (!files.length || !entry) return;
    setAdding(true);
    try {
      const added: Photo[] = [];
      for (const f of files.slice(0, MAX_PHOTOS - entry[side].length)) {
        const file = await compressImage(f);
        added.push({ id: newId(), file, url: URL.createObjectURL(file) });
      }
      setEntries((prev) => prev.map((x) => (x.id === id ? { ...x, [side]: [...x[side], ...added] } : x)));
    } finally {
      setAdding(false);
    }
  };

  const removePhoto = (id: string, side: Side, photoId: string) =>
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        e[side].filter((p) => p.id === photoId).forEach((p) => URL.revokeObjectURL(p.url));
        return { ...e, [side]: e[side].filter((p) => p.id !== photoId) };
      }),
    );

  // Panels on this tracker that already have a repair (uploaded, or waiting on this phone)
  const doneHere = done.filter((d) => d.tracker === trackerNo);
  const waitingRepairs = pending.filter((p) => p.username === session.username && p.site === site && p.block === blockNo && p.tracker === trackerNo);
  const repairedPanels = new Set([...doneHere.map((d) => String(d.panel)), ...waitingRepairs.flatMap((w) => w.panels.map((p) => String(p.panel)))]);

  // Trackers in this block with a repair: uploaded or still on this phone
  const repairedTrackers = new Map<number, "done" | "phone">();
  for (const p of pending) {
    if (p.username === session.username && p.site === site && p.block === blockNo) repairedTrackers.set(p.tracker, "phone");
  }
  for (const d of done) repairedTrackers.set(d.tracker, "done");

  const usedPanels = (exceptId: string) => new Set(entries.filter((e) => e.id !== exceptId && e.panel).map((e) => e.panel));

  // The first thing stopping a save, shown under the Save button
  const problem = (() => {
    if (blockNo === null || trackerNo === null) return "Choose a block and tracker to start.";
    for (const [i, e] of entries.entries()) {
      const label = e.panel ? `panel ${e.panel}` : `panel ${i + 1}`;
      if (!e.panel) return `Choose the panel (panel ${i + 1}).`;
      if (!e.action) return `Choose fixed or replaced for ${label}.`;
      if (e.before.length === 0) return `Add a BEFORE photo of ${label}.`;
      if (e.after.length === 0) return `Add an AFTER photo of ${label}.`;
    }
    return "";
  })();
  const canSave = problem === "" && !saving && !adding;

  // Saving never needs signal: the job (photos included) is stored on the phone, and the
  // upload bar sends it to AWS now if there is signal, or later when there is.
  const save = async () => {
    if (!canSave || blockNo === null || trackerNo === null) return;
    setSaving(true);
    setError("");
    try {
      const now = new Date();
      const total = entries.reduce((n, e) => n + e.before.length + e.after.length, 0);
      let n = 0;

      const prepare = async (photos: Photo[], lines: string[], label: string): Promise<QueuedPhoto[]> => {
        const out: QueuedPhoto[] = [];
        for (const photo of photos) {
          n += 1;
          setProgress(`Preparing photo ${n} of ${total}…`);
          out.push({ id: newId(), blob: await watermarkImage(photo.file, lines), label });
        }
        return out;
      };

      const item: QueuedRepair = {
        kind: "repair",
        id: newId(),
        username: session.username,
        name: session.name,
        site,
        block: blockNo,
        tracker: trackerNo,
        work_date: localDate(now),
        inspected_at: now.toISOString(),
        panels: [],
        createdAt: Date.now(),
        attempts: 0,
      };

      const sub = `${siteName} · ${dateTimeOf(now.toISOString())}`;
      for (const e of entries) {
        const where = `Block ${blockNo} · Tracker ${trackerNo} · Panel ${e.panel}`;
        item.panels.push({
          panel: Number(e.panel),
          action: e.action === "fix" ? "fix" : "replace",
          notes: e.notes.trim(),
          before: await prepare(e.before, [`BEFORE · ${where}`, sub], `p${e.panel}_before`),
          after: await prepare(e.after, [`AFTER · ${where}`, sub], `p${e.panel}_after`),
        });
      }

      setProgress("Saving on this phone…");
      await enqueue(item);

      setToast(
        `Saved ${entries.length === 1 ? `panel ${entries[0].panel}` : `${entries.length} panels`} on tracker ${trackerNo}. It uploads automatically. Add another, or choose a different tracker.`,
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

  const photoBlock = (e: Entry, side: Side) => {
    const photos = e[side];
    const title = side === "before" ? "BEFORE" : "AFTER";
    return (
      <div>
        <span className={styles.label}>
          {title} photos <em className={styles.req}>Required</em>
        </span>
        {photoButtons((ev) => addPhotos(e.id, side, ev), photos.length >= MAX_PHOTOS)}
        {photos.length > 0 && (
          <ul className={styles.thumbs}>
            {photos.map((p, n) => (
              <li key={p.id}>
                <button type="button" className={styles.openBtn} aria-label={`Enlarge ${side} photo ${n + 1}`} onClick={() => setViewing(p.url)}>
                  <img src={p.url} alt={`${title} photo ${n + 1}`} />
                </button>
                <button type="button" className={styles.thumbRemove} aria-label={`Remove ${side} photo ${n + 1}`} onClick={() => removePhoto(e.id, side, p.id)} disabled={saving}>
                  <FaTimes aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className={styles.page} ref={topRef}>
      <header className={styles.top}>
        <div>
          <h1 className={styles.title}>Panel repairs</h1>
          <p className={styles.sub}>
            <span className={styles.site}>{session.site}</span> solar farm, {longDate(today)}
          </p>
        </div>
        {mine && (
          <p className={styles.tally} aria-label="All staff today">
            <span>All staff today:</span>
            <strong>{mine.fixed}</strong> fixed
            <span className={styles.dot} aria-hidden="true" />
            <strong>{mine.replaced}</strong> replaced
          </p>
        )}
      </header>

      <ModeSwitch active="repair" />

      <div className={styles.live} role="status" aria-live="polite">
        {toast && (
          <p className={styles.toast}>
            <FaCheck aria-hidden="true" /> {toast}
          </p>
        )}
      </div>

      <section className={styles.section} aria-labelledby="loc">
        <h2 id="loc" className={styles.heading}>
          <span className={styles.step}>1</span> Location
        </h2>
        <div className={styles.pickers}>
          <Dropdown
            label="Block"
            value={block}
            searchable
            numeric
            searchPlaceholder="Type a number to find a block"
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
            options={Array.from({ length: options.trackers_per_block }, (_, i) => {
              const state = repairedTrackers.get(i + 1);
              return {
                value: String(i + 1),
                label: `Tracker ${i + 1}`,
                note: state === "done" ? "repaired" : state === "phone" ? "on this phone" : undefined,
                tone: state ? ("ok" as const) : undefined,
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

          <WaitingRepairs repairs={waitingRepairs} onView={setViewing} />

          {doneHere.length > 0 && (
            <section className={styles.recorded} aria-labelledby="rec">
              <h2 id="rec" className={styles.recordedTitle}>
                <FaCheck aria-hidden="true" />
                Already repaired on this tracker: {doneHere.length} {doneHere.length === 1 ? "panel" : "panels"}
              </h2>
              <ul className={styles.recordedList}>
                {doneHere.map((d) => (
                  <li key={`${d.panel}-${d.repaired_at}`}>
                    <div className={styles.recordedHead}>
                      <strong>Panel {d.panel}</strong>
                      <span>{d.action === "fix" ? "Fixed" : "Replaced"}</span>
                    </div>
                    <p className={styles.recordedBy}>
                      {fullName(d.first_name, d.last_name, d.username)}, {dateTimeOf(d.repaired_at)}
                    </p>
                    {d.notes && <p className={styles.recordedNote}>{d.notes}</p>}
                    {(["before_keys", "after_keys"] as const).map((side) =>
                      d[side].length > 0 ? (
                        <div key={side}>
                          <p className={styles.recordedNote}>{side === "before_keys" ? "Before" : "After"}</p>
                          <ul className={styles.prevPhotos}>
                            {d[side].map((k, n) => (
                              <li key={k}>
                                <button type="button" onClick={() => setViewing(`${PHOTO_BASE}/${k}`)} aria-label={`Enlarge ${side === "before_keys" ? "before" : "after"} photo ${n + 1} of panel ${d.panel}`}>
                                  <img src={`${PHOTO_BASE}/${k}`} alt={`Panel ${d.panel} ${side === "before_keys" ? "before" : "after"} ${n + 1}`} loading="lazy" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null,
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.section} aria-labelledby="pn">
            <h2 id="pn" className={styles.heading}>
              <span className={styles.step}>2</span> Repaired panels
              <span className={styles.hint}>
                {entries.length} of {options.panels_per_tracker} panels
              </span>
            </h2>
            <p className={styles.muted}>Add each repaired panel with its before and after photos.</p>

            {entries.map((e, i) => {
              const used = usedPanels(e.id);
              return (
                <article key={e.id} className={styles.entry} aria-label={`Repaired panel ${i + 1}`}>
                  <div className={styles.entryHead}>
                    <strong>{e.panel ? `Panel ${e.panel}` : `Panel ${i + 1}`}</strong>
                    {entries.length > 1 && (
                      <button type="button" className={styles.removeBtn} onClick={() => removeEntry(e.id)} disabled={saving}>
                        Remove
                      </button>
                    )}
                  </div>

                  <Dropdown
                    label="Which panel?"
                    value={e.panel}
                    searchable
                    numeric
                    searchPlaceholder="Type a panel number"
                    placeholder="Select panel"
                    options={Array.from({ length: options.panels_per_tracker }, (_, n) => String(n + 1))
                      .filter((v) => !used.has(v))
                      .map((v) => ({ value: v, label: `Panel ${v}`, note: repairedPanels.has(v) ? "repaired" : undefined, tone: repairedPanels.has(v) ? ("ok" as const) : undefined }))}
                    onChange={(v) => patchEntry(e.id, { panel: v })}
                  />

                  <div className={styles.segment} role="radiogroup" aria-label={`What was done to panel ${i + 1}`}>
                    <button type="button" role="radio" aria-checked={e.action === "fix"} data-tone="ok" onClick={() => patchEntry(e.id, { action: "fix" })}>
                      Fixed
                    </button>
                    <button type="button" role="radio" aria-checked={e.action === "replace"} data-tone="ok" onClick={() => patchEntry(e.id, { action: "replace" })}>
                      Replaced
                    </button>
                  </div>

                  {photoBlock(e, "before")}
                  {photoBlock(e, "after")}

                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={e.notes}
                    onChange={(ev) => patchEntry(e.id, { notes: ev.target.value })}
                    placeholder="Notes for this panel (optional)"
                    aria-label={`Notes for panel ${i + 1}`}
                  />
                </article>
              );
            })}

            <button type="button" className={styles.addPanel} onClick={() => setEntries((prev) => [...prev, blankEntry()])} disabled={saving || entries.length >= options.panels_per_tracker}>
              <FaPlus aria-hidden="true" /> Add another panel
            </button>
          </section>
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
            "Save repair"
          )}
        </button>
        {!saving && problem && <p className={styles.actionHint}>{problem}</p>}
      </div>
    </div>
  );
}
