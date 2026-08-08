import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, ChevronLeft, ChevronRight, AlertCircle,
  Utensils, CalendarDays, BookOpen, Globe, CloudSun,
  ShieldCheck, Brain, PenLine, Table2, Calculator,
  Shuffle, CalendarClock, ClipboardCheck,
  Shield, GraduationCap, Backpack,
  DollarSign, Briefcase, ClipboardList, School, ShoppingCart,
  Landmark, Trophy, FileSearch, FileDown, FileText,
  FileSpreadsheet, HelpCircle, Waves, SquareStack, CircleDot, Star,
  FileScan, FileCode2, MapPinned,
  Clapperboard, SquarePen, MessagesSquare, BarChart3, Mic, CalendarRange, UsersRound,
  ArrowUpRight, BellRing, Check, ListTodo, StickyNote,
  type LucideIcon,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppStore } from '../stores/appStore'
import { WeatherTodayView, WeatherForecastView } from '../components/WeatherBar'
import { useWeather } from '../components/useWeather'
import { getMeal, getSchedule, getTimetableRange, getSchoolDetail, NEIS_API_KEY } from '../services/neis'
import {
  getSchoolTimetable,
  listStaffChecklists,
  listCommitteeState,
  submitStaffChecklist,
  subscribeHubResource,
  type CommitteeEvent,
  type CommitteeState,
} from '../services/schoolHub'
import type { SchoolTimetable, TeacherTimetable } from '../services/schoolTimetable'
import type { StaffChecklist } from '../services/rosterAttendance'
import {
  loadPersonalMemo, loadPersonalTasks, savePersonalMemo, savePersonalTasks,
  subscribePersonalOrganizer, type PersonalTask,
} from '../services/personalOrganizer'
import {
  classifySharedWorkDeadline, isNewSharedWork, isSharedWorkComplete,
  loadSharedWorkLastViewedAt, subscribeSharedWorkViewed,
} from '../services/sharedWorkNotifications'
import { UNGCHEON_LUNCH, UNGCHEON_PERIOD_RANGES } from '../services/ungcheonSchedule'
import type { CreativeScheduleResult, DutyScheduleResult, MealInfo, ScheduleEvent, TimetableEntry, WeeklyPlanNote, WeeklyPlanResult } from '../types'
import { listTimetableChanges, timetableChangeSummary, type TimetableChangeRequest } from '../services/timetableChanges'
import {
  addDays, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import clsx from 'clsx'

// ─── 포트폴리오 데이터 ─────────────────────────────────────────────
const COLOR_MAP: Record<string, { bg: string; icon: string; dot: string }> = {
  violet:  { bg: 'bg-violet-500/10',  icon: 'text-violet-400',  dot: 'bg-violet-500' },
  sky:     { bg: 'bg-sky-500/10',     icon: 'text-sky-400',     dot: 'bg-sky-500' },
  emerald: { bg: 'bg-emerald-500/10', icon: 'text-emerald-400', dot: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-500/10',   icon: 'text-amber-400',   dot: 'bg-amber-500' },
  rose:    { bg: 'bg-rose-500/10',    icon: 'text-rose-400',    dot: 'bg-rose-500' },
  slate:   { bg: 'bg-white/5',        icon: 'text-slate-400',   dot: 'bg-slate-500' },
  indigo:  { bg: 'bg-indigo-500/10',  icon: 'text-indigo-400',  dot: 'bg-indigo-500' },
}
interface PortfolioItem { id: string; label: string; icon: LucideIcon; desc: string; badge?: string; hidden?: boolean }
interface PortfolioGroup { group: string; color: string; items: PortfolioItem[] }
interface DashboardScheduleEvent {
  date: string
  eventName: string
  source: 'neis' | 'weekly' | 'creative' | 'schoolEvent' | 'committee' | 'sharedWork' | 'personal' | 'gateDuty' | 'mealDuty' | 'timetableChange'
  department?: string
  completed?: boolean
  taskId?: string
}

const PORTFOLIO_GROUPS: PortfolioGroup[] = [
  { group: '학사·기록', color: 'amber', items: [
    { id: 'timetable_swap', label: '교환·대강 계획', icon: Shuffle, desc: '후보 시간표·연강 확인과 계획서 출력' },
    { id: 'student_timetable', label: '학생별 시간표', icon: CalendarRange, desc: '과목선택 자료를 반영한 개인 시간표 조회·인쇄' },
    { id: 'student_locator', label: '학생 위치 찾기', icon: FileSearch, desc: '학번·이름으로 현재 수업과 교실 확인' },
    { id: 'attendance_print', label: '출석부 출력', icon: ClipboardList, desc: '학급·수업·교사·과목별 출석부 묶음 출력' },
    { id: 'grade_preview', label: '성적 산출 미리보기', icon: BarChart3, desc: '평가 점수 합산·석차등급·성취도 사전 확인' },
    { id: 'estimated_split_score', label: '추정분할점수 도우미', icon: SquareStack, desc: '분할점수 구성·성취도 분포 예측과 목표 분포 역산' },
    { id: 'curriculum', label: '교육과정 편제표 출력', icon: FileText, desc: '4개 편제표 확인·PDF 출력과 과목선택 상담' },
  ]},
  { group: '학교운영', color: 'rose', items: [
    { id: 'staff_tasks', label: '업무센터', icon: ClipboardCheck, desc: '내 업무·부서 업무·개인 업무와 완료 현황 관리' },
    { id: 'staff_roster', label: '교직원 명렬', icon: UsersRound, desc: '교직원 명렬 관리와 연수등록부 출력' },
    { id: 'committees', label: '각종 위원회 현황', icon: Landmark, desc: '위원 명단·개최 일정과 중복 확인' },
  ]},
  { group: '학교 공유 링크', color: 'violet', items: [
    { id: 'school_hub', label: '부서별 링크·공지', icon: Globe, desc: '교직원 공용 링크와 학교 공지' },
  ]},
  { group: '자료·진로', color: 'sky', items: [
    { id: 'excel_processor', label: 'Excel 전처리', icon: Table2, desc: '공백·날짜·중복 등 데이터 정제' },
    { id: 'recommended_subjects', label: '대학 권장과목', icon: GraduationCap, desc: '2028 대학·학과별 권장 이수과목 검색' },
  ]},
  { group: '인사행정', color: 'emerald', items: [
    { id: 'payroll', label: '호봉획정 계산기', icon: Calculator, desc: '경력 인정과 초임 호봉 계산' },
    { id: 'transfer_score', label: '전보내신점수 계산기', icon: MapPinned, desc: '2027 경남 일반교사 전보 점수 자동 계산' },
    { id: 'insa_analysis', label: 'NEIS 인사기록 분석', icon: FileScan, desc: '인사기록 PDF 분석과 법정연수 점검' },
  ]},
  { group: '파일·알림', color: 'slate', items: [
    { id: 'pdf_extractor', label: 'PDF 텍스트 추출', icon: FileDown, desc: '일반·스캔 PDF 텍스트 추출' },
    { id: 'file_parser', label: '만능 파일 파서', icon: FileCode2, desc: 'Excel·HWP·PDF 구조 분석' },
    { id: 'notifier', label: '업무 알리미', icon: CalendarClock, desc: '오늘의 학사일정 주기 확인' },
  ]},
]

// id → color 정적 맵 (즐겨찾기 카드에서 색상 조회용)
const ITEM_COLOR_MAP: Record<string, string> = {}
for (const { color, items } of PORTFOLIO_GROUPS) {
  for (const item of items) ITEM_COLOR_MAP[item.id] = color
}

// ─── util ────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date()
  return format(d, 'yyyy-MM-dd')
}
function toYmd(dateStr: string) { return dateStr.replace(/-/g, '') }

function getWeekDates(dateStr: string): string[] {
  const d = new Date(dateStr)
  const mon = startOfWeek(d, { weekStartsOn: 1 })
  return Array.from({ length: 5 }, (_, i) => format(addDays(mon, i), 'yyyyMMdd'))
}

function minsToTime(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2,'0')}:${String(mins % 60).padStart(2,'0')}`
}

type ClassStatus =
  | { type: 'weekend' }
  | { type: 'before'; startTime: string }
  | { type: 'class'; period: string; subject?: string; endTime: string; remaining: number }
  | { type: 'break'; fromPeriod: string; toPeriod: string; endTime: string; remaining: number; isLunch: boolean }
  | { type: 'after' }

function getClassStatus(
  ranges: [number, number, string][],
  now: Date,
  todaySubjects?: Record<string, string>
): ClassStatus {
  const day = now.getDay()
  if (day === 0 || day === 6) return { type: 'weekend' }
  const mins = now.getHours() * 60 + now.getMinutes()
  for (const [s, e, period] of ranges) {
    if (mins >= s && mins <= e)
      return { type: 'class', period, subject: todaySubjects?.[period], endTime: minsToTime(e), remaining: e - mins }
  }
  if (mins < ranges[0][0]) return { type: 'before', startTime: minsToTime(ranges[0][0]) }
  if (mins > ranges[ranges.length - 1][1]) return { type: 'after' }
  for (let i = 0; i < ranges.length - 1; i++) {
    const [, prevEnd, fromPeriod] = ranges[i]
    const [nextStart, , toPeriod] = ranges[i + 1]
    if (mins > prevEnd && mins < nextStart)
      return { type: 'break', fromPeriod, toPeriod, endTime: minsToTime(nextStart), remaining: nextStart - mins, isLunch: fromPeriod === '4' && toPeriod === '5' }
  }
  return { type: 'after' }
}

const TC_COLORS = [
  { bg: 'bg-violet-500/20', text: 'text-violet-300', now: 'bg-violet-500/35', badge: 'bg-violet-500/30 text-violet-300' },
  { bg: 'bg-sky-500/20',    text: 'text-sky-300',    now: 'bg-sky-500/35',    badge: 'bg-sky-500/30 text-sky-300'    },
  { bg: 'bg-emerald-500/20',text: 'text-emerald-300',now: 'bg-emerald-500/35',badge: 'bg-emerald-500/30 text-emerald-300'},
  { bg: 'bg-amber-500/20',  text: 'text-amber-300',  now: 'bg-amber-500/35',  badge: 'bg-amber-500/30 text-amber-300'  },
  { bg: 'bg-rose-500/20',   text: 'text-rose-300',   now: 'bg-rose-500/35',   badge: 'bg-rose-500/30 text-rose-300'   },
]

// ─── SortableCard (즐겨찾기 섹션용) ──────────────────────────────
function SortableCard({
  item, color, onNavigate, onToggleFav,
}: {
  item: PortfolioItem
  color: string
  onNavigate: (id: string) => void
  onToggleFav: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const c = COLOR_MAP[color] ?? COLOR_MAP.slate
  const Icon = item.icon

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="relative group"
    >
      <button
        onClick={() => onNavigate(item.id)}
        className="w-full text-left p-4 rounded-[16px_16px_16px_5px] bg-surface-800 border border-amber-500/25 hover:border-amber-500/60 hover:bg-surface-700 transition-all duration-200 active:scale-[0.98] shadow-sm"
      >
        {/* 드래그 핸들 */}
        <div
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          className="absolute top-2 left-2 opacity-0 group-hover:opacity-40 hover:!opacity-70 transition-opacity cursor-grab active:cursor-grabbing text-slate-500 select-none px-0.5"
          title="드래그로 순서 변경"
        >
          ⠿
        </div>

        {/* 즐겨찾기 해제 버튼 */}
        <button
          onClick={e => { e.stopPropagation(); onToggleFav(item.id) }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-amber-400 hover:text-amber-300"
          title="즐겨찾기 해제"
        >
          <Star size={13} fill="currentColor" />
        </button>

        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center mb-3', c.bg)}>
          <Icon size={16} className={c.icon} />
        </div>
        <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
        <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
        {item.badge && (
          <span className="mt-2 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500 text-white">
            {item.badge}
          </span>
        )}
      </button>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────
export default function Dashboard({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { config, saveConfig } = useAppStore()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [meal, setMeal] = useState<MealInfo[]>([])
  const [nextMeal, setNextMeal] = useState<MealInfo[]>([])
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([])
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanResult>({
    events: [],
    notes: [],
    sourceSheets: [],
    fetchedAt: '',
  })
  const [weeklyPlanLoading, setWeeklyPlanLoading] = useState(false)
  const [weeklyPlanError, setWeeklyPlanError] = useState('')
  const [dutySchedule, setDutySchedule] = useState<DutyScheduleResult>({ events: [], sources: [], fetchedAt: '' })
  const [dutyScheduleLoading, setDutyScheduleLoading] = useState(false)
  const [dutyScheduleError, setDutyScheduleError] = useState('')
  const [creativeSchedule, setCreativeSchedule] = useState<CreativeScheduleResult>({ events: [], sourceSheets: [], sourceUrl: '', fetchedAt: '' })
  const [creativeScheduleLoading, setCreativeScheduleLoading] = useState(false)
  const [creativeScheduleError, setCreativeScheduleError] = useState('')
  const [timetableChanges, setTimetableChanges] = useState<TimetableChangeRequest[]>([])
  const [timetable, setTimetable] = useState<TimetableEntry[]>([])
  const [teacherTT, setTeacherTT] = useState<TimetableEntry[]>([])
  const [sharedTeacher, setSharedTeacher] = useState<TeacherTimetable | null>(null)
  const [committeeEvents, setCommitteeEvents] = useState<CommitteeEvent[]>([])
  const [sharedTasks, setSharedTasks] = useState<StaffChecklist[]>([])
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([])
  const [personalMemo, setPersonalMemo] = useState('')
  const [memoLoaded, setMemoLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())
  const showNeis = config.showNeisSchedule !== false

  // ── 학교 날씨 (오늘 날씨 / 이후 기간 예보 카드가 공유) ──
  const { data: weather, loading: weatherLoading, displayName: weatherPlace } = useWeather(config.schoolAddress)
  // ── 2번째 위치 날씨 (설정 시 날씨 카드 하단에 함께 표시) ──
  const { data: weather2, displayName: weather2Place } = useWeather(undefined, config.secondLocationName)

  // ── 즐겨찾기 상태 ──
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    window.electron?.configGet('dashboard.favorites').then((saved: unknown) => {
      if (Array.isArray(saved)) setFavorites(saved as string[])
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([loadPersonalTasks(), loadPersonalMemo()]).then(([tasks, memo]) => {
      if (cancelled) return
      setPersonalTasks(tasks)
      setPersonalMemo(memo)
      setMemoLoaded(true)
    })
    const unsubscribe = subscribePersonalOrganizer(change => {
      if (change.kind === 'tasks') setPersonalTasks(change.value)
      if (change.kind === 'memo') setPersonalMemo(change.value)
    })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  useEffect(() => {
    if (!memoLoaded) return
    const timer = window.setTimeout(() => { void savePersonalMemo(personalMemo) }, 450)
    return () => window.clearTimeout(timer)
  }, [memoLoaded, personalMemo])

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      window.electron?.configSet('dashboard.favorites', next)
      return next
    })
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFavorites(prev => {
      const oldIdx = prev.indexOf(String(active.id))
      const newIdx = prev.indexOf(String(over.id))
      const next = arrayMove(prev, oldIdx, newIdx)
      window.electron?.configSet('dashboard.favorites', next)
      return next
    })
  }, [])

  const allItemsMap = useMemo<Record<string, PortfolioItem>>(() =>
    Object.fromEntries(
      PORTFOLIO_GROUPS.flatMap(g => g.items).map(i => [i.id, i])
    ), [])

  const hasSchool = !!(config.officeCode && config.schoolCode)
  const hasNeisApiKey = Boolean(config.neisApiKey?.trim())
  const neisApiKey = config.neisApiKey?.trim() || NEIS_API_KEY
  const periodRanges = UNGCHEON_PERIOD_RANGES
  const hasTeacher = !!(config.teacherClasses?.length)

  useEffect(() => {
    if (!config.schoolHubUrl || !config.teacherName?.trim()) {
      setSharedTeacher(null)
      setCommitteeEvents([])
      setSharedTasks([])
      return
    }
    let cancelled = false
    Promise.all([
      getSchoolTimetable().catch(() => null),
      listCommitteeState().catch(() => ({ assignments: [], events: [] })),
      listStaffChecklists(config.teacherName!.trim()).catch(() => []),
    ])
      .then(([shared, committeeState, tasks]) => {
        if (cancelled) return
        const name = config.teacherName!.trim()
        setSharedTeacher(shared?.teachers.find(teacher =>
          teacher.name === name || teacher.label.startsWith(name),
        ) ?? null)
        setCommitteeEvents(committeeState.events.filter(event => event.memberNames.includes(name)))
        setSharedTasks(tasks)
      })
      .catch(() => {
        if (!cancelled) {
          setSharedTeacher(null)
          setCommitteeEvents([])
          setSharedTasks([])
        }
      })
    return () => { cancelled = true }
  }, [config.schoolHubUrl, config.teacherName])

  useEffect(() => {
    const name = config.teacherName?.trim()
    if (!config.schoolHubUrl || !name) return
    const unsubscribeTimetable = subscribeHubResource<SchoolTimetable | null>('timetable', shared => {
      setSharedTeacher(shared?.teachers.find(teacher =>
        teacher.name === name || teacher.label.startsWith(name),
      ) ?? null)
    })
    const unsubscribeCommittees = subscribeHubResource<CommitteeState>('committees', state => {
      setCommitteeEvents(state.events.filter(event => event.memberNames.includes(name)))
    })
    const unsubscribeTasks = subscribeHubResource<StaffChecklist[]>('staffChecklists', (tasks, cacheKey) => {
      if (cacheKey.includes(`staffChecklists:${name}:`)) setSharedTasks(tasks)
    })
    return () => { unsubscribeTimetable(); unsubscribeCommittees(); unsubscribeTasks() }
  }, [config.schoolHubUrl, config.teacherName])

  // schoolAddress 자동 보완
  useEffect(() => {
    if (hasSchool && hasNeisApiKey && !config.schoolAddress) {
      getSchoolDetail(neisApiKey, config.officeCode!, config.schoolCode!).then(detail => {
        if (detail?.address) saveConfig({ schoolAddress: detail.address })
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.officeCode, config.schoolCode, hasNeisApiKey])

  useEffect(() => {
    if (!committeeEvents.length || !config.teacherName?.trim() || !('Notification' in window)) return
    const today = todayStr()
    const tomorrow = format(addDays(new Date(`${today}T00:00:00`), 1), 'yyyy-MM-dd')
    const alerts = committeeEvents.filter(event => event.date === today || event.date === tomorrow)
    if (!alerts.length) return
    void (async () => {
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission
      if (permission !== 'granted') return
      const saved = await window.electron?.configGet('committee.notifications.seen')
      const seen = new Set(Array.isArray(saved) ? saved.map(String) : [])
      const nextSeen = [...seen]
      for (const event of alerts) {
        const key = `${event.id}:${event.date}`
        if (seen.has(key)) continue
        new Notification(`${event.date === today ? '오늘' : '내일'} 위원회 일정`, {
          body: `${event.startTime} ${event.committeeName}${event.location ? ` · ${event.location}` : ''}`,
        })
        nextSeen.push(key)
      }
      await window.electron?.configSet('committee.notifications.seen', nextSeen.slice(-200))
    })()
  }, [committeeEvents, config.teacherName])

  // clock tick
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    if (!hasSchool || !hasNeisApiKey) {
      setMeal([])
      setNextMeal([])
      setSchedule([])
      setTimetable([])
      setTeacherTT([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const weekDates = getWeekDates(selectedDate)
      const fromYmdStr = weekDates[0]
      const toYmdStr = weekDates[4]

      const nextDay = addDays(new Date(selectedDate), 1)
      const dashboardWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
      const scheduleMonths = Array.from(new Set([
        selectedDate.slice(0, 7),
        format(dashboardWeekStart, 'yyyy-MM'),
        format(addDays(dashboardWeekStart, 13), 'yyyy-MM'),
      ]))

      const promises: Promise<unknown>[] = [
        getMeal(neisApiKey, config.officeCode!, config.schoolCode!, new Date(selectedDate)),
        getMeal(neisApiKey, config.officeCode!, config.schoolCode!, nextDay),
        Promise.all(scheduleMonths.map(value => {
          const [year, month] = value.split('-').map(Number)
          return getSchedule(neisApiKey, config.officeCode!, config.schoolCode!, year, month)
        })).then(results => results.flat()),
      ]

      if (config.grade && config.classNm && config.schoolType) {
        promises.push(
          getTimetableRange(neisApiKey, config.officeCode!, config.schoolCode!, config.schoolType, config.grade, config.classNm, fromYmdStr, toYmdStr)
        )
      } else {
        promises.push(Promise.resolve(null))
      }

      const [meals, nxtMeals, sched, tt] = await Promise.all(promises) as [MealInfo[], MealInfo[], ScheduleEvent[], TimetableEntry[] | null]
      setMeal(meals ?? [])
      setNextMeal(nxtMeals ?? [])
      setSchedule(sched)
      setTimetable(tt ?? [])

      if (hasTeacher && config.teacherClasses && config.schoolType) {
        const results = await Promise.all(
          config.teacherClasses.map(tc =>
            getTimetableRange(neisApiKey, config.officeCode!, config.schoolCode!, config.schoolType!, tc.grade, tc.classNm, fromYmdStr, toYmdStr)
          )
        )
        setTeacherTT(results.flat())
      }
    } catch {
      setError('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [selectedDate, config.officeCode, config.schoolCode, config.grade, config.classNm, config.schoolType, config.neisApiKey, hasSchool, hasTeacher, config.teacherClasses, neisApiKey, hasNeisApiKey])

  useEffect(() => { load() }, [load])

  const loadWeeklyPlan = useCallback(async (force = false) => {
    if (!window.electron?.weeklyPlanGetMonth) return
    const dashboardWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
    const months = Array.from(new Set([
      selectedDate.slice(0, 7),
      format(dashboardWeekStart, 'yyyy-MM'),
      format(addDays(dashboardWeekStart, 13), 'yyyy-MM'),
    ]))
    setWeeklyPlanLoading(true)
    setWeeklyPlanError('')
    try {
      const results = await Promise.all(months.map(value => {
        const [year, month] = value.split('-').map(Number)
        return window.electron.weeklyPlanGetMonth(year, month, force)
      }))
      setWeeklyPlan({
        events: results.flatMap(result => result.events).filter((event, index, all) =>
          all.findIndex(item => item.date === event.date && item.department === event.department && item.eventName === event.eventName) === index,
        ),
        notes: results.flatMap(result => result.notes).filter((note, index, all) =>
          all.findIndex(item => item.weekStart === note.weekStart && item.department === note.department && item.content === note.content) === index,
        ),
        sourceSheets: [...new Set(results.flatMap(result => result.sourceSheets))],
        fetchedAt: results.map(result => result.fetchedAt).filter(Boolean).sort().at(-1) ?? '',
      })
    } catch {
      setWeeklyPlanError('주간계획을 불러오지 못했습니다.')
    } finally {
      setWeeklyPlanLoading(false)
    }
  }, [selectedDate])

  useEffect(() => { loadWeeklyPlan() }, [loadWeeklyPlan])
  useEffect(() => {
    const id = window.setInterval(() => loadWeeklyPlan(true), 30 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [loadWeeklyPlan])

  const loadDutySchedule = useCallback(async (force = false) => {
    const teacherName = config.teacherName?.trim()
    if (!teacherName || !window.electron?.dutyScheduleGetMonth) {
      setDutySchedule({ events: [], sources: [], fetchedAt: '' })
      setDutyScheduleError('')
      return
    }
    const dashboardWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
    const months = Array.from(new Set([
      selectedDate.slice(0, 7),
      format(dashboardWeekStart, 'yyyy-MM'),
      format(addDays(dashboardWeekStart, 13), 'yyyy-MM'),
    ]))
    setDutyScheduleLoading(true)
    setDutyScheduleError('')
    try {
      const results = await Promise.all(months.map(value => {
        const [year, month] = value.split('-').map(Number)
        return window.electron.dutyScheduleGetMonth(year, month, teacherName, force)
      }))
      setDutySchedule({
        events: results.flatMap(result => result.events).filter((event, index, all) =>
          all.findIndex(item => item.date === event.date && item.kind === event.kind && item.location === event.location) === index,
        ),
        sources: results.flatMap(result => result.sources).filter((source, index, all) =>
          all.findIndex(item => item.kind === source.kind && item.url === source.url) === index,
        ),
        fetchedAt: results.map(result => result.fetchedAt).filter(Boolean).sort().at(-1) ?? '',
      })
    } catch {
      setDutyScheduleError('등교지도·급식지도 일정을 불러오지 못했습니다.')
    } finally {
      setDutyScheduleLoading(false)
    }
  }, [config.teacherName, selectedDate])

  useEffect(() => { void loadDutySchedule() }, [loadDutySchedule])
  useEffect(() => {
    const id = window.setInterval(() => void loadDutySchedule(true), 30 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [loadDutySchedule])

  const loadCreativeSchedule = useCallback(async (force = false) => {
    if (!window.electron?.creativeScheduleGetMonth) return
    const dashboardWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
    const months = Array.from(new Set([selectedDate.slice(0, 7), format(dashboardWeekStart, 'yyyy-MM'), format(addDays(dashboardWeekStart, 13), 'yyyy-MM')]))
    setCreativeScheduleLoading(true); setCreativeScheduleError('')
    try {
      const results = await Promise.all(months.map(value => { const [year, month] = value.split('-').map(Number); return window.electron.creativeScheduleGetMonth(year, month, force) }))
      setCreativeSchedule({
        events: results.flatMap(result => result.events).filter((event, index, all) => all.findIndex(item => item.date === event.date && item.kind === event.kind && item.title === event.title) === index),
        sourceSheets: [...new Set(results.flatMap(result => result.sourceSheets))],
        sourceUrl: results.find(result => result.sourceUrl)?.sourceUrl ?? '',
        fetchedAt: results.map(result => result.fetchedAt).filter(Boolean).sort().at(-1) ?? '',
      })
    } catch { setCreativeScheduleError('창의적체험활동 일정을 불러오지 못했습니다.') }
    finally { setCreativeScheduleLoading(false) }
  }, [selectedDate])

  const loadTimetableChanges = useCallback(async () => {
    const name = config.teacherName?.trim()
    if (!name || !config.schoolHubUrl) return setTimetableChanges([])
    const dashboardWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
    const selectedWeekStart = startOfWeek(new Date(`${selectedDate}T00:00:00`), { weekStartsOn: 0 })
    const fromDate = dashboardWeekStart < selectedWeekStart ? dashboardWeekStart : selectedWeekStart
    const toDate = dashboardWeekStart > selectedWeekStart ? addDays(dashboardWeekStart, 13) : addDays(selectedWeekStart, 13)
    try { setTimetableChanges(await listTimetableChanges(name, format(fromDate, 'yyyy-MM-dd'), format(toDate, 'yyyy-MM-dd'))) }
    catch { setTimetableChanges([]) }
  }, [config.schoolHubUrl, config.teacherName, selectedDate])

  useEffect(() => { void loadCreativeSchedule(); void loadTimetableChanges() }, [loadCreativeSchedule, loadTimetableChanges])
  useEffect(() => { const handler = () => void loadTimetableChanges(); window.addEventListener('timetableChanges:updated', handler); return () => window.removeEventListener('timetableChanges:updated', handler) }, [loadTimetableChanges])

  const goDay = (delta: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(format(d, 'yyyy-MM-dd'))
  }

  const isToday = selectedDate === todayStr()
  const selYmd = toYmd(selectedDate)
  const combinedSchedule: DashboardScheduleEvent[] = [
    ...(showNeis ? schedule : []).map(item => ({
      date: item.date,
      eventName: item.eventName,
      source: 'neis' as const,
    })),
    ...weeklyPlan.events.map(item => ({
      date: item.date,
      eventName: item.eventName,
      department: item.department,
      source: 'weekly' as const,
    })),
    ...creativeSchedule.events.map(item => ({ date: item.date, eventName: item.title, department: item.kind === 'activity' ? (item.department || '창의적체험활동') : '창체 학사일정', source: item.kind === 'activity' ? 'creative' as const : 'schoolEvent' as const })),
    ...timetableChanges.filter(item => item.status === 'approved').flatMap(item => [...new Set([item.originalDate, item.replacementDate])].map(date => ({ date: toYmd(date), eventName: timetableChangeSummary(item), department: '승인된 수업변경', source: 'timetableChange' as const }))),
    ...committeeEvents.map(item => ({
      date: toYmd(item.date),
      eventName: `${item.startTime} ${item.title}`,
      department: item.committeeName,
      source: 'committee' as const,
    })),
    ...dutySchedule.events.map(item => ({
      date: item.date,
      eventName: `${item.time} ${item.title}`,
      department: item.kind === 'gate' ? '등교지도' : '급식지도',
      source: item.kind === 'gate' ? 'gateDuty' as const : 'mealDuty' as const,
    })),
    ...sharedTasks.filter(task => task.deadline).map(task => ({
      date: toYmd(task.deadline),
      eventName: task.title,
      department: task.departmentNames.length ? task.departmentNames.join('·') : '공유 업무',
      source: 'sharedWork' as const,
      completed: task.status === 'completed' || task.closed || task.items.every(item =>
        task.responses.find(response => response.teacherName === config.teacherName?.trim())?.checkedItemIds.includes(item.id),
      ),
      taskId: task.id,
    })),
    ...personalTasks.map(task => ({
      date: toYmd(task.date),
      eventName: `${task.time ? `${task.time} ` : ''}${task.title}`,
      department: '개인 업무',
      source: 'personal' as const,
      completed: task.completed,
      taskId: task.id,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.eventName.localeCompare(b.eventName))
  const upcomingCommitteeEvents = committeeEvents
    .filter(item => item.date >= todayStr() && item.date <= format(addDays(new Date(), 7), 'yyyy-MM-dd'))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
  const selectedWeekNotes = weeklyPlan.notes.filter(note =>
    note.weekStart <= selYmd && note.weekEnd >= selYmd,
  )

  const todaySubjects: Record<string, string> = {}
  if (isToday) {
    if (sharedTeacher) {
      const dayIndex = getWeekDates(selectedDate).indexOf(selYmd)
      if (dayIndex >= 0) {
        sharedTeacher.slots
          .slice(dayIndex * 7, (dayIndex + 1) * 7)
          .forEach((slot, offset) => {
            if (slot.value) todaySubjects[String(offset + 1)] = slot.value.split(/\r?\n/).filter(Boolean).join(' ')
          })
      }
    } else if (hasTeacher && config.teacherClasses) {
      config.teacherClasses.forEach(tc => {
        teacherTT
          .filter(t =>
            t.date === selYmd &&
            t.grade?.trim() === tc.grade &&
            t.classNm?.trim() === tc.classNm &&
            t.subject?.trim() === tc.subject?.trim()
          )
          .forEach(t => { todaySubjects[String(t.period)] = `${tc.grade}-${tc.classNm}반 ${tc.subject}` })
      })
    } else if (config.grade && config.classNm) {
      timetable.filter(t => t.date === selYmd)
        .forEach(t => { todaySubjects[String(t.period)] = t.subject })
    }
  }
  const classStatus = isToday ? getClassStatus(periodRanges, currentTime, todaySubjects) : null

  return (
    <div className="p-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">
            🏫 {config.schoolName ?? '학교를 설정하세요'} NEIS 대시보드
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {format(new Date(selectedDate), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-surface-800 border border-white/10 rounded-xl px-2 py-1.5">
            <button onClick={() => goDay(-1)} className="p-1 text-slate-400 hover:text-white transition-colors"><ChevronLeft size={15} /></button>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm text-slate-200 focus:outline-none cursor-pointer px-1"
            />
            <button onClick={() => goDay(1)} className="p-1 text-slate-400 hover:text-white transition-colors"><ChevronRight size={15} /></button>
            {!isToday && (
              <button onClick={() => setSelectedDate(todayStr())} className="text-xs text-violet-400 hover:text-violet-300 px-2 border-l border-white/10 ml-1">
                오늘
              </button>
            )}
          </div>
          <button
            onClick={() => { void load(); void loadWeeklyPlan(true); void loadDutySchedule(true); void loadCreativeSchedule(true); void loadTimetableChanges() }}
            disabled={loading || weeklyPlanLoading || dutyScheduleLoading || creativeScheduleLoading || !hasSchool}
            className="btn-ghost flex items-center gap-1.5 disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading || weeklyPlanLoading || dutyScheduleLoading || creativeScheduleLoading ? 'animate-spin' : ''} />
            <span className="text-xs">새로고침</span>
          </button>
        </div>
      </div>

      {/* ── No school ── */}
      {!hasSchool && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card border-violet-500/20 p-8 text-center">
          <div className="text-4xl mb-3">🏫</div>
          <h3 className="text-white font-semibold mb-1">학교를 설정해주세요</h3>
          <p className="text-slate-400 text-sm">환경설정에서 학교 검색 후 설정하면 급식·시간표·학사일정 정보를 확인할 수 있습니다.</p>
        </motion.div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle size={15} />{error}
        </div>
      )}

      {hasSchool && (
        <>
          {upcomingCommitteeEvents.length > 0 && (
            <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-amber-200">
                    <Landmark size={16} /> 내 위원회 일정
                  </p>
                  <p className="mt-1 text-xs text-slate-400">환경설정의 이름과 위원 명단이 일치하는 일정만 표시됩니다.</p>
                </div>
                <button onClick={() => onNavigate('committees')} className="btn-ghost text-xs">일정 보기</button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {upcomingCommitteeEvents.slice(0, 3).map(event => (
                  <button
                    key={event.id}
                    onClick={() => onNavigate('committees')}
                    className="rounded-xl border border-white/10 bg-surface-800/70 p-3 text-left hover:border-amber-400/35"
                  >
                    <p className="text-xs font-bold text-white">{event.committeeName}</p>
                    <p className="mt-1 text-[11px] text-amber-300">{event.date} · {event.startTime}~{event.endTime}</p>
                    {event.location && <p className="mt-1 text-[10px] text-slate-500">{event.location}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 좌측: 2주 달력·선택 일정·날씨·급식 / 우측: 주간 시간표 ── */}
          <div className="mb-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2.25fr)_minmax(380px,0.85fr)]">
            <div className="min-w-0 space-y-4">
              <DashCard
                icon={<CalendarDays size={14} className="text-violet-400"/>}
                title="이번 주 · 다음 주 일정"
                badge="2주 보기"
                badgeColor="violet"
              >
                {(loading || weeklyPlanLoading || dutyScheduleLoading || creativeScheduleLoading) && combinedSchedule.length === 0 ? (
                  <Skeleton rows={8}/>
                ) : (
                  <TwoWeekScheduleCalendar
                    selectedDate={selectedDate}
                    events={combinedSchedule}
                    notes={selectedWeekNotes}
                    weeklyPlanError={weeklyPlanError}
                    dutyScheduleError={dutyScheduleError}
                    sourceSheetCount={weeklyPlan.sourceSheets.length}
                    onSelectDate={setSelectedDate}
                    neisConfigured={hasNeisApiKey}
                    onOpenHelp={() => onNavigate('help')}
                    onOpenCalendar={() => onNavigate('calendar')}
                    showNeis={showNeis}
                    onToggleNeis={value => void saveConfig({ showNeisSchedule: value })}
                    creativeScheduleError={creativeScheduleError}
                  />
                )}
              </DashCard>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DashCard
                  icon={<CloudSun size={14} className="text-sky-400"/>}
                  title="날씨"
                  badge="주간 예보"
                  badgeColor="sky"
                >
                  {weatherLoading
                    ? <Skeleton rows={3}/>
                    : weather
                      ? (
                        <div className="space-y-3">
                          <WeatherTodayView data={weather} displayName={weatherPlace} label="학교" />
                          {weather.weekly.length > 0 && (
                            <div className="pt-3 border-t border-white/5 min-w-0">
                              <WeatherForecastView data={weather} />
                            </div>
                          )}
                          {config.secondLocationName && weather2 && (
                            <div className="pt-3 border-t border-white/5">
                              <WeatherTodayView data={weather2} displayName={weather2Place} label={config.secondLocationName} />
                            </div>
                          )}
                        </div>
                      )
                      : <Empty text="날씨 정보를 불러올 수 없습니다." />}
                </DashCard>

                <DashCard
                  icon={<Utensils size={14} className="text-amber-400"/>}
                  title="급식"
                  badge={selectedDate.slice(5).replace('-','/')}
                  badgeColor="amber"
                >
                  {!hasNeisApiKey ? (
                    <SetupGuide
                      title="NEIS API 키를 입력하면 급식을 볼 수 있습니다."
                      buttonLabel="사용 매뉴얼에서 입력 방법 보기"
                      onClick={() => onNavigate('help')}
                    />
                  ) : loading ? <Skeleton rows={4}/> : meal.length > 0 ? (
                    <div className="space-y-3">
                      {meal.map(m => <MealItem key={m.mealType} meal={m} />)}
                    </div>
                  ) : (
                    <Empty text="해당 날짜 급식 정보가 없습니다." />
                  )}
                  {!loading && nextMeal.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <p className="text-[10px] font-semibold text-amber-300/80 mb-2">
                        다음날 {format(addDays(new Date(`${selectedDate}T00:00:00`), 1), 'M/d', { locale: ko })}
                      </p>
                      <div className="space-y-2">
                        {nextMeal.map(m => <MealItem key={m.mealType} meal={m} compact />)}
                      </div>
                    </div>
                  )}
                </DashCard>
              </div>
            </div>

            <DashCard icon={<BookOpen size={14} className="text-sky-400"/>} title="시간표" badge="주간" badgeColor="sky" className="h-full self-stretch">
              <TimetableSection
                timetable={timetable}
                teacherTT={teacherTT}
                sharedTeacher={sharedTeacher}
                selectedDate={selectedDate}
                config={config}
                periodRanges={periodRanges}
                currentTime={currentTime}
                classStatus={classStatus}
                onNavigate={onNavigate}
                timetableChanges={timetableChanges}
              />
            </DashCard>
          </div>
        </>
      )}

      {/* ── 공유 업무 · 개인 업무 · 개인 메모 ── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SharedTasksWidget
          tasks={sharedTasks}
          teacherName={config.teacherName?.trim() ?? ''}
          onOpen={() => onNavigate('staff_tasks')}
          onSettings={() => onNavigate('settings')}
          onComplete={async task => {
            const teacherName = config.teacherName?.trim()
            if (!teacherName) return
            const own = task.responses.find(response => response.teacherName === teacherName)
            await submitStaffChecklist(task.id, teacherName, task.items.map(item => item.id), own?.memo ?? '')
            setSharedTasks(await listStaffChecklists(teacherName, '', true))
          }}
        />
        <PersonalTasksWidget
          tasks={personalTasks}
          onOpenCalendar={() => onNavigate('calendar')}
          onToggle={async task => {
            const updated = personalTasks.map(item => item.id === task.id
              ? { ...item, completed: !item.completed, updatedAt: new Date().toISOString() }
              : item)
            setPersonalTasks(await savePersonalTasks(updated))
          }}
        />
        <PersonalMemoWidget value={personalMemo} onChange={setPersonalMemo} loaded={memoLoaded} />
      </div>

      {/* ── 즐겨찾기 섹션 ── */}
      {favorites.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-5 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 inline-block" />
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>즐겨찾기</h2>
            <span className="text-xs text-slate-600 ml-1">드래그로 순서 변경</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={favorites} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-2">
                {favorites.map(id => {
                  const item = allItemsMap[id]
                  if (!item) return null
                  return (
                    <SortableCard
                      key={id}
                      item={item}
                      color={ITEM_COLOR_MAP[id] ?? 'slate'}
                      onNavigate={onNavigate}
                      onToggleFav={toggleFavorite}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* ── 전체 프로그램 포트폴리오 ── */}
      <div className="mt-8 pb-4">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-1.5 h-5 rounded-sm bg-amber-400 inline-block" />
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>전체 프로그램</h2>
          <span className="text-xs text-slate-600">(★ 즐겨찾기 추가 가능 · 즐겨찾기에서 ⠿ 드래그로 순서 편집)</span>
        </div>
        {PORTFOLIO_GROUPS.map(({ group, color, items }) => {
          const c = COLOR_MAP[color] ?? COLOR_MAP.slate
          return (
            <div key={group} className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', c.dot)} />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{group}</h3>
              </div>
              {items.filter(i => !i.hidden).length === 0 ? (
                <p className="text-xs text-slate-600 italic">항목이 없습니다.</p>
              ) : null}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {items.filter(i => !i.hidden).map(item => {
                  const Icon = item.icon
                  const isFav = favorites.includes(item.id)
                  return (
                    <div key={item.id} className="relative group">
                      <button
                        onClick={() => onNavigate(item.id)}
                        className="w-full text-left p-4 rounded-[16px_16px_16px_5px] bg-surface-800 border border-white/5 hover:border-amber-500/45 hover:bg-surface-700 transition-all duration-200 active:scale-[0.98] shadow-sm"
                      >
                        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center mb-3', c.bg)}>
                          <Icon size={16} className={c.icon} />
                        </div>
                        <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                        <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
                        {item.badge && (
                          <span className="mt-2 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500 text-white">
                            {item.badge}
                          </span>
                        )}
                      </button>
                      {/* 즐겨찾기 토글 버튼 */}
                      <button
                        onClick={() => toggleFavorite(item.id)}
                        className={clsx(
                          'absolute top-2 right-2 transition-all',
                          isFav
                            ? 'opacity-70 hover:opacity-100 text-amber-400'
                            : 'opacity-0 group-hover:opacity-50 hover:!opacity-100 text-slate-400 hover:text-amber-400'
                        )}
                        title={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                      >
                        <Star size={13} fill={isFav ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 이번 주 · 다음 주 일정 ─────────────────────────────────────
function TwoWeekScheduleCalendar({
  selectedDate,
  events,
  notes,
  weeklyPlanError,
  dutyScheduleError,
  sourceSheetCount,
  onSelectDate,
  neisConfigured,
  onOpenHelp,
  onOpenCalendar,
  showNeis,
  onToggleNeis,
  creativeScheduleError,
}: {
  selectedDate: string
  events: DashboardScheduleEvent[]
  notes: WeeklyPlanNote[]
  weeklyPlanError: string
  dutyScheduleError: string
  sourceSheetCount: number
  onSelectDate: (date: string) => void
  neisConfigured: boolean
  onOpenHelp: () => void
  onOpenCalendar: () => void
  showNeis: boolean
  onToggleNeis: (value: boolean) => void
  creativeScheduleError: string
}) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
  const weeks = [0, 1].map(week => Array.from({ length: 7 }, (_, day) => addDays(weekStart, week * 7 + day)))
  const selectedYmd = toYmd(selectedDate)
  const todayYmd = toYmd(todayStr())
  const eventsByDate = new Map<string, DashboardScheduleEvent[]>()
  for (const event of events) {
    const list = eventsByDate.get(event.date) ?? []
    list.push(event)
    eventsByDate.set(event.date, list)
  }
  const selectedEvents = eventsByDate.get(selectedYmd) ?? []

  const sourceLabel = (event: DashboardScheduleEvent) => event.source === 'weekly'
    ? event.department
    : event.source === 'committee'
      ? event.department
      : event.source === 'sharedWork'
        ? '공유 업무'
      : event.source === 'personal'
        ? '개인'
        : event.source === 'gateDuty'
          ? '등교지도'
          : event.source === 'mealDuty'
            ? '급식지도'
          : event.source === 'creative'
            ? '창체'
            : event.source === 'schoolEvent'
              ? '창체 학사일정'
              : event.source === 'timetableChange'
                ? '수업변경'
                : 'NEIS'
  const sourceClass = (event: DashboardScheduleEvent) => event.source === 'weekly'
    ? 'border-sky-400 bg-sky-500/15 text-sky-200'
    : event.source === 'committee'
      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
      : event.source === 'sharedWork'
        ? 'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-200'
      : event.source === 'personal'
        ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
        : event.source === 'gateDuty'
          ? 'duty-event-text border-cyan-500 bg-cyan-500/15 font-semibold'
          : event.source === 'mealDuty'
            ? 'duty-event-text border-orange-500 bg-orange-500/15 font-semibold'
          : event.source === 'creative'
            ? 'border-teal-400 bg-teal-500/15 text-teal-200'
            : event.source === 'schoolEvent'
              ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200'
              : event.source === 'timetableChange'
                ? 'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-200 font-semibold'
                : 'border-violet-400 bg-violet-500/15 text-violet-200'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <span className={clsx('flex items-center gap-1', neisConfigured ? 'text-violet-300' : 'text-slate-600')}><span className="h-2 w-2 rounded-full bg-violet-400" />NEIS 학사일정</span>
          <span className="flex items-center gap-1 text-sky-300"><span className="h-2 w-2 rounded-full bg-sky-400" />주간계획</span>
          <span className="flex items-center gap-1 text-teal-300"><span className="h-2 w-2 rounded-full bg-teal-400" />창체</span>
          <span className="flex items-center gap-1 text-indigo-300"><span className="h-2 w-2 rounded-full bg-indigo-400" />창체 학사일정</span>
          <span className="flex items-center gap-1 text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-400" />내 위원회</span>
          <span className="flex items-center gap-1 text-fuchsia-300"><span className="h-2 w-2 rounded-full bg-fuchsia-400" />공유 업무</span>
          <span className="flex items-center gap-1 text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />개인 업무</span>
          <span className="duty-event-text flex items-center gap-1 font-semibold"><span className="h-2 w-2 rounded-full bg-cyan-500" />등교지도</span>
          <span className="duty-event-text flex items-center gap-1 font-semibold"><span className="h-2 w-2 rounded-full bg-orange-500" />급식지도</span>
          <span className="flex items-center gap-1 text-fuchsia-300"><span className="h-2 w-2 rounded-full bg-fuchsia-400" />수업변경</span>
        </div>
        <div className="flex items-center gap-2"><label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-violet-400/15 bg-violet-500/5 px-2 py-1 text-[10px] text-violet-200"><input type="checkbox" checked={showNeis} onChange={event => onToggleNeis(event.target.checked)} />NEIS 학사일정 켜기</label><button onClick={onOpenCalendar} className="btn-ghost flex items-center gap-1.5 text-[10px]"><CalendarDays size={12} />월간 캘린더<ArrowUpRight size={11} /></button></div>
      </div>

      {!neisConfigured && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5">
          <p className="text-[11px] text-violet-200">NEIS API 키를 입력하면 학사일정도 함께 볼 수 있습니다.</p>
          <button onClick={onOpenHelp} className="text-[10px] font-bold text-violet-300 underline underline-offset-2">사용 매뉴얼 바로가기</button>
        </div>
      )}

      <div className="space-y-3">
        {weeks.map((week, weekIndex) => (
          <div key={format(week[0], 'yyyyMMdd')} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <div className={clsx('flex items-center justify-between border-b px-3 py-2', weekIndex === 0 ? 'border-amber-400/20 bg-amber-400/10' : 'border-sky-400/15 bg-sky-400/5')}>
              <p className={clsx('text-[11px] font-black', weekIndex === 0 ? 'text-amber-300' : 'text-sky-300')}>{weekIndex === 0 ? '이번 주' : '다음 주'}</p>
              <p className="text-[10px] text-slate-500">{format(week[0], 'M월 d일')} – {format(week[6], 'M월 d일')}</p>
            </div>
            <div className="grid grid-cols-7 gap-px bg-white/5">
              {week.map((day, dayIndex) => {
                const ymd = format(day, 'yyyyMMdd')
                const dateValue = format(day, 'yyyy-MM-dd')
                const dayEvents = eventsByDate.get(ymd) ?? []
                const isTodayCell = ymd === todayYmd
                const isSelected = ymd === selectedYmd
                return (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => onSelectDate(dateValue)}
                    className={clsx(
                      'min-h-[142px] min-w-0 bg-surface-800/95 p-2 text-left transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-400/70',
                      isSelected && 'bg-violet-500/10 ring-2 ring-inset ring-violet-400/70',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className={clsx('text-[9px] font-semibold', dayIndex === 0 ? 'text-rose-400' : dayIndex === 6 ? 'text-sky-400' : 'text-slate-500')}>{format(day, 'EEE', { locale: ko })}</span>
                      <span className={clsx('grid h-6 w-6 place-items-center rounded-full text-[11px] font-black', isTodayCell ? 'bg-amber-400 text-slate-950' : dayIndex === 0 ? 'text-rose-300' : dayIndex === 6 ? 'text-sky-300' : 'text-slate-200')}>{format(day, 'd')}</span>
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 5).map((event, index) => (
                        <div key={`${event.source}-${event.department ?? ''}-${index}`} className={clsx('rounded border-l-2 px-1.5 py-1 text-[9px] leading-tight', sourceClass(event), event.completed && 'line-through opacity-50')} title={`${sourceLabel(event)} · ${event.eventName}`}>
                          <span className="block truncate text-[8px] font-bold opacity-70">{sourceLabel(event)}</span>
                          <span className="block truncate">{event.eventName.replace(/\s*\n\s*/g, ' · ')}</span>
                        </div>
                      ))}
                      {dayEvents.length > 5 && <span className="block pl-1 text-[8px] font-semibold text-slate-500">+{dayEvents.length - 5}개 더보기</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-violet-400/15 bg-violet-500/5 p-3">
          <p className="mb-2 text-[10px] font-bold text-violet-300">{format(new Date(`${selectedDate}T00:00:00`), 'M월 d일 (EEE)', { locale: ko })} 선택 일정</p>
          {selectedEvents.length > 0 ? <div className="max-h-28 space-y-1.5 overflow-y-auto">
            {selectedEvents.map((event, index) => <div key={`${event.source}-${event.department ?? ''}-${index}`} className="flex items-start gap-2 text-[11px] leading-relaxed"><span className={clsx('mt-0.5 flex-shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold', sourceClass(event))}>{sourceLabel(event)}</span><span className={clsx('whitespace-pre-line text-slate-300', event.completed && 'line-through text-slate-500')}>{event.eventName}</span></div>)}
          </div> : <p className="text-[11px] text-slate-500">선택한 날짜에 등록된 일정이 없습니다.</p>}
        </div>
        <div className="rounded-xl border border-sky-400/15 bg-sky-500/5 p-3">
          <p className="mb-2 text-[10px] font-bold text-sky-300">선택한 주의 기타·참고사항</p>
          {notes.length > 0 ? <div className="max-h-28 space-y-1.5 overflow-y-auto">{notes.map((note, index) => <div key={`${note.department}-${index}`} className="text-[11px] leading-relaxed text-slate-400"><span className="font-semibold text-sky-400/90">{note.department}</span><span className="mx-1 text-slate-600">·</span><span className="whitespace-pre-line">{note.content}</span></div>)}</div> : <p className="text-[11px] text-slate-500">해당 주의 기타·참고사항이 없습니다.</p>}
        </div>
      </div>

      {weeklyPlanError && <p className="mt-2 text-[10px] text-amber-400">{weeklyPlanError} NEIS·개인 일정만 표시합니다.</p>}
      {dutyScheduleError && <p className="mt-2 text-[10px] text-orange-400">{dutyScheduleError}</p>}
      {creativeScheduleError && <p className="mt-2 text-[10px] text-teal-300">{creativeScheduleError}</p>}
      {!weeklyPlanError && sourceSheetCount > 0 && <p className="mt-2 text-[9px] text-slate-600">교무기획부 주간계획 {sourceSheetCount}개 시트 자동 반영</p>}
    </div>
  )
}

function SharedTasksWidget({
  tasks,
  teacherName,
  onOpen,
  onSettings,
  onComplete,
}: {
  tasks: StaffChecklist[]
  teacherName: string
  onOpen: () => void
  onSettings: () => void
  onComplete: (task: StaffChecklist) => Promise<void>
}) {
  const [lastViewedAt, setLastViewedAt] = useState<string | null>(null)
  useEffect(() => {
    if (!teacherName) { setLastViewedAt(''); return }
    void loadSharedWorkLastViewedAt(teacherName).then(setLastViewedAt)
    return subscribeSharedWorkViewed((name, viewedAt) => {
      if (name === teacherName) setLastViewedAt(viewedAt)
    })
  }, [teacherName])

  const incomplete = tasks.filter(task => !isSharedWorkComplete(task, teacherName))
  const newCount = lastViewedAt === null ? 0 : incomplete.filter(task => isNewSharedWork(task, lastViewedAt)).length
  const todayCount = incomplete.filter(task => classifySharedWorkDeadline(task, teacherName) === 'today').length
  const dueSoonCount = incomplete.filter(task => classifySharedWorkDeadline(task, teacherName) === 'dueSoon').length
  const overdueCount = incomplete.filter(task => classifySharedWorkDeadline(task, teacherName) === 'overdue').length
  const rank = { overdue: 0, today: 1, dueSoon: 2, later: 3, complete: 4 }
  const visible = [...incomplete].sort((a, b) => {
    const newDiff = Number(!(lastViewedAt !== null && isNewSharedWork(a, lastViewedAt))) - Number(!(lastViewedAt !== null && isNewSharedWork(b, lastViewedAt)))
    return newDiff || rank[classifySharedWorkDeadline(a, teacherName)] - rank[classifySharedWorkDeadline(b, teacherName)] || (a.deadline || '9999').localeCompare(b.deadline || '9999')
  }).slice(0, 6)

  const alertLabel = (task: StaffChecklist) => {
    if (lastViewedAt !== null && isNewSharedWork(task, lastViewedAt)) return { label: '새 업무', className: 'bg-violet-500/15 text-violet-300' }
    const category = classifySharedWorkDeadline(task, teacherName)
    if (category === 'overdue') return { label: '기한 초과', className: 'bg-rose-500/15 text-rose-300' }
    if (category === 'today') return { label: '오늘 마감', className: 'bg-amber-500/15 text-amber-300' }
    if (category === 'dueSoon') return { label: '마감 임박', className: 'bg-sky-500/15 text-sky-300' }
    return null
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/15"><BellRing size={14} className="text-violet-400" /></div><div><p className="text-sm font-bold text-white">업무 알림</p><p className="text-[10px] text-slate-500">새 업무와 마감 상태 자동 분류</p></div></div>
        <button onClick={onOpen} className="btn-ghost flex items-center gap-1.5 text-[10px]">업무센터<ArrowUpRight size={11} /></button>
      </div>
      {!teacherName ? <button onClick={onSettings} className="w-full rounded-xl border border-dashed border-violet-400/20 py-6 text-center text-[11px] text-violet-300">환경설정에서 이름을 등록하면 배부된 업무를 볼 수 있습니다.</button>
        : visible.length ? <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 text-[9px] font-bold"><span className="rounded-full bg-violet-500/12 px-2 py-1 text-violet-300">새 업무 {newCount}</span><span className="rounded-full bg-amber-500/12 px-2 py-1 text-amber-300">오늘 {todayCount}</span><span className="rounded-full bg-sky-500/12 px-2 py-1 text-sky-300">임박 {dueSoonCount}</span><span className="rounded-full bg-rose-500/12 px-2 py-1 text-rose-300">초과 {overdueCount}</span></div>
          {visible.map(task => { const alert = alertLabel(task); return <div key={task.id} className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.025] p-2.5"><button onClick={() => void onComplete(task)} className="group mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded border border-slate-600 text-violet-300 hover:border-violet-400" aria-label="업무 전체 완료"><Check size={11} className="opacity-0 transition-opacity group-hover:opacity-100" /></button><button onClick={onOpen} className="min-w-0 flex-1 text-left"><div className="flex min-w-0 items-center gap-1.5"><p className="truncate text-[11px] font-semibold text-slate-200">{task.title}</p>{alert && <span className={clsx('flex-shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold', alert.className)}>{alert.label}</span>}</div><p className="mt-0.5 text-[9px] text-slate-500">{task.deadline || '기한 없음'}{task.departmentNames.length ? ` · ${task.departmentNames.join('·')}` : ''}{task.priority === 'high' ? ' · 중요' : ''}</p></button></div>})}
        </div> : <button onClick={onOpen} className="w-full rounded-xl border border-dashed border-white/10 py-6 text-center text-[11px] text-slate-500 hover:border-violet-400/30 hover:text-violet-300">현재 확인할 공유 업무가 없습니다.</button>}
    </section>
  )
}

function PersonalTasksWidget({
  tasks,
  onOpenCalendar,
  onToggle,
}: {
  tasks: PersonalTask[]
  onOpenCalendar: () => void
  onToggle: (task: PersonalTask) => Promise<void>
}) {
  const today = todayStr()
  const end = format(addDays(new Date(), 13), 'yyyy-MM-dd')
  const visible = tasks.filter(task => !task.completed && task.date <= end).slice(0, 7)
  const overdue = tasks.filter(task => !task.completed && task.date < today).length

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15"><ListTodo size={14} className="text-emerald-400" /></div><div><p className="text-sm font-bold text-white">개인 업무</p><p className="text-[10px] text-slate-500">오늘부터 2주 안에 확인할 업무</p></div></div>
        <button onClick={onOpenCalendar} className="btn-ghost flex items-center gap-1.5 text-[10px]"><CalendarDays size={12} />등록·관리<ArrowUpRight size={11} /></button>
      </div>
      {overdue > 0 && <p className="mb-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-rose-300">기한이 지난 업무가 {overdue}개 있습니다.</p>}
      {visible.length ? <div className="grid gap-2 md:grid-cols-2">
        {visible.map(task => (
          <div key={task.id} className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.025] p-2.5">
            <button onClick={() => void onToggle(task)} className="group mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded border border-slate-600 text-emerald-300 hover:border-emerald-400" aria-label="업무 완료"><Check size={11} className="opacity-0 transition-opacity group-hover:opacity-100" /></button>
            <button onClick={onOpenCalendar} className="min-w-0 flex-1 text-left"><p className="truncate text-[11px] font-semibold text-slate-200">{task.title}</p><p className={clsx('mt-0.5 text-[9px]', task.date < today ? 'text-rose-400' : task.date === today ? 'text-amber-300' : 'text-slate-500')}>{task.date}{task.time ? ` · ${task.time}` : ''}{task.priority === 'high' ? ' · 중요' : ''}</p></button>
          </div>
        ))}
      </div> : <button onClick={onOpenCalendar} className="w-full rounded-xl border border-dashed border-white/10 py-6 text-center text-[11px] text-slate-500 hover:border-emerald-400/30 hover:text-emerald-300">등록된 개인 업무가 없습니다. 캘린더에서 첫 업무를 등록해보세요.</button>}
    </section>
  )
}

function PersonalMemoWidget({ value, onChange, loaded }: { value: string; onChange: (value: string) => void; loaded: boolean }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/15"><StickyNote size={14} className="text-amber-400" /></div><div><p className="text-sm font-bold text-white">개인 메모</p><p className="text-[10px] text-emerald-400">이 PC에만 자동 저장</p></div></div>
      <textarea value={value} onChange={event => onChange(event.target.value)} onBlur={() => { void savePersonalMemo(value) }} rows={7} disabled={!loaded} placeholder="잠깐 기억해둘 내용을 적으세요. 학교 공유 서버에는 전송되지 않습니다." className="w-full resize-none text-[11px] leading-relaxed" />
      <p className="mt-2 text-right text-[9px] text-slate-600">{loaded ? '입력 후 자동 저장됩니다.' : '메모 불러오는 중...'}</p>
    </section>
  )
}

// ─── 이전 월간 달력 구현(대시보드에서는 2주 보기로 대체) ─────────
function MonthScheduleCalendar({
  selectedDate,
  events,
  notes,
  weeklyPlanError,
  sourceSheetCount,
  onSelectDate,
  neisConfigured,
  onOpenHelp,
}: {
  selectedDate: string
  events: DashboardScheduleEvent[]
  notes: WeeklyPlanNote[]
  weeklyPlanError: string
  sourceSheetCount: number
  onSelectDate: (date: string) => void
  neisConfigured: boolean
  onOpenHelp: () => void
}) {
  const viewDate = new Date(`${selectedDate}T00:00:00`)
  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  )
  const selectedYmd = toYmd(selectedDate)
  const todayYmd = toYmd(todayStr())
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
  const selectedWeekStart = startOfWeek(viewDate, { weekStartsOn: 0 })
  const currentWeekInGrid = currentWeekStart >= calendarStart && currentWeekStart <= calendarEnd
  const focusWeekYmd = format(currentWeekInGrid ? currentWeekStart : selectedWeekStart, 'yyyyMMdd')
  const currentWeekYmd = format(currentWeekStart, 'yyyyMMdd')

  const eventsByDate = new Map<string, DashboardScheduleEvent[]>()
  for (const event of events) {
    const list = eventsByDate.get(event.date) ?? []
    list.push(event)
    eventsByDate.set(event.date, list)
  }
  const selectedEvents = eventsByDate.get(selectedYmd) ?? []

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <span className={clsx('flex items-center gap-1', neisConfigured ? 'text-violet-300' : 'text-slate-600')}>
            <span className="w-2 h-2 rounded-full bg-violet-400" />NEIS 학사일정
          </span>
          <span className="flex items-center gap-1 text-sky-300">
            <span className="w-2 h-2 rounded-full bg-sky-400" />교무기획부 주간계획
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400" />내 위원회
          </span>
        </div>
        <span className="text-[10px] text-amber-300/80">이번 주는 크게 표시됩니다</span>
      </div>

      {!neisConfigured && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5">
          <p className="text-[11px] text-violet-200">NEIS API 키를 입력하면 학사일정도 함께 볼 수 있습니다.</p>
          <button onClick={onOpenHelp} className="text-[10px] font-bold text-violet-300 underline underline-offset-2">
            사용 매뉴얼 바로가기
          </button>
        </div>
      )}

      <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5">
        <div className="grid grid-cols-7 gap-px bg-white/5">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
            <div
              key={day}
              className={clsx(
                'bg-surface-900/95 py-2 text-center text-[10px] font-bold',
                index === 0 ? 'text-rose-400' : index === 6 ? 'text-sky-400' : 'text-slate-400',
              )}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="space-y-px bg-white/5">
          {weeks.map(week => {
            const weekStartYmd = format(week[0], 'yyyyMMdd')
            const isFocusWeek = weekStartYmd === focusWeekYmd
            const isCurrentWeek = weekStartYmd === currentWeekYmd
            return (
              <div
                key={weekStartYmd}
                className={clsx(
                  'relative grid grid-cols-7 gap-px bg-white/5',
                  isFocusWeek && 'ring-1 ring-inset ring-amber-400/45',
                )}
              >
                {isCurrentWeek && (
                  <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 px-2 py-0.5 text-[8px] font-black text-slate-950 shadow">
                    이번 주
                  </span>
                )}
                {week.map((day, dayIndex) => {
                  const dateYmd = format(day, 'yyyyMMdd')
                  const dateValue = format(day, 'yyyy-MM-dd')
                  const dayEvents = eventsByDate.get(dateYmd) ?? []
                  const maxVisible = isFocusWeek ? 5 : 2
                  const visibleEvents = dayEvents.slice(0, maxVisible)
                  const moreCount = dayEvents.length - visibleEvents.length
                  const isSelected = dateYmd === selectedYmd
                  const isTodayCell = dateYmd === todayYmd
                  const inMonth = isSameMonth(day, viewDate)

                  return (
                    <button
                      key={dateYmd}
                      type="button"
                      onClick={() => onSelectDate(dateValue)}
                      className={clsx(
                        'min-w-0 text-left p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-400/70',
                        isFocusWeek ? 'min-h-[128px] bg-amber-400/5' : 'min-h-[82px] bg-surface-800/95',
                        isSelected ? 'ring-2 ring-inset ring-violet-400/70 bg-violet-500/10' : 'hover:bg-white/5',
                        !inMonth && 'opacity-40',
                      )}
                      aria-label={`${format(day, 'M월 d일')} 일정 ${dayEvents.length}개`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={clsx(
                          'w-5 h-5 grid place-items-center rounded-full text-[10px] font-bold',
                          isTodayCell
                            ? 'bg-amber-400 text-slate-950'
                            : dayIndex === 0
                              ? 'text-rose-400'
                              : dayIndex === 6
                                ? 'text-sky-400'
                                : inMonth ? 'text-slate-300' : 'text-slate-600',
                        )}>
                          {format(day, 'd')}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[8px] text-slate-600">{dayEvents.length}</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {visibleEvents.map((event, index) => (
                          <div
                            key={`${event.source}-${event.department ?? ''}-${index}`}
                            title={`${event.source === 'weekly' ? event.department : event.source === 'committee' ? event.department : 'NEIS'} · ${event.eventName}`}
                            className={clsx(
                              'rounded px-1 py-0.5 text-[9px] leading-tight',
                              event.source === 'weekly'
                                ? 'bg-sky-500/15 text-sky-200 border-l-2 border-sky-400'
                                : event.source === 'committee'
                                  ? 'bg-amber-500/15 text-amber-200 border-l-2 border-amber-400'
                                : 'bg-violet-500/15 text-violet-200 border-l-2 border-violet-400',
                            )}
                          >
                            {isFocusWeek && (
                              <span className="block truncate text-[8px] font-bold opacity-70">
                                {event.source === 'weekly' ? event.department : event.source === 'committee' ? event.department : 'NEIS'}
                              </span>
                            )}
                            <span className="block truncate">{event.eventName.replace(/\s*\n\s*/g, ' · ')}</span>
                          </div>
                        ))}
                        {moreCount > 0 && (
                          <span className="block pl-1 text-[8px] font-semibold text-slate-500">+{moreCount}개 더보기</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-violet-400/15 bg-violet-500/5 p-3">
          <p className="text-[10px] font-bold text-violet-300 mb-2">
            {format(viewDate, 'M월 d일 (EEE)', { locale: ko })} 선택 일정
          </p>
          {selectedEvents.length > 0 ? (
            <div className="space-y-1.5">
              {selectedEvents.map((event, index) => (
                <div key={`${event.source}-${event.department ?? ''}-${index}`} className="flex items-start gap-2 text-[11px] leading-relaxed">
                  <span className={clsx(
                    'mt-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold flex-shrink-0',
                    event.source === 'weekly'
                      ? 'bg-sky-500/15 text-sky-300'
                      : event.source === 'committee'
                        ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-violet-500/15 text-violet-300',
                  )}>
                    {event.source === 'weekly' ? event.department : event.source === 'committee' ? event.department : 'NEIS'}
                  </span>
                  <span className="text-slate-300 whitespace-pre-line">{event.eventName}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">선택한 날짜에 등록된 일정이 없습니다.</p>
          )}
        </div>

        <div className="rounded-xl border border-sky-400/15 bg-sky-500/5 p-3">
          <p className="text-[10px] font-bold text-sky-300 mb-2">선택한 주의 기타·참고사항</p>
          {notes.length > 0 ? (
            <div className="space-y-1.5 max-h-28 overflow-y-auto scrollbar-none">
              {notes.map((note, index) => (
                <div key={`${note.department}-${index}`} className="text-[11px] text-slate-400 leading-relaxed">
                  <span className="text-sky-400/90 font-semibold">{note.department}</span>
                  <span className="mx-1 text-slate-600">·</span>
                  <span className="whitespace-pre-line">{note.content}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">해당 주의 기타·참고사항이 없습니다.</p>
          )}
        </div>
      </div>

      {events.length === 0 && (
        <p className="text-[10px] text-slate-500 mt-2">이번 달 학사일정과 주간계획이 없습니다.</p>
      )}
      {weeklyPlanError && (
        <p className="text-[10px] text-amber-400 mt-2">{weeklyPlanError} NEIS 일정만 표시합니다.</p>
      )}
      {!weeklyPlanError && sourceSheetCount > 0 && (
        <p className="text-[9px] text-slate-600 mt-2">
          교무기획부 주간계획 {sourceSheetCount}개 시트 자동 반영
        </p>
      )}
    </div>
  )
}

// ─── ClassStatusBanner ────────────────────────────────────────────
function ClassStatusBanner({ status }: { status: ClassStatus }) {
  if (status.type === 'before')
    return (
      <div className="flex items-center gap-2 bg-slate-500/10 border border-white/10 rounded-xl px-3 py-2 mb-3 text-xs">
        <span>🌅</span>
        <span className="text-slate-400 font-medium">수업 시작 전</span>
        <span className="text-slate-600 ml-auto">{status.startTime} 시작</span>
      </div>
    )
  if (status.type === 'after')
    return (
      <div className="flex items-center gap-2 bg-slate-500/10 border border-white/10 rounded-xl px-3 py-2 mb-3 text-xs">
        <span>🌙</span>
        <span className="text-slate-400 font-medium">오늘 수업 종료</span>
      </div>
    )
  if (status.type === 'class')
    return (
      <div className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/30 rounded-xl px-3 py-2 mb-3 text-xs">
        <span className="text-base leading-none">📖</span>
        <span className="font-bold text-sky-300">{status.period}교시 수업 중</span>
        {status.subject && <span className="text-sky-400 truncate">· {status.subject}</span>}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <span className="font-semibold text-sky-200">{status.remaining}분 남음</span>
          <span className="text-sky-500">~{status.endTime}</span>
        </div>
      </div>
    )
  if (status.type === 'break') {
    if (status.isLunch)
      return (
        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 mb-3 text-xs">
          <span className="text-base leading-none">🍱</span>
          <span className="font-bold text-amber-300">점심시간</span>
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <span className="font-semibold text-amber-200">{status.remaining}분 남음</span>
            <span className="text-amber-500">5교시 {status.endTime}</span>
          </div>
        </div>
      )
    return (
      <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2 mb-3 text-xs">
        <span className="text-base leading-none">☕</span>
        <span className="font-bold text-emerald-300">쉬는 시간</span>
        <span className="text-emerald-500">{status.fromPeriod}→{status.toPeriod}교시</span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <span className="font-semibold text-emerald-200">{status.remaining}분 남음</span>
          <span className="text-emerald-500">~{status.endTime}</span>
        </div>
      </div>
    )
  }
  return null
}

// ─── TimetableSection ─────────────────────────────────────────────
function TimetableSection({
  timetable, teacherTT, sharedTeacher, selectedDate, config, periodRanges, currentTime, classStatus, onNavigate, timetableChanges
}: {
  timetable: TimetableEntry[]
  teacherTT: TimetableEntry[]
  sharedTeacher: TeacherTimetable | null
  selectedDate: string
  config: import('../types').AppConfig
  periodRanges: [number, number, string][]
  currentTime: Date
  classStatus: ClassStatus | null
  onNavigate: (id: string) => void
  timetableChanges: TimetableChangeRequest[]
}) {
  const weekDates = getWeekDates(selectedDate)
  const DAY = ['월','화','수','목','금']
  const todayYmd = toYmd(todayStr())
  const hasTeacher = !!(config.teacherClasses?.length)

  const nowMins = currentTime.getHours() * 60 + currentTime.getMinutes()
  const currentPeriod = periodRanges.find(([s, e]) => nowMins >= s && nowMins <= e)?.[2] ?? null

  // 점심시간 — 설정값 우선, 없으면 4교시 종료~5교시 시작으로 자동 계산
  const lunch = UNGCHEON_LUNCH

  if (!config.teacherName?.trim()) {
    return (
      <SetupGuide
        title="환경설정에서 이름을 설정하면 내 교사 시간표가 표시됩니다."
        buttonLabel="이름 설정 바로가기"
        onClick={() => onNavigate('settings')}
      />
    )
  }

  if (!config.grade && !config.classNm && !hasTeacher && !sharedTeacher) {
    return (
      <>
        {classStatus && classStatus.type !== 'weekend' && <ClassStatusBanner status={classStatus} />}
        <Empty text="설정에서 학년·반을 입력하면 주간 시간표가 표시됩니다." />
      </>
    )
  }

  return (
    <div className="space-y-4">
      {classStatus && classStatus.type !== 'weekend' && (
        <ClassStatusBanner status={classStatus} />
      )}

      {/* 관리자가 업로드한 공유 교사 시간표 */}
      {sharedTeacher && (
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-semibold text-violet-300 bg-violet-500/15 px-2 py-1 rounded-lg">👩‍🏫 {sharedTeacher.name} 선생님</span>
            <span className="text-[10px] text-slate-500">관리자 공유 시간표 · 원본 읽기 전용</span>
          </div>
          <WeekGrid
            weekDates={weekDates}
            DAY={DAY}
            todayYmd={todayYmd}
            currentPeriod={isToday(selectedDate) ? currentPeriod : null}
            periodRanges={periodRanges}
            lunch={lunch}
            renderCell={(date, period) => {
              const dayIndex = weekDates.indexOf(date)
              const slotIndex = dayIndex * 7 + Number(period) - 1
              const slot = sharedTeacher.slots[slotIndex]
              const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
              const change = timetableChanges.find(item => item.status === 'approved' && (
                (item.originalDate === isoDate && item.originalSlotIndex === slotIndex) ||
                (item.kind === 'exchange' && item.replacementDate === isoDate && item.replacementSlotIndex === slotIndex)
              ))
              if (change) {
                const firstSide = change.originalDate === isoDate && change.originalSlotIndex === slotIndex
                const assignedTeacher = firstSide ? change.replacementTeacher : change.originalTeacher
                const className = firstSide ? change.originalClass : change.replacementClass
                const subject = firstSide ? change.originalSubject : change.replacementSubject
                if (assignedTeacher === sharedTeacher.name) return { text: className || subject, sub: `${subject} · 승인 반영`, colorClass: 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30', isNow: date === todayYmd && period === currentPeriod }
                if (change.originalTeacher === sharedTeacher.name || change.replacementTeacher === sharedTeacher.name) return { text: slot?.value.split(/\r?\n/)[0] || className, sub: `변경 담당 · ${assignedTeacher}`, colorClass: 'bg-amber-500/15 text-amber-200', isNow: false }
              }
              if (!slot?.value) return null
              const lines = slot.value.split(/\r?\n/).filter(Boolean)
              const isNow = date === todayYmd && period === currentPeriod
              return {
                text: lines[0] || slot.value,
                sub: lines.slice(1).join(' · '),
                colorClass: slot.locked ? 'bg-slate-500/20 text-slate-300' : 'bg-violet-500/15 text-violet-300',
                isNow,
              }
            }}
          />
        </div>
      )}

      {/* NEIS에서 조합한 교사 시간표 — 공유 시간표가 없을 때만 사용 */}
      {!sharedTeacher && hasTeacher && config.teacherClasses && (
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-semibold text-violet-400 bg-violet-500/10 px-2 py-1 rounded-lg">👩‍🏫 내 수업</span>
            {config.teacherClasses.map((tc, idx) => {
              const c = TC_COLORS[idx % TC_COLORS.length]
              return (
                <span key={idx} className={clsx('text-[10px] px-2 py-0.5 rounded-full font-medium', c.badge)}>
                  {tc.grade}-{tc.classNm}반
                </span>
              )
            })}
          </div>
          <WeekGrid
            weekDates={weekDates}
            DAY={DAY}
            todayYmd={todayYmd}
            currentPeriod={isToday(selectedDate) ? currentPeriod : null}
            periodRanges={periodRanges}
            lunch={lunch}
            renderCell={(date, period) => {
              const entry = config.teacherClasses!.reduce<{label:string;subject:string;colorIdx:number}|null>((acc, tc, idx) => {
                if (acc) return acc
                const found = teacherTT.find(t =>
                  t.date === date &&
                  String(t.period) === period &&
                  t.grade?.trim() === tc.grade &&
                  t.classNm?.trim() === tc.classNm &&
                  t.subject?.trim() === tc.subject?.trim()
                )
                return found ? { label: `${tc.grade}-${tc.classNm}반`, subject: tc.subject, colorIdx: idx % TC_COLORS.length } : null
              }, null)
              if (!entry) return null
              const c = TC_COLORS[entry.colorIdx]
              const isNow = date === todayYmd && period === currentPeriod
              return { text: entry.label, sub: entry.subject, colorClass: clsx(c.bg, c.text), isNow }
            }}
          />
        </div>
      )}

      {/* 학생 시간표 */}
      {config.grade && config.classNm && (
        <div>
          <span className="text-[10px] font-semibold text-sky-400 bg-sky-500/10 px-2 py-1 rounded-lg mb-2 inline-block">
            👤 {config.grade}학년 {config.classNm}반
          </span>
          <WeekGrid
            weekDates={weekDates}
            DAY={DAY}
            todayYmd={todayYmd}
            currentPeriod={isToday(selectedDate) ? currentPeriod : null}
            periodRanges={periodRanges}
            lunch={lunch}
            renderCell={(date, period) => {
              const entry = timetable.find(t => t.date === date && String(t.period) === period)
              if (!entry) return null
              const isNow = date === todayYmd && period === currentPeriod
              return { text: entry.subject, sub: '', colorClass: 'bg-sky-500/10 text-sky-300', isNow }
            }}
          />
        </div>
      )}
    </div>
  )
}

function isToday(dateStr: string) { return dateStr === todayStr() }

function WeekGrid({ weekDates, DAY, todayYmd, currentPeriod, periodRanges = [], lunch, renderCell }: {
  weekDates: string[]
  DAY: string[]
  todayYmd: string
  currentPeriod: string | null
  periodRanges?: [number, number, string][]
  lunch?: { after: number; start: string; end: string } | null
  renderCell: (date: string, period: string) => { text: string; sub: string; colorClass: string; isNow: boolean } | null
}) {
  const allPeriods = Array.from({length:8}, (_,i) => String(i+1))
    .filter(p => weekDates.some(d => renderCell(d, p) !== null))
  if (allPeriods.length === 0) return <Empty text="해당 주 시간표 정보가 없습니다." />
  const maxPeriod = Math.max(...allPeriods.map(Number))

  const periodTimeMap: Record<string, [string, string]> = {}
  for (const [s, e, p] of periodRanges) {
    periodTimeMap[p] = [minsToTime(s), minsToTime(e)]
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b border-white/10">
            <th className="w-14 py-1.5 text-center text-slate-600"></th>
            {weekDates.map((d, i) => {
              const isT = d === todayYmd
              return (
                <th key={d} className="py-1.5 text-center">
                  <div className={clsx('font-semibold', isT ? 'text-violet-400' : 'text-slate-400')}>{DAY[i]}</div>
                  <div className="text-slate-600 font-normal">{d.slice(6)}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({length: maxPeriod}, (_, i) => {
            const period = String(i + 1)
            const isCurrent = period === currentPeriod
            const times = periodTimeMap[period]
            const periodRow = (
              <tr key={period} className="border-b border-white/5 last:border-0">
                <td className="py-1 pr-1 text-center">
                  <div className={clsx('font-bold', isCurrent ? 'current-period-indicator' : 'text-slate-500')}>
                    {isCurrent ? '▶' : `${period}교시`}
                  </div>
                  {times && (
                    <div className={clsx('text-[8px] leading-tight', isCurrent ? 'current-period-time' : 'text-slate-400')}>
                      {times[0]}~{times[1]}
                    </div>
                  )}
                </td>
                {weekDates.map(d => {
                  const cell = renderCell(d, period)
                  const isT = d === todayYmd
                  const isIntersection = isT && isCurrent
                  if (!cell) return (
                    <td key={d} className={clsx(
                      'py-1 text-center',
                      isIntersection ? 'ring-2 ring-inset ring-intersection' : '',
                      'text-slate-700'
                    )}>·</td>
                  )
                  return (
                    <td key={d} className={clsx(
                      'py-1 text-center leading-tight rounded-sm',
                      cell.colorClass,
                      isIntersection ? 'ring-2 ring-inset ring-intersection' : '',
                    )}>
                      <div className="font-semibold truncate px-0.5">{cell.text}</div>
                      {cell.sub && <div className="text-[9px] opacity-70 truncate px-0.5">{cell.sub}</div>}
                    </td>
                  )
                })}
              </tr>
            )
            const showLunch = lunch && i + 1 === lunch.after && maxPeriod > lunch.after
            return showLunch
              ? [periodRow, (
                  <tr key={`lunch-${period}`} className="border-b border-white/5">
                    <td className="py-1 pr-1 text-center align-middle">
                      <div className="font-bold text-amber-400">점심</div>
                      {lunch!.start && lunch!.end && (
                        <div className="text-[8px] leading-tight text-amber-300">{lunch!.start}~{lunch!.end}</div>
                      )}
                    </td>
                    <td colSpan={weekDates.length} className="py-1">
                      <div className="text-[10px] font-semibold text-amber-300 bg-amber-500/10 rounded-sm py-0.5 text-center">🍱 점심시간</div>
                    </td>
                  </tr>
                )]
              : periodRow
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── MealItem ─────────────────────────────────────────────────────
function MealItem({ meal: m, compact }: { meal: MealInfo; compact?: boolean }) {
  const [showNtr, setShowNtr] = useState(false)
  const ntrParsed: Record<string, string> = {}
  if (m.ntrInfo) {
    m.ntrInfo.split('<br/>').forEach(line => {
      const [k, v] = line.split(':')
      if (k && v) ntrParsed[k.trim()] = v.trim()
    })
  }
  const NTR_KEYS = ['탄수화물', '단백질', '지방', '칼슘']
  const hasNtr = NTR_KEYS.some(k => ntrParsed[k])

  if (compact) {
    return (
      <div className="border-b border-white/5 pb-2 last:border-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-amber-400">{m.mealType}</span>
          <span className="text-[10px] text-slate-500">{m.calories}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {m.dishNames.map(dish => (
            <span key={dish} className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full">{dish}</span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-white/5 pb-3 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-amber-400">{m.mealType}</span>
        <span className="text-[10px] text-slate-500">{m.calories}</span>
      </div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {m.dishNames.map(dish => (
          <span key={dish} className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full">{dish}</span>
        ))}
      </div>
      {hasNtr && (
        <>
          <button onClick={() => setShowNtr(v => !v)} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
            영양정보 {showNtr ? '▴' : '▾'}
          </button>
          <AnimatePresence>
            {showNtr && (
              <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5 bg-white/3 rounded-lg p-2 overflow-hidden">
                {NTR_KEYS.map(k => (
                  <div key={k} className="flex justify-between text-[10px]">
                    <span className="text-slate-500">{k}</span>
                    <span className="text-slate-300">{ntrParsed[k] ?? '-'}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────
function DashCard({ icon, title, badge, badgeColor, className, children }: {
  icon: React.ReactNode; title: string; badge?: string; badgeColor?: string; className?: string; children: React.ReactNode
}) {
  return (
    <div className={clsx('card flex flex-col', className)}>
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/5">
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">{icon}</div>
        <span className="font-semibold text-white">{title}</span>
        {badge && <span className={clsx('ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium', badgeColor === 'amber' ? 'bg-amber-500/20 text-amber-300' : badgeColor === 'violet' ? 'bg-violet-500/20 text-violet-300' : 'bg-sky-500/20 text-sky-300')}>{badge}</span>}
      </div>
      <div className="flex-1 flex flex-col min-h-0">{children}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-center text-slate-500 text-sm py-6">{text}</p>
}

function SetupGuide({
  title,
  buttonLabel,
  onClick,
}: {
  title: string
  buttonLabel: string
  onClick: () => void
}) {
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-5 text-center">
      <AlertCircle size={20} className="mx-auto text-amber-300" />
      <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-100">{title}</p>
      <button
        type="button"
        onClick={onClick}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-300 px-3 py-2 text-[11px] font-black text-slate-950 hover:bg-amber-200"
      >
        <HelpCircle size={13} /> {buttonLabel}
      </button>
    </div>
  )
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({length: rows}).map((_, i) => (
        <div key={i} className="h-6 bg-white/5 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}
