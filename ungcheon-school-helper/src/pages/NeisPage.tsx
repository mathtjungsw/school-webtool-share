import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Utensils, CalendarDays, Clock, School, AlertCircle, ChevronLeft, ChevronRight, ExternalLink, Search, Home } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { getMeal, getSchedule, getTimetable, getSchoolDetail, getClassInfo, getDeptInfo, searchSchool } from '../services/neis'
import type { MealInfo, ScheduleEvent, TimetableEntry, SchoolInfo, ClassEntry, DeptEntry } from '../types'
import { format, addMonths, subMonths, addDays, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import clsx from 'clsx'

interface ViewSchool {
  officeCode: string
  schoolCode: string
  name: string
  schoolType?: string
}

export default function NeisPage() {
  const { config } = useAppStore()
  const [viewSchool, setViewSchool] = useState<ViewSchool | null>(null)

  // 학교 검색 UI 상태
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SchoolInfo[]>([])
  const [showDrop, setShowDrop] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // 섹션별 날짜
  const [mealDate, setMealDate] = useState(new Date())
  const [scheduleDate, setScheduleDate] = useState(new Date())
  const [timetableDate, setTimetableDate] = useState(new Date())

  // 섹션별 데이터 & 로딩 & 에러
  const [meals, setMeals] = useState<MealInfo[]>([])
  const [mealLoading, setMealLoading] = useState(false)
  const [mealError, setMealError] = useState('')

  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState('')

  const [timetable, setTimetable] = useState<TimetableEntry[]>([])
  const [timetableLoading, setTimetableLoading] = useState(false)
  const [timetableError, setTimetableError] = useState('')

  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null)
  const [classEntries, setClassEntries] = useState<ClassEntry[]>([])
  const [deptEntries, setDeptEntries] = useState<DeptEntry[]>([])
  const [schoolLoading, setSchoolLoading] = useState(false)
  const [schoolError, setSchoolError] = useState('')

  const hasSchool = !!(config.officeCode && config.schoolCode)
  const activeOffice = viewSchool?.officeCode ?? config.officeCode ?? ''
  const activeSchool = viewSchool?.schoolCode ?? config.schoolCode ?? ''

  // ── 학교 검색 디바운스 (race condition 방지: cancelled 플래그) ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    let cancelled = false

    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([])
      setShowDrop(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchSchool(query.trim())
        if (!cancelled) {
          setSuggestions(results.slice(0, 8))
          setShowDrop(results.length > 0)
        }
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 350)

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // 드롭다운 외부 클릭 + ESC 키 닫기
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      if (e.target instanceof Node && dropRef.current && !dropRef.current.contains(e.target)) {
        setShowDrop(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDrop(false)
    }
    document.addEventListener('mousedown', handleMouse)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouse)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  const selectSchool = (s: SchoolInfo) => {
    setQuery('')
    setSuggestions([])
    setShowDrop(false)
    const own = s.officeCode === config.officeCode && s.schoolCode === config.schoolCode
    setViewSchool(own ? null : { officeCode: s.officeCode, schoolCode: s.schoolCode, name: s.schoolName, schoolType: s.schoolType })
  }

  const returnToMySchool = () => {
    setQuery('')
    setSuggestions([])
    setShowDrop(false)
    setViewSchool(null)
  }

  // ── 섹션별 로드 함수 (새로고침 버튼용) ────────────────────────
  const loadMeal = async (date = mealDate) => {
    if (!activeOffice || !activeSchool) return
    setMealLoading(true); setMealError('')
    try {
      const data = await getMeal(activeOffice, activeSchool, date)
      setMeals(data)
    } catch { setMealError('급식 정보를 불러오지 못했습니다.') }
    finally { setMealLoading(false) }
  }

  const loadSchedule = async (date = scheduleDate) => {
    if (!activeOffice || !activeSchool) return
    setScheduleLoading(true); setScheduleError('')
    try {
      const data = await getSchedule(activeOffice, activeSchool, date.getFullYear(), date.getMonth() + 1)
      setScheduleEvents(data)
    } catch { setScheduleError('학사일정을 불러오지 못했습니다.') }
    finally { setScheduleLoading(false) }
  }

  const loadTimetable = async (date = timetableDate) => {
    if (!activeOffice || !activeSchool) return
    const schoolType = viewSchool?.schoolType ?? config.schoolType
    if (!config.grade || !config.classNm || !schoolType) return
    setTimetableLoading(true); setTimetableError('')
    try {
      const data = await getTimetable(activeOffice, activeSchool, schoolType, config.grade, config.classNm, date)
      setTimetable(data)
    } catch { setTimetableError('시간표를 불러오지 못했습니다.') }
    finally { setTimetableLoading(false) }
  }

  const loadSchool = async () => {
    if (!activeOffice || !activeSchool) return
    setSchoolLoading(true); setSchoolError('')
    try {
      const [data, classes, depts] = await Promise.all([
        getSchoolDetail(activeOffice, activeSchool),
        getClassInfo(activeOffice, activeSchool),
        getDeptInfo(activeOffice, activeSchool),
      ])
      setSchoolInfo(data)
      setClassEntries(classes)
      setDeptEntries(depts)
    } catch { setSchoolError('학교정보를 불러오지 못했습니다.') }
    finally { setSchoolLoading(false) }
  }

  // 날짜/학교 변경 시 섹션별 자동 로드 (cancelled 플래그로 race condition 방지)
  useEffect(() => {
    if (!hasSchool || !activeOffice || !activeSchool) return
    let cancelled = false
    setMealLoading(true); setMealError('')
    getMeal(activeOffice, activeSchool, mealDate)
      .then(data => { if (!cancelled) setMeals(data) })
      .catch(() => { if (!cancelled) setMealError('급식 정보를 불러오지 못했습니다.') })
      .finally(() => { if (!cancelled) setMealLoading(false) })
    return () => { cancelled = true }
  }, [mealDate, activeOffice, activeSchool, hasSchool])

  useEffect(() => {
    if (!hasSchool || !activeOffice || !activeSchool) return
    let cancelled = false
    setScheduleLoading(true); setScheduleError('')
    getSchedule(activeOffice, activeSchool, scheduleDate.getFullYear(), scheduleDate.getMonth() + 1)
      .then(data => { if (!cancelled) setScheduleEvents(data) })
      .catch(() => { if (!cancelled) setScheduleError('학사일정을 불러오지 못했습니다.') })
      .finally(() => { if (!cancelled) setScheduleLoading(false) })
    return () => { cancelled = true }
  }, [scheduleDate, activeOffice, activeSchool, hasSchool])

  useEffect(() => {
    if (!hasSchool || !activeOffice || !activeSchool) return
    const schoolType = viewSchool?.schoolType ?? config.schoolType
    if (!config.grade || !config.classNm || !schoolType) return
    let cancelled = false
    setTimetableLoading(true); setTimetableError('')
    getTimetable(activeOffice, activeSchool, schoolType, config.grade, config.classNm, timetableDate)
      .then(data => { if (!cancelled) setTimetable(data) })
      .catch(() => { if (!cancelled) setTimetableError('시간표를 불러오지 못했습니다.') })
      .finally(() => { if (!cancelled) setTimetableLoading(false) })
    return () => { cancelled = true }
  }, [timetableDate, activeOffice, activeSchool, hasSchool, config.grade, config.classNm, config.schoolType, viewSchool?.schoolType])

  useEffect(() => {
    if (!hasSchool || !activeOffice || !activeSchool) return
    let cancelled = false
    setSchoolLoading(true); setSchoolError('')
    Promise.all([
      getSchoolDetail(activeOffice, activeSchool),
      getClassInfo(activeOffice, activeSchool),
      getDeptInfo(activeOffice, activeSchool),
    ])
      .then(([data, classes, depts]) => {
        if (!cancelled) { setSchoolInfo(data); setClassEntries(classes); setDeptEntries(depts) }
      })
      .catch(() => { if (!cancelled) setSchoolError('학교정보를 불러오지 못했습니다.') })
      .finally(() => { if (!cancelled) setSchoolLoading(false) })
    return () => { cancelled = true }
  }, [activeOffice, activeSchool, hasSchool])

  if (!hasSchool) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="card p-8 text-center max-w-sm">
          <div className="text-4xl mb-3">📡</div>
          <h3 className="text-white font-semibold mb-1">학교 설정이 필요합니다</h3>
          <p className="text-slate-400 text-sm">환경설정에서 학교를 검색해주세요.</p>
        </div>
      </div>
    )
  }

  const displaySchoolName = viewSchool?.name ?? config.schoolName ?? ''
  const today = new Date()

  return (
    <div className="p-6 space-y-8">
      {/* ── 헤더 + 학교 검색 ── */}
      <div>
        <div className="flex items-start gap-4 mb-3">
          <div ref={dropRef} className="relative flex-shrink-0 w-72">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                {searching && (
                  <RefreshCw size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />
                )}
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                  placeholder="다른 학교 검색…"
                  className="w-full bg-surface-800 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
                />
              </div>
              {viewSchool && (
                <button
                  onClick={returnToMySchool}
                  title="내 학교로 돌아가기"
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 transition-all flex-shrink-0"
                >
                  <Home size={14} />
                </button>
              )}
            </div>
            {showDrop && suggestions.length > 0 && (
              <div className="absolute z-50 top-full mt-1 right-0 w-80 bg-surface-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => selectSchool(s)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">🏫</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{s.schoolName}</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {s.officeName} · {s.schoolType} · {s.address}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <h1 className="page-title">NEIS 정보</h1>
            <p className="page-subtitle">{displaySchoolName} · NEIS 교육정보 통합 조회</p>
          </div>
        </div>
        {viewSchool && (
          <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-2.5 text-sm text-violet-300">
            <School size={14} className="flex-shrink-0" />
            <span><span className="font-semibold">{viewSchool.name}</span> 정보를 조회 중입니다.</span>
            <button onClick={returnToMySchool} className="ml-auto text-xs underline underline-offset-2 hover:text-violet-200 flex-shrink-0 whitespace-nowrap">
              내 학교로
            </button>
          </div>
        )}
      </div>

      {/* ── 급식 ── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Utensils size={16} className="text-amber-400" />
          <h2 className="text-base font-semibold text-white flex-1">급식</h2>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMealDate(d => subDays(d, 1))} className="btn-ghost p-1.5"><ChevronLeft size={15} /></button>
            <span className="text-sm text-slate-300 min-w-[150px] text-center">
              {format(mealDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}
            </span>
            <button onClick={() => setMealDate(d => addDays(d, 1))} className="btn-ghost p-1.5"><ChevronRight size={15} /></button>
            <button onClick={() => setMealDate(today)} className="btn-secondary text-xs px-3 py-1">오늘</button>
            <button onClick={() => loadMeal(mealDate)} disabled={mealLoading} className="btn-ghost p-1.5">
              <RefreshCw size={13} className={mealLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        {mealError && <ErrorBanner text={mealError} />}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <MealView meals={meals} loading={mealLoading} />
        </motion.div>
      </section>

      <div className="border-t border-white/5" />

      {/* ── 학사일정 ── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <CalendarDays size={16} className="text-sky-400" />
          <h2 className="text-base font-semibold text-white flex-1">학사일정</h2>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setScheduleDate(d => subMonths(d, 1))} className="btn-ghost p-1.5"><ChevronLeft size={15} /></button>
            <span className="text-sm text-slate-300 min-w-[110px] text-center">
              {format(scheduleDate, 'yyyy년 M월', { locale: ko })}
            </span>
            <button onClick={() => setScheduleDate(d => addMonths(d, 1))} className="btn-ghost p-1.5"><ChevronRight size={15} /></button>
            <button onClick={() => setScheduleDate(today)} className="btn-secondary text-xs px-3 py-1">이번달</button>
            <button onClick={() => loadSchedule(scheduleDate)} disabled={scheduleLoading} className="btn-ghost p-1.5">
              <RefreshCw size={13} className={scheduleLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        {scheduleError && <ErrorBanner text={scheduleError} />}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <ScheduleView events={scheduleEvents} loading={scheduleLoading} currentDate={scheduleDate} />
        </motion.div>
      </section>

      <div className="border-t border-white/5" />

      {/* ── 시간표 ── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Clock size={16} className="text-violet-400" />
          <h2 className="text-base font-semibold text-white flex-1">시간표</h2>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setTimetableDate(d => subDays(d, 1))} className="btn-ghost p-1.5"><ChevronLeft size={15} /></button>
            <span className="text-sm text-slate-300 min-w-[150px] text-center">
              {format(timetableDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}
            </span>
            <button onClick={() => setTimetableDate(d => addDays(d, 1))} className="btn-ghost p-1.5"><ChevronRight size={15} /></button>
            <button onClick={() => setTimetableDate(today)} className="btn-secondary text-xs px-3 py-1">오늘</button>
            <button onClick={() => loadTimetable(timetableDate)} disabled={timetableLoading} className="btn-ghost p-1.5">
              <RefreshCw size={13} className={timetableLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        {timetableError && <ErrorBanner text={timetableError} />}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <TimetableView
            entries={timetable}
            loading={timetableLoading}
            grade={config.grade}
            classNm={config.classNm}
            schoolType={viewSchool?.schoolType ?? config.schoolType}
          />
        </motion.div>
      </section>

      <div className="border-t border-white/5" />

      {/* ── 학교정보 ── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <School size={16} className="text-emerald-400" />
          <h2 className="text-base font-semibold text-white flex-1">학교정보</h2>
          <button onClick={loadSchool} disabled={schoolLoading} className="btn-ghost p-1.5">
            <RefreshCw size={13} className={schoolLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        {schoolError && <ErrorBanner text={schoolError} />}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <SchoolView info={schoolInfo} classEntries={classEntries} deptEntries={deptEntries} loading={schoolLoading} />
        </motion.div>
      </section>

      <div className="h-4" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 공통 컴포넌트
// ─────────────────────────────────────────────────────────────────────────

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-4 text-sm">
      <AlertCircle size={15} />{text}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 서브 뷰들
// ─────────────────────────────────────────────────────────────────────────

function MealView({ meals, loading }: { meals: MealInfo[], loading: boolean }) {
  if (loading) return <LoadingGrid />
  if (!meals.length) return <Empty text="해당 날짜의 급식 정보가 없습니다." />
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {meals.map((m, i) => (
        <div key={i} className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white">{m.mealType}</h3>
            {m.calories && <span className="badge-amber">{m.calories}</span>}
          </div>
          <div className="space-y-1.5">
            {m.dishNames.map((dish, j) => (
              <div key={j} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="text-slate-300">{dish}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScheduleView({ events, loading, currentDate }: { events: ScheduleEvent[], loading: boolean, currentDate: Date }) {
  if (loading) return <LoadingGrid />

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const todayYmd = format(new Date(), 'yyyyMMdd')

  const eventMap = events.reduce((acc, e) => {
    if (!acc[e.date]) acc[e.date] = []
    acc[e.date].push(e.eventName)
    return acc
  }, {} as Record<string, string[]>)

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/5">
        {DAY_LABELS.map((d, i) => (
          <div key={d} className={clsx(
            'py-2 text-center text-[11px] font-semibold',
            i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-slate-500'
          )}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="min-h-[72px] border-b border-r border-white/5 last:border-r-0" />
          const ymd = `${year}${String(month + 1).padStart(2,'0')}${String(day).padStart(2,'0')}`
          const isToday = ymd === todayYmd
          const dayEvents = eventMap[ymd] ?? []
          const isSun = (idx % 7) === 0
          const isSat = (idx % 7) === 6
          return (
            <div key={idx} className={clsx(
              'min-h-[72px] p-1.5 border-b border-r border-white/5 last:border-r-0',
              isToday && 'bg-violet-500/8'
            )}>
              <span className={clsx(
                'inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold mb-1',
                isToday ? 'bg-violet-500 text-white' : isSun ? 'text-rose-400' : isSat ? 'text-sky-400' : 'text-slate-300'
              )}>{day}</span>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev, i) => (
                  <div key={i} className="text-[9px] leading-tight px-1 py-0.5 rounded bg-violet-500/20 text-violet-300 truncate">
                    {ev}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] text-slate-500 px-1">+{dayEvents.length - 3}개</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {events.length === 0 && (
        <p className="text-center text-slate-500 text-sm py-4">이번 달 학사일정이 없습니다.</p>
      )}
    </div>
  )
}

function TimetableView({ entries, loading, grade, classNm, schoolType }: {
  entries: TimetableEntry[], loading: boolean
  grade?: string, classNm?: string, schoolType?: string
}) {
  if (!grade || !classNm) return <Empty text="설정에서 학년과 반을 입력해주세요." />
  if (loading) return <LoadingGrid />
  if (!entries.length) return <Empty text="해당 날짜의 시간표 정보가 없습니다." />
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5">
            <th className="py-3 px-4 text-left text-xs text-slate-500 w-12">교시</th>
            <th className="py-3 px-4 text-left text-xs text-slate-500">과목</th>
            <th className="py-3 px-4 text-left text-xs text-slate-500">교사</th>
            <th className="py-3 px-4 text-left text-xs text-slate-500">강의실</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-b border-white/3 hover:bg-white/3 transition-colors">
              <td className="py-3 px-4 text-sky-400 font-bold text-center">{e.period}</td>
              <td className="py-3 px-4 text-white font-medium">{e.subject}</td>
              <td className="py-3 px-4 text-slate-400 text-sm">{e.teacher}</td>
              <td className="py-3 px-4 text-slate-500 text-sm">{e.classroom}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatFounded(yyyymmdd?: string) {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd ?? ''
  return `${yyyymmdd.slice(0, 4)}년 ${parseInt(yyyymmdd.slice(4, 6))}월 ${parseInt(yyyymmdd.slice(6, 8))}일`
}

function SchoolView({ info, classEntries, deptEntries, loading }: {
  info: SchoolInfo | null
  classEntries: ClassEntry[]
  deptEntries: DeptEntry[]
  loading: boolean
}) {
  if (loading) return <LoadingGrid />
  if (!info) return <Empty text="학교 정보를 불러오지 못했습니다." />

  const gradeMap = classEntries.reduce<Record<string, string[]>>((acc, c) => {
    acc[c.grade] = acc[c.grade] ?? []
    acc[c.grade].push(c.classNm)
    return acc
  }, {})

  const seriesMap = deptEntries.reduce<Record<string, string[]>>((acc, d) => {
    const key = d.series || '기타'
    acc[key] = acc[key] ?? []
    acc[key].push(d.name)
    return acc
  }, {})

  const infoRows = [
    { icon: '📍', label: '주소',    value: info.address },
    { icon: '📞', label: '전화',    value: info.phone },
    { icon: '📠', label: '팩스',    value: info.fax },
    { icon: '🌐', label: '홈페이지', value: info.website, isLink: true },
    { icon: '📅', label: '개교일',   value: formatFounded(info.founded) },
    { icon: '🏙️', label: '지역',    value: info.region },
    { icon: '📮', label: '우편번호', value: info.zipcode },
    { icon: '🏛️', label: '교육청',  value: info.officeName },
    { icon: '🔑', label: '학교코드', value: info.schoolCode },
  ].filter(r => r.value)

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card overflow-hidden p-0">
        <div className="bg-gradient-to-r from-violet-600/25 to-sky-600/15 border-b border-white/10 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">{info.schoolName}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                {[info.schoolType, info.coedu, info.foundType].filter(Boolean).map(tag => (
                  <span key={tag} className="bg-white/15 text-slate-200 text-xs px-2.5 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            </div>
            <span className="text-4xl flex-shrink-0">🏫</span>
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {infoRows.map(row => (
            <div key={row.label} className="flex items-start gap-3 px-5 py-3">
              <span className="text-lg flex-shrink-0 mt-0.5">{row.icon}</span>
              <div className="min-w-0">
                <div className="text-xs text-slate-500 mb-0.5">{row.label}</div>
                {row.isLink && row.value ? (
                  <a
                    href={row.value.startsWith('http') ? row.value : `http://${row.value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-sky-400 hover:underline flex items-center gap-1 break-all"
                  >
                    {row.value}
                    <ExternalLink size={11} className="flex-shrink-0" />
                  </a>
                ) : (
                  <div className="text-sm text-slate-200 break-all">{row.value}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {Object.keys(gradeMap).length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
            <span className="text-lg">👥</span>
            <div>
              <h3 className="font-semibold text-white">학급 편성</h3>
              <p className="text-xs text-slate-500 mt-0.5">{new Date().getFullYear()}학년도 기준</p>
            </div>
            <span className="ml-auto text-xs text-slate-500">전체 {classEntries.length}개 학급</span>
          </div>
          <div className="space-y-3">
            {Object.entries(gradeMap).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, classes]) => (
              <div key={grade} className="flex items-center gap-3">
                <div className="w-14 text-center text-xs font-semibold text-violet-300 bg-violet-500/10 rounded-lg py-1.5 flex-shrink-0">
                  {grade}학년
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {classes.sort((a, b) => Number(a) - Number(b)).map(cls => (
                    <span key={cls} className="bg-white/5 border border-white/10 text-slate-300 text-xs px-2 py-1 rounded-lg">
                      {cls}반
                    </span>
                  ))}
                </div>
                <span className="ml-auto text-xs text-slate-600 flex-shrink-0">{classes.length}반</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(seriesMap).length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
            <span className="text-lg">🎓</span>
            <div>
              <h3 className="font-semibold text-white">학과정보</h3>
              <p className="text-xs text-slate-500 mt-0.5">{new Date().getFullYear()}학년도 기준</p>
            </div>
          </div>
          <div className="space-y-4">
            {Object.entries(seriesMap).map(([series, depts]) => (
              <div key={series}>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{series}</div>
                <div className="flex flex-wrap gap-2">
                  {depts.map(d => (
                    <span key={d} className="bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm px-3 py-1.5 rounded-lg">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />)}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card flex items-center justify-center py-16 text-slate-500 text-sm">{text}</div>
  )
}
