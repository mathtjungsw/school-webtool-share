import { net } from 'electron'

export interface SystemNetworkOptions {
  attempts?: number
  timeoutMs?: number
}

const wait = (delayMs: number) => new Promise(resolve => setTimeout(resolve, delayMs))

/**
 * Electron의 Chromium 네트워크 스택을 사용한다.
 * 학교 유선망의 Windows 시스템 프록시와 인증서를 따르며, 조회 요청만 안전하게 재시도한다.
 */
export async function fetchWithSystemNetwork(
  url: string,
  init: RequestInit = {},
  options: SystemNetworkOptions = {},
) {
  const attempts = Math.max(1, options.attempts ?? 3)
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 15_000)
  let lastError: unknown = null
  let lastResponse: Response | null = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await net.fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: init.redirect ?? 'follow',
      })
      lastResponse = response
      const retryableStatus = response.status === 408 || response.status === 429 || response.status >= 500
      if (!retryableStatus || attempt === attempts) return response
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
    } finally {
      clearTimeout(timer)
    }

    await wait(attempt === 1 ? 350 : 900)
  }

  if (lastResponse) return lastResponse
  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '')
  throw new Error(`외부 공개 자료에 연결할 수 없습니다.${detail ? ` (${detail})` : ''}`)
}
