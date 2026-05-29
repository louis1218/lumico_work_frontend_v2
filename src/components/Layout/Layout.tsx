import { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { FaTasks, FaClipboardList, FaBarcode, FaChartLine, FaClock, FaBug, FaLock, FaSignOutAlt } from 'react-icons/fa'
import styles from './Layout.module.scss'
import type { Session } from '../../App'

interface NavItem {
  label: string
  path: string
  icon: ReactNode
  section: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'PM Tasks',       path: '/multisteptaskform', icon: <FaTasks />,         section: 'Task Logs' },
  { label: 'Realignment',    path: '/realignmentform',   icon: <FaClipboardList />, section: 'Task Logs' },
  { label: 'Barcode Log',    path: '/scan',              icon: <FaBarcode />,       section: 'Task Logs' },
  { label: 'Work Progress',  path: '/previous-work',     icon: <FaChartLine />,     section: 'Project' },
  { label: 'Timesheet',      path: '/timesheet',         icon: <FaClock />,         section: 'Project' },
  { label: 'Report',         path: '/report',            icon: <FaBug />,           section: 'Project' },
  { label: 'Reset Password', path: '/reset-password',    icon: <FaLock />,          section: 'Account' },
]

const SECTIONS = ['Task Logs', 'Project', 'Account']

// Bottom nav shows most-used 5 items
const BOTTOM_NAV = NAV_ITEMS.slice(0, 5)

interface LayoutProps {
  session: Session
  children: ReactNode
  onLogout: () => void
  logoutLoading?: boolean
}

export default function Layout({ session, children, onLogout, logoutLoading }: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const initials = session.name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className={styles.shell}>
      {/* Sidebar — desktop only */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <img src="/lumico-smalllogo.jpg" alt="Lumico" className={styles.logoImg} />
          <div>
            <div className={styles.logoName}>Lumico</div>
            <div className={styles.logoSub}>Staff Portal</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {SECTIONS.map(section => (
            <div key={section} className={styles.navSection}>
              <div className={styles.navLabel}>{section}</div>
              {NAV_ITEMS.filter(i => i.section === section).map(item => (
                <button
                  key={item.path}
                  className={`${styles.navItem} ${location.pathname === item.path ? styles.active : ''}`}
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
              <div className={styles.userName}>{session.name}</div>
              <div className={styles.userSite}>{session.site}</div>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={onLogout} disabled={logoutLoading}>
            {logoutLoading
              ? <span className={styles.spinner} />
              : <FaSignOutAlt /> 
            }
            {logoutLoading ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        {children}
      </main>

      {/* Bottom tab bar — mobile only */}
      <nav className={styles.bottomNav}>
        {BOTTOM_NAV.map(item => (
          <button
            key={item.path}
            className={`${styles.tabItem} ${location.pathname === item.path ? styles.tabActive : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className={styles.tabIcon}>{item.icon}</span>
            <span className={styles.tabLabel}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}