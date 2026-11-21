import { useCallback, useEffect, useRef, useState } from 'react'
import { addDays, format } from 'date-fns'
import { isSessionExpiredError, loadDashboard, mergeDashboardWithCache, MOBILE_RESOURCE_KEYS } from './api'
import { readUserCache, writeUserCache } from './cache'
import { projectOfflineRange } from './offlineRange'
import type { DashboardPayload } from './types'

interface OfflineSession { name: string; accessToken: string; expiresAt: number }
type OfflineStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'unavailable'
interface SnapshotState {
  account: OfflineSession
  snapshot: DashboardPayload | null
  status: OfflineStatus
}

const scope = 'offline-fortnight'
const retryInterval = 5 * 60 * 1000

function sameSession(left: OfflineSession | null | undefined, right: OfflineSession | null) {
  return Boolean(left && right && left.name === right.name && left.accessToken === right.accessToken && left.expiresAt === right.expiresAt)
}

function complete(snapshot: DashboardPayload | null) {
  const sources = snapshot?.bundle?.sourceStatus
  return MOBILE_RESOURCE_KEYS.every(key => sources?.[key]?.state === 'fresh' || sources?.[key]?.state === 'empty')
}

/** An exact, authenticated 14-day server response. Display projections must not reuse its revision for other ranges. */
export function useOfflineFortnight(session: OfflineSession | null, today: string, foregroundReady: boolean, onSessionExpired?: () => void) {
  const [state, setState] = useState<SnapshotState | null>(null)
  const active = useRef<{ retry: () => void; cancel: () => void } | null>(null)
  const latest = useRef({ session, today, foregroundReady, onSessionExpired })
  latest.current = { session, today, foregroundReady, onSessionExpired }
  const name = session?.name, accessToken = session?.accessToken, expiresAt = session?.expiresAt

  useEffect(() => {
    if (!name || !accessToken || !expiresAt || expiresAt <= Date.now()) return
    const account = { name, accessToken, expiresAt }
    const controller = new AbortController()
    let snapshot: DashboardPayload | null = null
    let initialized = false, foregroundSeen = false, running = false, needsSave = false
    const valid = () => !controller.signal.aborted && latest.current.today === today &&
      sameSession(account, latest.current.session) && Date.now() < expiresAt
    const publish = (status: OfflineStatus) => {
      if (valid()) setState({ account, snapshot, status })
    }
    const cancel = () => { controller.abort(); setState(null) }

    async function retry() {
      if (!valid() || running) return
      foregroundSeen ||= latest.current.foregroundReady
      if (!initialized || !foregroundSeen) return
      const range = snapshot?.offlineRange
      const covered = Boolean(range && range.from <= today && today <= range.to)
      const alreadyComplete = covered && complete(snapshot)
      if (alreadyComplete && !needsSave) return
      running = true
      try {
        if (needsSave && snapshot) {
          try {
            await writeUserCache(account.name, snapshot, scope)
            needsSave = false
          } catch {
            if (alreadyComplete || !navigator.onLine) { publish('partial'); return }
          }
          if (!valid()) return
          if (alreadyComplete) { publish('ready'); return }
        }
        if (!navigator.onLine) { publish(snapshot ? 'partial' : 'unavailable'); return }
        publish(snapshot ? 'partial' : 'loading')
        const from = covered && range ? range.from : today
        const to = covered && range ? range.to : format(addDays(new Date(today + 'T12:00:00'), 13), 'yyyy-MM-dd')
        const previous = covered ? snapshot : null
        // A partial snapshot must fetch the missing sources, even if the other data is unchanged.
        const fresh = await loadDashboard(account.name, account.accessToken, from, to, controller.signal, null)
        if (!valid()) return
        const prior = projectOfflineRange(previous, from, to, today)?.data ?? null
        const merged = { ...mergeDashboardWithCache(fresh, prior), offlineRange: { from, to } }
        const bounded = projectOfflineRange(merged, from, to, today)?.data
        if (!bounded?.bundle || !merged.bundle) throw new Error('저장할 일정 범위를 확인할 수 없습니다.')
        // Store only these dates, retaining the actual server status for completion and retry.
        bounded.bundle.sourceStatus = merged.bundle.sourceStatus
        snapshot = bounded
        needsSave = true
        await writeUserCache(account.name, snapshot, scope)
        if (!valid()) return
        needsSave = false
        publish(complete(snapshot) ? 'ready' : 'partial')
      } catch (error) {
        if (!valid()) return
        if (isSessionExpiredError(error)) {
          cancel()
          latest.current.onSessionExpired?.()
        } else publish(snapshot ? 'partial' : 'unavailable')
      } finally { running = false }
    }

    const requestRetry = () => { void retry() }
    const onVisible = () => { if (document.visibilityState === 'visible') requestRetry() }
    active.current = { retry: requestRetry, cancel }
    const expire = window.setTimeout(() => {
      if (!controller.signal.aborted && sameSession(account, latest.current.session)) {
        cancel()
        latest.current.onSessionExpired?.()
      }
    }, expiresAt - Date.now())
    const interval = window.setInterval(onVisible, retryInterval)
    window.addEventListener('online', requestRetry)
    window.addEventListener('pageshow', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    void (async () => {
      let cached: DashboardPayload | null = null
      try { cached = await readUserCache(account.name, scope) } catch { /* Remote prefetch can still proceed. */ }
      if (!valid()) return
      const range = cached?.offlineRange
      if (cached?.bundle && range?.from && range.to) snapshot = cached
      initialized = true
      publish(snapshot && range && range.from <= today && today <= range.to && complete(snapshot) ? 'ready' : snapshot ? 'partial' : 'idle')
      requestRetry()
    })()

    return () => {
      controller.abort()
      active.current = null
      window.clearTimeout(expire)
      window.clearInterval(interval)
      window.removeEventListener('online', requestRetry)
      window.removeEventListener('pageshow', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [name, accessToken, expiresAt, today])
  useEffect(() => { if (foregroundReady) active.current?.retry() }, [foregroundReady])
  const retry = useCallback(() => active.current?.retry(), [])
  const cancel = useCallback(() => active.current?.cancel(), [])
  const visible = sameSession(state?.account, session) && session!.expiresAt > Date.now() ? state : null
  return { snapshot: visible?.snapshot ?? null, status: visible?.status ?? 'idle', retry, cancel }
}
