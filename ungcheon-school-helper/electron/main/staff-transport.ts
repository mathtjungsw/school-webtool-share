import { net } from 'electron'

// Keep authentication on Chromium's network stack, as with school-hub requests.
// Node fetch does not share the Windows proxy/PAC and certificate configuration.
export async function fetchStaffJson(endpoint: string, payload: Record<string, unknown>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), payload.action === 'caseDocument' ? 90000 : 35000)
  try {
    let response: Response
    try {
      response = await net.fetch(endpoint, {
        method: 'POST', redirect: 'follow', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-cache' },
        body: JSON.stringify(payload), signal: controller.signal,
      })
    } catch {
      throw new Error(controller.signal.aborted
        ? '로그인 서버 응답이 지연되었습니다. 잠시 후 다시 시도해 주세요.'
        : '로그인 서버에 연결할 수 없습니다. 인터넷 연결과 학교망 프록시·보안 프로그램 설정을 확인한 뒤 다시 시도해 주세요.')
    }
    if (!response.ok) throw new Error(`로그인 서버에 연결하지 못했습니다(HTTP ${response.status}). 학교망 연결 상태를 확인해 주세요.`)
    try {
      const result = await response.json()
      if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') throw new Error('invalid response')
      return result as { ok: boolean; data?: any; error?: string; code?: string }
    } catch {
      throw new Error(controller.signal.aborted
        ? '로그인 서버 응답이 지연되었습니다. 잠시 후 다시 시도해 주세요.'
        : '로그인 서버의 응답을 확인하지 못했습니다. 학교망 보안 차단 또는 연결 상태를 확인해 주세요.')
    }
  } finally { clearTimeout(timer) }
}
