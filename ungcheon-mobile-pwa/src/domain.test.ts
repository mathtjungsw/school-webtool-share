import { DEFAULT_VISIBILITY, collectEvents, lessonFocus, newEventFingerprints, rangeForToday, schoolClock, timetableForDate } from './domain'
import type { DashboardPayload, TeacherTimetable, TimetableChange } from './types'
import { describe, expect, it } from 'vitest'

const teacher: TeacherTimetable = { name: '홍길동', label: '홍길동', load: '', slots: Array.from({ length: 35 }, (_, index) => ({ value: index === 0 ? '101\n국어' : '', locked: false })) }

describe('모바일 일정 도메인', () => {
  it('이번 주와 다음 주를 월요일부터 7일씩 만든다', () => {
    const result = rangeForToday(new Date('2026-08-20T12:00:00+09:00'))
    expect(result.thisWeek).toEqual(['2026-08-17','2026-08-18','2026-08-19','2026-08-20','2026-08-21','2026-08-22','2026-08-23'])
    expect(result.nextWeek[0]).toBe('2026-08-24')
  })

  it('기기 시간대와 무관하게 한국 날짜와 시간을 계산한다', () => {
    expect(schoolClock(new Date('2026-08-30T15:05:30Z'))).toEqual({ date: '2026-08-31', minutes: 5, seconds: 30 })
  })

  it('NEIS 없이 모든 지원 일정 종류를 기본 표시한다', () => {
    expect(Object.keys(DEFAULT_VISIBILITY)).not.toContain('neis')
    expect(Object.values(DEFAULT_VISIBILITY).every(Boolean)).toBe(true)
  })

  it('승인된 대강을 원교사와 대강교사 시간표에 반영한다', () => {
    const change: TimetableChange = { id:'1', kind:'substitution', status:'approved', requesterName:'홍길동', targetTeacherName:'김교사', requesterAppliedAt:'', originalSlotIndex:0, replacementSlotIndex:0, originalDate:'2026-08-17', replacementDate:'2026-08-17', originalTeacher:'홍길동', replacementTeacher:'김교사', originalClass:'1-1', replacementClass:'', originalSubject:'국어', replacementSubject:'' }
    expect(timetableForDate(teacher, '2026-08-17', [change], '홍길동')[0]).toMatchObject({ value:'', changed:true, note:'대강 · 김교사' })
    expect(timetableForDate({ ...teacher, name:'김교사' }, '2026-08-17', [change], '김교사')[0]).toMatchObject({ value:'1-1\n국어', changed:true, note:'대강 수업' })
  })

  it('로그인한 교사의 위원회와 승인된 수업 변경만 모은다', () => {
    const data: DashboardPayload = { timetable:null, committees:{ events:[{ id:'c1', committeeName:'교육과정위원회', title:'회의', date:'2026-08-20', startTime:'15:30', endTime:'16:00', location:'회의실', memberNames:['홍길동'] },{ id:'c2', committeeName:'다른 위원회', title:'비공개', date:'2026-08-20', startTime:'', endTime:'', location:'', memberNames:['김교사'] }] }, changes:[], bundle:null, cachedAt:'' }
    const events = collectEvents(data, '홍길동')
    expect(events.map(event => event.title)).toContain('회의')
    expect(events.map(event => event.title)).not.toContain('비공개')
  })

  it('수업 중·쉬는 시간·8교시의 지금과 다음 수업을 구분한다', () => {
    const lessons = Array.from({ length: 8 }, (_, index) => ({ period: index + 1, value: index === 0 ? '101\n국어' : index === 4 ? '205\n수학' : index === 7 ? '307\n정보' : '' }))
    expect(lessonFocus(lessons, 8 * 60 + 40)).toMatchObject({ state: 'during', currentPeriod: 1, nextPeriod: 5 })
    expect(lessonFocus(lessons, 9 * 60 + 31)).toMatchObject({ state: 'between', nextPeriod: 5 })
    expect(lessonFocus(lessons, 16 * 60 + 40)).toMatchObject({ state: 'during', currentPeriod: 8 })
    expect(lessonFocus(lessons, 17 * 60 + 30)).toMatchObject({ state: 'after' })
  })

  it('일정 정렬 변경은 NEW가 아니고 내용 변경만 NEW로 판정한다', () => {
    const previous: DashboardPayload = { timetable:null, committees:{ events:[] }, changes:[], bundle:{ teacherTimetable:null, committeeEvents:[], timetableChanges:[], todayMeals:[], fetchedAt:'2026-08-30T00:00:00Z', events:[{ date:'2026-08-31', title:'교직원 회의', source:'weekly', label:'교무부' },{ date:'2026-09-01', title:'창체', source:'creative', label:'창체' }] }, cachedAt:'2026-08-30T00:00:00Z' }
    const reordered: DashboardPayload = { ...previous, bundle:{ ...previous.bundle!, events:[...previous.bundle!.events].reverse() } }
    const changed: DashboardPayload = { ...previous, bundle:{ ...previous.bundle!, events:[{ ...previous.bundle!.events[0], title:'교직원 전체 회의' }, previous.bundle!.events[1]] } }
    expect(newEventFingerprints(previous, reordered, '홍길동', '2026-08-30')).toEqual([])
    expect(newEventFingerprints(previous, changed, '홍길동', '2026-08-30')).toHaveLength(1)
  })
})
