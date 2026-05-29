import { useNavigate } from 'react-router-dom'
import {
  FaTasks, FaClipboardList,
  FaChartLine, FaClock, FaBug, FaSignOutAlt
} from 'react-icons/fa'
import styles from './Menu.module.scss'
import type { Session } from '../../App'
import { FaWrench } from 'react-icons/fa'

interface MenuProps {
  session: Session
  handleLogout: () => void
  logoutLoading: boolean
  setLogoutLoading: (v: boolean) => void
  setShowResetForm: (v: boolean) => void
  showResetForm?: boolean
}

export default function Menu({
  session,
  handleLogout,
  logoutLoading,
  setLogoutLoading,
  setShowResetForm,
}: MenuProps) {
  const navigate = useNavigate()

  const handleLogoutClick = async () => {
    setLogoutLoading(true)
    await handleLogout()
    setLogoutLoading(false)
  }

  const loginTime = session.login_time
    ? new Date(session.login_time).toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : null

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <img src="/lumico-smalllogo.jpg" alt="Lumico" className={styles.logo} />
        <div className={styles.headerText}>
          <h2 className={styles.welcome}>
            Welcome, <span className={styles.name}>{session.name}</span>
          </h2>
          <p className={styles.loginTime}>
            {loginTime ? <>Logged in at <strong>{loginTime}</strong></> : 'Logged in'}
          </p>
          <p className={styles.site}>{session.site} Solar Farm</p>
        </div>
      </div>

      {/* ── Task Logs ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Task Logs</h3>
        <div className={styles.grid}>
          <button className={styles.card} onClick={() => navigate('/multisteptaskform')}>
            <FaTasks className={`${styles.icon} ${styles.amber}`} />
            <span>PM Tasks</span>
          </button>
          <button className={styles.card} onClick={() => navigate('/realignmentform')}>
            <FaClipboardList className={`${styles.icon} ${styles.blue}`} />
            <span>Realignment</span>
          </button>

          <button className={styles.card} onClick={() => navigate('/torque-job')}>
            <FaWrench className={`${styles.icon} ${styles.amber}`} />
            <span>Torque Job</span>
        </button>
        </div>
      </section>

      {/* ── Project Tools ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Project Tools</h3>
        <div className={styles.grid}>
          <button className={styles.card} onClick={() => navigate('/previous-work')}>
            <FaChartLine className={`${styles.icon} ${styles.purple}`} />
            <span>Work Progress</span>
          </button>
          <button className={styles.card} onClick={() => navigate('/timesheet')}>
            <FaClock className={`${styles.icon} ${styles.blue}`} />
            <span>Timesheet</span>
          </button>
          <button className={styles.card} onClick={() => navigate('/report')}>
            <FaBug className={`${styles.icon} ${styles.red}`} />
            <span>Report</span>
          </button>
        </div>
      </section>

      {/* ── Logout ── */}
      <button
        className={styles.logoutBtn}
        onClick={handleLogoutClick}
        disabled={logoutLoading}
      >
        {logoutLoading
          ? <span className={styles.spinner} />
          : <FaSignOutAlt />
        }
        {logoutLoading ? 'Logging out...' : 'Logout'}
      </button>
    </div>
  )
}