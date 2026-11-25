import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { attendanceRequest, listenAttendance } from './connection'
import { Board, DayBoard } from './main'

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
const classMark = (value: string) => screen.getByRole('button', { name: `학급 전체 ${value}` })
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
  expect(mark('가상가')).toBeEnabled()
  expect(mark('가상나')).toBeEnabled()
  fireEvent.click(mark('가상나'))
  expect(status('가상나', '출석')).toBeInTheDocument()
  expect(screen.getByText('출결 2건 저장 중')).toBeInTheDocument()
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
  expect(screen.queryByText(/건 저장 중/)).not.toBeInTheDocument()
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
  expect(mark('가상가')).toBeEnabled()
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

  fireEvent.click(classMark('출석'))
  expect(status('가상가', '출석')).toBeEnabled()
  expect(status('가상나', '출석')).toBeEnabled()
  fireEvent.click(status('가상가', '출석'))
  expect(status('가상가', '결석')).toBeInTheDocument()
  expect(screen.getByText('출결 2건 저장 중')).toBeInTheDocument()

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

it('keeps student and class controls active during a save and preserves the mixed input order', async () => {
  const delayed = Promise.withResolvers<{ student: string; field: string; value: string }>()
  const request = vi.mocked(attendanceRequest)
  request.mockReturnValueOnce(delayed.promise)
    .mockResolvedValueOnce({ student: 'second', field: 'homeroom', value: '결석' })
    .mockResolvedValueOnce({ updates: [{ period: 1, students: ['first', 'second'] }] })
    .mockResolvedValueOnce(response('first'))
    .mockResolvedValueOnce({ updates: [{ period: 1, students: ['first', 'second'] }] })
    .mockResolvedValueOnce(response('first'))
  showDay()

  fireEvent.click(status('가상나', '미입력'))
  await act(async () => {})
  fireEvent.click(status('가상나', '출석'))
  expect(status('가상나', '결석')).toBeInTheDocument()
  expect(mark('가상나')).toBeEnabled()
  expect(classMark('출석')).toBeEnabled()
  expect(classMark('미입력')).toBeEnabled()

  fireEvent.click(classMark('출석'))
  expect(status('가상나', '출석')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '가상가 학생 전체 결석' }))
  expect(status('가상가', '결석')).toBeInTheDocument()
  expect(status('가상나', '출석')).toBeInTheDocument()
  fireEvent.click(classMark('미입력'))
  expect(status('가상가', '미입력')).toBeInTheDocument()
  expect(status('가상나', '미입력')).toBeInTheDocument()
  fireEvent.click(mark('가상가'))
  expect(status('가상가', '출석')).toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(1)

  await act(async () => { delayed.resolve({ student: 'second', field: 'homeroom', value: '출석' }) })
  const requests = request.mock.calls.map(([, , init]) => JSON.parse(String(init?.body)))
  expect(requests.map(item => [item.student ?? 'class', item.bulkValue ?? item.value])).toEqual([
    ['second', '출석'], ['second', '결석'], ['class', '출석'], ['first', '결석'], ['class', '미확인'], ['first', '출석'],
  ])
  expect(status('가상가', '출석')).toBeInTheDocument()
  expect(status('가상나', '미입력')).toBeInTheDocument()
})

it('applies a student reset without resetting another student', async () => {
  vi.mocked(attendanceRequest).mockResolvedValueOnce({ updates: [{ period: 1, students: ['first', 'second'] }] })
    .mockResolvedValueOnce(response('first'))
  showDay()
  fireEvent.click(classMark('출석'))
  fireEvent.click(screen.getByRole('button', { name: '가상가 학생 전체 미입력' }))
  expect(status('가상가', '미입력')).toBeInTheDocument()
  expect(status('가상나', '출석')).toBeInTheDocument()
  await act(async () => {})
  expect(status('가상가', '미입력')).toBeInTheDocument()
  expect(status('가상나', '출석')).toBeInTheDocument()
})

it('resets a course while an individual course record is still saving', async () => {
  const individual = Promise.withResolvers<{ student: string; field: string; value: string }>()
  const request = vi.mocked(attendanceRequest)
  request.mockReturnValueOnce(individual.promise)
    .mockResolvedValueOnce({ students: ['first'], field: 'subject', value: '미확인' })
  vi.mocked(listenAttendance).mockImplementation((_token, _selection, signal, receive) => {
    receive('board', {
      rows: [{ ...students[0], lesson: { subject: '가상 수학', kind: '이동수업', teacher: '가상교사' } }],
      records: { first: { homeroom: '결석', note: '가상 비고' } },
      requestedAt: performance.now(),
    })
    return new Promise(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
  })
  render(<Board token="test-session" selection="period=2&role=subject&group=test" role="subject" readOnly={false} executiveToken="" />)
  const button = (value: string) => screen.getByRole('button', { name: `가상가 교과 출결 ${value}` })
  fireEvent.click(button('미입력'))
  expect(button('출석')).toBeInTheDocument()
  const reset = screen.getByRole('button', { name: '전체 미입력' })
  expect(reset).toBeEnabled()
  fireEvent.click(reset)
  expect(button('미입력')).toBeInTheDocument()
  await act(async () => { individual.resolve({ student: 'first', field: 'subject', value: '출석' }) })
  expect(request.mock.calls[1][2]?.body).toContain('"bulkValue":"미확인"')
  expect(button('미입력')).toBeInTheDocument()
  expect(screen.getByText('가상 비고')).toBeInTheDocument()
})

it('omits periods without lessons for the class and leaves other students’ active periods visible', () => {
  showDay()
  expect(screen.getByRole('region', { name: '담임 하루 출결' })).toHaveStyle('--lab-day-period-count: 4')
  expect(screen.getAllByText('4교시')).toHaveLength(2)
  expect(screen.getAllByText('3교시')).toHaveLength(1)
  for (const period of [5, 6, 7]) expect(screen.queryByText(`${period}교시`)).not.toBeInTheDocument()
})
