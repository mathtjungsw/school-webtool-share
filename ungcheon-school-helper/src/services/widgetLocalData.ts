/** Local-only data used by the desktop widget. No helper in this module calls a server. */

export type QuickMemoRetention = 'today' | 'until-deleted'

export interface QuickMemo {
  id: string
  text: string
  retention: QuickMemoRetention
  date: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

export interface QuickSnippet {
  id: string
  label: string
  text: string
  createdAt: string
  updatedAt: string
}

export interface WidgetLocalConfigAdapter {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
}

export interface PersonalTaskDraftFromMemo {
  title: string
  date: string
  priority: 'normal'
  completed: false
  memo: string
  kind: 'task'
  showOnCalendar: true
}

export const WIDGET_QUICK_MEMOS_KEY = 'widget.productivity.quickMemos.v1'
export const WIDGET_QUICK_SNIPPETS_KEY = 'widget.productivity.quickSnippets.v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function localYmd(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createLocalId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.()
  return random ? `${prefix}-${random}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function defaultAdapter(): WidgetLocalConfigAdapter {
  return {
    async get(key) {
      if (typeof window !== 'undefined' && window.electron?.configGet) {
        return window.electron.configGet(key)
      }
      if (typeof localStorage === 'undefined') return undefined
      const value = localStorage.getItem(key)
      if (value === null) return undefined
      try { return JSON.parse(value) } catch { return value }
    },
    async set(key, value) {
      if (typeof window !== 'undefined' && window.electron?.configSet) {
        await window.electron.configSet(key, value)
        return
      }
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value))
    },
  }
}

function normalizeMemo(value: unknown): QuickMemo | null {
  if (!isRecord(value)) return null
  const text = typeof value.text === 'string' ? value.text.trim().slice(0, 2_000) : ''
  const date = typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
    ? value.date
    : localYmd()
  if (!text) return null
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString()
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createLocalId('memo'),
    text,
    retention: value.retention === 'until-deleted' ? 'until-deleted' : 'today',
    date,
    completed: Boolean(value.completed),
    createdAt,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : createdAt,
  }
}

function normalizeSnippet(value: unknown): QuickSnippet | null {
  if (!isRecord(value)) return null
  const text = typeof value.text === 'string' ? value.text.trim().slice(0, 5_000) : ''
  if (!text) return null
  const label = typeof value.label === 'string' && value.label.trim()
    ? value.label.trim().slice(0, 40)
    : text.split(/\r?\n/)[0].slice(0, 40)
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString()
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createLocalId('snippet'),
    label,
    text,
    createdAt,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : createdAt,
  }
}

export function pruneWidgetQuickMemos(memos: readonly QuickMemo[], today = localYmd()) {
  return memos.filter(memo => memo.retention === 'until-deleted' || memo.date === today)
}

export async function loadWidgetQuickMemos(
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
  today = localYmd(),
): Promise<QuickMemo[]> {
  const value = await adapter.get(WIDGET_QUICK_MEMOS_KEY)
  if (!Array.isArray(value)) return []
  const normalized = value
    .map(normalizeMemo)
    .filter((memo): memo is QuickMemo => Boolean(memo))
  const active = pruneWidgetQuickMemos(normalized, today)
    .sort((left, right) => Number(left.completed) - Number(right.completed) || right.updatedAt.localeCompare(left.updatedAt))
  if (active.length !== normalized.length) await adapter.set(WIDGET_QUICK_MEMOS_KEY, active)
  return active
}

export async function saveWidgetQuickMemos(
  memos: readonly QuickMemo[],
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
): Promise<QuickMemo[]> {
  const normalized = memos
    .map(normalizeMemo)
    .filter((memo): memo is QuickMemo => Boolean(memo))
    .slice(0, 100)
  await adapter.set(WIDGET_QUICK_MEMOS_KEY, normalized)
  return normalized
}

export async function addWidgetQuickMemo(
  text: string,
  retention: QuickMemoRetention = 'today',
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
  date = localYmd(),
) {
  const current = await loadWidgetQuickMemos(adapter, date)
  const now = new Date().toISOString()
  const memo = normalizeMemo({
    id: createLocalId('memo'), text, retention, date, completed: false, createdAt: now, updatedAt: now,
  })
  if (!memo) return current
  return saveWidgetQuickMemos([memo, ...current], adapter)
}

export async function updateWidgetQuickMemo(
  id: string,
  patch: Partial<Pick<QuickMemo, 'text' | 'retention' | 'completed'>>,
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
) {
  const current = await loadWidgetQuickMemos(adapter)
  const updated = current.map(memo => memo.id === id
    ? normalizeMemo({ ...memo, ...patch, updatedAt: new Date().toISOString() })
    : memo)
    .filter((memo): memo is QuickMemo => Boolean(memo))
  return saveWidgetQuickMemos(updated, adapter)
}

export function toggleWidgetQuickMemo(
  id: string,
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
) {
  return loadWidgetQuickMemos(adapter).then(current => {
    const memo = current.find(item => item.id === id)
    return memo
      ? updateWidgetQuickMemo(id, { completed: !memo.completed }, adapter)
      : current
  })
}

export async function removeWidgetQuickMemo(
  id: string,
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
) {
  const current = await loadWidgetQuickMemos(adapter)
  return saveWidgetQuickMemos(current.filter(memo => memo.id !== id), adapter)
}

export function quickMemoToPersonalTaskDraft(
  memo: QuickMemo,
  date = localYmd(),
): PersonalTaskDraftFromMemo {
  const firstLine = memo.text.split(/\r?\n/)[0].trim()
  return {
    title: firstLine.slice(0, 80) || '위젯 메모',
    date,
    priority: 'normal',
    completed: false,
    memo: memo.text,
    kind: 'task',
    showOnCalendar: true,
  }
}

export async function loadWidgetQuickSnippets(
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
): Promise<QuickSnippet[]> {
  const value = await adapter.get(WIDGET_QUICK_SNIPPETS_KEY)
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeSnippet)
    .filter((snippet): snippet is QuickSnippet => Boolean(snippet))
    .sort((left, right) => left.label.localeCompare(right.label, 'ko'))
}

export async function saveWidgetQuickSnippets(
  snippets: readonly QuickSnippet[],
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
) {
  const normalized = snippets
    .map(normalizeSnippet)
    .filter((snippet): snippet is QuickSnippet => Boolean(snippet))
    .slice(0, 50)
  await adapter.set(WIDGET_QUICK_SNIPPETS_KEY, normalized)
  return normalized
}

export async function addWidgetQuickSnippet(
  label: string,
  text: string,
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
) {
  const current = await loadWidgetQuickSnippets(adapter)
  const now = new Date().toISOString()
  const snippet = normalizeSnippet({ id: createLocalId('snippet'), label, text, createdAt: now, updatedAt: now })
  if (!snippet) return current
  return saveWidgetQuickSnippets([...current, snippet], adapter)
}

export async function updateWidgetQuickSnippet(
  id: string,
  patch: Partial<Pick<QuickSnippet, 'label' | 'text'>>,
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
) {
  const current = await loadWidgetQuickSnippets(adapter)
  const updated = current.map(snippet => snippet.id === id
    ? normalizeSnippet({ ...snippet, ...patch, updatedAt: new Date().toISOString() })
    : snippet)
    .filter((snippet): snippet is QuickSnippet => Boolean(snippet))
  return saveWidgetQuickSnippets(updated, adapter)
}

export async function removeWidgetQuickSnippet(
  id: string,
  adapter: WidgetLocalConfigAdapter = defaultAdapter(),
) {
  const current = await loadWidgetQuickSnippets(adapter)
  return saveWidgetQuickSnippets(current.filter(snippet => snippet.id !== id), adapter)
}
