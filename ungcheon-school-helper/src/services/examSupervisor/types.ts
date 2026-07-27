// 시험감독 자동 배정 — 공유 타입 정의

export type TeacherCategory = '교사' | '명예교사' | '교육봉사자'

export interface TeacherAbsence {
  date: string
  periodName: string
  /** ALL | GRADE | CLASS */
  scope: 'ALL' | 'GRADE' | 'CLASS'
  target?: string
}

export interface Teacher {
  id: string
  name: string
  category: TeacherCategory
  isMain: boolean
  isSub: boolean
  isSpecial: boolean
  isHallway: boolean
  avoidance: string[]
  homeroom: string
  subjects: string[]
  exclusions: string[]
  absences: TeacherAbsence[]
  isAbsentAll: boolean
  maxPeriods: number | ''
  gender: string
  note?: string
  absenceNotes?: string
}

export interface Period {
  id: string
  date: string
  name: string
  time: string
  /** 학년 or "전체" */
  grade: string
}

export type UnitType = 'class' | 'special' | 'hallway'

export interface Unit {
  id: string
  label: string
  fullLabel?: string
  grade: string
  type: UnitType
}

export interface AssignmentCell {
  main: string | null
  sub: string | null
  sub2: string | null
  _relaxed?: boolean
}

/** { [periodId]: { [unitId]: AssignmentCell } } */
export type Assignments = Record<string, Record<string, AssignmentCell>>

/** { [periodId]: { [unitId]: "과목명" } } */
export type ClassSubjects = Record<string, Record<string, string>>

export interface Rules {
  mainSubPriority: '균등' | '무관'
  maxDiffPerDay: '0' | '1' | '2' | '제한없음'
  assignPriority: string
  excludeSubject: '해당시간' | '미적용'
  excludeHomeroom: '해당시간' | '미적용'
  excludeSubInTwo: '적용' | '미적용'
  excludeSameClass: '적용' | '미적용'
  excludeHallwayConsecutive: '적용' | '미적용'
  mixGender: '적용' | '미적용'
  excludeSubjectConsec: '적용' | '미적용'
  excludeConsecutive: '1' | '2' | '3' | '제한없음'
  selfStudyRole: '정감독' | '부감독'
}

export interface PeriodTime {
  id: string
  name: string
  time: string
}

export interface AssignmentMethod {
  type: '1인 감독' | '2인 감독' | '3인 감독'
  detail?: string
}

export interface Config {
  rules: Rules
  assignmentMethods: Record<string, AssignmentMethod>
  grades: number[]
  classes: Record<number, number>
  examName: string
  examDates: string[]
  specialRoomMode: 'integrated' | 'perGrade'
  specialRooms: { integrated: number; perGrade: Record<number, number> }
  hallwayMode: 'integrated' | 'perGrade'
  hallways: { integrated: number; perGrade: Record<number, number> }
  subjects: string[]
  periodTimes: Record<number, PeriodTime[]>
}

export interface ExamState {
  config: Config
  teachers: Teacher[]
  periods: Period[]
  classSubjects: ClassSubjects
  assignments: Assignments
}

export interface RunAssignmentResult {
  assignments: Assignments
  totalAssigned: number
  emptyRemain: number
  emptyFixed: number
  emptySlots: { date: string; name: string; time: string; rooms: { label: string; role: string }[] }[]
  counts: { total: Record<string, number>; mainCnt: Record<string, number>; subCnt: Record<string, number> }
}

export interface PreflightSlot {
  date: string
  name: string
  time: string
  needMain: number
  needSub: number
  availMain: number
  availSub: number
  shortMain: number
  shortSub: number
}

export interface PreflightResult {
  slots: PreflightSlot[]
  hasShortage: boolean
}
