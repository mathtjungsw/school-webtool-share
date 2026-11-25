import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, CalendarDays, ClipboardCheck, FlaskConical, GraduationCap, RefreshCw, UsersRound } from 'lucide-react'
import type {
  AttendanceStatus, LabAccess, LabBoard, LabChange, LabField, LabLesson, LabOptions, LabRecord, LabRole, LabRow,
} from '../../../ungcheon-school-helper/electron/main/attendance-lab-data'
import { attendanceRequest, IS_ATTENDANCE_PREVIEW, listenAttendance, useAttendanceToken } from './connection'
import { latestAttendanceEdit, useAttendanceDraft, type AttendanceEdit } from './draft'
import './styles.css'

const labels = { homeroom: '담임 출결', subject: '교과 출결' }
const tones: Record<AttendanceStatus, string> = { 미확인: 'pending', 출석: 'present', 지각: 'late', 조퇴: 'early', 결석: 'absent' }
const noteOptions = ['지각', '결과', '결석']
const attendanceGrades = ['1', '2', '3']
const periods = [1, 2, 3, 4, 5, 6, 7]

const statusText = (status: AttendanceStatus) => status === '미확인' ? '미입력' : status

function nextAttendance(status: AttendanceStatus): AttendanceStatus {
  if (status === '출석') return '결석'
  if (status === '결석') return '미확인'
  return '출석'
}

function Lesson({ lesson }: { lesson: LabLesson }) {
  return <div className="lab-lesson">
    <div><strong>{lesson.subject}</strong> <span className={`lab-badge ${lesson.kind === '이동수업' ? 'moving' : 'class'}`}>{lesson.kind}</span>
      {lesson.change && <span className="lab-badge changed">{lesson.change}</span>}
    </div>
    <small>{lesson.teacher} 선생님 · {lesson.room}</small>
    {lesson.from && <small>{lesson.from}</small>}
  </div>
}

type AttendanceCellProps = {
  row: LabRow; field: LabRole; value: AttendanceStatus; editable: boolean; available: boolean
}

function AttendanceCell({ row, field, value, editable, available, onAdvance, busy, period }: AttendanceCellProps & {
  onAdvance: () => void; busy: boolean; period?: number
}) {
  return <div className="lab-record" role={period ? undefined : 'cell'}>
    <span className="lab-mobile-label">{labels[field]}</span>
    {field === 'subject' && !row.lesson ? <span className="lab-state unavailable">해당 없음</span> : editable ? (
      <button type="button" aria-label={`${row.name} ${period ? period + '교시 ' : ''}${labels[field]} ${statusText(value)}`} aria-describedby="lab-attendance-help"
        aria-busy={busy} disabled={!available} className={`lab-state ${tones[value]}`} onClick={onAdvance}>
        {statusText(value)} <RefreshCw size={12} aria-hidden="true" />
      </button>
    ) : <span className={`lab-state ${tones[value]}`}>{statusText(value)}</span>}
  </div>
}

function Note({ row, value, editable, available, save }: {
  row: LabRow; value?: string; editable: boolean; available: boolean; save: (value: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const note = value === undefined ? '비고 미입력' : value || '특이사항 없음'
  async function saveNote(text: string) {
    if (saving || !available) return
    setSaving(true)
    if (await save(text)) setDraft(null)
    setSaving(false)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (draft !== null) void saveNote(draft)
  }
  return <div className="lab-note" role="cell">
    <span className="lab-mobile-label">오늘 비고</span>
    {editable && <div className="lab-note-actions" role="group" aria-label={`${row.name} 비고 빠른 입력`} aria-busy={saving}>
      {noteOptions.map(option => <button key={option} type="button" aria-label={`${row.name} 비고 ${option}`} aria-pressed={value === option && draft === null}
        disabled={!available || saving || draft !== null} onClick={() => { if (value !== option) void saveNote(option) }}>{option}</button>)}
      <button type="button" className="lab-note-direct" aria-label={`${row.name} 비고 직접 입력`} aria-expanded={draft !== null}
        disabled={!available || saving || draft !== null} onClick={() => setDraft(value ?? '')}>직접 입력</button>
    </div>}
    {editable && draft !== null ? <form onSubmit={submit}>
      <input autoFocus aria-label={`${row.name} 오늘 비고`} value={draft} maxLength={160} disabled={!available || saving}
        placeholder="오늘 출결 비고" onChange={event => setDraft(event.target.value)} />
      <button type="submit" aria-label={`${row.name} 비고 저장`} disabled={!available || saving || draft.trim() === value}>{saving ? '저장 중' : '저장'}</button>
      <button type="button" aria-label={`${row.name} 비고 입력 취소`} disabled={saving} onClick={() => setDraft(null)}>취소</button>
    </form> : <span className={value ? 'lab-note-text' : 'lab-muted lab-note-text'}>{note}</span>}
  </div>
}

export function Board({ token, selection, role, readOnly, executiveToken }: { token: string; selection: string; role: LabRole; readOnly: boolean; executiveToken: string }) {
  const { snapshot: board, edits, current, updateSnapshot, send } = useAttendanceDraft<LabBoard>()
  const [err, setErr] = useState('')
  const [saveError, setSaveError] = useState('')
  const [bulkMessage, setBulkMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const lastSaveAt = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    const fail = (message: string, expired = false) => {
      if (controller.signal.aborted) return
      if (expired) updateSnapshot(() => null)
      setErr(message)
      controller.abort()
    }
    void listenAttendance(token, selection, controller.signal, (event, payload) => {
      if (event === 'board') {
        const { requestedAt, ...snapshot } = payload as LabBoard & { requestedAt?: number }
        if (!requestedAt || requestedAt >= lastSaveAt.current) { updateSnapshot(() => snapshot); setErr('') }
      }
      if (event === 'change') {
        const { student, field, value } = payload as LabChange
        updateSnapshot(previous => previous && { ...previous, records: { ...previous.records, [student]: { ...previous.records[student], [field]: value } } })
      }
      if (event === 'session-expired') fail('로그인이 만료되었습니다. 다시 로그인해 주세요.', true)
      if (event === 'unavailable') fail('출결 자료를 불러오지 못했습니다. 다시 연결해 주세요.')
    }, executiveToken).then(() => fail('Firebase 연결이 끊겼습니다. 다시 연결해 주세요.'))
      .catch(error => fail(error instanceof Error ? error.message : '출결 서버에 연결할 수 없습니다.'))
    return () => controller.abort()
  }, [token, selection, retry, executiveToken, updateSnapshot])

  async function save(row: LabRow, field: LabField, value: string) {
    setSaveError('')
    setBulkMessage('')
    try {
      await send(field === role ? { student: row.id, value: value as AttendanceStatus } : undefined, async () => {
        const updated = await attendanceRequest<LabChange>(token, `record?${selection}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student: row.id, field, value }),
        }, executiveToken)
        lastSaveAt.current = performance.now()
        return previous => ({ ...previous, records: { ...previous.records, [row.id]: { ...previous.records[row.id], [field]: updated.value } } })
      })
      return true
    } catch {
      setSaveError(`${row.name} 학생 기록의 저장을 확인하지 못했습니다. 다시 시도해 주세요.`)
      return false
    }
  }

  function advance(row: LabRow, field: LabRole) {
    const pending = latestAttendanceEdit(current.current.edits, row.id)
    const value = pending?.value ?? current.current.snapshot?.records[row.id]?.[field] ?? '미확인'
    void save(row, field, nextAttendance(value))
  }

  async function markAll(value: '출석' | '미확인') {
    setSaveError('')
    setBulkMessage('')
    try {
      await send({ value }, async () => {
        const updated = await attendanceRequest<{ students: string[]; field: LabRole; value: AttendanceStatus }>(token, `record?${selection}`, {
          method: 'POST', body: JSON.stringify({ field: role, bulkValue: value }),
        }, executiveToken)
        lastSaveAt.current = performance.now()
        setBulkMessage(`${updated.students.length}명 ${statusText(value)} 저장 완료`)
        return previous => ({ ...previous, records: {
          ...previous.records,
          ...Object.fromEntries(updated.students.map(id => [id, { ...previous.records[id], [updated.field]: updated.value }])),
        } })
      })
    } catch {
      setSaveError(`전체 ${statusText(value)} 저장을 확인하지 못했습니다. 다시 시도해 주세요.`)
    }
  }

  const rows = board?.rows ?? []
  const pendingFor = (row: LabRow, field: LabRole) => field === role && row.exception !== '수업 없음' ? latestAttendanceEdit(edits, row.id) : undefined
  const statusOf = (row: LabRow, field: LabRole) => pendingFor(row, field)?.value ?? board?.records[row.id]?.[field] ?? '미확인'
  const needsComparison = (row: LabRow) => Boolean(row.lesson && statusOf(row, 'homeroom') !== '미확인' && statusOf(row, 'subject') !== '미확인' && statusOf(row, 'homeroom') !== statusOf(row, 'subject'))
  const checked = rows.filter(row => statusOf(row, role) !== '미확인').length
  return <section className="lab-board" aria-label="학생 출결 기록">
    <header className="lab-board-header">
      <div><h2>학생 출결 <span>{board ? `${rows.length}명` : ''}</span></h2>
        <p>{readOnly ? '교장·교감 전체 조회 · 읽기 전용' : role === 'homeroom' ? '담임 출결과 오늘 비고를 입력합니다.' : '담임 기록을 참고해 교과 출결을 입력합니다.'}</p></div>
      {board && <div className="lab-counts">
        {!IS_ATTENDANCE_PREVIEW && !readOnly && rows.some(row => row.exception !== '수업 없음') && (
          <>
            <button type="button" className="lab-bulk-present" onClick={() => void markAll('출석')}><ClipboardCheck size={16} aria-hidden="true" />전체 출석</button>
            <button type="button" className="lab-refresh" onClick={() => void markAll('미확인')}>전체 미입력</button>
          </>
        )}
        <span>확인 <b>{checked}</b> / {rows.length}</span><span className="mismatch">기록 다름 <b>{rows.filter(needsComparison).length}</b></span>
        {!IS_ATTENDANCE_PREVIEW && <button type="button" className="lab-refresh" onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} /> 새로고침</button>}
      </div>}
    </header>
    {!readOnly && <div className="lab-attendance-help" id="lab-attendance-help">
      <strong>출결 입력 방법</strong>
      <span>미입력에서 <b>1번 누르면 출석</b>, <b>2번 누르면 결석</b>입니다. 한 번 더 누르면 미입력으로 돌아갑니다.</span>
      {role === 'homeroom' && <span>지각·결과·결석 비고는 버튼을 누르면 바로 저장됩니다.</span>}
    </div>}
    {err && <div className="lab-notice" role="alert">{err} <button type="button" onClick={() => { setErr(''); setRetry(x => x + 1) }}><RefreshCw size={14} /> 다시 연결</button></div>}
    {saveError && <p className="lab-notice" role="alert">{saveError}</p>}
    {(edits.length > 0 || bulkMessage) && <p className="lab-bulk-message" role="status">{edits.length ? `출결 ${edits.length}건 저장 중` : bulkMessage}</p>}
    {!board && !err && <p className="lab-empty" role="status">학생 명단과 출결을 불러오는 중입니다.</p>}
    {board && !rows.length && <p className="lab-empty">표시할 학생이 없습니다.</p>}
    {!!rows.length && <div className="lab-table" role="table" aria-label="교시별 출결 비교">
      <div className="lab-column-head lab-row" role="row">
        <span role="columnheader">학생</span><span role="columnheader">수업 · 담당 교사</span>
        <span role="columnheader">담임 출결</span><span role="columnheader">교과 출결</span><span role="columnheader">오늘 비고</span>
      </div>
      {rows.map(row => {
        const record: LabRecord = board?.records[row.id] ?? {}
        return <div className="lab-row lab-student" role="row" key={row.id}>
          <div className="lab-identity" role="cell"><small>{row.classId.replace('-', '학년 ')}반 · {row.number}번</small><strong>{row.name}</strong>
            {needsComparison(row) && <span className="lab-badge mismatch">기록 다름</span>}</div>
          <div className="lab-course" role="cell">{row.lesson ? <Lesson lesson={row.lesson} /> : <span className="lab-badge neutral">{row.exception}</span>}</div>
          {(['homeroom', 'subject'] as const).map(field => <AttendanceCell key={field} row={row} field={field} value={statusOf(row, field)} editable={!readOnly && role === field}
            available={row.exception !== '수업 없음'} busy={Boolean(pendingFor(row, field))} onAdvance={() => advance(row, field)} />)}
          <Note row={row} value={record.note} editable={!readOnly && role === 'homeroom'} available={Boolean(board)} save={value => save(row, 'note', value)} />
        </div>
      })}
    </div>}
  </section>
}

type DaySlot = Pick<LabRow, 'lesson' | 'exception'> & Pick<LabRecord, 'homeroom' | 'subject'>
type DayStudent = Omit<LabRow, 'lesson' | 'exception'> & { periods: Record<number, DaySlot>; note?: string }
type DaySnapshot = { students: DayStudent[] }
type DayUpdates = { period: number; students: string[] }[]

function hasDayLesson(slot: DaySlot | undefined): slot is DaySlot {
  return Boolean(slot && slot.exception !== '수업 없음')
}

export function DayBoard({ token, selection, readOnly, executiveToken }: { token: string; selection: string; readOnly: boolean; executiveToken: string }) {
  const { snapshot, edits, current, updateSnapshot, send } = useAttendanceDraft<DaySnapshot>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const [retry, setRetry] = useState(0)
  const [bulkFailures, setBulkFailures] = useState<ReadonlySet<string>>(() => new Set())
  const lastSaveAt = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void listenAttendance(token, selection, controller.signal, (event, value) => {
      if (event !== 'board') return
      const next = value as DaySnapshot & { requestedAt: number }
      if (next.requestedAt >= lastSaveAt.current) updateSnapshot(() => next)
    }, executiveToken).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '하루 출결을 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [token, selection, retry, executiveToken, updateSnapshot])

  function requestPeriod(student: string, period: number, field: 'homeroom' | 'note', value: string) {
    const query = new URLSearchParams(selection)
    query.delete('allPeriods')
    query.set('period', String(period))
    return attendanceRequest<LabChange>(token, `record?${query}`, {
      method: 'POST', body: JSON.stringify({ student, field, value }),
    }, executiveToken)
  }

  async function saveNote(student: DayStudent, value: string) {
    setSaveError('')
    try {
      await send(undefined, async () => {
        const updated = await requestPeriod(student.id, 1, 'note', value)
        lastSaveAt.current = performance.now()
        return previous => ({ students: previous.students.map(item => item.id === student.id ? { ...item, note: updated.value } : item) })
      })
      return true
    } catch {
      setSaveError(`${student.name} 학생 비고의 저장을 확인하지 못했습니다.`)
      return false
    }
  }

  async function saveAttendance(edit: AttendanceEdit, student?: DayStudent) {
    const target = student?.id ?? 'class'
    if (edit.period === undefined) setBulkFailures(failures => new Set([...failures].filter(id => id !== target)))
    setNotice('')
    setSaveError('')
    try {
      await send(edit, async () => {
        let updates: DayUpdates
        if (edit.period !== undefined && edit.student) {
          const saved = await requestPeriod(edit.student, edit.period, 'homeroom', edit.value)
          updates = [{ period: edit.period, students: [saved.student] }]
        } else {
          const saved = await attendanceRequest<{ updates: DayUpdates }>(token, `record?${selection}`, {
            method: 'POST', body: JSON.stringify({ field: 'homeroom', student: edit.student, bulkValue: edit.value }),
          }, executiveToken)
          updates = saved.updates
        }
        lastSaveAt.current = performance.now()
        const updatedByPeriod = new Map(updates.map(item => [item.period, new Set(item.students)]))
        const students = new Set(updates.flatMap(item => item.students))
        if (edit.period === undefined) {
          setBulkFailures(failures => new Set([...failures].filter(id => id !== target && !students.has(id))))
          setNotice(student ? `${student.name} 학생 ${updates.length}개 교시 ${statusText(edit.value)} 저장 완료` : `${students.size}명 ${statusText(edit.value)} 저장 완료`)
        }
        return previous => ({ students: previous.students.map(item => {
          if (!students.has(item.id)) return item
          const slots = { ...item.periods }
          periods.forEach(period => {
            if (hasDayLesson(slots[period]) && updatedByPeriod.get(period)?.has(item.id)) slots[period] = { ...slots[period], homeroom: edit.value }
          })
          return { ...item, periods: slots }
        }) })
      })
    } catch {
      if (edit.period === undefined) setBulkFailures(failures => new Set([...failures, target]))
      else setSaveError(`${student?.name ?? '선택한'} 학생 ${edit.period}교시 저장을 확인하지 못했습니다.`)
    }
  }

  function advance(student: DayStudent, period: number) {
    const slot = current.current.snapshot?.students.find(item => item.id === student.id)?.periods[period]
    if (!hasDayLesson(slot)) return
    const pending = latestAttendanceEdit(current.current.edits, student.id, period)
    void saveAttendance({ student: student.id, period, value: nextAttendance(pending?.value ?? slot.homeroom ?? '미확인') }, student)
  }

  const students = snapshot?.students ?? []
  const activePeriods = periods.filter(period => students.some(student => hasDayLesson(student.periods[period])))
  const gridStyle = {
    '--lab-day-period-count': Math.max(1, activePeriods.length),
    '--lab-day-mobile-period-count': Math.max(1, Math.min(4, activePeriods.length)),
  } as CSSProperties
  const classSaving = edits.some(edit => edit.student === undefined)
  const saveStatus = edits.length ? `출결 ${edits.length}건 저장 중` : notice
  return <section className="lab-board lab-day" aria-label="담임 하루 출결" style={gridStyle}>
    <header className="lab-board-header">
      <div><h2>하루 출결 <span>{snapshot ? `${students.length}명` : ''}</span></h2>
        <p>{readOnly ? '교장·교감 전체 조회 · 읽기 전용' : '수업 아래에서 담임 출결을 입력하고 교과 기록을 함께 확인합니다.'}</p></div>
      {snapshot && <div className="lab-counts">
        {!readOnly && activePeriods.length > 0 && <>
          <button type="button" className="lab-bulk-present" aria-busy={classSaving} onClick={() => void saveAttendance({ value: '출석' })}>
            <ClipboardCheck size={16} aria-hidden="true" />학급 전체 출석
          </button>
          <button type="button" className="lab-refresh" aria-busy={classSaving} onClick={() => void saveAttendance({ value: '미확인' })}>학급 전체 미입력</button>
        </>}
        <button type="button" className="lab-refresh" onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} /> 새로고침</button>
      </div>}
    </header>
    {!readOnly && <div className="lab-attendance-help" id="lab-attendance-help"><strong>출결 입력 방법</strong><span>한 번 <b>출석</b> · 두 번 <b>결석</b> · 세 번 <b>미입력</b>입니다.</span></div>}
    {error && <div className="lab-notice" role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>다시 시도</button></div>}
    {saveError && <p className="lab-notice" role="alert">{saveError}</p>}
    {bulkFailures.has('class') && <p className="lab-notice" role="alert">학급 전체 출결 저장을 확인하지 못했습니다.</p>}
    {snapshot && !readOnly && <p className="lab-bulk-message lab-day-save-status" role="status">{saveStatus}</p>}
    {!snapshot && !error && <p className="lab-empty" role="status">학급의 하루 출결을 불러오는 중입니다.</p>}
    {snapshot && !students.length && <p className="lab-empty">표시할 학생이 없습니다.</p>}
    {students.length > 0 && !activePeriods.length && <p className="lab-empty">오늘은 이 학급의 수업이 없습니다.</p>}
    {students.map(student => {
      const failed = bulkFailures.has(student.id)
      return <article className="lab-day-student" key={student.id} aria-label={`${student.name} 학생 하루 출결`}>
        <div className="lab-day-identity"><small>{student.number}번</small><strong>{student.name}</strong>
          {!readOnly && activePeriods.some(period => hasDayLesson(student.periods[period])) && <div className="lab-day-actions">
            {(['출석', '결석', '미확인'] as const).map(value => <button type="button" key={value} className={`lab-refresh${value === '결석' ? ' lab-day-absent' : ''}`}
              aria-label={`${student.name} 학생 전체 ${statusText(value)}`} onClick={() => void saveAttendance({ student: student.id, value }, student)}>전체 {statusText(value)}</button>)}
          </div>}
          {failed && <small className="lab-day-save-error" role="alert">저장 확인 필요</small>}
        </div>
        {activePeriods.map(period => {
          const slot = student.periods[period]
          if (!hasDayLesson(slot)) return <div key={period} aria-hidden="true" />
          const row = { ...student, ...slot }
          const pending = latestAttendanceEdit(edits, student.id, period)
          return <div className="lab-day-slot" key={period} aria-label={`${period}교시`}>
            <strong className="lab-day-period">{period}교시</strong>
            {slot.lesson ? <Lesson lesson={slot.lesson} /> : <span className="lab-day-exception">{slot.exception}</span>}
            <div className="lab-day-check">
              <AttendanceCell row={row} field="homeroom" period={period} value={pending?.value ?? slot.homeroom ?? '미확인'} editable={!readOnly} available={Boolean(snapshot)}
                busy={Boolean(pending)} onAdvance={() => advance(student, period)} />
              {slot.lesson && <span className="lab-day-subject">교과 <b className={`lab-state ${tones[slot.subject ?? '미확인']}`}>{statusText(slot.subject ?? '미확인')}</b></span>}
            </div>
          </div>
        })}
        <div className="lab-day-note"><span>오늘 비고</span><Note row={student} value={student.note} editable={!readOnly} available={Boolean(snapshot)} save={value => saveNote(student, value)} /></div>
      </article>
    })}
  </section>
}

function Attendance({ token }: { token: string }) {
  const [requestedRole, setRole] = useState<LabRole | null>(null)
  const [access, setAccess] = useState<LabAccess | null>(null)
  const [executiveToken, setExecutiveToken] = useState('')
  const [executiveExpiresAt, setExecutiveExpiresAt] = useState('')
  const [executivePassword, setExecutivePassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [dates, setDates] = useState<string[]>([])
  const [date, setDate] = useState('')
  const [period, setPeriod] = useState(2)
  const [grade, setGrade] = useState('')
  const [classId, setClassId] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; options: LabOptions } | null>(null)
  const optionsKey = `${date}/${period}`
  const options = loaded?.key === optionsKey ? loaded.options : null
  const role = requestedRole && access?.roles.includes(requestedRole) ? requestedRole : access?.roles[0]
  const canLoadOptions = Boolean(access?.roles.length)
  const classes = options?.classes.filter(item => !grade || item.id.startsWith(grade + '-')) ?? []
  const lessons = options?.lessons.filter(lesson => !grade || (lesson.grade ?? '3') === grade) ?? []
  const selectedClass = classes.find(item => item.id === classId) ?? classes[0]
  const course = lessons.find(lesson => lesson.id === lessonId) ?? lessons[0]
  const group = role === 'homeroom' ? selectedClass?.id : course?.id

  useEffect(() => {
    const controller = new AbortController()
    setAccess(null)
    attendanceRequest<{ dates: string[]; access: LabAccess }>(token, 'dates', { signal: controller.signal }, executiveToken).then(result => {
      setDates(result.dates)
      setDate(result.dates[1] ?? result.dates[0] ?? '')
      setAccess(result.access)
      setError('')
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '출결 날짜를 불러오지 못했습니다.') })
    return () => controller.abort()
  }, [token, executiveToken, retry])

  useEffect(() => {
    if (!executiveExpiresAt) return
    const timer = window.setTimeout(() => setExecutiveToken(''), Math.max(0, Date.parse(executiveExpiresAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [executiveExpiresAt])

  useEffect(() => {
    if (!date || !canLoadOptions) return
    const controller = new AbortController()
    setError('')
    const query = new URLSearchParams({ date, period: String(period) })
    attendanceRequest<LabOptions>(token, `options?${query}`, { signal: controller.signal }, executiveToken).then(result => {
      setLoaded({ key: optionsKey, options: result })
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '수업을 불러오지 못했습니다.') })
    return () => controller.abort()
  }, [token, date, period, optionsKey, retry, canLoadOptions, executiveToken])

  async function unlockExecutive(event: FormEvent) {
    event.preventDefault()
    if (!executivePassword || unlocking) return
    setUnlocking(true)
    setError('')
    try {
      const grant = await attendanceRequest<{ accessToken: string; expiresAt: string }>(token, 'leadership', {
        body: JSON.stringify({ password: executivePassword }), method: 'POST',
      })
      setExecutiveToken(grant.accessToken)
      setExecutiveExpiresAt(grant.expiresAt)
      setExecutivePassword('')
    } catch (error) {
      setError(error instanceof Error ? error.message : '보호 메뉴 인증을 확인해 주세요.')
    } finally { setUnlocking(false) }
  }

  if (access?.requiresExecutive && token !== 'desktop') return <form className="lab-protected" onSubmit={unlockExecutive}>
    <h2>교장·교감 전체 조회</h2>
    <label>보호 메뉴 비밀번호 <input type="password" autoComplete="current-password" value={executivePassword} onChange={event => setExecutivePassword(event.target.value)} /></label>
    <button type="submit" disabled={!executivePassword || unlocking}>{unlocking ? '확인 중' : '확인'}</button>
    {error && <p role="alert">{error}</p>}
  </form>
  if (!role) return <div className="lab-empty" role="status">
    {error || (access ? (access.requiresExecutive ? '업무도우미에서 보호 메뉴 인증을 완료해 주세요.' : '배정된 학급이나 수업이 없습니다.') : '로그인과 출결 권한을 확인하는 중입니다.')}
    {error && <button type="button" onClick={() => { setError(''); setRetry(value => value + 1) }}>다시 확인</button>}
  </div>
  const daily = !IS_ATTENDANCE_PREVIEW && role === 'homeroom'
  const selection = new URLSearchParams({ date, period: String(period), role, group: group ?? '' })
  if (daily) selection.set('allPeriods', 'true')
  const boardQuery = selection.toString()
  return <>
    <div className="lab-roles" role="group" aria-label="교사 확인창">
      {access?.roles.includes('homeroom') && <button type="button" aria-pressed={role === 'homeroom'} onClick={() => setRole('homeroom')}><UsersRound size={18} />담임 교사 확인창</button>}
      {access?.roles.includes('subject') && <button type="button" aria-pressed={role === 'subject'} onClick={() => setRole('subject')}><GraduationCap size={19} />교과 교사 확인창</button>}
    </div>
    <section className={IS_ATTENDANCE_PREVIEW ? 'lab-filters' : `lab-filters lab-filters-all-grades${daily ? ' lab-filters-day' : ''}`} aria-label="출결 조회 조건">
      <label className="lab-date"><span><CalendarDays size={15} /> 날짜</span><select value={date} onChange={event => setDate(event.target.value)}>
        {dates.map(day => <option key={day}>{day}</option>)}
      </select></label>
      {!IS_ATTENDANCE_PREVIEW && <label className="lab-grade"><span>학년</span><select value={grade} onChange={event => setGrade(event.target.value)}>
        <option value="">전체 학년</option>
        {attendanceGrades.map(value => <option key={value} value={value}>{value}학년</option>)}
      </select></label>}
      {!daily && <div className="lab-period"><span>교시</span><div role="group" aria-label="교시">
        {periods.map(p => <button type="button" key={p} aria-label={`${p}교시`} aria-pressed={p === period} onClick={() => setPeriod(p)}>{p}<small>교시</small></button>)}
      </div></div>}
      <label className="lab-group"><span>{role === 'homeroom' ? '학급' : '수업'}</span>
        {role === 'homeroom' ? <select value={selectedClass?.id ?? ''} disabled={classes.length < 2} onChange={event => setClassId(event.target.value)}>
          {classes.length ? classes.map(item => <option value={item.id} key={item.id}>{item.label}</option>) : <option>선택할 학급 없음</option>}
        </select> : <select value={course?.id ?? ''} disabled={!course} onChange={event => setLessonId(event.target.value)}>
          {course ? lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.grade ? lesson.grade + '학년 · ' : ''}{lesson.subject} · {lesson.kind} · {lesson.room}</option>) : <option>선택할 수업 없음</option>}
        </select>}
      </label>
    </section>
    {grade && options?.electiveRosterGrades && !options.electiveRosterGrades.includes(grade) && (
      <p className="lab-notice" role="status">{grade}학년 이동수업 수강 명단이 아직 등록되지 않았습니다.</p>
    )}
    {role === 'subject' && course && <div className="lab-selected-course"><Lesson lesson={course} /></div>}
    {error ? <div className="lab-notice" role="alert">{error} <button type="button" onClick={() => { setError(''); setRetry(value => value + 1) }}><RefreshCw size={14} /> 다시 시도</button></div>
      : options && group && daily ? <DayBoard key={boardQuery} token={token} selection={boardQuery} readOnly={Boolean(access?.readOnly)} executiveToken={executiveToken} />
      : options && group ? <Board key={boardQuery} token={token} selection={boardQuery} role={role} readOnly={Boolean(access?.readOnly)} executiveToken={executiveToken} />
      : <p className="lab-empty" role="status">{options ? (role === 'homeroom' ? '선택한 학년에 담당 학급이 없습니다.' : '선택한 학년과 교시에 담당 수업이 없습니다.') : '출결에 필요한 시간표를 불러오는 중입니다.'}</p>}
  </>
}

function App() {
  const desktop = new URLSearchParams(location.search).get('layout') === 'desktop'
  const [opened, setOpened] = useState(desktop)
  const token = useAttendanceToken(desktop)
  return <main className="lab-shell">
    {!desktop && <a className="lab-back" href="./"><ArrowLeft size={16} /> 모바일 일정</a>}
    <header className="lab-header">
      <div className="lab-brand"><FlaskConical size={17} />{opened ? <button type="button" onClick={() => setOpened(false)}>웅천고 도우미 실험실</button> : <span>웅천고 도우미 실험실</span>}</div>
      <h1>{opened ? '수업 출결' : '실험실'}</h1>
      <p>{opened ? '교시별로 담임과 교과의 출결을 확인합니다.' : IS_ATTENDANCE_PREVIEW ? '개발 중인 기능을 예시 자료로 사용해 볼 수 있습니다.' : '교직원 업무 기능을 확인합니다.'}</p>
      {opened && <span className="lab-demo">{IS_ATTENDANCE_PREVIEW ? '시험용 자료 · 3학년' : '1~3학년 · 오늘 출결'}</span>}
    </header>
    {opened ? token ? <Attendance key={token} token={token} /> : <p className="lab-empty" role="status">
      {token === null ? '로그인 상태를 확인하는 중입니다.' : '업무도우미 또는 모바일 일정에 로그인한 뒤 다시 열어 주세요.'}
    </p> : <section className="lab-feature" aria-labelledby="lab-feature-title">
      <div className="lab-feature-icon"><ClipboardCheck size={25} /></div>
      <div><span className="lab-badge moving">{IS_ATTENDANCE_PREVIEW ? '시험 사용 가능' : '1~3학년'}</span><h2 id="lab-feature-title">수업 출결</h2><p>학급수업과 이동수업의 담임·교과 출결을 교시별로 확인합니다.</p></div>
      <button type="button" onClick={() => setOpened(true)}>수업 출결 열기 <ArrowRight size={17} /></button>
    </section>}
  </main>
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
