import { useCallback, useEffect, useState } from 'react'
import { BellRing, Check, RefreshCw, X } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { listTimetableChanges, respondTimetableChange, timetableChangeSummary, type TimetableChangeRequest } from '../services/timetableChanges'

export default function TimetableChangeNotifications() {
  const teacherName = useAppStore(state => state.config.teacherName?.trim() ?? '')
  const [items, setItems] = useState<TimetableChangeRequest[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!teacherName) return setItems([])
    try { setItems((await listTimetableChanges(teacherName)).filter(item => item.status === 'pending' && item.targetTeacherName === teacherName)) }
    catch { /* 다른 업무 화면은 계속 사용할 수 있도록 알림 조회 오류는 조용히 처리합니다. */ }
  }, [teacherName])

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => { const handler = () => void load(); window.addEventListener('timetableChanges:updated', handler); return () => window.removeEventListener('timetableChanges:updated', handler) }, [load])

  const respond = async (item: TimetableChangeRequest, decision: 'approved' | 'rejected') => {
    if (decision === 'approved' && !window.confirm(`이 요청을 승인하면 해당 교사와 학급의 날짜별 시간표에 반영됩니다.\nNEIS와는 별개인 업무 편의 기능입니다.\n\n${timetableChangeSummary(item)}\n\n계속하시겠습니까?`)) return
    setBusy(item.id)
    try {
      await respondTimetableChange(item.id, teacherName, decision)
      await load()
      window.dispatchEvent(new Event('timetableChanges:updated'))
    } catch (error) { window.alert(error instanceof Error ? error.message : String(error)) }
    finally { setBusy('') }
  }

  return <div className="relative no-drag">
    <button onClick={() => setOpen(value => !value)} className="relative flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 hover:text-white" title="교환·대강 승인 알림"><BellRing size={12} />수업변경{items.length > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] text-white">{items.length}</span>}</button>
    {open && <div className="absolute right-0 top-8 z-50 w-[390px] rounded-2xl border border-white/10 bg-surface-900 p-3 shadow-2xl">
      <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-white">교환·대강 승인 요청</p><p className="mt-0.5 text-[10px] text-slate-500">승인 후 해당 날짜에만 반영됩니다.</p></div><button onClick={() => void load()} className="p-2 text-slate-500 hover:text-white"><RefreshCw size={13} /></button></div>
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{items.map(item => <article key={item.id} className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-3"><p className="text-xs font-bold text-amber-200">{item.requesterName} 교사의 요청</p><p className="mt-1.5 text-[11px] leading-5 text-slate-300">{timetableChangeSummary(item)}</p><div className="mt-3 flex justify-end gap-1.5"><button disabled={busy === item.id} onClick={() => void respond(item, 'rejected')} className="btn-ghost text-[10px] text-rose-300"><X size={12} />거절</button><button disabled={busy === item.id} onClick={() => void respond(item, 'approved')} className="btn-primary text-[10px]"><Check size={12} />승인·반영</button></div></article>)}{!items.length && <p className="py-8 text-center text-xs text-slate-500">새 승인 요청이 없습니다.</p>}</div>
    </div>}
  </div>
}

