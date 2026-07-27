// 시간표 도구 로직: 개인시간표, 함께 비어있는 시간, 세트 후보
import { DAYS, slotKey, type Day, type Lesson, type SlotCandidate } from './types'

// 시간표 전체에서 등장하는 최대 교시 (기본 7)
export function maxPeriod(timetable: Lesson[]): number {
  return timetable.reduce((m, l) => Math.max(m, l.period), 7)
}

export function teacherNames(timetable: Lesson[]): string[] {
  return [...new Set(timetable.map((l) => l.teacher))].sort((a, b) => a.localeCompare(b, 'ko'))
}

export interface Cell { day: Day; period: number; lessons: Lesson[] }

// 개인시간표: 교사 1명 → 요일×교시 격자
export function personalGrid(timetable: Lesson[], teacher: string, periods: number): Cell[][] {
  return DAYS.map((day) =>
    Array.from({ length: periods }, (_, i) => {
      const period = i + 1
      const lessons = timetable.filter((l) => l.teacher === teacher && l.day === day && l.period === period)
      return { day, period, lessons }
    }),
  )
}

// 함께 비어있는 시간: 선택 교사들 × (요일,교시) → 각 교사의 수업 여부
export interface FreeSlot {
  day: Day
  period: number
  busy: Record<string, Lesson[]>   // 교사명 → 그 시간 수업들
  freeCount: number                // 공강 교사 수
  allFree: boolean                 // 선택 교사 전원 공강
}

export function commonFree(timetable: Lesson[], teachers: string[], periods: number): FreeSlot[][] {
  return DAYS.map((day) =>
    Array.from({ length: periods }, (_, i) => {
      const period = i + 1
      const busy: Record<string, Lesson[]> = {}
      let freeCount = 0
      for (const t of teachers) {
        const ls = timetable.filter((l) => l.teacher === t && l.day === day && l.period === period)
        busy[t] = ls
        if (ls.length === 0) freeCount++
      }
      return { day, period, busy, freeCount, allFree: teachers.length > 0 && freeCount === teachers.length }
    }),
  )
}

// 학년별 반 수 (명렬표 기준) — 선택과목 블록 추천에 사용
export function homeroomCounts(students: { grade: number; classNo: number }[]): Record<number, number> {
  const m: Record<number, Set<number>> = {}
  for (const s of students) {
    if (!s.classNo) continue
    ;(m[s.grade] ??= new Set()).add(s.classNo)
  }
  const out: Record<number, number> = {}
  for (const g in m) out[+g] = m[+g].size
  return out
}

// 세트수업 관리용: (학년·요일·교시) 슬롯 중 평행 수업 2개 이상인 후보 목록.
// suggested = 수업수 > 그 학년 반 수 → 선택과목 블록 추정(반 수 없으면 과목 2종↑).
export function slotCandidates(timetable: Lesson[], homerooms: Record<number, number> = {}): SlotCandidate[] {
  const groups = new Map<string, Lesson[]>()
  for (const l of timetable) {
    const key = slotKey(l.grade, l.day, l.period)
    const arr = groups.get(key) ?? []
    arr.push(l)
    groups.set(key, arr)
  }
  const out: SlotCandidate[] = []
  for (const [key, lessons] of groups) {
    if (lessons.length < 2) continue
    const { grade, day, period } = lessons[0]
    const hr = homerooms[grade]
    const suggested = hr ? lessons.length > hr : new Set(lessons.map((l) => l.subject)).size >= 2
    out.push({ key, grade, day, period, lessons, suggested })
  }
  const dayOrder = (d: string) => DAYS.indexOf(d as Day)
  return out.sort((a, b) => a.grade - b.grade || dayOrder(a.day) - dayOrder(b.day) || a.period - b.period)
}
