import { useMemo, useState } from 'react'
import { CheckCircle2, CopyPlus, ExternalLink, Trash2 } from 'lucide-react'
import { localId } from './model'
import type { HandoverCadence, HandoverTemplate } from './types'
import { EmptyState, Field, SectionHeader, type FutureTabProps } from './ui'

const cadenceLabels: Record<HandoverCadence, string> = { once: '1회', monthly: '매월', semester: '매 학기', annual: '매년' }

export default function HandoverTab({ state, saving, update }: FutureTabProps) {
  const [form, setForm] = useState({ title: '', department: '', cadence: 'annual' as HandoverCadence, targetMonthDay: '03-02', purpose: '', procedure: '', priorDocumentUrl: '', caution: '', successorName: '' })
  const templates = useMemo(() => [...state.handoverTemplates].sort((a, b) => a.targetMonthDay.localeCompare(b.targetMonthDay) || a.title.localeCompare(b.title, 'ko')), [state.handoverTemplates])

  const submit = async () => {
    if (!form.title.trim() || !form.department.trim()) return
    const now = new Date().toISOString()
    const item: HandoverTemplate = { ...form, id: localId('handover'), title: form.title.trim(), department: form.department.trim(), successorConfirmedAt: '', createdAt: now, updatedAt: now }
    await update(current => ({ ...current, handoverTemplates: [...current.handoverTemplates, item] }))
    setForm(current => ({ ...current, title: '', purpose: '', procedure: '', priorDocumentUrl: '', caution: '', successorName: '' }))
  }

  const duplicate = async (item: HandoverTemplate) => {
    const now = new Date().toISOString()
    await update(current => ({ ...current, handoverTemplates: [...current.handoverTemplates, { ...item, id: localId('handover'), title: `${item.title} 복사본`, successorConfirmedAt: '', createdAt: now, updatedAt: now }] }))
  }

  const openReference = (value: string) => {
    if (/^https?:\/\//i.test(value)) void window.electron?.openExternal(value)
    else if (window.electron) void window.electron.openPath(value)
  }

  return <div className="grid xl:grid-cols-[440px_1fr] gap-4 items-start">
    <section className="card">
      <SectionHeader title="연간업무·인수인계 등록" description="반복 주기, 전년도 문서, 처리 순서와 주의사항을 한 묶음으로 보관합니다." />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3"><Field label="업무명"><input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field><Field label="부서"><input className="input-field" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="반복"><select className="input-field" value={form.cadence} onChange={e => setForm({ ...form, cadence: e.target.value as HandoverCadence })}><option value="once">1회</option><option value="monthly">매월</option><option value="semester">매 학기</option><option value="annual">매년</option></select></Field><Field label="기준 월-일"><input className="input-field" value={form.targetMonthDay} onChange={e => setForm({ ...form, targetMonthDay: e.target.value })} placeholder="03-02" /></Field></div>
        <Field label="업무 목적"><textarea className="input-field min-h-16" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} /></Field>
        <Field label="처리 순서"><textarea className="input-field min-h-24" value={form.procedure} onChange={e => setForm({ ...form, procedure: e.target.value })} placeholder="1. 공문 확인&#10;2. 대상자 취합&#10;3. 결과 보고" /></Field>
        <Field label="전년도 문서·폴더 링크"><input className="input-field" value={form.priorDocumentUrl} onChange={e => setForm({ ...form, priorDocumentUrl: e.target.value })} placeholder="https://… 또는 경로" /></Field>
        <Field label="주의사항"><textarea className="input-field min-h-16" value={form.caution} onChange={e => setForm({ ...form, caution: e.target.value })} /></Field>
        <Field label="후임자"><input className="input-field" value={form.successorName} onChange={e => setForm({ ...form, successorName: e.target.value })} /></Field>
        <button className="btn-primary w-full" onClick={submit} disabled={saving}>인수인계 템플릿 저장</button>
      </div>
    </section>
    <section className="card">
      <SectionHeader title="업무 템플릿" description={`${templates.length}개 · 후임자가 확인하기 전에는 통합 알림에 표시됩니다.`} />
      {templates.length === 0 ? <EmptyState>저장된 연간업무·인수인계가 없습니다.</EmptyState> : <div className="space-y-3">{templates.map(item => <article key={item.id} className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 p-4">
        <div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-950 dark:text-white">{item.title}</strong><span className="badge bg-violet-500/15 text-violet-300">{item.department}</span><span className="badge bg-black/[0.03] dark:bg-white/5 text-slate-600 dark:text-slate-400">{cadenceLabels[item.cadence]} · {item.targetMonthDay}</span></div>{item.purpose && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{item.purpose}</p>}</div><div className="flex gap-1"><button className="btn-ghost" title="복제" onClick={() => duplicate(item)}><CopyPlus size={14} /></button><button className="btn-ghost text-rose-300" title="삭제" onClick={() => update(current => ({ ...current, handoverTemplates: current.handoverTemplates.filter(saved => saved.id !== item.id) }))}><Trash2 size={14} /></button></div></div>
        <div className="mt-3 grid md:grid-cols-2 gap-3 text-xs"><div className="rounded-lg bg-black/10 p-3"><strong className="text-slate-700 dark:text-slate-300">처리 순서</strong><p className="mt-1 whitespace-pre-line text-slate-600 dark:text-slate-400">{item.procedure || '입력 없음'}</p></div><div className="rounded-lg bg-black/10 p-3"><strong className="text-slate-700 dark:text-slate-300">주의사항</strong><p className="mt-1 whitespace-pre-line text-slate-600 dark:text-slate-400">{item.caution || '입력 없음'}</p></div></div>
        <div className="mt-3 flex flex-wrap items-center gap-2">{item.priorDocumentUrl && <button className="btn-secondary flex items-center gap-1 text-xs" onClick={() => openReference(item.priorDocumentUrl)}><ExternalLink size={12} />전년도 자료</button>}<span className="ml-auto text-xs text-slate-600 dark:text-slate-400">후임자 {item.successorName || '미지정'}</span><button className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${item.successorConfirmedAt ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`} onClick={() => update(current => ({ ...current, handoverTemplates: current.handoverTemplates.map(saved => saved.id !== item.id ? saved : { ...saved, successorConfirmedAt: saved.successorConfirmedAt ? '' : new Date().toISOString(), updatedAt: new Date().toISOString() }) }))}><CheckCircle2 size={13} />{item.successorConfirmedAt ? '확인 완료' : '후임 확인'}</button></div>
      </article>)}</div>}
    </section>
  </div>
}
