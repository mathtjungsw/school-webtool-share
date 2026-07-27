import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, ChevronLeft, ChevronRight, AlertCircle,
  Utensils, CalendarDays, BookOpen, Globe, CloudSun,
  ShieldCheck, Brain, PenLine, Table2, Calculator, Users,
  Shuffle, CalendarClock, ClipboardCheck, Images,
  Shield, GraduationCap, Backpack, Archive, Clock,
  DollarSign, Briefcase, ClipboardList, School, ShoppingCart,
  Landmark, BookCopy, Trophy, FileSearch, FileDown, FileText,
  FileSpreadsheet, HelpCircle, Waves, SquareStack, CircleDot, Star,
  FileScan, Wand2, FileCode2,
  Clapperboard, SquarePen, MessagesSquare, BarChart3, Mic,
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
import type { MealInfo, ScheduleEvent, TimetableEntry } from '../types'
import { format, addDays, startOfWeek } from 'date-fns'
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

const PORTFOLIO_GROUPS: PortfolioGroup[] = [
  { group: '학교 공유', color: 'violet', items: [
    { id: 'school_hub', label: '부서별 링크·공지', icon: Globe, desc: '교직원 공용 링크와 학교 공지' },
  ]},
  { group: '자료·진로', color: 'sky', items: [
    { id: 'excel_processor', label: 'Excel 전처리', icon: Table2, desc: '공백·날짜·중복 등 데이터 정제' },
    { id: 'recommended_subjects', label: '대학 권장과목', icon: GraduationCap, desc: '2028 대학·학과별 권장 이수과목 검색' },
  ]},
  { group: '인사행정', color: 'emerald', items: [
    { id: 'payroll', label: '호봉획정 계산기', icon: Calculator, desc: '경력 인정과 초임 호봉 계산' },
    { id: 'afterschool_checker', label: '방과후 점검', icon: Clock, desc: '방과후·근무상황·초과근무 비교' },
    { id: 'insa_analysis', label: 'NEIS 인사기록 분석', icon: FileScan, desc: '인사기록 PDF 분석과 법정연수 점검' },
  ]},
  { group: '학사·기록', color: 'amber', items: [
    { id: 'work_reducer', label: '업무경감 도우미', icon: Wand2, desc: '시간표·수업변경·명렬표 작업' },
    { id: 'curriculum', label: '교육과정편제표', icon: FileText, desc: '학년·학기별 편제표 작성' },
    { id: 'photo_ledger', label: '사진대장', icon: Images, desc: '사진 배치·설명·출력' },
    { id: 'student_record', label: '학적업무', icon: Archive, desc: '전입·전출 등 학적 문서 작성' },
    { id: 'attendance', label: '출석부', icon: Users, desc: '출결 기록·통계·Excel 내보내기' },
  ]},
  { group: '학교운영', color: 'rose', items: [
    { id: 'committees', label: '각종 위원회 현황', icon: Landmark, desc: '교내 위원회 구성과 담당 관리' },
    { id: 'school_ledger', label: '비치 장부 현황', icon: BookCopy, desc: '법정·비법정 장부 검색' },
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

function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
function minsToTime(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2,'0')}:${String(mins % 60).padStart(2,'0')}`
}

function buildPeriodRanges(p1: string, p5: string, schoolType?: string): [number, number, string][] {
  const lesson = schoolType?.includes('초등') ? 40 : schoolType?.includes('고등') ? 50 : 45
  const brk = 10
  const ranges: [number, number, string][] = []
  let cur = timeToMins(p1)
  for (let p = 1; p <= 4; p++) { ranges.push([cur, cur + lesson, String(p)]); cur += lesson + brk }
  cur = timeToMins(p5)
  for (let p = 5; p <= 7; p++) { ranges.push([cur, cur + lesson, String(p)]); cur += lesson + brk }
  return ranges
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
        className="w-full text-left p-4 rounded-xl bg-surface-800 border border-amber-500/20 hover:border-amber-500/40 hover:bg-surface-700 transition-all duration-200 active:scale-[0.98]"
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
  const [timetable, setTimetable] = useState<TimetableEntry[]>([])
  const [teacherTT, setTeacherTT] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  // ── 학교 날씨 (오늘 날씨 / 이후 기간 예보 카드가 공유) ──
  const { data: weather, loading: weatherLoading, displayName: weatherPlace } = useWeather(config.schoolAddress)
  // ── 2번째 위치 날씨 (설정 시 날씨 카드 하단에 함께 표시) ──
  const { data: weather2, displayName: weather2Place } = useWeather(undefined, config.secondLocationName)

  // ── 구글 캘린더 URL 검증 (M-1: IIFE → useMemo) ──
  const isValidCalendarUrl = useMemo(() => {
    if (!config.googleCalendarUrl) return false
    try { return new URL(config.googleCalendarUrl).hostname === 'calendar.google.com' } catch { return false }
  }, [config.googleCalendarUrl])

  // ── 즐겨찾기 상태 ──
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    window.electron?.configGet('dashboard.favorites').then((saved: unknown) => {
      if (Array.isArray(saved)) setFavorites(saved as string[])
    })
  }, [])

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

  const prevMonthRef = useRef('')

  const hasSchool = !!(config.officeCode && config.schoolCode)
  const neisApiKey = config.neisApiKey?.trim() || NEIS_API_KEY
  const schoolType = config.schoolType ?? ''
  const p1 = config.period1Start ?? '09:00'
  const p5 = config.period5Start ?? '13:30'
  const periodRanges = buildPeriodRanges(p1, p5, schoolType)
  const hasTeacher = !!(config.teacherClasses?.length)

  // schoolAddress 자동 보완
  useEffect(() => {
    if (hasSchool && !config.schoolAddress) {
      getSchoolDetail(neisApiKey, config.officeCode!, config.schoolCode!).then(detail => {
        if (detail?.address) saveConfig({ schoolAddress: detail.address })
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.officeCode, config.schoolCode])

  // clock tick
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    if (!hasSchool) return
    setLoading(true)
    setError('')
    try {
      const year = parseInt(selectedDate.slice(0, 4))
      const month = parseInt(selectedDate.slice(5, 7))
      const weekDates = getWeekDates(selectedDate)
      const fromYmdStr = weekDates[0]
      const toYmdStr = weekDates[4]

      const nextDay = addDays(new Date(selectedDate), 1)

      const promises: Promise<unknown>[] = [
        getMeal(neisApiKey, config.officeCode!, config.schoolCode!, new Date(selectedDate)),
        getMeal(neisApiKey, config.officeCode!, config.schoolCode!, nextDay),
        prevMonthRef.current === `${year}-${month}`
          ? Promise.resolve(null)
          : getSchedule(neisApiKey, config.officeCode!, config.schoolCode!, year, month),
      ]

      if (config.grade && config.classNm && config.schoolType) {
        promises.push(
          getTimetableRange(neisApiKey, config.officeCode!, config.schoolCode!, config.schoolType, config.grade, config.classNm, fromYmdStr, toYmdStr)
        )
      } else {
        promises.push(Promise.resolve(null))
      }

      const [meals, nxtMeals, sched, tt] = await Promise.all(promises) as [MealInfo[], MealInfo[], ScheduleEvent[] | null, TimetableEntry[] | null]
      setMeal(meals ?? [])
      setNextMeal(nxtMeals ?? [])
      if (sched !== null) {
        setSchedule(sched)
        prevMonthRef.current = `${year}-${month}`
      }
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
  }, [selectedDate, config.officeCode, config.schoolCode, config.grade, config.classNm, config.schoolType, config.neisApiKey, hasSchool, hasTeacher, config.teacherClasses, neisApiKey])

  useEffect(() => { load() }, [load])

  const goDay = (delta: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(format(d, 'yyyy-MM-dd'))
  }

  const isToday = selectedDate === todayStr()
  const selYmd = toYmd(selectedDate)

  const todaySubjects: Record<string, string> = {}
  if (isToday) {
    if (hasTeacher && config.teacherClasses) {
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
          <button onClick={load} disabled={loading || !hasSchool} className="btn-ghost flex items-center gap-1.5 disabled:opacity-40">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
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
          {/* ── 상단: 좌(날씨 2×1 + 급식·학사일정) + 우 시간표(세로로 김) · 하단 정렬 ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
            {/* 좌측 2열: 날씨(2×1) 위 / 급식·학사일정 아래 — 하단을 시간표에 맞춤 */}
            <div className="xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:grid-rows-[auto_1fr]">
              {/* 🌤️ 날씨 (오늘 + 이후 기간 합침, 2×1) */}
              <DashCard icon={<CloudSun size={14} className="text-sky-400"/>} title="날씨" badge="주간 예보" badgeColor="sky" className="sm:col-span-2">
                {weatherLoading
                  ? <Skeleton rows={3}/>
                  : weather
                    ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <WeatherTodayView data={weather} displayName={weatherPlace} label="학교" />
                        {weather.weekly.length > 0 && (
                          <div className="sm:col-span-2 sm:border-l border-white/10 sm:pl-4 min-w-0">
                            <WeatherForecastView data={weather} />
                          </div>
                        )}
                      </div>
                    )
                    : <Empty text="날씨 정보를 불러올 수 없습니다." />}

                {/* 2번째 위치 날씨 — 학교 날씨 아래 칸에 함께 표시 */}
                {config.secondLocationName && weather2 && (
                  <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <WeatherTodayView data={weather2} displayName={weather2Place} label={config.secondLocationName} />
                    {weather2.weekly.length > 0 && (
                      <div className="sm:col-span-2 sm:border-l border-white/10 sm:pl-4 min-w-0">
                        <WeatherForecastView data={weather2} />
                      </div>
                    )}
                  </div>
                )}
              </DashCard>

              {/* 🍱 급식 */}
            <DashCard icon={<Utensils size={14} className="text-amber-400"/>} title="급식" badge={`${selectedDate.slice(5).replace('-','/')}`} badgeColor="amber">
              {loading ? <Skeleton rows={6}/> : meal.length > 0 ? (
                <div className="space-y-3">
                  {meal.map(m => <MealItem key={m.mealType} meal={m} />)}
                </div>
              ) : (
                <Empty text="해당 날짜 급식 정보가 없습니다." />
              )}
              {!loading && nextMeal.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-[11px] font-semibold text-amber-300/90 mb-2">
                    다음날 ({format(addDays(new Date(selectedDate), 1), 'M/d', { locale: ko })})
                  </p>
                  <div className="space-y-2">
                    {nextMeal.map(m => <MealItem key={m.mealType} meal={m} compact />)}
                  </div>
                </div>
              )}
            </DashCard>

            {/* 📅 학사일정 (월간) */}
            <DashCard icon={<CalendarDays size={14} className="text-violet-400"/>} title="학사일정" badge={`${selectedDate.slice(0,7)} 월`} badgeColor="violet">
              {loading && schedule.length === 0 ? <Skeleton rows={5}/> : schedule.length > 0 ? (
                <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto scrollbar-none max-h-72 xl:max-h-none">
                  {schedule.map((s, i) => (
                    <div key={i} className={clsx(
                      'flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors',
                      s.date === selYmd ? 'bg-violet-500/15 border border-violet-500/30' : 'hover:bg-white/3'
                    )}>
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0 mt-0.5',
                        s.date === selYmd ? 'bg-violet-500/30 text-violet-300' : 'bg-white/5 text-slate-400'
                      )}>
                        {s.date.slice(4,6)}/{s.date.slice(6,8)}
                      </span>
                      <span className="text-sm text-slate-200 leading-snug">{s.eventName}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="이번 달 학사일정이 없습니다." />
              )}
            </DashCard>

            </div>

            {/* 📚 시간표 (우측 · 세로로 긴 컬럼) */}
            <DashCard icon={<BookOpen size={14} className="text-sky-400"/>} title="시간표" badge="주간" badgeColor="sky">
              <TimetableSection
                timetable={timetable}
                teacherTT={teacherTT}
                selectedDate={selectedDate}
                config={config}
                periodRanges={periodRanges}
                currentTime={currentTime}
                classStatus={classStatus}
              />
            </DashCard>
          </div>

          {/* ── 구글 캘린더 ── */}
          {isValidCalendarUrl ? (
            <div className="card overflow-hidden p-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center">
                  <Globe size={14} className="text-sky-400" />
                </div>
                <span className="font-semibold text-white">구글 캘린더</span>
              </div>
              <iframe
                src={config.googleCalendarUrl}
                style={{ border: 0 }}
                width="100%"
                height="560"
                frameBorder="0"
                scrolling="no"
                title="구글 캘린더"
                className="block"
              />
            </div>
          ) : (
            <div className="card border-dashed border-white/10 p-6 text-center">
              <Globe size={28} className="text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">구글 캘린더가 연동되지 않았습니다.</p>
              <p className="text-xs text-slate-600 mt-1">환경설정 → 구글 캘린더 연동에서 URL을 입력하세요.</p>
            </div>
          )}
        </>
      )}

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
          <span className="w-1 h-5 rounded-full bg-gradient-to-b from-violet-500 to-sky-500 inline-block" />
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
                        className="w-full text-left p-4 rounded-xl bg-surface-800 border border-white/5 hover:border-violet-500/30 hover:bg-surface-700 transition-all duration-200 active:scale-[0.98]"
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
  timetable, teacherTT, selectedDate, config, periodRanges, currentTime, classStatus
}: {
  timetable: TimetableEntry[]
  teacherTT: TimetableEntry[]
  selectedDate: string
  config: import('../types').AppConfig
  periodRanges: [number, number, string][]
  currentTime: Date
  classStatus: ClassStatus | null
}) {
  const weekDates = getWeekDates(selectedDate)
  const DAY = ['월','화','수','목','금']
  const todayYmd = toYmd(todayStr())
  const hasTeacher = !!(config.teacherClasses?.length)

  const nowMins = currentTime.getHours() * 60 + currentTime.getMinutes()
  const currentPeriod = periodRanges.find(([s, e]) => nowMins >= s && nowMins <= e)?.[2] ?? null

  // 점심시간 — 설정값 우선, 없으면 4교시 종료~5교시 시작으로 자동 계산
  const lunch = {
    after: 4,
    start: config.lunchStart || (periodRanges[3] ? minsToTime(periodRanges[3][1]) : ''),
    end: config.lunchEnd || (periodRanges[4] ? minsToTime(periodRanges[4][0]) : ''),
  }

  if (!config.grade && !config.classNm && !hasTeacher) {
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

      {/* 교사 시간표 */}
      {hasTeacher && config.teacherClasses && (
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
  const allPeriods = Array.from({length:7}, (_,i) => String(i+1))
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

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({length: rows}).map((_, i) => (
        <div key={i} className="h-6 bg-white/5 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}
