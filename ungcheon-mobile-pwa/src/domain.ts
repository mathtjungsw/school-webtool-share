import { addDays, format, startOfWeek } from 'date-fns'
import type { DashboardPayload, LessonView, MobileEvent, ScheduleSource, TeacherTimetable, TimetableChange } from './types'
import { PULLED_LESSONS_2026 } from './shared/pulledLessons2026'
import { UNGCHEON_PERIOD_PLAN } from './shared/ungcheonSchedule'

export const DAYS = ['월', '화', '수', '목', '금']
export const SOURCE_LABELS: Record<ScheduleSource, string> = {
  weekly: '주간계획', creative: '창체', schoolEvent: '창체 학사일정', committee: '위원회 일정',
  gateDuty: '등교지도', mealDuty: '급식지도', timetableChange: '수업 변경', pulledLesson: '당김수업',
}
export const DEFAULT_VISIBILITY: Record<ScheduleSource, boolean> = {
  weekly: true, creative: true, schoolEvent: true, committee: true, gateDuty: true,
  mealDuty: true, timetableChange: true, pulledLesson: true,
}

export function ymd(date: Date) { return format(date, 'yyyy-MM-dd') }
export function schoolClock(date = new Date()) {
  const values: Record<string, string> = {}
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).forEach(part => { if (part.type !== 'literal') values[part.type] = part.value })
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
    seconds: Number(values.second),
  }
}
export function rangeForToday(today = new Date()) {
  const monday = startOfWeek(today, { weekStartsOn: 1 })
  return { from: ymd(monday), to: ymd(addDays(monday, 13)), thisWeek: Array.from({ length: 7 }, (_, index) => ymd(addDays(monday, index))), nextWeek: Array.from({ length: 7 }, (_, index) => ymd(addDays(monday, index + 7))) }
}

function minutesOf(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export interface LessonFocus {
  state: 'before' | 'during' | 'between' | 'after' | 'none'
  currentPeriod?: number
  currentLesson?: LessonView
  currentTime?: string
  nextPeriod?: number
  nextLesson?: LessonView
  nextStart?: string
  minutesUntil?: number
}

export function lessonFocus(lessons: LessonView[], minuteOfDay: number): LessonFocus {
  if (!lessons.length) return { state: 'none' }
  const currentPlan = UNGCHEON_PERIOD_PLAN.find(item => minuteOfDay >= minutesOf(item.start) && minuteOfDay < minutesOf(item.end))
  const nextPlan = UNGCHEON_PERIOD_PLAN.find(item => minutesOf(item.start) > minuteOfDay && Boolean(lessons[Number(item.period) - 1]?.value))
  const state: LessonFocus['state'] = currentPlan
    ? 'during'
    : minuteOfDay < minutesOf(UNGCHEON_PERIOD_PLAN[0].start)
      ? 'before'
      : minuteOfDay >= minutesOf(UNGCHEON_PERIOD_PLAN[UNGCHEON_PERIOD_PLAN.length - 1].end)
        ? 'after'
        : 'between'
  const currentPeriod = currentPlan ? Number(currentPlan.period) : undefined
  return {
    state,
    currentPeriod,
    currentLesson: currentPeriod ? lessons[currentPeriod - 1] : undefined,
    currentTime: currentPlan ? `${currentPlan.start}~${currentPlan.end}` : undefined,
    nextPeriod: nextPlan ? Number(nextPlan.period) : undefined,
    nextLesson: nextPlan ? lessons[Number(nextPlan.period) - 1] : undefined,
    nextStart: nextPlan?.start,
    minutesUntil: nextPlan ? Math.max(0, minutesOf(nextPlan.start) - minuteOfDay) : undefined,
  }
}
export function findTeacher(timetable: DashboardPayload['timetable'], name: string) {
  return timetable?.teachers.find(teacher => teacher.name.trim() === name.trim()) ?? null
}
export function parseSlot(value: string) {
  const lines = value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
  const raw = lines[0] ?? ''
  const match = raw.match(/^([1-3])0?(\d{1,2})$/)
  return { className: match ? `${match[1]}-${Number(match[2])}` : raw, subject: lines.slice(1).join(' · ') }
}
export function isApplied(change: TimetableChange, name: string) {
  return change.status === 'approved' || Boolean(change.requesterAppliedAt && change.requesterName === name)
}
export function timetableForDate(teacher: TeacherTimetable | null, date: string, changes: TimetableChange[], teacherName: string): LessonView[] {
  const dayIndex = new Date(`${date}T12:00:00`).getDay() - 1
  if (!teacher || dayIndex < 0 || dayIndex > 4) return []
  const hasEighth = PULLED_LESSONS_2026.some(item => item.date === date && item.teacherName.trim() === teacherName.trim() && item.period === 8)
  const lessons: LessonView[] = Array.from({ length: hasEighth ? 8 : 7 }, (_, index) => ({ period: index + 1, value: teacher.slots[dayIndex * 7 + index]?.value ?? '' }))
  changes.filter(item => isApplied(item, teacherName)).forEach(change => {
    if (change.originalDate === date) {
      const cell = lessons[change.originalSlotIndex % 7]
      if (change.originalTeacher === teacherName) Object.assign(cell, { value: '', changed: true, note: `${change.kind === 'exchange' ? '교환' : '대강'} · ${change.replacementTeacher}` })
      if (change.replacementTeacher === teacherName) Object.assign(cell, { value: `${change.originalClass}\n${change.originalSubject}`, changed: true, note: change.kind === 'exchange' ? '교환 수업' : '대강 수업' })
    }
    if (change.kind === 'exchange' && change.replacementDate === date) {
      const cell = lessons[change.replacementSlotIndex % 7]
      if (change.originalTeacher === teacherName) Object.assign(cell, { value: `${change.replacementClass}\n${change.replacementSubject}`, changed: true, note: '교환 수업' })
      if (change.replacementTeacher === teacherName) Object.assign(cell, { value: '', changed: true, note: `교환 · ${change.originalTeacher}` })
    }
  })
  PULLED_LESSONS_2026.filter(item => item.date === date && item.teacherName.trim() === teacherName.trim()).forEach(item => {
    const cell = lessons[item.period - 1] ?? { period: item.period, value: '' }
    Object.assign(cell, { value: `${item.classLabel}\n${item.subject}`, changed: true, note: item.substituteTeacherName ? `당김 · ${item.substituteTeacherName} 보강` : '당김수업' })
    if (!lessons[item.period - 1]) lessons.push(cell)
  })
  return lessons
}
export function collectEvents(data: DashboardPayload, name: string): MobileEvent[] {
  const events: MobileEvent[] = (data.bundle?.events ?? []).map((item, index) => ({ ...item, id: `bundle-${item.source}-${item.date}-${index}` }))
  data.committees.events.filter(event => event.memberNames.includes(name)).forEach(event => events.push({ id: `committee-${event.id}`, date: event.date, title: event.title, source: 'committee', label: event.committeeName, time: event.startTime }))
  data.changes.filter(item => isApplied(item, name)).forEach(item => {
    const title = item.kind === 'exchange' ? `수업 교환 · ${item.originalClass} ↔ ${item.replacementClass}` : `대강 · ${item.originalClass} ${item.originalSubject}`
    ;[...new Set([item.originalDate, item.replacementDate])].forEach(date => events.push({ id: `change-${item.id}-${date}`, date, title, source: 'timetableChange', label: item.status === 'approved' ? '승인된 수업 변경' : '우선 반영' }))
  })
  PULLED_LESSONS_2026.filter(item => item.teacherName.trim() === name.trim()).forEach(item => events.push({ id: item.id, date: item.date, title: `${item.period}교시 ${item.classLabel} ${item.subject}`, source: 'pulledLesson', label: '당김수업' }))
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
}

export function eventFingerprint(event: MobileEvent) {
  const normalize = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  return [event.source, event.date, normalize(event.time), normalize(event.label), normalize(event.title)].join('|')
}

export function newEventFingerprints(previous: DashboardPayload | null, current: DashboardPayload, name: string, fromDate: string) {
  if (!previous) return []
  const previousKeys = new Set(collectEvents(previous, name).map(eventFingerprint))
  return collectEvents(current, name)
    .filter(event => event.date >= fromDate)
    .map(eventFingerprint)
    .filter(key => !previousKeys.has(key))
}
