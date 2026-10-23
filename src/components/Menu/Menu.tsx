import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaChartBar, FaChevronRight, FaClock, FaSignOutAlt, FaSolarPanel } from "react-icons/fa";
import styles from "./Menu.module.scss";
import type { Session } from "../../App";
import { apiJson } from "../../api";
import { localDate, longDate } from "../../lib/inspection";

interface MenuProps {
  session: Session;
  handleLogout: () => void;
  logoutLoading: boolean;
  setLogoutLoading: (v: boolean) => void;
  setShowResetForm: (v: boolean) => void;
  showResetForm?: boolean;
}

interface Mine {
  trackers_checked: number;
  issues: number;
  broken_panels: number;
}

export default function Menu({ session, handleLogout, logoutLoading, setLogoutLoading }: MenuProps) {
  const navigate = useNavigate();
  const [mine, setMine] = useState<Mine | null>(null);
  const today = localDate();
  const first = session.name.split(" ")[0] || session.name;

  useEffect(() => {
    apiJson<Mine>(`/inspections/mine?${new URLSearchParams({ site: session.site.toLowerCase(), work_date: today })}`)
      .then(setMine)
      .catch(() => {});
  }, [session.site, today]);

  const logout = async () => {
    setLogoutLoading(true);
    await handleLogout();
    setLogoutLoading(false);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.welcome}>
          Hello, <span className={styles.name}>{first}</span>
        </h1>
        <p className={styles.site}>
          {session.site} solar farm, {longDate(today)}
        </p>
      </header>

      <button className={styles.cta} onClick={() => navigate("/inspect")}>
        <FaSolarPanel aria-hidden="true" className={styles.ctaIcon} />
        <span>
          <strong>Inspect trackers</strong>
          <em>Pick a block and tracker, record broken panels, add photos</em>
        </span>
        <FaChevronRight aria-hidden="true" />
      </button>

      <section className={styles.today} aria-label="Your day so far">
        <div>
          <strong>{mine?.trackers_checked ?? "–"}</strong>
          <span>trackers checked</span>
        </div>
        <div>
          <strong>{mine?.issues ?? "–"}</strong>
          <span>with issues</span>
        </div>
        <div>
          <strong>{mine?.broken_panels ?? "–"}</strong>
          <span>broken panels</span>
        </div>
      </section>

      <nav className={styles.links} aria-label="Other tools">
        <button onClick={() => navigate("/timesheet")}>
          <FaClock aria-hidden="true" /> Timesheet <FaChevronRight aria-hidden="true" />
        </button>
        {session.role === "admin" && (
          <button onClick={() => navigate("/reports")}>
            <FaChartBar aria-hidden="true" /> Reports and staff progress <FaChevronRight aria-hidden="true" />
          </button>
        )}
      </nav>

      <button className={styles.logoutBtn} onClick={logout} disabled={logoutLoading}>
        {logoutLoading ? <span className={styles.spinner} /> : <FaSignOutAlt aria-hidden="true" />}
        {logoutLoading ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}
