import { describe, expect, it } from 'vitest'
import { projectOfflineRange } from './offlineRange'
import { timetableForDate } from './domain'
import type { DailyTimetableOverride, DashboardPayload, MobileAttendanceSummary, PulledLesson, TimetableChange } from './types'

const monday = '2026-11-16'
const tuesday = '2026-11-17'
const friday = '2026-11-20'
const end = '2026-11-29'
const fetched = '2026-11-16T15:05:00Z' // Tuesday in Korea.
const meal = (date: string) => ({ date, mealType: '중식', dishNames: ['가상 메뉴'], calories: '' })
const change = (originalDate: string, replacementDate: string): TimetableChange => ({
  id: originalDate, kind: 'exchange', status: 'approved', originalDate, replacementDate,
  requesterName: '교사', targetTeacherName: '다른교사', originalTeacher: '교사', replacementTeacher: '다른교사',
  requesterAppliedAt: '', originalClass: '1-1', replacementClass: '1-2', originalSubject: '국어', replacementSubject: '영어',
  originalSlotIndex: 0, replacementSlotIndex: 1,
})
const rule: DailyTimetableOverride = {
  id: 'move', date: friday, targetGrade: '1', targetClass: '', targetPeriod: 2, action: 'move_pulled',
  sourceDate: monday, sourcePeriod: 1, note: '', active: true, createdBy: '', createdAt: '', updatedAt: '',
}
const pulled: PulledLesson = {
  id: 'lesson', date: monday, period: 1, classLabel: '1-1', subject: '국어', teacherName: '교사',
  originalTeacherName: '교사', substituteTeacherName: '', originalSlot: '월1', originalDate: monday, note: '', sourceRow: 1,
}
const attendance: MobileAttendanceSummary = {
  date: tuesday, sourceDate: tuesday, checkedAt: fetched, flaggedCount: 1, period: 1, state: 'complete',
  enrolledCount: 3, courseNames: [], classrooms: [], classStatus: [], entries: [{ className: '1', number: '2', name: '가상학생', remark: '자습' }],
  rosterBasis: 'course-enrollment', mismatchCount: 0,
}
function snapshot(): DashboardPayload {
  const teacher = { name: '교사', label: '교사', load: '', slots: Array.from({ length: 35 }, () => ({ value: '', locked: false })), pulledLessons: [pulled] }
  const committees = [monday, tuesday].map(date => ({ id: date, date, committeeName: '위원회', title: '회의', startTime: '', endTime: '', location: '', memberNames: ['교사'] }))
  const changes = [change(friday, monday), change(end, end)]
  return {
    offlineRange: { from: monday, to: end }, cachedAt: fetched,
    timetable: { version: 1, uploadedAt: fetched, title: '', teachers: [teacher] }, committees: { events: committees }, changes,
    bundle: {
      revision: 'wide-revision', fetchedAt: fetched, teacherTimetable: teacher, timetableChanges: changes, committeeEvents: committees,
      events: [monday, tuesday, end].map(date => ({ date, source: 'weekly', title: '일정', label: '' })),
      attendanceSummaries: [attendance], meals: [meal(monday), meal(tuesday), meal(friday)], todayMeals: [meal(tuesday)], timetableOverrides: [rule],
      sourceStatus: { creative: { state: 'unavailable', itemCount: 0, lastAttemptAt: fetched } },
    },
  }
}

describe('교사별 오프라인 일정 범위', () => {
  it('하루의 자료와 관련된 교환만 남기고 전체 범위 버전과 출결 비고를 제외한다', () => {
    const saved = snapshot()
    const projection = projectOfflineRange(saved, tuesday, tuesday, tuesday)!
    expect(projection).toMatchObject({ from: tuesday, to: tuesday, partial: false })
    const { bundle, committees, changes } = projection.data
    expect(bundle?.events.map(event => event.date)).toEqual([tuesday])
    expect(committees.events).toEqual(bundle?.committeeEvents)
    expect(committees.events).toHaveLength(1)
    expect(changes).toEqual([change(friday, monday)])
    expect(bundle?.revision).toBeUndefined()
    expect(bundle?.attendanceSummaries?.[0]).toMatchObject({ entries: [], selfStudyCount: 1 })
    expect(bundle?.sourceStatus?.creative?.state).toBe('unavailable')
    expect(bundle?.sourceStatus?.weekly).toMatchObject({ state: 'cached', itemCount: 1 })
    expect(bundle?.todayMeals).toEqual([meal(tuesday)])
    expect(saved.bundle?.attendanceSummaries?.[0].entries[0].name).toBe('가상학생')
    expect(saved.bundle?.events).toHaveLength(3)
  })
  it('목적일 밖에서 이동된 당김 수업과 기간에 걸친 예외를 보존한다', () => {
    const { data } = projectOfflineRange(snapshot(), friday, friday, tuesday)!
    expect(data.bundle?.timetableOverrides).toEqual([rule])
    expect(timetableForDate(data.timetable!.teachers[0], friday, [], '교사', data.bundle!.timetableOverrides)[1].value).toContain('국어')
    expect(data.bundle?.todayMeals).toEqual([])
  })
  it('부분 교집합만 반환하고 신청 범위 전체 사본인 것처럼 재검증하지 않는다', () => {
    const projection = projectOfflineRange(snapshot(), '2026-11-12', end, tuesday)!
    expect(projection).toMatchObject({ from: monday, to: end, partial: true, data: {offlineRange: { from: monday, to: end }} })
    expect(projection.data.bundle?.revision).toBeUndefined()
    expect(projectOfflineRange(snapshot(), monday, end, tuesday)?.data.bundle?.revision).toBe('wide-revision')
    expect(projectOfflineRange(snapshot(), '2026-11-30', '2026-12-05', tuesday)).toBeNull()
    expect(projectOfflineRange(snapshot(), tuesday, monday, tuesday)).toBeNull()
    expect(projectOfflineRange(snapshot(), monday, '2026-11-32', tuesday)).toBeNull()
    expect(projectOfflineRange({ ...snapshot(), offlineRange:undefined }, monday, end, tuesday)).toBeNull()
    expect(projectOfflineRange(null, monday, end, tuesday)).toBeNull()
  })
  it('한국 날짜가 바뀌면 지난 오늘 출결·급식을 새 오늘 자료로 사용하지 않는다', () => {
    const saved = snapshot()
    const { data } = projectOfflineRange(saved, monday, end, '2026-11-18')!
    expect(data.bundle?.attendanceSummaries).toEqual([])
    expect(data.bundle?.sourceStatus?.attendance?.state).toBe('unavailable')
    expect(data.bundle?.todayMeals).toEqual([])
    expect(data.bundle?.revision).toBeUndefined()
    expect(projectOfflineRange(saved, friday, friday, friday)?.data.bundle?.todayMeals).toEqual([meal(friday)])
    delete saved.bundle!.meals
    expect(projectOfflineRange(saved, monday, end, friday)?.data.bundle?.meals).toEqual([])
  })
})
