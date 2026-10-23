import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./TimeSheet.module.scss";
import Dropdown from "../Dropdown/Dropdown";
import type { Session, User } from "../../App";
import { api, apiFetch } from "../../api";
import { localDate, longDate, shiftDay } from "../../lib/inspection";

interface TimeEntry {
  username: string;
  site: string;
  sign_in: string;
  sign_out?: string;
}

interface TimeSheetProps {
  session: Session;
  allUsers: User[];
  header: React.ReactNode;
}

const ADMIN_USERS = ["jasonzhou", "louisli", "francisdiao", "zhichangzhou"];
const HIDDEN_USERS = ["louisli", "francisdiao", "zhichangzhou", "bobportman"];
const HIDDEN_FROM_TABLE = ["louisli", "francisdiao", "zhichangzhou"];

const clock = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "–";

function hoursWorked(e: TimeEntry): string {
  if (!e.sign_out) return "–";
  const mins = Math.max(0, Math.round((new Date(e.sign_out).getTime() - new Date(e.sign_in).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

const friendly: Record<string, string> = {
  "User already signed in today": "is already signed in today.",
  "User already signed out today": "is already signed out today.",
  "User has not signed in today": "has not signed in today.",
};

async function loadLog(site: string, day: string, username?: string): Promise<TimeEntry[]> {
  const body: Record<string, string> = { site, work_date: day };
  if (username) body.username = username;
  const res = await apiFetch(api("/timesheet/query"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function TimeSheet({ session, allUsers }: TimeSheetProps) {
  const today = localDate();
  const [timeData, setTimeData] = useState<TimeEntry[]>([]);
  const [todayData, setTodayData] = useState<TimeEntry[]>([]);
  const [selectedUser, setSelectedUser] = useState("ALL");
  const [selectedDate, setSelectedDate] = useState(today);
  const [busy, setBusy] = useState<string | null>(null); // "username|type"
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const isAdmin = ADMIN_USERS.includes(session.username);

  const nameOf = useCallback(
    (username: string) => {
      const u = allUsers.find((x) => x.username === username);
      return u?.first_name && u?.last_name ? `${u.first_name} ${u.last_name}` : (u?.first_name ?? username);
    },
    [allUsers],
  );

  const refresh = useCallback(async () => {
    const [list, now] = await Promise.all([
      loadLog(session.site, selectedDate, selectedUser === "ALL" ? undefined : selectedUser),
      isAdmin ? loadLog(session.site, today) : Promise.resolve([] as TimeEntry[]),
    ]);
    setTimeData(list);
    setTodayData(now);
  }, [session.site, selectedDate, selectedUser, isAdmin, today]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  const handleSign = async (username: string, type: "sign_in" | "sign_out") => {
    setBusy(`${username}|${type}`);
    const now = new Date();
    try {
      const res = await apiFetch(api("/timesheet"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          site: session.site,
          type,
          timestamp: now.toISOString(),
          work_date: localDate(now),
        }),
      });
      if (res.ok) {
        setMessage({ tone: "ok", text: `${nameOf(username)} signed ${type === "sign_in" ? "in" : "out"}.` });
        await refresh();
      } else {
        const err = await res.json().catch(() => null);
        const msg: string = err?.error || "Unknown error";
        setMessage({ tone: "bad", text: friendly[msg] ? `${nameOf(username)} ${friendly[msg]}` : `Could not save: ${msg}` });
      }
    } catch {
      setMessage({ tone: "bad", text: "No connection. Check your signal and try again." });
    } finally {
      setBusy(null);
    }
  };

  const visibleUsers = allUsers.filter((u) => !HIDDEN_USERS.includes(u.username?.toLowerCase() ?? ""));
  const todayBy = useMemo(() => new Map(todayData.map((e) => [e.username, e])), [todayData]);
  const signedInCount = visibleUsers.filter((u) => todayBy.has(u.username)).length;

  const rows = timeData
    .filter((e) => !HIDDEN_FROM_TABLE.includes(e.username?.toLowerCase() ?? ""))
    .sort((a, b) => new Date(b.sign_in).getTime() - new Date(a.sign_in).getTime());

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <h1 className={styles.title}>Timesheet</h1>
        <p className={styles.sub}>
          <span className={styles.site}>{session.site}</span> solar farm
        </p>
      </header>

      <div className={styles.live} role="status" aria-live="polite">
        {message && <p className={`${styles.toast} ${message.tone === "bad" ? styles.toastBad : ""}`}>{message.text}</p>}
      </div>

      {isAdmin && (
        <details className={styles.adminPanel}>
          <summary className={styles.adminSummary}>
            <span>Sign people in or out</span>
            <em>
              {signedInCount} of {visibleUsers.length} in today
            </em>
          </summary>
          <ul className={styles.adminList}>
            {visibleUsers.map((u) => {
              const e = todayBy.get(u.username);
              const state = !e ? "none" : e.sign_out ? "out" : "in";
              return (
                <li key={u.username} className={styles.adminRow}>
                  <div className={styles.adminWho}>
                    <strong>{u.first_name || u.username}</strong>
                    <span className={styles.status} data-state={state}>
                      {state === "none" && "Not signed in"}
                      {state === "in" && `In since ${clock(e?.sign_in)}`}
                      {state === "out" && `Out at ${clock(e?.sign_out)}`}
                    </span>
                  </div>
                  <div className={styles.adminActions}>
                    <button
                      className={`${styles.signBtn} ${styles.signIn}`}
                      onClick={() => handleSign(u.username, "sign_in")}
                      disabled={busy !== null || state !== "none"}
                    >
                      {busy === `${u.username}|sign_in` ? <span className={styles.btnSpinner} /> : "Sign in"}
                    </button>
                    <button
                      className={`${styles.signBtn} ${styles.signOut}`}
                      onClick={() => handleSign(u.username, "sign_out")}
                      disabled={busy !== null || state !== "in"}
                    >
                      {busy === `${u.username}|sign_out` ? <span className={styles.btnSpinner} /> : "Sign out"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <section className={styles.filters} aria-label="Filter the log">
        <Dropdown
          label="Person"
          searchable
          searchPlaceholder="Find a person"
          value={selectedUser}
          placeholder="Everyone"
          options={[
            { value: "ALL", label: "Everyone" },
            ...allUsers.map((u) => ({
              value: u.username,
              label: u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username,
            })),
          ]}
          onChange={setSelectedUser}
        />
        <div className={styles.dateField}>
          <span className={styles.fieldLabel}>Day</span>
          <div className={styles.dateNav}>
            <button aria-label="Previous day" onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}>
              ‹
            </button>
            <input
              type="date"
              value={selectedDate}
              max={today}
              aria-label="Date"
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            />
            <button aria-label="Next day" disabled={selectedDate >= today} onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}>
              ›
            </button>
          </div>
        </div>
      </section>

      <p className={styles.dayLine}>
        {longDate(selectedDate)}
        <span>
          {rows.length} {rows.length === 1 ? "person" : "people"} signed in
        </span>
      </p>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <strong>No sign-ins on this day</strong>
          <span>Pick another day or person.</span>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Site</th>
                  <th>Sign in</th>
                  <th>Sign out</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
                  <tr key={i}>
                    <td>{nameOf(e.username)}</td>
                    <td className={styles.capitalize}>{e.site}</td>
                    <td>{clock(e.sign_in)}</td>
                    <td>{e.sign_out ? clock(e.sign_out) : <span className={styles.still}>Still in</span>}</td>
                    <td>{hoursWorked(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={styles.cardList}>
            {rows.map((e, i) => (
              <li key={i} className={styles.card}>
                <div className={styles.cardHead}>
                  <strong>{nameOf(e.username)}</strong>
                  <span>{hoursWorked(e) === "–" ? "Still in" : hoursWorked(e)}</span>
                </div>
                <div className={styles.cardTimes}>
                  <div>
                    <span>Sign in</span>
                    <strong>{clock(e.sign_in)}</strong>
                  </div>
                  <div>
                    <span>Sign out</span>
                    <strong>{clock(e.sign_out)}</strong>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
