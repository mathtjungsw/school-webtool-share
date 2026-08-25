import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BriefcaseBusiness, ChevronDown, ChevronUp, Clock3, GripHorizontal, LayoutDashboard, Pin, PinOff, RefreshCw, Settings2, Utensils, X } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useAppStore } from '../../stores/appStore'
import { useAuthStore } from '../../stores/authStore'
import { useNoticeStore } from '../../stores/noticeStore'
import { getSchoolTimetable, listCommitteeState, listStaffChecklists } from '../../services/schoolHub'
import { getSharedNeisSnapshot } from '../../services/sharedNeis'
import { listTimetableChanges } from '../../services/timetableChanges'
import { listPulledLessonsForTeacher } from '../../services/pulledLessons'
import { buildCompositeTeacherDay } from '../../services/teacherTimetableCalendar'
import { loadPersonalTasks } from '../../services/personalOrganizer'
import { isSharedWorkComplete } from '../../services/sharedWorkNotifications'
import { UNGCHEON_PERIOD_PLAN } from '../../services/ungcheonSchedule'
import { getLocalDailyFortune } from '../../services/localFortune'
import type { CompositeTeacherDay } from '../../services/teacherTimetableCalendar'

export type WidgetPreset = 'glass-light' | 'solid-light' | 'dark-glass' | 'school-yellow' | 'minimal'
export interface WidgetSettings {
  expanded: boolean
  pinned: boolean
  opacity: number
  preset: WidgetPreset
  showFortune: boolean
  showMeal: boolean
  dense: boolean
  x?: number
  y?: number
}

interface WidgetEvent { title: string; meta: string; kind: string }
const PRESETS: Array<{ id: WidgetPreset; label: string }> = [
  { id: 'glass-light', label: '유리 밝은색' }, { id: 'solid-light', label: '불투명 흰색' },
  { id: 'dark-glass', label: '위젯 어두운색' }, { id: 'school-yellow', label: '학교 노랑' }, { id: 'minimal', label: '최소형' },
]

function ymd(date = new Date()) { return format(date, 'yyyy-MM-dd') }
function compactDate(value: string) { return value.replaceAll('-', '') }
function minuteOfDay(date: Date) { return date.getHours() * 60 + date.getMinutes() }
function periodState(index: number, now: Date) {
  const period = UNGCHEON_PERIOD_PLAN[index]
  const [sh, sm] = period.start.split(':').map(Number)
  const [eh, em] = period.end.split(':').map(Number)
  const current = minuteOfDay(now)
  const start = sh * 60 + sm
  const end = eh * 60 + em
  if (current >= start && current <= end) return 'current'
  const next = UNGCHEON_PERIOD_PLAN.findIndex(item => {
    const [h, m] = item.start.split(':').map(Number)
    return h * 60 + m > current
  })
  if (next === index) return 'next'
  return current > end ? 'past' : 'future'
}
function nextCountdown(now: Date) {
  const current = minuteOfDay(now)
  const next = UNGCHEON_PERIOD_PLAN.find(item => {
    const [h, m] = item.start.split(':').map(Number)
    return h * 60 + m > current
  })
  if (!next) return ''
  const [h, m] = next.start.split(':').map(Number)
  return `${Math.max(0, h * 60 + m - current)}분 뒤`
}

export default function WidgetApp() {
  const loadConfig = useAppStore(state => state.loadConfig)
  const config = useAppStore(state => state.config)
  const auth = useAuthStore()
  const notices = useNoticeStore(state => state.notices)
  const lastReadId = useNoticeStore(state => state.lastReadId)
  const fetchNotices = useNoticeStore(state => state.fetchNotices)
  const [settings, setSettings] = useState<WidgetSettings>({ expanded: true, pinned: true, opacity: .96, preset: 'glass-light', showFortune: true, showMeal: true, dense: true })
  const shellRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(new Date())
  const [day, setDay] = useState<CompositeTeacherDay | null>(null)
  const [events, setEvents] = useState<WidgetEvent[]>([])
  const [meal, setMeal] = useState<string[]>([])
  const [taskCount, setTaskCount] = useState(0)
  const [pendingChanges, setPendingChanges] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [autoLaunch, setAutoLaunch] = useState(true)
  const [firstRunNotice, setFirstRunNotice] = useState(false)
  const today = ymd(now)

  const applySettings = useCallback(async (patch: Partial<WidgetSettings>) => {
    const next = await window.electron.widgetUpdateSettings(patch)
    setSettings(next)
  }, [])

  const refresh = useCallback(async (force = false) => {
    if (!auth.authenticated || !auth.teacherName) return
    setSyncing(true)
    try {
      const teacher = auth.teacherName
      const [timetable, changes, snapshot, personal, sharedTasks, committee] = await Promise.all([
        getSchoolTimetable(force), listTimetableChanges(teacher, today, today, false, force), getSharedNeisSnapshot(force),
        loadPersonalTasks(), listStaffChecklists(teacher, '', force), listCommitteeState(force),
      ])
      if (timetable) setDay(buildCompositeTeacherDay(timetable, teacher, today, changes, listPulledLessonsForTeacher(teacher, today, today)))
      setPendingChanges(changes.filter(change => change.status === 'pending' && change.targetTeacherName === teacher).length)
      setMeal(snapshot?.meals.find(item => item.date === compactDate(today))?.dishNames ?? [])
      setTaskCount(personal.filter(task => !task.completed).length + sharedTasks.filter(task => task.targetNames.includes(teacher) && !isSharedWorkComplete(task, teacher)).length)
      const eventRows: WidgetEvent[] = [
        ...personal.filter(task => task.date === today && task.showOnCalendar !== false).map(task => ({ title: task.title, meta: task.time ?? (task.kind === 'task' ? '개인 업무' : '개인 일정'), kind: 'personal' })),
        ...(snapshot?.schedules ?? []).filter(item => item.date === compactDate(today)).map(item => ({ title: item.eventName, meta: '학사일정', kind: 'school' })),
        ...committee.events.filter(item => item.date === today && item.memberNames.includes(teacher)).map(item => ({ title: item.title || item.committeeName, meta: `${item.startTime}${item.location ? ` · ${item.location}` : ''}`, kind: 'committee' })),
      ]
      const [weekly, duty, creative] = await Promise.allSettled([
        window.electron.weeklyPlanGetMonth(now.getFullYear(), now.getMonth() + 1),
        window.electron.dutyScheduleGetMonth(now.getFullYear(), now.getMonth() + 1, teacher),
        window.electron.creativeScheduleGetMonth(now.getFullYear(), now.getMonth() + 1),
      ])
      if (weekly.status === 'fulfilled') weekly.value.events.filter(item => item.date === today).forEach(item => eventRows.push({ title: item.eventName, meta: item.department || '주간계획', kind: 'weekly' }))
      if (duty.status === 'fulfilled') duty.value.events.filter(item => item.date === today).forEach(item => eventRows.push({ title: item.title, meta: `${item.time}${item.location ? ` · ${item.location}` : ''}`, kind: item.kind }))
      if (creative.status === 'fulfilled') creative.value.events.filter(item => item.date === today).forEach(item => eventRows.push({ title: item.title, meta: [item.period, item.grades].filter(Boolean).join(' · '), kind: 'creative' }))
      setEvents(eventRows.slice(0, 8))
      setOffline(false)
    } catch {
      setOffline(true)
    } finally { setSyncing(false) }
  }, [auth.authenticated, auth.teacherName, now, today])

  useEffect(() => {
    void (async () => {
      await loadConfig()
      await auth.bootstrap()
      setSettings(await window.electron.widgetGetSettings())
      setAutoLaunch(await window.electron.getAutoLaunch())
      const noticeSeen = await window.electron.configGet('widget.firstRunNoticeSeen')
      if (noticeSeen !== true) setFirstRunNotice(true)
      void fetchNotices()
    })()
    const clock = window.setInterval(() => setNow(new Date()), 30_000)
    const sync = window.setInterval(() => void refresh(false), 10 * 60_000)
    const offAuth = window.electron.onAuthChanged(() => void auth.bootstrap())
    const offSettings = window.electron.onWidgetSettingsChanged(setSettings)
    return () => { clearInterval(clock); clearInterval(sync); offAuth(); offSettings() }
  }, [])
  useEffect(() => { void refresh(false) }, [auth.authenticated, auth.teacherName, today])
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    let frame = 0
    const fit = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => void window.electron.widgetFitHeight(shell.scrollHeight))
    }
    const observer = new ResizeObserver(fit)
    observer.observe(shell)
    fit()
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [auth.ready, auth.authenticated, settings.expanded, settings.preset, settings.showFortune, settings.showMeal, settings.dense, showSettings, firstRunNotice, events.length, meal.length])

  const fortune = useMemo(() => getLocalDailyFortune(auth.teacherName || config.teacherName || '', today), [auth.teacherName, config.teacherName, today])
  const unread = notices.filter(item => item.id > lastReadId).length + pendingChanges
  const countdown = nextCountdown(now)
  const current = day?.lessons.find((_, index) => periodState(index, now) === 'current')
  const next = day?.lessons.find((_, index) => periodState(index, now) === 'next')

  if (!auth.ready) return <div className="widget-shell widget-loading">위젯 준비 중…</div>
  if (!auth.authenticated) return (
    <div className="widget-shell widget-login">
      <strong>로그인이 필요합니다</strong><span>개인 시간표와 업무는 로그인 후 표시됩니다.</span>
      <button onClick={() => window.electron.widgetOpenMain('dashboard')}>업무도우미에서 로그인</button>
    </div>
  )

  return (
    <div ref={shellRef} style={{ height: 'auto' }} className={`widget-shell preset-${settings.preset} ${settings.expanded ? 'is-expanded' : 'is-collapsed'} ${settings.dense ? 'is-dense' : ''}`}>
      <header className="widget-header drag-region">
        <span className="widget-grip"><GripHorizontal size={16} /></span>
        <div className="widget-identity"><i className={offline ? 'offline' : 'online'} /><b>{auth.teacherName} 선생님</b><small>· {format(now, 'M월 d일(EEE) HH:mm', { locale: ko })}</small></div>
        <nav className="no-drag">
          <button title={settings.pinned ? '항상 위에 표시 해제' : '항상 위에 표시'} onClick={() => applySettings({ pinned: !settings.pinned })}>{settings.pinned ? <Pin size={15} /> : <PinOff size={15} />}</button>
          <button title="설정" onClick={() => setShowSettings(value => !value)}><Settings2 size={15} /></button>
          <button title={settings.expanded ? '접기' : '펼치기'} onClick={() => applySettings({ expanded: !settings.expanded })}>{settings.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
          <button title="위젯 숨기기" onClick={() => window.electron.hideWidget()}><X size={16} /></button>
        </nav>
      </header>

      {showSettings && <section className="widget-settings no-drag">
        <label>디자인<select value={settings.preset} onChange={event => applySettings({ preset: event.target.value as WidgetPreset })}>{PRESETS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>투명도 <input type="range" min="65" max="100" value={Math.round(settings.opacity * 100)} onChange={event => applySettings({ opacity: Number(event.target.value) / 100 })} /></label>
        <label className="check"><input type="checkbox" checked={autoLaunch} onChange={async event => { setAutoLaunch(event.target.checked); await window.electron.setAutoLaunch(event.target.checked) }} /> Windows 시작 시 위젯 자동 실행</label>
        <label className="check"><input type="checkbox" checked={settings.dense} onChange={event => applySettings({ dense: event.target.checked })} /> 촘촘하게 보기</label>
        <label className="check"><input type="checkbox" checked={settings.showMeal} onChange={event => applySettings({ showMeal: event.target.checked })} /> 오늘 급식 표시</label>
        <label className="check"><input type="checkbox" checked={settings.showFortune} onChange={event => applySettings({ showFortune: event.target.checked })} /> 오늘의 운세 표시</label>
      </section>}
      {firstRunNotice && <div className="no-drag flex items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-3 py-2 text-[9px] font-extrabold text-amber-950"><span>PC를 켜면 미니 위젯도 자동으로 시작됩니다.</span><button className="rounded-md border-0 bg-slate-900 px-2 py-1 text-[9px] font-bold text-white" onClick={async () => { await window.electron.configSet('widget.firstRunNoticeSeen', true); setFirstRunNotice(false) }}>확인</button></div>}

      {!settings.expanded ? <section className="widget-compact">
        <div><span>현재</span><b>{current?.value.replace('\n', ' · ') || '수업 없음'}</b></div>
        <div><span>다음 {countdown}</span><b>{next?.value.replace('\n', ' · ') || '일정 없음'}</b></div>
        <div className="compact-counts"><span><BriefcaseBusiness size={13} /> {taskCount}</span><span><Bell size={13} /> {unread}</span></div>
      </section> : <main>
        <section className="widget-section timetable-section">
          <div className="section-title"><span><Clock3 size={15} /> 오늘 시간표</span><button title="새로고침" onClick={() => refresh(true)}><RefreshCw size={14} className={syncing ? 'spin' : ''} /></button></div>
          {day?.rule.label && <div className="day-rule">{day.rule.label}</div>}
          <div className="period-list">
            {(day?.lessons ?? []).slice(0, 7).map((lesson, index) => {
              const state = periodState(index, now)
              return <div key={lesson.period} className={`period-row ${state}`}><span className="period-number">{lesson.period}</span><span className="period-time">{UNGCHEON_PERIOD_PLAN[index].start}</span><b>{lesson.value ? lesson.value.replace('\n', ' · ') : '공강'}</b>{lesson.badge && <em>{lesson.badge}</em>}{state === 'current' && <small>현재</small>}{state === 'next' && <small>{countdown}</small>}</div>
            })}
          </div>
        </section>

        <section className="widget-section events-section"><div className="section-title"><span>오늘 주요 일정</span><button onClick={() => window.electron.widgetOpenMain('calendar')}>전체 보기</button></div>
          {events.length ? <ul>{events.slice(0, 3).map((event, index) => <li key={`${event.title}-${index}`}><i data-kind={event.kind} /><div><b>{event.title}</b><small>{event.meta}</small></div></li>)}{events.length > 3 && <li className="more-events">+{events.length - 3}개 일정 더보기</li>}</ul> : <p className="empty">등록된 주요 일정이 없습니다.</p>}
        </section>

        {settings.showMeal && <section className="widget-section meal-section" title={meal.join(' · ')}><div className="section-title"><span><Utensils size={15} /> 오늘 급식</span></div><p>{meal.length ? meal.join(' · ') : '급식 정보를 준비하고 있습니다.'}</p></section>}
        {settings.showFortune && <section className="widget-section fortune-section"><div className="fortune-heading">오늘의 운세</div><p>{fortune.phrase}</p><div><span className="color-dot" style={{ background: fortune.colorHex }} /> 행운의 색 <b>{fortune.colorName}</b><span className="fortune-number">행운의 숫자 <b>{fortune.luckyNumber}</b></span></div></section>}
        <section className="widget-actions"><button onClick={() => window.electron.widgetOpenMain('staff_tasks')}><BriefcaseBusiness size={15} /><span>미완료 업무</span><b>{taskCount}</b></button><button onClick={() => window.electron.widgetOpenMain('dashboard')}><Bell size={15} /><span>새 알림</span><b>{unread}</b></button><button className="open-main" onClick={() => window.electron.widgetOpenMain('dashboard')}><LayoutDashboard size={15} /> 프로그램 열기</button></section>
      </main>}
    </div>
  )
}
