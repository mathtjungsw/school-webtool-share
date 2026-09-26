import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DailyTimeline, EventDetail } from './App'
import { summarizeStatus, formatCheckedAt } from './dataStatus'
import { rangeForToday } from './domain'
import type { DashboardPayload, MobileEvent } from './types'

afterEach(cleanup)
describe('compact timetable and source freshness', () => {
  it('uses the oldest success and never invents a missing source success', () => {
    const data = { bundle: { sourceStatus: {
      timetable: { state: 'fresh', lastSuccessAt: '2026-09-25T00:10:00Z' },
      changes: { state: 'empty', lastSuccessAt: '2026-09-24T00:00:00Z' },
      overrides: { state: 'cached', lastSuccessAt: '2026-09-25T00:05:00Z' },
    } } } as DashboardPayload
    expect(summarizeStatus(data, ['timetable', 'changes', 'overrides'])).toEqual({ state: 'cached', label: '이전 자료', checkedAt: '2026-09-24T00:00:00Z' })
    expect(summarizeStatus(data, ['timetable', 'meals'])).toEqual({ state: 'unavailable', label: '확인 필요', checkedAt: '' })
    expect(formatCheckedAt('invalid')).toBe('확인 기록 없음')
    expect(formatCheckedAt('2026-09-24T16:05:00Z')).toContain('25')
  })
  it('fetches exactly three weeks, including previous week within the 22-day contract', () => {
    const result = rangeForToday(new Date('2026-09-25T12:00:00'))
    expect(result.from).toBe('2026-09-14')
    expect(result.to).toBe('2026-10-04')
    expect(result.thisWeek[0]).toBe('2026-09-21')
    expect(result.nextWeek[0]).toBe('2026-09-28')
  })
  const event: MobileEvent = { id: 'example', date: '2026-09-25', source: 'committee', label: '교육과정위원회', title: '긴 제목 전체를 확인할 수 있는 교육과정 협의회', startTime: '15:40', endTime: '16:20', location: '회의실' }
  it('preserves all seven periods and opens full timed event content', () => {
    const open = vi.fn()
    render(<DailyTimeline teacherFound lessons={Array.from({ length: 7 }, (_, i) => ({ period: i + 1, value: i === 2 ? '204\n문학' : '' }))} events={[event]} onOpenEvent={open} />)
    for (let period = 1; period <= 7; period++) expect(screen.getByText(period + '교시')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: event.title }))
    expect(open).toHaveBeenCalledWith(event)
  })
  it('shows title/date/time/location/source in a closable keyboard-accessible sheet', () => {
    const close = vi.fn()
    render(<EventDetail event={event} onClose={close} />)
    expect(screen.getByRole('dialog')).toHaveTextContent(event.title)
    expect(screen.getByText('2026-09-25')).toBeInTheDocument()
    expect(screen.getByText('15:40~16:20')).toBeInTheDocument()
    expect(screen.getByText('회의실')).toBeInTheDocument()
    expect(screen.getByText('위원회 일정 · 교육과정위원회')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
  })
})

