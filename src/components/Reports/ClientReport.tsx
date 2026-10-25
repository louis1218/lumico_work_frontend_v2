import { useMemo, useRef, useState } from "react";
import { FaPrint } from "react-icons/fa";
import { dateTimeOf, fullName, longDate } from "../../lib/inspection";
import type { Daily } from "./types";
import styles from "./ClientReport.module.scss";

/** "1, 2, 3, 5" becomes "1–3, 5" */
function ranges(nums: number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j - i >= 2 ? `${nums[i]}–${nums[j]}` : nums.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return out.join(", ");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ClientReport({ daily }: { daily: Daily }) {
  const doc = useRef<HTMLElement>(null);
  const [preparing, setPreparing] = useState(false);

  const t = daily.totals;
  const siteLabel = daily.site ? cap(daily.site) : daily.sites.length ? daily.sites.map(cap).join(", ") : "All sites";
  const inspectors = daily.staff.map((s) => fullName(s.first_name, s.last_name, s.username));
  const pct = t.trackers_total ? Math.round((t.trackers_checked / t.trackers_total) * 100) : 0;
  const multiSite = daily.sites.length > 1;

  const activeBlocks = daily.blocks.filter((b) => b.trackers_checked > 0);
  const maxDefect = Math.max(1, ...daily.defect_counts.map((d) => d.panels));

  // Findings grouped as site > block > tracker > panels
  const findings = useMemo(() => {
    const map = new Map<string, { site: string; block: number; tracker: number; items: Daily["issues"] }>();
    for (const i of daily.issues) {
      const k = `${i.site}|${i.block}|${i.tracker}`;
      const g = map.get(k) ?? { site: i.site, block: i.block, tracker: i.tracker, items: [] };
      g.items.push(i);
      map.set(k, g);
    }
    return [...map.values()];
  }, [daily.issues]);

  // Trackers inspected with nothing wrong, per block
  const clean = useMemo(() => {
    const m = new Map<string, { site: string; block: number; list: number[] }>();
    for (const x of daily.trackers) {
      if (x.broken_panels > 0) continue;
      const k = `${x.site}|${x.block}`;
      const g = m.get(k) ?? { site: x.site, block: x.block, list: [] };
      g.list.push(x.tracker);
      m.set(k, g);
    }
    return [...m.values()];
  }, [daily.trackers]);

  const save = async () => {
    setPreparing(true);
    // Wait for every photo so none is missing from the PDF
    const imgs = Array.from(doc.current?.querySelectorAll("img") ?? []);
    await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
    setPreparing(false);
    window.print();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.bar} data-print="hide">
        <p>
          This is the report as the client will receive it. Choose <strong>Save as PDF</strong> in the print window.
          {daily.issues.some((i) => i.photo_keys?.length) ? ` It includes ${daily.issues.reduce((n, i) => n + (i.photo_keys?.length ?? 0), 0)} photos.` : ""}
        </p>
        <button onClick={save} disabled={preparing}>
          <FaPrint aria-hidden="true" /> {preparing ? "Preparing photos…" : "Save as PDF"}
        </button>
      </div>

      <article className={styles.doc} ref={doc} aria-label="Client inspection report">
        <header className={styles.head}>
          <img src="/lumico-logo-print.png" alt="Lumico Electricals" className={styles.logo} />
          <div>
            <h1>Solar farm inspection report</h1>
            <p className={styles.date}>{longDate(daily.date)}</p>
          </div>
        </header>

        <dl className={styles.meta}>
          <div>
            <dt>Site</dt>
            <dd>{siteLabel}</dd>
          </div>
          <div>
            <dt>Inspection date</dt>
            <dd>{longDate(daily.date)}</dd>
          </div>
          <div>
            <dt>Inspected by</dt>
            <dd>{inspectors.length ? inspectors.join(", ") : "–"}</dd>
          </div>
          <div>
            <dt>Prepared by</dt>
            <dd>Lumico Electricals Pty Ltd</dd>
          </div>
        </dl>

        <section className={styles.block} aria-label="Summary">
          <h2>Summary</h2>
          <ul className={styles.figures}>
            <li>
              <strong>{t.trackers_checked}</strong>
              <span>trackers inspected ({pct}% of {t.trackers_total})</span>
            </li>
            <li>
              <strong>{t.blocks_touched}</strong>
              <span>blocks visited</span>
            </li>
            <li>
              <strong>{t.trackers_with_issues}</strong>
              <span>trackers with broken panels</span>
            </li>
            <li>
              <strong>{t.broken_panels}</strong>
              <span>broken panels recorded</span>
            </li>
          </ul>
          <p className={styles.lead}>
            {t.broken_panels === 0
              ? `${t.trackers_checked} trackers were inspected and no broken panels were found.`
              : `${t.trackers_checked} trackers were inspected. ${t.broken_panels} broken ${t.broken_panels === 1 ? "panel was" : "panels were"} found on ${t.trackers_with_issues} ${t.trackers_with_issues === 1 ? "tracker" : "trackers"}. Each is listed below with its photos.`}
          </p>
        </section>

        {activeBlocks.length > 0 && (
          <section className={styles.block}>
            <h2>Progress by block</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Trackers inspected</th>
                  <th>Trackers with broken panels</th>
                  <th>Broken panels</th>
                </tr>
              </thead>
              <tbody>
                {activeBlocks.map((b) => (
                  <tr key={b.block}>
                    <td>Block {b.block}</td>
                    <td>
                      {b.trackers_checked} of {b.trackers_total}
                    </td>
                    <td>{b.issues}</td>
                    <td>{b.broken_panels}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {daily.defect_counts.length > 0 && (
          <section className={styles.block}>
            <h2>Types of damage</h2>
            <ul className={styles.defects}>
              {daily.defect_counts.map((d) => (
                <li key={d.defect}>
                  <span>{d.defect}</span>
                  <span className={styles.meter} role="img" aria-label={`${d.panels} panels`}>
                    <span style={{ width: `${(d.panels / maxDefect) * 100}%` }} />
                  </span>
                  <strong>{d.panels}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        {findings.length > 0 && (
          <section className={styles.findings}>
            <h2>Broken panels</h2>
            {findings.map((g) => (
              <div key={`${g.site}|${g.block}|${g.tracker}`} className={styles.tracker}>
                <h3>
                  Block {g.block}, Tracker {g.tracker}
                  {multiSite && <span> · {cap(g.site)}</span>}
                </h3>
                {g.items.map((i) => (
                  <section key={i.id} className={styles.finding}>
                    <div className={styles.findingHead}>
                      <strong>{i.panel ? `Panel ${i.panel}` : `${i.broken_panels} broken panels (panel numbers not recorded)`}</strong>
                      <span>{i.defects && i.defects.length ? i.defects.join(", ") : "Damage type not specified"}</span>
                    </div>
                    {i.notes && <p className={styles.notes}>{i.notes}</p>}
                    <p className={styles.by}>
                      Recorded by {fullName(i.first_name, i.last_name, i.username)}, {dateTimeOf(i.inspected_at)}
                    </p>
                    {i.photo_keys && i.photo_keys.length > 0 && (
                      <ul className={styles.photos}>
                        {i.photo_keys.map((k, n) => (
                          <li key={k}>
                            <img src={`${daily.photo_base}/${k}`} alt={`Block ${i.block}, tracker ${i.tracker}${i.panel ? `, panel ${i.panel}` : ""}, photo ${n + 1}`} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            ))}
          </section>
        )}

        {clean.length > 0 && (
          <section className={styles.block}>
            <h2>Trackers inspected with no broken panels</h2>
            <ul className={styles.clean}>
              {clean.map((c) => (
                <li key={`${c.site}|${c.block}`}>
                  <strong>
                    Block {c.block}
                    {multiSite ? ` (${cap(c.site)})` : ""}
                  </strong>
                  <span>{ranges(c.list.sort((a, b) => a - b))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className={styles.foot}>
          Lumico Electricals Pty Ltd · Solar farm inspection report · {siteLabel} · {longDate(daily.date)}
        </footer>
      </article>
    </div>
  );
}
