import { useState, useRef } from "react";
import {
  FaWrench,
  FaSolarPanel,
  FaBoxOpen,
  FaCamera,
  FaChevronRight,
  FaArrowLeft,
  FaArrowRight,
} from "react-icons/fa";
import styles from "./TorqueJobForm.module.scss";
import type { Session } from "../../App";

const GET_API =
  "https://62qd6uo4j4.execute-api.ap-southeast-2.amazonaws.com/default/getWorkLogSharedEditSession";
const POST_API =
  "https://6iswohbvrg.execute-api.ap-southeast-2.amazonaws.com/default/WorkLogSharedEditSession";
const S3_BASE = "https://solar-farm-uploads.s3.ap-southeast-2.amazonaws.com";

interface TorqueJobFormProps {
  project: string;
  session: Session;
}

interface SavedData {
  torqueDone: boolean;
  brokenPanels: string;
  windowPackDone: boolean;
  photos: string[];
  notes: string;
  submitted: boolean;
}

const DEFAULT_DATA: SavedData = {
  torqueDone: false,
  brokenPanels: "",
  windowPackDone: false,
  photos: [],
  notes: "",
  submitted: false,
};

export default function TorqueJobForm({
  project,
  session,
}: TorqueJobFormProps) {
  const [block, setBlock] = useState("");
  const [trackerId, setTrackerId] = useState("");
  const [started, setStarted] = useState(false);
  const [startLoading, setStartLoading] = useState(false);

  const [data, setData] = useState<SavedData>(DEFAULT_DATA);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [savedPreviews, setSavedPreviews] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [enlargedSrc, setEnlargedSrc] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const fetchSession = async (b: string, t: string) => {
    setIsFetching(true);
    try {
      const res = await fetch(GET_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: session.site.toLowerCase(),
          block: b,
          trackerId: t,
        }),
      });
      if (!res.ok) return;
      const raw = await res.json();
      if (!raw || !Array.isArray(raw.tasks)) return;

      const torque = raw.tasks.find((t: any) => t.remark === "torque");
      const broken = raw.tasks.find((t: any) => t.remark === "broken_panels");
      const windowPack = raw.tasks.find((t: any) => t.remark === "window_pack");
      const photoKeys: string[] = torque?.before_photos || [];

      setData({
        torqueDone: torque?.checked || false,
        brokenPanels: broken?.notes || "",
        windowPackDone: windowPack?.checked || false,
        photos: photoKeys,
        notes: raw.notes || "",
        submitted: !!raw.submitted,
      });
      setSavedPreviews(photoKeys.map((k: string) => `${S3_BASE}/${k}`));
    } catch (err) {
      console.warn("Fetch error:", err);
    } finally {
      setIsFetching(false);
    }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!block || !trackerId.trim()) return;
    setStartLoading(true);
    await fetchSession(block, trackerId.trim());
    setStarted(true);
    setStartLoading(false);
  };

  const uploadPhotos = async (): Promise<string[]> => {
    const keys: string[] = [];
    const timestamp = new Date().toLocaleString().replace(/[:./, ]/g, "-");
    const sanitized = trackerId.replace(/\s+/g, "_").toLowerCase();
    for (const [i, photo] of newPhotos.entries()) {
      const fileName = `${sanitized}_torque_${timestamp}_${i + 1}`;
      const res = await fetch(
        `https://3ffk7ivyul.execute-api.ap-southeast-2.amazonaws.com/prod/getPresignedURL-1?project=${project}&mode=before&filename=${fileName}&contentType=${photo.type}`,
        { method: "GET" },
      );
      if (!res.ok) throw new Error("Failed to get presigned URL");
      const { uploadURL, key } = await res.json();
      const up = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": photo.type },
        body: photo,
      });
      if (!up.ok) throw new Error("Upload failed");
      keys.push(key);
    }
    return keys;
  };

  const handleSave = async (submit = false) => {
    if (!data.torqueDone)
      return alert("Please confirm torque tightening is done.");
    try {
      setSaving(true);
      const uploadedKeys = await uploadPhotos();
      const allPhotoKeys = [...data.photos, ...uploadedKeys];

      const tasks = [
        {
          task_name: "Torque Tightening",
          remark: "torque",
          checked: data.torqueDone,
          before_photos: allPhotoKeys,
          after_photos: [],
          notes: "",
          created_by: session.username,
          updated_at: new Date().toISOString(),
        },
        {
          task_name: "Broken Panels",
          remark: "broken_panels",
          checked: true,
          before_photos: [],
          after_photos: [],
          notes: data.brokenPanels || "0",
          created_by: session.username,
          updated_at: new Date().toISOString(),
        },
        {
          task_name: "Window Pack Replacement",
          remark: "window_pack",
          checked: data.windowPackDone,
          before_photos: [],
          after_photos: [],
          notes: "",
          created_by: session.username,
          updated_at: new Date().toISOString(),
        },
      ];

      const res = await fetch(POST_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackerId,
          block,
          site: session.site.toLowerCase(),
          timestamp: new Date().toISOString(),
          username: session.username,
          notes: data.notes,
          submitted: submit,
          tasks,
        }),
      });
      if (!res.ok) throw new Error("Save failed");

      setData((prev) => ({ ...prev, photos: allPhotoKeys, submitted: submit }));
      setSavedPreviews(allPhotoKeys.map((k) => `${S3_BASE}/${k}`));
      setNewPhotos([]);
      setNewPreviews([]);
      alert(submit ? "Submitted ✅" : "Saved ✅");

      // if (submit) {
      //   setStarted(false);
      //   setBlock("");
      //   setTrackerId("");
      //   setData(DEFAULT_DATA);
      //   setSavedPreviews([]);
      // }
    } catch (err) {
      console.error(err);
      alert("Failed ❌");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* ── SELECT TRACKER ── */}
      {!started && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Select Tracker</h2>
          <form onSubmit={handleStart} className={styles.initForm}>
            <div className={styles.field}>
              <label className={styles.label}>Block</label>
              <select
                className={styles.select}
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                required
              >
                <option value="">Select Block</option>
                {Array.from({ length: 25 }, (_, i) => (
                  <option key={i} value={`Block ${i + 1}`}>
                    Block {i + 1}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Tracker ID</label>
              <input
                className={styles.input}
                type="text"
                value={trackerId}
                onChange={(e) => setTrackerId(e.target.value)}
                placeholder="e.g. T12"
                required
              />
            </div>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={startLoading}
            >
              {startLoading ? (
                <>
                  <span className={styles.spinner} /> Loading...
                </>
              ) : (
                "Start"
              )}
            </button>
          </form>
        </div>
      )}

      {/* ── TASK FORM ── */}
      {started && (
        <>
          <div className={styles.headerBar}>
            <button
              className={styles.backBtn}
              onClick={() => {
                setStarted(false);
                setData(DEFAULT_DATA);
                setSavedPreviews([]);
              }}
            >
              <FaArrowLeft style={{ fontSize: "11px" }} />
              Other Tracker
            </button>
            <div className={styles.trackerInfo}>
              <span className={styles.trackerLabel}>{block}</span>
              <FaChevronRight
                style={{
                  fontSize: "10px",
                  color: "var(--color-label-tertiary)",
                }}
              />
              <span className={styles.trackerLabel}>Tracker {trackerId}</span>
              {data.submitted && (
                <span className={styles.submittedBadge}>SUBMITTED</span>
              )}
            </div>
          </div>

          <div className={styles.card}>
            {/* Torque */}
            <div className={styles.taskRow}>
              <div className={`${styles.taskIconWrap} ${styles.iconAmber}`}>
                <FaWrench />
              </div>
              <div className={styles.taskContent}>
                <div className={styles.taskTitle}>Torque Tightening</div>
                <div className={styles.taskSub}>
                  All bolts checked and tightened
                </div>
              </div>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={data.torqueDone}
                  onChange={(e) =>
                    setData((d) => ({ ...d, torqueDone: e.target.checked }))
                  }
                  disabled={data.submitted}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            <div className={styles.divider} />

            {/* Broken panels */}
            <div className={styles.taskRow}>
              <div className={`${styles.taskIconWrap} ${styles.iconRed}`}>
                <FaSolarPanel />
              </div>
              <div className={styles.taskContent}>
                <div className={styles.taskTitle}>Broken Panels</div>
                <div className={styles.taskSub}>
                  Number of broken panels found
                </div>
              </div>
              <input
                className={styles.numberInput}
                type="number"
                min="0"
                value={data.brokenPanels}
                onChange={(e) =>
                  setData((d) => ({ ...d, brokenPanels: e.target.value }))
                }
                placeholder="0"
                disabled={data.submitted}
              />
            </div>

            <div className={styles.divider} />

            {/* Window pack */}
            <div className={styles.taskRow}>
              <div className={`${styles.taskIconWrap} ${styles.iconBlue}`}>
                <FaBoxOpen />
              </div>
              <div className={styles.taskContent}>
                <div className={styles.taskTitle}>Window Pack Replacement</div>
                <div className={styles.taskSub}>Replacement completed</div>
              </div>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={data.windowPackDone}
                  onChange={(e) =>
                    setData((d) => ({ ...d, windowPackDone: e.target.checked }))
                  }
                  disabled={data.submitted}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>
          </div>

          {/* Photos */}
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <FaCamera style={{ color: "var(--color-tint)" }} />
                Photos
              </span>
              <span className={styles.photoCount}>
                {savedPreviews.length + newPreviews.length} uploaded
              </span>
            </h3>
            <p className={styles.photoHint}>
              Take 5–10 photos of the completed row
            </p>

            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              ref={photoInputRef}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setNewPhotos((p) => [...p, ...files]);
                setNewPreviews((p) => [
                  ...p,
                  ...files.map((f) => URL.createObjectURL(f)),
                ]);
              }}
            />

            <div className={styles.photoGrid}>
              {savedPreviews.map((src, i) => (
                <div key={`s-${i}`} className={styles.photoThumb}>
                  <img src={src} alt="" onClick={() => setEnlargedSrc(src)} />
                  <span className={styles.savedTag}>saved</span>
                </div>
              ))}
              {newPreviews.map((src, i) => (
                <div key={`n-${i}`} className={styles.photoThumb}>
                  <img src={src} alt="" onClick={() => setEnlargedSrc(src)} />
                  <button
                    className={styles.removeBtn}
                    onClick={() => {
                      URL.revokeObjectURL(src);
                      setNewPreviews((p) => p.filter((_, x) => x !== i));
                      setNewPhotos((p) => p.filter((_, x) => x !== i));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {!data.submitted && (
                <div
                  className={styles.addPhotoBtn}
                  onClick={() => photoInputRef.current?.click()}
                >
                  <FaCamera className={styles.addIcon} />
                  <span className={styles.addLabel}>Add Photos</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Notes</h3>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Any additional notes for this tracker..."
              value={data.notes}
              onChange={(e) =>
                setData((d) => ({ ...d, notes: e.target.value }))
              }
              disabled={data.submitted}
            />
          </div>

          {/* Actions */}
          {!data.submitted && (
            <div className={styles.actions}>
              <button
                className={styles.saveBtn}
                onClick={() => handleSave(false)}
                disabled={saving}
              >
                {saving ? <span className={styles.spinner} /> : null}
                Save Progress
              </button>
              <button
                className={styles.submitBtn}
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                Submit & Next Tracker{" "}
                <FaArrowRight style={{ fontSize: "12px" }} />
              </button>
            </div>
          )}

          {data.submitted && (
            <div className={styles.submittedBanner}>
              ✅ This tracker has been submitted. Select a new tracker to
              continue.
            </div>
          )}
        </>
      )}

      {(saving || isFetching) && (
        <div className={styles.overlay}>
          <div className={styles.overlaySpinner} />
        </div>
      )}

      {enlargedSrc && (
        <div className={styles.lightbox} onClick={() => setEnlargedSrc(null)}>
          <img src={enlargedSrc} alt="" className={styles.lightboxImg} />
        </div>
      )}
    </div>
  );
}
