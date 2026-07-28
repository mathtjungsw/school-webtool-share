/**
 * 업무알리미 — NEIS Open API 기반 미결 알림 모니터링
 *
 * 실제 NEIS/에듀파인 업무포털은 ActiveX+공인인증서로 Playwright 자동화가
 * 불가능하므로, NEIS Open API를 통해 "오늘의 학사일정" 항목 수를 미결
 * 알림 대용으로 표시한다. 추후 API 확장 시 교체 지점으로 사용한다.
 */
import { BrowserWindow } from 'electron'

export interface PortalResult {
  neisPending: number
  edufaiPending: number
  timestamp: string
  error?: string
}

let monitorInterval: ReturnType<typeof setInterval> | null = null
let isRunning = false

async function checkNeis(schoolHubUrl: string): Promise<PortalResult> {
  try {
    const today = new Date()
    const ymd = today.toISOString().slice(0, 10).replace(/-/g, '')

    const endpoint = new URL(schoolHubUrl)
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com') {
      throw new Error('학교 공유 서비스 URL이 올바르지 않습니다.')
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({
        action: 'neisQuery',
        endpoint: 'SchoolSchedule',
        params: { AA_YMD: ymd },
      }),
    })
    if (!res.ok) throw new Error(`학교 공유 서비스 HTTP ${res.status}`)
    const payload = await res.json() as { ok?: boolean; data?: unknown[]; error?: string }
    if (!payload.ok) throw new Error(payload.error || 'NEIS 학사일정을 확인하지 못했습니다.')
    const count = Array.isArray(payload.data) ? payload.data.length : 0

    return {
      neisPending: count,
      edufaiPending: 0, // 에듀파인은 Open API 미지원
      timestamp: new Date().toISOString(),
    }
  } catch (err) {
    return {
      neisPending: 0,
      edufaiPending: 0,
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function startMonitoring(
  win: BrowserWindow,
  config: {
    schoolHubUrl?: string
    intervalMinutes: number
  }
) {
  if (isRunning) stopMonitoring()
  isRunning = true

  const run = async () => {
    const result = await checkNeis(config.schoolHubUrl ?? '')
    if (!win.isDestroyed()) win.webContents.send('notifier:result', result)
  }

  // intervalMinutes === 0 → 즉시 1회 실행 (지금 확인 버튼)
  run()
  if (config.intervalMinutes > 0) {
    monitorInterval = setInterval(run, config.intervalMinutes * 60 * 1000)
  } else {
    isRunning = false
  }
}

export function stopMonitoring() {
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null }
  isRunning = false
}

export function isMonitoringActive(): boolean {
  return isRunning
}
