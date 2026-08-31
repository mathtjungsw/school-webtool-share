import { UNGCHEON_PERIOD_PLAN } from './ungcheonSchedule'

export interface WidgetTimedEvent {
  id: string
  date: string
  title: string
  kind: string
  startTime?: string
  endTime?: string
  allDay?: boolean
  location?: string
  meta?: string
}
export interface WidgetTimedLesson { period: number; value: string; badge?: string }
export interface NormalizedWidgetTimedEvent extends WidgetTimedEvent {
  key: string
  start: number
  end: number
  point: boolean
  lane: number
  timeLabel: string
}
export interface WidgetTimedPiece {
  event: NormalizedWidgetTimedEvent
  topPercent: number
  heightPercent: number
  continuesBefore: boolean
  continuesAfter: boolean
}
export interface WidgetTimedSegment {
  id: string
  kind: 'lesson' | 'lunch' | 'break' | 'before' | 'after' | 'events'
  label: string
  start: number
  end: number
  lesson?: WidgetTimedLesson
  pieces: WidgetTimedPiece[]
  laneCount: number
}

/** Strict school-clock parsing: no guessed duration and no dates or prose. */
export function parseWidgetClock(value?: string): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1]), minute = Number(match[2])
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}
export function widgetClockLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}
function overlaps(a: NormalizedWidgetTimedEvent, b: NormalizedWidgetTimedEvent) {
  if (a.point && b.point) return a.start === b.start
  if (a.point) return b.start <= a.start && a.start < b.end
  if (b.point) return a.start <= b.start && b.start < a.end
  return a.start < b.end && b.start < a.end
}
function intersects(event: NormalizedWidgetTimedEvent, start: number, end: number) {
  return event.point ? event.start >= start && event.start < end : event.start < end && event.end > start
}

export function normalizeWidgetTimedEvents(date: string, source: readonly WidgetTimedEvent[]): NormalizedWidgetTimedEvent[] {
  const seen = new Set<string>()
  const events: NormalizedWidgetTimedEvent[] = []
  for (const event of source) {
    if (event.date !== date || event.allDay || !event.title.trim()) continue
    const start = parseWidgetClock(event.startTime)
    const hasEnd = typeof event.endTime === 'string' && Boolean(event.endTime.trim())
    const end = hasEnd ? parseWidgetClock(event.endTime) : start
    if (start === null || end === null || end < start) continue
    const key = JSON.stringify([event.id, event.date, event.title, start, end, event.kind])
    if (seen.has(key)) continue
    seen.add(key)
    events.push({ ...event, key, start, end, point: start === end, lane: 0,
      timeLabel: start === end ? widgetClockLabel(start) : `${widgetClockLabel(start)}~${widgetClockLabel(end)}` })
  }
  events.sort((a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key))
  const lanes: NormalizedWidgetTimedEvent[][] = []
  for (const event of events) {
    let lane = lanes.findIndex(items => items.every(other => !overlaps(event, other)))
    if (lane < 0) { lane = lanes.length; lanes.push([]) }
    event.lane = lane
    lanes[lane].push(event)
  }
  return events
}

/** Pure view model. The caller supplies authenticated/local data; no fetching or storage. */
export function buildWidgetTimedSchedule(input: {
  date: string
  lessons: readonly WidgetTimedLesson[]
  events: readonly WidgetTimedEvent[]
  instruction: boolean
  timetableAvailable: boolean
}): { events: NormalizedWidgetTimedEvent[]; segments: WidgetTimedSegment[] } {
  const events = normalizeWidgetTimedEvents(input.date, input.events)
  const segments: WidgetTimedSegment[] = []
  function add(kind: WidgetTimedSegment['kind'], label: string, start: number, end: number, lesson?: WidgetTimedLesson) {
    if (end <= start) return
    const pieces = events.filter(event => intersects(event, start, end)).map(event => ({
      event,
      topPercent: (Math.max(start, event.start) - start) / (end - start) * 100,
      heightPercent: event.point ? 0 : (Math.min(end, event.end) - Math.max(start, event.start)) / (end - start) * 100,
      continuesBefore: event.start < start,
      continuesAfter: !event.point && event.end > end,
    }))
    if (kind !== 'lesson' && !pieces.length) return
    segments.push({ id: `${kind}-${start}-${end}`, kind, label, start, end, lesson, pieces,
      laneCount: pieces.length ? Math.max(...pieces.map(piece => piece.event.lane)) + 1 : 0 })
  }
  if (input.instruction && input.timetableAvailable) {
    const periods = UNGCHEON_PERIOD_PLAN.slice(0, 7).map(item => ({ period: Number(item.period), start: parseWidgetClock(item.start)!, end: parseWidgetClock(item.end)! }))
    const first = periods[0].start, last = periods[periods.length - 1].end
    const before = events.filter(event => event.start < first)
    if (before.length) add('before', '수업 전', Math.min(...before.map(event => event.start)), first)
    periods.forEach((period, index) => {
      add('lesson', `${period.period}교시`, period.start, period.end, input.lessons.find(lesson => lesson.period === period.period))
      const next = periods[index + 1]
      if (next && next.start > period.end) add(period.period === 4 ? 'lunch' : 'break', period.period === 4 ? '점심' : '쉬는 시간', period.end, next.start)
    })
    const after = events.filter(event => event.point ? event.start >= last : event.end > last)
    if (after.length) add('after', '수업 후', last, Math.min(1440, Math.max(...after.map(event => event.point ? event.start + 1 : event.end))))
  } else if (events.length) {
    // No invented seven free periods on holidays, exam days or unavailable timetables.
    const start = Math.min(...events.map(event => event.start))
    const end = Math.min(1440, Math.max(...events.map(event => event.point ? event.start + 1 : event.end)))
    add('events', '시간 지정 일정', start, end)
  }
  return { events, segments }
}
