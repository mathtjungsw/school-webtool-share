import * as XLSX from 'xlsx'

export const TIMETABLE_DAYS = ['월', '화', '수', '목', '금'] as const
export const PERIODS_PER_DAY = 7
export const TOTAL_SLOTS = TIMETABLE_DAYS.length * PERIODS_PER_DAY
const MIN_SOURCE_SLOTS = TOTAL_SLOTS - 1

export interface SchoolTimetableSlot {
  value: string
  locked: boolean
}

export interface TeacherTimetable {
  name: string
  label: string
  load: string
  slots: SchoolTimetableSlot[]
}

export interface SchoolTimetable {
  version: number
  title: string
  sourceFileName: string
  uploadedBy: string
  uploadedAt: string
  teachers: TeacherTimetable[]
}

export interface ParsedTimetable {
  title: string
  sourceFileName: string
  teachers: TeacherTimetable[]
}

export interface SwapCandidate {
  partnerTeacherIndex: number
  partnerSlotIndex: number
}

function normalizeCellValue(value: unknown): string {
  return String(value ?? '')
    .replace(/_x000D_/gi, '\n')
    .replace(/\r+\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function isSystemHighlight(rgb?: string) {
  const normalized = (rgb ?? '').toUpperCase().replace(/^#/, '')
  return ['FF00FF00', 'FFFFFF00', 'FFFF9600', '00FF00', 'FFFF00', 'FF9600'].includes(normalized)
}

function isLockedCell(cell: XLSX.CellObject | undefined): boolean {
  const style = cell?.s as {
    patternType?: string
    fgColor?: { rgb?: string }
  } | undefined
  if (!style || !style.patternType || style.patternType === 'none') return false
  return !isSystemHighlight(style.fgColor?.rgb)
}

function cellAt(sheet: XLSX.WorkSheet, row: number, column: number) {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })]
}

export function parseTimetableWorkbook(data: Uint8Array, sourceFileName: string): ParsedTimetable {
  const workbook = XLSX.read(data, {
    type: 'array',
    cellStyles: true,
    cellDates: true,
  })
  const sheetName = workbook.SheetNames.find(name => name.includes('주간시간표')) ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet?.['!ref']) throw new Error('시간표 시트를 찾을 수 없습니다.')

  const range = XLSX.utils.decode_range(sheet['!ref'])
  let teacherHeaderRow = -1
  for (let row = range.s.r; row <= Math.min(range.e.r, 10); row++) {
    if (normalizeCellValue(cellAt(sheet, row, 0)?.v) === '교사') {
      teacherHeaderRow = row
      break
    }
  }
  if (teacherHeaderRow < 0) throw new Error('A열에서 ‘교사’ 머리글을 찾을 수 없습니다.')

  const periodRow = teacherHeaderRow + 1
  const firstSlotColumn = 1
  const availableSlotCount = Math.min(TOTAL_SLOTS, range.e.c - firstSlotColumn + 1)
  if (availableSlotCount < MIN_SOURCE_SLOTS) {
    throw new Error('월~목 7교시와 금요일 6교시 이상의 시간표 영역을 찾을 수 없습니다.')
  }

  for (let slot = 0; slot < availableSlotCount; slot++) {
    const expectedPeriod = (slot % PERIODS_PER_DAY) + 1
    const actualPeriod = Number(cellAt(sheet, periodRow, firstSlotColumn + slot)?.v)
    if (actualPeriod !== expectedPeriod) {
      throw new Error('시간표의 교시 머리글이 월~금 각 1~7교시 형식이 아닙니다.')
    }
  }

  const teachers: TeacherTimetable[] = []
  for (let row = periodRow + 1; row <= range.e.r; row++) {
    const label = normalizeCellValue(cellAt(sheet, row, 0)?.v)
    if (!label) continue
    const match = label.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
    const name = (match?.[1] ?? label).trim()
    const load = (match?.[2] ?? '').trim()
    if (!name) continue

    const slots: SchoolTimetableSlot[] = []
    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const cell = cellAt(sheet, row, firstSlotColumn + slot)
      slots.push({
        value: normalizeCellValue(cell?.v),
        locked: isLockedCell(cell),
      })
    }
    teachers.push({ name, label, load, slots })
  }

  if (teachers.length === 0) throw new Error('교사 시간표 행을 찾을 수 없습니다.')
  if (teachers.length > 120) throw new Error('교사 수가 너무 많습니다.')

  return {
    title: normalizeCellValue(cellAt(sheet, range.s.r, range.s.c)?.v) || sheetName,
    sourceFileName,
    teachers,
  }
}

export async function chooseAndParseTimetable(): Promise<ParsedTimetable | null> {
  const filePath = await window.electron.openFileDialog([
    { name: '시간표 Excel', extensions: ['xlsm', 'xlsx', 'xls'] },
  ])
  if (!filePath) return null
  const base64 = await window.electron.readFileBase64(filePath)
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  const fileName = filePath.split(/[\\/]/).pop() || '시간표'
  return parseTimetableWorkbook(bytes, fileName)
}

export function classCode(value: string): string {
  return value.trim().slice(0, 3)
}

export function findSwapCandidates(
  timetable: SchoolTimetable,
  selectedTeacherIndex: number,
  selectedSlotIndex: number,
): SwapCandidate[] {
  const selectedTeacher = timetable.teachers[selectedTeacherIndex]
  const selected = selectedTeacher?.slots[selectedSlotIndex]
  if (!selected?.value || selected.locked) return []
  const code = classCode(selected.value)
  if (!code) return []

  const candidates: SwapCandidate[] = []
  timetable.teachers.forEach((teacher, partnerTeacherIndex) => {
    teacher.slots.forEach((partnerSlot, partnerSlotIndex) => {
      if (partnerTeacherIndex === selectedTeacherIndex || partnerSlotIndex === selectedSlotIndex) return
      if (classCode(partnerSlot.value) !== code) return
      if (partnerSlot.locked) return

      const partnerAtSelectedTime = teacher.slots[selectedSlotIndex]
      const selectedAtPartnerTime = selectedTeacher.slots[partnerSlotIndex]
      if (partnerAtSelectedTime.value || selectedAtPartnerTime.value) return
      if (partnerAtSelectedTime.locked || selectedAtPartnerTime.locked) return

      candidates.push({ partnerTeacherIndex, partnerSlotIndex })
    })
  })
  return candidates
}

export function slotLabel(slotIndex: number) {
  const day = TIMETABLE_DAYS[Math.floor(slotIndex / PERIODS_PER_DAY)]
  return `${day}요일 ${(slotIndex % PERIODS_PER_DAY) + 1}교시`
}
