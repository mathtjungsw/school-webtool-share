import { PULLED_LESSONS_2026, type PulledLesson } from '../data/pulledLessons2026'

function normalizeName(value: string) { return value.replace(/\s+/g, '').trim() }

export function listPulledLessonsForTeacher(teacherName: string, fromDate = '', toDate = ''): PulledLesson[] {
  const teacher = normalizeName(teacherName)
  if (!teacher) return []
  return PULLED_LESSONS_2026
    .filter(lesson => normalizeName(lesson.teacherName) === teacher)
    .filter(lesson => !fromDate || lesson.date >= fromDate)
    .filter(lesson => !toDate || lesson.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period || a.classLabel.localeCompare(b.classLabel, 'ko', { numeric: true }))
}

export function pulledLessonTitle(lesson: PulledLesson) {
  const substitute = lesson.substituteTeacherName ? ' · 보강' : ''
  return `${lesson.period}교시 ${lesson.classLabel} ${lesson.subject}${substitute}`
}

export type { PulledLesson }
