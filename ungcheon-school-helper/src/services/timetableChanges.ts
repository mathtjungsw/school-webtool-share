import type { TimetablePlanEntry } from './timetablePlan'
import { cachedHubAction, hubRequest } from './schoolHub'

export type TimetableChangeStatus = 'pending' | 'approved' | 'held' | 'rejected' | 'cancelled'
export interface TimetableChangeRequest extends TimetablePlanEntry {
  requesterName: string
  targetTeacherName: string
  status: TimetableChangeStatus
  respondedAt: string
  responderName: string
  requesterAppliedAt: string
}

export const listTimetableChanges = (viewerName: string, fromDate = '', toDate = '', includeSchool = false, force = false) =>
  cachedHubAction<TimetableChangeRequest[]>(
    `timetableChanges:${viewerName}:${fromDate}:${toDate}:${includeSchool ? 'school' : 'user'}`,
    'timetableChanges',
    { action: 'listTimetableChanges', viewerName, fromDate, toDate, includeSchool },
    force,
  )

export const createTimetableChange = (entry: TimetablePlanEntry, requesterName: string) =>
  hubRequest<TimetableChangeRequest>({ action: 'createTimetableChange', entry, requesterName })

export const respondTimetableChange = (id: string, responderName: string, decision: 'approved' | 'held') =>
  hubRequest<TimetableChangeRequest>({ action: 'respondTimetableChange', id, responderName, decision })

export const applyTimetableChangeForRequester = (id: string, requesterName: string) =>
  hubRequest<TimetableChangeRequest>({ action: 'applyTimetableChangeForRequester', id, requesterName })

export const cancelTimetableChange = (id: string, requesterName: string) =>
  hubRequest<void>({ action: 'cancelTimetableChange', id, requesterName })

export function isTimetableChangeAppliedForTeacher(item: TimetableChangeRequest, teacherName: string) {
  return item.status === 'approved' || (Boolean(item.requesterAppliedAt) && item.requesterName === teacherName)
}

export function timetableChangeSummary(item: TimetableChangeRequest) {
  const kind = item.kind === 'exchange' ? '수업 교환' : '대강'
  const originalPeriod = item.originalSlotIndex % 7 + 1
  const replacementPeriod = item.replacementSlotIndex % 7 + 1
  return item.kind === 'exchange'
    ? `${kind} · ${item.originalDate} ${originalPeriod}교시 ↔ ${item.replacementDate} ${replacementPeriod}교시 · ${item.originalClass}/${item.replacementClass}`
    : `${kind} · ${item.originalDate} ${originalPeriod}교시 · ${item.originalClass} ${item.originalSubject}`
}
