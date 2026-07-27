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

async function checkNeis(
  schoolCode: string,
  officeCode: string,
  apiKey: string
): Promise<PortalResult> {
  try {
    const today = new Date()
    const ymd = today.toISOString().slice(0, 10).replace(/-/g, '')

    // 오늘 학사일정 건수 (미확인 업무 대용)
    const url = new URL('https://open.neis.go.kr/hub/SchoolSchedule')
    if (apiKey.trim()) url.searchParams.set('KEY', apiKey.trim())
    url.searchParams.set('Type', 'json')
    url.searchParams.set('pIndex', '1')
    url.searchParams.set('pSize', '10')
    url.searchParams.set('ATPT_OFCDC_SC_CODE', officeCode)
    url.searchParams.set('SD_SCHUL_CODE', schoolCode)
    url.searchParams.set('AA_YMD', ymd)
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
    const json = await res.json() as Record<string, unknown>

    let count = 0
    const head = (json.SchoolSchedule as Array<{ head?: Array<{ RESULT?: { CODE: string }; list_total_count?: number }> }>)?.[0]?.head
    if (head) {
      const resultCode = head.find(h => h.RESULT)?.RESULT?.CODE
      if (resultCode === 'INFO-000') {
        count = head.find(h => h.list_total_count)?.list_total_count ?? 0
      }
    }

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
    schoolCode?: string
    officeCode?: string
    apiKey?: string
    intervalMinutes: number
  }
) {
  if (isRunning) stopMonitoring()
  isRunning = true

  const run = async () => {
    const result = await checkNeis(
      config.schoolCode ?? '',
      config.officeCode ?? '',
      config.apiKey ?? ''
    )
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
