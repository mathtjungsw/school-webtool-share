import { useEffect, useState } from 'react'
import { readStoredSession, SESSION_KEY } from '../session'
import { SCHOOL_HUB_URL } from '../api'

export const IS_ATTENDANCE_PREVIEW = import.meta.env.MODE === 'preview'
const API = import.meta.env.MODE === 'preview' ? './attendance-lab-api/' : ''
const productionActions: Record<string, string> = { dates: 'attendanceInfo', options: 'attendanceOptions', board: 'attendanceBoard', record: 'attendanceRecord', leadership: 'attendanceLeadership' }

function mobileToken() {
  try {
    const session = readStoredSession()
    return Number(session.expiresAt) > Date.now() ? session.accessToken ?? '' : ''
  } catch { return '' }
}

export function useAttendanceToken(desktop: boolean) {
  const [token, setToken] = useState<string | null>(() => desktop ? null : mobileToken())
  useEffect(() => {
    if (!desktop) {
      let expiry: number | undefined
      const sync = () => {
        window.clearTimeout(expiry)
        const current = mobileToken()
        setToken(current)
        if (current) expiry = window.setTimeout(() => setToken(''), Math.max(0, Number(readStoredSession().expiresAt) - Date.now()))
      }
      const changed = (event: StorageEvent) => { if (event.key === SESSION_KEY || event.key === null) sync() }
      sync()
      window.addEventListener('storage', changed)
      return () => { window.clearTimeout(expiry); window.removeEventListener('storage', changed) }
    }
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'ungcheon-attendance-session') return
      const ticket = event.data.ticket
      setToken(typeof ticket === 'string' && (IS_ATTENDANCE_PREVIEW ? /^[0-9a-f]{64}$/.test(ticket) : ticket === 'desktop') ? ticket : '')
      window.clearTimeout(timeout)
    }
    const timeout = window.setTimeout(() => setToken(''), 6000)
    window.addEventListener('message', receive)
    window.parent.postMessage({ type: 'ungcheon-attendance-ready' }, '*')
    return () => { window.clearTimeout(timeout); window.removeEventListener('message', receive) }
  }, [desktop])
  return token
}

async function send(token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(API + path, { ...init, headers, cache: 'no-store' })
  if (!response.ok) {
    const details = await response.json().catch(() => null)
    throw new Error(typeof details?.error === 'string' ? details.error : '출결 서버에 연결할 수 없습니다.')
  }
  return response
}

function desktopRequest<T>(action: string, payload: Record<string, unknown>, signal: AbortSignal) {
  const id = crypto.randomUUID()
  return new Promise<T>((resolve, reject) => {
    const finish = () => { window.removeEventListener('message', receive); signal.removeEventListener('abort', abort) }
    const abort = () => { finish(); reject(new Error('출결 요청 시간이 초과되었습니다.')) }
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'ungcheon-attendance-response' || event.data.id !== id) return
      finish()
      if (event.data.error) reject(new Error(event.data.error))
      else resolve(event.data.data as T)
    }
    if (signal.aborted) { abort(); return }
    window.addEventListener('message', receive)
    signal.addEventListener('abort', abort, { once: true })
    window.parent.postMessage({ type: 'ungcheon-attendance-request', id, action, payload }, '*')
  })
}

export async function attendanceRequest<T>(token: string, path: string, init: RequestInit = {}, executiveToken = ''): Promise<T> {
  if (IS_ATTENDANCE_PREVIEW) return (await send(token, path, init)).json()
  const [name, query = ''] = path.split('?')
  const action = productionActions[name]
  if (!action) throw new Error('지원하지 않는 출결 요청입니다.')
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000)
  const payload = { ...Object.fromEntries(new URLSearchParams(query)), ...(typeof init.body === 'string' ? JSON.parse(init.body) : {}) }
  if (token === 'desktop') return desktopRequest<T>(action, payload, signal)
  const session = readStoredSession()
  if (session.accessToken !== token || !session.name || Number(session.expiresAt) <= Date.now()) throw Error('다시 로그인한 뒤 출결을 열어 주세요.')
  const response = await fetch(SCHOOL_HUB_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', cache: 'no-store', signal,
    body: JSON.stringify({ ...payload, action, viewerName: session.name, accessToken: token, executiveToken }),
  })
  if (!response.ok) throw Error('출결 서버 연결을 확인해 주세요.')
  const result = await response.json()
  if (!result.ok) throw Error(result.error || '출결을 확인할 수 없습니다.')
  return result.data as T
}

export async function listenAttendance(token: string, selection: string, signal: AbortSignal,
  receive: (event: string, value: unknown) => void, executiveToken = '') {
  if (!IS_ATTENDANCE_PREVIEW) {
    let revision = ''
    let lastUse = performance.now()
    const active = () => { lastUse = performance.now() }
    const events = ['pointerdown', 'keydown', 'focus', 'visibilitychange']
    events.forEach(event => window.addEventListener(event, active))
    try {
      while (!signal.aborted) {
        if (!revision || document.visibilityState === 'visible' && performance.now() - lastUse < 180000) {
          const requestedAt = performance.now()
          const result = await attendanceRequest<{ revision: string; notModified?: boolean }>(token, `board?${selection}&ifRevision=${revision}`, { signal }, executiveToken)
          if (!result.notModified) receive('board', { ...result, requestedAt })
          revision = result.revision
        }
        await new Promise<void>(resolve => {
          const done = () => { window.clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
          const timer = window.setTimeout(done, 45000)
          signal.addEventListener('abort', done, { once: true })
          if (signal.aborted) done()
        })
      }
    } finally { events.forEach(event => window.removeEventListener(event, active)) }
    return
  }
  const response = await send(token, `board?${selection}`, { signal })
  if (!response.body) throw new Error('출결 기록을 불러오지 못했습니다.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const [event, data] = pending.slice(0, boundary).split('\n')
        pending = pending.slice(boundary + 2)
        if (event?.startsWith('event: ') && data?.startsWith('data: ')) receive(event.slice(7), JSON.parse(data.slice(6)))
      }
    }
  } finally { await reader.cancel().catch(() => {}) }
}
