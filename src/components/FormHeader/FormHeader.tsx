import { useNavigate } from 'react-router-dom'
import { FaSyncAlt } from 'react-icons/fa'
import styles from './FormHeader.module.scss'
import type { Session } from '../../App'

interface RealignmentMeta {
  isSaved: boolean
  isSubmitted: boolean
}

interface FormData {
  block: string
  trackerId: string
  submitted?: boolean
}

interface FormHeaderProps {
  session: Session
  onBackToMenu?: () => void
  onLogout?: () => void
  form?: FormData
  currentStep?: string
  currentTask?: { isSaved?: boolean; isSubmitted?: boolean } | null
  stepIndex?: number
  isFetching?: boolean
  fetchSessionData?: () => void
  realignmentMeta?: RealignmentMeta
}

type BadgeVariant = 'success' | 'warning' | 'dim'

function StatusBadge({ variant, label }: { variant: BadgeVariant; label: string }) {
  return <span className={`${styles.badge} ${styles[variant]}`}>{label}</span>
}

export default function FormHeader({
  session,
  onBackToMenu,
  form,
  currentStep,
  currentTask,
  stepIndex = 0,
  isFetching = false,
  fetchSessionData,
  realignmentMeta,
}: FormHeaderProps) {
  const navigate = useNavigate()
  if (!session) return null

  const isRealignmentStep = currentStep === 'realignmentCheck'
  const showTrackerInfo = form?.block && form?.trackerId && stepIndex > 0

  const getStatus = (): { variant: BadgeVariant; label: string } => {
    if (isRealignmentStep) {
      if (realignmentMeta?.isSubmitted) return { variant: 'success', label: 'SUBMITTED' }
      if (realignmentMeta?.isSaved)     return { variant: 'warning', label: 'SAVED' }
      return { variant: 'dim', label: 'NOT SAVED' }
    }
    if (currentStep === 'final') {
      if (form?.submitted) return { variant: 'success', label: 'SUBMITTED' }
      return { variant: 'warning', label: 'IN PROGRESS' }
    }
    if (currentTask?.isSubmitted) return { variant: 'success', label: 'SUBMITTED' }
    if (currentTask?.isSaved)     return { variant: 'warning', label: 'SAVED' }
    return { variant: 'dim', label: 'NOT SAVED' }
  }

  return (
    <header className={styles.header}>
      <button
        className={styles.backBtn}
        onClick={() => { onBackToMenu?.(); navigate('/menu') }}
      >
        ← Menu
      </button>

      {showTrackerInfo && (
        <div className={styles.trackerInfo}>
          <div className={styles.trackerRow}>
            <span className={styles.trackerText}>{form!.block}</span>
            <span className={styles.divider}>·</span>
            <span className={styles.trackerText}>Tracker {form!.trackerId}</span>
          </div>
          <div className={styles.statusRow}>
            {fetchSessionData && (
              <button
                className={styles.refreshBtn}
                onClick={fetchSessionData}
                disabled={isFetching}
                title="Refresh"
              >
                <FaSyncAlt className={isFetching ? styles.spinning : ''} />
              </button>
            )}
            <StatusBadge {...getStatus()} />
          </div>
        </div>
      )}
    </header>
  )
}