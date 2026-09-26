import type { DashboardPayload, MobileResourceKey, MobileResourceState, MobileResourceStatus } from './types'

export interface StatusSummary { state: MobileResourceState; checkedAt: string; label: string }
export const RESOURCE_LABELS: Record<MobileResourceKey, string> = {
  timetable: '교사 시간표', changes: '교체·대강', overrides: '일일 시간표 예외',
  weekly: '주간계획', creative: '창체·학사일정', gateDuty: '등교지도',
  mealDuty: '급식지도', committee: '위원회', meals: '급식', attendance: '출결',
}
export function resourceStatus(data: DashboardPayload | null, key: MobileResourceKey): MobileResourceStatus {
  return data?.bundle?.sourceStatus?.[key] ?? { state: 'unavailable', lastAttemptAt: '', itemCount: 0 }
}
export function summarizeStatus(data: DashboardPayload | null, keys: MobileResourceKey[], emptyLabel = '자료 없음'): StatusSummary {
  const statuses = keys.map(key => resourceStatus(data, key))
  // 묶음은 모든 출처에서 확인된 시각 중 가장 오래된 시각을 기준으로 한다.
  const successes = statuses.map(status => status.lastSuccessAt || '')
  const checkedAt = successes.every(Boolean) ? [...successes].sort()[0] : ''
  if (!statuses.length || statuses.some(status => status.state === 'unavailable')) return { state: 'unavailable', checkedAt, label: '확인 필요' }
  if (statuses.some(status => status.state === 'cached')) return { state: 'cached', checkedAt, label: '이전 자료' }
  if (statuses.every(status => status.state === 'empty')) return { state: 'empty', checkedAt, label: emptyLabel }
  return { state: 'fresh', checkedAt, label: '정상 조회' }
}
export function formatCheckedAt(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return '확인 기록 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value))
}
