// 업무경감 도우미 — 데이터 모델
// 원본: 구두방장선생 "업무경감양식모음" (명렬표/교직원부/시간표 기반)

export const DAYS = ['월', '화', '수', '목', '금'] as const
export type Day = (typeof DAYS)[number]

// 명렬표: 학년·반·번호·학번·이름
export interface Student {
  grade: number
  classNo: number
  num: number
  sid: string   // 학번
  name: string
}

// 교직원부: 성명 + 담임(학년/반)
export interface Teacher {
  name: string
  homeroomGrade?: number
  homeroomClass?: number
}

// 시간표: 행 단위 수업
export interface Lesson {
  id: string
  teacher: string
  day: Day
  period: number
  grade: number
  classNo: number
  subject: string
}

// 세트수업: 사용자가 지정한 (학년·요일·교시) 슬롯. 교체 시 그 슬롯의 수업들이 함께 이동.
// 영속화는 슬롯 키 문자열(`${grade}-${day}-${period}`) 배열로 저장 → 시간표 재가져오기에도 유지.
export const slotKey = (grade: number, day: Day, period: number) => `${grade}-${day}-${period}`

// 세트수업 관리 화면용 후보(런타임 계산)
export interface SlotCandidate {
  key: string
  grade: number
  day: Day
  period: number
  lessons: Lesson[]
  suggested: boolean    // 수업수 > 반수 → 선택과목 블록 추정
}

export interface WRData {
  school: string
  students: Student[]
  teachers: Teacher[]
  timetable: Lesson[]
  sets: string[]        // 활성 세트 슬롯 키 목록
}

export const emptyWRData = (): WRData => ({
  school: '',
  students: [],
  teachers: [],
  timetable: [],
  sets: [],
})

// 영속화 키 (electron-store)
export const WR_KEYS = {
  school: 'wr:school',
  students: 'wr:students',
  teachers: 'wr:teachers',
  timetable: 'wr:timetable',
  sets: 'wr:sets',
} as const
