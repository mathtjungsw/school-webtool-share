import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { loadDashboard, MobileSessionExpiredError, SESSION_EXPIRED_MESSAGE, verifyViewer } from './api'
import { deleteUserCache, readUserCache, writeUserCache } from './cache'
import { schoolClock } from './domain'
import type { DashboardPayload } from './types'

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), loadDashboard: vi.fn(), verifyViewer: vi.fn() }))
vi.mock('./cache', () => ({ readUserCache: vi.fn(), writeUserCache: vi.fn(), deleteUserCache: vi.fn(), upgradeDashboardCache: vi.fn() }))

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
function dailyRequests() {
  return vi.mocked(loadDashboard).mock.calls.filter(([, , start, end]) => start === end)
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

describe('모바일 2주 자료 미리 받기', () => {
  const today = '2026-11-21'
  const lastDay = '2026-12-04'
  const scope = 'offline-fortnight'

  function periodFixture() {
    const data = fixture()
    data.bundle!.revision = 'synthetic-fortnight-revision'
    data.bundle!.events.push({ date: lastDay, source: 'weekly', title: '마지막 날 검증 일정', label: '주간계획' })
    data.bundle!.meals = [{ date: lastDay, mealType: '중식', dishNames: ['마지막 날 검증 급식'], calories: '' }]
    return data
  }
  function periodRequests() {
    return vi.mocked(loadDashboard).mock.calls.filter(([, , start, end]) => start === today && end === lastDay)
  }
  function periodWrites() {
    return vi.mocked(writeUserCache).mock.calls.filter(([, , key]) => key === scope)
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T02:00:00Z'))
    seedSession()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('첫 로그인 때 오늘 화면을 먼저 열고, 처음 선택하는 14번째 날도 오프라인 재실행 후 표시한다', async () => {
    localStorage.removeItem(SESSION_KEY)
    vi.mocked(verifyViewer).mockResolvedValue({
      verified: true, accessToken: 'synthetic-session-only', expiresAt: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    })
    const store = new Map<string, DashboardPayload>()
    vi.mocked(writeUserCache).mockImplementation(async (name, data, key) => { store.set(name + '/' + key, structuredClone(data)) })
    vi.mocked(readUserCache).mockImplementation(async (name, key) => store.get(name + '/' + key) ?? null)
    const firstDay = deferred<DashboardPayload>()
    const fortnight = deferred<DashboardPayload>()
    vi.mocked(loadDashboard).mockImplementation(async (_, __, start, end) => {
      if (start === today && end === today) return firstDay.promise
      if (start === today && end === lastDay) return fortnight.promise
      throw Error('unexpected date range')
    })
    const view = render(<App />)
    expect(loadDashboard).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('교직원 이름'), { target: { value: NAME } })
    fireEvent.change(screen.getByLabelText('공통 비밀번호'), { target: { value: 'synthetic-password' } })
    fireEvent.click(screen.getByRole('button', { name: '내 일정 확인' }))
    await waitFor(() => expect(dailyRequests()).toHaveLength(1))
    expect(periodRequests()).toHaveLength(0)
    await act(async () => firstDay.resolve(fixture()))
    expect(await screen.findByRole('button', { name: '연결 검증 일정' })).toBeInTheDocument()
    await waitFor(() => expect(periodRequests()).toHaveLength(1))
    fireEvent(window, new Event('online'))
    fireEvent(window, new Event('pageshow'))
    expect(periodRequests()).toHaveLength(1)
    await act(async () => fortnight.resolve(periodFixture()))
    await waitFor(() => expect(periodWrites()).toHaveLength(1))
    expect(loadDashboard).toHaveBeenCalledTimes(2)
    expect(store.has(NAME + '/' + lastDay + '/' + lastDay)).toBe(false)
    view.unmount()

    const reopened = render(<App />)
    await screen.findByRole('button', { name: '연결 검증 일정' })
    await waitFor(() => expect(dailyRequests()).toHaveLength(2))
    expect(periodRequests()).toHaveLength(1)
    reopened.unmount()

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.mocked(loadDashboard).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /12\.4$/ }))
    expect(await screen.findByRole('button', { name: '마지막 날 검증 일정' })).toBeInTheDocument()
    expect(await screen.findByText('마지막 날 검증 급식')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '연결 검증 일정' })).not.toBeInTheDocument()
    expect(periodRequests()).toHaveLength(1)
  })

  it('백그라운드 다운로드가 중단되면 오늘 자료를 유지하고 재연결할 때 한 번 이어받는다', async () => {
    const firstAttempt = deferred<DashboardPayload>()
    vi.mocked(loadDashboard).mockImplementation(async (_, __, start, end) => {
      if (start === end) return fixture()
      return periodRequests().length === 1 ? firstAttempt.promise : periodFixture()
    })
    render(<App />)
    await waitFor(() => expect(periodRequests()).toHaveLength(1))
    await act(async () => firstAttempt.reject(new TypeError('connection lost')))
    expect(screen.getByRole('button', { name: '연결 검증 일정' })).toBeInTheDocument()
    expect(periodWrites()).toHaveLength(0)
    fireEvent(window, new Event('online'))
    await waitFor(() => expect(periodWrites()).toHaveLength(1))
    fireEvent(window, new Event('pageshow'))
    expect(periodRequests()).toHaveLength(2)
  })

  it('백그라운드 다운로드 중 로그아웃하면 뒤늦은 2주 응답을 기기에 저장하지 않는다', async () => {
    const fortnight = deferred<DashboardPayload>()
    vi.mocked(loadDashboard).mockImplementation(async (_, __, start, end) => start === end ? fixture() : fortnight.promise)
    render(<App />)
    await waitFor(() => expect(periodRequests()).toHaveLength(1))
    const signal = periodRequests()[0][4]
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await act(async () => fortnight.resolve(periodFixture()))
    expect(signal?.aborted).toBe(true)
    expect(deleteUserCache).toHaveBeenCalledWith(NAME)
    expect(periodWrites()).toHaveLength(0)
    expect(screen.getByLabelText('공통 비밀번호')).toBeInTheDocument()
  })
})

describe('모바일 연결 안정화 통합', () => {
  it('일정 상세를 열어 둔 상태에서 다른 탭이 계정을 바꾸면 이전 계정의 팝업을 닫는다', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name:'연결 검증 일정' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const next = { name:'교체 검증', accessToken:'different-synthetic-session', expiresAt:Date.now() + 60_000 }
    localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    fireEvent(window, new StorageEvent('storage', { key: SESSION_KEY }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleteUserCache).toHaveBeenCalledWith(NAME)
  })
  it('10월 13일 날짜별·주간 화면은 금요일 수업과 운영 안내를 표시한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T03:00:00Z'))
    seedSession()
    const data = fixture()
    data.timetable = { version: 1, title: '검증 시간표', uploadedAt: new Date().toISOString(), teachers: [{ name: NAME, label: NAME, load: '', slots: Array.from({ length: 35 }, (_, index) => ({ value: index === 28 ? '301\n금요국어' : index === 7 ? '302\n화요수학' : '', locked: false })) }] }
    vi.mocked(loadDashboard).mockResolvedValue(data)
    render(<App />)
    expect(await screen.findByText('금요국어')).toBeInTheDocument()
    expect(screen.queryByText('화요수학')).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('10월 13일(화)은 금요일 시간표로 운영합니다.')
    fireEvent.click(screen.getByRole('tab', { name: '주간 시간표' }))
    expect(await screen.findByText('금 시간표')).toBeInTheDocument()
    expect(await screen.findByText('10-13')).toBeInTheDocument()
  })

  it('주간 시간표는 실제 날짜를 표시하며 지난주와 다음 주를 오간다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T02:00:00Z'))
    seedSession()
    render(<App />)
    await screen.findByText('연결 검증 일정')
    fireEvent.click(screen.getByRole('tab', { name: '주간 시간표' }))
    expect(await screen.findByText(/^이번 주 ·/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '이전 주 시간표' }))
    expect(await screen.findByText(/^지난주 ·/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이전 주 시간표' })).toBeDisabled()
    fireEvent.click(screen.getAllByRole('button', { name: /^이번 주$/ }).at(-1)!)
    fireEvent.click(await screen.findByRole('button', { name: '다음 주 시간표' }))
    expect(await screen.findByText(/^다음 주 ·/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 주 시간표' })).toBeDisabled()
    const scopes = vi.mocked(loadDashboard).mock.calls.map(([, , start, end]) => [start, end])
    expect(scopes).toContainEqual(['2026-11-09', '2026-11-15'])
  })

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
    expect(dailyRequests()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }))
    await waitFor(() => expect(dailyRequests()).toHaveLength(2))
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
