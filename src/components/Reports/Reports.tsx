import { useEffect, useMemo, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaDownload, FaPrint, FaTimes } from "react-icons/fa";
import { apiFetch, api, apiJson } from "../../api";
import { dateTimeOf, dayKey, fullName, localDate, longDate, shiftDay } from "../../lib/inspection";
import Dropdown from "../Dropdown/Dropdown";
import styles from "./Reports.module.scss";

interface Daily {
  date: string;
  site: string | null;
  sites: string[];
  photo_base: string;
  totals: {
    inspections: number;
    trackers_checked: number;
    blocks_touched: number;
    trackers_with_issues: number;
    broken_panels: number;
    trackers_total: number;
  };
  blocks: { block: number; trackers_checked: number; trackers_total: number; issues: number; broken_panels: number }[];
  staff: {
    username: string;
    first_name: string | null;
    last_name: string | null;
    inspections: number;
    trackers_checked: number;
    issues: number;
    broken_panels: number;
    first_at: string;
    last_at: string;
  }[];
  issues: {
    id: number;
    site: string;
    block: number;
    tracker: number;
    broken_panels: number;
    defects: string[] | null;
    notes: string | null;
    photo_keys: string[] | null;
    username: string;
    first_name: string | null;
    last_name: string | null;
    inspected_at: string;
  }[];
}

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

type Tab = "daily" | "staff";

export default function Reports() {
  const [tab, setTab] = useState<Tab>("daily");
  const [date, setDate] = useState(localDate());
  const [site, setSite] = useState("all");
  const [daily, setDaily] = useState<Daily | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [allBlocks, setAllBlocks] = useState(false);
  const [person, setPerson] = useState("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const job =
      tab === "daily"
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
  }, [tab, date, site]);

  const downloadCsv = async () => {
    setExporting(true);
    try {
      const res = await apiFetch(api(`/reports/daily.csv?${new URLSearchParams({ date, site })}`));
      if (!res.ok) throw new Error("Could not download the CSV.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspections-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download the CSV.");
    } finally {
      setExporting(false);
    }
  };

  const sites = daily?.sites ?? [];
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
          {(["daily", "staff"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === "daily" ? "Daily report" : "Staff progress"}
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
        {tab === "daily" && (
          <div className={styles.actions}>
            <button onClick={downloadCsv} disabled={exporting}>
              <FaDownload aria-hidden="true" /> {exporting ? "Preparing…" : "Download CSV"}
            </button>
            <button onClick={() => window.print()}>
              <FaPrint aria-hidden="true" /> Print or save PDF
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

      {tab === "daily" && daily && !loading && (
        <div data-print="main">
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
            <h2>Broken panels ({daily.issues.length} {daily.issues.length === 1 ? "tracker" : "trackers"})</h2>
            {daily.issues.length === 0 ? (
              <p className={styles.muted}>No issues recorded.</p>
            ) : (
              <ul className={styles.issues}>
                {daily.issues.map((i) => (
                  <li key={i.id}>
                    <div className={styles.issueHead}>
                      <strong>
                        Block {i.block}, tracker {i.tracker}
                      </strong>
                      <span className={styles.bad}>
                        {i.broken_panels} broken {i.broken_panels === 1 ? "panel" : "panels"}
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
