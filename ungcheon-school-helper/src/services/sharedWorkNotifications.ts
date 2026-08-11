import type { StaffChecklist } from './rosterAttendance'

export type SharedWorkDeadlineCategory = 'overdue' | 'today' | 'dueSoon' | 'later' | 'complete'

const LAST_VIEWED_KEY_PREFIX = 'staffTasks.lastViewedAt.v1'
const CHANGE_EVENT = 'ungcheon:shared-work-viewed'

function storageKey(teacherName: string) {
  return `${LAST_VIEWED_KEY_PREFIX}.${encodeURIComponent(teacherName.trim())}`
}

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function today() {
  return localDate(new Date())
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`)
  value.setDate(value.getDate() + days)
  return localDate(value)
}

export function isSharedWorkComplete(task: StaffChecklist, teacherName: string) {
  const own = task.responses.find(response => response.teacherName === teacherName)
  return task.status === 'completed'
    || task.closed
    || (task.items.length > 0 && task.items.every(item => own?.checkedItemIds.includes(item.id)))
}

export function classifySharedWorkDeadline(
  task: StaffChecklist,
  teacherName: string,
  todayValue = today(),
): SharedWorkDeadlineCategory {
  if (isSharedWorkComplete(task, teacherName)) return 'complete'
  if (!task.deadline) return 'later'
  if (task.deadline < todayValue) return 'overdue'
  if (task.deadline === todayValue) return 'today'
  if (task.deadline <= addDays(todayValue, 3)) return 'dueSoon'
  return 'later'
}

export function isNewSharedWork(task: StaffChecklist, lastViewedAt: string) {
  return !lastViewedAt || task.createdAt > lastViewedAt
}

export async function loadSharedWorkLastViewedAt(teacherName: string): Promise<string> {
  if (!teacherName.trim()) return ''
  try {
    const key = storageKey(teacherName)
    const saved = window.electron
      ? await window.electron.configGet(key)
      : localStorage.getItem(key)
    return typeof saved === 'string' ? saved : ''
  } catch {
    return ''
  }
}

export async function markSharedWorkViewed(teacherName: string, viewedAt = new Date().toISOString()) {
  if (!teacherName.trim()) return
  const key = storageKey(teacherName)
  if (window.electron) {
    try {
      await window.electron.configSet(key, viewedAt)
    } catch {
      localStorage.setItem(key, viewedAt)
    }
  } else localStorage.setItem(key, viewedAt)
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { teacherName, viewedAt } }))
}

export function subscribeSharedWorkViewed(listener: (teacherName: string, viewedAt: string) => void) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (typeof detail?.teacherName === 'string' && typeof detail?.viewedAt === 'string') {
      listener(detail.teacherName, detail.viewedAt)
    }
  }
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}
