// 시험감독 시간표 도우미 — 데이터 모델 기본값 / 유틸
import type { ExamState, Unit, Config } from './types'

export const makeDefaultState = (): ExamState => ({
  config: {
    rules: {
      mainSubPriority: '균등',
      maxDiffPerDay: '1',
      assignPriority: '부감독',
      excludeSubject: '해당시간',
      excludeHomeroom: '해당시간',
      excludeSubInTwo: '적용',
      excludeSameClass: '적용',
      excludeHallwayConsecutive: '적용',
      mixGender: '미적용',
      excludeSubjectConsec: '적용',
      excludeConsecutive: '2',
      selfStudyRole: '정감독',
    },
    assignmentMethods: {},
    grades: [1, 2, 3],
    classes: { 1: 5, 2: 5, 3: 5 },
    examName: '',
    examDates: [],
    specialRoomMode: 'integrated',
    specialRooms: { integrated: 0, perGrade: { 1: 0, 2: 0, 3: 0 } },
    hallwayMode: 'integrated',
    hallways: { integrated: 0, perGrade: { 1: 0, 2: 0, 3: 0 } },
    subjects: ['자율학습', '국어', '수학', '영어', '한국사', '통합사회', '통합과학', '문학'],
    periodTimes: {
      1: [
        { id: 'pt-1-1', name: '1교시', time: '09:00~09:50' },
        { id: 'pt-1-2', name: '2교시', time: '10:10~11:00' },
      ],
      2: [
        { id: 'pt-2-1', name: '1교시', time: '09:00~09:50' },
        { id: 'pt-2-2', name: '2교시', time: '10:10~11:00' },
      ],
      3: [
        { id: 'pt-3-1', name: '1교시', time: '09:00~09:50' },
        { id: 'pt-3-2', name: '2교시', time: '10:10~11:00' },
      ],
    },
  },
  teachers: [],
  periods: [],
  classSubjects: {},
  assignments: {},
})

export const TEACHER_CATEGORIES = ['교사', '명예교사', '교육봉사자'] as const

export function genUnits(config: Config): Unit[] {
  const units: Unit[] = []
  const { grades, classes, specialRoomMode, specialRooms, hallwayMode, hallways } = config

  grades.forEach((g) => {
    const n = classes[g] ?? 0
    for (let v = 1; v <= n; v++) {
      units.push({ id: `${g}-${v}`, label: `${v}반`, fullLabel: `${g}학년 ${v}반`, grade: g.toString(), type: 'class' })
    }
  })

  if (specialRoomMode === 'integrated') {
    for (let d = 1; d <= specialRooms.integrated; d++)
      units.push({ id: `sp-int-${d}`, label: `특별실${d}`, grade: '전체', type: 'special' })
  } else {
    grades.forEach((g) => {
      const n = specialRooms.perGrade[g] ?? 0
      for (let v = 1; v <= n; v++)
        units.push({ id: `sp-${g}-${v}`, label: `특별실${v}`, grade: g.toString(), type: 'special' })
    })
  }

  if (hallwayMode === 'integrated') {
    for (let d = 1; d <= hallways.integrated; d++)
      units.push({ id: `hw-int-${d}`, label: `복도${d}`, grade: '전체', type: 'hallway' })
  } else {
    grades.forEach((g) => {
      const n = hallways.perGrade[g] ?? 0
      for (let v = 1; v <= n; v++)
        units.push({ id: `hw-${g}-${v}`, label: `복도${v}`, grade: g.toString(), type: 'hallway' })
    })
  }

  return units
}

export function nextPeriodTime(timeStr: string): string {
  if (!timeStr || !timeStr.includes('~')) return '09:00~09:50'
  const [a, b] = timeStr.split('~').map((s) => s.trim())
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60).toString().padStart(2, '0')
    const m = (mins % 60).toString().padStart(2, '0')
    return `${h}:${m}`
  }
  const start = toMin(a)
  const end = toMin(b)
  return `${fmt(end + 20)}~${fmt(end + 20 + (end - start))}`
}

export function sameSlotPeriodIds(periodId: string, periods: { id: string; date: string; name: string; time: string }[]): string[] {
  const p = (periods || []).find((r) => r.id === periodId)
  if (!p) return []
  return (periods || []).filter((r) => r.date === p.date && r.name === p.name && r.time === p.time).map((r) => r.id)
}

export const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
