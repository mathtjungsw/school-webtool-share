// 수업 교체 엔진 — 세트수업(동시 선택과목) 묶음 이동 지원
import { DAYS, slotKey, type Day, type Lesson } from './types'

// 옮길 그룹: 해당 (학년·요일·교시) 슬롯이 활성 세트면 그 슬롯의 수업 전체, 아니면 단일 수업
export function movingGroup(lesson: Lesson, timetable: Lesson[], enabledSets: string[]): Lesson[] {
  const key = slotKey(lesson.grade, lesson.day, lesson.period)
  if (!enabledSets.includes(key)) return [lesson]
  return timetable.filter((l) => l.grade === lesson.grade && l.day === lesson.day && l.period === lesson.period)
}

const slot = (l: Lesson) => `${l.day}-${l.period}`
const cls = (l: Lesson) => `${l.grade}-${l.classNo}`

// 그룹을 (day,period)로 옮길 때 충돌하는 기존 수업들 (그룹 자신 제외)
export function conflictsAt(
  timetable: Lesson[], group: Lesson[], day: Day, period: number,
): Lesson[] {
  const ids = new Set(group.map((l) => l.id))
  const teachers = new Set(group.map((l) => l.teacher))
  const classes = new Set(group.map(cls))
  return timetable.filter(
    (l) =>
      !ids.has(l.id) &&
      l.day === day &&
      l.period === period &&
      (teachers.has(l.teacher) || classes.has(cls(l))),
  )
}

export interface Target {
  day: Day
  period: number
  type: 'move' | 'swap'
  counterpart: Lesson[]   // swap 시 맞교환되는 수업들
}

// 그룹을 옮길 수 있는 모든 후보 슬롯
// - move: 대상 슬롯이 비어 충돌 없음
// - swap: 충돌 수업(counterpart)을 원래 자리로 맞교환하면 양쪽 모두 충돌 없음
export function findTargets(
  timetable: Lesson[], group: Lesson[], periods: number,
): Target[] {
  if (group.length === 0) return []
  const src = { day: group[0].day, period: group[0].period }
  const out: Target[] = []
  for (const day of DAYS) {
    for (let period = 1; period <= periods; period++) {
      if (day === src.day && period === src.period) continue
      const conflict = conflictsAt(timetable, group, day, period)
      if (conflict.length === 0) {
        out.push({ day, period, type: 'move', counterpart: [] })
        continue
      }
      // swap 가능성: counterpart를 src로 옮겼을 때 충돌이 없어야 함
      const counterpart = conflict
      const cIds = new Set(counterpart.map((l) => l.id))
      const remaining = timetable.filter((l) => !cIds.has(l.id) && !group.some((g) => g.id === l.id))
      const backConflict = conflictsAt(remaining, counterpart, src.day, src.period)
      // 그룹을 대상으로 옮길 때 counterpart 외 다른 충돌이 있으면 swap 불가
      const fwdOther = conflictsAt(remaining, group, day, period)
      if (backConflict.length === 0 && fwdOther.length === 0) {
        out.push({ day, period, type: 'swap', counterpart })
      }
    }
  }
  return out
}

// 교체 실행 → 새 시간표 반환
export function applyTarget(timetable: Lesson[], group: Lesson[], target: Target): Lesson[] {
  const src = { day: group[0].day, period: group[0].period }
  const gIds = new Set(group.map((l) => l.id))
  const cIds = new Set(target.counterpart.map((l) => l.id))
  return timetable.map((l) => {
    if (gIds.has(l.id)) return { ...l, day: target.day, period: target.period }
    if (cIds.has(l.id)) return { ...l, day: src.day, period: src.period }
    return l
  })
}

// 변경 안내문 텍스트
export function changeSummary(group: Lesson[], target: Target): string {
  const src = `${group[0].day}${group[0].period}교시`
  const dst = `${target.day}${target.period}교시`
  const desc = group.map((l) => `${l.teacher}(${l.grade}-${l.classNo} ${l.subject})`).join(', ')
  if (target.type === 'move') {
    return `${src} → ${dst} 이동: ${desc}`
  }
  const cp = target.counterpart.map((l) => `${l.teacher}(${l.grade}-${l.classNo} ${l.subject})`).join(', ')
  return `${src} ↔ ${dst} 맞교환\n  · ${dst}로: ${desc}\n  · ${src}로: ${cp}`
}
