import { ArrowRight, CalendarClock, CheckCircle2, X } from 'lucide-react'
import clsx from 'clsx'
import {
  PERIODS_PER_DAY,
  TIMETABLE_DAYS,
  type TeacherTimetable,
} from '../../services/schoolTimetable'
import type { TeacherScheduleSimulation } from '../../services/timetablePlan'

export default function TeacherSchedulePreview({
  teacher,
  simulation,
  mode,
  onAdd,
  onClose,
}: {
  teacher: TeacherTimetable
  simulation: TeacherScheduleSimulation
  mode: 'exchange' | 'substitution'
  onAdd: () => void
  onClose: () => void
}) {
  const warnings = simulation.afterSummary.flatMap((after, index) => {
    const before = simulation.beforeSummary[index]
    if (after.maxConsecutive <= before.maxConsecutive || after.maxConsecutive < 2) return []
    return [`${after.day}요일 ${before.maxConsecutive || 1}연강 → ${after.maxConsecutive}연강`]
  })

  return (
    <section className="card p-5 border-violet-500/25">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-white flex items-center gap-2">
            <CalendarClock size={17} className="text-violet-400" />
            {teacher.label} 예상 시간표
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {mode === 'exchange' ? '교환 후 상대 교사의 수업 이동 결과입니다.' : '대강 수업을 추가한 결과입니다.'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost !p-2" aria-label="미리보기 닫기"><X size={15} /></button>
      </div>

      <div className="grid xl:grid-cols-[1fr_auto_1fr] gap-3 items-center mt-4">
        <ScheduleGrid title="변경 전" slots={simulation.before} changedSlots={[]} />
        <ArrowRight className="hidden xl:block text-slate-600" size={20} />
        <ScheduleGrid title="변경 후" slots={simulation.after} changedSlots={simulation.changedSlots} />
      </div>

      <div className={clsx(
        'mt-4 rounded-xl border px-4 py-3 text-sm',
        warnings.length
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
      )}>
        {warnings.length
          ? <><strong>연강 주의:</strong> {warnings.join(', ')}</>
          : '새롭게 늘어나는 연강이 없습니다.'}
      </div>

      <div className="flex justify-end mt-4">
        <button type="button" onClick={onAdd} className="btn-primary flex items-center gap-2">
          <CheckCircle2 size={15} /> 계획서에 추가
        </button>
      </div>
    </section>
  )
}

function ScheduleGrid({
  title,
  slots,
  changedSlots,
}: {
  title: string
  slots: TeacherTimetable['slots']
  changedSlots: number[]
}) {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-slate-300 bg-white/5">{title}</div>
      <div className="grid grid-cols-5">
        {TIMETABLE_DAYS.map((day, dayIndex) => (
          <div key={day} className="border-r border-white/5 last:border-r-0">
            <div className="py-1.5 text-center text-[10px] font-semibold text-slate-400 bg-white/[0.03]">{day}</div>
            {Array.from({ length: PERIODS_PER_DAY }, (_, periodOffset) => {
              const slotIndex = dayIndex * PERIODS_PER_DAY + periodOffset
              const slot = slots[slotIndex]
              const changed = changedSlots.includes(slotIndex)
              const lines = slot.value.split(/\r?\n/).filter(Boolean)
              return (
                <div
                  key={slotIndex}
                  className={clsx(
                    'min-h-14 px-1.5 py-1 border-t border-white/5 text-[9px]',
                    slot.value ? 'bg-sky-500/10 text-slate-300' : 'text-slate-700',
                    changed && 'bg-violet-500/25 ring-1 ring-inset ring-violet-400/50',
                  )}
                >
                  <span className="text-[8px] text-slate-600">{periodOffset + 1}</span>
                  <span className="block font-semibold break-words">{lines[0] || '공강'}</span>
                  {lines.slice(1).map((line, index) => <span key={index} className="block text-slate-500 break-words">{line}</span>)}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
