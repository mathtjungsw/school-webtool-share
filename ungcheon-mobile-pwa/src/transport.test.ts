import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAttendanceRoster, MOBILE_REQUEST_TIMEOUT_MS, MobileRequestTimeoutError, MobileSessionExpiredError, SCHOOL_HUB_URL, secureReadAction } from './api'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('모바일 API 전송 계약', () => {
  it('18초에는 취소하지 않고 35초에 시간초과를 구분한다', async () => {
    vi.useFakeTimers()
    let usedSignal: AbortSignal | undefined
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      usedSignal = init.signal as AbortSignal
      usedSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetcher)
    const request = secureReadAction('getMobileScheduleBundle').catch(error => error)
    await vi.advanceTimersByTimeAsync(18_000)
    expect(usedSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(MOBILE_REQUEST_TIMEOUT_MS - 18_000)
    expect(await request).toBeInstanceOf(MobileRequestTimeoutError)
  })

  it('세션 오류 code와 구버전 한국어 만료 안내를 모두 인식한다', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, code: 'MOBILE_SESSION_EXPIRED' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, error: '로그인이 만료되었거나 올바르지 않습니다.' }) })
    vi.stubGlobal('fetch', fetcher)
    await expect(secureReadAction('getMobileScheduleBundle')).rejects.toBeInstanceOf(MobileSessionExpiredError)
    await expect(secureReadAction('getMobileScheduleBundle')).rejects.toBeInstanceOf(MobileSessionExpiredError)
  })

  it('인증 정보 불일치와 네트워크 오류를 세션 만료로 바꾸지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: '이름 또는 비밀번호가 올바르지 않습니다.' }) }))
    await expect(secureReadAction('verifyMobileViewer')).rejects.not.toBeInstanceOf(MobileSessionExpiredError)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(secureReadAction('getMobileScheduleBundle')).rejects.toBeInstanceOf(TypeError)
  })

  it('허용된 모바일 조회만 고정 Apps Script POST/no-store로 전송한다', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { verified: true } }) })
    vi.stubGlobal('fetch', fetcher)
    await secureReadAction('verifyMobileViewer', { action: 'getNeisData' })
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe(SCHOOL_HUB_URL)
    expect(init.method).toBe('POST'); expect(init.cache).toBe('no-store')
    expect(JSON.parse(init.body).action).toBe('verifyMobileViewer')
    await expect(secureReadAction('getNeisData')).rejects.toThrow('허용되지 않는 모바일 조회')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('출결 상세는 선택한 날짜·교시와 로그인 교사만 별도 조회한다', async () => {
    const response = { date: '2026-09-22', period: 2, state: 'complete', flaggedCount: 0, enrolledCount: 1, courseNames: ['기하'], classrooms: ['수학실'], classStatus: [{ className: '1', complete: true }], entries: [{ className: '1', number: '2', name: '가학생', remark: '' }], mismatchCount: 0, sourceDate: '2026-09-22', checkedAt: '2026-09-22T00:00:00Z', rosterBasis: 'course-enrollment' }
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: response }) })
    vi.stubGlobal('fetch', fetcher)
    await expect(loadAttendanceRoster('검증교사', 'synthetic-token', '2026-09-22', 2)).resolves.toEqual(response)
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(body).toMatchObject({ action: 'getMobileAttendanceRoster', viewerName: '검증교사', accessToken: 'synthetic-token', date: '2026-09-22', period: 2 })
    expect(fetcher.mock.calls[0][1].cache).toBe('no-store')
  })
})
