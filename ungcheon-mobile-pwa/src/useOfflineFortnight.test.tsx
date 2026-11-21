import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadDashboard, MOBILE_RESOURCE_KEYS, MobileSessionExpiredError } from './api'
import { readUserCache, writeUserCache } from './cache'
import { useOfflineFortnight } from './useOfflineFortnight'
import type { DashboardPayload, MobileResourceStatusMap } from './types'

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), loadDashboard: vi.fn() }))
vi.mock('./cache', () => ({ readUserCache: vi.fn(), writeUserCache: vi.fn() }))

const from = '2026-11-21', to = '2026-12-04'
const account = { name: '합성계정', accessToken:'synthetic-session', expiresAt: Date.now() + 86400000 }
function response(partial = false): DashboardPayload {
  const sourceStatus: MobileResourceStatusMap = Object.fromEntries(MOBILE_RESOURCE_KEYS.map(key => [key, { state:'empty', lastAttemptAt:from, itemCount:0 }]))
  if (partial) sourceStatus.weekly = { state:'unavailable', lastAttemptAt:from, itemCount:0 }
  return { timetable:null, committees:{events:[]}, changes:[], cachedAt:from, bundle:{
    teacherTimetable:null, events:[], committeeEvents:[], timetableChanges:[], todayMeals:[], fetchedAt:from, sourceStatus, revision:partial ? 'partial' : 'complete',
  } }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(readUserCache).mockResolvedValue(null)
  vi.mocked(writeUserCache).mockResolvedValue()
  vi.mocked(loadDashboard).mockResolvedValue(response())
})
afterEach(cleanup)

it('전면 조회 성공 후 14일을 한 번만 받아 고정 키에 저장한다', async () => {
  const { result, rerender } = renderHook(({ ready }) => useOfflineFortnight(account, from, ready), { initialProps:{ready:false} })
  await waitFor(() => expect(readUserCache).toHaveBeenCalledWith(account.name, 'offline-fortnight'))
  expect(loadDashboard).not.toHaveBeenCalled()
  rerender({ ready:true })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(loadDashboard).toHaveBeenCalledTimes(1)
  expect(vi.mocked(loadDashboard).mock.calls[0].slice(2, 4)).toEqual([from, to])
  expect(writeUserCache).toHaveBeenCalledWith(account.name, expect.objectContaining({ offlineRange:{from,to} }), 'offline-fortnight')
  act(() => { result.current.retry(); window.dispatchEvent(new Event('online')) })
  expect(loadDashboard).toHaveBeenCalledTimes(1)
})

it('기기 재시작 시 유효한 저장 기간을 읽고 만료까지 중복 다운로드하지 않는다', async () => {
  vi.mocked(readUserCache).mockResolvedValue({ ...response(), offlineRange:{from,to} })
  const { result, rerender } = renderHook(({ today }) => useOfflineFortnight(account,today,true), {initialProps:{today:to}})
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(loadDashboard).not.toHaveBeenCalled()
  rerender({today:'2026-12-05'})
  await waitFor(() => expect(result.current.snapshot?.offlineRange?.to).toBe('2026-12-18'))
  expect(vi.mocked(loadDashboard).mock.calls[0].slice(2, 4)).toEqual(['2026-12-05','2026-12-18'])
  expect(vi.mocked(loadDashboard).mock.calls[0][5]).toBeNull()
})

it('부분 자료를 보존하고 다시 연결할 때 누락 출처를 새로 조회한다', async () => {
  vi.mocked(loadDashboard).mockResolvedValueOnce(response(true))
  const { result } = renderHook(() => useOfflineFortnight(account,from,true))
  await waitFor(() => expect(result.current.status).toBe('partial'))
  expect(result.current.snapshot?.bundle?.revision).toBe('partial')
  act(() => { window.dispatchEvent(new Event('online')); result.current.retry() })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(loadDashboard).toHaveBeenCalledTimes(2)
  expect(vi.mocked(loadDashboard).mock.calls[1][5]).toBeNull()
})

it('계정이 바뀐 후 이전 세션의 미완료 요청으로 화면이나 캐시를 되살리지 않는다', async () => {
  let finish!: (value: DashboardPayload) => void
  vi.mocked(loadDashboard).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const { result, rerender } = renderHook(({ user }) => useOfflineFortnight(user,from,true), {initialProps:{user:account}})
  await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(1))
  const signal = vi.mocked(loadDashboard).mock.calls[0][4]
  const next = { ...account, name:'다른합성계정', accessToken:'synthetic-next' }
  rerender({ user:next })
  expect(result.current.snapshot).toBeNull()
  await act(async () => finish(response()))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(signal?.aborted).toBe(true)
  expect(vi.mocked(writeUserCache).mock.calls.map(call => call[0])).toEqual([next.name])
})

it('서버가 세션 만료를 알리면 캐시를 표시하지 않고 기존 로그아웃 흐름을 부른다', async () => {
  vi.mocked(loadDashboard).mockRejectedValueOnce(new MobileSessionExpiredError())
  const expired = vi.fn()
  const { result } = renderHook(() => useOfflineFortnight(account,from,true,expired))
  await waitFor(() => expect(expired).toHaveBeenCalledOnce())
  expect(result.current.snapshot).toBeNull()
  expect(writeUserCache).not.toHaveBeenCalled()
})
