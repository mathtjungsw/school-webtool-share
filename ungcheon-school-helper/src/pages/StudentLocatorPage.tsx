import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Clock3, MapPin, RefreshCw, Search, UserRoundSearch } from 'lucide-react'
import { getSharedStudentRoster, getSharedStudentTimetable, subscribeHubResource } from '../services/schoolHub'
import { getSharedNeisSnapshot, type SharedNeisSnapshot } from '../services/sharedNeis'
import { STUDENT_TIMETABLE_DAYS, type PersonalTimetable, type SharedStudentTimetable, type StudentTimetableDay } from '../services/studentTimetable'
import type { SharedStudentRoster, StudentRosterEntry } from '../services/rosterAttendance'
import { UNGCHEON_PERIOD_PLAN } from '../services/ungcheonSchedule'
import { listTimetableChanges, type TimetableChangeRequest } from '../services/timetableChanges'
import { applyStudentLessonOverride } from '../services/effectiveTimetable'
import { useAppStore } from '../stores/appStore'
import { getSpecialTimetableDay, getTimetableDayIndex, localDateKey } from '../services/specialTimetableDays'
import { canonicalStudentId, studentIdsMatch } from '../services/studentId'
import { schoolTimetableSlotIndex } from '../services/schoolTimetable'
import { applyHelpClassLocation } from '../services/helpClassSchedule'

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
  const teacherName = useAppStore(state => state.config.teacherName?.trim() ?? '')

  const load = async (force = false) => {
    setLoading(true); setError('')
    try {
      const [nextDataset, nextRoster, nextNeis, nextChanges] = await Promise.all([
        getSharedStudentTimetable(force), getSharedStudentRoster(force), getSharedNeisSnapshot(force),
        listTimetableChanges(teacherName, '', '', true),
      ])
      setDataset(nextDataset); setRoster(nextRoster); setSharedNeis(nextNeis); setChanges(nextChanges)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => subscribeHubResource<SharedStudentTimetable | null>('studentTimetable', setDataset), [])
  useEffect(() => subscribeHubResource<SharedStudentRoster | null>('studentRoster', setRoster), [])
  useEffect(() => subscribeHubResource<SharedNeisSnapshot | null>('sharedNeis', setSharedNeis), [])
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

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="page-title flex items-center gap-2"><UserRoundSearch className="text-cyan-400" size={22} />학생 위치 찾기</h1><p className="page-subtitle">4자리 학번 또는 이름으로 현재 수업 교실을 확인합니다. 기존 5자리 학번도 검색할 수 있습니다.</p></div>
        <button onClick={() => void load(true)} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />새로고침</button>
      </header>
      <form onSubmit={submit} className="card flex gap-2 p-4"><input value={query} onChange={event => setQuery(event.target.value)} className="input-field flex-1 text-base" placeholder="4자리 또는 5자리 학번·학생 이름 입력" /><button className="btn-primary px-5"><Search size={15} />찾기</button></form>
      {error && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</p>}
      {specialTimetableDay && <p className="rounded-xl border-2 border-amber-400 bg-amber-100 p-3 text-sm font-black text-slate-950">{specialTimetableDay.message} 현재 위치도 {specialTimetableDay.sourceWeekday}요일 수업을 기준으로 안내합니다.</p>}
      {submitted && candidates.length === 0 && !loading && <div className="card py-14 text-center text-sm text-slate-400">일치하는 학생이 없습니다.</div>}
      {candidates.length > 1 && !selected && <section className="card"><h2 className="font-black text-slate-100">동명이인·검색 후보 {candidates.length}명</h2><p className="mt-1 text-xs font-semibold text-slate-400">학번과 학급을 확인해 학생을 선택하세요.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{candidates.map(item => <button key={item.student.studentId} onClick={() => setSelected(item)} className="rounded-xl border-2 border-slate-400/30 bg-surface-900 p-3 text-left hover:border-cyan-500"><p className="font-black text-slate-100">{item.student.name}</p><p className="mt-1 text-xs font-bold text-cyan-400">{item.student.studentId} · {item.student.classLabel}반 {item.student.number}번</p></button>)}</div></section>}
      {selected && <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="card"><p className="text-lg font-black text-white">{selected.student.name}</p><p className="mt-1 text-sm text-slate-400">{selected.student.studentId} · {selected.student.classLabel}반 {selected.student.number}번</p><div className="mt-4 rounded-xl bg-white/[0.03] p-3 text-xs text-slate-400"><Clock3 size={14} className="mb-2 text-amber-300" />{clock.toLocaleString('ko-KR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}<br />{period ? `${period.period}교시 ${period.start}~${period.end}` : '현재 정규 수업 시간이 아닙니다.'}</div></div>
        <div className="card border-cyan-400/15">
          <h2 className="flex items-center gap-2 font-bold text-white"><MapPin size={17} className="text-cyan-400" />현재 위치</h2>
          {!day ? <p className="mt-6 text-sm text-slate-400">주말에는 현재 수업이 없습니다.</p> : period ? (
            slot?.subject
              ? <LessonLocation label={`${period.period}교시`} slot={slot} defaultClassroom={`${selected.student.classLabel}반 교실`} />
              : <p className="mt-6 text-sm text-slate-400">{day}요일 {period.period}교시는 등록된 수업이 없습니다.</p>
          ) : (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              <AdjacentLesson label="앞시간" period={adjacent?.previous} slot={previousSlot} defaultClassroom={`${selected.student.classLabel}반 교실`} />
              <AdjacentLesson label="뒷시간" period={adjacent?.next} slot={nextSlot} defaultClassroom={`${selected.student.classLabel}반 교실`} />
            </div>
          )}
          <p className="mt-5 text-[11px] text-slate-500">쉬는 시간에는 직전 수업 교실과 다음 수업 교실을 함께 안내합니다. 도움반 학생은 색칠된 개인 시간표를 기준으로 위치를 안내하며 동아리는 제외합니다. 승인된 교환·대강 일정도 반영하며, 실제 NEIS 입력을 대신하지 않는 편의 기능입니다.</p>
        </div>
      </section>}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/5 bg-white/[0.025] p-4"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-2 text-base font-bold text-white">{value}</p></div> }

type LocatedSlot = ReturnType<typeof applyStudentLessonOverride>

function LessonLocation({ label, slot, defaultClassroom }: { label: string; slot: NonNullable<LocatedSlot>; defaultClassroom: string }) {
  return <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4">
    <p className="mb-3 text-xs font-black text-cyan-300">{label}</p>
    <div className="grid gap-3 sm:grid-cols-3"><Info label="수업" value={slot.subject} /><Info label="교실" value={slot.classroom || defaultClassroom} /><Info label="담당 교사" value={slot.teacher || '-'} /></div>
    {'helpClass' in slot && <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-200">도움반 개인 시간표의 색칠된 수업입니다. 위치를 도움반으로 안내합니다.</p>}
    {'effectiveChange' in slot && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">승인된 교환·대강 일정이 반영되었습니다.</p>}
  </div>
}

function AdjacentLesson({ label, period, slot, defaultClassroom }: {
  label: '앞시간' | '뒷시간'
  period?: (typeof UNGCHEON_PERIOD_PLAN)[number] & { startMinutes: number; endMinutes: number }
  slot?: LocatedSlot
  defaultClassroom: string
}) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
    <p className="text-xs font-black text-cyan-300">{label}{period ? ` · ${period.period}교시 (${period.start}~${period.end})` : ''}</p>
    {!period ? <p className="mt-3 text-sm text-slate-400">{label} 수업이 없습니다.</p> : slot?.subject ? <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3"><Info label="수업" value={slot.subject} /><Info label="교실" value={slot.classroom || defaultClassroom} /><Info label="담당 교사" value={slot.teacher || '-'} /></div> : <p className="mt-3 text-sm text-slate-400">등록된 수업이 없습니다.</p>}
    {slot && 'helpClass' in slot && <p className="mt-3 text-[11px] font-bold text-emerald-300">도움반 수업 · 위치 도움반</p>}
    {slot && 'effectiveChange' in slot && <p className="mt-3 text-[11px] font-semibold text-amber-300">승인된 수업 변경 반영</p>}
  </div>
}
