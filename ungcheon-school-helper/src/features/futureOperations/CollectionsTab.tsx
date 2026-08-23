import { useMemo, useState } from 'react'
import { ClipboardCheck, Trash2 } from 'lucide-react'
import { collectionProgress, localId, todayText } from './model'
import type { CollectionCampaign, CollectionResponseType } from './types'
import { EmptyState, Field, SectionHeader, splitNames, type FutureTabProps } from './ui'

export default function CollectionsTab({ state, saving, update }: FutureTabProps) {
  const [form, setForm] = useState({ title: '', description: '', deadline: todayText(), responseType: 'check' as CollectionResponseType, options: '', targets: '' })
  const [selectedId, setSelectedId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const selected = state.collections.find(item => item.id === selectedId) ?? state.collections[0]

  const submit = async () => {
    const targetNames = splitNames(form.targets)
    if (!form.title.trim() || !targetNames.length) return
    const item: CollectionCampaign = {
      id: localId('collection'), title: form.title.trim(), description: form.description.trim(), deadline: form.deadline,
      responseType: form.responseType, options: splitNames(form.options), targetNames, responses: [], createdAt: new Date().toISOString(),
    }
    await update(current => ({ ...current, collections: [...current.collections, item] }))
    setSelectedId(item.id)
    setForm(current => ({ ...current, title: '', description: '', targets: '' }))
  }

  const saveResponse = async (campaign: CollectionCampaign, name: string) => {
    const defaultValue = campaign.responseType === 'check' ? '확인' : ''
    const value = drafts[`${campaign.id}:${name}`] ?? defaultValue
    if (!value.trim()) return
    await update(current => ({ ...current, collections: current.collections.map(item => item.id !== campaign.id ? item : {
      ...item,
      responses: [...item.responses.filter(response => response.respondentName !== name), { respondentName: name, value: value.trim(), submittedAt: new Date().toISOString() }],
    }) }))
  }

  const selectedProgress = useMemo(() => selected ? collectionProgress(selected) : null, [selected])
  return <div className="grid xl:grid-cols-[420px_1fr] gap-4 items-start">
    <div className="space-y-4">
      <section className="card">
        <SectionHeader title="자료수합 만들기" description="대상과 응답 형식을 정하고 응답·미응답을 확인합니다. 시험판은 파일 업로드 없이 로컬 응답만 지원합니다." />
        <div className="space-y-3">
          <Field label="수합 제목"><input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="예: 2학기 평가계획 확인" /></Field>
          <Field label="설명"><textarea className="input-field min-h-20" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="마감일"><input type="date" className="input-field" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></Field><Field label="응답 형식"><select className="input-field" value={form.responseType} onChange={e => setForm({ ...form, responseType: e.target.value as CollectionResponseType })}><option value="check">확인 체크</option><option value="shortText">단답</option><option value="select">선택</option><option value="link">링크</option></select></Field></div>
          {form.responseType === 'select' && <Field label="선택 항목(쉼표 또는 줄바꿈)"><input className="input-field" value={form.options} onChange={e => setForm({ ...form, options: e.target.value })} /></Field>}
          <Field label="대상자(쉼표 또는 줄바꿈)"><textarea className="input-field min-h-28" value={form.targets} onChange={e => setForm({ ...form, targets: e.target.value })} placeholder="홍길동, 김교사" /></Field>
          <button className="btn-primary w-full flex items-center justify-center gap-2" onClick={submit} disabled={saving}><ClipboardCheck size={15} />수합 만들기</button>
        </div>
      </section>
      <section className="card">
        <SectionHeader title="수합 목록" description={`${state.collections.length}개`} />
        {state.collections.length === 0 ? <EmptyState>만든 자료수합이 없습니다.</EmptyState> : <div className="space-y-2">{state.collections.map(item => { const progress = collectionProgress(item); return <button key={item.id} className={`w-full rounded-xl border p-3 text-left ${selected?.id === item.id ? 'border-violet-400 bg-violet-500/10' : 'border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5'}`} onClick={() => setSelectedId(item.id)}><strong className="text-sm text-slate-950 dark:text-white">{item.title}</strong><p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{progress.submitted}/{item.targetNames.length}명 응답 · {item.deadline} 마감</p></button>})}</div>}
      </section>
    </div>
    <section className="card">
      {!selected || !selectedProgress ? <EmptyState>왼쪽에서 수합을 만들거나 선택하세요.</EmptyState> : <>
        <SectionHeader title={selected.title} description={`${selected.description || '설명 없음'} · 미응답 ${selectedProgress.pending.length}명`} action={<button className="btn-ghost text-rose-300 flex items-center gap-1" onClick={() => update(current => ({ ...current, collections: current.collections.filter(item => item.id !== selected.id) }))}><Trash2 size={14} />삭제</button>} />
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-black/10 dark:border-white/10 text-left text-xs text-slate-600 dark:text-slate-400"><th className="p-2">대상자</th><th className="p-2">상태</th><th className="p-2">응답</th><th className="p-2 w-24">처리</th></tr></thead><tbody>{selected.targetNames.map(name => { const response = selected.responses.find(item => item.respondentName === name); const key = `${selected.id}:${name}`; return <tr key={name} className="border-b border-black/5 dark:border-white/5"><td className="p-2 font-semibold text-slate-950 dark:text-white">{name}</td><td className="p-2">{response ? <span className="text-emerald-300">응답 완료</span> : <span className="text-amber-300">미응답</span>}</td><td className="p-2">{selected.responseType === 'check' ? <span className="text-slate-600 dark:text-slate-400">{response?.value || '확인 체크'}</span> : selected.responseType === 'select' ? <select className="input-field py-1.5" value={drafts[key] ?? response?.value ?? ''} onChange={e => setDrafts({ ...drafts, [key]: e.target.value })}><option value="">선택</option>{selected.options.map(option => <option key={option}>{option}</option>)}</select> : <input className="input-field py-1.5" value={drafts[key] ?? response?.value ?? ''} onChange={e => setDrafts({ ...drafts, [key]: e.target.value })} placeholder={selected.responseType === 'link' ? 'https://…' : '응답 입력'} />}</td><td className="p-2"><button className="btn-secondary py-1.5 text-xs" onClick={() => saveResponse(selected, name)}>저장</button>{response && <button className="btn-ghost ml-1 text-xs" onClick={() => update(current => ({ ...current, collections: current.collections.map(item => item.id !== selected.id ? item : { ...item, responses: item.responses.filter(saved => saved.respondentName !== name) }) }))}>취소</button>}</td></tr>})}</tbody></table></div>
      </>}
    </section>
  </div>
}

