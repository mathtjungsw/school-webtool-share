import { useEffect, useState } from 'react'
import { addDays, format } from 'date-fns'
import { ArrowUpRight, BellRing, CalendarDays, Check, ListTodo, StickyNote } from 'lucide-react'
import clsx from 'clsx'
import type { StaffChecklist } from '../../services/rosterAttendance'
import type { PersonalTask } from '../../services/personalOrganizer'
import { savePersonalMemo } from '../../services/personalOrganizer'
import {
  classifySharedWorkDeadline,
  isNewSharedWork,
  isSharedWorkComplete,
  loadSharedWorkLastViewedAt,
  subscribeSharedWorkViewed,
} from '../../services/sharedWorkNotifications'

export function SharedTasksWidget({
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
    if (lastViewedAt !== null && isNewSharedWork(task, lastViewedAt)) return { label: '새 업무', className: 'bg-violet-100 text-violet-950 dark:bg-violet-500/20 dark:text-violet-100' }
    const category = classifySharedWorkDeadline(task, teacherName)
    if (category === 'overdue') return { label: '기한 초과', className: 'bg-rose-100 text-rose-950 dark:bg-rose-500/20 dark:text-rose-100' }
    if (category === 'today') return { label: '오늘 마감', className: 'bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100' }
    if (category === 'dueSoon') return { label: '마감 임박', className: 'bg-sky-100 text-sky-950 dark:bg-sky-500/20 dark:text-sky-100' }
    return null
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-violet-100 dark:bg-violet-500/15"><BellRing size={14} className="text-violet-800 dark:text-violet-200" /></div><div><p className="text-sm font-black text-slate-950 dark:text-white">업무 알림</p><p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">새 업무와 마감 상태 자동 분류</p></div></div>
        <button onClick={onOpen} className="btn-ghost flex items-center gap-1.5 text-[10px]">업무센터<ArrowUpRight size={11} /></button>
      </div>
      {!teacherName ? <button onClick={onSettings} className="w-full rounded-xl border border-dashed border-violet-400/40 py-6 text-center text-[11px] font-bold text-violet-900 dark:text-violet-100">환경설정에서 이름을 등록하면 배부된 업무를 볼 수 있습니다.</button>
        : visible.length ? <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 text-[9px] font-black"><span className="rounded-full bg-violet-100 px-2 py-1 text-violet-950 dark:bg-violet-500/20 dark:text-violet-100">새 업무 {newCount}</span><span className="rounded-full bg-amber-100 px-2 py-1 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100">오늘 {todayCount}</span><span className="rounded-full bg-sky-100 px-2 py-1 text-sky-950 dark:bg-sky-500/20 dark:text-sky-100">임박 {dueSoonCount}</span><span className="rounded-full bg-rose-100 px-2 py-1 text-rose-950 dark:bg-rose-500/20 dark:text-rose-100">초과 {overdueCount}</span></div>
          {visible.map(task => { const alert = alertLabel(task); return <div key={task.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white/70 p-2.5 dark:border-white/10 dark:bg-white/[0.025]"><button onClick={() => void onComplete(task)} className="group mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-slate-500 text-violet-800 hover:border-violet-600 dark:border-slate-500 dark:text-violet-200" aria-label="업무 전체 완료"><Check size={11} className="opacity-0 transition-opacity group-hover:opacity-100" /></button><button onClick={onOpen} className="min-w-0 flex-1 text-left"><div className="flex min-w-0 items-center gap-1.5"><p className="truncate text-[11px] font-bold text-slate-950 dark:text-white">{task.title}</p>{alert && <span className={clsx('shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black', alert.className)}>{alert.label}</span>}</div><p className="mt-0.5 text-[9px] font-semibold text-slate-600 dark:text-slate-300">{task.deadline || '기한 없음'}{task.departmentNames.length ? ` · ${task.departmentNames.join('·')}` : ''}{task.priority === 'high' ? ' · 중요' : ''}</p></button></div>})}
        </div> : <button onClick={onOpen} className="w-full rounded-xl border border-dashed border-slate-300 py-6 text-center text-[11px] font-semibold text-slate-700 hover:border-violet-400 dark:border-white/10 dark:text-slate-200">현재 확인할 공유 업무가 없습니다.</button>}
    </section>
  )
}

export function PersonalTasksWidget({ tasks, onOpenCalendar, onToggle }: {
  tasks: PersonalTask[]
  onOpenCalendar: () => void
  onToggle: (task: PersonalTask) => Promise<void>
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const end = format(addDays(new Date(), 13), 'yyyy-MM-dd')
  const visible = tasks.filter(task => !task.completed && task.date <= end).slice(0, 7)
  const overdue = tasks.filter(task => !task.completed && task.date < today).length

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15"><ListTodo size={14} className="text-emerald-800 dark:text-emerald-200" /></div><div><p className="text-sm font-black text-slate-950 dark:text-white">개인 업무</p><p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">오늘부터 2주 안에 확인할 업무</p></div></div>
        <button onClick={onOpenCalendar} className="btn-ghost flex items-center gap-1.5 text-[10px]"><CalendarDays size={12} />등록·관리<ArrowUpRight size={11} /></button>
      </div>
      {overdue > 0 && <p className="mb-2 rounded-lg bg-rose-100 px-2.5 py-1.5 text-[10px] font-black text-rose-950 dark:bg-rose-500/15 dark:text-rose-100">기한이 지난 업무가 {overdue}개 있습니다.</p>}
      {visible.length ? <div className="grid gap-2 md:grid-cols-2">
        {visible.map(task => (
          <div key={task.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white/70 p-2.5 dark:border-white/10 dark:bg-white/[0.025]">
            <button onClick={() => void onToggle(task)} className="group mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-slate-500 text-emerald-800 hover:border-emerald-600 dark:text-emerald-200" aria-label="업무 완료"><Check size={11} className="opacity-0 transition-opacity group-hover:opacity-100" /></button>
            <button onClick={onOpenCalendar} className="min-w-0 flex-1 text-left"><p className="truncate text-[11px] font-bold text-slate-950 dark:text-white">{task.title}</p><p className={clsx('mt-0.5 text-[9px] font-semibold', task.date < today ? 'text-rose-800 dark:text-rose-200' : task.date === today ? 'text-amber-900 dark:text-amber-100' : 'text-slate-600 dark:text-slate-300')}>{task.date}{task.time ? ` · ${task.time}` : ''}{task.priority === 'high' ? ' · 중요' : ''}</p></button>
          </div>
        ))}
      </div> : <button onClick={onOpenCalendar} className="w-full rounded-xl border border-dashed border-slate-300 py-6 text-center text-[11px] font-semibold text-slate-700 hover:border-emerald-400 dark:border-white/10 dark:text-slate-200">등록된 개인 업무가 없습니다. 캘린더에서 첫 업무를 등록해보세요.</button>}
    </section>
  )
}

export function PersonalMemoWidget({ value, onChange, loaded }: { value: string; onChange: (value: string) => void; loaded: boolean }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 dark:bg-amber-500/15"><StickyNote size={14} className="text-amber-900 dark:text-amber-100" /></div><div><p className="text-sm font-black text-slate-950 dark:text-white">개인 메모</p><p className="text-[10px] font-black text-emerald-800 dark:text-emerald-200">이 PC에만 자동 저장</p></div></div>
      <textarea value={value} onChange={event => onChange(event.target.value)} onBlur={() => { void savePersonalMemo(value) }} rows={7} disabled={!loaded} placeholder="잠깐 기억해둘 내용을 적으세요. 학교 공유 서버에는 전송되지 않습니다." className="w-full resize-none text-[11px] leading-relaxed" />
      <p className="mt-2 text-right text-[9px] font-semibold text-slate-600 dark:text-slate-300">{loaded ? '입력 후 자동 저장됩니다.' : '메모 불러오는 중...'}</p>
    </section>
  )
}
