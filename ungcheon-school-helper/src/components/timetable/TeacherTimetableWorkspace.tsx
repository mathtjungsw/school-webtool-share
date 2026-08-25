import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, Download, FileSpreadsheet, List, Printer, RefreshCw, Search, UserCog } from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { PULLED_LESSONS_2026 } from '../../data/pulledLessons2026'
import type { SchoolTimetable } from '../../services/schoolTimetable'
import { TIMETABLE_DAYS } from '../../services/schoolTimetable'
import { listTimetableChanges, type TimetableChangeRequest } from '../../services/timetableChanges'
import type { SharedStaffRoster } from '../../services/rosterAttendance'
import {
  academicScheduleSummary,
  buildCompositeTeacherDay,
  monthCalendarDates,
  supportedMonthKeys,
  weekDates,
  type CompositeTeacherDay,
} from '../../services/teacherTimetableCalendar'
import { xlsxWorkbookBytes } from '../../utils/binaryBytes'
import { escapeHtml, printHtml } from '../../utils/printHtml'

type WorkspaceMode = 'teacher' | 'manager'
type TeacherView = 'week' | 'month' | 'list'

interface Props {
  mode: WorkspaceMode
  timetable: SchoolTimetable
  currentTeacherName: string
  configured: boolean
  staffRoster?: SharedStaffRoster | null
}

const MONTH_LABELS: Record<string, string> = {
  '2026-08': '2026년 8월', '2026-09': '2026년 9월', '2026-10': '2026년 10월',
  '2026-11': '2026년 11월', '2026-12': '2026년 12월', '2027-02': '2027년 2월',
}

export default function TeacherTimetableWorkspace({ mode, timetable, currentTeacherName, configured, staffRoster }: Props) {
  const [teacherView, setTeacherView] = useState<TeacherView>('month')
  const [monthKey, setMonthKey] = useState('2026-08')
  const [selectedDate, setSelectedDate] = useState('2026-08-25')
  const [weekKey, setWeekKey] = useState('2026-08-24')
  const [changes, setChanges] = useState<TimetableChangeRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const loadChanges = useCallback(async (force = false) => {
    if (!configured || !currentTeacherName) return setChanges([])
    setLoading(true)
    setLoadError('')
    try {
      setChanges(await listTimetableChanges(currentTeacherName, '2026-08-11', '2027-02-05', true, force))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [configured, currentTeacherName])

  useEffect(() => { void loadChanges() }, [loadChanges])
  if (mode === 'manager') {
    return <ManagerSchedule timetable={timetable} staffRoster={staffRoster} changes={changes} weekKey={weekKey} onWeekChange={setWeekKey} loading={loading} onRefresh={() => void loadChanges(true)} />
  }

  const teacher = timetable.teachers.find(item => normalizeName(item.name) === normalizeName(currentTeacherName))
  if (!teacher) {
    return <section className="card p-6 text-center"><CalendarDays size={30} className="mx-auto text-amber-500" /><h2 className="mt-3 text-base font-black text-slate-950 dark:text-white">로그인한 교사의 시간표를 찾지 못했습니다</h2><p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">현재 로그인 이름 “{currentTeacherName || '미설정'}”이 관리자가 올린 시간표의 교사명과 일치하는지 확인해 주세요. 다른 교사의 시간표는 시간표 업무 담당자 탭에서만 확인할 수 있습니다.</p></section>
  }
  const monthDates = monthCalendarDates(monthKey)
  const days = monthDates.map(date => buildCompositeTeacherDay(timetable, teacher.name, date, changes, PULLED_LESSONS_2026))
  const selectedDay = buildCompositeTeacherDay(timetable, teacher.name, selectedDate, changes, PULLED_LESSONS_2026)
  const selectedWeek = weekDates(selectedDate).map(date => buildCompositeTeacherDay(timetable, teacher.name, date, changes, PULLED_LESSONS_2026))
  const summary = summarizeDays(days)
  const scheduleInfo = academicScheduleSummary()

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <h2 className="flex items-center gap-2 text-base font-black text-slate-950 dark:text-white"><CalendarDays size={18} className="text-violet-500" /> {teacher.name} 선생님 시간표</h2>
            <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">로그인한 본인의 2026학년도 2학기 학사일정과 승인된 수업 변경을 합성한 예상 시간표입니다.</p>
          </div>
          <button className="btn-ghost inline-flex items-center gap-2" onClick={() => void loadChanges(true)} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 변경자료 새로고침</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-400">
          <span className="rounded-full bg-violet-500/10 px-3 py-1">운영기간 {scheduleInfo.semester}</span>
          <span className="rounded-full bg-cyan-500/10 px-3 py-1">수업일 {scheduleInfo.schoolDays}일 · {scheduleInfo.lessonHours}시간</span>
          <span className="rounded-full bg-amber-500/10 px-3 py-1">겨울방학 {scheduleInfo.vacation}</span>
        </div>
        {loadError && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">변경 자료를 불러오지 못해 기본 시간표만 표시합니다. {loadError}</p>}
      </section>

      <section className="card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <ViewButton active={teacherView === 'week'} onClick={() => setTeacherView('week')} icon={<CalendarDays size={14} />} label="주간 보기" />
          <ViewButton active={teacherView === 'month'} onClick={() => setTeacherView('month')} icon={<CalendarDays size={14} />} label="월간 달력" />
          <ViewButton active={teacherView === 'list'} onClick={() => setTeacherView('list')} icon={<List size={14} />} label="날짜별 목록" />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {teacherView === 'week' ? (
              <input type="date" className="input-field !py-1.5" value={selectedDate} min="2026-08-11" max="2027-02-05" onChange={event => setSelectedDate(event.target.value)} />
            ) : (
              <select className="input-field !py-1.5" value={monthKey} onChange={event => { setMonthKey(event.target.value); setSelectedDate(`${event.target.value}-01`) }}>
                {supportedMonthKeys().map(key => <option key={key} value={key}>{MONTH_LABELS[key]}</option>)}
              </select>
            )}
            <button className="btn-secondary inline-flex items-center gap-2" onClick={() => printTeacherMonth(teacher.label, monthKey, days)} disabled={teacherView === 'week'} title={teacherView === 'week' ? '월간 달력 또는 날짜별 목록에서 사용할 수 있습니다.' : ''}><Printer size={14} /> 인쇄·PDF</button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard label="기본 수업" value={summary.base} color="text-sky-300" />
        <SummaryCard label="교환·대강" value={summary.changed} color="text-violet-300" />
        <SummaryCard label="당김수업" value={summary.pulled} color="text-emerald-300" />
        <SummaryCard label="운영 범위 경고" value={summary.warning} color="text-amber-300" />
      </div>

      {teacherView === 'week' && <WeekSchedule days={selectedWeek} onSelect={setSelectedDate} selectedDate={selectedDate} />}
      {teacherView === 'month' && <MonthSchedule monthKey={monthKey} days={days} onSelect={setSelectedDate} selectedDate={selectedDate} />}
      {teacherView === 'list' && <ListSchedule monthKey={monthKey} days={days} onSelect={setSelectedDate} />}
      {(teacherView === 'month' || teacherView === 'list') && <DayDetail day={selectedDay} />}
    </div>
  )
}

function MonthSchedule({ monthKey, days, selectedDate, onSelect }: { monthKey: string; days: CompositeTeacherDay[]; selectedDate: string; onSelect: (date: string) => void }) {
  return <section className="card overflow-x-auto print:overflow-visible"><div className="min-w-[1050px]">
    <div className="grid grid-cols-7 border-b border-black/10 bg-black/[0.03] text-center text-xs font-black text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
      {['일', '월', '화', '수', '목', '금', '토'].map(day => <div key={day} className="px-2 py-2">{day}</div>)}
    </div>
    <div className="grid grid-cols-7">
      {days.map(day => {
        const outsideMonth = !day.date.startsWith(monthKey)
        const changed = day.lessons.some(item => item.source !== 'base')
        return <button key={day.date} type="button" onClick={() => onSelect(day.date)} className={clsx('min-h-60 border-b border-r border-black/10 p-2 text-left align-top transition-colors dark:border-white/10', outsideMonth && 'opacity-35', selectedDate === day.date ? 'bg-violet-500/15 ring-2 ring-inset ring-violet-500/60' : 'hover:bg-black/[0.025] dark:hover:bg-white/[0.035]')}>
          <div className="flex items-center justify-between gap-1"><strong className="text-xs text-slate-950 dark:text-slate-100">{Number(day.date.slice(-2))}</strong>{changed && <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[8px] font-black text-violet-700 dark:text-violet-200">변경</span>}</div>
          {day.rule.specialWeekdayLabel && <p className="mt-1 rounded bg-amber-500/15 px-1.5 py-1 text-[8px] font-black text-amber-300">{day.rule.specialWeekdayLabel}</p>}
          {day.rule.kind !== 'instruction' && <p className="mt-1 truncate rounded bg-rose-500/10 px-1.5 py-1 text-[9px] font-black text-rose-700 dark:text-rose-300">{day.rule.label}</p>}
          <div className={clsx('mt-1 divide-y divide-black/10 rounded border border-black/10 dark:divide-white/10 dark:border-white/10', day.rule.kind !== 'instruction' && 'opacity-35')}>{day.lessons.map(item => <div key={item.period} className={clsx('h-6 px-1 py-0.5', item.source === 'pulled' ? 'bg-emerald-500/15' : item.source !== 'base' ? 'bg-violet-500/15' : '')}><LessonLine lesson={day.rule.kind === 'instruction' ? item : { ...item, value: '', badge: '' }} /></div>)}</div>
          {day.rule.eventBadges.map(event => <p key={event} className="mt-1 truncate rounded bg-cyan-500/10 px-1.5 py-1 text-[8px] font-bold text-cyan-300" title={event}>{event}</p>)}
          {day.outOfRangeLessons.map(item => <p key={`${item.period}-${item.value}`} className="mt-1 text-[8px] font-black text-amber-300">⚠ {item.period}교시 운영범위 밖</p>)}
        </button>
      })}
    </div>
  </div></section>
}

function WeekSchedule({ days, selectedDate, onSelect }: { days: CompositeTeacherDay[]; selectedDate: string; onSelect: (date: string) => void }) {
  return <section className="grid gap-3 lg:grid-cols-5">
    {days.map((day, index) => <button key={day.date} type="button" onClick={() => onSelect(day.date)} className={clsx('card overflow-hidden text-left', selectedDate === day.date && 'ring-2 ring-violet-400/50')}>
      <div className="border-b border-white/10 bg-white/5 px-3 py-2 text-center"><strong className="text-sm text-slate-100">{TIMETABLE_DAYS[index]}요일</strong><span className="ml-2 text-[10px] text-slate-500">{day.date.slice(5)}</span></div>
      {day.rule.kind !== 'instruction' ? <p className="min-h-64 p-4 text-center text-xs font-black text-rose-300">{day.rule.label}</p> : <div className="divide-y divide-white/5">{day.lessons.map(item => <div key={item.period} className={clsx('min-h-14 px-3 py-2', item.source !== 'base' && 'bg-violet-500/10')}><LessonLine lesson={item} expanded /></div>)}</div>}
    </button>)}
  </section>
}

function ListSchedule({ monthKey, days, onSelect }: { monthKey: string; days: CompositeTeacherDay[]; onSelect: (date: string) => void }) {
  const visible = days.filter(day => day.date.startsWith(monthKey) && day.rule.kind !== 'weekend' && day.rule.kind !== 'outside')
  return <section className="card overflow-hidden"><div className="divide-y divide-white/10">{visible.map(day => <button key={day.date} type="button" onClick={() => onSelect(day.date)} className="grid w-full grid-cols-[7rem_1fr] gap-3 px-4 py-3 text-left hover:bg-white/[0.035]"><strong className="text-xs text-slate-200">{day.date}</strong><div>{day.rule.kind !== 'instruction' ? <span className="text-xs font-black text-rose-300">{day.rule.label}</span> : <span className="text-xs font-bold text-slate-300">{day.lessons.filter(item => item.value).map(item => `${item.period}교시 ${oneLine(item.value)}`).join(' · ') || '수업 없음'}</span>}{day.rule.eventBadges.map(event => <span key={event} className="ml-2 rounded bg-cyan-500/10 px-2 py-1 text-[9px] font-bold text-cyan-300">{event}</span>)}</div></button>)}</div></section>
}

function DayDetail({ day }: { day: CompositeTeacherDay }) {
  return <section className="card p-4"><h3 className="text-sm font-black text-white">{day.date} 상세 시간표</h3><p className="mt-1 text-xs font-semibold text-slate-400">{day.rule.specialWeekdayLabel || day.rule.label || '기본 요일 시간표 운영'}</p><div className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">{day.lessons.map(item => <div key={item.period} className={clsx('rounded-xl border border-white/10 p-3', item.source === 'pulled' ? 'bg-emerald-500/15' : item.source !== 'base' ? 'bg-violet-500/15' : 'bg-white/[0.025]')}><LessonLine lesson={item} expanded /></div>)}</div></section>
}

function ManagerSchedule({ timetable, staffRoster, changes, weekKey, onWeekChange, loading, onRefresh }: { timetable: SchoolTimetable; staffRoster?: SharedStaffRoster | null; changes: TimetableChangeRequest[]; weekKey: string; onWeekChange: (value: string) => void; loading: boolean; onRefresh: () => void }) {
  const [query, setQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [lessonFilter, setLessonFilter] = useState('all')
  const [expandedTeacher, setExpandedTeacher] = useState('')
  const [includeDetails, setIncludeDetails] = useState(false)
  const dates = weekDates(weekKey)
  const rows = useMemo(() => timetable.teachers.map(teacher => ({
    teacher,
    subject: staffSubject(teacher.name, staffRoster),
    days: dates.map(date => buildCompositeTeacherDay(timetable, teacher.name, date, changes, PULLED_LESSONS_2026)),
  })), [changes, dates.join('|'), staffRoster, timetable])
  const subjects = [...new Set(rows.map(row => row.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
  const filtered = rows.filter(row => {
    const haystack = `${row.teacher.name} ${row.teacher.label} ${row.subject}`.toLocaleLowerCase('ko-KR')
    if (query && !haystack.includes(query.trim().toLocaleLowerCase('ko-KR'))) return false
    if (subjectFilter !== 'all' && row.subject !== subjectFilter) return false
    const candidateDays = dayFilter === 'all' ? row.days : row.days.filter((_, index) => String(index) === dayFilter)
    const candidateLessons = candidateDays.flatMap(day => periodFilter === 'all' ? day.lessons : day.lessons.filter(item => String(item.period) === periodFilter))
    if (lessonFilter === 'class' && !candidateLessons.some(item => item.value)) return false
    if (lessonFilter === 'free' && !candidateLessons.some(item => !item.value)) return false
    return true
  })
  const missingTeacherWarnings = changes
    .filter(item => dates.includes(item.originalDate) || dates.includes(item.replacementDate))
    .flatMap(item => [item.originalTeacher, item.replacementTeacher])
    .filter(name => name && !timetable.teachers.some(teacher => normalizeName(teacher.name) === normalizeName(name)))
    .map(name => `시간표에 없는 담당 교사: ${name}`)
  const warnings = [...missingTeacherWarnings, ...rows.flatMap(row => row.days.flatMap(day => [
    ...day.lessons.filter(item => item.warning).map(item => `${day.date} ${item.period}교시 ${row.teacher.name}: ${item.warning}`),
    ...day.outOfRangeLessons.map(item => `${day.date} ${row.teacher.name}: ${item.period}교시 운영 범위 밖`),
  ]))]

  const exportExcel = async () => {
    const workbook = XLSX.utils.book_new()
    const header = ['교사', ...dates.flatMap(date => Array.from({ length: 7 }, (_, index) => `${date.slice(5)} ${index + 1}교시`))]
    const overview = [header, ...filtered.map(row => [`${row.teacher.label}${row.subject ? ` · ${row.subject}` : ''}`, ...row.days.flatMap(day => day.lessons.map(item => oneLine(item.value)))])]
    const overviewSheet = XLSX.utils.aoa_to_sheet(overview)
    overviewSheet['!freeze'] = { xSplit: 1, ySplit: 1 }
    overviewSheet['!cols'] = [{ wch: 16 }, ...Array.from({ length: 35 }, () => ({ wch: 14 }))]
    XLSX.utils.book_append_sheet(workbook, overviewSheet, '전체 교사 주간표')
    const changeRows = [['구분', '상태', '결강일', '교시', '원 교사', '대체일', '교시', '대체 교사', '학급', '과목'], ...changes.filter(item => dates.includes(item.originalDate) || dates.includes(item.replacementDate)).map(item => [item.kind, item.status, item.originalDate, item.originalSlotIndex % 7 + 1, item.originalTeacher, item.replacementDate, item.replacementSlotIndex % 7 + 1, item.replacementTeacher, item.originalClass, item.originalSubject]), ...PULLED_LESSONS_2026.filter(item => dates.includes(item.date)).map(item => ['당김수업', '반영', item.date, item.period, item.originalTeacherName, item.originalDate, item.originalSlot, item.teacherName, item.classLabel, item.subject])]
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(changeRows), '변경사항')
    if (includeDetails) filtered.forEach(row => {
      const detail = [['날짜', '요일', '교시', '수업', '구분', '원래 수업'], ...row.days.flatMap((day, dayIndex) => day.lessons.map(item => [day.date, TIMETABLE_DAYS[dayIndex], item.period, oneLine(item.value), item.badge || '기본', oneLine(item.originalValue)]))]
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(detail), safeSheetName(row.teacher.name, workbook.SheetNames))
    })
    const bytes = xlsxWorkbookBytes(workbook)
    await window.electron.saveFileDialog(`교사_주간시간표_${dates[0]}_${dates[4]}.xlsx`, bytes)
  }

  return <div className="space-y-4">
    <section className="card p-4"><div className="flex flex-wrap items-end gap-3"><div className="min-w-64 flex-1"><h2 className="flex items-center gap-2 text-base font-black text-slate-950"><UserCog size={18} className="text-cyan-700" /> 시간표 업무 담당자</h2><p className="mt-1 text-xs font-semibold text-slate-700">기본 시간표와 학사일정·승인된 변경·당김수업을 합친 모든 교사의 주간 예상표입니다.</p></div><label className="text-xs font-bold text-slate-700">기준 주<input type="date" className="input-field mt-1" value={weekKey} min="2026-08-11" max="2027-02-05" onChange={event => onWeekChange(event.target.value)} /></label><button className="btn-ghost inline-flex items-center gap-2" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 새로고침</button><button className="btn-primary inline-flex items-center gap-2" onClick={() => void exportExcel()}><Download size={14} /> Excel 출력</button></div><p className="mt-3 text-[11px] font-bold text-slate-600">기준 주 {dates[0]} ~ {dates[4]} · 생성 시각 {new Date().toLocaleString('ko-KR')} · 출력 파일은 이 PC에만 저장됩니다.</p></section>
    <section className="card p-3"><div className="grid gap-2 md:grid-cols-6"><label className="relative md:col-span-2"><Search size={14} className="absolute left-3 top-3 text-slate-500" /><input className="input-field w-full !pl-9" placeholder="교사명·교과 검색" value={query} onChange={event => setQuery(event.target.value)} /></label><select className="input-field" value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)}><option value="all">전체 교과</option>{subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}</select><select className="input-field" value={dayFilter} onChange={event => setDayFilter(event.target.value)}><option value="all">전체 요일</option>{TIMETABLE_DAYS.map((day, index) => <option key={day} value={index}>{day}요일</option>)}</select><select className="input-field" value={periodFilter} onChange={event => setPeriodFilter(event.target.value)}><option value="all">전체 교시</option>{Array.from({ length: 7 }, (_, index) => <option key={index} value={index + 1}>{index + 1}교시</option>)}</select><select className="input-field" value={lessonFilter} onChange={event => setLessonFilter(event.target.value)}><option value="all">수업 여부 전체</option><option value="class">수업 있음</option><option value="free">공강 있음</option></select></div><label className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-slate-400"><input type="checkbox" checked={includeDetails} onChange={event => setIncludeDetails(event.target.checked)} /> Excel에 선택 결과 교사별 상세 시트 추가</label></section>
    {warnings.length > 0 && <section className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3"><strong className="text-xs text-amber-300">점검 경고 {warnings.length}건</strong><p className="mt-1 line-clamp-2 text-[10px] font-semibold text-amber-200">{warnings.slice(0, 8).join(' · ')}</p></section>}
    <section className="card overflow-auto"><table className="teacher-manager-table min-w-[2100px] w-full border-collapse text-[9px]"><thead className="teacher-manager-head sticky top-0 z-20"><tr><th className="teacher-manager-sticky sticky left-0 z-30 w-36 px-2 py-2 text-left">교사</th>{dates.flatMap((date, dayIndex) => Array.from({ length: 7 }, (_, periodIndex) => <th key={`${date}-${periodIndex}`} className={clsx('w-14 px-1 py-2', periodIndex === 0 && 'teacher-manager-day-start')}>{TIMETABLE_DAYS[dayIndex]} {periodIndex + 1}</th>))}</tr></thead><tbody>{filtered.map(row => <ManagerRow key={row.teacher.name} row={row} expanded={expandedTeacher === row.teacher.name} onToggle={() => setExpandedTeacher(expandedTeacher === row.teacher.name ? '' : row.teacher.name)} />)}</tbody></table>{!filtered.length && <p className="p-8 text-center text-xs font-bold text-slate-600">조건에 맞는 교사가 없습니다.</p>}</section>
  </div>
}

function ManagerRow({ row, expanded, onToggle }: { row: { teacher: SchoolTimetable['teachers'][number]; subject: string; days: CompositeTeacherDay[] }; expanded: boolean; onToggle: () => void }) {
  return <><tr className="teacher-manager-row"><td className="teacher-manager-sticky sticky left-0 z-10 px-2 py-2"><button type="button" onClick={onToggle} className="flex w-full items-center gap-1 text-left font-black text-slate-950">{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{row.teacher.name}</button><span className="ml-4 text-[8px] font-semibold text-slate-600">{row.subject || '교과 미등록'}</span></td>{row.days.flatMap(day => day.lessons.map(item => <td key={`${day.date}-${item.period}`} className={clsx('px-1 py-1 align-top font-bold', item.period === 1 && 'teacher-manager-day-start', item.source === 'pulled' ? 'teacher-manager-pulled' : item.source !== 'base' ? 'teacher-manager-changed' : '', item.warning && 'teacher-manager-warning')} title={`${item.badge}${item.originalValue ? `\n변경 전: ${oneLine(item.originalValue)}` : ''}`}>{oneLine(item.value)}</td>))}</tr>{expanded && <tr><td colSpan={36} className="teacher-manager-detail p-3"><div className="grid gap-2 lg:grid-cols-5">{row.days.map(day => <div key={day.date} className="teacher-manager-detail-card rounded-lg p-2"><strong className="text-[10px] text-slate-950">{day.date}</strong><div className="mt-1 space-y-1">{day.lessons.map(item => <LessonLine key={item.period} lesson={item} />)}</div></div>)}</div></td></tr>}</>
}

function LessonLine({ lesson, expanded = false }: { lesson: CompositeTeacherDay['lessons'][number]; expanded?: boolean }) {
  return <div className={clsx('min-w-0', expanded && 'flex items-start gap-2')}><span className="text-[9px] font-black text-slate-600">{lesson.period}교시</span>{lesson.value ? <span className={clsx('block truncate text-[9px] font-bold', lesson.source === 'base' ? 'text-slate-900' : lesson.source === 'pulled' ? 'text-emerald-900' : 'text-violet-900')} title={oneLine(lesson.value)}>{oneLine(lesson.value)}</span> : <span className="block text-[9px] text-slate-500">공강</span>}{lesson.badge && <span className="mt-0.5 block text-[8px] font-black text-amber-800">{lesson.badge}</span>}</div>
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) { return <div className="card p-3"><p className="text-[10px] font-bold text-slate-500">{label}</p><p className={clsx('mt-1 text-xl font-black', color)}>{value}</p></div> }
function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={clsx('inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black', active ? 'bg-violet-500 text-white' : 'text-slate-400 hover:bg-white/5')}>{icon}{label}</button> }
function summarizeDays(days: CompositeTeacherDay[]) { return days.reduce((sum, day) => { day.lessons.forEach(item => { if (!item.value) return; if (item.source === 'base') sum.base++; else if (item.source === 'pulled') sum.pulled++; else sum.changed++; if (item.warning) sum.warning++ }); sum.warning += day.outOfRangeLessons.length; return sum }, { base: 0, changed: 0, pulled: 0, warning: 0 }) }
function oneLine(value: string) { return value.split(/\r?\n/).filter(Boolean).join(' · ') }
function normalizeName(value: string) { return value.replace(/\s+/g, '') }
function staffSubject(teacherName: string, roster?: SharedStaffRoster | null) { const key = normalizeName(teacherName); return roster?.members.find(member => normalizeName(member.name) === key)?.subject?.trim() ?? '' }
function safeSheetName(value: string, used: string[]) { const base = value.replace(/[\\/?*\[\]:]/g, '').slice(0, 25) || '교사'; let name = base; let index = 2; while (used.includes(name)) name = `${base.slice(0, 22)}_${index++}`; return name }
function printTeacherMonth(teacherLabel: string, monthKey: string, days: CompositeTeacherDay[]) {
  const cells = days.map(day => {
    const fixedRows = day.lessons.map(item => `<li class="${day.rule.kind === 'instruction' ? item.source : 'closed-row'}"><b>${item.period}교시</b> ${day.rule.kind === 'instruction' && (item.value || item.badge) ? escapeHtml(oneLine(item.value) || item.badge) : '&nbsp;'}${day.rule.kind === 'instruction' && item.badge ? `<small>${escapeHtml(item.badge)}</small>` : ''}</li>`).join('')
    const lessons = `${day.rule.kind !== 'instruction' ? `<p class="closed">${escapeHtml(day.rule.label)}</p>` : ''}${fixedRows}`
    return `<td class="${day.date.startsWith(monthKey) ? '' : 'outside'}"><strong>${Number(day.date.slice(-2))}</strong>${day.rule.specialWeekdayLabel ? `<em>${escapeHtml(day.rule.specialWeekdayLabel)}</em>` : ''}<ul>${lessons}</ul>${day.rule.eventBadges.map(event => `<i>${escapeHtml(event)}</i>`).join('')}</td>`
  })
  const rows = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => `<tr>${cells.slice(index * 7, index * 7 + 7).join('')}</tr>`).join('')
  printHtml(`<div class="teacher-month"><h1>${escapeHtml(teacherLabel)} · ${escapeHtml(MONTH_LABELS[monthKey] ?? monthKey)} 시간표</h1><p class="meta">2026학년도 2학기 · 학사일정과 승인된 교환·대강·당김수업 반영 · 생성 ${escapeHtml(new Date().toLocaleString('ko-KR'))}</p><table><thead><tr>${['일', '월', '화', '수', '목', '금', '토'].map(day => `<th>${day}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><p class="note">※ 본 시간표는 NEIS와 별개로 업무 편의를 위해 제공되는 예상 자료입니다. 고사기간은 실제 시간표 확정 전까지 비워 표시합니다.</p></div>`, `.teacher-month{font-size:6.5pt}.teacher-month h1{text-align:center;font-size:17pt;margin-bottom:2mm}.meta{text-align:center;color:#444;margin-bottom:4mm}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #444}th{padding:2mm;background:#eef2f7;font-size:8pt}td{height:38mm;padding:1.2mm;vertical-align:top}td>strong{font-size:8pt}.outside{color:#aaa;background:#fafafa}ul{list-style:none;margin:1mm 0 0;padding:0;border:1px solid #bbb}li{height:3.6mm;line-height:3.6mm;padding:0 .7mm;border-top:1px solid #ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}li:first-child{border-top:0}li b{display:inline-block;width:7mm;font-size:5.5pt}li small,em,i{font-style:normal;font-size:5.5pt;margin-left:.5mm}.exchange,.substitution{color:#5b21b6;background:#f3e8ff}.pulled{color:#047857;background:#d1fae5}.closed{color:#be123c;font-weight:700;margin:1mm 0}.closed-row{color:#aaa}.note{margin-top:3mm;color:#555;font-size:7pt}@page{size:A4 landscape;margin:8mm}`)
}
