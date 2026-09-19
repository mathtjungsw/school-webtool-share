import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, KeyRound, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react'
import clsx from 'clsx'
import { getExecutiveScheduleBundle, changeExecutivePassword, type ExecutiveScheduleBundle } from '../services/schoolHub'
import { useAuthStore } from '../stores/authStore'
import { PULLED_LESSONS_2026 } from '../data/pulledLessons2026'
import { buildCompositeTeacherDay, weekDates, type CompositeLesson } from '../services/teacherTimetableCalendar'
import { UNGCHEON_PERIOD_PLAN } from '../services/ungcheonSchedule'
import { localDateKey } from '../services/specialTimetableDays'

function activePeriod(now = new Date()) {
  const value = now.getHours() * 60 + now.getMinutes()
  const active = UNGCHEON_PERIOD_PLAN.find(item => {
    const [sh, sm] = item.start.split(':').map(Number)
    const [eh, em] = item.end.split(':').map(Number)
    return value >= sh * 60 + sm && value <= eh * 60 + em
  })
  return Number(active?.period || 1)
}

function lines(value: string) { return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean) }
function lessonParts(lesson: CompositeLesson) {
  const values = lines(lesson.value)
  const classRoom = values[0] || ''
  const subject = values.slice(1).join(' · ') || '과목 미지정'
  const digits = classRoom.replace(/\D/g, '')
  const classLabel = /^\d{3}$/.test(digits) ? `${digits[0]}-${Number(digits.slice(1))}` : classRoom
  return { room: classRoom || '미지정', classLabel: classLabel || '이동수업', subject }
}

function useExecutiveBundle() {
  const teacherName = useAuthStore(state => state.teacherName)
  const token = useAuthStore(state => state.executiveAccessToken)
  const logout = useAuthStore(state => state.logout)
  const [bundle, setBundle] = useState<ExecutiveScheduleBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    try { setBundle(await getExecutiveScheduleBundle(teacherName, token)) }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      if (message.includes('인증이 만료')) void logout()
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [teacherName, token])
  return { bundle, loading, error, load }
}

function Header({ title, description, fetchedAt, loading, onRefresh }: { title: string; description: string; fetchedAt?: string; loading: boolean; onRefresh: () => void }) {
  const role = useAuthStore(state => state.executiveRole)
  return <header className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black text-emerald-700">{role === 'principal' ? '교장메뉴' : '교감메뉴'} · 조회 전용</p><h1 className="mt-1 text-2xl font-black text-slate-950">{title}</h1><p className="mt-2 text-sm font-semibold text-slate-600">{description}</p></div>
      <button type="button" onClick={onRefresh} disabled={loading} className="btn-secondary"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />새로고침</button>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-950"><ShieldCheck size={18} />실제 교사 사용 여부에 따라 나이스와 차이가 있을 수 있습니다<span className="ml-auto text-[11px] font-semibold text-amber-800">마지막 조회 {fetchedAt ? new Date(fetchedAt).toLocaleString('ko-KR') : '-'}</span></div>
  </header>
}

export default function ExecutiveCurrentClassesPage() {
  const { bundle, loading, error, load } = useExecutiveBundle()
  const [period, setPeriod] = useState(activePeriod())
  const [query, setQuery] = useState('')
  const date = localDateKey()
  const rows = useMemo(() => {
    if (!bundle?.timetable) return []
    return bundle.timetable.teachers.flatMap(teacher => {
      const day = buildCompositeTeacherDay(bundle.timetable!, teacher.name, date, bundle.timetableChanges, PULLED_LESSONS_2026, bundle.timetableOverrides)
      const lesson = day.lessons[period - 1]
      if (!lesson?.value) return []
      return [{ teacher: teacher.name, lesson, ...lessonParts(lesson) }]
    }).sort((a, b) => a.room.localeCompare(b.room, 'ko', { numeric: true }))
  }, [bundle, date, period])
  const knownRooms = useMemo(() => {
    const values = bundle?.timetable?.teachers.flatMap(teacher => teacher.slots.map(slot => lines(slot.value)[0]).filter(Boolean)) ?? []
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
  }, [bundle])
  const duplicateRooms = new Set(rows.filter((row, index) => rows.some((other, otherIndex) => otherIndex !== index && other.room === row.room)).map(row => row.room))
  const filtered = rows.filter(row => [row.room, row.classLabel, row.subject, row.teacher].join(' ').includes(query.trim()))
  const emptyCount = Math.max(0, knownRooms.length - new Set(rows.map(row => row.room)).size)
  return <div className="mx-auto max-w-7xl space-y-5 p-6">
    <Header title="현재 수업 현황" description="현재 교시의 교실·과목·담당 교사를 변경 수업까지 합쳐 확인합니다." fetchedAt={bundle?.fetchedAt} loading={loading} onRefresh={() => void load()} />
    {error && <p className="rounded-xl border border-rose-300 bg-rose-50 p-3 font-bold text-rose-950">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-4">{[
      ['선택 교시', `${period}교시`], ['수업 중 교실', `${new Set(rows.map(row => row.room)).size}실`], ['공실', `${emptyCount}실`], ['확인 필요', `${duplicateRooms.size}건`],
    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-600">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>)}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap gap-2">{UNGCHEON_PERIOD_PLAN.slice(0, 7).map(item => <button key={item.period} type="button" onClick={() => setPeriod(Number(item.period))} className={clsx('rounded-xl border px-3 py-2 text-xs font-black', period === Number(item.period) ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-700')}>{item.period}교시 <span className="font-semibold opacity-70">{item.start}</span></button>)}</div>
      <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3"><Search size={16} className="text-slate-500" /><input value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold outline-none" placeholder="교실·교사·과목·학급 검색" /></label>
    </section>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map(row => {
      const review = duplicateRooms.has(row.room) || row.room === '미지정'
      return <article key={`${row.teacher}-${row.room}-${row.lesson.value}`} className={clsx('rounded-2xl border-2 bg-white p-4 shadow-sm', review ? 'border-amber-400' : row.lesson.source === 'base' ? 'border-slate-200' : 'border-emerald-400')}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xl font-black text-slate-950">{row.room}</p><p className="mt-1 text-xs font-bold text-slate-600">{row.classLabel}</p></div><span className={clsx('rounded-full px-2 py-1 text-[10px] font-black', review ? 'bg-amber-100 text-amber-950' : row.lesson.source === 'base' ? 'bg-sky-100 text-sky-900' : 'bg-emerald-100 text-emerald-950')}>{review ? '확인 필요' : row.lesson.badge || '정상'}</span></div>
        <p className="mt-4 text-base font-black text-slate-950">{row.subject}</p><p className="mt-1 text-sm font-bold text-slate-700">{row.teacher}</p>
      </article>
    })}</section>
    {!loading && !filtered.length && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-600">조건에 맞는 수업이 없습니다.</p>}
    <PasswordChange />
  </div>
}

export function ExecutiveTeacherSchedulePage() {
  const { bundle, loading, error, load } = useExecutiveBundle()
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [date, setDate] = useState(localDateKey())
  const teachers = useMemo(() => (bundle?.timetable?.teachers ?? []).map(item => item.name).sort((a, b) => a.localeCompare(b, 'ko')).filter(name => name.includes(query.trim())), [bundle, query])
  useEffect(() => { if (!selected && teachers.length) setSelected(teachers[0]) }, [teachers, selected])
  const week = bundle?.timetable && selected ? weekDates(date).map(day => buildCompositeTeacherDay(bundle.timetable!, selected, day, bundle.timetableChanges, PULLED_LESSONS_2026, bundle.timetableOverrides)) : []
  return <div className="mx-auto max-w-7xl space-y-5 p-6">
    <Header title="교사 시간표" description="전체 교사의 주간시간표와 선택 날짜의 실제 변경 시간표를 조회합니다." fetchedAt={bundle?.fetchedAt} loading={loading} onRefresh={() => void load()} />
    {error && <p className="rounded-xl border border-rose-300 bg-rose-50 p-3 font-bold text-rose-950">{error}</p>}
    <section className="grid gap-4 lg:grid-cols-[270px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-4"><label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 py-2.5 text-sm outline-none" placeholder="교사 검색" /></label><div className="mt-3 max-h-[620px] space-y-1 overflow-y-auto">{teachers.map(name => <button key={name} type="button" onClick={() => setSelected(name)} className={clsx('w-full rounded-lg px-3 py-2 text-left text-sm font-bold', selected === name ? 'bg-emerald-700 text-white' : 'text-slate-800 hover:bg-slate-100')}>{name}</button>)}</div></aside>
      <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div><p className="text-xs font-bold text-slate-500">선택 교사</p><p className="text-xl font-black text-slate-950">{selected || '-'}</p></div><label className="flex items-center gap-2 text-xs font-black text-slate-700"><CalendarDays size={16} />기준 날짜<input type="date" value={date} onChange={event => setDate(event.target.value)} className="input-field" /></label></div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-[760px] w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-left">교시</th>{week.map(day => <th key={day.date} className="p-3 text-left">{day.date.slice(5)}</th>)}</tr></thead><tbody>{Array.from({ length: 7 }, (_, index) => <tr key={index} className="border-t border-slate-200"><th className="p-3 text-left text-slate-700">{index + 1}교시</th>{week.map(day => { const lesson = day.lessons[index]; return <td key={day.date} className={clsx('p-3 align-top font-semibold text-slate-800', lesson.source !== 'base' && lesson.value && 'bg-emerald-50')}><p className="whitespace-pre-line">{lesson.value || '-'}</p>{lesson.badge && <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-900">{lesson.badge}</span>}</td> })}</tr>)}</tbody></table></div>
      </div>
    </section>
  </div>
}

function PasswordChange() {
  const teacherName = useAuthStore(state => state.teacherName)
  const token = useAuthStore(state => state.executiveAccessToken)
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [message, setMessage] = useState('')
  const submit = async () => {
    setMessage('')
    try { await changeExecutivePassword(teacherName, token, current, next); setMessage('비밀번호를 변경했습니다.'); setCurrent(''); setNext('') }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4"><button type="button" onClick={() => setOpen(value => !value)} className="flex items-center gap-2 text-sm font-black text-slate-800"><KeyRound size={16} />추가 비밀번호 변경</button>{open && <div className="mt-3 flex flex-wrap gap-2"><input type="password" value={current} onChange={event => setCurrent(event.target.value)} className="input-field" placeholder="현재 비밀번호" /><input type="password" value={next} onChange={event => setNext(event.target.value)} className="input-field" placeholder="새 비밀번호 4~30자" /><button type="button" onClick={() => void submit()} className="btn-primary">변경</button>{message && <p className="w-full text-xs font-bold text-slate-700">{message}</p>}</div>}</section>
}
