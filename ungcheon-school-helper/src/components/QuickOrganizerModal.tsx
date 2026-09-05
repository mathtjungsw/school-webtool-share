import { useEffect, useState } from 'react'
import { CalendarPlus, ListTodo, Save, ShieldCheck, X } from 'lucide-react'
import clsx from 'clsx'
import {
  createPersonalTaskId, loadPersonalTasks, savePersonalTasks,
  type PersonalTaskPriority,
} from '../services/personalOrganizer'

export function QuickOrganizerModal({ date, onClose, onSaved }: {
  date: string | null
  onClose: () => void
  onSaved?: () => void
}) {
  const [mode, setMode] = useState<'schedule' | 'task'>('schedule')
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState(date ?? '')
  const [time, setTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [category, setCategory] = useState('개인 일정')
  const [priority, setPriority] = useState<PersonalTaskPriority>('normal')
  const [memo, setMemo] = useState('')
  const [showOnCalendar, setShowOnCalendar] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!date) return
    setTargetDate(date); setTitle(''); setTime(''); setEndTime(''); setMemo(''); setMode('schedule'); setShowOnCalendar(true); setError('')
  }, [date])
  if (!date) return null

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !targetDate) return
    if (endTime && (!time || endTime <= time)) { setError('종료 시간은 시작 시간보다 늦게 입력해 주세요.'); return }
    setError('')
    setSaving(true)
    try {
      const tasks = await loadPersonalTasks()
      const now = new Date().toISOString()
      await savePersonalTasks([...tasks, {
        id: createPersonalTaskId(), title: title.trim(), date: targetDate,
        time: time || undefined, endTime: time && endTime ? endTime : undefined, priority, completed: false, memo: memo.trim(),
        kind: mode, category: mode === 'schedule' ? category : '개인 업무',
        showOnCalendar: mode === 'schedule' ? true : showOnCalendar,
        scope: 'personal', createdAt: now, updatedAt: now,
      }])
      onSaved?.(); onClose()
    } finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/65 p-4" onMouseDown={event => { if (event.currentTarget === event.target) onClose() }}>
    <form onSubmit={save} className="card w-full max-w-lg border-violet-400/25 p-5 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-base font-black text-white">빠른 등록</h2><p className="mt-1 flex items-center gap-1 text-[10px] text-emerald-300"><ShieldCheck size={11} />이 PC에만 저장되며 즉시 달력에 반영됩니다.</p></div><button type="button" onClick={onClose} className="btn-ghost p-2"><X size={15} /></button></div>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
        <button type="button" onClick={() => setMode('schedule')} className={clsx('flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold', mode === 'schedule' ? 'bg-violet-500 text-white' : 'text-slate-400')}><CalendarPlus size={14} />일정으로 등록</button>
        <button type="button" onClick={() => setMode('task')} className={clsx('flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold', mode === 'task' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400')}><ListTodo size={14} />업무로 등록</button>
      </div>
      <div className="space-y-3">
        <label className="block"><span className="mb-1 block text-[10px] font-bold text-slate-400">{mode === 'schedule' ? '일정 제목' : '업무 제목'}</span><input autoFocus required value={title} onChange={event => setTitle(event.target.value)} placeholder={mode === 'schedule' ? '일정 내용을 입력하세요' : '해야 할 일을 입력하세요'} /></label>
        <div className="grid grid-cols-3 gap-2"><label><span className="mb-1 block text-[10px] font-bold text-slate-400">{mode === 'schedule' ? '날짜' : '마감일'}</span><input type="date" required value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label><label><span className="mb-1 block text-[10px] font-bold text-slate-400">시작 시간</span><input type="time" value={time} onChange={event => { setTime(event.target.value); if (!event.target.value) setEndTime('') }} /></label><label><span className="mb-1 block text-[10px] font-bold text-slate-400">종료 시간(선택)</span><input type="time" value={endTime} min={time || undefined} disabled={!time} onChange={event => setEndTime(event.target.value)} /></label></div>
        {mode === 'schedule' ? <label className="block"><span className="mb-1 block text-[10px] font-bold text-slate-400">구분</span><select value={category} onChange={event => setCategory(event.target.value)}><option>개인 일정</option><option>상담</option><option>회의</option><option>연수</option><option>기타</option></select></label> : <><label className="block"><span className="mb-1 block text-[10px] font-bold text-slate-400">중요도</span><select value={priority} onChange={event => setPriority(event.target.value as PersonalTaskPriority)}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select></label><label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300"><input type="checkbox" checked={showOnCalendar} onChange={event => setShowOnCalendar(event.target.checked)} />대시보드·캘린더에도 표시</label></>}
        <label className="block"><span className="mb-1 block text-[10px] font-bold text-slate-400">메모</span><textarea rows={3} value={memo} onChange={event => setMemo(event.target.value)} placeholder="선택 사항" /></label>
      </div>
      {error && <p className="mt-3 text-xs font-semibold text-rose-500" role="alert">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">취소</button><button disabled={saving} className="btn-primary"><Save size={14} />{saving ? '저장 중...' : '저장'}</button></div>
    </form>
  </div>
}
