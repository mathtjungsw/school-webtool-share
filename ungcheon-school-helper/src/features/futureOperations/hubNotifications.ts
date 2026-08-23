import { listCommitteeState, listStaffChecklists } from '../../services/schoolHub'
import { listTimetableChanges, timetableChangeSummary } from '../../services/timetableChanges'
import type { OperationsNotification } from './types'

export async function loadHubNotifications(viewerName: string, force = false): Promise<OperationsNotification[]> {
  const name = viewerName.trim()
  if (!name) return []
  const [tasksResult, committeesResult, changesResult] = await Promise.allSettled([
    listStaffChecklists(name, '', force),
    listCommitteeState(force),
    listTimetableChanges(name, '', '', false, force),
  ])
  const now = new Date().toISOString()
  const items: OperationsNotification[] = []

  if (tasksResult.status === 'fulfilled') {
    tasksResult.value.forEach(task => {
      const response = task.responses.find(item => item.teacherName === name)
      const completed = task.items.length > 0 && response?.checkedItemIds.length === task.items.length
      items.push({
        id: `hub-task:${task.id}`,
        source: 'task',
        category: completed || task.status === 'completed' || task.closed ? 'done' : 'action',
        title: task.title,
        summary: task.description || `${task.items.length}개 확인 항목`,
        dueAt: task.deadline,
        createdAt: task.createdAt || now,
        readAt: '', snoozedUntil: '', href: 'staff-tasks',
      })
    })
  }

  if (committeesResult.status === 'fulfilled') {
    committeesResult.value.events.filter(event => event.memberNames.includes(name)).forEach(event => items.push({
      id: `hub-committee:${event.id}`,
      source: 'committee', category: 'reference', title: event.title || event.committeeName,
      summary: `${event.date} ${event.startTime}~${event.endTime}${event.location ? ` · ${event.location}` : ''}`,
      dueAt: `${event.date}T${event.startTime || '00:00'}`,
      createdAt: event.createdAt || now, readAt: '', snoozedUntil: '', href: 'school-committees',
    }))
  }

  if (changesResult.status === 'fulfilled') {
    changesResult.value.forEach(change => {
      const awaitingMe = change.status === 'pending' && change.targetTeacherName === name
      items.push({
        id: `hub-change:${change.id}`,
        source: 'timetable',
        category: awaitingMe ? 'action' : change.status === 'pending' ? 'reference' : 'done',
        title: awaitingMe ? '수업 변경 승인 요청' : '수업 변경 처리 내역',
        summary: timetableChangeSummary(change),
        dueAt: change.originalDate,
        createdAt: change.createdAt || now,
        readAt: '', snoozedUntil: '', href: 'timetable-swap',
      })
    })
  }
  return items
}

