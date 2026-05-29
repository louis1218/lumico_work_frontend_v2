import { useState, useRef, useEffect } from 'react'
import FormHeader from '../FormHeader/FormHeader'
import styles from './MultiStepTaskForm.module.scss'
import type { Session } from '../../App'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TaskState {
  name: string
  customName?: string
  checked: boolean
  needsRepair: boolean | null
  isComplete: boolean | null
  beforePhotos: File[]
  beforePreviews: string[]
  afterPhotos: File[]
  afterPreviews: string[]
  notes: string
  uploadedBeforeCount?: number
  uploadedAfterCount?: number
  uploadedBeforePreviews?: string[]
  uploadedAfterPreviews?: string[]
  isSubmitted?: boolean
  isSaved?: boolean
  locked?: boolean
  created_by?: string | null
}

interface RealignmentMeta {
  uploadedBeforePreviews: string[]
  uploadedAfterPreviews: string[]
  uploadedGeneralPreviews: string[]
  uploadedBeforeCount: number
  uploadedAfterCount: number
  uploadedGeneralCount: number
  isSaved: boolean
  isSubmitted?: boolean
}

interface FormState {
  block: string
  trackerId: string
  submitted: boolean
  realignmentNotes: string
  need_realignment_fix: boolean
  completionDate: string
  tasks: TaskState[]
  notes: string
}

interface PhotoInputRefs {
  before?: HTMLInputElement | null
  after?: HTMLInputElement | null
  realignBefore?: HTMLInputElement | null
  realign?: HTMLInputElement | null
}

interface MultiStepTaskFormProps {
  project: string
  session: Session
  header?: React.ReactNode
  taskOptions: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────
const GET_SESSION_API = 'https://62qd6uo4j4.execute-api.ap-southeast-2.amazonaws.com/default/getWorkLogSharedEditSession'
const POST_SESSION_API = 'https://6iswohbvrg.execute-api.ap-southeast-2.amazonaws.com/default/WorkLogSharedEditSession'
const S3_BASE_URL = 'https://solar-farm-uploads.s3.ap-southeast-2.amazonaws.com'

type StepName = 'init' | 'realignmentCheck' | 'task' | 'final'

export default function MultiStepTaskForm({ project, session, taskOptions }: MultiStepTaskFormProps) {
  const cleanedTasks = [
    ...taskOptions.filter(t => t !== 'Realignment' && t !== 'Other'),
    ...(taskOptions.includes('Other') ? ['Other'] : []),
  ]

  const [enlargedSrc, setEnlargedSrc] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [startLoading, setStartLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false)

  const [form, setForm] = useState<FormState>({
    block: '', trackerId: '', submitted: false,
    realignmentNotes: '', need_realignment_fix: false,
    completionDate: '',
    tasks: cleanedTasks.map(task => ({
      name: task, checked: false, needsRepair: null, isComplete: false,
      beforePhotos: [], beforePreviews: [], afterPhotos: [], afterPreviews: [], notes: '',
    })),
    notes: '',
  })

  const [beforePhotos, setBeforePhotos] = useState<File[]>([])
  const [afterPhotos, setAfterPhotos] = useState<File[]>([])
  const [beforePreviews, setBeforePreviews] = useState<string[]>([])
  const [afterPreviews, setAfterPreviews] = useState<string[]>([])

  const [realignmentChecked, setRealignmentChecked] = useState(false)
  const [needsRepair, setNeedsRepair] = useState<boolean | null>(null)
  const [realignmentPhotos, setRealignmentPhotos] = useState<{ before: File[]; after: File[]; general: File[] }>({ before: [], after: [], general: [] })
  const [realignmentPreviews, setRealignmentPreviews] = useState<{ before: string[]; after: string[]; general: string[] }>({ before: [], after: [], general: [] })
  const [realignmentMeta, setRealignmentMeta] = useState<RealignmentMeta>({
    uploadedBeforePreviews: [], uploadedAfterPreviews: [], uploadedGeneralPreviews: [],
    uploadedBeforeCount: 0, uploadedAfterCount: 0, uploadedGeneralCount: 0, isSaved: false,
  })

  const [taskCount, setTaskCount] = useState(form.tasks.length)
  const photoInputRef = useRef<PhotoInputRefs>({})
  const skipNextFetchRef = useRef(false)

  // Restore from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('multiStepTaskFormData')
    if (saved) {
      const { form: savedForm, stepIndex: savedStep } = JSON.parse(saved)
      setForm(savedForm)
      setStepIndex(savedStep || 0)
    }
  }, [])

  // Persist to localStorage
  useEffect(() => {
    if (!form.trackerId || !form.block) return
    localStorage.setItem('multiStepTaskFormData', JSON.stringify({
      form, stepIndex, realignmentChecked, needsRepair,
      realignmentPhotos, realignmentPreviews, realignmentMeta,
    }))
  }, [form, stepIndex, realignmentChecked, needsRepair, realignmentPhotos, realignmentPreviews, realignmentMeta])

  // Auto-fetch when step changes
  useEffect(() => {
    if (skipNextFetchRef.current) { skipNextFetchRef.current = false; return }
    const isValidStep = stepIndex > 0 && stepIndex <= form.tasks.length + 1
    if (form.trackerId && form.block && isValidStep) fetchSessionData()
  }, [form.trackerId, form.block, stepIndex])

  const currentStep = (): StepName => {
    if (stepIndex === 0) return 'init'
    if (stepIndex === 1) return 'realignmentCheck'
    if (stepIndex === taskCount + 2) return 'final'
    return 'task'
  }

  const isTaskStep = stepIndex > 1 && stepIndex <= form.tasks.length + 1
  const currentTask = isTaskStep ? form.tasks[stepIndex - 2] : null

  // ── API ──────────────────────────────────────────────────────────────────────
  const fetchSessionData = async () => {
    setIsFetching(true)
    try {
      const res = await fetch(GET_SESSION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: session.site.toLowerCase(), block: form.block, trackerId: form.trackerId }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data || typeof data !== 'object') return

      if (Array.isArray(data.tasks)) {
        const mergedTasks: TaskState[] = form.tasks
          .filter(task => !task.name.startsWith('Other'))
          .map(task => {
            const m = data.tasks.find((t: any) => t.task_name === task.name)
            return {
              ...task,
              checked: m?.checked || false,
              needsRepair: m?.needsRepair ?? null,
              isComplete: m?.isComplete || false,
              locked: m?.created_by && m.created_by !== session.username,
              created_by: m?.created_by || null,
              uploadedBeforeCount: m?.before_photos?.length || 0,
              uploadedAfterCount: m?.after_photos?.length || 0,
              uploadedBeforePreviews: (m?.before_photos || []).map((k: string) => `${S3_BASE_URL}/${k}`),
              uploadedAfterPreviews: (m?.after_photos || []).map((k: string) => `${S3_BASE_URL}/${k}`),
              isSubmitted: !!data.submitted,
              isSaved: !data.submitted && !!m?.created_by,
              notes: m?.notes || '',
            }
          })

        const otherFromDB = data.tasks.filter((t: any) => t.remark === 'other')
        const otherTasks: TaskState[] = otherFromDB.length > 0
          ? otherFromDB.map((t: any, i: number) => ({
              name: `Other (${i + 1})`, customName: t.task_name,
              checked: t.checked || false, needsRepair: t.needsRepair ?? null,
              isComplete: t.isComplete || false, created_by: t.created_by || null,
              locked: t.created_by && t.created_by !== session.username,
              uploadedBeforeCount: t.before_photos?.length || 0,
              uploadedAfterCount: t.after_photos?.length || 0,
              uploadedBeforePreviews: (t.before_photos || []).map((k: string) => `${S3_BASE_URL}/${k}`),
              uploadedAfterPreviews: (t.after_photos || []).map((k: string) => `${S3_BASE_URL}/${k}`),
              isSubmitted: !!data.submitted, isSaved: !data.submitted && !!t.created_by,
              notes: t.notes || '', beforePhotos: [], beforePreviews: [], afterPhotos: [], afterPreviews: [],
            }))
          : [{
              name: 'Other (1)', customName: '', checked: false, needsRepair: null,
              isComplete: false, created_by: null, locked: false,
              uploadedBeforeCount: 0, uploadedAfterCount: 0,
              uploadedBeforePreviews: [], uploadedAfterPreviews: [],
              isSubmitted: false, isSaved: false, notes: '',
              beforePhotos: [], beforePreviews: [], afterPhotos: [], afterPreviews: [],
            }]

        const finalTasks = [...mergedTasks, ...otherTasks]
        setForm(prev => ({ ...prev, notes: data.notes || '', tasks: finalTasks, completionDate: data.completion_date || '', submitted: !!data.submitted }))
        setTaskCount(finalTasks.length)
      }

      const realignment = data.tasks?.find((t: any) => t.task_name === 'Realignment Check')
      if (realignment) {
        setRealignmentMeta({
          uploadedBeforePreviews: (realignment.before_photos || []).filter((k: string) => k.includes('realignment_before')).map((k: string) => `${S3_BASE_URL}/${k}`),
          uploadedAfterPreviews: (realignment.after_photos || []).filter((k: string) => k.includes('realignment_after')).map((k: string) => `${S3_BASE_URL}/${k}`),
          uploadedGeneralPreviews: (realignment.before_photos || []).filter((k: string) => k.includes('realignment_general')).map((k: string) => `${S3_BASE_URL}/${k}`),
          uploadedBeforeCount: (realignment.before_photos || []).filter((k: string) => k.includes('realignment_before')).length,
          uploadedAfterCount: (realignment.after_photos || []).filter((k: string) => k.includes('realignment_after')).length,
          uploadedGeneralCount: (realignment.before_photos || []).filter((k: string) => k.includes('realignment_general')).length,
          isSaved: !!realignment.created_by && !data.submitted,
          isSubmitted: !!data.submitted,
        })
        setRealignmentChecked(realignment.checked)
        setNeedsRepair(realignment.needs_repair)
        setForm(prev => ({ ...prev, need_realignment_fix: data.need_realignment_fix ?? false }))
      }
    } catch (err) { console.warn('Error fetching session:', err) }
    finally { setIsFetching(false) }
  }

  const uploadGroup = async (photos: File[], type: string, trackerId: string, taskName?: string) => {
    const uploaded: { key: string; type: string }[] = []
    const timestamp = new Date().toLocaleString().replace(/[:./, ]/g, '-')
    const sanitizedTracker = trackerId.replace(/\s+/g, '_').toLowerCase()
    const sanitizedTask = taskName ? taskName.replace(/\s+/g, '_').toLowerCase() : 'realignment'
    for (const [i, photo] of photos.entries()) {
      const fileName = taskName
        ? `${sanitizedTracker}_${type}_${sanitizedTask}_${timestamp}_${i + 1}`
        : `${sanitizedTracker}_realignment_${type}_${timestamp}_${i + 1}`
      const res = await fetch(
        `https://3ffk7ivyul.execute-api.ap-southeast-2.amazonaws.com/prod/getPresignedURL-1?project=${project}&mode=${type}&filename=${fileName}&contentType=${photo.type}`,
        { method: 'GET' }
      )
      if (!res.ok) throw new Error('Failed presigned URL')
      const { uploadURL, key } = await res.json()
      uploaded.push({ key, type })
      const up = await fetch(uploadURL, { method: 'PUT', headers: { 'Content-Type': photo.type }, body: photo })
      if (!up.ok) throw new Error('Upload failed')
    }
    return uploaded
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleNext = async () => {
    if (stepIndex === 0) {
      if (!form.block || !form.trackerId) { alert('Please fill in Block and Tracker ID.'); return }
      setStartLoading(true)
      await fetchSessionData()
      setStepIndex(1)
      setStartLoading(false)
      return
    }
    setStepIndex(prev => prev + 1)
  }

  const handleBack = async () => {
    const isOnSummary = stepIndex === form.tasks.length + 2
    const lastTask = form.tasks[form.tasks.length - 1]
    const isEmptyOther = lastTask?.name?.startsWith('Other') && !lastTask.isSaved && !lastTask.isSubmitted && !lastTask.uploadedBeforeCount && !lastTask.uploadedAfterCount && !lastTask.notes?.trim()

    if (isOnSummary && isEmptyOther) {
      setForm(prev => ({ ...prev, tasks: prev.tasks.slice(0, -1) }))
      setTaskCount(prev => prev - 1)
      setStepIndex(prev => Math.max(prev - 2, 1))
      return
    }
    if (stepIndex === form.tasks.length && isEmptyOther) {
      setForm(prev => ({ ...prev, tasks: prev.tasks.slice(0, -1) }))
      setTaskCount(prev => prev - 1)
      setStepIndex(prev => Math.max(prev - 1, 1))
      return
    }
    await fetchSessionData()
    setStepIndex(prev => Math.max(prev - 1, 0))
  }

  const handleSave = async () => {
    if (!form.trackerId || !form.block) return alert('Tracker ID and Block are required.')
    const taskIndex = stepIndex - 2
    const task = form.tasks[taskIndex]
    if (!task) return alert('No current task found.')
    if (!task.checked) return alert("Please tick 'Checked' before saving.")
    if (task.needsRepair === null || task.needsRepair === undefined) return alert('Please select whether the task needs repair.')
    if (task.name.startsWith('Other') && !task.customName?.trim()) return alert("Please enter a task name for this 'Other' task.")

    try {
      setSaving(true)
      const uploaded = [
        ...await uploadGroup(beforePhotos, 'before', form.trackerId, task.name),
        ...await uploadGroup(afterPhotos, 'after', form.trackerId, task.name),
      ]
      const existingBefore = task.uploadedBeforePreviews?.map(u => u.replace(`${S3_BASE_URL}/`, '')) || []
      const existingAfter = task.uploadedAfterPreviews?.map(u => u.replace(`${S3_BASE_URL}/`, '')) || []

      const taskPayload = {
        task_name: task.customName?.trim() || task.name,
        remark: task.name.startsWith('Other') ? 'other' : 'planned',
        checked: task.checked, needsRepair: task.needsRepair, isComplete: task.isComplete,
        before_photos: [...existingBefore, ...uploaded.filter(i => i.type === 'before').map(i => i.key)],
        after_photos: [...existingAfter, ...uploaded.filter(i => i.type === 'after').map(i => i.key)],
        created_by: session.username, updated_at: new Date().toISOString(), notes: task.notes || '',
      }

      const res = await fetch(POST_SESSION_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackerId: form.trackerId, block: form.block, site: session.site.toLowerCase(), timestamp: new Date().toISOString(), username: session.username, notes: form.notes, tasks: [taskPayload] }),
      })
      if (!res.ok) throw new Error('Save failed')

      setForm(prev => {
        const cloned = [...prev.tasks]
        cloned[taskIndex] = { ...cloned[taskIndex], beforePhotos: [], beforePreviews: [], afterPhotos: [], afterPreviews: [], isSubmitted: false }
        return { ...prev, submitted: false, tasks: cloned }
      })
      setBeforePhotos([]); setBeforePreviews([]); setAfterPhotos([]); setAfterPreviews([])
      await fetchSessionData()
      alert('Progress saved ✅')
    } catch { alert('Save failed ❌') }
    finally { setSaving(false) }
  }

  const handleSaveRealignment = async () => {
    if (!realignmentChecked) return alert("Please tick 'Checked'.")
    if (needsRepair === null) return alert('Please select whether repair is needed.')
    if (needsRepair === true && realignmentPhotos.before.length === 0 && realignmentMeta.uploadedBeforePreviews.length === 0)
      return alert('Please upload at least one realignment request photo.')

    try {
      setSaving(true)
      const uploaded = needsRepair
        ? await uploadGroup(realignmentPhotos.before, 'before', form.trackerId)
        : await uploadGroup(realignmentPhotos.general, 'general', form.trackerId)

      const taskPayload = {
        task_name: 'Realignment Check', remark: 'realignment_check',
        checked: realignmentChecked, needs_repair: needsRepair,
        before_photos: needsRepair
          ? [...realignmentMeta.uploadedBeforePreviews.map(u => u.replace(`${S3_BASE_URL}/`, '')), ...uploaded.filter(i => i.type === 'before').map(i => i.key)]
          : [...realignmentMeta.uploadedGeneralPreviews.map(u => u.replace(`${S3_BASE_URL}/`, '')), ...uploaded.filter(i => i.type === 'general').map(i => i.key)],
        after_photos: [], created_by: session.username, updated_at: new Date().toISOString(),
        notes: form.realignmentNotes?.trim() || (needsRepair === false ? 'No repair needed' : 'Realignment request photos'),
      }

      const res = await fetch(POST_SESSION_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackerId: form.trackerId, block: form.block, site: session.site.toLowerCase(), timestamp: new Date().toISOString(), username: session.username, notes: form.notes || '', submitted: false, tasks: [taskPayload] }),
      })
      if (!res.ok) throw new Error('Save failed')

      alert('Realignment check saved ✅')
      await fetchSessionData()
      setForm(prev => ({ ...prev, submitted: false }))
      setRealignmentMeta(prev => ({ ...prev, isSaved: true, isSubmitted: false }))
      setRealignmentPhotos({ before: [], after: [], general: [] })
      setRealignmentPreviews({ before: [], after: [], general: [] })
    } catch { alert('Save failed ❌') }
    finally { setSaving(false) }
  }

  const handleSubmit = async () => {
    const unsaved = form.tasks.filter(t => t.name !== 'Other' && !t.isSaved && !t.isSubmitted)
    if (unsaved.length > 0) { alert(`Please save all tasks:\n\n${unsaved.map(t => `• ${t.name}`).join('\n')}`); return }
    if (!realignmentMeta.isSaved && !realignmentMeta.isSubmitted) { alert('Please save the Realignment Check.'); return }
    if (!form.completionDate) { alert('Please select a completion date.'); return }

    try {
      setSaving(true)
      const payload = {
        trackerId: form.trackerId, block: form.block, site: session.site.toLowerCase(),
        timestamp: new Date().toISOString(), username: session.username,
        notes: form.notes, submitted: true, completion_date: form.completionDate,
        tasks: [
          {
            task_name: 'Realignment Check', remark: 'realignment_check',
            checked: realignmentChecked, needs_repair: needsRepair,
            before_photos: needsRepair
              ? realignmentMeta.uploadedBeforePreviews.map(u => u.replace(`${S3_BASE_URL}/`, ''))
              : realignmentMeta.uploadedGeneralPreviews.map(u => u.replace(`${S3_BASE_URL}/`, '')),
            after_photos: [], created_by: session.username, updated_at: new Date().toISOString(),
            notes: form.realignmentNotes?.trim() || (needsRepair === false ? 'No repair needed' : 'Realignment request photos'),
          },
          ...form.tasks.map(task => ({
            task_name: task.name.startsWith('Other') ? task.customName || task.name : task.name,
            remark: task.name.startsWith('Other') ? 'other' : 'planned',
            checked: task.checked, needsRepair: task.needsRepair, isComplete: task.isComplete,
            before_photos: task.uploadedBeforePreviews?.map(u => u.replace(`${S3_BASE_URL}/`, '')) || [],
            after_photos: task.uploadedAfterPreviews?.map(u => u.replace(`${S3_BASE_URL}/`, '')) || [],
            created_by: session.username, updated_at: new Date().toISOString(), notes: task.notes || '',
          })),
        ],
      }
      const res = await fetch(POST_SESSION_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Submit failed')
      alert('Successfully submitted ✅')
      setRealignmentMeta(prev => ({ ...prev, isSaved: true, isSubmitted: true }))
      await fetchSessionData()
      setForm(prev => ({ ...prev, submitted: true }))
    } catch { alert('Submit failed ❌') }
    finally { setSaving(false) }
  }

  const addNewOtherTask = () => {
    const newTask: TaskState = {
      name: `Other (${form.tasks.filter(t => t.name.startsWith('Other')).length + 1})`,
      checked: false, needsRepair: null, isComplete: false,
      beforePhotos: [], beforePreviews: [], afterPhotos: [], afterPreviews: [],
      uploadedBeforeCount: 0, uploadedAfterCount: 0,
      uploadedBeforePreviews: [], uploadedAfterPreviews: [],
      notes: '', created_by: null, locked: false,
    }
    skipNextFetchRef.current = true
    setForm(prev => {
      const updated = [...prev.tasks, newTask]
      setTaskCount(updated.length)
      return { ...prev, tasks: updated }
    })
    setTimeout(() => setStepIndex(prev => prev + 1), 0)
  }

  const resetToInit = () => {
    setStepIndex(0)
    setForm(prev => ({ ...prev, block: '', trackerId: '' }))
    setRealignmentPhotos({ before: [], after: [], general: [] })
    setRealignmentPreviews({ before: [], after: [], general: [] })
    setRealignmentMeta({ uploadedBeforePreviews: [], uploadedAfterPreviews: [], uploadedGeneralPreviews: [], uploadedBeforeCount: 0, uploadedAfterCount: 0, uploadedGeneralCount: 0, isSaved: false })
    setRealignmentChecked(false)
    setNeedsRepair(null)
    localStorage.removeItem('multiStepTaskFormData')
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const step = currentStep()

  return (
    <div className={styles.page}>
      <FormHeader
        session={session}
        onBackToMenu={resetToInit}
        form={form}
        currentStep={step}
        currentTask={currentTask}
        stepIndex={stepIndex}
        isFetching={isFetching}
        fetchSessionData={fetchSessionData}
        realignmentMeta={realignmentMeta}
      />

      <div className={styles.formWrap}>
        {/* Top bar (non-init) */}
        {step !== 'init' && (
          <div className={styles.formTopBar}>
            <button type="button" className={styles.ghostBtn} onClick={resetToInit}>
              ← Tracker Selection
            </button>
            {step !== 'final' && (
              <button type="button" className={styles.ghostBtnGreen} onClick={() => setStepIndex(form.tasks.length + 2)}>
                Go to Summary →
              </button>
            )}
          </div>
        )}

        {/* Step nav (task / realignment) */}
        {(step === 'task' || step === 'realignmentCheck') && (
          <div className={styles.stepNav}>
            <button type="button" className={styles.navArrow} onClick={handleBack} disabled={stepIndex <= 0}>←</button>
            <span className={styles.stepLabel}>
              {step === 'realignmentCheck' ? 'Realignment Check' : `Task ${stepIndex - 1} of ${form.tasks.length}`}
            </span>
            <button type="button" className={styles.navArrow} onClick={handleNext}>→</button>
          </div>
        )}

        <form
          className={styles.form}
          onSubmit={e => { e.preventDefault(); step === 'final' ? handleSubmit() : handleNext() }}
        >
          {/* ── INIT ── */}
          {step === 'init' && (
            <div className={styles.initStep}>
              <h2 className={styles.stepTitle}>Select Tracker</h2>
              <div className={styles.field}>
                <label className={styles.label}>Block</label>
                <select className={styles.select} value={form.block} onChange={e => setForm(f => ({ ...f, block: e.target.value }))} required>
                  <option value="">Select Block</option>
                  {Array.from({ length: 25 }, (_, i) => (
                    <option key={i} value={`Block ${i + 1}`}>Block {i + 1}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Tracker ID</label>
                <input className={styles.input} type="text" value={form.trackerId} onChange={e => setForm(f => ({ ...f, trackerId: e.target.value }))} placeholder="e.g. T12" required />
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={startLoading}>
                {startLoading ? <><span className={styles.btnSpinner} /> Loading...</> : 'Start'}
              </button>
            </div>
          )}

          {/* ── REALIGNMENT ── */}
          {step === 'realignmentCheck' && (
            <div className={styles.stepBody}>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={realignmentChecked} onChange={e => { setRealignmentChecked(e.target.checked); setNeedsRepair(null) }} />
                <span>Checked</span>
              </label>

              {realignmentChecked && (
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Does it need remediation?</label>
                  <div className={styles.radioRow}>
                    <label className={styles.radioLabel}><input type="radio" name="realignRepair" checked={needsRepair === false} onChange={() => setNeedsRepair(false)} /> No</label>
                    <label className={styles.radioLabel}><input type="radio" name="realignRepair" checked={needsRepair === true} onChange={() => setNeedsRepair(true)} /> Yes</label>
                  </div>
                </div>
              )}

              {realignmentChecked && needsRepair !== null && (
                <>
                  <h4 className={styles.photoSectionTitle}>
                    {needsRepair ? 'Realignment Request Photos' : 'Realignment Check Photos'}
                  </h4>
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                    ref={ref => { photoInputRef.current = { ...photoInputRef.current, [needsRepair ? 'realignBefore' : 'realign']: ref } }}
                    onChange={e => {
                      const files = Array.from(e.target.files || [])
                      const key = needsRepair ? 'before' : 'general'
                      setRealignmentPhotos(p => ({ ...p, [key]: [...p[key], ...files] }))
                      setRealignmentPreviews(p => ({ ...p, [key]: [...p[key], ...files.map(f => URL.createObjectURL(f))] }))
                    }}
                  />
                  <div className={styles.uploadBox} onClick={() => needsRepair ? photoInputRef.current.realignBefore?.click() : photoInputRef.current.realign?.click()}>+</div>
                  <div className={styles.previewGrid}>
                    {[...(needsRepair ? realignmentMeta.uploadedBeforePreviews : realignmentMeta.uploadedGeneralPreviews),
                      ...(needsRepair ? realignmentPreviews.before : realignmentPreviews.general)
                    ].map((src, i) => {
                      const isSaved = needsRepair ? realignmentMeta.uploadedBeforePreviews.includes(src) : realignmentMeta.uploadedGeneralPreviews.includes(src)
                      return (
                        <div key={i} className={styles.previewThumb}>
                          <img src={src} alt="" onClick={() => setEnlargedSrc(src)} />
                          {isSaved ? <span className={styles.savedTag}>saved</span> : (
                            <button className={styles.removeBtn} onClick={e => {
                              e.stopPropagation()
                              const key = needsRepair ? 'before' : 'general'
                              URL.revokeObjectURL(src)
                              setRealignmentPreviews(p => ({ ...p, [key]: p[key].filter(s => s !== src) }))
                              setRealignmentPhotos(p => ({ ...p, [key]: p[key].filter((_, idx) => URL.createObjectURL(p[key][idx]) !== src) }))
                            }}>×</button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Notes</label>
                    <textarea className={styles.textarea} rows={3} placeholder="Add any notes for this realignment check" value={form.realignmentNotes || ''}
                      onChange={e => setForm(prev => ({ ...prev, realignmentNotes: e.target.value }))} />
                  </div>
                  <button type="button" className={`${styles.primaryBtn} ${styles.fullWidth}`} onClick={handleSaveRealignment}>Save</button>
                </>
              )}
            </div>
          )}

          {/* ── TASK ── */}
          {step === 'task' && currentTask && (
            <div className={styles.stepBody}>
              {/* Task name */}
              <div className={styles.taskNameRow}>
                {form.tasks[stepIndex - 2].name.startsWith('Other') ? (
                  <>
                    <input type="text" className={styles.taskNameInput} value={form.tasks[stepIndex - 2].customName || ''} placeholder="Other Task Name"
                      onChange={e => {
                        const updated = [...form.tasks]; updated[stepIndex - 2].customName = e.target.value
                        setForm(f => ({ ...f, tasks: updated }))
                      }} />
                    {form.tasks.filter(t => t.name.startsWith('Other')).indexOf(form.tasks[stepIndex - 2]) > 0 && (
                      <button type="button" className={styles.deleteTaskBtn} onClick={() => {
                        const updated = [...form.tasks]; updated.splice(stepIndex - 2, 1)
                        setForm(f => ({ ...f, tasks: updated }))
                        setStepIndex(prev => Math.max(prev - 1, 1))
                      }}>✕</button>
                    )}
                  </>
                ) : (
                  <h3 className={styles.taskTitle}>{form.tasks[stepIndex - 2].name}</h3>
                )}
                {stepIndex === form.tasks.length + 1 && form.tasks[form.tasks.length - 1]?.name.startsWith('Other') && (
                  <button type="button" className={styles.addMoreBtn} onClick={addNewOtherTask}>+ More</button>
                )}
              </div>

              {/* Checked */}
              <label className={styles.checkRow}>
                <input type="checkbox" checked={currentTask.checked}
                  onChange={e => {
                    const updated = [...form.tasks]; updated[stepIndex - 2].checked = e.target.checked; updated[stepIndex - 2].needsRepair = null
                    setForm(f => ({ ...f, tasks: updated }))
                  }} />
                <span>Checked</span>
              </label>

              {/* Needs repair */}
              {currentTask.checked && (
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Does it need remediation?</label>
                  <div className={styles.radioRow}>
                    <label className={styles.radioLabel}><input type="radio" name="needsRepair" checked={currentTask.needsRepair === false} onChange={() => { const u = [...form.tasks]; u[stepIndex - 2].needsRepair = false; setForm(f => ({ ...f, tasks: u })) }} /> No</label>
                    <label className={styles.radioLabel}><input type="radio" name="needsRepair" checked={currentTask.needsRepair === true} onChange={() => { const u = [...form.tasks]; u[stepIndex - 2].needsRepair = true; setForm(f => ({ ...f, tasks: u })) }} /> Yes</label>
                  </div>
                </div>
              )}

              {/* Repair details */}
              {currentTask.checked && currentTask.needsRepair === true && (
                <>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Progress</label>
                    <div className={styles.checkboxRow}>
                      <label className={styles.checkRow}><input type="checkbox" checked={form.tasks[stepIndex - 2].isComplete === true} onChange={() => { const u = [...form.tasks]; u[stepIndex - 2].isComplete = true; setForm(f => ({ ...f, tasks: u })) }} /><span>Completed</span></label>
                      <label className={styles.checkRow}><input type="checkbox" checked={form.tasks[stepIndex - 2].isComplete === false} onChange={() => { const u = [...form.tasks]; u[stepIndex - 2].isComplete = false; setForm(f => ({ ...f, tasks: u })) }} /><span>Incomplete</span></label>
                    </div>
                  </div>

                  {/* Before photos */}
                  <div className={styles.photoSection}>
                    <h4 className={styles.photoSectionTitle}>
                      Before Repair {currentTask.uploadedBeforeCount ? <span className={styles.uploadedCount}>({currentTask.uploadedBeforeCount} uploaded)</span> : null}
                    </h4>
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                      ref={ref => { photoInputRef.current = { ...photoInputRef.current, before: ref } }}
                      onChange={e => { const files = Array.from(e.target.files || []); setBeforePhotos(p => [...p, ...files]); setBeforePreviews(p => [...p, ...files.map(f => URL.createObjectURL(f))]) }}
                    />
                    <div className={styles.previewGrid}>
                      {(currentTask.uploadedBeforePreviews || []).map((src, i) => (
                        <div key={`ub-${i}`} className={styles.previewThumb}><img src={src} alt="" onClick={() => setEnlargedSrc(src)} /><span className={styles.savedTag}>saved</span></div>
                      ))}
                      {beforePreviews.map((src, i) => (
                        <div key={`nb-${i}`} className={styles.previewThumb}>
                          <img src={src} alt="" onClick={() => setEnlargedSrc(src)} />
                          <button className={styles.removeBtn} onClick={e => { e.stopPropagation(); URL.revokeObjectURL(src); setBeforePreviews(p => p.filter((_, x) => x !== i)); setBeforePhotos(p => p.filter((_, x) => x !== i)) }}>×</button>
                        </div>
                      ))}
                      <div className={styles.uploadBox} onClick={() => photoInputRef.current.before?.click()}>+</div>
                    </div>
                  </div>

                  {/* After photos */}
                  <div className={styles.photoSection}>
                    <h4 className={styles.photoSectionTitle}>
                      After Repair {currentTask.uploadedAfterCount ? <span className={styles.uploadedCount}>({currentTask.uploadedAfterCount} uploaded)</span> : null}
                    </h4>
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                      ref={ref => { photoInputRef.current = { ...photoInputRef.current, after: ref } }}
                      onChange={e => { const files = Array.from(e.target.files || []); setAfterPhotos(p => [...p, ...files]); setAfterPreviews(p => [...p, ...files.map(f => URL.createObjectURL(f))]) }}
                    />
                    <div className={styles.previewGrid}>
                      {(currentTask.uploadedAfterPreviews || []).map((src, i) => (
                        <div key={`ua-${i}`} className={styles.previewThumb}><img src={src} alt="" onClick={() => setEnlargedSrc(src)} /><span className={styles.savedTag}>saved</span></div>
                      ))}
                      {afterPreviews.map((src, i) => (
                        <div key={`na-${i}`} className={styles.previewThumb}>
                          <img src={src} alt="" onClick={() => setEnlargedSrc(src)} />
                          <button className={styles.removeBtn} onClick={e => { e.stopPropagation(); URL.revokeObjectURL(src); setAfterPreviews(p => p.filter((_, x) => x !== i)); setAfterPhotos(p => p.filter((_, x) => x !== i)) }}>×</button>
                        </div>
                      ))}
                      <div className={styles.uploadBox} onClick={() => photoInputRef.current.after?.click()}>+</div>
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              <div className={styles.field}>
                <label className={styles.label}>Task Notes</label>
                <textarea className={styles.textarea} rows={3} placeholder="Add any notes for this task" value={form.tasks[stepIndex - 2].notes || ''}
                  onChange={e => { const updated = [...form.tasks]; updated[stepIndex - 2].notes = e.target.value; setForm(f => ({ ...f, tasks: updated })) }} />
              </div>

              <button type="button" className={`${styles.primaryBtn} ${styles.fullWidth}`} onClick={handleSave}>Save</button>
            </div>
          )}

          {/* ── FINAL ── */}
          {step === 'final' && (
            <div className={styles.stepBody}>
              <h3 className={styles.summaryTitle}>Summary of Tasks</h3>

              <div className={styles.summaryList}>
                {/* Realignment summary card */}
                <div className={styles.summaryCard}>
                  <div className={styles.summaryCardHeader}>
                    <span className={styles.summaryCardName}>Realignment Check</span>
                    <div className={styles.summaryCardActions}>
                      <span className={`${styles.statusBadge} ${realignmentMeta.isSubmitted ? styles.submitted : realignmentMeta.isSaved ? styles.saved : styles.notSaved}`}>
                        {realignmentMeta.isSubmitted ? 'SUBMITTED' : realignmentMeta.isSaved ? 'SAVED' : 'NOT SAVED'}
                      </span>
                      <button type="button" className={styles.editBtn} onClick={() => setStepIndex(1)}>Edit</button>
                    </div>
                  </div>
                  <div className={`${styles.statusText} ${realignmentChecked ? styles.statusGreen : styles.statusRed}`}>
                    {realignmentChecked ? '✅ Checked' : '❌ Not Checked'}
                  </div>
                  {realignmentChecked && (
                    <>
                      <div className={styles.summaryDetail}><strong>Needs Repair:</strong> <span className={needsRepair ? styles.statusRed : styles.statusGreen}>{needsRepair === true ? 'Yes' : needsRepair === false ? 'No' : '—'}</span></div>
                      <div className={styles.photoRow}>
                        {(needsRepair ? realignmentMeta.uploadedBeforePreviews : realignmentMeta.uploadedGeneralPreviews).map((src, i) => (
                          <img key={i} src={src} className={styles.thumbSmall} onClick={() => setEnlargedSrc(src)} alt="" />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Task summary cards */}
                {form.tasks.map((task, idx) => (
                  <div key={idx} className={styles.summaryCard}>
                    <div className={styles.summaryCardHeader}>
                      <div>
                        <div className={styles.summaryCardNum}>Task {idx + 1}</div>
                        <div className={styles.summaryCardName}>{task.name.startsWith('Other') ? task.customName || task.name : task.name}</div>
                      </div>
                      <div className={styles.summaryCardActions}>
                        <span className={`${styles.statusBadge} ${task.isSubmitted ? styles.submitted : task.isSaved ? styles.saved : styles.notSaved}`}>
                          {task.isSubmitted ? 'SUBMITTED' : task.isSaved ? 'SAVED' : 'NOT SAVED'}
                        </span>
                        <button type="button" className={styles.editBtn} onClick={() => setStepIndex(idx + 2)}>Edit</button>
                      </div>
                    </div>
                    <div className={`${styles.statusText} ${task.checked ? styles.statusGreen : styles.statusRed}`}>
                      {task.checked ? '✅ Checked' : '❌ Not Checked'}
                    </div>
                    <div className={styles.photoRow}>
                      {task.uploadedBeforePreviews?.map((src, i) => <img key={i} src={src} className={styles.thumbSmall} onClick={() => setEnlargedSrc(src)} alt="" />)}
                    </div>
                    {task.notes && <div className={styles.summaryNotes}>{task.notes}</div>}
                  </div>
                ))}
              </div>

              {/* Final notes + date */}
              <div className={styles.field}>
                <label className={styles.label}>Additional Notes</label>
                <textarea className={styles.textarea} rows={4} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes" />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Completion Date <span className={styles.required}>*</span></label>
                <input type="date" className={styles.input} value={form.completionDate ? form.completionDate.slice(0, 10) : ''} onChange={e => setForm(prev => ({ ...prev, completionDate: e.target.value }))} required style={{ maxWidth: '240px' }} />
              </div>

              <div className={styles.finalActions}>
                <button type="button" className={styles.secondaryBtn} onClick={handleBack}>Back</button>
                <button type="submit" className={styles.primaryBtn}>Submit</button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Saving overlay */}
      {saving && (
        <div className={styles.overlay}>
          <div className={styles.overlaySpinner} />
        </div>
      )}

      {/* Fetching overlay */}
      {isFetching && (
        <div className={styles.overlay}>
          <div className={styles.overlaySpinner} />
        </div>
      )}

      {/* Lightbox */}
      {enlargedSrc && (
        <div className={styles.lightbox} onClick={() => setEnlargedSrc(null)}>
          <img src={enlargedSrc} alt="Enlarged" className={styles.lightboxImg} />
        </div>
      )}
    </div>
  )
}