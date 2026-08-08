import type { PersonalTimetableSlot } from './studentTimetable'
import type { TimetableChangeRequest } from './timetableChanges'

export interface EffectiveLessonOverride {
  date: string
  slotIndex: number
  className: string
  subject: string
  teacher: string
  changeId: string
  kind: TimetableChangeRequest['kind']
}

export function approvedLessonOverrides(changes: TimetableChangeRequest[]): EffectiveLessonOverride[] {
  return changes.filter(item => item.status === 'approved').flatMap(item => {
    const first: EffectiveLessonOverride = {
      date: item.originalDate, slotIndex: item.originalSlotIndex, className: item.originalClass,
      subject: item.originalSubject, teacher: item.replacementTeacher, changeId: item.id, kind: item.kind,
    }
    if (item.kind !== 'exchange') return [first]
    return [first, {
      date: item.replacementDate, slotIndex: item.replacementSlotIndex, className: item.replacementClass,
      subject: item.replacementSubject, teacher: item.originalTeacher, changeId: item.id, kind: item.kind,
    }]
  })
}

export function normalizeClassCode(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 3) return digits
  const dashed = value.match(/^([1-3])-(\d{1,2})/)
  return dashed ? `${dashed[1]}${String(Number(dashed[2])).padStart(2, '0')}` : digits
}

export function applyStudentLessonOverride(
  slot: PersonalTimetableSlot | undefined,
  classLabel: string,
  date: string,
  slotIndex: number,
  changes: TimetableChangeRequest[],
) {
  const classCode = normalizeClassCode(classLabel)
  const override = approvedLessonOverrides(changes).find(item =>
    item.date === date && item.slotIndex === slotIndex && normalizeClassCode(item.className) === classCode,
  )
  return override ? { ...slot, subject: override.subject || slot?.subject || '', teacher: override.teacher, effectiveChange: true } : slot
}

