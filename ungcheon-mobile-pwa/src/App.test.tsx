import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AttendanceSheet, DailyTimeline, Login } from './App'
import type { MobileAttendanceSummary } from './types'

const attendance: MobileAttendanceSummary = {
  date: '2026-09-14', period: 2, state: 'partial', flaggedCount: 1, enrolledCount: 2,
  courseNames: ['기하'], classrooms: ['수학실'],
  classStatus: [{ className: '1', complete: false }, { className: '2', complete: true }],
  entries: [{ className: '2', number: '7', name: '김테스트', remark: '조퇴' }],
  mismatchCount: 0, sourceDate: '2026-09-14', checkedAt: '2026-09-14T00:36:00Z', rosterBasis: 'course-enrollment',
}

describe('로그인 화면', () => {
  it('비밀번호를 보이거나 다시 숨길 수 있다', () => {
    const view = render(<Login onLogin={vi.fn()} />)
    const password = screen.getByLabelText('공통 비밀번호') as HTMLInputElement

    expect(screen.getByRole('img', { name: '웅천고등학교 로고' })).toHaveAttribute('src', '/icon-192.png')
    expect(password.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 보이기' }))
    expect(password.type).toBe('text')
    expect(screen.getByRole('button', { name: '비밀번호 숨기기' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 숨기기' }))
    expect(password.type).toBe('password')
    view.unmount()
  })
})

describe('3학년 수강생 출결', () => {
  it('해당 교시만 부분 입력 상태를 표시하고 상세 화면을 연다', () => {
    const open = vi.fn()
    render(<DailyTimeline lessons={[
      { period: 1, value: '' },
      { period: 2, value: '304\nE2_경수' },
    ]} events={[]} teacherFound attendance={[attendance]} onOpenAttendance={open} />)
    fireEvent.click(screen.getByRole('button', { name: /2교시 수강생 출결 부분 입력 · 1명/ }))
    expect(open).toHaveBeenCalledWith(attendance)
    expect(screen.queryByRole('button', { name: /1교시 수강생 출결/ })).not.toBeInTheDocument()
  })

  it('반·번호, 이름, 비고 순으로 실제 수강생 출결만 표시한다', () => {
    render(<AttendanceSheet summary={attendance} onClose={vi.fn()} />)
    expect(screen.getByText('2개 반 중 1개 반 입력 완료')).toBeInTheDocument()
    expect(screen.getByText('1반 입력 전')).toBeInTheDocument()
    expect(screen.getByText('2반 7번')).toBeInTheDocument()
    expect(screen.getByText('김테스트')).toBeInTheDocument()
    expect(screen.getByText('조퇴')).toBeInTheDocument()
    expect(screen.getByText('실제 수강생 기준', { exact: false })).toBeInTheDocument()
  })
})
