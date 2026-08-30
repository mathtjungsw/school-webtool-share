import type {
  DashboardPayload,
  MobileResourceKey,
  MobileResourceStatus,
  MobileResourceStatusMap,
  MobileScheduleBundle,
} from './types'

export const SCHOOL_HUB_URL = 'https://script.google.com/macros/s/AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w/exec'

interface HubResponse<T> { ok: boolean; data?: T; error?: string; code?: string; errorCode?: string }

export const MOBILE_REQUEST_TIMEOUT_MS = 35_000
export const SESSION_EXPIRED_MESSAGE = '로그인이 만료되었습니다. 다시 로그인해 주세요.'

export class MobileSessionExpiredError extends Error {
  constructor() { super(SESSION_EXPIRED_MESSAGE); this.name = 'MobileSessionExpiredError' }
}

export class MobileRequestTimeoutError extends Error {
  constructor() { super('학교 공유 서비스 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'); this.name = 'MobileRequestTimeoutError' }
}

export function isSessionExpiredError(error: unknown): error is MobileSessionExpiredError {
  return error instanceof MobileSessionExpiredError
}

export const MOBILE_RESOURCE_KEYS: MobileResourceKey[] = ['weekly', 'creative', 'gateDuty', 'mealDuty', 'timetable', 'committee', 'changes', 'meals']

export function friendlyLoginError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (isSessionExpiredError(error)) return SESSION_EXPIRED_MESSAGE
  if (error instanceof MobileRequestTimeoutError) return error.message
  if (/공통 비밀번호가 서버에 설정되지 않았/.test(message)) return '학교 로그인 서비스 설정을 확인해야 합니다. 관리자에게 알려 주세요.'
  if (/이름|비밀번호|명렬/.test(message)) return '이름 또는 공통 비밀번호가 올바르지 않습니다.'
  if (/허용되지 않는 요청/.test(message)) return '학교 로그인 서비스가 최신 상태가 아닙니다. 관리자에게 알려 주세요.'
  if (/응답 오류/.test(message)) return '학교 로그인 서비스가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.'
  return '로그인 정보를 확인하지 못했습니다. 네트워크 연결을 확인해 주세요.'
}

export async function secureReadAction<T>(action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  if (!['verifyMobileViewer', 'getMobileScheduleBundle'].includes(action)) throw new Error('허용되지 않는 모바일 조회입니다.')
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, MOBILE_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(SCHOOL_HUB_URL, {
      method: 'POST', redirect: 'follow', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action }),
    })
    if (!response.ok) throw new Error(`학교 공유 서비스 응답 오류 (${response.status})`)
    const result = await response.json() as HubResponse<T>
    if (!result.ok) {
      const expired = result.code === 'MOBILE_SESSION_EXPIRED' || result.errorCode === 'MOBILE_SESSION_EXPIRED'
        || (action === 'getMobileScheduleBundle' && /로그인.*(만료|유효기간)|세션.*만료/.test(result.error ?? ''))
      if (expired) throw new MobileSessionExpiredError()
      throw new Error(result.error || '학교 공유 자료를 불러오지 못했습니다.')
    }
    return result.data as T
  } catch (error) {
    if (timedOut && !signal?.aborted) throw new MobileRequestTimeoutError()
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export function verifyViewer(name: string, password: string) {
  return secureReadAction<{ verified: boolean; accessToken: string; expiresAt: string }>('verifyMobileViewer', {
    viewerName: name, password,
  })
}

function countResource(bundle: MobileScheduleBundle, key: MobileResourceKey) {
  if (key === 'weekly') return bundle.events.filter(event => event.source === 'weekly').length
  if (key === 'creative') return bundle.events.filter(event => event.source === 'creative' || event.source === 'schoolEvent').length
  if (key === 'gateDuty') return bundle.events.filter(event => event.source === 'gateDuty').length
  if (key === 'mealDuty') return bundle.events.filter(event => event.source === 'mealDuty').length
  if (key === 'timetable') return bundle.teacherTimetable ? 1 : 0
  if (key === 'committee') return bundle.committeeEvents.length
  if (key === 'changes') return bundle.timetableChanges.length
  return bundle.meals !== undefined ? bundle.meals.length : bundle.todayMeals.length
}

function normalizedStatus(bundle: MobileScheduleBundle): MobileResourceStatusMap {
  const checkedAt = bundle.fetchedAt || new Date().toISOString()
  const incoming = bundle.sourceStatus ?? {}
  return Object.fromEntries(MOBILE_RESOURCE_KEYS.map(key => {
    const current = incoming[key]
    if (current) return [key, current]
    const itemCount = countResource(bundle, key)
    return [key, { state: itemCount ? 'fresh' : 'empty', mode: 'live', lastAttemptAt: checkedAt, lastSuccessAt: checkedAt, itemCount } satisfies MobileResourceStatus]
  })) as MobileResourceStatusMap
}

function normalizeBundle(bundle: MobileScheduleBundle): MobileScheduleBundle {
  const normalized: MobileScheduleBundle = {
    ...bundle,
    events: bundle.events ?? [],
    committeeEvents: bundle.committeeEvents ?? [],
    timetableChanges: bundle.timetableChanges ?? [],
    todayMeals: bundle.todayMeals ?? [],
    meals: bundle.meals ?? bundle.todayMeals ?? [],
  }
  normalized.sourceStatus = normalizedStatus(normalized)
  return normalized
}

export async function loadDashboard(name: string, accessToken: string, fromDate: string, toDate: string, signal?: AbortSignal): Promise<DashboardPayload> {
  const received = await secureReadAction<MobileScheduleBundle>('getMobileScheduleBundle', { viewerName: name, accessToken, fromDate, toDate }, signal)
  const bundle = normalizeBundle(received)
  return {
    timetable: bundle.teacherTimetable ? { version: 0, title: '교사 주간시간표', uploadedAt: bundle.sourceStatus?.timetable?.dataUpdatedAt || bundle.fetchedAt, teachers: [bundle.teacherTimetable] } : null,
    committees: { events: bundle.committeeEvents }, changes: bundle.timetableChanges,
    bundle, cachedAt: new Date().toISOString(),
  }
}

function clonePayload(payload: DashboardPayload): DashboardPayload {
  return JSON.parse(JSON.stringify(payload)) as DashboardPayload
}

function eventBelongsToResource(source: MobileScheduleBundle['events'][number]['source'], key: MobileResourceKey) {
  if (key === 'creative') return source === 'creative' || source === 'schoolEvent'
  return source === key
}

function replaceEventResource(target: MobileScheduleBundle, previous: MobileScheduleBundle, key: MobileResourceKey) {
  target.events = target.events.filter(event => !eventBelongsToResource(event.source, key))
    .concat(previous.events.filter(event => eventBelongsToResource(event.source, key)))
}

export function markDashboardCached(payload: DashboardPayload): DashboardPayload {
  const result = clonePayload(payload)
  if (!result.bundle) return result
  result.bundle = normalizeBundle(result.bundle)
  const fallbackAt = result.cachedAt || result.bundle.fetchedAt
  MOBILE_RESOURCE_KEYS.forEach(key => {
    const current = result.bundle?.sourceStatus?.[key]
    if (!current || !result.bundle?.sourceStatus) return
    result.bundle.sourceStatus[key] = {
      ...current,
      state: 'cached',
      mode: 'device-cache',
      lastAttemptAt: current.lastAttemptAt || fallbackAt,
      lastSuccessAt: current.lastSuccessAt || fallbackAt,
    }
  })
  return result
}

export function mergeDashboardWithCache(freshPayload: DashboardPayload, previousPayload: DashboardPayload | null): DashboardPayload {
  const fresh = clonePayload(freshPayload)
  if (!fresh.bundle) return fresh
  const freshBundle = normalizeBundle(fresh.bundle)
  fresh.bundle = freshBundle
  if (!previousPayload?.bundle) return fresh
  const previous = clonePayload(previousPayload)
  const previousBundle = normalizeBundle(previousPayload.bundle)
  previous.bundle = previousBundle
  const freshStatus = freshBundle.sourceStatus as MobileResourceStatusMap
  const previousStatusMap = previousBundle.sourceStatus as MobileResourceStatusMap

  MOBILE_RESOURCE_KEYS.forEach(key => {
    const status = freshStatus[key]
    const previousStatus = previousStatusMap[key]
    if (status?.state !== 'unavailable' || !previousStatus) return

    if (key === 'weekly' || key === 'creative' || key === 'gateDuty' || key === 'mealDuty') replaceEventResource(freshBundle, previousBundle, key)
    if (key === 'timetable') {
      fresh.timetable = previous.timetable
      freshBundle.teacherTimetable = previousBundle.teacherTimetable
    }
    if (key === 'committee') {
      fresh.committees = previous.committees
      freshBundle.committeeEvents = previousBundle.committeeEvents
    }
    if (key === 'changes') {
      fresh.changes = previous.changes
      freshBundle.timetableChanges = previousBundle.timetableChanges
    }
    if (key === 'meals') {
      freshBundle.meals = previousBundle.meals ?? previousBundle.todayMeals
      freshBundle.todayMeals = previousBundle.todayMeals
    }

    freshStatus[key] = {
      ...previousStatus,
      state: 'cached',
      mode: 'device-cache',
      lastAttemptAt: status.lastAttemptAt,
      lastSuccessAt: previousStatus.lastSuccessAt || previous.cachedAt,
      errorCode: status.errorCode,
    }
  })
  return fresh
}
