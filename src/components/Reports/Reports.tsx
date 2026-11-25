import { useEffect, useMemo, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaDownload, FaPrint, FaTimes } from "react-icons/fa";
import { apiFetch, api, apiJson } from "../../api";
import { dateTimeOf, dayKey, fullName, localDate, longDate, shiftDay } from "../../lib/inspection";
import Dropdown from "../Dropdown/Dropdown";
import ClientReport from "./ClientReport";
import { FIXED_ENABLED } from "../../lib/features";
import RepairReport from "./RepairReport";
import type { Daily, RepairData } from "./types";
import styles from "./Reports.module.scss";

interface Progress {
  from: string;
  to: string;
  rows: {
    work_date: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    trackers_checked: number;
    broken_panels: number;
  }[];
}

type RepairDaily = RepairData;

type Tab = "daily" | "repairs" | "staff" | "client" | "repairReport";
type Range = "day" | "week" | "month" | "year";

const RANGE_DAYS: Record<Range, number> = { day: 0, week: 6, month: 29, year: 365 };
const RANGE_LABEL: Record<Range, string> = { day: "This day", week: "Last 7 days", month: "Last 30 days", year: "Last 12 months" };

export default function Reports() {
  const [tab, setTab] = useState<Tab>("daily");
  const [date, setDate] = useState(localDate());
  const [site, setSite] = useState("all");
  const [daily, setDaily] = useState<Daily | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [repairs, setRepairs] = useState<RepairDaily | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [allBlocks, setAllBlocks] = useState(false);
  const [person, setPerson] = useState("all");
  const [range, setRange] = useState<Range>("day");
  const dateFrom = shiftDay(date, -RANGE_DAYS[range]);
  const repairTab = tab === "repairs" || tab === "repairReport";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const job =
      tab === "repairs" || tab === "repairReport"
        ? apiJson<RepairDaily>(`/reports/repairs?${new URLSearchParams({ date, date_from: dateFrom, site })}`).then((r) => !cancelled && setRepairs(r))
        : tab !== "staff"
        ? apiJson<Daily>(`/reports/daily?${new URLSearchParams({ date, site })}`).then((d) => !cancelled && setDaily(d))
        : apiJson<Progress>(
            `/reports/staff-progress?${new URLSearchParams({ date_to: date, date_from: shiftDay(date, -13), site })}`,
          ).then((p) => !cancelled && setProgress(p));
    job
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, date, site, dateFrom]);

  const downloadCsv = async () => {
    setExporting(true);
    try {
      const path = tab === "repairs" ? "/reports/repairs.csv" : "/reports/daily.csv";
      const file = tab === "repairs" ? "repairs" : "inspections";
      const params = new URLSearchParams(tab === "repairs" ? { date, date_from: dateFrom, site } : { date, site });
      const res = await apiFetch(api(`${path}?${params}`));
      if (!res.ok) throw new Error("Could not download the CSV.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${file}-${tab === "repairs" && dateFrom !== date ? `${dateFrom}_to_` : ""}${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download the CSV.");
    } finally {
      setExporting(false);
    }
  };

  const sites = [...new Set([...(daily?.sites ?? []), ...(repairs?.sites ?? [])])].sort();
  const staffOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of progress?.rows ?? []) m.set(r.username, fullName(r.first_name, r.last_name, r.username));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [progress]);
  const isToday = date >= localDate();

  return (
    <div className={styles.page}>
      <header className={styles.top} data-print="hide">
        <h1 className={styles.title}>Reports</h1>
        <div className={styles.tabs} role="tablist">
          {(["daily", "repairs", "staff", "client"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t || (t === "repairs" && tab === "repairReport")} onClick={() => setTab(t)}>
              {t === "daily" ? "Inspections" : t === "repairs" ? "Repairs" : t === "staff" ? "Staff progress" : "Client report"}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.controls} data-print="hide">
        <div className={styles.dateNav}>
          <button aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}>
            <FaChevronLeft aria-hidden="true" />
          </button>
          <input
            type="date"
            value={date}
            max={dayKey(new Date())}
            aria-label="Report date"
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <button aria-label="Next day" disabled={isToday} onClick={() => setDate(shiftDay(date, 1))}>
            <FaChevronRight aria-hidden="true" />
          </button>
        </div>
        <Dropdown
          label="Site"
          hideLabel
          align="right"
          className={styles.siteDd}
          value={site}
          placeholder="All sites"
          options={[{ value: "all", label: "All sites" }, ...sites.map((x) => ({ value: x, label: x.charAt(0).toUpperCase() + x.slice(1) }))]}
          onChange={setSite}
        />
        {repairTab && (
          <Dropdown
            label="Period"
            hideLabel
            className={styles.siteDd}
            placeholder="This day"
            value={range}
            options={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
            onChange={(v) => setRange(v as Range)}
          />
        )}
        {tab === "staff" && progress && (
          <Dropdown
            label="Staff member"
            hideLabel
            searchable
            className={styles.staffDd}
            searchPlaceholder="Find a staff member"
            value={person}
            placeholder="All staff"
            options={[{ value: "all", label: "All staff" }, ...staffOptions]}
            onChange={setPerson}
          />
        )}
        {(tab === "daily" || tab === "repairs") && (
          <div className={styles.actions}>
            <button onClick={downloadCsv} disabled={exporting}>
              <FaDownload aria-hidden="true" /> {exporting ? "Preparing…" : "Download CSV"}
            </button>
            <button onClick={() => setTab(tab === "daily" ? "client" : "repairReport")}>
              <FaPrint aria-hidden="true" /> Client report (PDF)
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {loading && <p className={styles.muted}>Loading…</p>}

      {tab === "client" && daily && !loading && <ClientReport daily={daily} />}

      {tab === "daily" && daily && !loading && (
        <div>
          <p className={styles.printTitle}>
            Lumico solar farm inspection report, {longDate(daily.date)}
            {daily.site ? `, ${daily.site}` : ""}
          </p>

          <section className={styles.ledger} aria-label="Summary">
            <div>
              <strong>{daily.totals.trackers_checked}</strong>
              <span>of {daily.totals.trackers_total} trackers checked</span>
            </div>
            <div>
              <strong>{daily.totals.blocks_touched}</strong>
              <span>blocks visited</span>
            </div>
            <div>
              <strong className={daily.totals.trackers_with_issues ? styles.bad : ""}>
                {daily.totals.trackers_with_issues}
              </strong>
              <span>trackers with issues</span>
            </div>
            <div>
              <strong className={daily.totals.broken_panels ? styles.bad : ""}>{daily.totals.broken_panels}</strong>
              <span>broken panels</span>
            </div>
          </section>

          <section className={styles.panel}>
            <h2>Blocks</h2>
            <ul className={styles.blocks}>
              {daily.blocks.filter((b) => allBlocks || b.trackers_checked > 0).map((b) => {
                const pct = b.trackers_total ? Math.round((b.trackers_checked / b.trackers_total) * 100) : 0;
                return (
                  <li key={b.block}>
                    <span className={styles.blockName}>Block {b.block}</span>
                    <span className={styles.meter} role="img" aria-label={`${pct} percent checked`}>
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <span className={styles.blockCount}>
                      {b.trackers_checked}/{b.trackers_total}
                    </span>
                    <span className={b.broken_panels ? styles.bad : styles.muted}>
                      {b.broken_panels ? `${b.broken_panels} broken` : "none"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {daily.totals.blocks_touched === 0 && !allBlocks && <p className={styles.muted}>No blocks visited yet.</p>}
            <button type="button" className={styles.more} data-print="hide" onClick={() => setAllBlocks((v) => !v)}>
              {allBlocks ? "Show only blocks visited" : "Show all 25 blocks"}
            </button>
          </section>

          <section className={styles.panel}>
            <h2>Staff</h2>
            {daily.staff.length === 0 ? (
              <p className={styles.muted}>No inspections recorded on this day.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.cards}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Trackers</th>
                      <th>With issues</th>
                      <th>Broken panels</th>
                      <th>First</th>
                      <th>Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.staff.map((s) => (
                      <tr key={s.username}>
                        <td>{fullName(s.first_name, s.last_name, s.username)}</td>
                        <td data-label="Trackers">{s.trackers_checked}</td>
                        <td data-label="With issues">{s.issues}</td>
                        <td data-label="Broken panels">{s.broken_panels}</td>
                        <td data-label="First">{dateTimeOf(s.first_at)}</td>
                        <td data-label="Last">{dateTimeOf(s.last_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h2>Broken panels ({daily.issues.length})</h2>
            {daily.issues.length === 0 ? (
              <p className={styles.muted}>No issues recorded.</p>
            ) : (
              <ul className={styles.issues}>
                {daily.issues.map((i) => (
                  <li key={i.id}>
                    <div className={styles.issueHead}>
                      <strong>
                        Block {i.block}, tracker {i.tracker}
                        {i.panel ? `, panel ${i.panel}` : ""}
                      </strong>
                      <span className={styles.bad}>
                        {i.panel ? "Broken" : `${i.broken_panels} broken ${i.broken_panels === 1 ? "panel" : "panels"}`}
                      </span>
                    </div>
                    <p className={styles.meta}>
                      {fullName(i.first_name, i.last_name, i.username)}, {dateTimeOf(i.inspected_at)}
                      {daily.sites.length > 1 ? `, ${i.site}` : ""}
                    </p>
                    {i.defects && i.defects.length > 0 && <p>{i.defects.join(", ")}</p>}
                    {i.notes && <p className={styles.notes}>{i.notes}</p>}
                    {i.photo_keys && i.photo_keys.length > 0 && (
                      <ul className={styles.photos} data-print="hide">
                        {i.photo_keys.map((k, n) => (
                          <li key={k}>
                            <button onClick={() => setPhoto(`${daily.photo_base}/${k}`)} aria-label={`Open photo ${n + 1}`}>
                              <img src={`${daily.photo_base}/${k}`} alt={`Block ${i.block} tracker ${i.tracker}, photo ${n + 1}`} loading="lazy" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "repairReport" && repairs && !loading && <RepairReport data={repairs} onBack={() => setTab("repairs")} />}

      {tab === "repairs" && repairs && !loading && <RepairsView data={repairs} showSite={sites.length > 1} onPhoto={setPhoto} />}

      {tab === "staff" && progress && !loading && <StaffMatrix data={progress} only={person} />}

      {photo && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setPhoto(null)} data-print="hide">
          <button aria-label="Close photo" onClick={() => setPhoto(null)}>
            <FaTimes aria-hidden="true" />
          </button>
          <img src={photo} alt="Inspection" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function RepairsView({ data, showSite, onPhoto }: { data: RepairDaily; showSite: boolean; onPhoto: (url: string) => void }) {
  const t = data.totals;
  const photos = (keys: string[], label: string, i: RepairDaily["repairs"][number]) =>
    keys.length > 0 && (
      <div>
        <p className={styles.meta}>{label}</p>
        <ul className={styles.photos} data-print="hide">
          {keys.map((k, n) => (
            <li key={k}>
              <button onClick={() => onPhoto(`${data.photo_base}/${k}`)} aria-label={`Open ${label.toLowerCase()} photo ${n + 1}`}>
                <img src={`${data.photo_base}/${k}`} alt={`Block ${i.block} tracker ${i.tracker} panel ${i.panel}, ${label.toLowerCase()} ${n + 1}`} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div>
      <p className={styles.printTitle}>Lumico solar farm {FIXED_ENABLED ? "repair" : "panel replacement"} report, {data.date_from === data.date ? longDate(data.date) : `${longDate(data.date_from)} to ${longDate(data.date)}`}</p>

      <section className={styles.ledger} aria-label="Repair summary">
        {FIXED_ENABLED ? (
          <>
            <div>
              <strong>{t.panels}</strong>
              <span>panels repaired</span>
            </div>
            <div>
              <strong>{t.fixed}</strong>
              <span>fixed</span>
            </div>
            <div>
              <strong>{t.replaced}</strong>
              <span>replaced</span>
            </div>
          </>
        ) : (
          <>
            <div>
              <strong>{t.panels}</strong>
              <span>panels replaced</span>
            </div>
            <div>
              <strong>{t.trackers}</strong>
              <span>{t.trackers === 1 ? "tracker" : "trackers"}</span>
            </div>
            <div>
              <strong>{t.blocks_touched}</strong>
              <span>{t.blocks_touched === 1 ? "block" : "blocks"}</span>
            </div>
          </>
        )}
        <div>
          <strong>{t.before_photos + t.after_photos}</strong>
          <span>photos</span>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Staff</h2>
        {data.staff.length === 0 ? (
          <p className={styles.muted}>No repairs recorded in this period.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.cards}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>{FIXED_ENABLED ? "Panels" : "Panels replaced"}</th>
                  {FIXED_ENABLED && <th>Fixed</th>}
                  {FIXED_ENABLED && <th>Replaced</th>}
                  <th>First</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => (
                  <tr key={s.username}>
                    <td>{fullName(s.first_name, s.last_name, s.username)}</td>
                    <td data-label={FIXED_ENABLED ? "Panels" : "Panels replaced"}>{s.panels}</td>
                    {FIXED_ENABLED && <td data-label="Fixed">{s.fixed}</td>}
                    {FIXED_ENABLED && <td data-label="Replaced">{s.replaced}</td>}
                    <td data-label="First">{dateTimeOf(s.first_at)}</td>
                    <td data-label="Last">{dateTimeOf(s.last_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <h2>{FIXED_ENABLED ? "Repaired" : "Replaced"} panels ({data.repairs.length})</h2>
        {data.repairs.length === 0 ? (
          <p className={styles.muted}>No repairs recorded.</p>
        ) : (
          <ul className={styles.issues}>
            {data.repairs.map((i) => (
              <li key={i.id}>
                <div className={styles.issueHead}>
                  <strong>
                    Block {i.block}, tracker {i.tracker}, panel {i.panel}
                  </strong>
                  {FIXED_ENABLED && <span>{i.action === "fix" ? "Fixed" : "Replaced"}</span>}
                </div>
                <p className={styles.meta}>
                  {fullName(i.first_name, i.last_name, i.username)}, {dateTimeOf(i.repaired_at)}
                  {showSite ? `, ${i.site}` : ""}
                </p>
                {i.notes && <p className={styles.notes}>{i.notes}</p>}
                {photos(i.before_keys, "Before", i)}
                {photos(i.after_keys, "After", i)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StaffMatrix({ data, only }: { data: Progress; only: string }) {
  const days: string[] = [];
  for (let d = data.to; d >= data.from && days.length < 63; d = shiftDay(d, -1)) days.push(d);
  days.reverse();

  const people = new Map<string, string>();
  const cell = new Map<string, { n: number; broken: number }>();
  const totals = new Map<string, number>();
  for (const r of data.rows) {
    const day = String(r.work_date).slice(0, 10);
    people.set(r.username, fullName(r.first_name, r.last_name, r.username));
    cell.set(`${r.username}|${day}`, { n: r.trackers_checked, broken: r.broken_panels });
    totals.set(r.username, (totals.get(r.username) ?? 0) + r.trackers_checked);
  }
  const rows = [...people.keys()].filter((u) => only === "all" || u === only).sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));

  if (rows.length === 0) return <p className={styles.muted}>{only === "all" ? "No inspections in the last 14 days." : "No inspections by this person in the last 14 days."}</p>;

  return (
    <section className={styles.panel}>
      <h2>Trackers checked per day</h2>
      <ul className={styles.people}>
        {rows.map((u) => (
          <li key={u}>
            <div className={styles.personHead}>
              <strong>{people.get(u)}</strong>
              <span>{totals.get(u)} trackers</span>
            </div>
            <ol className={styles.dayGrid}>
              {days.map((d) => {
                const c = cell.get(`${u}|${d}`);
                return (
                  <li key={d} className={c ? (c.broken ? styles.dayBroken : styles.dayDone) : ""}>
                    <span>{Number(d.slice(8, 10))}</span>
                    <strong>{c ? c.n : "–"}</strong>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ul>
      <div className={`${styles.tableWrap} ${styles.matrixWrap}`}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th>Name</th>
              {days.map((d) => (
                <th key={d}>
                  {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u}>
                <td>{people.get(u)}</td>
                {days.map((d) => {
                  const c = cell.get(`${u}|${d}`);
                  return (
                    <td key={d} className={c?.broken ? styles.hasBroken : ""} title={c ? `${c.broken} broken panels` : ""}>
                      {c ? c.n : "–"}
                    </td>
                  );
                })}
                <td>
                  <strong>{totals.get(u)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.muted}>Amber days had broken panels. Day number on top, trackers checked below.</p>
    </section>
  );
}
