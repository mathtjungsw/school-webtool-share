import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { attendanceRequest, listenAttendance } from './connection'
import { DayBoard } from './main'

vi.mock('./connection', () => ({
  IS_ATTENDANCE_PREVIEW: false,
  attendanceRequest: vi.fn(),
  listenAttendance: vi.fn(),
  useAttendanceToken: vi.fn(),
}))

const students = [
  { id: 'first', name: '가상가', number: 1, classId: '3-1', periods: { 1: { homeroom: '결석' }, 2: {}, 3: {}, 4: {}, 5: { exception: '수업 없음' }, 6: { exception: '수업 없음' }, 7: { exception: '수업 없음' } } },
  { id: 'second', name: '가상나', number: 2, classId: '3-1', periods: { 1: {}, 2: {}, 3: { exception: '수업 없음' }, 4: {}, 5: { exception: '수업 없음' }, 6: { exception: '수업 없음' }, 7: { exception: '수업 없음' } } },
]
const response = (student: string) => ({ updates: [{ period: 1, students: [student] }] })
const mark = (name: string) => screen.getByRole('button', { name: `${name} 학생 전체 출석` })
const status = (name: string, value: string) => screen.getByRole('button', { name: `${name} 1교시 담임 출결 ${value}` })
const showDay = () => render(<DayBoard token="test-session" selection="period=2&role=homeroom&group=3-1&allPeriods=true" readOnly={false} executiveToken="" />)

let showSnapshot: () => void
beforeEach(() => {
  vi.mocked(attendanceRequest).mockReset()
  vi.mocked(listenAttendance).mockImplementation(async (_token, _selection, _signal, receive) => {
    showSnapshot = () => receive('board', { students, requestedAt: performance.now() })
    showSnapshot()
  })
})
afterEach(cleanup)

it('shows both clicks immediately while sending student saves in order', async () => {
  const first = Promise.withResolvers<ReturnType<typeof response>>()
  const second = Promise.withResolvers<ReturnType<typeof response>>()
  vi.mocked(attendanceRequest).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  showDay()

  fireEvent.click(mark('가상가'))
  expect(status('가상가', '출석')).toBeInTheDocument()
  expect(mark('가상가')).toBeDisabled()
  expect(mark('가상나')).toBeEnabled()
  fireEvent.click(mark('가상나'))
  expect(status('가상나', '출석')).toBeInTheDocument()
  expect(screen.getByText('학생 2명 출석 저장 중')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '가상가 5교시 담임 출결 출석' })).not.toBeInTheDocument()

  await act(async () => { showSnapshot() })
  expect(status('가상가', '출석')).toBeInTheDocument()
  expect(status('가상나', '출석')).toBeInTheDocument()
  expect(attendanceRequest).toHaveBeenCalledTimes(1)
  expect(vi.mocked(attendanceRequest).mock.calls[0][2]?.body).toContain('"student":"first"')

  await act(async () => { first.resolve(response('first')) })
  expect(attendanceRequest).toHaveBeenCalledTimes(2)
  expect(vi.mocked(attendanceRequest).mock.calls[1][2]?.body).toContain('"student":"second"')
  await act(async () => { second.resolve(response('second')) })
  expect(status('가상가', '출석')).toBeInTheDocument()
  expect(status('가상나', '출석')).toBeInTheDocument()
  expect(screen.queryByText(/명 출석 저장 중/)).not.toBeInTheDocument()
})

it('rolls back only the unconfirmed row and keeps the next save and retry available', async () => {
  const first = Promise.withResolvers<ReturnType<typeof response>>()
  vi.mocked(attendanceRequest).mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(response('second'))
    .mockResolvedValueOnce(response('first'))
  showDay()

  fireEvent.click(mark('가상가'))
  fireEvent.click(mark('가상나'))
  await act(async () => { first.reject(new Error('저장 지연 시험')) })
  expect(status('가상가', '결석')).toBeInTheDocument()
  expect(status('가상나', '출석')).toBeInTheDocument()
  expect(mark('가상가')).toHaveTextContent('전체 출석 다시 저장')
  expect(screen.getByRole('alert')).toHaveTextContent('저장 확인 필요')

  await act(async () => { fireEvent.click(mark('가상가')) })
  expect(status('가상가', '출석')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows class-wide attendance immediately and queues an individual correction after it', async () => {
  const wholeClass = Promise.withResolvers<ReturnType<typeof response>>()
  const correction = Promise.withResolvers<{ student: string; field: string; value: string }>()
  vi.mocked(attendanceRequest).mockReturnValueOnce(wholeClass.promise).mockReturnValueOnce(correction.promise)
  showDay()

  fireEvent.click(screen.getByRole('button', { name: '학급 전체 출석' }))
  expect(status('가상가', '출석')).toBeEnabled()
  expect(status('가상나', '출석')).toBeEnabled()
  fireEvent.click(status('가상가', '출석'))
  expect(status('가상가', '결석')).toBeInTheDocument()
  expect(screen.getByText('학급 전체 출석 저장 중')).toBeInTheDocument()

  await act(async () => { showSnapshot() })
  expect(attendanceRequest).toHaveBeenCalledTimes(1)
  expect(status('가상가', '결석')).toBeInTheDocument()
  expect(status('가상나', '출석')).toBeInTheDocument()

  await act(async () => { wholeClass.resolve({ updates: [{ period: 1, students: ['first', 'second'] }] }) })
  expect(attendanceRequest).toHaveBeenCalledTimes(2)
  expect(vi.mocked(attendanceRequest).mock.calls[1][1]).toContain('period=1')
  expect(vi.mocked(attendanceRequest).mock.calls[1][2]?.body).toContain('"value":"결석"')
  expect(status('가상가', '결석')).toBeInTheDocument()
  await act(async () => { correction.resolve({ student: 'first', field: 'homeroom', value: '결석' }) })
  expect(status('가상가', '결석')).toBeInTheDocument()
  expect(status('가상나', '출석')).toBeInTheDocument()
})

it('omits periods without lessons for the class and leaves other students’ active periods visible', () => {
  showDay()
  expect(screen.getByRole('region', { name: '담임 하루 출결' })).toHaveStyle('--lab-day-period-count: 4')
  expect(screen.getAllByText('4교시')).toHaveLength(2)
  expect(screen.getAllByText('3교시')).toHaveLength(1)
  for (const period of [5, 6, 7]) expect(screen.queryByText(`${period}교시`)).not.toBeInTheDocument()
})
