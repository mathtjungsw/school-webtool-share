import Store from 'electron-store'

interface CacheEnvelope<T> {
  savedAt: string
  value: T
}

const scheduleCache = new Store({ name: 'external-schedule-cache' })

export function readScheduleCache<T>(key: string): T | null {
  try {
    const cached = scheduleCache.get(key) as CacheEnvelope<T> | undefined
    if (!cached || typeof cached !== 'object' || !cached.value) return null
    return cached.value
  } catch {
    return null
  }
}

export function writeScheduleCache<T>(key: string, value: T) {
  try {
    scheduleCache.set(key, { savedAt: new Date().toISOString(), value })
  } catch {
    // 로컬 캐시 저장에 실패해도 온라인 일정 조회는 계속 사용한다.
  }
}
