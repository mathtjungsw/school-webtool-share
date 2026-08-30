import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardPayload } from './types'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules() })
const payload = { timetable: null, committees: { events: [] }, changes: [], bundle: null, cachedAt: '' } satisfies DashboardPayload

describe('기기 저장소 실패 경계', () => {
  it('저장소 사용이 차단되면 읽기는 null, 쓰기는 독립 오류로 종료한다', async () => {
    vi.stubGlobal('indexedDB', { deleteDatabase() { throw new Error('blocked') }, open() { throw new Error('blocked') } })
    const { readUserCache, writeUserCache } = await import('./cache')
    expect(await readUserCache('검증교사')).toBeNull()
    await expect(writeUserCache('검증교사', payload)).rejects.toThrow('기기 저장소')
  })

  it('아무 이벤트도 오지 않는 저장소는 제한 시간 안에 종료한다', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', { deleteDatabase: () => ({}), open: () => ({}) })
    const { readUserCache } = await import('./cache')
    const pending = readUserCache('검증교사')
    await vi.advanceTimersByTimeAsync(3001)
    expect(await pending).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('put의 동기 오류도 타이머와 DB 연결을 남기지 않는다', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('crypto', webcrypto)
    const close = vi.fn()
    const db = { close, transaction: () => ({ abort: vi.fn(), objectStore: () => ({ put: () => { throw new Error('synthetic quota') } }) }) }
    vi.stubGlobal('indexedDB', {
      deleteDatabase: () => { const request: Record<string, unknown> = {}; Promise.resolve().then(() => (request.onsuccess as () => void)()); return request },
      open: () => { const request: Record<string, unknown> = { result: db }; Promise.resolve().then(() => (request.onsuccess as () => void)()); return request },
    })
    const { writeUserCache } = await import('./cache')
    await expect(writeUserCache('검증교사', payload)).rejects.toThrow('synthetic quota')
    expect(close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
