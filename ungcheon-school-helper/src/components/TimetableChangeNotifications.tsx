import { useCallback, useEffect, useState } from 'react'
import { BellRing, Check, Clock3, RefreshCw } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { listTimetableChanges, respondTimetableChange, timetableChangeSummary, type TimetableChangeRequest } from '../services/timetableChanges'

export default function TimetableChangeNotifications() {
  const teacherName = useAppStore(state => state.config.teacherName?.trim() ?? '')
  const [items, setItems] = useState<TimetableChangeRequest[]>([])
  const [approvalNotices, setApprovalNotices] = useState<TimetableChangeRequest[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!teacherName) { setItems([]); setApprovalNotices([]); return }
    try {
      const all = await listTimetableChanges(teacherName)
      setItems(all.filter(item => ['pending', 'held', 'rejected'].includes(item.status) && item.targetTeacherName === teacherName))
      const seen = readSeenApprovals(teacherName)
      setApprovalNotices(all.filter(item => item.status === 'approved' && item.requesterName === teacherName && Boolean(item.respondedAt) && !seen.has(item.id)))
    }
    catch { /* 다른 업무 화면은 계속 사용할 수 있도록 알림 조회 오류는 조용히 처리합니다. */ }
  }, [teacherName])

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => { const handler = () => void load(); window.addEventListener('timetableChanges:updated', handler); return () => window.removeEventListener('timetableChanges:updated', handler) }, [load])

  const respond = async (item: TimetableChangeRequest, decision: 'approved' | 'held') => {
    if (decision === 'approved' && !window.confirm(`이 요청을 승인하면 해당 교사와 학급의 날짜별 시간표에 반영됩니다.\nNEIS와는 별개인 업무 편의 기능입니다.\n\n${timetableChangeSummary(item)}\n\n계속하시겠습니까?`)) return
    setBusy(item.id)
    try {
      await respondTimetableChange(item.id, teacherName, decision)
      await load()
      window.dispatchEvent(new Event('timetableChanges:updated'))
    } catch (error) { window.alert(error instanceof Error ? error.message : String(error)) }
    finally { setBusy('') }
  }

  const acknowledgeApproval = (item: TimetableChangeRequest) => {
    const seen = readSeenApprovals(teacherName)
    seen.add(item.id)
    localStorage.setItem(approvalSeenKey(teacherName), JSON.stringify([...seen].slice(-100)))
    setApprovalNotices(current => current.filter(candidate => candidate.id !== item.id))
  }

  const notificationCount = items.length + approvalNotices.length

  return <div className="relative no-drag">
    <button onClick={() => setOpen(value => !value)} className="relative flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 hover:text-white" title="교환·대강 승인 알림"><BellRing size={12} />수업변경{notificationCount > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] text-white">{notificationCount}</span>}</button>
    {open && <div className="absolute right-0 top-8 z-50 w-[390px] rounded-2xl border border-white/10 bg-surface-900 p-3 shadow-2xl">
      <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-white">교환·대강 알림</p><p className="mt-0.5 text-[10px] text-slate-500">승인 요청과 내 요청의 승인 완료를 알려드립니다.</p></div><button onClick={() => void load()} className="p-2 text-slate-500 hover:text-white"><RefreshCw size={13} /></button></div>
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {approvalNotices.map(item => <article key={`approved-${item.id}`} className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3"><p className="text-xs font-bold text-emerald-200">승인 완료 · {item.targetTeacherName} 교사</p><p className="mt-1.5 text-[11px] leading-5 text-slate-300">{timetableChangeSummary(item)}</p><p className="mt-1 text-[10px] text-emerald-300">상대 교사와 해당 학급 시간표에도 반영되었습니다.</p><div className="mt-3 flex justify-end"><button onClick={() => acknowledgeApproval(item)} className="btn-secondary text-[10px]"><Check size={12} />확인</button></div></article>)}
        {items.map(item => <article key={item.id} className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-3"><p className="text-xs font-bold text-amber-200">{item.requesterName} 교사의 요청{['held', 'rejected'].includes(item.status) ? ' · 보류 중' : item.requesterAppliedAt ? ' · 요청자 우선 반영 중' : ''}</p><p className="mt-1.5 text-[11px] leading-5 text-slate-300">{timetableChangeSummary(item)}</p><div className="mt-3 flex justify-end gap-1.5">{item.status === 'pending' && <button disabled={busy === item.id} onClick={() => void respond(item, 'held')} className="btn-ghost text-[10px] text-amber-300"><Clock3 size={12} />보류</button>}<button disabled={busy === item.id} onClick={() => void respond(item, 'approved')} className="btn-primary text-[10px]"><Check size={12} />승인·전체 반영</button></div></article>)}
        {!items.length && !approvalNotices.length && <p className="py-8 text-center text-xs text-slate-500">새 수업변경 알림이 없습니다.</p>}
      </div>
    </div>}
  </div>
}

function approvalSeenKey(teacherName: string) {
  return `timetable-change-approval-seen:${teacherName}`
}

function readSeenApprovals(teacherName: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(approvalSeenKey(teacherName)) || '[]')
    return new Set<string>(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

