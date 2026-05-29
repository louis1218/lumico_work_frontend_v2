import { useState, useEffect } from "react";
import { FaSearch } from "react-icons/fa";
import styles from "./PreviousWork.module.scss";
import type { Session } from "../../App";

interface TaskEntry {
  task_name: string;
  checked: boolean;
  isComplete: boolean;
  needsRepair: boolean;
  created_by: string;
  updated_at: string;
  notes?: string;
  before_photos?: string[];
  after_photos?: string[];
}

interface LogEntry {
  block: string;
  tracker_id: string;
  last_updated: string;
  site: string;
  notes?: string;
  tasks?: TaskEntry[];
  before_barcodes?: { barcode: string }[];
  after_barcodes?: { barcode: string }[];
  image_files?: { before_image?: string[]; after_image?: string[] };
}

interface PreviousWorkProps {
  session: Session;
  header: React.ReactNode;
  username?: string;
  isAdmin?: boolean;
  allUsers?: unknown[];
}

const TEAM_GOAL = 1200;

export default function PreviousWork({ session, header }: PreviousWorkProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );
  const [selectedBlock, setSelectedBlock] = useState("");
  const [selectedTrackerId, setSelectedTrackerId] = useState("");
  const [useDateOnly, setUseDateOnly] = useState(true);
  const [teamTotalTasks, setTeamTotalTasks] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [enlargedSrc, setEnlargedSrc] = useState<string | null>(null);

  const toggleExpand = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const query = new URLSearchParams({
          taskType: "upload",
          site: session.site.toLowerCase(),
          // no date filter = all records
        });
        const res = await fetch(
          `https://yeyhsz0wrg.execute-api.ap-southeast-2.amazonaws.com/default/getUserWorkLog?${query}`,
        );
        const data = await res.json();
        if (res.ok) {
          setTeamTotalTasks(data.totalTeamTasks || 0);
          // don't set logs here — keep the list empty until user searches
        }
      } catch {
        /* silent */
      }
    };
    fetchInitial();
  }, []);

  const handleSearch = async () => {
    if (!useDateOnly && !selectedBlock && !selectedTrackerId) {
      alert("Please enter a Block and/or Tracker ID.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        taskType: "upload",
        site: session.site.toLowerCase(),
        ...(useDateOnly && selectedDate ? { date: selectedDate } : {}),
        ...(!useDateOnly && selectedBlock ? { block: selectedBlock } : {}),
        ...(!useDateOnly && selectedTrackerId
          ? { tracker_id: selectedTrackerId }
          : {}),
      });
      const res = await fetch(
        `https://yeyhsz0wrg.execute-api.ap-southeast-2.amazonaws.com/default/getUserWorkLog?${query}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to fetch");
      setLogs(data.logs || []);
      setTeamTotalTasks(data.totalTeamTasks || 0);
    } catch {
      setError("Could not load previous work.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const progress = Math.min((teamTotalTasks / TEAM_GOAL) * 100, 100);
  const displayProgress =
    progress < 1 && teamTotalTasks > 0 ? 1 : Math.round(progress);

  return (
    <div className={styles.page}>
      <div className={styles.headerWrap}>{header}</div>

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <div className={styles.controlsHeader}>
          {/* Search mode */}
          <div className={styles.controlRow}>
            <div className={styles.controlLabel}>Search By</div>
            <div className={styles.segmented}>
              <button
                className={`${styles.segBtn} ${useDateOnly ? styles.active : ""}`}
                onClick={() => setUseDateOnly(true)}
              >
                Date
              </button>
              <button
                className={`${styles.segBtn} ${!useDateOnly ? styles.active : ""}`}
                onClick={() => setUseDateOnly(false)}
              >
                Block + Tracker
              </button>
            </div>
          </div>

          {/* Inputs */}
          {useDateOnly ? (
            <div className={styles.controlRow}>
              <div className={styles.controlLabel}>Date</div>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}>
                  <input
                    className={styles.input}
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.controlRow}>
              {/* <div className={styles.controlLabel}>Location</div> */}
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Block</label>
                  <select
                    className={styles.select}
                    value={selectedBlock}
                    onChange={(e) => setSelectedBlock(e.target.value)}
                  >
                    <option value="">Select Block</option>
                    {Array.from({ length: 25 }, (_, i) => (
                      <option key={i} value={`Block ${i + 1}`}>
                        Block {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Tracker ID</label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="e.g. T12"
                    value={selectedTrackerId}
                    onChange={(e) => setSelectedTrackerId(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.controlsFooter}>
          <button
            className={styles.searchBtn}
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.btnSpinner} />
            ) : (
              <FaSearch style={{ fontSize: "11px" }} />
            )}
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {/* ── Progress — always visible ── */}
      <div className={styles.progressCard}>
        <div className={styles.progressHeader}>
          <span className={styles.progressLabel}>
            Team Progress — Maintenance Tasks
          </span>
          <span className={styles.progressCount}>
            {teamTotalTasks} / {TEAM_GOAL} trackers
          </span>
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${displayProgress}%` }}
          />
        </div>
        <div className={styles.progressPct}>{displayProgress}%</div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {logs.length === 0 && !loading && !error && (
        <div className={styles.empty}>
          Select a date or block / tracker and press Search to view logs.
        </div>
      )}

      {/* ── Log list ── */}
      <div className={styles.logList}>
        {logs.map((entry, index) => {
          const key = `${entry.block}-${entry.tracker_id}-${entry.last_updated}`;
          const isExpanded = expanded[key];
          return (
            <div key={index} className={styles.logCard}>
              <button
                className={styles.logHeader}
                onClick={() => toggleExpand(key)}
              >
                <span className={styles.logTitle}>
                  {entry.block} / {entry.tracker_id}
                </span>
                <span className={styles.logMeta}>
                  {new Date(entry.last_updated).toLocaleString()}
                </span>
                <span className={styles.chevron}>{isExpanded ? "▼" : "▶"}</span>
              </button>

              {isExpanded && (
                <div className={styles.logBody}>
                  <div className={styles.logRow}>
                    <span className={styles.logKey}>Site</span>
                    <span
                      className={styles.logVal}
                      style={{ textTransform: "capitalize" }}
                    >
                      {entry.site}
                    </span>
                  </div>
                  {entry.tasks?.map((task, i) => (
                    <div key={i} className={styles.taskCard}>
                      <div className={styles.taskName}>{task.task_name}</div>
                      <div className={styles.taskMeta}>
                        <span
                          className={
                            task.checked ? styles.tagSuccess : styles.tagDanger
                          }
                        >
                          {task.checked ? "✓ Checked" : "✗ Not Checked"}
                        </span>
                        <span
                          className={
                            task.isComplete
                              ? styles.tagSuccess
                              : styles.tagWarning
                          }
                        >
                          {task.isComplete ? "Complete" : "Incomplete"}
                        </span>
                        {task.needsRepair && (
                          <span className={styles.tagDanger}>Needs Repair</span>
                        )}
                      </div>
                      <div className={styles.taskDetails}>
                        <span>By: {task.created_by}</span>
                        <span>
                          {new Date(task.updated_at).toLocaleString()}
                        </span>
                      </div>
                      {task.notes && (
                        <div className={styles.taskNotes}>
                          {task.task_name === "Broken Panels"
                            ? `Broken panels found: ${task.notes}`
                            : task.notes}
                        </div>
                      )}
                    </div>
                  ))}

                  {(() => {
                    const allPhotos =
                      entry.tasks?.find(
                        (t) => t.task_name === "Torque Tightening",
                      )?.before_photos || [];
                    if (allPhotos.length === 0) return null;
                    return (
                      <div style={{ marginTop: "var(--space-3)" }}>
                        <div
                          className={styles.logKey}
                          style={{ marginBottom: "var(--space-2)" }}
                        >
                          Photos ({allPhotos.length})
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "var(--space-2)",
                            flexWrap: "wrap",
                          }}
                        >
                          {allPhotos.map((key, i) => (
                            <img
                              key={i}
                              src={`https://solar-farm-uploads.s3.ap-southeast-2.amazonaws.com/${key}`}
                              alt=""
                              onClick={() =>
                                setEnlargedSrc(
                                  `https://solar-farm-uploads.s3.ap-southeast-2.amazonaws.com/${key}`,
                                )
                              }
                              style={{
                                width: "64px",
                                height: "64px",
                                objectFit: "cover",
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--color-separator-2)",
                                cursor: "zoom-in",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {enlargedSrc && (
        <div
          onClick={() => setEnlargedSrc(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            cursor: "zoom-out",
          }}
        >
          <img
            src={enlargedSrc}
            alt=""
            style={{
              maxWidth: "92%",
              maxHeight: "92%",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-modal)",
            }}
          />
        </div>
      )}
    </div>
  );
}
