export type AssignMethod =
  | 'priority_time'       // 희망우선 + 입력순서 (미입력 배정 X)
  | 'priority_time_all'   // 희망우선 + 입력순서 (미입력 배정 O)
  | 'priority_random'     // 희망우선 + 무작위 (미입력 배정 X)
  | 'priority_random_all' // 희망우선 + 무작위 (미입력 배정 O)
  | 'random'              // 무작위 전체 배정

export interface Club {
  id: string
  name: string
  instructor: string
  location: string
  capacity: number
  targetGrades: number[]  // [1,2,3]
}

export interface ClubStudent {
  id: string
  grade: number
  classNum: string
  number: number
  name: string
  prefs: string[]       // club IDs in preference order
  ts: number | null     // timestamp for 선착순
  assignedClub: string | null
  isExtra: boolean
}

export interface ClubSettings {
  schoolName: string
  year: number
  grades: number
  classesPerGrade: number[]
  assignMethod: AssignMethod
  maxPrefs: number
  overAssign: boolean
}

export interface ClubStore {
  settings: ClubSettings
  clubs: Club[]
  students: ClubStudent[]
  assignedAt: number | null
}

export const DEFAULT_CLUB_STORE: ClubStore = {
  settings: {
    schoolName: '',
    year: new Date().getFullYear(),
    grades: 3,
    classesPerGrade: [5, 5, 5, 0, 0, 0],
    assignMethod: 'priority_random_all',
    maxPrefs: 3,
    overAssign: false,
  },
  clubs: [],
  students: [],
  assignedAt: null,
}

export const ASSIGN_METHODS: { value: AssignMethod; label: string; desc: string }[] = [
  {
    value: 'priority_time',
    label: '희망 우선 + 선착순 (미입력 배정 X)',
    desc: '1희망부터 채우되, 경쟁 시 희망 입력 순서로 결정합니다. 희망 미입력 학생은 배정하지 않습니다.',
  },
  {
    value: 'priority_time_all',
    label: '희망 우선 + 선착순 (미입력 배정 O)',
    desc: '1희망부터 채우고 경쟁 시 입력 순서 우선, 미입력 학생도 남은 정원에 배정합니다.',
  },
  {
    value: 'priority_random',
    label: '희망 우선 + 무작위 (미입력 배정 X)',
    desc: '1희망부터 채우되, 경쟁 시 무작위로 결정합니다. 희망 미입력 학생은 배정하지 않습니다.',
  },
  {
    value: 'priority_random_all',
    label: '희망 우선 + 무작위 (미입력 배정 O)',
    desc: '1희망부터 채우고, 미입력 학생도 남은 정원에 무작위로 배정합니다.',
  },
  {
    value: 'random',
    label: '무작위 (희망 무시)',
    desc: '희망 순위를 무시하고 전체 학생을 무작위로 배정합니다.',
  },
]
