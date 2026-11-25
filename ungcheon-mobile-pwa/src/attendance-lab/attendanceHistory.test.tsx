import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AttendanceExport } from './AttendanceExport'
import { attendanceRequest, listenAttendance } from './connection'
import { Attendance } from './main'

vi.mock('./connection', () => ({
  IS_ATTENDANCE_PREVIEW: false,
  attendanceRequest: vi.fn(),
  listenAttendance: vi.fn(),
  useAttendanceToken: vi.fn(),
}))

const lesson = { id: 'math', subject: '가상 수학', teacher: '시험교사', room: '가상 교실', kind: '학급수업', grade: '3' }
const student = { id: 'test-row', classId: '3-1', name: '가상학생', number: 1 }

beforeEach(() => {
  vi.mocked(attendanceRequest).mockImplementation(async (_token, path) => {
    if (path === 'dates') return {
      dates: ['2026-11-26'], earliestDate: '2026-11-25',
      access: { roles: ['homeroom', 'subject'], readOnly: false },
    }
    if (path.startsWith('record?')) return { student: student.id, field: path.includes('role=homeroom') ? 'homeroom' : 'subject', value: path.includes('role=homeroom') ? '결석' : '미확인' }
    return { classes: [{ id: '3-1', label: '3학년 1반' }], lessons: [lesson] }
  })
  vi.mocked(listenAttendance).mockImplementation((_token, selection, signal, receive) => {
    const data = selection.includes('allPeriods') ?
      { students: [{ ...student, periods: { 2: { lesson, homeroom: '출석' } } }] } :
      { rows: [{ ...student, lesson }], records: { [student.id]: { subject: '결석' } } }
    receive('board', { ...data, requestedAt: performance.now() })
    return new Promise(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('warns when editing a prior date and sends both roles’ edits to the selected date', async () => {
  render(<Attendance token="test-session" />)
  expect(await screen.findByRole('button', { name: '가상학생 2교시 담임 출결 출석' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '출결 내려받기' })).toBeVisible()

  fireEvent.click(screen.getByRole('button', { name: '이전 날짜' }))
  expect(await screen.findByText('지난 날짜 수정 중 · 2026-11-25')).toBeVisible()
  expect(screen.getByLabelText('출결 조회 날짜')).toHaveValue('2026-11-25')
  expect(screen.getByRole('button', { name: '이전 날짜' })).toBeDisabled()
  expect(await screen.findByRole('button', { name: '학급 전체 출석' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '출결 내려받기' })).toBeVisible()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '가상학생 2교시 담임 출결 출석' })) })
  expect(screen.getByRole('button', { name: '가상학생 2교시 담임 출결 결석' })).toBeEnabled()
  expect(vi.mocked(attendanceRequest).mock.calls.at(-1)?.[1]).toContain('record?date=2026-11-25')

  fireEvent.click(screen.getByRole('button', { name: '교과 교사 확인창' }))
  expect(await screen.findByRole('button', { name: '가상학생 교과 출결 결석' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '전체 출석' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: '출결 내려받기' })).not.toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '가상학생 교과 출결 결석' })) })
  expect(screen.getByRole('button', { name: '가상학생 교과 출결 미입력' })).toBeEnabled()
  expect(vi.mocked(attendanceRequest).mock.calls.at(-1)?.[1]).toContain('record?date=2026-11-25')

  fireEvent.click(screen.getByRole('button', { name: '다음 날짜' }))
  expect(await screen.findByRole('button', { name: '가상학생 교과 출결 결석' })).toBeEnabled()
  expect(screen.queryByText(/지난 날짜 수정 중/)).not.toBeInTheDocument()
})

it('requests the selected class and date range and reports an empty saved period', async () => {
  vi.mocked(attendanceRequest).mockResolvedValue({ rows: [] })
  render(<AttendanceExport token="test-session" classId="3-1" classLabel="3학년 1반" selectedDate="2026-11-26" today="2026-11-26" earliestDate="2026-11-25" />)
  fireEvent.click(screen.getByRole('button', { name: '출결 내려받기' }))
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-11-25' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '엑셀 내려받기' })) })
  expect(attendanceRequest).toHaveBeenLastCalledWith('test-session', 'export?group=3-1&fromDate=2026-11-25&toDate=2026-11-26', { signal: expect.any(AbortSignal) })
  expect(screen.getByRole('status')).toHaveTextContent('선택한 기간에 저장된 담임 출결이 없습니다.')
})
