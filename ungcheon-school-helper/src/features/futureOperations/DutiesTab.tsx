import { useMemo, useState } from 'react'
import { Scale, Trash2 } from 'lucide-react'
import { balancedDutyAssignments } from './model'
import { EmptyState, Field, SectionHeader, splitNames, type FutureTabProps } from './ui'

export default function DutiesTab({ state, saving, update }: FutureTabProps) {
  const [form, setForm] = useState({ dutyName: '', dates: '', names: '', startTime: '08:00', location: '' })
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    state.dutyAssignments.forEach(item => map.set(item.assigneeName, (map.get(item.assigneeName) ?? 0) + 1))
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
  }, [state.dutyAssignments])
  const assignments = useMemo(() => [...state.dutyAssignments].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)), [state.dutyAssignments])

  const submit = async () => {
    const dates = splitNames(form.dates).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    const names = splitNames(form.names)
    if (!form.dutyName.trim() || !dates.length || !names.length) return
    const created = balancedDutyAssignments(form.dutyName.trim(), dates, names, state.dutyAssignments, form.startTime, form.location.trim())
    await update(current => ({ ...current, dutyAssignments: [...current.dutyAssignments, ...created] }))
    setForm(current => ({ ...current, dates: '' }))
  }

  return <div className="grid xl:grid-cols-[420px_1fr] gap-4 items-start">
    <section className="card">
      <SectionHeader title="당번·지도 균형 배정" description="현재 로컬 배정 누계를 기준으로 횟수가 적은 사람부터 자동 배정합니다." />
      <div className="space-y-3">
        <Field label="당번·지도명"><input className="input-field" value={form.dutyName} onChange={e => setForm({ ...form, dutyName: e.target.value })} placeholder="예: 등교지도" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="시작 시간"><input type="time" className="input-field" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></Field><Field label="장소"><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="정문" /></Field></div>
        <Field label="배정 날짜(쉼표 또는 줄바꿈)"><textarea className="input-field min-h-24 font-mono" value={form.dates} onChange={e => setForm({ ...form, dates: e.target.value })} placeholder={'2026-09-01\n2026-09-02'} /></Field>
        <Field label="배정 후보(쉼표 또는 줄바꿈)"><textarea className="input-field min-h-28" value={form.names} onChange={e => setForm({ ...form, names: e.target.value })} placeholder="김교사, 이교사, 박교사" /></Field>
        <button className="btn-primary w-full flex items-center justify-center gap-2" onClick={submit} disabled={saving}><Scale size={15} />횟수 균형으로 배정</button>
      </div>
      {counts.length > 0 && <div className="mt-4 border-t border-black/5 dark:border-white/5 pt-4"><p className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">현재 누계</p><div className="flex flex-wrap gap-2">{counts.map(([name, count]) => <span key={name} className="badge bg-black/[0.03] dark:bg-white/5 text-slate-700 dark:text-slate-300">{name} {count}회</span>)}</div></div>}
    </section>
    <section className="card">
      <SectionHeader title="배정 일정" description={`${assignments.length}건`} />
      {assignments.length === 0 ? <EmptyState>자동 배정된 일정이 없습니다.</EmptyState> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-black/10 dark:border-white/10 text-left text-xs text-slate-600 dark:text-slate-400"><th className="p-2">날짜</th><th className="p-2">당번</th><th className="p-2">담당자</th><th className="p-2">시간·장소</th><th className="p-2 w-10"></th></tr></thead><tbody>{assignments.map(item => <tr key={item.id} className="border-b border-black/5 dark:border-white/5"><td className="p-2 font-semibold text-slate-950 dark:text-white">{item.date}</td><td className="p-2 text-slate-700 dark:text-slate-300">{item.dutyName}</td><td className="p-2 font-semibold text-sky-300">{item.assigneeName}</td><td className="p-2 text-slate-600 dark:text-slate-400">{item.startTime}{item.location ? ` · ${item.location}` : ''}</td><td className="p-2"><button className="btn-ghost text-rose-300" onClick={() => update(current => ({ ...current, dutyAssignments: current.dutyAssignments.filter(saved => saved.id !== item.id) }))}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>}
    </section>
  </div>
}

