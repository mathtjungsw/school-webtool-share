import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { loadDashboard, MobileSessionExpiredError, SESSION_EXPIRED_MESSAGE } from './api'
import { deleteUserCache, readUserCache, writeUserCache } from './cache'
import { schoolClock } from './domain'
import type { DashboardPayload } from './types'

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), loadDashboard: vi.fn(), verifyViewer: vi.fn() }))
vi.mock('./cache', () => ({ readUserCache: vi.fn(), writeUserCache: vi.fn(), deleteUserCache: vi.fn() }))

const SESSION_KEY = 'ungcheon.mobile.session.v1'
const NAME = '검증교사'
function seedSession(expiresAt = Date.now() + 72 * 60 * 60 * 1000) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ name: NAME, accessToken: 'synthetic-session-only', expiresAt }))
}
function fixture(): DashboardPayload {
  const at = new Date().toISOString()
  return { timetable: null, committees: { events: [] }, changes: [], cachedAt: at, bundle: {
    events: [{ date: schoolClock().date, source: 'weekly', title: '연결 검증 일정', label: '주간계획' }],
    teacherTimetable: null, committeeEvents: [], timetableChanges: [], meals: [], todayMeals: [], fetchedAt: at, contractVersion: 3,
  } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); seedSession()
  vi.mocked(readUserCache).mockResolvedValue(null)
  vi.mocked(writeUserCache).mockResolvedValue(undefined)
  vi.mocked(deleteUserCache).mockResolvedValue(undefined)
  vi.mocked(loadDashboard).mockResolvedValue(fixture())
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('모바일 연결 안정화 통합', () => {
  it('IndexedDB 저장 실패에도 최신 자료를 유지하고 네트워크 오류로 표시하지 않는다', async () => {
    vi.mocked(writeUserCache).mockRejectedValue(new Error('synthetic quota failure'))
    render(<App />)
    expect(await screen.findByText('연결 검증 일정')).toBeInTheDocument()
    expect(await screen.findByText(/최신 자료를 조회했지만 이 기기에 저장하지 못했습니다/)).toBeInTheDocument()
    expect(screen.queryByText(/네트워크 연결을 확인/)).not.toBeInTheDocument()
    expect(screen.queryByText(/연결이 불안정해/)).not.toBeInTheDocument()
  })

  it('캐시 읽기가 멈춰도 API 조회와 화면 갱신을 기다리게 하지 않는다', async () => {
    vi.mocked(readUserCache).mockReturnValue(new Promise(() => undefined))
    render(<App />)
    expect(await screen.findByText('연결 검증 일정')).toBeInTheDocument()
    expect(loadDashboard).toHaveBeenCalledTimes(1)
  })

  it('서버 세션 만료는 캐시 대신 로그인 화면과 명확한 만료 안내로 전환한다', async () => {
    vi.mocked(readUserCache).mockResolvedValue(fixture())
    vi.mocked(loadDashboard).mockRejectedValue(new MobileSessionExpiredError())
    render(<App />)
    expect(await screen.findByText(SESSION_EXPIRED_MESSAGE)).toBeInTheDocument()
    expect(screen.getByLabelText('공통 비밀번호')).toBeInTheDocument()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    expect(deleteUserCache).toHaveBeenCalledWith(NAME)
    expect(screen.queryByText('연결 검증 일정')).not.toBeInTheDocument()
  })

  it('네트워크 실패는 로그인 세션을 지우지 않고 마지막 정상 자료를 표시한다', async () => {
    const request = deferred<DashboardPayload>()
    vi.mocked(readUserCache).mockResolvedValue(fixture())
    vi.mocked(loadDashboard).mockReturnValue(request.promise)
    render(<App />)
    await screen.findByText('연결 검증 일정')
    await act(async () => request.reject(new TypeError('Failed to fetch')))
    expect(await screen.findByText(/연결이 불안정해 마지막 정상 조회 자료/)).toBeInTheDocument()
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
    expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument()
  })

  it('pageshow와 visibilitychange가 겹쳐도 진행 중 요청을 취소하거나 중복하지 않는다', async () => {
    const request = deferred<DashboardPayload>()
    vi.mocked(loadDashboard).mockReturnValue(request.promise)
    render(<App />)
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(1))
    const signal = vi.mocked(loadDashboard).mock.calls[0][4]
    fireEvent(window, new Event('pageshow')); fireEvent(document, new Event('visibilitychange')); fireEvent(window, new Event('online'))
    expect(loadDashboard).toHaveBeenCalledTimes(1)
    expect(signal?.aborted).toBe(false)
    await act(async () => request.resolve(fixture()))
    fireEvent(window, new Event('pageshow')); fireEvent(document, new Event('visibilitychange'))
    expect(loadDashboard).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }))
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(2))
  })

  it('로그아웃 후 도착한 응답은 화면과 캐시에 반영하지 않는다', async () => {
    const request = deferred<DashboardPayload>()
    vi.mocked(loadDashboard).mockReturnValue(request.promise)
    render(<App />)
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await act(async () => request.resolve(fixture()))
    expect(screen.getByLabelText('공통 비밀번호')).toBeInTheDocument()
    expect(screen.queryByText('연결 검증 일정')).not.toBeInTheDocument()
    expect(writeUserCache).not.toHaveBeenCalled()
  })

  it('이미 만료된 로컬 세션은 요청하지 않고 로그인 만료를 안내한다', () => {
    seedSession(Date.now() - 1)
    render(<App />)
    expect(screen.getByText(SESSION_EXPIRED_MESSAGE)).toBeInTheDocument()
    expect(loadDashboard).not.toHaveBeenCalled()
  })

  it('사용 중 72시간 세션이 만료되면 조회 중이어도 로그인 화면으로 이동한다', async () => {
    vi.useFakeTimers()
    seedSession(Date.now() + 1000)
    vi.mocked(loadDashboard).mockReturnValue(new Promise(() => undefined))
    render(<App />)
    await act(async () => { await vi.advanceTimersByTimeAsync(1001) })
    expect(screen.getByText(SESSION_EXPIRED_MESSAGE)).toBeInTheDocument()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    expect(vi.mocked(loadDashboard).mock.calls[0][4]?.aborted).toBe(true)
  })
})
