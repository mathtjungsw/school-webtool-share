import type { PulledLesson } from './shared/pulledLessons2026'
import type { DailyTimetableOverride, TeacherTimetable } from './types'

const compact = (value: unknown) => String(value ?? '').replace(/\s+/g, '').trim()
function classCode(value: string) {
  const first = value.split(/\r?\n/).map(compact).find(Boolean) ?? ''
  const match = first.match(/^([1-3])[-_]?0?(\d{1,2})(?:$|[·._-])/) ?? first.match(/(?:^|\D)([1-3])[-_]?0?(\d{1,2})(?:\D|$)/)
  return match ? `${match[1]}-${Number(match[2])}` : ''
}
function matches(value: string, rule: DailyTimetableOverride) {
  const code = classCode(value)
  if (rule.targetClass) return code === `${rule.targetGrade}-${Number(rule.targetClass)}`
  return !rule.targetGrade || code.startsWith(`${rule.targetGrade}-`)
}
function dayIndex(date: string) { return new Date(`${date}T12:00:00`).getDay() - 1 }

export function applyTeacherOverrides(teacher: TeacherTimetable, date: string, base: string[], overrides: DailyTimetableOverride[]) {
  const lessons = [...base]
  overrides.filter(rule => rule.active && rule.date === date && rule.action !== 'move_pulled')
    .sort((a, b) => Number(Boolean(a.targetClass)) - Number(Boolean(b.targetClass)) || Number(Boolean(a.targetGrade)) - Number(Boolean(b.targetGrade)) || a.updatedAt.localeCompare(b.updatedAt))
    .forEach(rule => {
      const index = rule.targetPeriod - 1
      if (index < 0 || index > 6) return
      if (rule.action === 'clear') {
        if ((!rule.targetGrade && !rule.targetClass) || matches(lessons[index] ?? '', rule)) lessons[index] = ''
        return
      }
      const sourceDay = dayIndex(rule.sourceDate)
      const source = sourceDay >= 0 && sourceDay <= 4 && rule.sourcePeriod >= 1 && rule.sourcePeriod <= 7
        ? teacher.slots[sourceDay * 7 + rule.sourcePeriod - 1]?.value ?? '' : ''
      if ((!rule.targetGrade && !rule.targetClass) || matches(source, rule) || matches(lessons[index] ?? '', rule)) lessons[index] = source
    })
  return lessons
}

export function effectiveMobilePulledLessons(pulled: PulledLesson[], overrides: DailyTimetableOverride[]) {
  return pulled.map(item => {
    const rule = overrides.filter(candidate => candidate.active && candidate.action === 'move_pulled' && candidate.sourceDate === item.date && candidate.sourcePeriod === item.period)
      .find(candidate => !candidate.targetGrade || matches(item.classLabel, candidate))
    return rule ? { ...item, date: rule.date, period: rule.targetPeriod } : item
  })
}
