import type { SchoolTimetable, SchoolTimetableSlot } from './schoolTimetable'
import { PERIODS_PER_DAY, TIMETABLE_DAYS } from './schoolTimetable'

export type TimetablePlanKind = 'exchange' | 'substitution' | 'change'

export interface TimetablePlanEntry {
  id: string
  kind: TimetablePlanKind
  originalSlotIndex: number
  replacementSlotIndex: number
  originalDate: string
  replacementDate: string
  originalTeacher: string
  replacementTeacher: string
  originalClass: string
  replacementClass: string
  originalSubject: string
  replacementSubject: string
  note: string
  createdAt: string
}

export interface TimetablePlanMeta {
  reason: '출장' | '병가' | '연가' | '공가' | '특별휴가' | '기타'
  customReason: string
  startDate: string
  endDate: string
  author: string
  documentDate: string
}

export interface TimetablePlanDraft {
  meta: TimetablePlanMeta
  entries: TimetablePlanEntry[]
}

export interface LessonCell {
  className: string
  subject: string
}

export interface ConsecutiveSummary {
  day: string
  lessonCount: number
  maxConsecutive: number
  ranges: string[]
}

export interface TeacherScheduleSimulation {
  before: SchoolTimetableSlot[]
  after: SchoolTimetableSlot[]
  changedSlots: number[]
  beforeSummary: ConsecutiveSummary[]
  afterSummary: ConsecutiveSummary[]
}

export const TIMETABLE_PLAN_STORE_KEY = 'timetable_plan:draft:v1'

export function createEmptyPlanDraft(author = ''): TimetablePlanDraft {
  const today = localDate()
  return {
    meta: {
      reason: '출장',
      customReason: '',
      startDate: today,
      endDate: today,
      author,
      documentDate: today,
    },
    entries: [],
  }
}

export async function loadTimetablePlanDraft(author = ''): Promise<TimetablePlanDraft> {
  const empty = createEmptyPlanDraft(author)
  const saved = await window.electron?.configGet(TIMETABLE_PLAN_STORE_KEY)
  if (!saved || typeof saved !== 'object') return empty
  const candidate = saved as Partial<TimetablePlanDraft>
  return {
    meta: {
      ...empty.meta,
      ...(candidate.meta ?? {}),
      author: candidate.meta?.author || author,
    },
    entries: Array.isArray(candidate.entries) ? candidate.entries : [],
  }
}

export async function saveTimetablePlanDraft(draft: TimetablePlanDraft): Promise<void> {
  await window.electron?.configSet(TIMETABLE_PLAN_STORE_KEY, draft)
}

export function parseLessonCell(value: string): LessonCell {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const rawClass = lines[0] ?? ''
  const numericClass = rawClass.match(/^([1-3])0?(\d{1,2})$/)
  const className = numericClass
    ? `${numericClass[1]}-${Number(numericClass[2])}`
    : rawClass
  return {
    className,
    subject: lines.slice(1).join(' · '),
  }
}

export function findSubstitutionCandidates(
  timetable: SchoolTimetable,
  selectedTeacherIndex: number,
  selectedSlotIndex: number,
): number[] {
  const selected = timetable.teachers[selectedTeacherIndex]?.slots[selectedSlotIndex]
  // 색상 제한은 수업 교환에만 적용한다. 대강은 원래 수업의 색상과
  // 관계없이 같은 시간에 비어 있는 교사를 찾을 수 있어야 한다.
  if (!selected?.value) return []
  return timetable.teachers
    .map((teacher, index) => ({ teacher, index }))
    .filter(({ teacher, index }) =>
      index !== selectedTeacherIndex &&
      !teacher.slots[selectedSlotIndex]?.value &&
      !teacher.slots[selectedSlotIndex]?.locked,
    )
    .map(({ index }) => index)
}

export function simulateExchange(
  timetable: SchoolTimetable,
  selectedTeacherIndex: number,
  selectedSlotIndex: number,
  partnerTeacherIndex: number,
  partnerSlotIndex: number,
): TeacherScheduleSimulation {
  const partner = timetable.teachers[partnerTeacherIndex]
  const before = cloneSlots(partner.slots)
  const after = cloneSlots(partner.slots)
  const movingLesson = partner.slots[partnerSlotIndex]
  after[partnerSlotIndex] = { value: '', locked: false }
  after[selectedSlotIndex] = { ...movingLesson }
  return simulation(before, after, [partnerSlotIndex, selectedSlotIndex])
}

export function simulateSubstitution(
  timetable: SchoolTimetable,
  selectedTeacherIndex: number,
  selectedSlotIndex: number,
  substituteTeacherIndex: number,
): TeacherScheduleSimulation {
  const substitute = timetable.teachers[substituteTeacherIndex]
  const before = cloneSlots(substitute.slots)
  const after = cloneSlots(substitute.slots)
  const lesson = timetable.teachers[selectedTeacherIndex].slots[selectedSlotIndex]
  after[selectedSlotIndex] = { value: lesson.value, locked: false }
  return simulation(before, after, [selectedSlotIndex])
}

export function buildPlanEntry(
  timetable: SchoolTimetable,
  kind: 'exchange' | 'substitution',
  selectedTeacherIndex: number,
  selectedSlotIndex: number,
  partnerTeacherIndex: number,
  partnerSlotIndex = selectedSlotIndex,
): TimetablePlanEntry {
  const originalTeacher = timetable.teachers[selectedTeacherIndex]
  const partnerTeacher = timetable.teachers[partnerTeacherIndex]
  const originalLesson = parseLessonCell(originalTeacher.slots[selectedSlotIndex].value)
  const partnerLesson = kind === 'exchange'
    ? parseLessonCell(partnerTeacher.slots[partnerSlotIndex].value)
    : originalLesson
  const weekMonday = nextApplicableMonday()

  return {
    id: crypto.randomUUID(),
    kind,
    originalSlotIndex: selectedSlotIndex,
    replacementSlotIndex: partnerSlotIndex,
    originalDate: dateForSlot(weekMonday, selectedSlotIndex),
    replacementDate: dateForSlot(weekMonday, kind === 'exchange' ? partnerSlotIndex : selectedSlotIndex),
    originalTeacher: originalTeacher.name,
    replacementTeacher: partnerTeacher.name,
    originalClass: originalLesson.className,
    replacementClass: partnerLesson.className,
    originalSubject: originalLesson.subject,
    replacementSubject: partnerLesson.subject,
    note: kind === 'substitution' ? '1' : '',
    createdAt: new Date().toISOString(),
  }
}

export function planKindLabel(kind: TimetablePlanKind) {
  if (kind === 'exchange') return '교환'
  if (kind === 'substitution') return '보강'
  return '변경'
}

export function slotPeriod(slotIndex: number) {
  return (slotIndex % PERIODS_PER_DAY) + 1
}

export function slotDay(slotIndex: number) {
  return TIMETABLE_DAYS[Math.floor(slotIndex / PERIODS_PER_DAY)]
}

export function formatPlanDate(value: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(year, month - 1, day).getDay()]
  return `${month}/${day}(${weekday})`
}

function cloneSlots(slots: SchoolTimetableSlot[]) {
  return slots.map(slot => ({ ...slot }))
}

function simulation(
  before: SchoolTimetableSlot[],
  after: SchoolTimetableSlot[],
  changedSlots: number[],
): TeacherScheduleSimulation {
  return {
    before,
    after,
    changedSlots,
    beforeSummary: analyzeConsecutive(before),
    afterSummary: analyzeConsecutive(after),
  }
}

function analyzeConsecutive(slots: SchoolTimetableSlot[]): ConsecutiveSummary[] {
  return TIMETABLE_DAYS.map((day, dayIndex) => {
    const occupied = Array.from({ length: PERIODS_PER_DAY }, (_, offset) =>
      Boolean(slots[dayIndex * PERIODS_PER_DAY + offset]?.value),
    )
    const ranges: string[] = []
    let start = -1
    let maxConsecutive = 0
    for (let index = 0; index <= occupied.length; index++) {
      if (occupied[index] && start < 0) start = index
      if ((!occupied[index] || index === occupied.length) && start >= 0) {
        const end = index - 1
        const length = end - start + 1
        maxConsecutive = Math.max(maxConsecutive, length)
        if (length >= 2) ranges.push(`${start + 1}~${end + 1}교시`)
        start = -1
      }
    }
    return {
      day,
      lessonCount: occupied.filter(Boolean).length,
      maxConsecutive,
      ranges,
    }
  })
}

function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function nextApplicableMonday() {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? 1 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  monday.setHours(12, 0, 0, 0)
  return monday
}

function dateForSlot(monday: Date, slotIndex: number) {
  const date = new Date(monday)
  date.setDate(monday.getDate() + Math.floor(slotIndex / PERIODS_PER_DAY))
  return localDate(date)
}
