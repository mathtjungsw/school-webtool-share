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

export const HELP_CLASS_SCHEDULES: HelpClassStudentSchedule[] = []

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
