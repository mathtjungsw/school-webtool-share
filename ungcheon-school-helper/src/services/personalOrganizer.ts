export type PersonalTaskPriority = 'low' | 'normal' | 'high'

export interface PersonalTask {
  id: string
  title: string
  date: string
  time?: string
  endTime?: string
  priority: PersonalTaskPriority
  completed: boolean
  memo?: string
  kind?: 'schedule' | 'task'
  category?: string
  showOnCalendar?: boolean
  scope?: 'personal' | 'department' | 'school'
  createdAt: string
  updatedAt: string
}

const TASKS_KEY = 'personal.organizer.tasks.v1'
const MEMO_KEY = 'personal.organizer.memo.v1'
const CHANGE_EVENT = 'ungcheon:personal-organizer-change'

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeTask(value: unknown): PersonalTask | null {
  if (!value || typeof value !== 'object') return null
  const task = value as Partial<PersonalTask>
  if (typeof task.id !== 'string' || typeof task.title !== 'string' || !isDate(task.date)) return null
  const now = new Date().toISOString()
  const time = typeof task.time === 'string' && /^\d{2}:\d{2}$/.test(task.time) ? task.time : undefined
  const endTime = time && typeof task.endTime === 'string' && /^\d{2}:\d{2}$/.test(task.endTime)
    && task.endTime > time ? task.endTime : undefined
  return {
    id: task.id,
    title: task.title.trim(),
    date: task.date,
    time,
    endTime,
    priority: task.priority === 'high' || task.priority === 'low' ? task.priority : 'normal',
    completed: Boolean(task.completed),
    memo: typeof task.memo === 'string' ? task.memo : '',
    kind: task.kind === 'schedule' ? 'schedule' : 'task',
    category: typeof task.category === 'string' ? task.category : '',
    showOnCalendar: task.showOnCalendar !== false,
    scope: task.scope === 'department' || task.scope === 'school' ? task.scope : 'personal',
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : now,
    updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : now,
  }
}

export function sortPersonalTasks(tasks: PersonalTask[]) {
  return [...tasks].sort((a, b) =>
    a.date.localeCompare(b.date)
      || (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
      || Number(a.completed) - Number(b.completed)
      || a.title.localeCompare(b.title, 'ko'),
  )
}

export async function loadPersonalTasks(): Promise<PersonalTask[]> {
  try {
    const saved = window.electron
      ? await window.electron.configGet(TASKS_KEY)
      : JSON.parse(localStorage.getItem(TASKS_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return sortPersonalTasks(saved.map(normalizeTask).filter((task): task is PersonalTask => Boolean(task?.title)))
  } catch {
    return []
  }
}

export async function savePersonalTasks(tasks: PersonalTask[]): Promise<PersonalTask[]> {
  const normalized = sortPersonalTasks(tasks.map(normalizeTask).filter((task): task is PersonalTask => Boolean(task?.title)))
  if (window.electron) await window.electron.configSet(TASKS_KEY, normalized)
  else localStorage.setItem(TASKS_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { kind: 'tasks', value: normalized } }))
  return normalized
}

export async function loadPersonalMemo(): Promise<string> {
  try {
    const saved = window.electron
      ? await window.electron.configGet(MEMO_KEY)
      : localStorage.getItem(MEMO_KEY)
    return typeof saved === 'string' ? saved : ''
  } catch {
    return ''
  }
}

export async function savePersonalMemo(memo: string): Promise<void> {
  if (window.electron) await window.electron.configSet(MEMO_KEY, memo)
  else localStorage.setItem(MEMO_KEY, memo)
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { kind: 'memo', value: memo } }))
}

export function createPersonalTaskId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `personal-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function subscribePersonalOrganizer(
  listener: (change: { kind: 'tasks'; value: PersonalTask[] } | { kind: 'memo'; value: string }) => void,
) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (detail?.kind === 'tasks' && Array.isArray(detail.value)) listener(detail)
    if (detail?.kind === 'memo' && typeof detail.value === 'string') listener(detail)
  }
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}
