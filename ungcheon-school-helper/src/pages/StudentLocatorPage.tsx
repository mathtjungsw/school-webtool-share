import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Clock3, MapPin, RefreshCw, Search, UserRoundSearch } from 'lucide-react'
import { getSharedStudentTimetable, subscribeHubResource } from '../services/schoolHub'
import type { PersonalTimetable, SharedStudentTimetable, StudentTimetableDay } from '../services/studentTimetable'
import { UNGCHEON_PERIOD_PLAN } from '../services/ungcheonSchedule'
import { listTimetableChanges, type TimetableChangeRequest } from '../services/timetableChanges'
import { applyStudentLessonOverride } from '../services/effectiveTimetable'
import { useAppStore } from '../stores/appStore'

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
  if (studentId === query) return true
  if (query.length === 4 && studentId.length === 5) {
    return `${studentId[0]}${Number(studentId.slice(1, 3))}${studentId.slice(3)}` === query
  }
  return false
}

export default function StudentLocatorPage() {
  const [dataset, setDataset] = useState<SharedStudentTimetable | null>(null)
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
      const [nextDataset, nextChanges] = await Promise.all([getSharedStudentTimetable(force), listTimetableChanges(teacherName, '', '', true)])
      setDataset(nextDataset); setChanges(nextChanges)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => subscribeHubResource<SharedStudentTimetable | null>('studentTimetable', setDataset), [])
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 30_000); return () => window.clearInterval(timer) }, [])

  const candidates = useMemo(() => {
    const value = submitted.trim()
    if (!value || !dataset) return []
    if (/^\d{4,5}$/.test(value)) return dataset.students.filter(item => normalizedIdMatch(item.student.studentId, value))
    return dataset.students.filter(item => item.student.name === value || item.student.name.includes(value))
  }, [dataset, submitted])

  useEffect(() => {
    if (candidates.length === 1) setSelected(candidates[0])
    else if (!candidates.some(item => item.student.studentId === selected?.student.studentId)) setSelected(null)
  }, [candidates, selected?.student.studentId])

  const submit = (event: FormEvent) => { event.preventDefault(); setSubmitted(query.trim()); setSelected(null) }
  const day = DAY_NAMES[clock.getDay()]
  const period = currentPeriod(clock)
  const baseSlot = selected && day && period ? selected.slots[`${day}${period.period}`] : undefined
  const slotIndex = period && clock.getDay() >= 1 && clock.getDay() <= 5 ? (clock.getDay() - 1) * 7 + Number(period.period) - 1 : -1
  const slot = selected && slotIndex >= 0 ? applyStudentLessonOverride(baseSlot, selected.student.classLabel, clock.toISOString().slice(0, 10), slotIndex, changes) : baseSlot

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="page-title flex items-center gap-2"><UserRoundSearch className="text-cyan-400" size={22} />학생 위치 찾기</h1><p className="page-subtitle">학번 4·5자리 또는 이름으로 현재 수업 교실을 확인합니다.</p></div>
        <button onClick={() => void load(true)} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />새로고침</button>
      </header>
      <form onSubmit={submit} className="card flex gap-2 p-4"><input value={query} onChange={event => setQuery(event.target.value)} className="input-field flex-1 text-base" placeholder="학번 또는 학생 이름 입력" /><button className="btn-primary px-5"><Search size={15} />찾기</button></form>
      {error && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</p>}
      {submitted && candidates.length === 0 && !loading && <div className="card py-14 text-center text-sm text-slate-400">일치하는 학생이 없습니다.</div>}
      {candidates.length > 1 && !selected && <section className="card"><h2 className="font-bold text-white">동명이인·검색 후보 {candidates.length}명</h2><p className="mt-1 text-xs text-slate-500">학번과 학급을 확인해 학생을 선택하세요.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{candidates.map(item => <button key={item.student.studentId} onClick={() => setSelected(item)} className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left hover:border-cyan-400/40"><p className="font-bold text-white">{item.student.name}</p><p className="mt-1 text-xs text-cyan-200">{item.student.studentId} · {item.student.classLabel}반 {item.student.number}번</p></button>)}</div></section>}
      {selected && <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="card"><p className="text-lg font-black text-white">{selected.student.name}</p><p className="mt-1 text-sm text-slate-400">{selected.student.studentId} · {selected.student.classLabel}반 {selected.student.number}번</p><div className="mt-4 rounded-xl bg-white/[0.03] p-3 text-xs text-slate-400"><Clock3 size={14} className="mb-2 text-amber-300" />{clock.toLocaleString('ko-KR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}<br />{period ? `${period.period}교시 ${period.start}~${period.end}` : '현재 정규 수업 시간이 아닙니다.'}</div></div>
        <div className="card border-cyan-400/15"><h2 className="flex items-center gap-2 font-bold text-white"><MapPin size={17} className="text-cyan-400" />현재 위치</h2>{!day ? <p className="mt-6 text-sm text-slate-400">주말에는 현재 수업이 없습니다.</p> : !period ? <p className="mt-6 text-sm text-slate-400">현재 정규 수업 시간이 아닙니다.</p> : slot?.subject ? <><div className="mt-5 grid gap-3 sm:grid-cols-3"><Info label="수업" value={slot.subject} /><Info label="교실" value={slot.classroom || `${selected.student.classLabel}반 교실`} /><Info label="담당 교사" value={slot.teacher || '-'} /></div>{'effectiveChange' in slot && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">승인된 교환·대강 일정이 오늘 시간표에 반영되었습니다.</p>}</> : <p className="mt-6 text-sm text-slate-400">{day}요일 {period.period}교시는 등록된 수업이 없습니다.</p>}<p className="mt-5 text-[11px] text-slate-500">관리자가 업로드한 학생별 시간표를 기준으로 안내하며 NEIS와는 별개입니다.</p></div>
      </section>}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/5 bg-white/[0.025] p-4"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-2 text-base font-bold text-white">{value}</p></div> }
