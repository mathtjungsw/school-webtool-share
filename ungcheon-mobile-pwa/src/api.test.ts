import { describe, expect, it } from 'vitest'
import { friendlyLoginError, markDashboardCached, mergeDashboardWithCache } from './api'
import type { DashboardPayload, MobileScheduleBundle } from './types'

function payload(bundle: MobileScheduleBundle): DashboardPayload {
  return { timetable: bundle.teacherTimetable ? { version:0, title:'시간표', uploadedAt:bundle.fetchedAt, teachers:[bundle.teacherTimetable] } : null, committees:{ events:bundle.committeeEvents }, changes:bundle.timetableChanges, bundle, cachedAt:bundle.fetchedAt }
}

describe('로그인 오류 안내', () => {
  it('인증 정보 오류와 서버 배포 오류를 구분한다', () => {
    expect(friendlyLoginError(new Error('교직원 명렬에 등록된 이름과 일치하지 않습니다.'))).toBe('이름 또는 공통 비밀번호가 올바르지 않습니다.')
    expect(friendlyLoginError(new Error('허용되지 않는 요청입니다.'))).toContain('최신 상태가 아닙니다')
  })

  it('실제 네트워크 오류에는 연결 안내를 표시한다', () => {
    expect(friendlyLoginError(new TypeError('Failed to fetch'))).toContain('네트워크 연결')
  })

  it('한 출처가 실패하면 그 출처만 이전 정상 자료로 보완한다', () => {
    const previous = payload({ events:[{ date:'2026-08-31', title:'주간 일정', source:'weekly', label:'교무부' }], teacherTimetable:null, committeeEvents:[], timetableChanges:[], todayMeals:[{ date:'2026-08-30', mealType:'중식', dishNames:['밥'], calories:'' }], fetchedAt:'2026-08-30T00:00:00Z' })
    const fresh = payload({ events:[], teacherTimetable:null, committeeEvents:[], timetableChanges:[], todayMeals:[], fetchedAt:'2026-08-30T01:00:00Z', sourceStatus:{ weekly:{ state:'unavailable', mode:'live', lastAttemptAt:'2026-08-30T01:00:00Z', itemCount:0, errorCode:'READ_FAILED' }, meals:{ state:'empty', mode:'live', lastAttemptAt:'2026-08-30T01:00:00Z', lastSuccessAt:'2026-08-30T01:00:00Z', itemCount:0 } } })
    const merged = mergeDashboardWithCache(fresh, previous)
    expect(merged.bundle?.events.map(event => event.title)).toContain('주간 일정')
    expect(merged.bundle?.sourceStatus?.weekly?.state).toBe('cached')
    expect(merged.bundle?.todayMeals).toEqual([])
    expect(merged.bundle?.meals).toEqual([])
    expect(merged.bundle?.sourceStatus?.meals?.state).toBe('empty')
  })

  it('이전 오늘 급식 응답을 날짜 범위 급식으로 호환한다', () => {
    const legacy = payload({ events:[], teacherTimetable:null, committeeEvents:[], timetableChanges:[], todayMeals:[{ date:'2026-08-30', mealType:'중식', dishNames:['밥'], calories:'' }], fetchedAt:'2026-08-30T00:00:00Z' })
    const normalized = mergeDashboardWithCache(legacy, null)
    expect(normalized.bundle?.meals).toEqual(legacy.bundle?.todayMeals)
  })

  it('급식 출처 실패 시 이전 날짜 범위 전체를 보완한다', () => {
    const previousMeals = [
      { date:'2026-08-30', mealType:'중식', dishNames:['밥'], calories:'' },
      { date:'2026-08-31', mealType:'중식', dishNames:['국'], calories:'' },
    ]
    const previous = payload({ events:[], teacherTimetable:null, committeeEvents:[], timetableChanges:[], meals:previousMeals, todayMeals:[previousMeals[0]], fetchedAt:'2026-08-30T00:00:00Z' })
    const fresh = payload({ events:[], teacherTimetable:null, committeeEvents:[], timetableChanges:[], meals:[], todayMeals:[], fetchedAt:'2026-08-30T01:00:00Z', sourceStatus:{ meals:{ state:'unavailable', mode:'live', lastAttemptAt:'2026-08-30T01:00:00Z', itemCount:0, errorCode:'READ_FAILED' } } })
    const merged = mergeDashboardWithCache(fresh, previous)
    expect(merged.bundle?.meals).toEqual(previousMeals)
    expect(merged.bundle?.todayMeals).toEqual([previousMeals[0]])
    expect(merged.bundle?.sourceStatus?.meals?.state).toBe('cached')
  })

  it('오프라인 캐시는 모든 출처를 이전 자료로 표시한다', () => {
    const cached = markDashboardCached(payload({ events:[], teacherTimetable:null, committeeEvents:[], timetableChanges:[], todayMeals:[], fetchedAt:'2026-08-30T00:00:00Z' }))
    expect(Object.values(cached.bundle?.sourceStatus ?? {}).every(status => status.state === 'cached')).toBe(true)
  })
})
