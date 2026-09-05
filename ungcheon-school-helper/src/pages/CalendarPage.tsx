import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, CirclePlus, Clock3,
  Pencil, RotateCcw, Save, ShieldCheck, Trash2,
} from 'lucide-react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import clsx from 'clsx'
import { useAppStore } from '../stores/appStore'
import { QuickOrganizerModal } from '../components/QuickOrganizerModal'
import { QuickOrganizerTrigger, type QuickOrganizerHint } from '../components/QuickOrganizerTrigger'
import { getSharedNeisSnapshot } from '../services/sharedNeis'
import {
  listCommitteeState, listStaffChecklists, subscribeHubResource, type CommitteeEvent, type CommitteeState,
} from '../services/schoolHub'
import type { StaffChecklist } from '../services/rosterAttendance'
import {
  createPersonalTaskId, loadPersonalTasks, savePersonalTasks, sortPersonalTasks,
  subscribePersonalOrganizer, type PersonalTask, type PersonalTaskPriority,
} from '../services/personalOrganizer'
import type { CreativeScheduleResult, DutyScheduleEvent, DutyScheduleResult, ScheduleEvent, WeeklyPlanResult } from '../types'
import { isTimetableChangeAppliedForTeacher, listTimetableChanges, timetableChangeSummary, type TimetableChangeRequest } from '../services/timetableChanges'
import { SPECIAL_TIMETABLE_DAYS } from '../services/specialTimetableDays'
import { listPulledLessonsForTeacher, pulledLessonTitle } from '../services/pulledLessons'
import { isSharedWorkComplete } from '../services/sharedWorkNotifications'

type CalendarSource = 'neis' | 'weekly' | 'creative' | 'schoolEvent' | 'committee' | 'sharedWork' | 'personal' | 'gateDuty' | 'mealDuty' | 'timetableChange' | 'pulledLesson'
type CalendarSourceVisibility = Record<Exclude<CalendarSource, 'neis'>, boolean>

const CALENDAR_SOURCE_VISIBILITY_KEY = 'dashboard.scheduleSources.v1'
const DEFAULT_CALENDAR_SOURCE_VISIBILITY: CalendarSourceVisibility = {
  weekly: true, creative: true, schoolEvent: true, committee: true, sharedWork: true,
  personal: true, gateDuty: true, mealDuty: true, timetableChange: true, pulledLesson: true,
}

interface CalendarEvent {
  id: string
  date: string
  title: string
  source: CalendarSource
  label: string
  time?: string
  completed?: boolean
  task?: PersonalTask
}

const EMPTY_WEEKLY_PLAN: WeeklyPlanResult = { events: [], notes: [], sourceSheets: [], fetchedAt: '' }
const EMPTY_DUTY_SCHEDULE: DutyScheduleResult = { events: [], sources: [], fetchedAt: '' }
const EMPTY_CREATIVE_SCHEDULE: CreativeScheduleResult = { events: [], sourceSheets: [], sourceUrl: '', fetchedAt: '' }
const CALENDAR_SESSION_CACHE_PREFIX = 'ungcheon.calendar.session.v1'
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const
const SOURCE_STYLE: Record<CalendarSource, string> = {
  neis: 'border-violet-400 bg-violet-500/15 text-violet-200',
  weekly: 'border-sky-400 bg-sky-500/15 text-sky-200',
  creative: 'border-teal-400 bg-teal-500/15 text-teal-200',
  schoolEvent: 'border-indigo-400 bg-indigo-500/15 text-indigo-200',
  committee: 'border-amber-400 bg-amber-500/15 text-amber-200',
  sharedWork: 'border-rose-400 bg-rose-500/15 text-rose-200',
  personal: 'border-emerald-400 bg-emerald-500/15 text-emerald-200',
  gateDuty: 'duty-event-text border-cyan-500 bg-cyan-500/15 font-semibold',
  mealDuty: 'duty-event-text border-orange-500 bg-orange-500/15 font-semibold',
  timetableChange: 'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-200 font-semibold',
  pulledLesson: 'border-lime-500 bg-lime-500/15 text-lime-100 font-semibold',
}

function today() { return format(new Date(), 'yyyy-MM-dd') }
function toYmd(date: string) { return date.replace(/-/g, '') }
function fromYmd(date: string) { return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` }

interface CalendarSessionSnapshot {
  schedule: ScheduleEvent[]
  weeklyPlan: WeeklyPlanResult
  committeeEvents: CommitteeEvent[]
  sharedTasks: StaffChecklist[]
  dutyEvents: DutyScheduleEvent[]
  savedAt: string
}

function calendarSessionCacheKey(input: {
  monthKey: string
  officeCode?: string
  schoolCode?: string
  teacherName?: string
  schoolHubUrl?: string
}) {
  return [
    CALENDAR_SESSION_CACHE_PREFIX,
    input.monthKey,
    input.officeCode ?? '',
    input.schoolCode ?? '',
    input.teacherName?.trim() ?? '',
    input.schoolHubUrl ?? '',
  ].join('|')
}

function readCalendarSessionSnapshot(key: string): CalendarSessionSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CalendarSessionSnapshot>
    if (!Array.isArray(parsed.schedule) || !Array.isArray(parsed.committeeEvents) || !Array.isArray(parsed.sharedTasks)) return null
    return {
      schedule: parsed.schedule,
      weeklyPlan: parsed.weeklyPlan ?? EMPTY_WEEKLY_PLAN,
      committeeEvents: parsed.committeeEvents,
      sharedTasks: parsed.sharedTasks,
      dutyEvents: Array.isArray(parsed.dutyEvents) ? parsed.dutyEvents : [],
      savedAt: parsed.savedAt ?? '',
    }
  } catch {
    return null
  }
}

function writeCalendarSessionSnapshot(key: string, snapshot: Omit<CalendarSessionSnapshot, 'savedAt'>) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }))
  } catch {
    // 세션 저장 공간을 사용할 수 없어도 온라인 일정 조회는 계속 동작한다.
  }
}

interface TaskDraft {
  id?: string
  title: string
  date: string
  time: string
  endTime: string
  priority: PersonalTaskPriority
  memo: string
}

function emptyDraft(date: string): TaskDraft {
  return { title: '', date, time: '', endTime: '', priority: 'normal', memo: '' }
}

export default function CalendarPage() {
  const config = useAppStore(state => state.config)
  const saveConfig = useAppStore(state => state.saveConfig)
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(today())
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([])
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanResult>(EMPTY_WEEKLY_PLAN)
  const [committeeEvents, setCommitteeEvents] = useState<CommitteeEvent[]>([])
  const [sharedTasks, setSharedTasks] = useState<StaffChecklist[]>([])
  const [dutySchedule, setDutySchedule] = useState<DutyScheduleResult>(EMPTY_DUTY_SCHEDULE)
  const [creativeSchedule, setCreativeSchedule] = useState<CreativeScheduleResult>(EMPTY_CREATIVE_SCHEDULE)
  const [timetableChanges, setTimetableChanges] = useState<TimetableChangeRequest[]>([])
  const [dutyError, setDutyError] = useState('')
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft(today()))
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [hideCompleted, setHideCompleted] = useState(false)
  const [neisSnapshotAvailable, setNeisSnapshotAvailable] = useState<boolean | null>(null)
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null)
  const [quickAddHint, setQuickAddHint] = useState<QuickOrganizerHint | null>(null)
  const [sourceVisibility, setSourceVisibility] = useState<CalendarSourceVisibility>(DEFAULT_CALENDAR_SOURCE_VISIBILITY)

  const monthKey = format(viewDate, 'yyyy-MM')
  const hasNeis = Boolean(config.schoolHubUrl?.trim())
  const showNeis = config.showNeisSchedule === true

  useEffect(() => {
    void window.electron?.configGet(CALENDAR_SOURCE_VISIBILITY_KEY).then(value => {
      if (value && typeof value === 'object') {
        setSourceVisibility({ ...DEFAULT_CALENDAR_SOURCE_VISIBILITY, ...(value as Partial<CalendarSourceVisibility>) })
      }
    })
  }, [])

  const setSourceVisible = (source: Exclude<CalendarSource, 'neis'>, checked: boolean) => {
    setSourceVisibility(current => {
      const next = { ...current, [source]: checked }
      void window.electron?.configSet(CALENDAR_SOURCE_VISIBILITY_KEY, next)
      window.dispatchEvent(new CustomEvent('calendar:source-visibility-updated', { detail: next }))
      return next
    })
  }

  const loadMonth = useCallback(async (force = false) => {
    const year = Number(format(viewDate, 'yyyy'))
    const month = Number(format(viewDate, 'M'))
    const teacherName = config.teacherName?.trim() ?? ''
    const cacheKey = calendarSessionCacheKey({
      monthKey: format(viewDate, 'yyyy-MM'),
      officeCode: config.officeCode,
      schoolCode: config.schoolCode,
      teacherName,
      schoolHubUrl: config.schoolHubUrl,
    })
    const cached = readCalendarSessionSnapshot(cacheKey)
    if (cached) {
      setSchedule(cached.schedule)
      setWeeklyPlan(cached.weeklyPlan)
      setCommitteeEvents(cached.committeeEvents)
      setSharedTasks(cached.sharedTasks)
      setDutySchedule({ ...EMPTY_DUTY_SCHEDULE, events: cached.dutyEvents })
    }
    setLoading(true)
    setDutyError('')
    try {
      void loadPersonalTasks().then(setTasks)
      let nextSchedule = cached?.schedule ?? []
      let nextWeekly = cached?.weeklyPlan ?? EMPTY_WEEKLY_PLAN
      let nextCommitteeEvents = cached?.committeeEvents ?? []
      let nextSharedTasks = cached?.sharedTasks ?? []
      let nextDutyEvents = cached?.dutyEvents ?? []

      const scheduleRequest = (hasNeis
        ? getSharedNeisSnapshot(force).then(snapshot => {
          setNeisSnapshotAvailable(Boolean(snapshot))
          return (snapshot?.schedules ?? []).filter(item => item.date.startsWith(`${year}${String(month).padStart(2, '0')}`))
        })
        : Promise.resolve([]))
        .then(value => { nextSchedule = value; setSchedule(value) })
        .catch(() => { setNeisSnapshotAvailable(false); if (!cached) setSchedule([]) })
      const weeklyRequest = (window.electron?.weeklyPlanGetMonth
        ? window.electron.weeklyPlanGetMonth(year, month, force)
        : Promise.resolve(EMPTY_WEEKLY_PLAN))
        .then(value => { nextWeekly = value; setWeeklyPlan(value) })
        .catch(() => { if (!cached) setWeeklyPlan(EMPTY_WEEKLY_PLAN) })
      const committeeRequest = (config.schoolHubUrl && teacherName
        ? listCommitteeState(force)
        : Promise.resolve({ assignments: [], events: [] }))
        .then(value => {
          nextCommitteeEvents = value.events.filter(event => event.memberNames.includes(teacherName))
          setCommitteeEvents(nextCommitteeEvents)
        })
        .catch(() => { if (!cached) setCommitteeEvents([]) })
      const sharedWorkRequest = (config.schoolHubUrl && teacherName
        ? listStaffChecklists(teacherName, '', force)
        : Promise.resolve([]))
        .then(value => { nextSharedTasks = value; setSharedTasks(value) })
        .catch(() => { if (!cached) setSharedTasks([]) })
      const dutyRequest = (teacherName && window.electron?.dutyScheduleGetMonth
        ? window.electron.dutyScheduleGetMonth(year, month, teacherName, force)
        : Promise.resolve(EMPTY_DUTY_SCHEDULE))
        .then(value => { nextDutyEvents = value.events; setDutySchedule(value) })
        .catch(() => {
          setDutyError('등교지도·급식지도 일정을 불러오지 못했습니다.')
          if (!cached) setDutySchedule(EMPTY_DUTY_SCHEDULE)
        })

      const creativeRequest = (window.electron?.creativeScheduleGetMonth
        ? window.electron.creativeScheduleGetMonth(year, month, force)
        : Promise.resolve(EMPTY_CREATIVE_SCHEDULE))
        .then(setCreativeSchedule)
        .catch(() => setCreativeSchedule(EMPTY_CREATIVE_SCHEDULE))
      const changeRequest = (teacherName && config.schoolHubUrl
        ? listTimetableChanges(teacherName, `${format(viewDate, 'yyyy-MM')}-01`, `${format(viewDate, 'yyyy-MM')}-31`)
        : Promise.resolve([]))
        .then(setTimetableChanges)
        .catch(() => setTimetableChanges([]))

      await Promise.allSettled([scheduleRequest, weeklyRequest, committeeRequest, sharedWorkRequest, dutyRequest, creativeRequest, changeRequest])
      writeCalendarSessionSnapshot(cacheKey, {
        schedule: nextSchedule,
        weeklyPlan: nextWeekly,
        committeeEvents: nextCommitteeEvents,
        sharedTasks: nextSharedTasks,
        dutyEvents: nextDutyEvents,
      })
    } finally {
      setLoading(false)
    }
  }, [config.officeCode, config.schoolCode, config.schoolHubUrl, config.teacherName, hasNeis, viewDate])

  useEffect(() => { void loadMonth() }, [loadMonth])

  useEffect(() => {
    const refresh = () => void loadMonth(true)
    window.addEventListener('staffChecklists:updated', refresh)
    return () => window.removeEventListener('staffChecklists:updated', refresh)
  }, [loadMonth])

  useEffect(() => subscribePersonalOrganizer(change => {
    if (change.kind === 'tasks') setTasks(change.value)
  }), [])

  useEffect(() => {
    const teacherName = config.teacherName?.trim()
    if (!teacherName) return
    return subscribeHubResource<CommitteeState>('committees', state => {
      setCommitteeEvents(state.events.filter(event => event.memberNames.includes(teacherName)))
    })
  }, [config.teacherName])

  useEffect(() => {
    const teacherName = config.teacherName?.trim()
    if (!teacherName) return
    const expectedKey = `staffChecklists:${teacherName}:user`
    return subscribeHubResource<StaffChecklist[]>('staffChecklists', (tasks, cacheKey) => {
      if (cacheKey === expectedKey) setSharedTasks(tasks)
    })
  }, [config.teacherName])

  const events = useMemo<CalendarEvent[]>(() => {
    const pulledLessons = listPulledLessonsForTeacher(config.teacherName?.trim() ?? '', `${monthKey}-01`, `${monthKey}-31`)
    const combined: CalendarEvent[] = [
    ...(showNeis ? schedule : []).map(item => ({
      id: `neis-${item.date}-${item.eventName}`,
      date: fromYmd(item.date),
      title: item.eventName,
      source: 'neis' as const,
      label: 'NEIS',
    })),
    ...weeklyPlan.events.map((item, index) => ({
      id: `weekly-${item.date}-${item.department}-${index}`,
      date: fromYmd(item.date),
      title: item.eventName,
      source: 'weekly' as const,
      label: item.department || '주간계획',
    })),
    ...creativeSchedule.events.map((item, index) => ({
      id: `creative-${item.kind}-${item.date}-${index}`,
      date: fromYmd(item.date), title: item.title,
      source: item.kind === 'activity' ? 'creative' as const : 'schoolEvent' as const,
      label: item.kind === 'activity' ? (item.department || '창의적체험활동') : '창체 학사일정',
    })),
    ...timetableChanges.filter(item => isTimetableChangeAppliedForTeacher(item, config.teacherName?.trim() ?? '')).flatMap(item => {
      const dates = [...new Set([item.originalDate, item.replacementDate])]
      return dates.map(date => ({ id: `timetable-change-${item.id}-${date}`, date, title: timetableChangeSummary(item), source: 'timetableChange' as const, label: item.status !== 'approved' && item.requesterAppliedAt ? '나만 우선 반영' : '승인된 수업변경' }))
    }),
    ...committeeEvents.map(item => ({
      id: `committee-${item.id}`,
      date: item.date,
      title: item.title,
      time: item.startTime,
      source: 'committee' as const,
      label: item.committeeName,
    })),
    ...dutySchedule.events.map((item, index) => ({
      id: `duty-${item.kind}-${item.date}-${index}`,
      date: fromYmd(item.date),
      title: item.title,
      time: item.time,
      source: item.kind === 'gate' ? 'gateDuty' as const : 'mealDuty' as const,
      label: item.kind === 'gate' ? '등교지도' : '급식지도',
    })),
    ...sharedTasks.filter(task => {
      if (!task.deadline) return false
      const own = task.responses.find(response => response.teacherName === config.teacherName?.trim())
      const completed = task.status === 'completed' || task.closed || (task.items.length > 0 && task.items.every(item => own?.checkedItemIds.includes(item.id)))
      return !hideCompleted || !completed
    }).map(task => {
      const own = task.responses.find(response => response.teacherName === config.teacherName?.trim())
      const completed = task.status === 'completed' || task.closed || (task.items.length > 0 && task.items.every(item => own?.checkedItemIds.includes(item.id)))
      return ({
      id: `shared-work-${task.id}`,
      date: task.startTime && task.scheduledDate ? task.scheduledDate : task.deadline,
      title: task.title,
      time: task.startTime ? `${task.startTime}${task.endTime ? `~${task.endTime}` : ''}` : undefined,
      source: 'sharedWork' as const,
      label: task.departmentNames.length ? task.departmentNames.join(' · ') : '공유 업무',
      completed,
    })}),
    ...tasks.filter(task => task.showOnCalendar !== false && (!hideCompleted || !task.completed)).map(task => ({
      id: `personal-${task.id}`,
      date: task.date,
      title: task.title,
      time: task.time ? `${task.time}${task.endTime ? `~${task.endTime}` : ''}` : undefined,
      source: 'personal' as const,
      label: '개인 업무',
      completed: task.completed,
      task,
    })),
    ...SPECIAL_TIMETABLE_DAYS.map(item => ({
      id: `special-timetable-${item.date}`,
      date: item.date,
      title: item.title,
      source: 'schoolEvent' as const,
      label: '시간표 운영',
    })),
    ...pulledLessons.map(item => ({
      id: item.id,
      date: item.date,
      title: pulledLessonTitle(item),
      source: 'pulledLesson' as const,
      label: '당김수업',
    }))]
    return combined
      .filter(event => event.source === 'neis' || sourceVisibility[event.source])
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title, 'ko'))
  },
  [committeeEvents, config.teacherName, creativeSchedule.events, dutySchedule.events, hideCompleted, monthKey, schedule, sharedTasks, showNeis, sourceVisibility, tasks, timetableChanges, weeklyPlan.events])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) map.set(event.date, [...(map.get(event.date) ?? []), event])
    return map
  }, [events])

  const monthStart = startOfMonth(viewDate)
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(viewDate), { weekStartsOn: 0 }),
  })
  const selectedEvents = eventsByDate.get(selectedDate) ?? []
  const incomplete = tasks.filter(task => !task.completed)
  const overdue = incomplete.filter(task => task.date < today()).length
  const todayCount = incomplete.filter(task => task.date === today()).length
  const incompleteSharedTasks = sharedTasks
    .filter(task => task.targetNames.includes(config.teacherName?.trim() ?? '') && !isSharedWorkComplete(task, config.teacherName?.trim() ?? ''))
    .sort((a, b) => (a.deadline || '9999-99-99').localeCompare(b.deadline || '9999-99-99'))

  const selectDay = (date: string) => {
    setSelectedDate(date)
    setDraft(emptyDraft(date))
    setMessage('')
  }

  const editTask = (task: PersonalTask) => {
    setSelectedDate(task.date)
    setDraft({ id: task.id, title: task.title, date: task.date, time: task.time ?? '', endTime: task.endTime ?? '', priority: task.priority, memo: task.memo ?? '' })
    setMessage('')
  }

  const persistTasks = async (next: PersonalTask[], success: string) => {
    const saved = await savePersonalTasks(next)
    setTasks(saved)
    setMessage(success)
  }

  const submitTask = async (event: React.FormEvent) => {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) return
    if (draft.endTime && (!draft.time || draft.endTime <= draft.time)) { setMessage('종료 시간은 시작 시간보다 늦게 입력해 주세요.'); return }
    const now = new Date().toISOString()
    if (draft.id) {
      await persistTasks(tasks.map(task => task.id === draft.id
        ? { ...task, title, date: draft.date, time: draft.time || undefined, endTime: draft.time && draft.endTime ? draft.endTime : undefined, priority: draft.priority, memo: draft.memo.trim(), updatedAt: now }
        : task), '개인 업무를 수정했습니다.')
    } else {
      await persistTasks([...tasks, {
        id: createPersonalTaskId(), title, date: draft.date, time: draft.time || undefined, endTime: draft.time && draft.endTime ? draft.endTime : undefined,
        priority: draft.priority, completed: false, memo: draft.memo.trim(), createdAt: now, updatedAt: now,
      }], '개인 업무를 등록했습니다.')
    }
    setSelectedDate(draft.date)
    setDraft(emptyDraft(draft.date))
  }

  const toggleTask = async (task: PersonalTask) => {
    await persistTasks(tasks.map(item => item.id === task.id
      ? { ...item, completed: !item.completed, updatedAt: new Date().toISOString() }
      : item), task.completed ? '업무를 미완료로 되돌렸습니다.' : '업무를 완료했습니다.')
  }

  const deleteTask = async (task: PersonalTask) => {
    if (!window.confirm(`'${task.title}' 업무를 삭제할까요?`)) return
    await persistTasks(tasks.filter(item => item.id !== task.id), '개인 업무를 삭제했습니다.')
    if (draft.id === task.id) setDraft(emptyDraft(selectedDate))
  }

  return (
    <div className="p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-white"><CalendarDays className="text-emerald-400" />통합 캘린더</h1>
          <p className="mt-1 text-sm text-slate-400">학사일정·주간계획·등교지도·급식지도·내 위원회·업무를 한 달 단위로 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => void loadMonth(true)} disabled={loading}><RotateCcw size={13} className={loading ? 'animate-spin' : ''} />새로고침</button>
          <button className="btn-primary" onClick={() => { const date = today(); setViewDate(startOfMonth(new Date(`${date}T00:00:00`))); selectDay(date) }}>오늘</button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="미완료 개인 업무" value={incomplete.length} tone="emerald" />
        <Summary label="오늘 마감" value={todayCount} tone="sky" />
        <Summary label="기한 지남" value={overdue} tone="rose" />
      </div>

      {incompleteSharedTasks.length > 0 && (
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'staff_tasks' }))} className="card flex w-full items-center justify-between gap-4 border-rose-400/25 bg-rose-500/8 px-4 py-3 text-left">
          <div className="min-w-0"><p className="font-bold text-rose-200">배부받은 미완료 업무 {incompleteSharedTasks.length}건</p><p className="mt-1 truncate text-xs text-slate-300">{incompleteSharedTasks.slice(0, 3).map(task => `${task.title}${task.deadline ? ` (${task.deadline})` : ''}`).join(' · ')}</p></div>
          <span className="shrink-0 text-xs font-bold text-rose-200">업무센터에서 보기 →</span>
        </button>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button className="btn-ghost p-2" onClick={() => setViewDate(date => addMonths(date, -1))}><ChevronLeft size={16} /></button>
              <h2 className="min-w-32 text-center text-base font-black text-white">{format(viewDate, 'yyyy년 M월', { locale: ko })}</h2>
              <button className="btn-ghost p-2" onClick={() => setViewDate(date => addMonths(date, 1))}><ChevronRight size={16} /></button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px]">
              <Legend color="bg-violet-400" label="NEIS" />
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-violet-400/15 bg-violet-500/5 px-2 py-1 text-violet-200">
                <input type="checkbox" checked={showNeis} onChange={event => void saveConfig({ showNeisSchedule: event.target.checked })} />NEIS 학사일정 켜기
              </label>
              {([
                ['weekly', '주간계획', 'bg-sky-400'], ['creative', '창체', 'bg-teal-400'], ['schoolEvent', '창체 학사일정', 'bg-indigo-400'],
                ['committee', '내 위원회', 'bg-amber-400'], ['sharedWork', '공유 업무', 'bg-rose-400'], ['personal', '개인 업무', 'bg-emerald-400'],
                ['gateDuty', '등교지도', 'bg-cyan-400'], ['mealDuty', '급식지도', 'bg-orange-400'], ['timetableChange', '수업변경', 'bg-fuchsia-400'], ['pulledLesson', '당김수업', 'bg-lime-500'],
              ] as Array<[Exclude<CalendarSource, 'neis'>, string, string]>).map(([source, label, color]) => (
                <label key={source} className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-1 font-semibold text-slate-300"><input type="checkbox" checked={sourceVisibility[source]} onChange={event => setSourceVisible(source, event.target.checked)} /><span className={`h-2 w-2 rounded-full ${color}`} />{label}</label>
              ))}
              <label className="flex cursor-pointer items-center gap-1.5 text-slate-400">
                <input type="checkbox" checked={hideCompleted} onChange={event => setHideCompleted(event.target.checked)} />완료 숨김
              </label>
            </div>
          </div>

          {!hasNeis && <p className="mb-3 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[11px] text-violet-200">관리자가 공용 NEIS 자료를 동기화하면 학사일정도 함께 표시됩니다.</p>}
          {hasNeis && neisSnapshotAvailable === false && <p className="mb-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">공용 NEIS 자료가 아직 없습니다. 관리자에게 환경설정에서 첫 동기화를 실행해 달라고 요청하세요.</p>}
          {!config.teacherName?.trim() && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'settings' }))} className="mb-3 w-full rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-left text-[11px] text-cyan-200">환경설정에서 이름을 등록하면 본인의 등교지도·급식지도 일정이 표시됩니다. 이름 설정 바로가기</button>}
          {dutyError && <p className="mb-3 rounded-xl border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-[11px] text-orange-200">{dutyError}</p>}

          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-7 gap-px bg-white/5">
              {WEEKDAY_LABELS.map((day, index) => <div key={day} className={clsx('bg-surface-900 py-2 text-center text-[10px] font-bold', index === 0 ? 'text-rose-400' : index === 6 ? 'text-sky-400' : 'text-slate-400')}>{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-px bg-white/5">
              {days.map((day, index) => {
                const date = format(day, 'yyyy-MM-dd')
                const dayEvents = eventsByDate.get(date) ?? []
                const currentMonth = isSameMonth(day, viewDate)
                return (
                  <button key={date} type="button" onClick={event => {
                    selectDay(date)
                    if ((event.target as HTMLElement).closest('[data-calendar-event]')) { setQuickAddHint(null); return }
                    setQuickAddHint({ date, x: event.clientX, y: event.clientY })
                  }} className={clsx(
                    'min-h-[116px] min-w-0 bg-surface-800/95 p-1.5 text-left transition-colors hover:bg-white/5',
                    selectedDate === date && 'ring-2 ring-inset ring-emerald-400/70 bg-emerald-500/5',
                    !currentMonth && 'opacity-35',
                  )}>
                    <span className={clsx('mb-1 grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold', date === today() ? 'bg-amber-400 text-slate-950' : index % 7 === 0 ? 'text-rose-400' : index % 7 === 6 ? 'text-sky-400' : 'text-slate-300')}>{format(day, 'd')}</span>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 4).map(event => <div data-calendar-event key={event.id} className={clsx('calendar-event-text truncate rounded border-l-2 px-1 py-0.5 text-[9px]', SOURCE_STYLE[event.source], event.completed && 'line-through opacity-50')} title={`${event.label} · ${event.title}`}>{event.time && <span className="mr-1">{event.time}</span>}{event.title}</div>)}
                      {dayEvents.length > 4 && <span className="block pl-1 text-[8px] font-bold text-slate-500">+{dayEvents.length - 4}개</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">교무기획부 주간계획 {weeklyPlan.sourceSheets.length}개 시트 · 지도 일정 {dutySchedule.sources.length}개 시트 반영 · {monthKey}</p>
        </section>

        <aside className="space-y-4">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="text-xs font-bold text-emerald-300">{format(new Date(`${selectedDate}T00:00:00`), 'M월 d일 (EEE)', { locale: ko })}</p><p className="mt-0.5 text-[10px] text-slate-500">선택한 날짜의 전체 일정</p></div>
              <button className="btn-ghost p-2" title="새 개인 업무" onClick={() => setDraft(emptyDraft(selectedDate))}><CirclePlus size={15} /></button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {selectedEvents.length ? selectedEvents.map(event => (
                <div key={event.id} className={clsx('rounded-xl border-l-2 bg-white/[0.025] p-2.5', SOURCE_STYLE[event.source].split(' ')[0])}>
                  <div className="flex items-start gap-2">
                    {event.task && <button onClick={() => void toggleTask(event.task!)} className={clsx('mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded border', event.completed ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-slate-600')} aria-label="완료 상태 변경">{event.completed && <Check size={11} />}</button>}
                    <div className="min-w-0 flex-1"><p className={clsx('text-[11px] font-semibold text-slate-200', event.completed && 'line-through text-slate-500')}>{event.title}</p><p className="mt-0.5 text-[9px] text-slate-500">{event.label}{event.time ? ` · ${event.time}` : ''}</p></div>
                    {event.task && <div className="flex gap-1"><button onClick={() => editTask(event.task!)} className="text-slate-500 hover:text-sky-300"><Pencil size={12} /></button><button onClick={() => void deleteTask(event.task!)} className="text-slate-500 hover:text-rose-300"><Trash2 size={12} /></button></div>}
                  </div>
                </div>
              )) : <p className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-[11px] text-slate-500">등록된 일정이 없습니다.</p>}
            </div>
          </section>

          <form className="card p-4" onSubmit={submitTask}>
            <div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-bold text-white">{draft.id ? '개인 업무 수정' : '개인 업무 등록'}</p><p className="mt-0.5 flex items-center gap-1 text-[9px] text-emerald-400"><ShieldCheck size={10} />이 PC에만 저장</p></div>{draft.id && <button type="button" className="text-[10px] text-slate-500 hover:text-white" onClick={() => setDraft(emptyDraft(selectedDate))}>새 업무</button>}</div>
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-500">업무 제목</span><input required value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="해야 할 일을 입력하세요" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-500">마감일</span><input type="date" required value={draft.date} onChange={event => setDraft(current => ({ ...current, date: event.target.value }))} /></label>
                <label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-500">시작 시간</span><input type="time" value={draft.time} onChange={event => setDraft(current => ({ ...current, time: event.target.value, endTime: event.target.value ? current.endTime : '' }))} /></label>
              </div>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-500">종료 시간(선택)</span><input type="time" value={draft.endTime} min={draft.time || undefined} disabled={!draft.time} onChange={event => setDraft(current => ({ ...current, endTime: event.target.value }))} /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-500">중요도</span><select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value as PersonalTaskPriority }))}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-500">메모</span><textarea rows={3} value={draft.memo} onChange={event => setDraft(current => ({ ...current, memo: event.target.value }))} placeholder="필요한 내용을 간단히 적으세요" /></label>
              <button className="btn-primary w-full" type="submit"><Save size={13} />{draft.id ? '수정 저장' : '업무 등록'}</button>
              {message && <p className="text-center text-[10px] text-emerald-400">{message}</p>}
            </div>
          </form>
        </aside>
      </div>
      <QuickOrganizerModal date={quickAddDate} onClose={() => setQuickAddDate(null)} onSaved={() => void loadPersonalTasks().then(setTasks)} />
      <QuickOrganizerTrigger hint={quickAddHint} onClose={() => setQuickAddHint(null)} onOpen={date => { setQuickAddHint(null); setQuickAddDate(date) }} />
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="calendar-legend-text flex items-center gap-1 text-slate-400"><span className={clsx('h-2 w-2 rounded-full', color)} />{label}</span>
}

function Summary({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'sky' | 'rose' }) {
  const styles = { emerald: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300', sky: 'border-sky-400/20 bg-sky-500/10 text-sky-300', rose: 'border-rose-400/20 bg-rose-500/10 text-rose-300' }
  return <div className={clsx('rounded-2xl border px-4 py-3', styles[tone])}><p className="text-[10px] font-semibold opacity-75">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>
}
