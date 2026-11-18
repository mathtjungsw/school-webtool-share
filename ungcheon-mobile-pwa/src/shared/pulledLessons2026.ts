export interface PulledLesson {
  id: string
  date: string
  period: number
  classLabel: string
  subject: string
  teacherName: string
  originalTeacherName: string
  substituteTeacherName: string
  originalSlot: string
  originalDate: string
  note: string
  sourceRow: number
}

export const PULLED_LESSONS_2026: PulledLesson[] = []
