import type { DailyTimetableOverride } from './timetableOverrides'

/** 전 학년/학년/학급 예외 사이의 포함 관계도 충돌로 알린다. */
export function overrideScopesOverlap(a: DailyTimetableOverride, b: DailyTimetableOverride) {
  if (!a.active || !b.active || a.id === b.id) return false
  const affected = (item: DailyTimetableOverride) => [
    `${item.date}:${item.targetPeriod}`,
    ...(item.action === 'move_pulled' ? [`${item.sourceDate}:${item.sourcePeriod}`] : []),
  ]
  if (!affected(a).some(key => affected(b).includes(key))) return false
  if (a.targetGrade && b.targetGrade && Number(a.targetGrade) !== Number(b.targetGrade)) return false
  if (a.targetClass && b.targetClass && Number(a.targetClass) !== Number(b.targetClass)) return false
  return true
}
export function overrideBatchConflicts(proposed: DailyTimetableOverride[], existing: DailyTimetableOverride[]) {
  return proposed.flatMap((item, index) => [...existing, ...proposed.slice(0, index)].filter(other => overrideScopesOverlap(item, other)).map(other => ({ period: item.targetPeriod, item, other })))
}
