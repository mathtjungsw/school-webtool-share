'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CloudOff, Download, Eye, EyeOff, Filter, LockKeyhole, LogOut, Moon, RefreshCw, Sun, UserRound, UtensilsCrossed, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { friendlyLoginError, isSessionExpiredError, loadDashboard, markDashboardCached, mergeDashboardWithCache, MobileRequestTimeoutError, SESSION_EXPIRED_MESSAGE, verifyViewer } from './api'
import { deleteUserCache, readUserCache, writeUserCache } from './cache'
import { DAYS, DEFAULT_VISIBILITY, SOURCE_LABELS, buildMobileTimelineRows, collectEvents, eventFingerprint, findTeacher, lessonFocus, newEventFingerprints, parseSlot, rangeForToday, schoolClock, sortMealsByType, timetableForDate, ymd } from './domain'
import type { DashboardPayload, LessonView, MealInfo, MobileEvent, MobileResourceKey, MobileResourceState, MobileResourceStatus, ScheduleSource } from './types'
import { VISUAL_NAME, visualFixture } from './visualFixture'

const SESSION_KEY = 'ungcheon.mobile.session.v1'
const FILTER_KEY = 'ungcheon.mobile.filters.v1'
const THEME_KEY = 'ungcheon.mobile.theme.v1'
const SESSION_MS = 72 * 60 * 60 * 1000
const RESUME_COALESCE_MS = 1_500
type View = 'today' | 'week' | 'next' | 'timetable'
interface MobileSession { name: string; accessToken: string; expiresAt: number }
interface StatusSummary { state: MobileResourceState; checkedAt: string; label: string }
const visualMode = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('visual') === '1'

function readSession() {
  const empty = { session: null as MobileSession | null, notice: '' }
  if (typeof window === 'undefined') return empty
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') as Partial<MobileSession>
    if (value.name && value.accessToken && Number(value.expiresAt) > Date.now()) return { session: { name: value.name, accessToken: value.accessToken, expiresAt: Number(value.expiresAt) }, notice: '' }
    localStorage.removeItem(SESSION_KEY)
    return { ...empty, notice: value.name && value.accessToken ? SESSION_EXPIRED_MESSAGE : '' }
  } catch { return empty }
}

function safeTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

function summarizeStatus(data: DashboardPayload | null, keys: MobileResourceKey[], emptyLabel = '자료 없음'): StatusSummary {
  const statuses = keys.map(key => data?.bundle?.sourceStatus?.[key]).filter(Boolean) as MobileResourceStatus[]
  if (!statuses.length) return { state: data ? 'fresh' : 'unavailable', checkedAt: data?.cachedAt ?? '', label: data ? '최신' : '확인 필요' }
  const checkedAt = statuses.map(status => status.lastSuccessAt || status.lastAttemptAt).filter(Boolean).sort().at(-1) ?? ''
  if (statuses.some(status => status.state === 'unavailable')) return { state: 'unavailable', checkedAt, label: '동기화 필요' }
  if (statuses.some(status => status.state === 'cached')) return { state: 'cached', checkedAt, label: '이전 자료' }
  if (statuses.every(status => status.state === 'empty')) return { state: 'empty', checkedAt, label: emptyLabel }
  return { state: 'fresh', checkedAt, label: '최신' }
}

function StatusBadge({ status }: { status: StatusSummary }) {
  const time = safeTime(status.checkedAt)
  return <span className={`status-badge status-${status.state}`} title={time ? `마지막 정상 확인 ${time}` : status.label}>
    {status.state === 'unavailable' ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
    {status.label}{time && <small>{time}</small>}
  </span>
}

function EventCard({ event, isNew = false }: { event: MobileEvent; isNew?: boolean }) {
  return <article className={`event-card source-${event.source} ${isNew ? 'is-new' : ''}`}>
    <div className="event-dot" aria-hidden="true" />
    <div className="event-copy"><div className="event-meta"><span>{event.label}</span>{event.time && <span>{event.time}</span>}{isNew && <b className="new-badge">NEW</b>}</div><strong>{event.title}</strong></div>
  </article>
}

export function MealPanel({ meals, status, isToday = true }: { meals: MealInfo[]; status?: StatusSummary; isToday?: boolean }) {
  const title = isToday ? '오늘 급식' : '선택한 날의 급식'
  const emptyText = status?.state === 'unavailable'
    ? '급식 자료를 확인하지 못했습니다.'
    : status?.state === 'cached'
      ? `이 기기에 저장된 ${isToday ? '오늘' : '이 날짜의'} 급식 자료가 없습니다.`
      : `${isToday ? '오늘' : '선택한 날짜에'} 공유된 급식 정보가 없습니다.`
  const orderedMeals = sortMealsByType(meals)
  return <section className="panel meal-panel"><div className="panel-title"><div className="panel-icon meal"><UtensilsCrossed size={17} /></div><div><p>{isToday ? 'TODAY MEAL' : 'DAY PREVIEW'}</p><h2>{title}</h2></div>{status ? <StatusBadge status={status} /> : <span>{meals.length ? `${meals.length}식` : '없음'}</span>}</div><div className="meal-list">{orderedMeals.map((meal, index) => <article className="meal-block" key={`${meal.date}-${meal.mealType}-${index}`}><div className="meal-heading"><strong>{meal.mealType || '급식'}</strong>{meal.calories && <span>{meal.calories}</span>}</div><div className="meal-dishes">{meal.dishNames.map((dish, dishIndex) => <span key={`${dish}-${dishIndex}`}>{dish}</span>)}</div></article>)}{!meals.length && <div className="empty">{emptyText}</div>}</div></section>
}

export function DailyTimeline({ lessons, events, teacherFound, isNew = () => false }: {
  lessons: LessonView[]; events: MobileEvent[]; teacherFound: boolean; isNew?: (event: MobileEvent) => boolean
}) {
  if (!teacherFound) return <div className="empty">등록된 교사 시간표를 찾지 못했습니다.</div>
  const rows = buildMobileTimelineRows(lessons, events)
  if (!rows.length) return <div className="empty">표시할 수업이나 시간 지정 일정이 없습니다.</div>
  return <div className="daily-timeline">
    <div className="daily-timeline-head"><strong>수업</strong><strong>시간 지정 일정</strong></div>
    {rows.map(row => {
      const parsed = parseSlot(row.lesson?.value ?? '')
      return <div className={`daily-timeline-row row-${row.kind} ${row.lesson?.changed ? 'changed' : ''}`} key={row.id}>
        <div className="timeline-lesson"><div className="timeline-clock"><b>{row.label}</b><small>{row.start}~{row.end}</small></div>{row.kind === 'period' && <div className="lesson-copy"><strong>{row.lesson?.value ? (parsed.subject || parsed.className) : '공강'}</strong>{row.lesson?.value && parsed.subject && <small>{parsed.className}</small>}{row.lesson?.note && <em>{row.lesson.note}</em>}</div>}</div>
        <div className="timeline-events">{row.events.map(event => <article className={`timeline-event source-${event.source} ${isNew(event) ? 'is-new' : ''}`} key={`${row.id}-${event.id}`}><div><strong>{event.title}</strong><small>{[event.startTime ? `${event.startTime}${event.endTime ? `~${event.endTime}` : ''}` : event.time, event.label].filter(Boolean).join(' · ')}</small></div>{isNew(event) && <b className="new-badge">NEW</b>}</article>)}{!row.events.length && <span className="timeline-empty">—</span>}</div>
      </div>
    })}
  </div>
}

function startMinutes(time: string | undefined) {
  const match = String(time ?? '').match(/^(\d{1,2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function NowNextCard({ lessons, events, minuteOfDay }: { lessons: LessonView[]; events: MobileEvent[]; minuteOfDay: number }) {
  const focus = lessonFocus(lessons, minuteOfDay)
  const current = parseSlot(focus.currentLesson?.value ?? '')
  const next = parseSlot(focus.nextLesson?.value ?? '')
  const upcoming = events.map(event => ({ event, minute: startMinutes(event.time) }))
    .filter(item => item.minute !== null && item.minute >= minuteOfDay - 30)
    .sort((a, b) => Number(a.minute) - Number(b.minute))[0]?.event

  const currentLabel = focus.state === 'during'
    ? `${focus.currentPeriod}교시 · ${focus.currentTime}`
    : focus.state === 'before' ? '수업 시작 전' : focus.state === 'after' ? '오늘 수업 종료' : focus.state === 'none' ? '정규 수업 없음' : '쉬는 시간'
  const currentValue = focus.state === 'during'
    ? (focus.currentLesson?.value ? `${current.subject || current.className}${current.subject ? ` · ${current.className}` : ''}` : '공강')
    : focus.state === 'before' ? '첫 수업을 준비하세요.' : focus.state === 'between' ? '다음 일정을 확인하세요.' : '오늘 일정을 마무리하세요.'

  return <section className="focus-panel" aria-label="지금과 다음 일정">
    <div className="focus-heading">
      <span className="focus-kicker"><Zap size={13} /> NOW</span>
      <div className="focus-current-line"><small>{currentLabel}</small><strong>{currentValue}</strong>{focus.currentLesson?.note && <em>{focus.currentLesson.note}</em>}</div>
      <small className="focus-basis">교시 기준</small>
    </div>
    <div className="focus-grid">
      <article><span>다음 수업</span>{focus.nextLesson ? <><strong>{focus.nextPeriod}교시 · {next.subject || next.className}</strong><small>{next.subject && next.className}{focus.nextStart && ` · ${focus.nextStart} 시작`}{focus.minutesUntil !== undefined && ` · ${focus.minutesUntil}분 후`}</small></> : <strong>남은 수업 없음</strong>}</article>
      <article><span>곧 할 일정</span>{upcoming ? <><strong>{upcoming.title}</strong><small>{[upcoming.time, upcoming.label].filter(Boolean).join(' · ')}</small></> : <strong>시간이 지정된 일정 없음</strong>}</article>
    </div>
  </section>
}

function DateNavigator({ dates, selected, today, onSelect }: { dates: string[]; selected: string; today: string; onSelect: (date: string) => void }) {
  const index = Math.max(0, dates.indexOf(selected))
  const tomorrow = dates[dates.indexOf(today) + 1]
  return <section className="date-navigator" aria-label="날짜 미리보기">
    <button className="date-arrow" aria-label="이전 날짜" disabled={index <= 0} onClick={() => onSelect(dates[index - 1])}><ChevronLeft size={18} /></button>
    <div className="date-strip">{dates.map(date => <button key={date} className={selected === date ? 'selected' : ''} aria-pressed={selected === date} aria-current={date === today ? 'date' : undefined} onClick={() => onSelect(date)}><small>{date === today ? '오늘' : date === tomorrow ? '내일' : format(new Date(`${date}T12:00:00`), 'EEE', { locale: ko })}</small><strong>{format(new Date(`${date}T12:00:00`), 'M.d')}</strong></button>)}</div>
    <button className="date-arrow" aria-label="다음 날짜" disabled={index >= dates.length - 1} onClick={() => onSelect(dates[index + 1])}><ChevronRight size={18} /></button>
  </section>
}

export function Login({ onLogin, notice = '' }: { onLogin: (name: string, password: string) => Promise<string>; notice?: string }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    try { const next = await onLogin(name, password); if (next) setError(next) } finally { setLoading(false) }
  }
  return <main className="login-shell">
    <section className="login-card">
      <div className="school-mark"><img className="school-logo" src="/icon-192.png" alt="웅천고등학교 로고" /></div>
      <p className="eyebrow">UNG CHEON HIGH SCHOOL</p>
      <h1>웅천고<br />모바일 일정</h1>
      <p className="login-lead">오늘 필요한 학교 일정과 내 시간표를 빠르게 확인하세요.</p>
      <div className="security-note"><strong>교직원 확인 안내</strong><p>교직원 명렬에 등록된 이름과 학교 공통 비밀번호를 함께 확인합니다. 공용 기기에서는 사용하지 마세요.</p></div>
      <form onSubmit={submit}>
        <label><span><UserRound size={15} /> 교직원 이름</span><input autoFocus autoComplete="name" maxLength={20} value={name} onChange={event => setName(event.target.value)} placeholder="이름을 직접 입력하세요" /></label>
        <div className="password-field"><label htmlFor="shared-password"><span><LockKeyhole size={15} /> 공통 비밀번호</span></label><div className="password-input-wrap"><input id="shared-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={40} value={password} onChange={event => setPassword(event.target.value)} placeholder="공통 비밀번호를 입력하세요" /><button type="button" className="password-toggle" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보이기'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}<span>{showPassword ? '숨기기' : '보기'}</span></button></div></div>
        {(error || notice) && <p className="form-error" role="alert">{error || notice}</p>}
        <button className="primary-button" disabled={loading || !name.trim() || !password}>{loading ? '로그인 확인 중…' : <>내 일정 확인 <ChevronRight size={18} /></>}</button>
      </form>
      <p className="session-note"><Clock3 size={14} /> 이 기기에서 72시간 로그인 상태가 유지됩니다.</p>
      <a className="guide-link" href="/ungcheon-mobile-install-guide.pdf" target="_blank" rel="noreferrer"><Download size={15} /> 홈 화면 설치 안내서 PDF</a>
    </section>
  </main>
}

export default function App() {
  const initialDate = schoolClock().date
  const [initialAuth] = useState(() => visualMode ? { session: { name: VISUAL_NAME, accessToken: 'visual-test-token', expiresAt: Date.now() + SESSION_MS }, notice: '' } : readSession())
  const [session, setSession] = useState<MobileSession | null>(initialAuth.session)
  const [sessionNotice, setSessionNotice] = useState(initialAuth.notice)
  const [data, setData] = useState<DashboardPayload | null>(() => visualMode ? visualFixture(initialDate) : null)
  const [view, setView] = useState<View>('today')
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [message, setMessage] = useState('')
  const [cacheWarning, setCacheWarning] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [newKeys, setNewKeys] = useState<string[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (typeof window !== 'undefined' && localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'))
  const [visibility, setVisibility] = useState<Record<ScheduleSource, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBILITY
    try { return { ...DEFAULT_VISIBILITY, ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') } } catch { return DEFAULT_VISIBILITY }
  })
  const requestSequence = useRef(0)
  const requestController = useRef<AbortController | null>(null)
  const activeRequest = useRef<string | null>(null)
  const lastRequest = useRef({ key: '', at: 0 })
  const sessionRef = useRef(session)
  sessionRef.current = session
  const dataRef = useRef(data)
  const previousToday = useRef(initialDate)
  const clock = schoolClock(now)
  const today = clock.date
  const range = useMemo(() => rangeForToday(new Date(`${today}T12:00:00`)), [today])
  const previewDates = useMemo(() => [...range.thisWeek, ...range.nextWeek].filter(date => date >= today), [range, today])

  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme) }, [theme])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (previousToday.current !== today) {
      const prior = previousToday.current
      setSelectedDate(current => current === prior || current < today || !previewDates.includes(current) ? today : current)
      previousToday.current = today
    }
  }, [previewDates, today])
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  }, [])

  const clearSession = useCallback((notice = '') => {
    const name = sessionRef.current?.name ?? ''
    ++requestSequence.current
    requestController.current?.abort()
    requestController.current = null
    activeRequest.current = null
    lastRequest.current = { key: '', at: 0 }
    sessionRef.current = null
    dataRef.current = null
    try { localStorage.removeItem(SESSION_KEY) } catch { /* 저장소가 막혀도 화면의 세션은 종료한다. */ }
    setSession(null); setData(null); setNewKeys([]); setLoading(false)
    setMessage(''); setCacheWarning(''); setSessionNotice(notice)
    if (name) void deleteUserCache(name)
  }, [])

  useEffect(() => {
    if (!session || visualMode) return
    const remaining = session.expiresAt - Date.now()
    if (remaining <= 0) { clearSession(SESSION_EXPIRED_MESSAGE); return }
    const timer = window.setTimeout(() => clearSession(SESSION_EXPIRED_MESSAGE), remaining)
    return () => window.clearTimeout(timer)
  }, [clearSession, session])

  useEffect(() => () => {
    ++requestSequence.current
    requestController.current?.abort()
    activeRequest.current = null
  }, [])

  const refresh = useCallback(async (name: string, silent = false) => {
    const currentSession = sessionRef.current
    if (!currentSession || currentSession.name !== name) return
    if (currentSession.expiresAt <= Date.now()) { clearSession(SESSION_EXPIRED_MESSAGE); return }
    const key = `${name}|${currentSession.expiresAt}|${range.from}|${range.to}`
    // pageshow/visibilitychange/online는 같은 요청을 취소하거나 중복 실행하지 않는다.
    if (activeRequest.current === key) return
    if (silent && lastRequest.current.key === key && Date.now() - lastRequest.current.at < RESUME_COALESCE_MS) return
    const sequence = ++requestSequence.current
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    activeRequest.current = key
    lastRequest.current = { key, at: Date.now() }
    setLoading(true)
    // IndexedDB가 느리거나 차단되어도 API 요청은 즉시 시작한다.
    void readUserCache(name).then(cached => {
      if (cached && !dataRef.current && sequence === requestSequence.current && !controller.signal.aborted) {
        const marked = markDashboardCached(cached); dataRef.current = marked; setData(marked)
      }
    }).catch(() => undefined)
    try {
      const fresh = await loadDashboard(name, currentSession.accessToken, range.from, range.to, controller.signal)
      if (sequence !== requestSequence.current) return
      const previous = dataRef.current
      const merged = mergeDashboardWithCache(fresh, previous)
      const additions = newEventFingerprints(previous, merged, name, today)
      if (additions.length) setNewKeys(current => [...new Set([...current, ...additions])])
      setData(merged); dataRef.current = merged
      const partial = Object.values(merged.bundle?.sourceStatus ?? {}).some(status => status.state === 'cached' || status.state === 'unavailable')
      setMessage(partial ? '일부 자료는 마지막 정상 조회 자료를 표시합니다.' : '')
      setOffline(false)
      setCacheWarning('')
      // 캐시 저장 실패는 정상 API 응답을 오프라인/연결 실패로 바꾸지 않는다.
      void writeUserCache(name, merged).catch(() => {
        if (sequence === requestSequence.current) setCacheWarning('최신 자료를 조회했지만 이 기기에 저장하지 못했습니다. 인터넷 연결 중에는 계속 볼 수 있습니다.')
      })
    } catch (error) {
      if (sequence !== requestSequence.current) return
      if (isSessionExpiredError(error)) { clearSession(SESSION_EXPIRED_MESSAGE); return }
      const fallback = dataRef.current
      if (fallback) {
        const marked = markDashboardCached(fallback); setData(marked); dataRef.current = marked
        setMessage('연결이 불안정해 마지막 정상 조회 자료를 표시합니다.')
      } else setMessage(error instanceof MobileRequestTimeoutError ? error.message : '학교 공유 자료를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.')
      setOffline(true)
    } finally {
      if (sequence === requestSequence.current) {
        activeRequest.current = null; requestController.current = null; setLoading(false)
      }
    }
  }, [clearSession, range.from, range.to, today])

  useEffect(() => { if (session && !visualMode) void refresh(session.name) }, [session, refresh])
  useEffect(() => {
    if (!session || visualMode) return
    const updateAndRefresh = () => {
      const resumedAt = new Date()
      setNow(resumedAt)
      // 날짜가 바뀌었다면 새 범위로 렌더된 effect가 한 번만 조회한다.
      if (schoolClock(resumedAt).date === today) void refresh(session.name, true)
    }
    const online = () => { setOffline(false); updateAndRefresh() }
    const offlineHandler = () => setOffline(true)
    const visible = () => { if (document.visibilityState === 'visible') updateAndRefresh() }
    window.addEventListener('online', online); window.addEventListener('offline', offlineHandler); window.addEventListener('pageshow', updateAndRefresh); document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineHandler); window.removeEventListener('pageshow', updateAndRefresh); document.removeEventListener('visibilitychange', visible) }
  }, [refresh, session, today])

  const login = async (rawName: string, password: string) => {
    const name = rawName.trim()
    if (!name) return '이름을 입력해 주세요.'
    try {
      const verified = await verifyViewer(name, password)
      if (!verified.verified || !verified.accessToken) return '이름 또는 공통 비밀번호가 올바르지 않습니다.'
      const expiresAt = Date.parse(verified.expiresAt)
      const next: MobileSession = { name, accessToken: verified.accessToken, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + SESSION_MS }
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(next)) } catch { return '이 브라우저에서 로그인 상태를 저장할 수 없습니다. 저장소 설정을 확인해 주세요.' }
      dataRef.current = null; setData(null); setNewKeys([]); setSessionNotice(''); setCacheWarning('')
      sessionRef.current = next; setSession(next); return ''
    } catch (error) { return friendlyLoginError(error) }
  }
  const logout = () => clearSession()
  const toggleSource = (source: ScheduleSource) => setVisibility(current => {
    const next = { ...current, [source]: !current[source] }; localStorage.setItem(FILTER_KEY, JSON.stringify(next)); return next
  })

  if (!session) return <Login onLogin={login} notice={sessionNotice} />
  const allEvents = data ? collectEvents(data, session.name).filter(event => visibility[event.source]) : []
  const selectedEvents = allEvents.filter(event => event.date === selectedDate)
  const sharedMeals = data?.bundle?.meals ?? data?.bundle?.todayMeals ?? []
  const selectedMeals = sharedMeals.filter(meal => meal.date === selectedDate)
  const teacher = data ? findTeacher(data.timetable, session.name) : null
  const selectedLessons = data ? timetableForDate(teacher, selectedDate, data.changes, session.name) : []
  const selectedClassCount = selectedLessons.filter(lesson => Boolean(lesson.value)).length
  const dateSet = view === 'today' ? [selectedDate] : view === 'week' ? range.thisWeek : range.nextWeek
  const heading = view === 'today' ? format(new Date(`${selectedDate}T12:00:00`), 'M월 d일 EEEE', { locale: ko }) : view === 'week' ? '이번 주 일정' : view === 'next' ? '다음 주 일정' : '주간 교사 시간표'
  const timetableStatus = summarizeStatus(data, ['timetable'])
  const scheduleStatus = summarizeStatus(data, ['weekly', 'creative', 'gateDuty', 'mealDuty', 'committee', 'changes'])
  const mealStatus = summarizeStatus(data, ['meals'], '자료 없음')
  const weeklyPeriodCount = data ? Math.max(7, ...range.thisWeek.slice(0, 5).map(date => timetableForDate(teacher, date, data.changes, session.name).length)) : 7
  const isNew = (event: MobileEvent) => newKeys.includes(eventFingerprint(event))
  const visibleNewCount = allEvents.filter(isNew).length

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><span><img className="school-logo" src="/icon-192.png" alt="웅천고등학교 로고" /></span><div><p>웅천고등학교</p><strong>모바일 일정</strong></div></div>
      <div className="header-actions"><a href="/ungcheon-mobile-install-guide.pdf" target="_blank" rel="noreferrer" aria-label="홈 화면 설치 안내서"><Download /></a><button aria-label="테마 전환" onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon /> : <Sun />}</button><button aria-label="로그아웃" onClick={logout}><LogOut /></button></div>
    </header>
    <div className="pc-only-note">개인 업무와 개인 일정은 <strong>PC용 웅천고 업무도우미</strong>에서만 확인할 수 있습니다.</div>
    {(offline || message) && <div className="offline-note" aria-live="polite"><CloudOff size={16} /><span>{message || '오프라인 상태입니다. 마지막 조회 자료를 표시합니다.'}</span></div>}
    {cacheWarning && <div className="offline-note" role="status"><AlertTriangle size={16} /><span>{cacheWarning}</span></div>}
    {data && <div className="data-health" aria-label="자료 최신성"><span>자료 상태</span><div><b>시간표</b><StatusBadge status={timetableStatus} /></div><div><b>일정</b><StatusBadge status={scheduleStatus} /></div><div><b>급식</b><StatusBadge status={mealStatus} /></div></div>}
    <nav className="view-tabs" aria-label="일정 범위"><button role="tab" aria-selected={view === 'today'} className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>날짜</button><button role="tab" aria-selected={view === 'timetable'} className={view === 'timetable' ? 'active' : ''} onClick={() => setView('timetable')}>주간 시간표</button><button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>이번 주</button><button role="tab" aria-selected={view === 'next'} className={view === 'next' ? 'active' : ''} onClick={() => setView('next')}>다음 주</button></nav>
    <main className="content">
      <div className="section-heading"><div><p>{view === 'today' ? `${session.name} 선생님` : 'SCHEDULE'}</p><h1>{heading}</h1>{view === 'today' && <div className="today-stats"><span><b>{selectedClassCount}</b> 수업</span><span><b>{selectedEvents.length}</b> 일정</span>{visibleNewCount > 0 && <span className="new-stat"><b>{visibleNewCount}</b> 새 소식</span>}</div>}</div><div className="section-tools"><button className="icon-button" aria-label="일정 종류 설정" aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}><Filter size={18} /></button><button className="icon-button" aria-label="새로고침" onClick={() => refresh(session.name)} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={18} /></button></div></div>
      {filterOpen && <section className="filter-panel"><h2>표시할 일정</h2><div className="filter-grid">{(Object.keys(SOURCE_LABELS) as ScheduleSource[]).map(source => <button key={source} className={visibility[source] ? 'selected' : ''} aria-pressed={visibility[source]} onClick={() => toggleSource(source)}><span>{visibility[source] && <Check size={13} />}</span>{SOURCE_LABELS[source]}</button>)}</div></section>}
      {!data && loading && <div className="loading-card">마지막 일정과 시간표를 확인하고 있습니다…</div>}
      {data && view === 'today' && <>
        <DateNavigator dates={previewDates} selected={selectedDate} today={today} onSelect={setSelectedDate} />
        {selectedDate === today && <NowNextCard lessons={selectedLessons} events={selectedEvents} minuteOfDay={clock.minutes} />}
        <section className="panel timetable-primary"><div className="panel-title"><div className="panel-icon"><Clock3 size={17} /></div><div><p>{selectedDate === today ? 'TODAY' : 'DAY PREVIEW'}</p><h2>{selectedDate === today ? '오늘의 교사 시간표' : '선택한 날의 교사 시간표'}</h2></div><StatusBadge status={timetableStatus} /></div><DailyTimeline lessons={selectedLessons} events={selectedEvents} teacherFound={Boolean(teacher)} isNew={isNew} /></section>
        <section className="panel"><div className="panel-title"><div className="panel-icon secondary"><CalendarDays size={17} /></div><div><p>{selectedDate === today ? 'TODAY' : 'DAY PREVIEW'}</p><h2>{selectedDate === today ? '오늘 일정' : '선택한 날의 일정'}</h2></div><StatusBadge status={scheduleStatus} /></div><div className="event-list">{selectedEvents.map(event => <EventCard key={event.id} event={event} isNew={isNew(event)} />)}{!selectedEvents.length && <div className="empty">표시할 일정이 없습니다.</div>}</div></section>
        <MealPanel meals={selectedMeals} status={mealStatus} isToday={selectedDate === today} />
      </>}
      {data && (view === 'week' || view === 'next') && <div className="day-stack">{dateSet.map(date => {
        const dayEvents = allEvents.filter(event => event.date === date)
        return <section className={`day-panel ${date === today ? 'today' : ''}`} key={date}><div className="day-heading"><strong>{format(new Date(`${date}T12:00:00`), 'M.d')}</strong><span>{format(new Date(`${date}T12:00:00`), 'EEE', { locale: ko })}</span><i>{dayEvents.length}</i></div><div className="event-list">{dayEvents.map(event => <EventCard key={event.id} event={event} isNew={isNew(event)} />)}{!dayEvents.length && <div className="empty compact">일정 없음</div>}</div></section>
      })}</div>}
      {data && view === 'timetable' && <section className="weekly-table"><div className="week-grid header"><span>교시</span>{DAYS.map(day => <strong key={day}>{day}</strong>)}</div>{Array.from({ length: weeklyPeriodCount }, (_, periodIndex) => <div className="week-grid" key={periodIndex}><span>{periodIndex + 1}</span>{range.thisWeek.slice(0, 5).map(date => {
          const lesson = timetableForDate(teacher, date, data.changes, session.name)[periodIndex]
          const parsed = parseSlot(lesson?.value ?? '')
          return <div key={date} className={lesson?.changed ? 'changed' : ''}><strong>{parsed.subject || (lesson?.value ? parsed.className : '—')}</strong>{parsed.subject && <small>{parsed.className}</small>}{lesson?.note && <em>{lesson.note}</em>}</div>
        })}</div>)}</section>}
      {data?.cachedAt && <p className="updated-at">마지막 앱 조회 {format(new Date(data.cachedAt), 'M.d HH:mm')}</p>}
    </main>
  </div>
}
