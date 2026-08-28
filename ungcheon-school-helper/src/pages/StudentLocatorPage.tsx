import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, Download, FileSpreadsheet, MapPin, Printer, RefreshCw, Search, ShieldCheck, Upload, UserRoundSearch } from 'lucide-react'
import clsx from 'clsx'
import { getSchoolTimetable, getSharedStudentRoster, getSharedStudentTimetable, subscribeHubResource } from '../services/schoolHub'
import { getSharedNeisSnapshot, type SharedNeisSnapshot } from '../services/sharedNeis'
import { STUDENT_TIMETABLE_DAYS, type PersonalTimetable, type SharedStudentTimetable, type StudentTimetableDay } from '../services/studentTimetable'
import type { SharedStudentRoster, StudentRosterEntry } from '../services/rosterAttendance'
import { UNGCHEON_PERIOD_PLAN } from '../services/ungcheonSchedule'
import { listTimetableChanges, type TimetableChangeRequest } from '../services/timetableChanges'
import { applyStudentLessonOverride } from '../services/effectiveTimetable'
import { useAppStore } from '../stores/appStore'
import { getSpecialTimetableDay, getTimetableDayIndex, localDateKey } from '../services/specialTimetableDays'
import { canonicalStudentId, studentIdsMatch } from '../services/studentId'
import { schoolTimetableSlotIndex, type SchoolTimetable } from '../services/schoolTimetable'
import { applyHelpClassLocation } from '../services/helpClassSchedule'
import {
  buildStudentLocationResultWorkbookBytes,
  buildStudentLocationTemplateWorkbookBytes,
  buildStudentSpecificLocationRows,
  parseStudentLocationInputWorkbook,
  type StudentLocationInputRow,
  type StudentSpecificLocationRow,
} from '../services/studentSpecificLocator'
import { escapePrintHtml, printDocument } from '../services/printing'

const DAY_NAMES: Array<StudentTimetableDay | ''> = ['', '월', '화', '수', '목', '금', '']

function currentPeriod(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  return UNGCHEON_PERIOD_PLAN.find(item => {
    const [sh, sm] = item.start.split(':').map(Number)
    const [eh, em] = item.end.split(':').map(Number)
    return minutes >= sh * 60 + sm && minutes <= eh * 60 + em
  })
}

function normalizedIdMatch(studentId: string, query: string) {
  return studentIdsMatch(studentId, query)
}

function surroundingPeriods(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const withMinutes = UNGCHEON_PERIOD_PLAN.map(item => {
    const [sh, sm] = item.start.split(':').map(Number)
    const [eh, em] = item.end.split(':').map(Number)
    return { ...item, startMinutes: sh * 60 + sm, endMinutes: eh * 60 + em }
  })
  return {
    previous: [...withMinutes].reverse().find(item => item.endMinutes < minutes),
    next: withMinutes.find(item => item.startMinutes > minutes),
  }
}

function canonicalizeTimetableStudent(item: PersonalTimetable): PersonalTimetable {
  const studentId = canonicalStudentId(item.student.studentId)
  return studentId === item.student.studentId
    ? item
    : { ...item, student: { ...item.student, studentId } }
}

function rosterStudentToTimetable(student: StudentRosterEntry): PersonalTimetable {
  const slots: PersonalTimetable['slots'] = {}
  for (const day of STUDENT_TIMETABLE_DAYS) {
    for (let period = 1; period <= 7; period += 1) {
      slots[`${day}${period}`] = { day, period, subject: '', teacher: '', classroom: '', raw: '', selectedCourse: false }
    }
  }
  return {
    student: {
      studentId: canonicalStudentId(student.studentId),
      name: student.name,
      grade: student.grade,
      className: student.className,
      classLabel: `${student.grade}-${Number(student.className)}`,
      number: String(Number(student.number)),
      enrollmentCount: 0,
    },
    slots,
    selections: [],
    warnings: [],
  }
}

export default function StudentLocatorPage() {
  const [dataset, setDataset] = useState<SharedStudentTimetable | null>(null)
  const [roster, setRoster] = useState<SharedStudentRoster | null>(null)
  const [sharedNeis, setSharedNeis] = useState<SharedNeisSnapshot | null>(null)
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [selected, setSelected] = useState<PersonalTimetable | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clock, setClock] = useState(new Date())
  const [changes, setChanges] = useState<TimetableChangeRequest[]>([])
  const [schoolTimetable, setSchoolTimetable] = useState<SchoolTimetable | null>(null)
  const [activeTab, setActiveTab] = useState<'current' | 'specific'>('current')
  const [batchInputs, setBatchInputs] = useState<StudentLocationInputRow[]>([])
  const [batchFileName, setBatchFileName] = useState('')
  const [batchDate, setBatchDate] = useState(localDateKey())
  const [batchPeriods, setBatchPeriods] = useState<number[]>([1])
  const [batchRows, setBatchRows] = useState<StudentSpecificLocationRow[]>([])
  const [batchFilter, setBatchFilter] = useState<'all' | 'normal' | 'mismatch' | 'homonym' | 'changed' | 'review'>('all')
  const [batchMessage, setBatchMessage] = useState('')
  const teacherName = useAppStore(state => state.config.teacherName?.trim() ?? '')

  const load = async (force = false) => {
    setLoading(true); setError('')
    try {
      const [nextDataset, nextRoster, nextNeis, nextChanges, nextSchoolTimetable] = await Promise.all([
        getSharedStudentTimetable(force), getSharedStudentRoster(force), getSharedNeisSnapshot(force),
        listTimetableChanges(teacherName, '', '', true),
        getSchoolTimetable(force),
      ])
      setDataset(nextDataset); setRoster(nextRoster); setSharedNeis(nextNeis); setChanges(nextChanges); setSchoolTimetable(nextSchoolTimetable)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => subscribeHubResource<SharedStudentTimetable | null>('studentTimetable', setDataset), [])
  useEffect(() => subscribeHubResource<SharedStudentRoster | null>('studentRoster', setRoster), [])
  useEffect(() => subscribeHubResource<SharedNeisSnapshot | null>('sharedNeis', setSharedNeis), [])
  useEffect(() => subscribeHubResource<SchoolTimetable | null>('timetable', setSchoolTimetable), [])
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 30_000); return () => window.clearInterval(timer) }, [])

  const candidates = useMemo(() => {
    const value = submitted.trim()
    if (!value) return []
    const byId = new Map<string, PersonalTimetable>()
    for (const item of dataset?.students ?? []) {
      const normalized = canonicalizeTimetableStudent(item)
      byId.set(normalized.student.studentId, normalized)
    }
    for (const student of roster?.students ?? []) {
      const normalized = rosterStudentToTimetable(student)
      if (!byId.has(normalized.student.studentId)) byId.set(normalized.student.studentId, normalized)
    }
    const students = [...byId.values()]
    if (/^\d{4,5}$/.test(value)) return students.filter(item => normalizedIdMatch(item.student.studentId, value))
    return students.filter(item => item.student.name === value || item.student.name.includes(value))
  }, [dataset, roster, submitted])

  useEffect(() => {
    if (candidates.length === 1) setSelected(candidates[0])
    else if (!candidates.some(item => item.student.studentId === selected?.student.studentId)) setSelected(null)
  }, [candidates, selected?.student.studentId])

  const submit = (event: FormEvent) => { event.preventDefault(); setSubmitted(query.trim()); setSelected(null) }
  const dateKey = localDateKey(clock)
  const specialTimetableDay = getSpecialTimetableDay(dateKey)
  const dayIndex = getTimetableDayIndex(dateKey)
  const day = specialTimetableDay?.sourceWeekday ?? DAY_NAMES[clock.getDay()]
  const period = currentPeriod(clock)
  const adjacent = !period ? surroundingPeriods(clock) : null

  const resolveSlot = (periodNumber: number) => {
    if (!selected || !day) return undefined
    const personalSlot = selected.slots[`${day}${periodNumber}`]
    const neisSlot = sharedNeis?.timetables.find(item =>
      item.date === dateKey.replace(/-/g, '') &&
      String(Number(item.grade)) === String(Number(selected.student.grade)) &&
      String(Number(item.classNm)) === String(Number(selected.student.className)) &&
      Number(item.period) === periodNumber,
    )
    const baseSlot = personalSlot?.subject ? personalSlot : neisSlot ? {
      day,
      period: periodNumber,
      subject: neisSlot.subject,
      teacher: neisSlot.teacher,
      classroom: neisSlot.classroom,
      raw: '',
      selectedCourse: false,
    } : personalSlot
    const slotIndex = schoolTimetableSlotIndex(dayIndex, periodNumber)
    const effectiveSlot = slotIndex >= 0
      ? applyStudentLessonOverride(baseSlot, selected.student.classLabel, dateKey, slotIndex, changes)
      : baseSlot
    return applyHelpClassLocation(effectiveSlot, selected.student, day, periodNumber)
  }
  const slot = period ? resolveSlot(Number(period.period)) : undefined
  const previousSlot = adjacent?.previous ? resolveSlot(Number(adjacent.previous.period)) : undefined
  const nextSlot = adjacent?.next ? resolveSlot(Number(adjacent.next.period)) : undefined

  const batchDayIndex = getTimetableDayIndex(batchDate)
  const batchDay = batchDayIndex >= 0 ? STUDENT_TIMETABLE_DAYS[batchDayIndex] : ''
  const batchSpecial = getSpecialTimetableDay(batchDate)
  const filteredBatchRows = useMemo(() => {
    const filtered = batchRows.filter(row => {
      if (batchFilter === 'all') return true
      if (batchFilter === 'changed') return row.scheduleState === 'changed'
      if (batchFilter === 'review') return row.scheduleState === 'review' || row.validation === 'not_found' || row.validation === 'empty'
      return row.validation === batchFilter
    })
    return [...filtered].sort((a, b) => a.classLabel.localeCompare(b.classLabel, 'ko', { numeric: true }) || a.confirmedStudentId.localeCompare(b.confirmedStudentId, 'ko', { numeric: true }) || a.period - b.period)
  }, [batchRows, batchFilter])

  const toggleBatchPeriod = (periodNumber: number) => {
    setBatchRows([])
    setBatchPeriods(current => current.includes(periodNumber)
      ? (current.length === 1 ? current : current.filter(period => period !== periodNumber))
      : [...current, periodNumber].sort((a, b) => a - b))
  }

  const importBatchWorkbook = async (file?: File) => {
    if (!file) return
    setBatchMessage('')
    try {
      const rows = parseStudentLocationInputWorkbook(await file.arrayBuffer())
      setBatchInputs(rows); setBatchFileName(file.name); setBatchRows([])
      setBatchMessage(`${rows.length}개 입력 행을 불러왔습니다. 날짜와 교시를 확인한 뒤 조회해 주세요.`)
    } catch (reason) {
      setBatchMessage(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const downloadBatchTemplate = async () => {
    const saved = await window.electron?.saveFileDialog('학생_특정시간_위치찾기_입력양식.xlsx', buildStudentLocationTemplateWorkbookBytes())
    setBatchMessage(saved ? '입력 양식을 저장했습니다.' : '입력 양식 저장을 취소했습니다.')
  }

  const runBatchLookup = () => {
    if (!batchInputs.length) { setBatchMessage('먼저 작성한 Excel 입력 파일을 불러와 주세요.'); return }
    if (!batchPeriods.length) { setBatchMessage('조회할 교시를 하나 이상 선택해 주세요.'); return }
    const rows = buildStudentSpecificLocationRows({ inputs: batchInputs, date: batchDate, periods: batchPeriods, dataset, roster, schoolTimetable, sharedNeis, changes })
    setBatchRows(rows)
    const changed = rows.filter(row => row.scheduleState === 'changed').length
    const review = rows.filter(row => row.scheduleState === 'review' || ['mismatch', 'not_found'].includes(row.validation)).length
    setBatchMessage(`${rows.length}개 결과를 계산했습니다.${changed ? ` 변경 시간표 ${changed}건` : ''}${review ? ` · 확인 필요 ${review}건` : ''}`)
  }

  const exportBatchRows = async () => {
    if (!batchRows.length) return
    const name = `학생_특정시간_위치_${batchDate}_${batchPeriods.join('-')}교시.xlsx`
    const saved = await window.electron?.saveFileDialog(name, buildStudentLocationResultWorkbookBytes(filteredBatchRows, batchDate, batchPeriods))
    setBatchMessage(saved ? '화면에 보이는 결과를 Excel로 저장했습니다.' : 'Excel 저장을 취소했습니다.')
  }

  const printBatchRows = () => {
    if (!filteredBatchRows.length) return
    const rowsHtml = filteredBatchRows.map(row => `<tr class="${row.scheduleState === 'changed' ? 'changed' : row.scheduleState === 'review' || row.validation !== 'normal' ? 'review' : ''}"><td>${row.inputRowNumber}</td><td>${escapePrintHtml(row.inputStudentId)}<br>${escapePrintHtml(row.inputName)}</td><td>${escapePrintHtml(row.confirmedStudentId)}<br><b>${escapePrintHtml(row.confirmedName)}</b></td><td>${escapePrintHtml(row.classLabel)}</td><td>${escapePrintHtml(row.date)}<br>${escapePrintHtml(row.day)} ${row.period}교시</td><td>${escapePrintHtml(row.subject)}</td><td>${escapePrintHtml(row.classroom)}</td><td>${escapePrintHtml(row.teacher)}</td><td>${escapePrintHtml(row.validationLabel)}<br>${escapePrintHtml(row.scheduleLabel)}</td><td>${escapePrintHtml(row.message)}</td></tr>`).join('')
    printDocument({
      title: `학생 특정 시간 위치찾기 ${batchDate}`,
      orientation: 'landscape', pageMode: 'multi-page',
      bodyHtml: `<div class="location-sheet"><h1>학생 특정 시간 위치찾기</h1><p class="meta">${escapePrintHtml(batchDate)} · ${batchPeriods.map(value => `${value}교시`).join(', ')} · ${filteredBatchRows.length}건 · 생성 ${escapePrintHtml(new Date().toLocaleString('ko-KR'))}</p><p class="notice">당김수업·수업 교체 등 변경사항이 반영된 행은 원자료를 함께 확인해 주세요. 입력 파일과 결과는 현재 PC에서만 처리됩니다.</p><table><thead><tr><th>행</th><th>입력</th><th>확인 학생</th><th>학급</th><th>날짜·교시</th><th>수업</th><th>위치</th><th>교사</th><th>상태</th><th>확인 메시지</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`,
      styles: `.location-sheet{font-size:7pt}.location-sheet h1{text-align:center;font-size:17pt;margin-bottom:2mm}.meta{text-align:center;margin-bottom:3mm}.notice{border:1px solid #f59e0b;background:#fffbeb;padding:2mm;margin-bottom:3mm;font-weight:700}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #64748b;padding:1.4mm;vertical-align:top;word-break:break-all}th{background:#e2e8f0}th:nth-child(1){width:4%}th:nth-child(2),th:nth-child(3){width:9%}th:nth-child(4){width:6%}th:nth-child(5){width:9%}th:nth-child(6),th:nth-child(7),th:nth-child(8){width:9%}th:nth-child(9){width:11%}.changed{background:#ecfdf5}.review{background:#fff7ed}@page{size:A4 landscape;margin:8mm}`,
    })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="page-title flex items-center gap-2"><UserRoundSearch className="text-cyan-700" size={22} />학생 위치 찾기</h1><p className="page-subtitle">한 학생의 현재 위치 또는 여러 학생의 특정 날짜·교시 위치를 확인합니다.</p></div>
        <button onClick={() => void load(true)} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />새로고침</button>
      </header>
      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-950">{error}</p>}
      <nav className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button type="button" onClick={() => setActiveTab('current')} className={clsx('flex-1 rounded-xl px-4 py-3 text-sm font-black transition', activeTab === 'current' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100')}><MapPin className="mr-2 inline" size={16} />현재 위치 찾기</button>
        <button type="button" onClick={() => setActiveTab('specific')} className={clsx('flex-1 rounded-xl px-4 py-3 text-sm font-black transition', activeTab === 'specific' ? 'bg-indigo-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100')}><CalendarDays className="mr-2 inline" size={16} />학생 특정 시간 위치찾기</button>
      </nav>

      {activeTab === 'current' ? <>
        <form onSubmit={submit} className="card flex gap-2 p-4"><input value={query} onChange={event => setQuery(event.target.value)} className="input-field flex-1 text-base" placeholder="4자리 또는 5자리 학번·학생 이름 입력" /><button className="btn-primary px-5"><Search size={15} />찾기</button></form>
        {specialTimetableDay && <p className="rounded-xl border-2 border-amber-400 bg-amber-100 p-3 text-sm font-black text-slate-950">{specialTimetableDay.message} 현재 위치도 {specialTimetableDay.sourceWeekday}요일 수업을 기준으로 안내합니다.</p>}
        {submitted && candidates.length === 0 && !loading && <div className="card py-14 text-center text-sm text-slate-600">일치하는 학생이 없습니다.</div>}
        {candidates.length > 1 && !selected && <section className="card"><h2 className="font-black text-slate-950">동명이인·검색 후보 {candidates.length}명</h2><p className="mt-1 text-xs font-semibold text-slate-600">학번과 학급을 확인해 학생을 선택하세요.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{candidates.map(item => <button key={item.student.studentId} onClick={() => setSelected(item)} className="rounded-xl border-2 border-slate-200 bg-white p-3 text-left hover:border-cyan-600"><p className="font-black text-slate-950">{item.student.name}</p><p className="mt-1 text-xs font-bold text-cyan-700">{item.student.studentId} · {item.student.classLabel}반 {item.student.number}번</p></button>)}</div></section>}
        {selected && <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="card"><p className="text-lg font-black text-slate-950">{selected.student.name}</p><p className="mt-1 text-sm text-slate-600">{selected.student.studentId} · {selected.student.classLabel}반 {selected.student.number}번</p><div className="mt-4 rounded-xl bg-slate-100 p-3 text-xs font-semibold text-slate-700"><Clock3 size={14} className="mb-2 text-amber-700" />{clock.toLocaleString('ko-KR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}<br />{period ? `${period.period}교시 ${period.start}~${period.end}` : '현재 정규 수업 시간이 아닙니다.'}</div></div>
          <div className="card border-cyan-300">
            <h2 className="flex items-center gap-2 font-bold text-slate-950"><MapPin size={17} className="text-cyan-700" />현재 위치</h2>
            {!day ? <p className="mt-6 text-sm text-slate-600">주말에는 현재 수업이 없습니다.</p> : period ? (
              slot?.subject
                ? <LessonLocation label={`${period.period}교시`} slot={slot} defaultClassroom={`${selected.student.classLabel}반 교실`} />
                : <p className="mt-6 text-sm text-slate-600">{day}요일 {period.period}교시는 등록된 수업이 없습니다.</p>
            ) : (
              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                <AdjacentLesson label="앞시간" period={adjacent?.previous} slot={previousSlot} defaultClassroom={`${selected.student.classLabel}반 교실`} />
                <AdjacentLesson label="뒷시간" period={adjacent?.next} slot={nextSlot} defaultClassroom={`${selected.student.classLabel}반 교실`} />
              </div>
            )}
            <p className="mt-5 text-[11px] font-semibold text-slate-600">쉬는 시간에는 직전 수업 교실과 다음 수업 교실을 함께 안내합니다. 도움반 학생은 색칠된 개인 시간표를 기준으로 위치를 안내하며 동아리는 제외합니다. 승인된 교환·대강 일정도 반영하며, 실제 NEIS 입력을 대신하지 않는 편의 기능입니다.</p>
          </div>
        </section>}
      </> : <>
        <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-emerald-950 shadow-sm">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={21} /><div><p className="font-black">학생 명단과 조회 결과는 이 PC에서만 처리됩니다.</p><p className="mt-1 text-xs font-semibold leading-5">업로드한 Excel 원본과 계산 결과를 학교 공유 서버·구글시트로 전송하거나 저장하지 않습니다.</p></div></div>
        </section>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="card space-y-4">
            <div><h2 className="flex items-center gap-2 text-base font-black text-slate-950"><FileSpreadsheet size={18} className="text-emerald-700" />1. 학생 명단 불러오기</h2><p className="mt-1 text-xs font-semibold text-slate-600">양식의 학번·이름 중 하나만 입력해도 됩니다. 이름만 입력하면 동명이인을 모두 표시합니다.</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => void downloadBatchTemplate()} className="btn-secondary justify-center"><Download size={15} />Excel 입력 양식 다운로드</button>
              <label className="btn-primary cursor-pointer justify-center"><Upload size={15} />작성한 Excel 불러오기<input type="file" accept=".xlsx,.xls" className="hidden" onChange={event => { void importBatchWorkbook(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-black text-slate-950">{batchFileName || '아직 불러온 파일이 없습니다.'}</p><p className="mt-1 text-xs font-semibold text-slate-600">{batchInputs.length ? `${batchInputs.length}개 입력 행` : '양식을 내려받아 학번 또는 이름을 입력해 주세요.'}</p></div>
          </div>
          <div className="card space-y-4">
            <div><h2 className="flex items-center gap-2 text-base font-black text-slate-950"><CalendarDays size={18} className="text-indigo-700" />2. 날짜·교시 선택</h2><p className="mt-1 text-xs font-semibold text-slate-600">요일은 날짜와 특정 요일 운영 자료를 기준으로 자동 계산합니다.</p></div>
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <label className="text-xs font-black text-slate-700">날짜<input type="date" value={batchDate} onChange={event => { setBatchDate(event.target.value); setBatchRows([]) }} className="input-field mt-1 w-full" /></label>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3"><p className="text-xs font-black text-indigo-950">{batchDay ? `${batchDay}요일 시간표` : '수업일이 아님'}</p><p className="mt-1 text-[11px] font-semibold text-indigo-800">{batchSpecial ? batchSpecial.message : '선택 날짜에 맞춰 요일을 자동 적용했습니다.'}</p></div>
            </div>
            <div><p className="mb-2 text-xs font-black text-slate-700">조회 교시 · 여러 교시 선택 가능</p><div className="grid grid-cols-7 gap-1.5">{Array.from({ length: 7 }, (_, index) => index + 1).map(periodNumber => <button type="button" key={periodNumber} onClick={() => toggleBatchPeriod(periodNumber)} className={clsx('rounded-lg border-2 py-2 text-xs font-black', batchPeriods.includes(periodNumber) ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-400')}>{periodNumber}교시</button>)}</div></div>
            <button type="button" onClick={runBatchLookup} disabled={loading || !batchInputs.length} className="btn-primary w-full justify-center py-3 disabled:cursor-not-allowed disabled:opacity-50"><Search size={16} />학생 위치 일괄 조회</button>
          </div>
        </section>
        {batchMessage && <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-950">{batchMessage}</p>}
        {batchRows.length > 0 && <section className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-black text-slate-950">3. 조회 결과 <span className="text-indigo-700">{filteredBatchRows.length}건</span></h2><p className="mt-1 text-xs font-semibold text-slate-600">학급·학번·교시 순으로 정렬됩니다. 강조된 행은 변경 또는 입력 확인이 필요합니다.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={printBatchRows} className="btn-secondary"><Printer size={15} />인쇄 미리보기·인쇄</button><button type="button" onClick={() => void exportBatchRows()} className="btn-primary"><Download size={15} />Excel 다운로드</button></div></div>
          {batchRows.some(row => row.scheduleState === 'changed') && <p className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm font-black text-emerald-950">당김수업·수업 교체 등 변경사항이 반영되었습니다. 필요하면 원자료를 확인해 주세요.</p>}
          <div className="flex flex-wrap gap-1.5">{([
            ['all', '전체'], ['normal', '정상'], ['mismatch', '학번·이름 불일치'], ['homonym', '동명이인'], ['changed', '변경 반영'], ['review', '확인 필요'],
          ] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setBatchFilter(value)} className={clsx('rounded-full border px-3 py-1.5 text-xs font-black', batchFilter === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700')}>{label}</button>)}</div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1500px] w-full text-left text-xs text-slate-800"><thead className="bg-slate-100 text-slate-950"><tr>{['입력', '확인 학생', '학년·반', '날짜·교시', '수업', '강의실/현재 위치', '담당 교사', '시간표 근거', '검증 상태', '시간표 상태', '확인 메시지'].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-black">{label}</th>)}</tr></thead><tbody>{filteredBatchRows.map(row => <tr key={row.key} className={clsx('border-t border-slate-200 align-top', row.scheduleState === 'changed' && 'bg-emerald-50', (row.scheduleState === 'review' || row.validation !== 'normal') && row.scheduleState !== 'changed' && 'bg-amber-50')}><td className="px-3 py-3"><b>{row.inputStudentId || '-'}</b><br />{row.inputName || '-'}</td><td className="px-3 py-3"><b>{row.confirmedStudentId || '-'}</b><br />{row.confirmedName || '-'}</td><td className="px-3 py-3 font-bold">{row.classLabel || '-'}</td><td className="px-3 py-3">{row.date}<br /><b>{row.day || '-'} {row.period}교시</b></td><td className="px-3 py-3 font-bold">{row.subject}</td><td className="px-3 py-3 font-bold">{row.classroom}</td><td className="px-3 py-3">{row.teacher}</td><td className="px-3 py-3">{row.source}</td><td className="px-3 py-3"><StatusBadge tone={row.validation === 'normal' ? 'normal' : 'review'}>{row.validationLabel}</StatusBadge></td><td className="px-3 py-3"><StatusBadge tone={row.scheduleState}>{row.scheduleLabel}</StatusBadge></td><td className="max-w-[360px] px-3 py-3 leading-5">{row.message}</td></tr>)}</tbody></table>
          </div>
          <p className="text-[11px] font-semibold text-slate-600">Excel에도 검증 상태·변경 표시·확인 메시지를 함께 저장합니다. 인쇄는 A4 가로 방향과 반복 머리글을 사용합니다.</p>
        </section>}
      </>}
    </div>
  )
}

function StatusBadge({ tone, children }: { tone: StudentSpecificLocationRow['scheduleState'] | 'normal' | 'review'; children: string }) {
  return <span className={clsx('inline-flex rounded-full px-2 py-1 text-[10px] font-black', tone === 'changed' ? 'bg-emerald-200 text-emerald-950' : tone === 'review' ? 'bg-amber-200 text-amber-950' : tone === 'no_lesson' ? 'bg-slate-200 text-slate-800' : 'bg-sky-100 text-sky-900')}>{children}</span>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-semibold text-slate-600">{label}</p><p className="mt-2 text-base font-black text-slate-950">{value}</p></div> }

type LocatedSlot = ReturnType<typeof applyStudentLessonOverride>

function LessonLocation({ label, slot, defaultClassroom }: { label: string; slot: NonNullable<LocatedSlot>; defaultClassroom: string }) {
  return <div className="mt-4 rounded-2xl border border-cyan-300 bg-cyan-50 p-4">
    <p className="mb-3 text-xs font-black text-cyan-900">{label}</p>
    <div className="grid gap-3 sm:grid-cols-3"><Info label="수업" value={slot.subject} /><Info label="교실" value={slot.classroom || defaultClassroom} /><Info label="담당 교사" value={slot.teacher || '-'} /></div>
    {'helpClass' in slot && <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-[11px] font-bold text-emerald-950">도움반 개인 시간표의 색칠된 수업입니다. 위치를 도움반으로 안내합니다.</p>}
    {'effectiveChange' in slot && <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-[11px] font-bold text-amber-950">승인된 교환·대강 일정이 반영되었습니다.</p>}
  </div>
}

function AdjacentLesson({ label, period, slot, defaultClassroom }: {
  label: '앞시간' | '뒷시간'
  period?: (typeof UNGCHEON_PERIOD_PLAN)[number] & { startMinutes: number; endMinutes: number }
  slot?: LocatedSlot
  defaultClassroom: string
}) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs font-black text-cyan-900">{label}{period ? ` · ${period.period}교시 (${period.start}~${period.end})` : ''}</p>
    {!period ? <p className="mt-3 text-sm text-slate-600">{label} 수업이 없습니다.</p> : slot?.subject ? <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3"><Info label="수업" value={slot.subject} /><Info label="교실" value={slot.classroom || defaultClassroom} /><Info label="담당 교사" value={slot.teacher || '-'} /></div> : <p className="mt-3 text-sm text-slate-600">등록된 수업이 없습니다.</p>}
    {slot && 'helpClass' in slot && <p className="mt-3 text-[11px] font-bold text-emerald-900">도움반 수업 · 위치 도움반</p>}
    {slot && 'effectiveChange' in slot && <p className="mt-3 text-[11px] font-semibold text-amber-900">승인된 수업 변경 반영</p>}
  </div>
}
