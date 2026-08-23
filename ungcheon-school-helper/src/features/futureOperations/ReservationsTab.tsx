import { useMemo, useState } from 'react'
import { CalendarPlus, Trash2 } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { localId, makeRecurringDates, reservationConflicts, todayText } from './model'
import type { FacilityReservation, RecurrenceKind, ResourceKind } from './types'
import { EmptyState, Field, SectionHeader, type FutureTabProps } from './ui'

const initialForm = { resourceKind: 'room' as ResourceKind, resourceName: '', title: '', date: todayText(), startTime: '09:00', endTime: '10:00', recurrence: 'once' as RecurrenceKind, count: 1 }

export default function ReservationsTab({ state, saving, update }: FutureTabProps) {
  const viewerName = useAuthStore(value => value.teacherName)
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const reservations = useMemo(() => [...state.reservations].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)), [state.reservations])

  const submit = async () => {
    setError('')
    if (!form.resourceName.trim() || !form.title.trim()) return setError('시설·기자재 이름과 사용 목적을 입력해 주세요.')
    if (form.startTime >= form.endTime) return setError('종료 시간은 시작 시간보다 늦어야 합니다.')
    const dates = makeRecurringDates(form.date, form.recurrence, form.count)
    const conflictMessages: string[] = []
    dates.forEach(date => {
      const conflicts = reservationConflicts({ resourceName: form.resourceName, date, startTime: form.startTime, endTime: form.endTime }, state.reservations)
      conflicts.forEach(item => conflictMessages.push(`${date} ${item.startTime}~${item.endTime} ${item.reserverName}`))
    })
    if (conflictMessages.length) return setError(`이미 예약된 시간입니다: ${conflictMessages.slice(0, 3).join(', ')}`)
    const groupId = localId('recurrence')
    const createdAt = new Date().toISOString()
    const created = dates.map<FacilityReservation>(date => ({
      id: localId('reservation'), resourceKind: form.resourceKind, resourceName: form.resourceName.trim(), title: form.title.trim(),
      reserverName: viewerName || '현재 사용자', date, startTime: form.startTime, endTime: form.endTime,
      recurrenceGroupId: form.recurrence === 'once' ? '' : groupId, createdAt,
    }))
    await update(current => ({ ...current, reservations: [...current.reservations, ...created] }))
    setForm(current => ({ ...initialForm, resourceKind: current.resourceKind, resourceName: current.resourceName }))
  }

  return <div className="grid xl:grid-cols-[420px_1fr] gap-4 items-start">
    <section className="card">
      <SectionHeader title="시설·기자재 예약" description="같은 자원의 시간이 겹치면 저장을 막습니다. 모든 예약은 이 PC에만 저장됩니다." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="자원 종류"><select className="input-field" value={form.resourceKind} onChange={e => setForm({ ...form, resourceKind: e.target.value as ResourceKind })}><option value="room">교실·공간</option><option value="device">기자재</option><option value="vehicle">차량</option><option value="other">기타</option></select></Field>
        <Field label="시설·기자재 이름"><input className="input-field" value={form.resourceName} onChange={e => setForm({ ...form, resourceName: e.target.value })} placeholder="예: 시청각실" /></Field>
        <Field label="사용 목적" className="col-span-2"><input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="예: 교과협의회" /></Field>
        <Field label="날짜"><input type="date" className="input-field" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="시작"><input type="time" className="input-field" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></Field><Field label="종료"><input type="time" className="input-field" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} /></Field></div>
        <Field label="반복"><select className="input-field" value={form.recurrence} onChange={e => setForm({ ...form, recurrence: e.target.value as RecurrenceKind })}><option value="once">반복 없음</option><option value="daily">매일</option><option value="weekly">매주</option></select></Field>
        <Field label="반복 횟수"><input type="number" min={1} max={20} disabled={form.recurrence === 'once'} className="input-field" value={form.count} onChange={e => setForm({ ...form, count: Number(e.target.value) })} /></Field>
      </div>
      {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
      <button className="btn-primary mt-4 w-full flex items-center justify-center gap-2" onClick={submit} disabled={saving}><CalendarPlus size={15} />충돌 확인 후 예약</button>
    </section>
    <section className="card">
      <SectionHeader title="예약 현황" description={`저장된 예약 ${reservations.length}건`} />
      {reservations.length === 0 ? <EmptyState>등록된 예약이 없습니다.</EmptyState> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-black/10 dark:border-white/10 text-left text-xs text-slate-600 dark:text-slate-400"><th className="p-2">날짜·시간</th><th className="p-2">자원</th><th className="p-2">목적</th><th className="p-2">예약자</th><th className="p-2 w-10"></th></tr></thead><tbody>{reservations.map(item => <tr key={item.id} className="border-b border-black/5 dark:border-white/5"><td className="p-2 text-slate-700 dark:text-slate-300">{item.date}<br /><span className="text-xs text-slate-600 dark:text-slate-400">{item.startTime}~{item.endTime}</span></td><td className="p-2 font-semibold text-slate-950 dark:text-white">{item.resourceName}</td><td className="p-2 text-slate-700 dark:text-slate-300">{item.title}</td><td className="p-2 text-slate-600 dark:text-slate-400">{item.reserverName}</td><td className="p-2"><button className="btn-ghost text-rose-300" title="삭제" onClick={() => update(current => ({ ...current, reservations: current.reservations.filter(saved => saved.id !== item.id) }))}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>}
    </section>
  </div>
}

