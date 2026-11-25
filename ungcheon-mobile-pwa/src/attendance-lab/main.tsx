import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, CalendarDays, ClipboardCheck, FlaskConical, GraduationCap, RefreshCw, UsersRound } from 'lucide-react'
import type {
  AttendanceStatus, LabAccess, LabBoard, LabChange, LabField, LabLesson, LabOptions, LabRecord, LabRole, LabRow,
} from '../../../ungcheon-school-helper/electron/main/attendance-lab-data'
import { attendanceRequest, IS_ATTENDANCE_PREVIEW, listenAttendance, useAttendanceToken } from './connection'
import './styles.css'

const labels = { homeroom: '담임 출결', subject: '교과 출결' }
const tones: Record<AttendanceStatus, string> = { 미확인: 'pending', 출석: 'present', 지각: 'late', 조퇴: 'early', 결석: 'absent' }
const noteOptions = ['지각', '결과', '결석']

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

function AttendanceCell({ row, field, value, editable, available, save }: {
  row: LabRow; field: LabRole; value: AttendanceStatus; editable: boolean; available: boolean; save: (value: AttendanceStatus) => Promise<boolean>
}) {
  const desired = useRef<AttendanceStatus | null>(null)
  const [pending, setPending] = useState<AttendanceStatus | null>(null)
  const displayed = pending ?? value

  async function advance() {
    const inFlight = desired.current !== null
    desired.current = nextAttendance(desired.current ?? value)
    setPending(desired.current)
    if (inFlight) return

    // Keep rapid taps responsive and save the latest choice after any in-flight write.
    let saved: AttendanceStatus | null = null
    while (desired.current !== null && desired.current !== saved) {
      const target: AttendanceStatus = desired.current
      if (!await save(target)) break
      saved = target
    }
    desired.current = null
    setPending(null)
  }

  return <div className="lab-record" role="cell">
    <span className="lab-mobile-label">{labels[field]}</span>
    {field === 'subject' && !row.lesson ? <span className="lab-state unavailable">해당 없음</span> : editable ? (
      <button type="button" aria-label={`${row.name} ${labels[field]} ${statusText(displayed)}`} aria-describedby="lab-attendance-help"
        aria-busy={pending !== null} disabled={!available} className={`lab-state ${tones[displayed]}`} onClick={() => void advance()}>
        {statusText(displayed)} <RefreshCw size={12} aria-hidden="true" />
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

function Board({ token, selection, role, readOnly, executiveToken }: { token: string; selection: string; role: LabRole; readOnly: boolean; executiveToken: string }) {
  const [board, setBoard] = useState<LabBoard | null>(null)
  const [err, setErr] = useState('')
  const [saveError, setSaveError] = useState('')
  const [retry, setRetry] = useState(0)
  const lastSaveAt = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    const fail = (message: string) => {
      if (controller.signal.aborted) return
      setBoard(null)
      setErr(message)
      controller.abort()
    }
    void listenAttendance(token, selection, controller.signal, (event, payload) => {
      if (event === 'board') {
        const { requestedAt, ...snapshot } = payload as LabBoard & { requestedAt?: number }
        if (!requestedAt || requestedAt >= lastSaveAt.current) { setBoard(snapshot); setErr('') }
      }
      if (event === 'change') {
        const { student, field, value } = payload as LabChange
        setBoard(current => current && { ...current, records: { ...current.records, [student]: { ...current.records[student], [field]: value } } })
      }
      if (event === 'session-expired') fail('로그인이 만료되었습니다. 다시 로그인해 주세요.')
      if (event === 'unavailable') fail('출결 자료를 불러오지 못했습니다. 다시 연결해 주세요.')
    }, executiveToken).then(() => fail('Firebase 연결이 끊겼습니다. 다시 연결해 주세요.'))
      .catch(error => fail(error instanceof Error ? error.message : '출결 서버에 연결할 수 없습니다.'))
    return () => controller.abort()
  }, [token, selection, retry, executiveToken])

  async function save(row: LabRow, field: LabField, value: string) {
    setSaveError('')
    try {
      const updated = await attendanceRequest<LabChange>(token, `record?${selection}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student: row.id, field, value }),
        signal: AbortSignal.timeout(10000),
      }, executiveToken)
      if (!IS_ATTENDANCE_PREVIEW) {
        lastSaveAt.current = performance.now()
        setBoard(current => current && { ...current, records: { ...current.records, [updated.student]: { ...current.records[updated.student], [updated.field]: updated.value } } })
      }
      return true
    } catch {
      setSaveError(`${row.name} 학생 기록의 저장을 확인하지 못했습니다. 다시 시도해 주세요.`)
      return false
    }
  }

  const rows = board?.rows ?? []
  const statusOf = (row: LabRow, field: LabRole) => board?.records[row.id]?.[field] ?? '미확인'
  const needsComparison = (row: LabRow) => Boolean(row.lesson && statusOf(row, 'homeroom') !== '미확인' && statusOf(row, 'subject') !== '미확인' && statusOf(row, 'homeroom') !== statusOf(row, 'subject'))
  const checked = rows.filter(row => statusOf(row, role) !== '미확인').length
  return <section className="lab-board" aria-label="학생 출결 기록">
    <header className="lab-board-header">
      <div><h2>학생 출결 <span>{board ? `${rows.length}명` : ''}</span></h2>
        <p>{readOnly ? '교장·교감 전체 조회 · 읽기 전용' : role === 'homeroom' ? '담임 출결과 오늘 비고를 입력합니다.' : '담임 기록을 참고해 교과 출결을 입력합니다.'}</p></div>
      {board && <div className="lab-counts"><span>확인 <b>{checked}</b> / {rows.length}</span><span className="mismatch">기록 다름 <b>{rows.filter(needsComparison).length}</b></span>
        {!IS_ATTENDANCE_PREVIEW && <button type="button" className="lab-refresh" onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} /> 새로고침</button>}
      </div>}
    </header>
    {!readOnly && <div className="lab-attendance-help" id="lab-attendance-help">
      <strong>출결 입력 방법</strong>
      <span>미입력에서 <b>1번 누르면 출석</b>, <b>2번 누르면 결석</b>입니다. 한 번 더 누르면 미입력으로 돌아갑니다.</span>
      {role === 'homeroom' && <span>지각·결과·결석 비고는 버튼을 누르면 바로 저장됩니다.</span>}
    </div>}
    {err && <div className="lab-notice" role="alert">{err} <button type="button" onClick={() => { setErr(''); setBoard(null); setRetry(x => x + 1) }}><RefreshCw size={14} /> 다시 연결</button></div>}
    {saveError && <p className="lab-notice" role="alert">{saveError}</p>}
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
            available={!err && row.exception !== '수업 없음'} save={value => save(row, field, value)} />)}
          <Note row={row} value={record.note} editable={!readOnly && role === 'homeroom'} available={!err} save={value => save(row, 'note', value)} />
        </div>
      })}
    </div>}
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
  const [classId, setClassId] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; options: LabOptions } | null>(null)
  const optionsKey = `${date}/${period}`
  const options = loaded?.key === optionsKey ? loaded.options : null
  const role = requestedRole && access?.roles.includes(requestedRole) ? requestedRole : access?.roles[0]
  const canLoadOptions = Boolean(access?.roles.length)
  const selectedClass = options?.classes.find(item => item.id === classId) ?? options?.classes[0]
  const course = options?.lessons.find(lesson => lesson.id === lessonId) ?? options?.lessons[0]
  const group = role === 'homeroom' ? selectedClass?.id : course?.id

  useEffect(() => {
    const controller = new AbortController()
    setAccess(null)
    attendanceRequest<{ dates: string[]; access: LabAccess }>(token, 'dates', { signal: controller.signal }, executiveToken).then(result => {
      setDates(result.dates)
      setDate(result.dates[1] ?? result.dates[0] ?? '')
      setAccess(result.access)
      setError('')
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '시험 날짜를 불러오지 못했습니다.') })
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
  const selection = new URLSearchParams({ date, period: String(period), role, group: group ?? '' }).toString()
  return <>
    <div className="lab-roles" role="group" aria-label="교사 확인창">
      {access?.roles.includes('homeroom') && <button type="button" aria-pressed={role === 'homeroom'} onClick={() => setRole('homeroom')}><UsersRound size={18} />담임 교사 확인창</button>}
      {access?.roles.includes('subject') && <button type="button" aria-pressed={role === 'subject'} onClick={() => setRole('subject')}><GraduationCap size={19} />교과 교사 확인창</button>}
    </div>
    <section className="lab-filters" aria-label="출결 조회 조건">
      <label className="lab-date"><span><CalendarDays size={15} /> 날짜</span><select value={date} onChange={event => setDate(event.target.value)}>
        {dates.map(day => <option key={day}>{day}</option>)}
      </select></label>
      <div className="lab-period"><span>교시</span><div role="group" aria-label="교시">
        {Array.from({ length: 7 }, (_, i) => i + 1).map(p => <button type="button" key={p} aria-label={`${p}교시`} aria-pressed={p === period} onClick={() => setPeriod(p)}>{p}<small>교시</small></button>)}
      </div></div>
      <label className="lab-group"><span>{role === 'homeroom' ? '학급' : '수업'}</span>
        {role === 'homeroom' ? <select value={selectedClass?.id ?? ''} disabled={!selectedClass || options?.classes.length === 1} onChange={event => setClassId(event.target.value)}>
          {options?.classes.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
        </select> : <select value={course?.id ?? ''} disabled={!course} onChange={event => setLessonId(event.target.value)}>
          {course ? options?.lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.subject} · {lesson.kind} · {lesson.teacher}</option>) : <option>선택할 수업 없음</option>}
        </select>}
      </label>
    </section>
    {role === 'subject' && course && <div className="lab-selected-course"><Lesson lesson={course} /></div>}
    {error ? <div className="lab-notice" role="alert">{error} <button type="button" onClick={() => { setError(''); setRetry(value => value + 1) }}><RefreshCw size={14} /> 다시 시도</button></div>
      : options && group ? <Board key={selection} token={token} selection={selection} role={role} readOnly={Boolean(access?.readOnly)} executiveToken={executiveToken} />
      : <p className="lab-empty" role="status">{options ? '이 교시에 담당 수업이 없습니다.' : '출결에 필요한 시간표를 불러오는 중입니다.'}</p>}
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
      <h1>{opened ? '이동수업 출결' : '실험실'}</h1>
      <p>{opened ? '교시별로 담임과 교과의 출결을 확인합니다.' : IS_ATTENDANCE_PREVIEW ? '개발 중인 기능을 예시 자료로 사용해 볼 수 있습니다.' : '교직원 업무 기능을 확인합니다.'}</p>
      {opened && <span className="lab-demo">{IS_ATTENDANCE_PREVIEW ? '시험용 자료 · 3학년' : '3학년 · 오늘 출결'}</span>}
    </header>
    {opened ? token ? <Attendance key={token} token={token} /> : <p className="lab-empty" role="status">
      {token === null ? '로그인 상태를 확인하는 중입니다.' : '업무도우미 또는 모바일 일정에 로그인한 뒤 다시 열어 주세요.'}
    </p> : <section className="lab-feature" aria-labelledby="lab-feature-title">
      <div className="lab-feature-icon"><ClipboardCheck size={25} /></div>
      <div><span className="lab-badge moving">{IS_ATTENDANCE_PREVIEW ? '시험 사용 가능' : '3학년'}</span><h2 id="lab-feature-title">이동수업 출결</h2><p>담임과 교과교사가 교시별 출결을 직접 체크하고 같은 학생의 기록을 비교합니다.</p></div>
      <button type="button" onClick={() => setOpened(true)}>이동수업 출결 열기 <ArrowRight size={17} /></button>
    </section>}
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
