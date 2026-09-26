import { useSyncExternalStore } from 'react'

export interface TaskFocus { id: string; kind: 'personal' | 'shared'; sequence: number }
let current: TaskFocus | null = null
const listeners = new Set<() => void>()
export function taskNavigationTarget(id: string, kind: TaskFocus['kind']) {
  return `staff_tasks?kind=${kind}&task=${encodeURIComponent(id)}`
}
export function acceptTaskNavigation(target: string): string {
  if (!target.startsWith('staff_tasks?')) return target
  const params = new URLSearchParams(target.slice(target.indexOf('?') + 1))
  const id = params.get('task') ?? ''
  if (id) {
    current = { id, kind: params.get('kind') === 'personal' ? 'personal' : 'shared', sequence: (current?.sequence ?? 0) + 1 }
    listeners.forEach(listener => listener())
  }
  return 'staff_tasks'
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function useTaskFocus() { return useSyncExternalStore(subscribe, () => current, () => null) }
export interface ChangeFocus { id: string; sequence: number }
let changeFocus: ChangeFocus | null = null
const changeListeners = new Set<() => void>()
export function acceptChangeNavigation(target: string) {
  if (!target.startsWith('timetable_swap?change=')) return target
  const id = new URLSearchParams(target.slice(target.indexOf('?') + 1)).get('change')
  if (id) { changeFocus = { id, sequence: (changeFocus?.sequence ?? 0) + 1 }; changeListeners.forEach(listener => listener()) }
  return 'timetable_swap'
}
export function useChangeFocus() { return useSyncExternalStore(listener => { changeListeners.add(listener); return () => { changeListeners.delete(listener) } }, () => changeFocus, () => null) }
