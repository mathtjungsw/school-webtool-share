import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, Pencil, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react'
import { deactivateTimetableOverride, getTimetableOverrides, saveTimetableOverride } from '../../services/schoolHub'
import type { DailyTimetableOverride, TimetableOverrideAction } from '../../services/timetableOverrides'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = (): DailyTimetableOverride => ({
  id: '', date: today(), targetGrade: '', targetClass: '', targetPeriod: 1,
  action: 'copy', sourceDate: today(), sourcePeriod: 1, note: '', active: true,
  createdBy: '', createdAt: '', updatedAt: '',
})

export default function TimetableOverrideManager({ adminPassword, updatedBy, onChanged }: { adminPassword: string; updatedBy: string; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<DailyTimetableOverride[]>([])
  const [form, setForm] = useState<DailyTimetableOverride>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const load = async (force = false) => { setLoading(true); try { setItems(await getTimetableOverrides(true, force)) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const collision = useMemo(() => items.find(item => item.active && item.id !== form.id && item.date === form.date && item.targetGrade === form.targetGrade && item.targetClass === form.targetClass && item.targetPeriod === form.targetPeriod), [form, items])
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage('')
    if (collision && !window.confirm('같은 날짜·대상·교시에 이미 예외가 있습니다. 그래도 저장할까요?')) return
    try {
      await saveTimetableOverride(form, adminPassword, updatedBy)
      setForm(emptyForm()); setMessage('일일 시간표 예외를 저장했습니다.'); await load(true); await onChanged()
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const deactivate = async (item: DailyTimetableOverride) => {
    if (!window.confirm(`${item.date} ${item.targetPeriod}교시 예외를 비활성화할까요?`)) return
    try { await deactivateTimetableOverride(item.id, adminPassword, updatedBy); await load(true); await onChanged() }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const restore = async (item: DailyTimetableOverride) => {
    try { await saveTimetableOverride({ ...item, active: true }, adminPassword, updatedBy); await load(true); await onChanged() }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const scope = (item: DailyTimetableOverride) => item.targetClass ? `${item.targetGrade}-${Number(item.targetClass)}` : item.targetGrade ? `${item.targetGrade}학년` : '전 학년'
  const actionLabel = (item: DailyTimetableOverride) => item.action === 'clear' ? '수업 비우기' : item.action === 'move_pulled' ? `당김수업 이동 · ${item.sourceDate} ${item.sourcePeriod}교시` : `${item.sourceDate} ${item.sourcePeriod}교시 가져오기`
  return <div className="grid items-start gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
    <form onSubmit={submit} className="card space-y-3">
      <div><h2 className="flex items-center gap-2 text-base font-black text-slate-950"><CalendarRange size={18} className="text-violet-600" />일일 시간표 예외</h2><p className="mt-1 text-[11px] font-semibold text-slate-600">저장하면 공유 구글시트와 데스크톱·모바일 시간표에 함께 반영됩니다.</p></div>
      <label className="field-label">적용 날짜<input required type="date" className="input-field mt-1" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label>
      <div className="grid grid-cols-3 gap-2"><label className="field-label">학년<select className="input-field mt-1" value={form.targetGrade} onChange={event => setForm({ ...form, targetGrade: event.target.value, targetClass: event.target.value ? form.targetClass : '' })}><option value="">전체</option><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select></label><label className="field-label">학급<input type="number" min="1" max="20" disabled={!form.targetGrade} className="input-field mt-1" value={form.targetClass} onChange={event => setForm({ ...form, targetClass: event.target.value })} placeholder="전체" /></label><label className="field-label">적용 교시<select className="input-field mt-1" value={form.targetPeriod} onChange={event => setForm({ ...form, targetPeriod: Number(event.target.value) })}>{[1,2,3,4,5,6,7].map(period => <option key={period} value={period}>{period}교시</option>)}</select></label></div>
      <label className="field-label">처리 방식<select className="input-field mt-1" value={form.action} onChange={event => setForm({ ...form, action: event.target.value as TimetableOverrideAction })}><option value="copy">다른 수업 가져오기</option><option value="clear">수업 비우기</option><option value="move_pulled">예정된 당김수업 이동</option></select></label>
      {form.action !== 'clear' && <div className="grid grid-cols-2 gap-2"><label className="field-label">가져올 날짜<input required type="date" className="input-field mt-1" value={form.sourceDate} onChange={event => setForm({ ...form, sourceDate: event.target.value })} /></label><label className="field-label">가져올 교시<select className="input-field mt-1" value={form.sourcePeriod} onChange={event => setForm({ ...form, sourcePeriod: Number(event.target.value) })}>{[1,2,3,4,5,6,7].map(period => <option key={period} value={period}>{period}교시</option>)}</select></label></div>}
      <label className="field-label">안내 문구<input className="input-field mt-1" maxLength={200} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="예: 기존 2교시 수업을 1교시에 운영" /></label>
      {collision && <p className="flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800"><AlertTriangle size={13} />같은 범위에 활성 예외가 있습니다.</p>}
      {message && <p className="rounded-lg bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-900">{message}</p>}
      <div className="flex gap-2"><button className="btn-primary flex flex-1 items-center justify-center gap-1"><Save size={14} />{form.id ? '수정 저장' : '예외 저장'}</button>{form.id && <button type="button" className="btn-ghost" onClick={() => setForm(emptyForm())}><Plus size={14} />새 입력</button>}</div>
    </form>
    <section className="card min-w-0">
      <div className="mb-3 flex items-center justify-between"><div><h2 className="font-black text-slate-950">등록된 예외 {items.length}건</h2><p className="mt-1 text-[10px] text-slate-500">비활성 항목도 보존되며 다시 복원할 수 있습니다.</p></div><button onClick={() => void load(true)} disabled={loading} className="btn-ghost flex items-center gap-1"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />새로고침</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead><tr className="border-b border-slate-200 text-left text-slate-600"><th className="p-2">날짜</th><th className="p-2">대상</th><th className="p-2">교시</th><th className="p-2">처리</th><th className="p-2">안내</th><th className="p-2">상태</th><th className="p-2"></th></tr></thead><tbody>{items.map(item => <tr key={item.id} className={`border-b border-slate-100 ${item.active ? 'text-slate-800' : 'bg-slate-50 text-slate-400'}`}><td className="p-2 font-bold">{item.date}</td><td className="p-2">{scope(item)}</td><td className="p-2">{item.targetPeriod}교시</td><td className="p-2">{actionLabel(item)}</td><td className="max-w-64 truncate p-2" title={item.note}>{item.note || '-'}</td><td className="p-2">{item.active ? '사용' : '비활성'}</td><td className="p-2"><div className="flex justify-end gap-1"><button className="btn-ghost p-2" title="수정" onClick={() => setForm(item)}><Pencil size={13} /></button>{item.active ? <button className="btn-ghost p-2 text-rose-600" title="비활성화" onClick={() => void deactivate(item)}><Trash2 size={13} /></button> : <button className="btn-ghost p-2 text-emerald-700" title="복원" onClick={() => void restore(item)}><RotateCcw size={13} /></button>}</div></td></tr>)}{!items.length && <tr><td colSpan={7} className="p-10 text-center text-slate-500">등록된 예외가 없습니다.</td></tr>}</tbody></table></div>
    </section>
  </div>
}
