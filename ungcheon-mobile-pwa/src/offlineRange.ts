import { summaryOnly } from './attendanceSummary'
import { schoolClock } from './domain'
import { effectiveMobilePulledLessons } from './timetableOverrides'
import type { DashboardPayload, MobileResourceKey, MobileResourceStatusMap } from './types'

function calendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

export function projectOfflineRange(snapshot: DashboardPayload | null, start: string, end: string, today: string) {
  const saved = snapshot?.offlineRange
  const bundle = snapshot?.bundle
  if (!snapshot || !bundle || !saved || ![saved.from, saved.to, start, end, today].every(calendarDay)) return null
  const from = start > saved.from ? start : saved.from
  const to = end < saved.to ? end : saved.to
  if (from > to) return null
  const inside = (date: string) => date >= from && date <= to
  const partial = from !== start || to !== end
  const checkedAt = Date.parse(bundle.fetchedAt)
  const sameSchoolDay = Number.isFinite(checkedAt) && schoolClock(new Date(checkedAt)).date === today
  const events = bundle.events.filter(event => inside(event.date))
  const committeeEvents = bundle.committeeEvents.filter(event => inside(event.date))
  const changes = bundle.timetableChanges.filter(change => {
    const a = change.originalDate
    const b = change.replacementDate || a
    return (a <= to && b >= from) || (b <= to && a >= from)
  })
  const overrides = (bundle.timetableOverrides ?? []).filter(rule => inside(rule.date) || inside(rule.sourceDate))
  const teacher = bundle.teacherTimetable
  const pulled = teacher?.pulledLessons ?? []
  // A move can bring a lesson into this window from an earlier date.
  const effective = effectiveMobilePulledLessons(pulled, bundle.timetableOverrides ?? [])
  const teacherTimetable = teacher && { ...teacher, pulledLessons: pulled.filter((lesson, i) =>
    inside(effective[i].date) || inside(lesson.date) || inside(lesson.originalDate)) }
  const timetable = snapshot.timetable && teacherTimetable ? { ...snapshot.timetable, teachers: [teacherTimetable] } : null
  const attendanceSummaries = sameSchoolDay && inside(today)
    ? (bundle.attendanceSummaries ?? []).filter(row => row.date === today && row.sourceDate === today).map(summaryOnly)
    : []
  const meals = (bundle.meals ?? (sameSchoolDay ? bundle.todayMeals : [])).filter(meal => inside(meal.date))
  const todayMeals = inside(today) ? meals.filter(meal => meal.date === today) : []
  const counts: Record<MobileResourceKey, number> = {
    weekly: 0, creative: 0, gateDuty: 0, mealDuty: 0,
    timetable: teacherTimetable ? 1 : 0, committee: committeeEvents.length, changes: changes.length,
    overrides: overrides.length, meals: meals.length, attendance: attendanceSummaries.length,
  }
  for (const event of events) counts[event.source === 'schoolEvent' ? 'creative' : event.source]++
  const sourceStatus: MobileResourceStatusMap = {}
  for (const key of Object.keys(counts) as MobileResourceKey[]) {
    const old = bundle.sourceStatus?.[key]
    const staleAttendance = key === 'attendance' && inside(today) && !sameSchoolDay
    const unavailable = old?.state === 'unavailable' || staleAttendance
    sourceStatus[key] = {
      ...old, state: unavailable ? 'unavailable' : 'cached', mode: 'device-cache',
      lastAttemptAt: old?.lastAttemptAt ?? bundle.fetchedAt,
      lastSuccessAt: unavailable ? undefined : old?.lastSuccessAt ?? bundle.fetchedAt,
      itemCount: counts[key],
    }
  }
  const data: DashboardPayload = {
    ...snapshot, offlineRange: { from, to }, timetable, committees: { events: committeeEvents }, changes,
    bundle: {
      ...bundle, events, teacherTimetable, committeeEvents, timetableChanges: changes, timetableOverrides: overrides,
      attendanceSummaries, meals, todayMeals, sourceStatus,
      revision: !partial && from === saved.from && to === saved.to && sameSchoolDay ? bundle.revision : undefined,
    },
  }
  return { data, from, to, partial }
}
