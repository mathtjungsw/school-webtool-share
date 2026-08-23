import type { FutureOperationsState } from './types'

const STORAGE_KEY = 'futureOperations.localState.v1'
const CHANGE_EVENT = 'ungcheon:future-operations-change'

export const EMPTY_FUTURE_OPERATIONS_STATE: FutureOperationsState = {
  version: 1,
  notifications: [],
  reservations: [],
  densityEvents: [],
  collections: [],
  dutyAssignments: [],
  handoverTemplates: [],
}

function normalizeState(value: unknown): FutureOperationsState {
  if (!value || typeof value !== 'object') return { ...EMPTY_FUTURE_OPERATIONS_STATE }
  const state = value as Partial<FutureOperationsState>
  return {
    version: 1,
    notifications: Array.isArray(state.notifications) ? state.notifications : [],
    reservations: Array.isArray(state.reservations) ? state.reservations : [],
    densityEvents: Array.isArray(state.densityEvents) ? state.densityEvents : [],
    collections: Array.isArray(state.collections) ? state.collections : [],
    dutyAssignments: Array.isArray(state.dutyAssignments) ? state.dutyAssignments : [],
    handoverTemplates: Array.isArray(state.handoverTemplates) ? state.handoverTemplates : [],
  }
}

export async function loadFutureOperationsState(): Promise<FutureOperationsState> {
  try {
    const raw = window.electron
      ? await window.electron.configGet(STORAGE_KEY)
      : JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return normalizeState(raw)
  } catch {
    return { ...EMPTY_FUTURE_OPERATIONS_STATE }
  }
}

export async function saveFutureOperationsState(state: FutureOperationsState): Promise<FutureOperationsState> {
  const normalized = normalizeState(state)
  if (window.electron) await window.electron.configSet(STORAGE_KEY, normalized)
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: normalized }))
  return normalized
}

export function subscribeFutureOperations(listener: (state: FutureOperationsState) => void): () => void {
  const handler = (event: Event) => listener(normalizeState((event as CustomEvent).detail))
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

