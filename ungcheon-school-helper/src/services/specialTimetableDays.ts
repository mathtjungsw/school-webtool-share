export interface SpecialTimetableDay {
  date: string
  sourceWeekday: '월' | '화' | '수' | '목' | '금'
  sourceDayIndex: number
  title: string
  message: string
}

export const SPECIAL_TIMETABLE_DAYS: SpecialTimetableDay[] = [
  {
    date: '2026-08-11',
    sourceWeekday: '월',
    sourceDayIndex: 0,
    title: '월요일 시간표 운영',
    message: '8월 11일(화)은 월요일 시간표로 운영합니다.',
  },
  {
    date: '2026-10-13',
    sourceWeekday: '금',
    sourceDayIndex: 4,
    title: '금요일 시간표 운영',
    message: '10월 13일(화)은 금요일 시간표로 운영합니다.',
  },
  {
    date: '2026-11-09',
    sourceWeekday: '금',
    sourceDayIndex: 4,
    title: '금요일 시간표 운영',
    message: '11월 9일(월)은 금요일 시간표로 운영합니다.',
  },
  {
    date: '2026-11-17',
    sourceWeekday: '금',
    sourceDayIndex: 4,
    title: '금요일 시간표 운영',
    message: '11월 17일(화)은 금요일 시간표로 운영합니다.',
  },
]

function normalizeDate(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : value
}

function localDate(value: string) {
  const normalized = normalizeDate(value)
  const [year, month, day] = normalized.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatLike(date: Date, source: string) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return source.includes('-') ? `${year}-${month}-${day}` : `${year}${month}${day}`
}

export function localDateKey(date = new Date()) {
  return formatLike(date, '0000-00-00')
}

export function getSpecialTimetableDay(value: string) {
  const date = normalizeDate(value)
  return SPECIAL_TIMETABLE_DAYS.find(item => item.date === date) ?? null
}

/** 월요일=0 ... 금요일=4. 특별 운영일은 지정된 원본 요일을 반환합니다. */
export function getTimetableDayIndex(value: string) {
  const special = getSpecialTimetableDay(value)
  if (special) return special.sourceDayIndex
  const day = localDate(value).getDay()
  return day >= 1 && day <= 5 ? day - 1 : -1
}

/** NEIS처럼 날짜별 자료에서 특별 운영일에 대신 읽어야 할 원본 날짜를 반환합니다. */
export function getTimetableSourceDate(value: string) {
  const special = getSpecialTimetableDay(value)
  if (!special) return value
  const date = localDate(value)
  const actualDayIndex = date.getDay() - 1
  date.setDate(date.getDate() - (actualDayIndex - special.sourceDayIndex))
  return formatLike(date, value)
}

export const SPECIAL_TIMETABLE_NOTICE = {
  // 원격 공지의 양수 연번과 충돌하지 않도록 특별 운영 공지는 음수 ID를 사용합니다.
  id: -20260811,
  title: '[업데이트 v1.0.1] 8월 11일 월요일 시간표 운영',
  body: '8월 11일(화)은 월요일 시간표로 운영합니다.\n대시보드의 교사·학급 시간표와 학생 위치 찾기에도 월요일 시간표가 자동으로 표시됩니다.',
  date: '2026-08-09',
  level: 'important' as const,
  expiresAt: '2026-08-11',
}
