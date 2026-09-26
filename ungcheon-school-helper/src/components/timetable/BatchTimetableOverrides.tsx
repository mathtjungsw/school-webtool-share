import { useState } from 'react'
import { schoolDate } from '../../services/schoolDate'
import { getSchoolTimetable, getTimetableOverrides, saveTimetableOverride } from '../../services/schoolHub'
import { listTimetableChanges } from '../../services/timetableChanges'
import { buildCompositeTeacherDay, getAcademicDayRule } from '../../services/teacherTimetableCalendar'
import { PULLED_LESSONS_2026 } from '../../data/pulledLessons2026'
import { overrideBatchConflicts } from '../../services/timetableOverrideBatch'
import type { DailyTimetableOverride, TimetableOverrideAction } from '../../services/timetableOverrides'

const newRows = () => Array.from({ length: 7 }, (_, index) => ({ id: crypto.randomUUID(), checked: false, period: index + 1, action: 'copy' as TimetableOverrideAction, sourcePeriod: Math.min(index + 2, 7) }))
type Preview = { rules: DailyTimetableOverride[]; signature: string; conflicts: number; rows: Array<{ date: string; teacher: string; period: number; before: string; after: string }> }
export default function BatchTimetableOverrides({ adminPassword, updatedBy, onChanged }: { adminPassword: string; updatedBy: string; onChanged: () => Promise<void> }) {
  const [date, setDate] = useState(schoolDate)
  const [sourceDate, setSourceDate] = useState(schoolDate)
  const [grade, setGrade] = useState('')
  const [className, setClassName] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState(newRows)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [approved, setApproved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const invalidate = () => { setPreview(null); setApproved(false); setMessage('') }
  const snapshot = async () => {
    const [timetable, existing, changes] = await Promise.all([
      getSchoolTimetable(true), getTimetableOverrides(true, true),
      listTimetableChanges(updatedBy, [date, sourceDate].sort()[0], [date, sourceDate].sort()[1], true, true),
    ])
    if (!timetable) throw new Error('교사 시간표가 등록되어 있지 않습니다.')
    return { timetable, existing, changes, signature: JSON.stringify([timetable, existing, changes]) }
  }
  const prepare = async () => {
    setBusy(true); setMessage(''); setPreview(null); setApproved(false)
    try {
      if (!date || !sourceDate || !rows.some(row => row.checked)) throw new Error('날짜와 적용할 교시를 선택하세요.')
      if (className && (!grade || !Number.isInteger(Number(className)) || Number(className) < 1 || Number(className) > 20)) throw new Error('대상 학년·학급을 확인하세요.')
      const day = getAcademicDayRule(date)
      if (day.kind !== 'instruction') throw new Error(`${day.label || '주말'}에는 수업 미리보기를 확정할 수 없습니다. 적용 날짜를 확인하세요.`)
      const snap = await snapshot()
      const rules: DailyTimetableOverride[] = rows.filter(row => row.checked).map(row => ({
        id: row.id, date, targetGrade: grade, targetClass: className, targetPeriod: row.period,
        action: row.action, sourceDate: row.action === 'clear' ? '' : sourceDate, sourcePeriod: row.action === 'clear' ? 0 : row.sourcePeriod,
        note, active: true, createdBy: updatedBy, createdAt: '', updatedAt: new Date().toISOString(),
      }))
      const dates = [...new Set([date, ...rules.filter(rule => rule.action === 'move_pulled').map(rule => rule.sourceDate)])]
      const changes = dates.flatMap(previewDate => snap.timetable.teachers.flatMap(teacher => {
        const before = buildCompositeTeacherDay(snap.timetable, teacher.name, previewDate, snap.changes, PULLED_LESSONS_2026, snap.existing)
        const after = buildCompositeTeacherDay(snap.timetable, teacher.name, previewDate, snap.changes, PULLED_LESSONS_2026, [...snap.existing.filter(item => !rules.some(rule => rule.id === item.id)), ...rules])
        return Array.from({ length: 7 }, (_, index) => ({ date: previewDate, teacher: teacher.name, period: index + 1, before: before.lessons[index]?.value || '공강', after: after.lessons[index]?.value || '공강' })).filter(row => row.before !== row.after)
      }))
      setPreview({ rules, signature: snap.signature, conflicts: overrideBatchConflicts(rules, snap.existing).length, rows: changes })
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!preview || !approved || busy) return
    setBusy(true); setMessage('')
    let saved = 0
    try {
      if ((await snapshot()).signature !== preview.signature) throw new Error('미리보기 이후 공유 자료가 바뀌었습니다. 다시 미리보기해 주세요.')
      for (const rule of preview.rules) {
        await saveTimetableOverride(rule, adminPassword, updatedBy)
        saved++
        setRows(current => current.map(row => row.id === rule.id ? { ...row, checked: false, id: crypto.randomUUID() } : row))
      }
      setMessage(`${saved}개 교시 예외를 저장했습니다.`)
      try { await onChanged() } catch { setMessage(`${saved}건 저장 완료. 목록 갱신은 실패했습니다. 새로고침해 주세요.`) }
    } catch (error) {
      setMessage(`${saved}건 저장됨 · ${error instanceof Error ? error.message : String(error)} 남은 선택 항목만 다시 미리보기 후 저장하세요.`)
      if (saved) await onChanged().catch(() => undefined)
    } finally { setPreview(null); setApproved(false); setBusy(false) }
  }
  return <details className="card mb-4 p-4">
    <summary className="cursor-pointer font-bold text-slate-950">여러 교시 한꺼번에 변경 · 변경 전후 미리보기</summary>
    <fieldset disabled={busy} className="mt-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="field-label">적용 날짜<input type="date" className="input-field" value={date} onChange={event => { setDate(event.target.value); invalidate() }} /></label>
        <label className="field-label">가져올 날짜<input type="date" className="input-field" value={sourceDate} onChange={event => { setSourceDate(event.target.value); invalidate() }} /></label>
        <label className="field-label">학년<select className="input-field" value={grade} onChange={event => { setGrade(event.target.value); setClassName(''); invalidate() }}><option value="">전체</option>{[1,2,3].map(value => <option key={value} value={value}>{value}학년</option>)}</select></label>
        <label className="field-label">반(빈칸=전체)<input type="number" min="1" max="20" disabled={!grade} className="input-field" value={className} onChange={event => { setClassName(event.target.value); invalidate() }} /></label>
      </div>
      <p className="text-xs text-slate-600">가져오기는 지정일의 기본 요일 시간표를 사용합니다. 예정된 당김수업은 ‘당김 이동’을 선택하세요. 교체·대강과 합쳐진 최종 결과는 아래 미리보기로 확인합니다.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>적용</th><th>교시</th><th>처리</th><th>가져올 교시</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className="border-t border-slate-200">
        <td><input aria-label={`${row.period}교시 적용`} type="checkbox" checked={row.checked} onChange={event => { setRows(current => current.map((item, i) => i === index ? { ...item, checked: event.target.checked } : item)); invalidate() }} /></td><td>{row.period}교시</td>
        <td><select aria-label={`${row.period}교시 처리 방식`} className="input-field my-1" value={row.action} onChange={event => { setRows(current => current.map((item, i) => i === index ? { ...item, action: event.target.value as TimetableOverrideAction } : item)); invalidate() }}><option value="copy">가져오기</option><option value="clear">비우기</option><option value="move_pulled">당김 이동</option></select></td>
        <td><select aria-label={`${row.period}교시 원본 교시`} disabled={row.action === 'clear'} className="input-field" value={row.sourcePeriod} onChange={event => { setRows(current => current.map((item, i) => i === index ? { ...item, sourcePeriod: Number(event.target.value) } : item)); invalidate() }}>{[1,2,3,4,5,6,7].map(value => <option key={value} value={value}>{value}교시</option>)}</select></td>
      </tr>)}</tbody></table></div>
      <label className="field-label">공통 안내<input maxLength={200} className="input-field" value={note} onChange={event => { setNote(event.target.value); invalidate() }} /></label>
      <button className="btn-primary" onClick={() => void prepare()}>{busy ? '확인 중…' : '변경 전후 미리보기'}</button>
      {preview && <section className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
        <h3 className="font-bold text-slate-950">{preview.rules.length}개 교시 예외 · 실제 변경 수업 {preview.rows.length}건</h3>
        {preview.conflicts > 0 && <p className="font-bold text-amber-900">적용일·당김 원본일의 범위가 겹치는 항목 {preview.conflicts}건: 전 학년·학년·학급 적용 우선순위를 확인하세요.</p>}
        <div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-sky-50"><tr><th>날짜</th><th>교사</th><th>교시</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>{preview.rows.map(row => <tr key={`${row.date}-${row.teacher}-${row.period}`} className="border-t border-sky-200"><td className="p-2">{row.date}</td><td className="p-2">{row.teacher}</td><td>{row.period}</td><td className="whitespace-pre-line p-2">{row.before}</td><td className="whitespace-pre-line p-2 font-bold">{row.after}</td></tr>)}</tbody></table></div>
        {!preview.rows.length && <p className="text-xs text-amber-900">현재 교사 시간표에서 달라지는 수업이 없습니다. 날짜·대상·원본 교시를 확인하세요.</p>}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} />미리보기와 겹치는 범위를 확인했습니다. 교시별로 순서대로 저장하며, 중간 실패 시 완료된 항목은 유지됩니다.</label>
        <button className="btn-primary" disabled={!approved || busy} onClick={() => void save()}>확인한 예외 저장</button>
      </section>}
      {message && <p role="status" className="rounded bg-amber-50 p-3 text-xs text-amber-950">{message}</p>}
    </fieldset>
  </details>
}
