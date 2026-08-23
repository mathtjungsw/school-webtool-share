import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, Trash2 } from 'lucide-react'
import { densityWarnings, localId, todayText } from './model'
import type { DensityEvent, DensityEventKind } from './types'
import { EmptyState, Field, SectionHeader, type FutureTabProps } from './ui'

export default function DensityTab({ state, saving, update }: FutureTabProps) {
  const [form, setForm] = useState({ kind: 'assessment' as DensityEventKind, title: '', subject: '', grade: '1', className: '전체', date: todayText() })
  const [error, setError] = useState('')
  const events = useMemo(() => [...state.densityEvents].sort((a, b) => a.date.localeCompare(b.date) || a.grade.localeCompare(b.grade)), [state.densityEvents])
  const preview = useMemo<DensityEvent>(() => ({ ...form, id: 'preview', createdAt: '' }), [form])
  const previewWarnings = useMemo(() => densityWarnings(preview, [...events, preview]), [events, preview])

  const submit = async () => {
    setError('')
    if (!form.title.trim()) return setError('평가명 또는 행사명을 입력해 주세요.')
    if (form.kind === 'assessment' && !form.subject.trim()) return setError('수행평가는 과목을 입력해 주세요.')
    const item: DensityEvent = { ...form, title: form.title.trim(), subject: form.subject.trim(), className: form.className.trim() || '전체', id: localId('density'), createdAt: new Date().toISOString() }
    await update(current => ({ ...current, densityEvents: [...current.densityEvents, item] }))
    setForm(current => ({ ...current, title: '', subject: current.kind === 'assessment' ? current.subject : '' }))
  }

  return <div className="space-y-4">
    <section className="card">
      <SectionHeader title="수행평가·행사 밀집도" description="학생 이름 없이 학년·반 단위 일정 수만 계산합니다. 하루 3건, 한 주 5건부터 경고합니다." />
      <div className="grid sm:grid-cols-2 xl:grid-cols-6 gap-3">
        <Field label="구분"><select className="input-field" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as DensityEventKind })}><option value="assessment">수행평가</option><option value="schoolEvent">학교행사</option></select></Field>
        <Field label="학년"><select className="input-field" value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}><option>1</option><option>2</option><option>3</option></select></Field>
        <Field label="반"><input className="input-field" value={form.className} onChange={e => setForm({ ...form, className: e.target.value })} placeholder="전체 또는 1" /></Field>
        <Field label="날짜"><input type="date" className="input-field" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="과목"><input className="input-field" disabled={form.kind !== 'assessment'} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="예: 수학" /></Field>
        <Field label="평가·행사명"><input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="예: 탐구 보고서" /></Field>
      </div>
      {previewWarnings.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{previewWarnings.map(warning => <span key={warning.label} className={`badge ${warning.severity === 'warning' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}><AlertTriangle size={12} />{warning.label}</span>)}</div>}
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      <button className="btn-primary mt-4 flex items-center gap-2" onClick={submit} disabled={saving}><CalendarRange size={15} />일정 등록</button>
    </section>
    <section className="card">
      <SectionHeader title="등록 일정" description="같은 학년·반의 하루·주간 밀집도를 행별로 확인합니다." />
      {events.length === 0 ? <EmptyState>등록된 수행평가 또는 행사가 없습니다.</EmptyState> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-black/10 dark:border-white/10 text-left text-xs text-slate-600 dark:text-slate-400"><th className="p-2">날짜</th><th className="p-2">대상</th><th className="p-2">구분</th><th className="p-2">과목·제목</th><th className="p-2">밀집도 판정</th><th className="p-2 w-10"></th></tr></thead><tbody>{events.map(item => { const warnings = densityWarnings(item, events); return <tr key={item.id} className={`border-b border-black/5 dark:border-white/5 ${warnings.some(warning => warning.severity === 'warning') ? 'bg-rose-500/5' : ''}`}><td className="p-2 font-semibold text-slate-950 dark:text-white">{item.date}</td><td className="p-2 text-slate-700 dark:text-slate-300">{item.grade}학년 {item.className === '전체' ? '전체' : `${item.className}반`}</td><td className="p-2 text-slate-600 dark:text-slate-400">{item.kind === 'assessment' ? '수행평가' : '학교행사'}</td><td className="p-2 text-slate-700 dark:text-slate-300">{item.subject && `${item.subject} · `}{item.title}</td><td className="p-2">{warnings.length ? warnings.map(warning => <span key={warning.label} className="block text-xs text-rose-300">{warning.label}</span>) : <span className="text-xs text-emerald-300">밀집 경고 없음</span>}</td><td className="p-2"><button className="btn-ghost text-rose-300" onClick={() => update(current => ({ ...current, densityEvents: current.densityEvents.filter(saved => saved.id !== item.id) }))}><Trash2 size={14} /></button></td></tr>})}</tbody></table></div>}
    </section>
  </div>
}

