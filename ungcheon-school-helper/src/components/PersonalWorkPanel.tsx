import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { createPersonalTaskId, savePersonalTasks, type PersonalTask, type PersonalTaskPriority } from '../services/personalOrganizer'
import { schoolDate } from '../services/schoolDate'
import { useTaskFocus } from '../services/taskNavigation'

const empty = () => ({ title: '', date: schoolDate(), time: '', endTime: '', priority: 'normal' as PersonalTaskPriority, memo: '' })
const priorityLabel = { low: '낮음', normal: '보통', high: '높음' }
export default function PersonalWorkPanel({ tasks, onTasksChanged, onSuccess }: { tasks: PersonalTask[]; onTasksChanged: (tasks: PersonalTask[]) => void; onSuccess: (text: string) => void }) {
  const [draft, setDraft] = useState(empty)
  const [editId, setEditId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const focus = useTaskFocus()
  const listRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (focus?.kind !== 'personal') return
    const target = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-task-id]') ?? [])].find(node => node.dataset.taskId === focus.id)
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    target?.focus({ preventScroll: true })
  }, [focus, tasks.length])
  const reset = () => { setEditId(''); setDraft(empty()); setError('') }
  const persist = async (next: PersonalTask[], message: string) => {
    setSaving(true); setError('')
    try { onTasksChanged(await savePersonalTasks(next)); onSuccess(message); return true }
    catch { setError('저장하지 못했습니다. 입력 내용을 유지했습니다. 다시 시도해 주세요.'); return false }
    finally { setSaving(false) }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) return
    if (draft.endTime && (!draft.time || draft.endTime <= draft.time)) { setError('종료 시간은 시작 시간보다 늦게 입력해 주세요.'); return }
    if (editId && !tasks.some(task => task.id === editId)) { setError('수정할 업무가 없어졌습니다. 취소 후 목록을 확인하세요.'); return }
    const now = new Date().toISOString()
    const changes = { title, date: draft.date, time: draft.time || undefined, endTime: draft.time && draft.endTime ? draft.endTime : undefined, priority: draft.priority, memo: draft.memo.trim(), updatedAt: now }
    const next = editId ? tasks.map(task => task.id === editId ? { ...task, ...changes } : task) : [...tasks, { ...changes, id: createPersonalTaskId(), completed: false, createdAt: now }]
    if (await persist(next, editId ? '개인 업무를 수정했습니다.' : '개인 업무를 등록했습니다.')) reset()
  }
  return <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
    <form ref={formRef} onSubmit={submit} className="card xl:sticky xl:top-4 space-y-3">
      <h2 className="font-bold text-slate-950">{editId ? '개인 업무 수정' : '개인 업무 등록'}</h2>
      <p className="text-[11px] text-emerald-800">현재 PC에만 저장되는 개인 업무입니다.</p>
      {error && <p role="alert" className="rounded bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
      <fieldset disabled={saving} className="space-y-3">
      <label className="field-label">업무 제목<input required maxLength={200} className="input-field" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="field-label">마감일<input required type="date" className="input-field" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2"><label className="field-label">시작 시간(선택)<input type="time" className="input-field" value={draft.time} onChange={event => setDraft({ ...draft, time: event.target.value, endTime: event.target.value ? draft.endTime : '' })} /></label><label className="field-label">종료 시간(선택)<input type="time" className="input-field" value={draft.endTime} min={draft.time || undefined} disabled={!draft.time} onChange={event => setDraft({ ...draft, endTime: event.target.value })} /></label></div>
      <p className="text-[10px] text-slate-600">시간을 비우면 종일, 시작만 입력하면 그 시각에 표시합니다.</p>
      <label className="field-label">우선순위<select className="input-field" value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as PersonalTaskPriority })}>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field-label">메모<textarea className="input-field min-h-24" value={draft.memo} onChange={event => setDraft({ ...draft, memo: event.target.value })} /></label>
      <div className="flex gap-2"><button disabled={saving} className="btn-primary flex flex-1 items-center justify-center gap-1">{editId ? <Save size={14} /> : <Plus size={14} />}{saving ? '저장 중…' : editId ? '수정 저장' : '개인 업무 등록'}</button>{editId && <button type="button" disabled={saving} onClick={reset} className="btn-ghost flex items-center gap-1"><X size={14} />취소</button>}</div>
      </fieldset>
    </form>
    <div ref={listRef} className="space-y-2">{[...tasks].sort((a,b) => Number(a.completed)-Number(b.completed) || a.date.localeCompare(b.date)).map(task => <article key={task.id} data-task-id={task.id} tabIndex={-1} className={`card flex items-start gap-3 p-4 ${focus?.id === task.id && focus.kind === 'personal' ? 'ring-2 ring-sky-500' : ''}`}>
      <button disabled={saving} aria-label={task.completed ? `${task.title} 미완료로 되돌리기` : `${task.title} 완료`} onClick={() => void persist(tasks.map(item => item.id === task.id ? { ...item, completed: !item.completed, updatedAt: new Date().toISOString() } : item), '업무 상태를 변경했습니다.')} className="mt-1 grid h-6 w-6 place-items-center rounded border border-slate-400">{task.completed && <Check size={14} />}</button>
      <div className="min-w-0 flex-1"><h3 className={`font-semibold text-slate-950 ${task.completed ? 'line-through opacity-60' : ''}`}>{task.title}</h3><p className={`mt-1 text-xs ${!task.completed && task.date < schoolDate() ? 'text-rose-700' : 'text-slate-600'}`}>{task.date}{task.time ? ` · ${task.time}${task.endTime ? `~${task.endTime}` : ''}` : ''} · {priorityLabel[task.priority]}</p>{task.memo && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{task.memo}</p>}</div>
      <button disabled={saving} aria-label={`${task.title} 수정`} className="btn-ghost p-2" onClick={() => { setEditId(task.id); setDraft({ title: task.title, date: task.date, time: task.time || '', endTime: task.endTime || '', priority: task.priority, memo: task.memo || '' }); setError(''); formRef.current?.scrollIntoView({ block: 'nearest' }) }}><Pencil size={14} /></button>
      <button disabled={saving} aria-label={`${task.title} 삭제`} className="btn-ghost p-2 text-rose-700" onClick={async () => { if (confirm('이 개인 업무를 삭제할까요?') && await persist(tasks.filter(item => item.id !== task.id), '개인 업무를 삭제했습니다.') && editId === task.id) reset() }}><Trash2 size={14} /></button>
    </article>)}{!tasks.length && <p className="card py-10 text-center text-sm text-slate-600">등록된 개인 업무가 없습니다.</p>}</div>
  </div>
}
