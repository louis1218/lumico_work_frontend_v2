import { type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaChartBar, FaClock, FaHome, FaSignOutAlt, FaSolarPanel } from "react-icons/fa";
import styles from "./Layout.module.scss";
import type { Session } from "../../App";

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  section: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", path: "/menu", icon: <FaHome />, section: "Field" },
  { label: "Inspect", path: "/inspect", icon: <FaSolarPanel />, section: "Field" },
  { label: "Timesheet", path: "/timesheet", icon: <FaClock />, section: "Field" },
  { label: "Reports", path: "/reports", icon: <FaChartBar />, section: "Admin", adminOnly: true },
];

interface LayoutProps {
  session: Session;
  children: ReactNode;
  onLogout: () => void;
  logoutLoading?: boolean;
}

export default function Layout({
  session,
  children,
  onLogout,
  logoutLoading,
}: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const items = NAV_ITEMS.filter((i) => !i.adminOnly || session.role === "admin");
  const sections = [...new Set(items.map((i) => i.section))];

  const initials = session?.name
    ? session.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  return (
    <div className={styles.shell}>
      {/* Sidebar — desktop only */}
      <aside className={styles.sidebar} data-print="hide">
        <div className={styles.sidebarLogo}>
          <img
            src="/lumico-logo-clear.png"
            alt="Lumico"
            className={styles.logoImg}
          />

          <div>
            {/* <div className={styles.logoName}>Lumico</div> */}
            <div className={styles.logoSub}>Staff Portal</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {sections.map((section) => (
            <div key={section} className={styles.navSection}>
              <div className={styles.navLabel}>{section}</div>
              {items.filter((i) => i.section === section).map((item) => (
                <button
                  key={item.path}
                  className={`${styles.navItem} ${location.pathname.startsWith(item.path) ? styles.active : ""}`}
                  onClick={() => navigate(item.path)}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.userChip}>
            <div className={styles.avatar}>{initials}</div>
            <div>
              <div className={styles.userName}>{session?.name}</div>
              <div className={styles.userSite}>{session?.site}</div>
            </div>
          </div>
          <button
            className={styles.logoutBtn}
            onClick={onLogout}
            disabled={logoutLoading}
          >
            {logoutLoading ? (
              <span className={styles.spinner} />
            ) : (
              <FaSignOutAlt />
            )}
            {logoutLoading ? "Logging out..." : "Logout"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main} data-print="main">{children}</main>

      {/* Bottom tab bar — mobile only */}
      <nav className={styles.bottomNav} data-print="hide" aria-label="Main">
        {items.map((item) => (
          <button
            key={item.path}
            className={`${styles.tabItem} ${location.pathname.startsWith(item.path) ? styles.tabActive : ""}`}
            onClick={() => navigate(item.path)}
          >
            <span className={styles.tabIcon}>{item.icon}</span>
            <span className={styles.tabLabel}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
