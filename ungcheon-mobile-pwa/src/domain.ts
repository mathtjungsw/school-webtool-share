import { addDays, format, startOfWeek } from 'date-fns'
import type { DashboardPayload, LessonView, MealInfo, MobileEvent, ScheduleSource, TeacherTimetable, TimetableChange } from './types'
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

export function sortMealsByType(meals: readonly MealInfo[]) {
  const rank = (value: string) => value.includes('조식') ? 0 : value.includes('중식') ? 1 : value.includes('석식') ? 2 : 3
  return [...meals].sort((a, b) => rank(a.mealType) - rank(b.mealType))
}

export interface MobileTimelineRow {
  id: string
  kind: 'before' | 'period' | 'break' | 'lunch' | 'after'
  label: string
  start: string
  end: string
  lesson?: LessonView
  events: MobileEvent[]
}

function eventRange(event: MobileEvent) {
  const text = [event.startTime, event.endTime].filter(Boolean).join('~') || event.time || event.title
  const matches = [...text.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)]
  const clock = (match: RegExpMatchArray) => `${match[1].padStart(2, '0')}:${match[2]}`
  let start = event.startTime || (matches[0] ? clock(matches[0]) : '')
  let end = event.endTime || (matches[1] ? clock(matches[1]) : '')
  if (!start && event.source === 'creative') {
    const periods = [...event.title.matchAll(/(?<!\d)([1-7])(?=\s*(?:[~～〜·,]|교시))/g)].map(match => Number(match[1]))
    if (periods.length) {
      const first = UNGCHEON_PERIOD_PLAN[Math.min(...periods) - 1]
      const last = UNGCHEON_PERIOD_PLAN[Math.max(...periods) - 1]
      start = first?.start || ''
      end = last?.end || ''
    }
  }
  if (!start || !/^\d{2}:\d{2}$/.test(start) || (end && !/^\d{2}:\d{2}$/.test(end))) return null
  return { start, end: end && end > start ? end : start, point: !end || end <= start }
}

export function buildMobileTimelineRows(lessons: LessonView[], events: MobileEvent[]): MobileTimelineRow[] {
  const timed = events.filter(event => event.source !== 'timetableChange' && event.source !== 'pulledLesson')
    .map(event => ({ event, range: eventRange(event) })).filter((item): item is { event: MobileEvent; range: NonNullable<ReturnType<typeof eventRange>> } => Boolean(item.range))
  if (!lessons.length) {
    return timed.map((item, index) => ({
      id: `timed-event-${item.event.id}-${index}`,
      kind: 'before',
      label: '시간 일정',
      start: item.range.start,
      end: item.range.end,
      events: [item.event],
    }))
  }
  const first = UNGCHEON_PERIOD_PLAN[0]
  const last = UNGCHEON_PERIOD_PLAN[6]
  const overlaps = (start: string, end: string) => timed.filter(item => item.range.point
    ? item.range.start >= start && item.range.start < end
    : item.range.start < end && item.range.end > start).map(item => item.event)
  const rows: MobileTimelineRow[] = []
  const before = timed.filter(item => item.range.start < first.start)
  if (before.length) rows.push({ id: 'before', kind: 'before', label: '수업 전', start: before.map(item => item.range.start).sort()[0], end: first.start, events: before.map(item => item.event) })
  UNGCHEON_PERIOD_PLAN.slice(0, 7).forEach((period, index) => {
    rows.push({ id: `period-${period.period}`, kind: 'period', label: `${period.period}교시`, start: period.start, end: period.end, lesson: lessons[index], events: overlaps(period.start, period.end) })
    const next = UNGCHEON_PERIOD_PLAN[index + 1]
    if (!next || index >= 6) return
    const gapEvents = overlaps(period.end, next.start)
    if (index === 3 || gapEvents.length) rows.push({ id: `gap-${period.period}`, kind: index === 3 ? 'lunch' : 'break', label: index === 3 ? '점심' : '쉬는 시간', start: period.end, end: next.start, events: gapEvents })
  })
  const after = timed.filter(item => item.range.point ? item.range.start >= last.end : item.range.end > last.end)
  if (after.length) rows.push({ id: 'after', kind: 'after', label: '수업 후', start: last.end, end: after.map(item => item.range.end).sort().at(-1) || last.end, events: after.map(item => item.event) })
  return rows
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
  const activePlan = UNGCHEON_PERIOD_PLAN.slice(0, lessons.length)
  const currentPlan = activePlan.find(item => minuteOfDay >= minutesOf(item.start) && minuteOfDay < minutesOf(item.end))
  const nextPlan = activePlan.find(item => minutesOf(item.start) > minuteOfDay && Boolean(lessons[Number(item.period) - 1]?.value))
  const state: LessonFocus['state'] = currentPlan
    ? 'during'
    : minuteOfDay < minutesOf(activePlan[0].start)
      ? 'before'
      : minuteOfDay >= minutesOf(activePlan[activePlan.length - 1].end)
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
  data.committees.events.filter(event => event.memberNames.includes(name)).forEach(event => events.push({ id: `committee-${event.id}`, date: event.date, title: event.title, source: 'committee', label: event.committeeName, time: event.startTime, startTime: event.startTime, endTime: event.endTime }))
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
