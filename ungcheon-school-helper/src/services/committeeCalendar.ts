import type { CommitteeEvent } from './schoolHub'

export interface CommitteeConflict {
  event: CommitteeEvent
  overlappingMembers: string[]
}

export interface CommitteeEventCandidate {
  date: string
  startTime: string
  endTime: string
  memberNames: string[]
}

export function findCommitteeConflicts(
  events: CommitteeEvent[],
  candidate: CommitteeEventCandidate,
): CommitteeConflict[] {
  if (!candidate.date || !candidate.startTime || !candidate.endTime) return []
  const memberSet = new Set(candidate.memberNames)
  return events
    .filter(event =>
      event.date === candidate.date &&
      candidate.startTime < event.endTime &&
      event.startTime < candidate.endTime,
    )
    .map(event => ({
      event,
      overlappingMembers: event.memberNames.filter(name => memberSet.has(name)),
    }))
    .filter(conflict => conflict.overlappingMembers.length > 0)
}

export function committeeEventDateTime(event: CommitteeEvent): Date {
  return new Date(`${event.date}T${event.startTime}:00`)
}
