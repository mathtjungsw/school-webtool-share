import { addDays, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import type { PulledLesson } from './pulledLessons'
import { getTimetableDayIndex, getSpecialTimetableDay } from './specialTimetableDays'
import { PERIODS_PER_DAY, type SchoolTimetable } from './schoolTimetable'
import { isTimetableChangeAppliedForTeacher, type TimetableChangeRequest } from './timetableChanges'

export const SECOND_SEMESTER_START = '2026-08-11'
export const SECOND_SEMESTER_END = '2027-02-05'
export const WINTER_VACATION_START = '2026-12-29'
export const WINTER_VACATION_END = '2027-02-02'

const NON_INSTRUCTION_DAYS: Record<string, string> = {
  '2026-08-17': '대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
  '2026-11-19': '대학수학능력시험일',
  '2026-11-20': '재량휴업일',
  '2026-12-25': '성탄절',
}

const EXAM_RANGES = [
  { start: '2026-09-29', end: '2026-10-02', label: '1차 지필평가' },
  { start: '2026-12-01', end: '2026-12-04', label: '2차 지필평가' },
]

const SCHOOL_EVENT_BADGES: Record<string, string[]> = {
  '2026-09-02': ['전국연합학력평가(1·2학년)', '대학수학능력시험 모의평가(3학년)'],
  '2026-10-20': ['전국연합학력평가(전학년)'],
  '2026-10-21': ['수업 공개의 날'],
  '2026-10-22': ['창업체험교육(1·2학년)'],
  '2026-10-23': ['지역 둘레길 체험(1·2학년)'],
  '2026-12-24': ['곰내제'],
  '2026-12-28': ['겨울방학식'],
  '2027-02-03': ['개학'],
  '2027-02-05': ['종업식·졸업식'],
}

export type AcademicDayKind = 'instruction' | 'exam' | 'non_instruction' | 'vacation' | 'outside' | 'weekend'

export interface AcademicDayRule {
  date: string
  kind: AcademicDayKind
  label: string
  sourceDayIndex: number
  eventBadges: string[]
  specialWeekdayLabel: string
}

export interface CompositeLesson {
  period: number
  value: string
  source: 'base' | 'exchange' | 'substitution' | 'pulled'
  badge: string
  originalValue: string
  warning?: string
}

export interface CompositeTeacherDay {
  date: string
  rule: AcademicDayRule
  lessons: CompositeLesson[]
  outOfRangeLessons: CompositeLesson[]
}

function inRange(value: string, start: string, end: string) {
  return value >= start && value <= end
}

export function getAcademicDayRule(date: string): AcademicDayRule {
  const parsed = parseISO(date)
  const day = parsed.getDay()
  const eventBadges = SCHOOL_EVENT_BADGES[date] ?? []
  const special = getSpecialTimetableDay(date)
  if (!inRange(date, SECOND_SEMESTER_START, SECOND_SEMESTER_END)) {
    return { date, kind: 'outside', label: '2학기 운영 기간 밖', sourceDayIndex: -1, eventBadges, specialWeekdayLabel: '' }
  }
  if (inRange(date, WINTER_VACATION_START, WINTER_VACATION_END)) {
    return { date, kind: 'vacation', label: '겨울방학', sourceDayIndex: -1, eventBadges, specialWeekdayLabel: '' }
  }
  if (day === 0 || day === 6) {
    return { date, kind: 'weekend', label: '주말', sourceDayIndex: -1, eventBadges, specialWeekdayLabel: '' }
  }
  const exam = EXAM_RANGES.find(range => inRange(date, range.start, range.end))
  if (exam) {
    return { date, kind: 'exam', label: `${exam.label} · 시간표 미확정`, sourceDayIndex: -1, eventBadges, specialWeekdayLabel: '' }
  }
  if (NON_INSTRUCTION_DAYS[date]) {
    return { date, kind: 'non_instruction', label: NON_INSTRUCTION_DAYS[date], sourceDayIndex: -1, eventBadges, specialWeekdayLabel: '' }
  }
  return {
    date,
    kind: 'instruction',
    label: '',
    sourceDayIndex: getTimetableDayIndex(date),
    eventBadges,
    specialWeekdayLabel: special ? special.title : '',
  }
}

function lessonValue(className: string, subject: string) {
  return [className, subject].filter(Boolean).join('\n')
}

function blankLessons(): CompositeLesson[] {
  return Array.from({ length: PERIODS_PER_DAY }, (_, index) => ({
    period: index + 1,
    value: '',
    source: 'base' as const,
    badge: '',
    originalValue: '',
  }))
}

function sameTeacher(left: string, right: string) {
  return left.replace(/\s+/g, '') === right.replace(/\s+/g, '')
}

function setLesson(lessons: CompositeLesson[], period: number, value: string, source: CompositeLesson['source'], badge: string) {
  if (period < 1 || period > PERIODS_PER_DAY) return false
  const current = lessons[period - 1]
  lessons[period - 1] = {
    period,
    value,
    source,
    badge,
    originalValue: current?.value ?? '',
    warning: current?.value && value && current.value !== value ? '동일 교시 수업 충돌' : undefined,
  }
  return true
}

function clearLesson(lessons: CompositeLesson[], period: number, source: CompositeLesson['source'], badge: string) {
  if (period < 1 || period > PERIODS_PER_DAY) return
  const current = lessons[period - 1]
  lessons[period - 1] = { period, value: '', source, badge, originalValue: current?.value ?? '' }
}

export function buildCompositeTeacherDay(
  timetable: SchoolTimetable,
  teacherName: string,
  date: string,
  changes: TimetableChangeRequest[] = [],
  pulledLessons: PulledLesson[] = [],
): CompositeTeacherDay {
  const rule = getAcademicDayRule(date)
  const teacher = timetable.teachers.find(item => sameTeacher(item.name, teacherName))
  const lessons = blankLessons()
  const outOfRangeLessons: CompositeLesson[] = []
  if (!teacher || rule.kind !== 'instruction' || rule.sourceDayIndex < 0) return { date, rule, lessons, outOfRangeLessons }

  for (let period = 1; period <= PERIODS_PER_DAY; period++) {
    const value = teacher.slots[rule.sourceDayIndex * PERIODS_PER_DAY + period - 1]?.value ?? ''
    lessons[period - 1] = { period, value, source: 'base', badge: '', originalValue: '' }
  }

  changes
    .filter(item => isTimetableChangeAppliedForTeacher(item, teacherName))
    .forEach(item => {
      const originalPeriod = item.originalSlotIndex % PERIODS_PER_DAY + 1
      const replacementPeriod = item.replacementSlotIndex % PERIODS_PER_DAY + 1
      if (item.kind === 'exchange') {
        if (sameTeacher(item.originalTeacher, teacherName)) {
          if (item.originalDate === date) clearLesson(lessons, originalPeriod, 'exchange', '교환 이동')
          if (item.replacementDate === date) setLesson(lessons, replacementPeriod, lessonValue(item.originalClass, item.originalSubject), 'exchange', '교환 반영')
        }
        if (sameTeacher(item.replacementTeacher, teacherName) && item.status === 'approved') {
          if (item.replacementDate === date) clearLesson(lessons, replacementPeriod, 'exchange', '교환 이동')
          if (item.originalDate === date) setLesson(lessons, originalPeriod, lessonValue(item.replacementClass, item.replacementSubject), 'exchange', '교환 반영')
        }
      } else {
        if (sameTeacher(item.originalTeacher, teacherName) && item.originalDate === date) {
          clearLesson(lessons, originalPeriod, 'substitution', '대강 배정')
        }
        if (sameTeacher(item.replacementTeacher, teacherName) && item.status === 'approved' && item.originalDate === date) {
          setLesson(lessons, originalPeriod, lessonValue(item.originalClass, item.originalSubject), 'substitution', '대강 반영')
        }
      }
    })

  pulledLessons.filter(item => sameTeacher(item.teacherName, teacherName)).forEach(item => {
    if (item.originalDate === date && item.originalSlot) {
      const matched = item.originalSlot.match(/[월화수목금](\d+)/)
      if (matched) clearLesson(lessons, Number(matched[1]), 'pulled', '당김 이동')
    }
    if (item.date !== date) return
    const value = lessonValue(item.classLabel, item.subject)
    if (!setLesson(lessons, item.period, value, 'pulled', '당김수업')) {
      outOfRangeLessons.push({ period: item.period, value, source: 'pulled', badge: '운영 범위 밖', originalValue: '', warning: `${item.period}교시` })
    }
  })

  return { date, rule, lessons, outOfRangeLessons }
}

export function monthCalendarDates(monthKey: string) {
  const first = startOfMonth(parseISO(`${monthKey}-01`))
  const start = startOfWeek(first, { weekStartsOn: 0 })
  const end = endOfWeek(new Date(first.getFullYear(), first.getMonth() + 1, 0), { weekStartsOn: 0 })
  const dates: string[] = []
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(format(cursor, 'yyyy-MM-dd'))
  return dates
}

export function weekDates(value: string) {
  const start = startOfWeek(parseISO(value), { weekStartsOn: 1 })
  return Array.from({ length: 5 }, (_, index) => format(addDays(start, index), 'yyyy-MM-dd'))
}

export function supportedMonthKeys() {
  return ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-02']
}

export function academicScheduleSummary() {
  return {
    semester: `${SECOND_SEMESTER_START} ~ ${SECOND_SEMESTER_END}`,
    vacation: `${WINTER_VACATION_START} ~ ${WINTER_VACATION_END}`,
    schoolDays: 95,
    lessonHours: 648,
  }
}
