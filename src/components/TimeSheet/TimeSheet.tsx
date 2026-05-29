import { useEffect, useState } from "react";
import styles from "./TimeSheet.module.scss";
import type { Session, User } from "../../App";

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

export default function TimeSheet({
  session,
  allUsers,
  header,
}: TimeSheetProps) {
  const [timeData, setTimeData] = useState<TimeEntry[]>([]);
  const [selectedUser, setSelectedUser] = useState("ALL");
  const [signingUser, setSigningUser] = useState<string | null>(null);
  const [signingType, setSigningType] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );

  const fetchLog = async () => {
    const body: Record<string, string> = {
      site: session.site,
      work_date: selectedDate,
    };
    if (selectedUser !== "ALL") body.username = selectedUser;

    const res = await fetch(
      "https://kgwoqepe0f.execute-api.ap-southeast-2.amazonaws.com/default/getTimeSheet",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      const data = await res.json();
      setTimeData(Array.isArray(data) ? data : []);
    } else {
      setTimeData([]);
    }
  };

  useEffect(() => {
    fetchLog();
  }, [selectedUser, session.site, selectedDate]);

  const handleSign = async (username: string, type: string) => {
    setSigningUser(username);
    setSigningType(type);
    const now = new Date();
    try {
      const res = await fetch(
        "https://4r2rqwsgk7.execute-api.ap-southeast-2.amazonaws.com/default/logTimesheet",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            site: session.site,
            type,
            timestamp: now.toISOString(),
            work_date: now.toLocaleDateString("en-CA"),
          }),
        },
      );
      if (res.ok) {
        await fetchLog();
      } else {
        const error = await res.json();
        const msg = error?.error || "Unknown error";
        if (msg === "User already signed in today")
          alert(`${username} already signed in today.`);
        else if (msg === "User already signed out today")
          alert(`${username} already signed out today.`);
        else if (msg === "User has not signed in today")
          alert(`${username} has not signed in today.`);
        else alert(`Failed: ${msg}`);
      }
    } catch {
      alert("Network error.");
    } finally {
      setSigningUser(null);
      setSigningType(null);
    }
  };

  const isAdmin = ADMIN_USERS.includes(session.username);
  const visibleUsers = allUsers.filter(
    (u) => !HIDDEN_USERS.includes(u.username?.toLowerCase() ?? ""),
  );
  const filteredData = timeData
    .filter((e) => !HIDDEN_FROM_TABLE.includes(e.username?.toLowerCase() ?? ""))
    .sort(
      (a, b) => new Date(b.sign_in).getTime() - new Date(a.sign_in).getTime(),
    );

  const resolveDisplayName = (username: string) => {
    const user = allUsers.find((u) => u.username === username);
    return user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : username;
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerWrap}>{header}</div>

      {/* Admin sign-in/out panel */}
      {isAdmin && (
        <details className={styles.adminPanel}>
          <summary className={styles.adminSummary}>
            Admin Sign In/Out Panel
          </summary>
          <div className={styles.adminGrid}>
            {visibleUsers.map((user) => (
              <div key={user.username} className={styles.adminCard}>
                <strong className={styles.adminName}>
                  {user.first_name || user.username}
                </strong>
                <div className={styles.adminActions}>
                  <button
                    className={`${styles.signBtn} ${styles.signIn}`}
                    onClick={() => handleSign(user.username, "sign_in")}
                    disabled={
                      signingUser === user.username && signingType === "sign_in"
                    }
                  >
                    {signingUser === user.username &&
                    signingType === "sign_in" ? (
                      <span className={styles.btnSpinner} />
                    ) : (
                      "Sign In"
                    )}
                  </button>
                  <button
                    className={`${styles.signBtn} ${styles.signOut}`}
                    onClick={() => handleSign(user.username, "sign_out")}
                    disabled={
                      signingUser === user.username &&
                      signingType === "sign_out"
                    }
                  >
                    {signingUser === user.username &&
                    signingType === "sign_out" ? (
                      <span className={styles.btnSpinner} />
                    ) : (
                      "Sign Out"
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>User</label>
          <select
            className={styles.filterSelect}
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="ALL">All Users</option>
            {allUsers.map((u) => (
              <option key={u.username} value={u.username}>
                {u.first_name && u.last_name
                  ? `${u.first_name} ${u.last_name}`
                  : u.username}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Date</label>
          <input
            className={styles.filterInput}
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className={styles.empty}>No records found for this date.</div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Site</th>
                  <th>Sign In</th>
                  <th>Sign Out</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((entry, idx) => (
                  <tr key={idx}>
                    <td>{new Date(entry.sign_in).toLocaleDateString()}</td>
                    <td>{resolveDisplayName(entry.username)}</td>
                    <td className={styles.capitalize}>{entry.site}</td>
                    <td>
                      {entry.sign_in
                        ? new Date(entry.sign_in).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td>
                      {entry.sign_out
                        ? new Date(entry.sign_out).toLocaleTimeString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card list */}
          <div className={styles.cardList}>
            {filteredData.map((entry, idx) => (
              <div key={idx} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardName}>
                    {resolveDisplayName(entry.username)}
                  </span>
                  <span className={styles.cardSite}>{entry.site}</span>
                </div>
                <div className={styles.cardTimes}>
                  <div className={styles.cardTimeBlock}>
                    <span className={styles.cardTimeLabel}>Sign In</span>
                    <span className={styles.cardTimeValue}>
                      {entry.sign_in
                        ? new Date(entry.sign_in).toLocaleTimeString()
                        : "—"}
                    </span>
                  </div>
                  <div className={styles.cardTimeBlock}>
                    <span className={styles.cardTimeLabel}>Sign Out</span>
                    <span className={styles.cardTimeValue}>
                      {entry.sign_out
                        ? new Date(entry.sign_out).toLocaleTimeString()
                        : "—"}
                    </span>
                  </div>
                </div>
                <span className={styles.cardDate}>
                  {new Date(entry.sign_in).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
