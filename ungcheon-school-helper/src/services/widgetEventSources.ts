import type { WeeklyPlanEvent, DutyScheduleEvent, CreativeScheduleEvent } from '../types'
import type { CommitteeEvent } from './schoolHub'
import type { PersonalTask } from './personalOrganizer'
import type { StaffChecklist } from './rosterAttendance'
import { isSharedWorkComplete } from './sharedWorkNotifications'
import { UNGCHEON_PERIOD_PLAN } from './ungcheonSchedule'
import type { WidgetTimedEvent } from './widgetTimedSchedule'

/** Existing tomorrow summaries retain untimed events; only the timetable filters them out. */
export interface WidgetEvent extends WidgetTimedEvent {
  meta: string
  time?: string
}

export function normalizeWidgetEventDate(value: string): string {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value.trim())
  if (!match) return ''
  const [, year, month, day] = match
  const date = new Date(`${year}-${month}-${day}T12:00:00`)
  return date.getFullYear() === Number(year) && date.getMonth() + 1 === Number(month)
    && date.getDate() === Number(day) ? `${year}-${month}-${day}` : ''
}

/** Only explicit clock notation is used. Dates, grade numbers and prose are not guessed. */
export function explicitWidgetTime(text: string): Pick<WidgetTimedEvent, 'startTime' | 'endTime' | 'allDay'> {
  if (/종일|하루\s*종일|00:00\s*[~～〜–—-]\s*(?:24:00|23:59)/.test(text)) return { allDay: true }
  const matches = [...text.matchAll(/(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)]
  const clock = (match: RegExpMatchArray) => `${match[1].padStart(2, '0')}:${match[2]}`
  if (matches.length === 1) return { startTime: clock(matches[0]) }
  if (matches.length === 2) {
    const between = text.slice(matches[0].index! + matches[0][0].length, matches[1].index)
    if (/^\s*(?:[~～〜–—-]|부터)\s*$/.test(between)) {
      return { startTime: clock(matches[0]), endTime: clock(matches[1]) }
    }
  }
  return {}
}

function creativeRanges(period: string): Array<{ startTime: string; endTime: string }> {
  const compact = period.replace(/교시/g, '').replace(/\s/g, '')
  if (!/^[1-7](?:[~～〜–—-][1-7]|(?:[,·][1-7])*)$/.test(compact)) return []
  const range = /^([1-7])[~～〜–—-]([1-7])$/.exec(compact)
  const numbers = range
    ? Array.from({ length: Math.max(0, Number(range[2]) - Number(range[1]) + 1) }, (_, i) => Number(range[1]) + i)
    : [...new Set(compact.split(/[,·]/).map(Number))].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const number of numbers) {
    const last = groups.at(-1)
    if (last && last.at(-1)! + 1 === number) last.push(number)
    else groups.push([number])
  }
  return groups.map(group => ({ startTime: UNGCHEON_PERIOD_PLAN[group[0] - 1].start, endTime: UNGCHEON_PERIOD_PLAN[group.at(-1)! - 1].end }))
}

export function buildWidgetSupplementEvents(date: string, sources: {
  weekly: readonly WeeklyPlanEvent[]
  duty: readonly DutyScheduleEvent[]
  creative: readonly CreativeScheduleEvent[]
}): WidgetEvent[] {
  const targetDate = normalizeWidgetEventDate(date)
  if (!targetDate) return []
  const matches = (item: { date: string }) => normalizeWidgetEventDate(item.date) === targetDate
  return [
    ...sources.weekly.filter(matches).map((item, index) => {
      const timing = explicitWidgetTime(item.eventName)
      return { id: `weekly:${targetDate}:${item.sheetName}:${item.department}:${index}`, date: targetDate,
        title: item.eventName, meta: item.department || '주간계획', kind: 'weekly', ...timing, time: timing.startTime }
    }),
    ...sources.duty.filter(matches).map((item, index) => {
      const timing = explicitWidgetTime(item.time)
      return { id: `duty:${targetDate}:${item.kind}:${item.sourceSheet}:${index}`, date: targetDate,
        title: item.title, meta: [item.time, item.location].filter(Boolean).join(' · '), kind: item.kind,
        location: item.location, ...timing, time: timing.startTime }
    }),
    ...sources.creative.filter(matches).flatMap((item, index) => {
      const explicit = explicitWidgetTime(item.title)
      const ranges = explicit.allDay ? [explicit]
        : item.kind === 'activity' ? creativeRanges(item.period) : []
      const timings = ranges.length ? ranges : [explicit]
      return timings.map((timing, part) => ({ id: `creative:${targetDate}:${item.sourceSheet}:${index}:${part}`,
        date: targetDate, title: item.title, meta: [item.period, item.grades].filter(Boolean).join(' · '),
        kind: 'creative', ...timing, time: timing.startTime }))
    }),
  ]
}

export function buildWidgetBaseEvents(date: string, sources: {
  personal: readonly PersonalTask[]
  sharedTasks: readonly StaffChecklist[]
  schoolSchedules: readonly { date: string; eventName: string }[]
  committeeEvents: readonly CommitteeEvent[]
  includeCompletedTasks?: boolean
}, teacherName: string): WidgetEvent[] {
  const targetDate = normalizeWidgetEventDate(date)
  if (!targetDate || !teacherName.trim()) return []
  return [
    ...sources.personal.filter(item => normalizeWidgetEventDate(item.date) === targetDate
      && item.showOnCalendar !== false
      && (item.kind !== 'task' || !item.completed || sources.includeCompletedTasks))
      .map(item => ({ id: `personal:${item.id}`, date: targetDate, title: item.title,
        meta: item.time ? `${item.time}${item.endTime ? `~${item.endTime}` : ''}` : (item.kind === 'task' ? '개인 업무' : '개인 일정'),
        kind: item.kind === 'task' ? 'personal-task' : 'personal-schedule',
        startTime: item.time, endTime: item.endTime, time: item.time, allDay: !item.time })),
    ...sources.sharedTasks.filter(item => normalizeWidgetEventDate(item.startTime && item.scheduledDate ? item.scheduledDate : item.deadline) === targetDate
      && item.targetNames.includes(teacherName) && !isSharedWorkComplete(item, teacherName))
      .map(item => ({ id: `shared:${item.id}`, date: targetDate, title: item.title,
        meta: item.startTime ? `배부 업무 · ${item.startTime}${item.endTime ? `~${item.endTime}` : ''}` : '배부 업무 마감',
        kind: 'shared-task', startTime: item.startTime || undefined, endTime: item.endTime || undefined,
        time: item.startTime || undefined, allDay: !item.startTime })),
    ...sources.schoolSchedules.filter(item => normalizeWidgetEventDate(item.date) === targetDate)
      .map((item, index) => ({ id: `school:${targetDate}:${index}`, date: targetDate, title: item.eventName,
        meta: '학사일정', kind: 'school', allDay: true })),
    ...sources.committeeEvents.filter(item => normalizeWidgetEventDate(item.date) === targetDate
      && item.memberNames.includes(teacherName))
      .map(item => ({ id: `committee:${item.id}`, date: targetDate, title: item.title || item.committeeName,
        meta: [item.startTime, item.location].filter(Boolean).join(' · '), kind: 'committee',
        startTime: item.startTime, endTime: item.endTime || undefined, time: item.startTime,
        location: item.location })),
  ]
}
