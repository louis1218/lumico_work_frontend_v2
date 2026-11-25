import { useMemo, useRef, useState } from "react";
import { FaArrowLeft, FaPrint } from "react-icons/fa";
import { dateTimeOf, fullName, longDate } from "../../lib/inspection";
import { FIXED_ENABLED, REPLACE_TARGET } from "../../lib/features";
import type { RepairData } from "./types";
import base from "./ClientReport.module.scss";
import styles from "./RepairReport.module.scss";

// This job only replaces panels: with FIXED_ENABLED off the report speaks of replacements only
const WORK = FIXED_ENABLED ? "repair" : "replacement";
const F = FIXED_ENABLED; // shorthand for the columns that only matter when panels can also be fixed

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Repair = RepairData["repairs"][number];

/** Ring chart of the job: panels replaced before this report's period, in it, and still to do. */
function ProgressRing({ earlier, now, target, oneDay }: { earlier: number; now: number; target: number; oneDay: boolean }) {
  const done = earlier + now;
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const size = 168;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = done > 0 && done < target ? 2 : 0; // a thin surface gap between the parts
  const len = (n: number) => (target > 0 ? (Math.min(n, target) / target) * c : 0);
  const earlierLen = len(earlier);
  const nowLen = Math.min(len(now), c - earlierLen);
  const remaining = Math.max(0, target - done);
  const arc = (length: number, offset: number, color: string) =>
    length > 0 ? (
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${Math.max(0, length - gap)} ${c}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    ) : null;
  return (
    <div className={styles.progress}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} of ${target} panels replaced, ${pct} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8ebf0" strokeWidth={stroke} />
        {arc(earlierLen, 0, "#475467")}
        {arc(nowLen, earlierLen, "#f59e0b")}
        <text x="50%" y="47%" textAnchor="middle" className={styles.ringPct}>
          {pct}%
        </text>
        <text x="50%" y="62%" textAnchor="middle" className={styles.ringSub}>
          {done} of {target}
        </text>
      </svg>
      <div className={styles.progressText}>
        <h3>Job progress</h3>
        <p>
          <strong>{done}</strong> of {target} panels replaced so far.{" "}
          {remaining > 0 ? `${remaining} still to replace.` : "All panels in this job have been replaced."}
        </p>
        <ul className={styles.legend}>
          {earlier > 0 && (
            <li>
              <span style={{ background: "#475467" }} /> Earlier days: {earlier}
            </li>
          )}
          <li>
            <span style={{ background: "#f59e0b" }} /> {oneDay ? "This day" : "This period"}: {now}
          </li>
          <li>
            <span style={{ background: "#e8ebf0" }} /> Remaining: {remaining}
          </li>
        </ul>
      </div>
    </div>
  );
}

/** The repair report as the client receives it: summary, progress by block, technicians, and every panel with before and after photos. */
export default function RepairReport({ data, onBack }: { data: RepairData; onBack: () => void }) {
  const doc = useRef<HTMLElement>(null);
  const [preparing, setPreparing] = useState(false);
  const serials = data.serials ?? {}; // panel serials recorded for these photos

  const t = data.totals;
  const sitesInReport = [...new Set(data.repairs.map((r) => r.site))];
  const siteLabel = data.site ? cap(data.site) : sitesInReport.length ? sitesInReport.map(cap).join(", ") : "All sites";
  const multiSite = sitesInReport.length > 1;
  const oneDay = data.date_from === data.date;
  const period = oneDay ? longDate(data.date) : `${longDate(data.date_from)} to ${longDate(data.date)}`;
  const technicians = data.staff.map((s) => fullName(s.first_name, s.last_name, s.username));
  const photos = t.before_photos + t.after_photos;

  // Register grouped as site > block > tracker > panels
  const groups = useMemo(() => {
    const map = new Map<string, { site: string; block: number; tracker: number; items: Repair[] }>();
    for (const r of data.repairs) {
      const k = `${r.site}|${r.block}|${r.tracker}`;
      const g = map.get(k) ?? { site: r.site, block: r.block, tracker: r.tracker, items: [] };
      g.items.push(r);
      map.set(k, g);
    }
    return [...map.values()];
  }, [data.repairs]);

  const save = async () => {
    setPreparing(true);
    // Wait for every photo so none is missing from the PDF
    const imgs = Array.from(doc.current?.querySelectorAll("img") ?? []);
    await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
    setPreparing(false);
    window.print();
  };

  const side = (r: Repair, which: "before" | "after") => {
    const keys = which === "before" ? r.before_keys : r.after_keys;
    const label = which === "before" ? "Before" : "After";
    return (
      <div className={styles.side}>
        <h4>{label}</h4>
        {keys.some((k) => serials[k]?.serial) && (
          <p className={styles.serial}>
            {which === "before" ? "Old panel serial: " : "New panel serial: "}
            <strong>{[...new Set(keys.map((k) => serials[k]?.serial).filter(Boolean))].join(", ")}</strong>
          </p>
        )}
        {keys.length === 0 ? (
          <p className={styles.missing}>No {label.toLowerCase()} photo</p>
        ) : (
          <ul className={keys.length > 1 ? styles.many : undefined}>
            {keys.map((k, n) => (
              <li key={k}>
                <img src={`${data.photo_base}/${k}`} alt={`Block ${r.block}, tracker ${r.tracker}, panel ${r.panel}, ${label.toLowerCase()} photo ${n + 1}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const lead = (() => {
    if (t.panels === 0) return `No panel ${WORK}s were recorded ${oneDay ? "on this day" : "in this period"}.`;
    const parts = [
      t.replaced ? plural(t.replaced, "panel was replaced", "panels were replaced") : "",
      t.fixed ? plural(t.fixed, "panel was repaired in place", "panels were repaired in place") : "",
    ].filter(Boolean);
    const evidence =
      t.with_both === t.panels
        ? `Every ${WORK} is documented with before and after photos (${plural(photos, "photo", "photos")} in total).`
        : `${t.with_both} of ${t.panels} ${WORK}s are documented with both before and after photos (${plural(photos, "photo", "photos")} in total).`;
    if (!F)
      return `${oneDay ? "On this day" : "In this period"}, ${plural(t.panels, "panel was", "panels were")} replaced on ${plural(t.trackers, "tracker", "trackers")} across ${plural(t.blocks_touched, "block", "blocks")}. ${evidence}`;
    return `${oneDay ? "On this day" : "In this period"}, ${plural(t.panels, "panel", "panels")} on ${plural(t.trackers, "tracker", "trackers")} across ${plural(t.blocks_touched, "block", "blocks")} received attention: ${parts.join(" and ")}. ${evidence}`;
  })();

  return (
    <div className={base.wrap}>
      <div className={base.bar} data-print="hide">
        <p>
          This is the {WORK} report as the client will receive it. Choose <strong>Save as PDF</strong> in the print window.
          {photos ? ` It includes ${plural(photos, "photo", "photos")}.` : ""}
        </p>
        <div className={styles.actions}>
          <button onClick={onBack} className={styles.secondary}>
            <FaArrowLeft aria-hidden="true" /> Back
          </button>
          <button onClick={save} disabled={preparing || t.panels === 0}>
            <FaPrint aria-hidden="true" /> {preparing ? "Preparing photos…" : "Save as PDF"}
          </button>
        </div>
      </div>

      <article className={base.doc} ref={doc} aria-label={`Client ${WORK} report`}>
        <header className={base.head}>
          <img src="/lumico-logo-print.png" alt="Lumico Electricals" className={base.logo} />
          <div>
            <h1>Solar panel {WORK} report</h1>
            <p className={base.date}>
              {siteLabel} solar farm · {period}
            </p>
          </div>
        </header>

        <dl className={base.meta}>
          <div>
            <dt>Site</dt>
            <dd>{siteLabel} solar farm</dd>
          </div>
          <div>
            <dt>{oneDay ? "Date of work" : "Period"}</dt>
            <dd>{period}</dd>
          </div>
          <div>
            <dt>Work carried out by</dt>
            <dd>{technicians.length ? technicians.join(", ") : "–"}</dd>
          </div>
          <div>
            <dt>Prepared by</dt>
            <dd>Lumico Electricals Pty Ltd</dd>
          </div>
        </dl>

        <section className={base.block} aria-label="Summary">
          <h2>Summary</h2>
          <ul className={base.figures}>
            {F ? (
              <>
                <li>
                  <strong>{t.panels}</strong>
                  <span>panels repaired</span>
                </li>
                <li>
                  <strong>{t.replaced}</strong>
                  <span>panels replaced</span>
                </li>
                <li>
                  <strong>{t.fixed}</strong>
                  <span>panels fixed in place</span>
                </li>
              </>
            ) : (
              <>
                <li>
                  <strong>{t.panels}</strong>
                  <span>panels replaced</span>
                </li>
                <li>
                  <strong>{t.trackers}</strong>
                  <span>{t.trackers === 1 ? "tracker" : "trackers"}</span>
                </li>
                <li>
                  <strong>{t.blocks_touched}</strong>
                  <span>{t.blocks_touched === 1 ? "block" : "blocks"}</span>
                </li>
              </>
            )}
            <li>
              <strong>{photos}</strong>
              <span>
                photos ({t.before_photos} before, {t.after_photos} after)
              </span>
            </li>
          </ul>
          <p className={base.lead}>{lead}</p>
          {!F && REPLACE_TARGET > 0 && (
            <ProgressRing
              earlier={Math.max(0, (data.panels_to_date ?? t.panels) - t.panels)}
              now={t.panels}
              target={REPLACE_TARGET}
              oneDay={oneDay}
            />
          )}
        </section>

        {data.blocks.length > 0 && (
          <section className={base.block}>
            <h2>Work by block</h2>
            <table className={base.table}>
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Trackers</th>
                  <th>{F ? "Replaced" : "Panels replaced"}</th>
                  {F && <th>Fixed</th>}
                  <th>Photos</th>
                </tr>
              </thead>
              <tbody>
                {data.blocks.map((b) => (
                  <tr key={b.block}>
                    <td>Block {b.block}</td>
                    <td>{b.trackers}</td>
                    <td>{F ? b.replaced : b.panels}</td>
                    {F && <td>{b.fixed}</td>}
                    <td>{b.photos}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>{t.trackers}</strong>
                  </td>
                  <td>
                    <strong>{F ? t.replaced : t.panels}</strong>
                  </td>
                  {F && (
                    <td>
                      <strong>{t.fixed}</strong>
                    </td>
                  )}
                  <td>
                    <strong>{photos}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {data.staff.length > 0 && (
          <section className={base.block}>
            <h2>Technicians</h2>
            <table className={base.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>{F ? "Panels" : "Panels replaced"}</th>
                  {F && <th>Replaced</th>}
                  {F && <th>Fixed</th>}
                  <th>First – last {WORK}</th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => (
                  <tr key={s.username}>
                    <td>{fullName(s.first_name, s.last_name, s.username)}</td>
                    <td>{s.panels}</td>
                    {F && <td>{s.replaced}</td>}
                    {F && <td>{s.fixed}</td>}
                    <td>
                      {dateTimeOf(s.first_at)} – {dateTimeOf(s.last_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {groups.length > 0 && (
          <section className={base.findings}>
            <h2>{F ? "Repair" : "Replacement"} register</h2>
            {groups.map((g) => (
              <div key={`${g.site}|${g.block}|${g.tracker}`} className={base.tracker}>
                <h3>
                  Block {g.block}, Tracker {g.tracker}
                  {multiSite && <span> · {cap(g.site)}</span>}
                </h3>
                {g.items.map((r) => (
                  <section key={r.id} className={base.finding}>
                    <div className={styles.panelHead}>
                      <strong>Panel {r.panel}</strong>
                      {F && (
                        <span className={`${styles.tag} ${r.action === "replace" ? styles.replace : styles.fix}`}>
                          {r.action === "replace" ? "Replaced" : "Fixed"}
                        </span>
                      )}
                    </div>
                    {r.notes && <p className={base.notes}>{r.notes}</p>}
                    <p className={base.by}>
                      Completed by {fullName(r.first_name, r.last_name, r.username)}, {dateTimeOf(r.repaired_at)}
                      {r.before_keys.length > 0 && r.after_keys.length > 0 && <span className={styles.check}> · Before and after photos ✓</span>}
                    </p>
                    <div className={styles.pair}>
                      {side(r, "before")}
                      {side(r, "after")}
                    </div>
                  </section>
                ))}
              </div>
            ))}
          </section>
        )}

        <section className={base.block}>
          <h2>Sign-off</h2>
          <div className={styles.signoff}>
            <div>
              <span>Lumico Electricals representative</span>
            </div>
            <div>
              <span>Client representative</span>
            </div>
            <div>
              <span>Date</span>
            </div>
          </div>
        </section>

        <footer className={base.foot}>
          Lumico Electricals Pty Ltd · Solar panel {WORK} report · {siteLabel} · {period}
        </footer>
      </article>
    </div>
  );
}
