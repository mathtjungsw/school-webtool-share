import type { PulledLesson } from '../data/pulledLessons2026'
import { getTimetableDayIndex } from './specialTimetableDays'
import type { TeacherTimetable } from './schoolTimetable'

export type TimetableOverrideAction = 'copy' | 'clear' | 'move_pulled'

export interface DailyTimetableOverride {
  id: string
  date: string
  targetGrade: string
  targetClass: string
  targetPeriod: number
  action: TimetableOverrideAction
  sourceDate: string
  sourcePeriod: number
  note: string
  active: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

const compact = (value: unknown) => String(value ?? '').replace(/\s+/g, '').trim()

function classCode(value: string) {
  const first = value.split(/\r?\n/).map(compact).find(Boolean) ?? ''
  const match = first.match(/^([1-3])[-_]?0?(\d{1,2})(?:$|[·._-])/) ?? first.match(/(?:^|\D)([1-3])[-_]?0?(\d{1,2})(?:\D|$)/)
  return match ? `${match[1]}-${Number(match[2])}` : ''
}

function matchesScope(value: string, rule: DailyTimetableOverride) {
  const code = classCode(value)
  if (rule.targetClass) return code === `${rule.targetGrade}-${Number(rule.targetClass)}`
  if (rule.targetGrade) return code.startsWith(`${rule.targetGrade}-`)
  return true
}

export function activeTimetableOverrides(items: DailyTimetableOverride[], date?: string) {
  return items.filter(item => item.active && (!date || item.date === date))
}

export function applyDailyTimetableOverridesToTeacher(
  teacher: TeacherTimetable,
  date: string,
  baseLessons: string[],
  overrides: DailyTimetableOverride[],
) {
  const lessons = [...baseLessons]
  const rules = activeTimetableOverrides(overrides, date)
    .filter(item => item.action !== 'move_pulled' && item.targetPeriod >= 1 && item.targetPeriod <= 7)
    .sort((a, b) => Number(Boolean(a.targetClass)) - Number(Boolean(b.targetClass)) || Number(Boolean(a.targetGrade)) - Number(Boolean(b.targetGrade)) || a.updatedAt.localeCompare(b.updatedAt))
  rules.forEach(rule => {
    const targetIndex = rule.targetPeriod - 1
    const targetValue = lessons[targetIndex] ?? ''
    if (rule.action === 'clear') {
      if ((!rule.targetGrade && !rule.targetClass) || matchesScope(targetValue, rule)) lessons[targetIndex] = ''
      return
    }
    const sourceDayIndex = getTimetableDayIndex(rule.sourceDate)
    const sourceValue = sourceDayIndex >= 0 && rule.sourcePeriod >= 1 && rule.sourcePeriod <= 7
      ? teacher.slots[sourceDayIndex * 7 + rule.sourcePeriod - 1]?.value ?? ''
      : ''
    if ((!rule.targetGrade && !rule.targetClass) || matchesScope(sourceValue, rule) || matchesScope(targetValue, rule)) {
      lessons[targetIndex] = sourceValue
    }
  })
  return lessons
}

export function effectivePulledLessons(
  pulledLessons: PulledLesson[],
  overrides: DailyTimetableOverride[],
) {
  return pulledLessons.map(item => {
    const rule = activeTimetableOverrides(overrides)
      .filter(candidate => candidate.action === 'move_pulled' && candidate.sourceDate === item.date && candidate.sourcePeriod === item.period)
      .find(candidate => {
        const code = classCode(item.classLabel)
        if (candidate.targetClass) return code === `${candidate.targetGrade}-${Number(candidate.targetClass)}`
        return !candidate.targetGrade || code.startsWith(`${candidate.targetGrade}-`)
      })
    return rule ? { ...item, date: rule.date, period: rule.targetPeriod } : item
  })
}

export function findStudentTimetableOverride(
  overrides: DailyTimetableOverride[],
  date: string,
  grade: string,
  className: string,
  period: number,
) {
  return activeTimetableOverrides(overrides, date)
    .filter(item => item.targetPeriod === period && item.action !== 'move_pulled')
    .filter(item => !item.targetGrade || Number(item.targetGrade) === Number(grade))
    .filter(item => !item.targetClass || Number(item.targetClass) === Number(className))
    .sort((a, b) => Number(Boolean(b.targetClass)) - Number(Boolean(a.targetClass)) || Number(Boolean(b.targetGrade)) - Number(Boolean(a.targetGrade)) || b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}
