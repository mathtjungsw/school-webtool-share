import { addDays, addWeeks, format, getISOWeek, parseISO } from 'date-fns'
import type {
  CollectionCampaign,
  DensityEvent,
  DutyAssignment,
  FacilityReservation,
  FutureOperationsState,
  NotificationCategory,
  OperationsNotification,
  RecurrenceKind,
} from './types'

export const localId = (prefix: string): string =>
  typeof crypto.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const todayText = (): string => format(new Date(), 'yyyy-MM-dd')

const minuteValue = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function reservationConflicts(
  candidate: Pick<FacilityReservation, 'resourceName' | 'date' | 'startTime' | 'endTime'>,
  reservations: FacilityReservation[],
): FacilityReservation[] {
  const start = minuteValue(candidate.startTime)
  const end = minuteValue(candidate.endTime)
  return reservations.filter(item =>
    item.resourceName.trim().toLocaleLowerCase('ko-KR') === candidate.resourceName.trim().toLocaleLowerCase('ko-KR')
      && item.date === candidate.date
      && start < minuteValue(item.endTime)
      && end > minuteValue(item.startTime),
  )
}

export function makeRecurringDates(startDate: string, recurrence: RecurrenceKind, count: number): string[] {
  const safeCount = Math.max(1, Math.min(Number.isFinite(count) ? count : 1, 20))
  const start = parseISO(startDate)
  return Array.from({ length: recurrence === 'once' ? 1 : safeCount }, (_, index) => {
    const date = recurrence === 'daily' ? addDays(start, index) : recurrence === 'weekly' ? addWeeks(start, index) : start
    return format(date, 'yyyy-MM-dd')
  })
}

const audienceKey = (item: DensityEvent): string => `${item.grade.trim()}-${item.className.trim() || '전체'}`

export interface DensityWarning {
  severity: 'notice' | 'warning'
  label: string
  count: number
}

export function densityWarnings(item: DensityEvent, events: DensityEvent[]): DensityWarning[] {
  const audience = audienceKey(item)
  const sameAudience = events.filter(event => audienceKey(event) === audience)
  const sameDay = sameAudience.filter(event => event.date === item.date).length
  const targetDate = parseISO(item.date)
  const sameWeek = sameAudience.filter(event => {
    const date = parseISO(event.date)
    return date.getFullYear() === targetDate.getFullYear() && getISOWeek(date) === getISOWeek(targetDate)
  }).length
  const warnings: DensityWarning[] = []
  if (sameDay >= 3) warnings.push({ severity: 'warning', label: '하루 일정이 3건 이상입니다.', count: sameDay })
  else if (sameDay >= 2) warnings.push({ severity: 'notice', label: '같은 날 일정이 2건입니다.', count: sameDay })
  if (sameWeek >= 5) warnings.push({ severity: 'warning', label: '이번 주 일정이 5건 이상입니다.', count: sameWeek })
  return warnings
}

export function collectionProgress(campaign: CollectionCampaign) {
  const submitted = new Set(campaign.responses.map(item => item.respondentName))
  const pending = campaign.targetNames.filter(name => !submitted.has(name))
  return { submitted: campaign.targetNames.length - pending.length, pending }
}

export function balancedDutyAssignments(
  dutyName: string,
  dates: string[],
  assigneeNames: string[],
  existing: DutyAssignment[],
  startTime: string,
  location: string,
): DutyAssignment[] {
  const uniqueNames = Array.from(new Set(assigneeNames.map(name => name.trim()).filter(Boolean)))
  if (!uniqueNames.length) return []
  const counts = new Map(uniqueNames.map(name => [name, existing.filter(item => item.assigneeName === name).length]))
  return dates.filter(Boolean).sort().map(date => {
    const assigneeName = [...uniqueNames].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a.localeCompare(b, 'ko'))[0]
    counts.set(assigneeName, (counts.get(assigneeName) ?? 0) + 1)
    return {
      id: localId('duty'), dutyName, date, startTime, location, assigneeName, createdAt: new Date().toISOString(),
    }
  })
}

export function localOperationalNotifications(state: FutureOperationsState): OperationsNotification[] {
  const now = new Date().toISOString()
  const collectionItems = state.collections.map<OperationsNotification>(item => {
    const progress = collectionProgress(item)
    return {
      id: `collection:${item.id}`,
      source: 'collection',
      category: progress.pending.length ? 'action' : 'done',
      title: item.title,
      summary: progress.pending.length ? `미응답 ${progress.pending.length}명 · 응답 ${progress.submitted}명` : '모든 대상자가 응답했습니다.',
      dueAt: item.deadline,
      createdAt: item.createdAt,
      readAt: '', snoozedUntil: '',
    }
  })
  const handoverItems = state.handoverTemplates.filter(item => !item.successorConfirmedAt).map<OperationsNotification>(item => ({
    id: `handover:${item.id}`,
    source: 'handover', category: 'action', title: `인수인계 확인 · ${item.title}`,
    summary: item.successorName ? `${item.successorName} 확인 대기` : '후임자를 지정해 주세요.',
    dueAt: item.targetMonthDay, createdAt: item.createdAt, readAt: '', snoozedUntil: '',
  }))
  const reservationItems = state.reservations.filter(item => item.date >= todayText()).slice(0, 10).map<OperationsNotification>(item => ({
    id: `reservation:${item.id}`,
    source: 'reservation', category: 'reference', title: `${item.resourceName} 예약`,
    summary: `${item.date} ${item.startTime}~${item.endTime} · ${item.title}`,
    dueAt: `${item.date}T${item.startTime}`, createdAt: item.createdAt, readAt: '', snoozedUntil: '',
  }))
  const persisted = new Map(state.notifications.map(item => [item.id, item]))
  return [...collectionItems, ...handoverItems, ...reservationItems].map(item => ({
    ...item,
    readAt: persisted.get(item.id)?.readAt ?? '',
    snoozedUntil: persisted.get(item.id)?.snoozedUntil ?? '',
  })).filter(item => !item.snoozedUntil || item.snoozedUntil <= now)
}

export function notificationCounts(items: OperationsNotification[]): Record<NotificationCategory, number> {
  return items.reduce<Record<NotificationCategory, number>>((counts, item) => {
    counts[item.category] += 1
    return counts
  }, { action: 0, reference: 0, done: 0 })
}

