import type { PersonalTimetableSlot, StudentTimetableDay } from './studentTimetable'

export interface HelpClassStudentIdentity {
  grade: string
  className: string
  name: string
}

export interface HelpClassLesson {
  day: StudentTimetableDay
  period: number
  sourceSubject: string
}

interface HelpClassStudentSchedule extends HelpClassStudentIdentity {
  lessons: HelpClassLesson[]
}

const COMMON_HELP_CLASS_LESSONS: HelpClassLesson[] = [
  { day: '월', period: 1, sourceSubject: '체육' },
  { day: '월', period: 3, sourceSubject: '수학' },
  { day: '화', period: 1, sourceSubject: '체육' },
  { day: '화', period: 2, sourceSubject: '진로 직업' },
  { day: '화', period: 3, sourceSubject: '진로 직업' },
  { day: '수', period: 1, sourceSubject: '체육' },
  { day: '수', period: 5, sourceSubject: '진로 직업' },
  { day: '수', period: 6, sourceSubject: '진로 직업' },
  { day: '목', period: 1, sourceSubject: '체육' },
  { day: '목', period: 3, sourceSubject: '수학' },
  { day: '금', period: 1, sourceSubject: '체육' },
  { day: '금', period: 3, sourceSubject: '수학' },
]

const REDUCED_HELP_CLASS_LESSONS: HelpClassLesson[] = [
  { day: '월', period: 5, sourceSubject: '진로 직업' },
  { day: '화', period: 5, sourceSubject: '수학' },
  { day: '수', period: 3, sourceSubject: '수학' },
  { day: '금', period: 4, sourceSubject: '수학' },
]

/**
 * 2026학년도 2학기 「학생개인별시간표」 HWPX의 비흰색 수업 칸을 추출한 읽기 전용 자료입니다.
 * 색칠된 동아리 칸은 도움반 수업이 아니므로 추출 단계에서 제외했습니다.
 */
export const HELP_CLASS_SCHEDULES: HelpClassStudentSchedule[] = [
  { grade: '1', className: '1', name: '장은재', lessons: COMMON_HELP_CLASS_LESSONS },
  { grade: '1', className: '2', name: '허준호', lessons: COMMON_HELP_CLASS_LESSONS },
  { grade: '1', className: '3', name: '엄정훈', lessons: REDUCED_HELP_CLASS_LESSONS },
  { grade: '2', className: '3', name: '정채윤', lessons: [...COMMON_HELP_CLASS_LESSONS, { day: '월', period: 5, sourceSubject: '진로 직업' }] },
  { grade: '2', className: '4', name: '안도균', lessons: [...COMMON_HELP_CLASS_LESSONS, { day: '월', period: 5, sourceSubject: '진로 직업' }] },
  { grade: '3', className: '3', name: '최준화', lessons: REDUCED_HELP_CLASS_LESSONS },
]

const normalizeNumber = (value: string) => String(Number(value))
const normalizeName = (value: string) => value.replace(/\s+/g, '')

export function findHelpClassLesson(
  student: HelpClassStudentIdentity,
  day: StudentTimetableDay,
  period: number,
): HelpClassLesson | null {
  const schedule = HELP_CLASS_SCHEDULES.find(item =>
    normalizeNumber(item.grade) === normalizeNumber(student.grade) &&
    normalizeNumber(item.className) === normalizeNumber(student.className) &&
    normalizeName(item.name) === normalizeName(student.name),
  )
  return schedule?.lessons.find(item => item.day === day && item.period === period) ?? null
}

export type HelpClassLocatedSlot = PersonalTimetableSlot & {
  helpClass: true
  helpClassSourceSubject: string
  originalClassroom: string
}

export function applyHelpClassLocation(
  slot: PersonalTimetableSlot | undefined,
  student: HelpClassStudentIdentity,
  day: StudentTimetableDay,
  period: number,
): PersonalTimetableSlot | HelpClassLocatedSlot | undefined {
  const lesson = findHelpClassLesson(student, day, period)
  if (!lesson) return slot
  const base = slot ?? {
    day,
    period,
    subject: lesson.sourceSubject,
    teacher: '',
    classroom: '',
    raw: lesson.sourceSubject,
    selectedCourse: false,
  }
  return {
    ...base,
    classroom: '도움반',
    helpClass: true,
    helpClassSourceSubject: lesson.sourceSubject,
    originalClassroom: base.classroom,
  }
}
