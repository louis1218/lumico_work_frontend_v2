import { useState } from 'react'
import styles from './PreviousWork.module.scss'
import type { Session } from '../../App'

interface TaskEntry {
  task_name: string
  checked: boolean
  isComplete: boolean
  needsRepair: boolean
  created_by: string
  updated_at: string
  notes?: string
  before_photos?: string[]
  after_photos?: string[]
}

interface LogEntry {
  block: string
  tracker_id: string
  last_updated: string
  site: string
  notes?: string
  tasks?: TaskEntry[]
  before_barcodes?: { barcode: string }[]
  after_barcodes?: { barcode: string }[]
  image_files?: { before_image?: string[]; after_image?: string[] }
}

interface PreviousWorkProps {
  session: Session
  header: React.ReactNode
  username?: string
  isAdmin?: boolean
  allUsers?: unknown[]
}

type TaskType = 'upload' | 'realignment'

const TEAM_GOALS: Record<TaskType, number> = { upload: 1200, realignment: 50 }

export default function PreviousWork({ session, header }: PreviousWorkProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('upload')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [selectedBlock, setSelectedBlock] = useState('')
  const [selectedTrackerId, setSelectedTrackerId] = useState('')
  const [useDateOnly, setUseDateOnly] = useState(true)
  const [teamTotalTasks, setTeamTotalTasks] = useState(0)
  const [searchedTaskType, setSearchedTaskType] = useState<TaskType>('upload')
  const [searchedGoal, setSearchedGoal] = useState(1200)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggleExpand = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  const handleSearch = async () => {
    if (!useDateOnly && !selectedBlock && !selectedTrackerId) {
      alert('Please enter a Block and/or Tracker ID.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({
        taskType,
        site: session.site.toLowerCase(),
        ...(useDateOnly && selectedDate ? { date: selectedDate } : {}),
        ...(!useDateOnly && selectedBlock ? { block: selectedBlock } : {}),
        ...(!useDateOnly && selectedTrackerId ? { tracker_id: selectedTrackerId } : {}),
      })
      const res = await fetch(
        `https://yeyhsz0wrg.execute-api.ap-southeast-2.amazonaws.com/default/getUserWorkLog?${query}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to fetch')
      setSearchedTaskType(taskType)
      setSearchedGoal(TEAM_GOALS[taskType])
      setLogs(data.logs || [])
      setTeamTotalTasks(data.totalTeamTasks || 0)
    } catch (err) {
      setError('Could not load previous work.')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  const progress = Math.min((teamTotalTasks / searchedGoal) * 100, 100)
  const displayProgress = progress < 1 && teamTotalTasks > 0 ? 1 : Math.round(progress)

  return (
    <div className={styles.page}>
      <div className={styles.headerWrap}>{header}</div>

      {/* Controls */}
      <div className={styles.controls}>
        {/* Task type toggle */}
        <div className={styles.toggleGroup}>
          <button
            className={`${styles.toggleBtn} ${taskType === 'upload' ? styles.active : ''}`}
            onClick={() => setTaskType('upload')}
          >PM</button>
          <button
            className={`${styles.toggleBtn} ${taskType === 'realignment' ? styles.active : ''}`}
            onClick={() => setTaskType('realignment')}
          >Realignment</button>
        </div>

        {/* Search mode toggle */}
        <div className={styles.toggleGroup}>
          <button
            className={`${styles.toggleBtn} ${useDateOnly ? styles.active : ''}`}
            onClick={() => setUseDateOnly(true)}
          >Date Only</button>
          <button
            className={`${styles.toggleBtn} ${!useDateOnly ? styles.active : ''}`}
            onClick={() => setUseDateOnly(false)}
          >Block + Tracker</button>
        </div>

        {/* Inputs */}
        {useDateOnly ? (
          <input
            className={styles.input}
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
        ) : (
          <div className={styles.blockTrackerRow}>
            <select
              className={styles.input}
              value={selectedBlock}
              onChange={e => setSelectedBlock(e.target.value)}
            >
              <option value="">Select Block</option>
              {Array.from({ length: 25 }, (_, i) => (
                <option key={i} value={`Block ${i + 1}`}>Block {i + 1}</option>
              ))}
            </select>
            <input
              className={styles.input}
              type="text"
              placeholder="Tracker ID e.g. T12"
              value={selectedTrackerId}
              onChange={e => setSelectedTrackerId(e.target.value)}
            />
          </div>
        )}

        <button className={styles.searchBtn} onClick={handleSearch} disabled={loading}>
          {loading ? <span className={styles.btnSpinner} /> : null}
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Progress bar */}
      {logs.length > 0 && (
        <div className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>
              Team Progress — {searchedTaskType === 'realignment' ? 'Realignment' : 'PM Tasks'}
            </span>
            <span className={styles.progressCount}>
              {teamTotalTasks} / {searchedGoal} tasks
            </span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${displayProgress}%` }}
            />
          </div>
          <div className={styles.progressPct}>{displayProgress}%</div>
        </div>
      )}

      {/* Error */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Results */}
      {logs.length === 0 && !loading && !error && (
        <div className={styles.empty}>
          Select a date or block/tracker and press Search to view logs.
        </div>
      )}

      <div className={styles.logList}>
        {logs.map((entry, index) => {
          const key = `${entry.block}-${entry.tracker_id}-${entry.last_updated}`
          const isExpanded = expanded[key]
          return (
            <div key={index} className={styles.logCard}>
              <button
                className={styles.logHeader}
                onClick={() => toggleExpand(key)}
              >
                <span className={styles.logTitle}>
                  {entry.block} / {entry.tracker_id}
                </span>
                <span className={styles.logMeta}>
                  {new Date(entry.last_updated).toLocaleString()}
                </span>
                <span className={styles.chevron}>{isExpanded ? '▼' : '▶'}</span>
              </button>

              {isExpanded && (
                <div className={styles.logBody}>
                  <div className={styles.logRow}>
                    <span className={styles.logKey}>Site</span>
                    <span className={styles.logVal}>{entry.site}</span>
                  </div>

                  {searchedTaskType === 'realignment' ? (
                    <>
                      <div className={styles.logRow}>
                        <span className={styles.logKey}>Notes</span>
                        <span className={styles.logVal}>{entry.notes || '—'}</span>
                      </div>
                      <div className={styles.logRow}>
                        <span className={styles.logKey}>Before Barcodes</span>
                        <span className={styles.logVal}>{entry.before_barcodes?.length ?? 0}</span>
                      </div>
                      {entry.before_barcodes?.map((b, i) => (
                        <div key={i} className={`${styles.logRow} ${styles.indent}`}>
                          <span className={styles.logVal}>{i + 1}. {b.barcode}</span>
                        </div>
                      ))}
                      <div className={styles.logRow}>
                        <span className={styles.logKey}>After Barcodes</span>
                        <span className={styles.logVal}>{entry.after_barcodes?.length ?? 0}</span>
                      </div>
                      {entry.after_barcodes?.map((b, i) => (
                        <div key={i} className={`${styles.logRow} ${styles.indent}`}>
                          <span className={styles.logVal}>{i + 1}. {b.barcode}</span>
                        </div>
                      ))}
                      <div className={styles.logRow}>
                        <span className={styles.logKey}>Before Photos</span>
                        <span className={styles.logVal}>{entry.image_files?.before_image?.length ?? 0}</span>
                      </div>
                      <div className={styles.logRow}>
                        <span className={styles.logKey}>After Photos</span>
                        <span className={styles.logVal}>{entry.image_files?.after_image?.length ?? 0}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {entry.tasks?.map((task, i) => (
                        <div key={i} className={styles.taskCard}>
                          <div className={styles.taskName}>{task.task_name}</div>
                          <div className={styles.taskMeta}>
                            <span className={task.checked ? styles.tagSuccess : styles.tagDanger}>
                              {task.checked ? '✓ Checked' : '✗ Not Checked'}
                            </span>
                            <span className={task.isComplete ? styles.tagSuccess : styles.tagWarning}>
                              {task.isComplete ? 'Complete' : 'Incomplete'}
                            </span>
                            {task.needsRepair && (
                              <span className={styles.tagDanger}>Needs Repair</span>
                            )}
                          </div>
                          <div className={styles.taskDetails}>
                            <span>By: {task.created_by}</span>
                            <span>{new Date(task.updated_at).toLocaleString()}</span>
                          </div>
                          {task.notes && (
                            <div className={styles.taskNotes}>{task.notes}</div>
                          )}
                          <div className={styles.photoCount}>
                            Before: {task.before_photos?.length ?? 0} · After: {task.after_photos?.length ?? 0}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}