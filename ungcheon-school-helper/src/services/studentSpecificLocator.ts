import * as XLSX from 'xlsx-js-style'
import { PULLED_LESSONS_2026 } from '../data/pulledLessons2026'
import { binaryToNumberArray } from '../utils/binaryBytes'
import { applyStudentLessonOverride, normalizeClassCode } from './effectiveTimetable'
import { applyHelpClassLocation } from './helpClassSchedule'
import type { SharedStudentRoster, StudentRosterEntry } from './rosterAttendance'
import type { SchoolTimetable } from './schoolTimetable'
import { schoolTimetableSlotIndex, TIMETABLE_DAYS } from './schoolTimetable'
import type { SharedNeisSnapshot } from './sharedNeis'
import { getAcademicDayRule } from './teacherTimetableCalendar'
import type { PersonalTimetable, PersonalTimetableSlot, SharedStudentTimetable, StudentTimetableDay } from './studentTimetable'
import { canonicalStudentId, studentIdsMatch } from './studentId'
import type { TimetableChangeRequest } from './timetableChanges'

export interface StudentLocationInputRow {
  rowNumber: number
  studentId: string
  name: string
}

export type StudentLocationValidation = 'normal' | 'homonym' | 'mismatch' | 'not_found' | 'empty'
export type StudentLocationScheduleState = 'normal' | 'changed' | 'review' | 'no_lesson'

export interface StudentSpecificLocationRow {
  key: string
  inputRowNumber: number
  inputStudentId: string
  inputName: string
  confirmedStudentId: string
  confirmedName: string
  grade: string
  className: string
  classLabel: string
  date: string
  day: string
  period: number
  subject: string
  classroom: string
  teacher: string
  source: string
  validation: StudentLocationValidation
  validationLabel: string
  scheduleState: StudentLocationScheduleState
  scheduleLabel: string
  message: string
}

interface StudentDirectoryEntry {
  roster: StudentRosterEntry
  timetable?: PersonalTimetable
}

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()
const compact = (value: unknown) => clean(value).replace(/\s+/g, '')

function normalizeRosterStudent(student: StudentRosterEntry): StudentRosterEntry {
  return { ...student, studentId: canonicalStudentId(student.studentId) }
}

function timetableFallback(item: PersonalTimetable): StudentRosterEntry {
  return {
    studentId: canonicalStudentId(item.student.studentId),
    name: item.student.name,
    gender: '', remark: '', grade: item.student.grade, className: item.student.className,
    number: item.student.number, homeroomTeacher: '', assistantTeacher: '',
  }
}

export function buildStudentDirectory(dataset: SharedStudentTimetable | null, roster: SharedStudentRoster | null): StudentDirectoryEntry[] {
  const timetableById = new Map((dataset?.students ?? []).map(item => [canonicalStudentId(item.student.studentId), item]))
  const byId = new Map<string, StudentDirectoryEntry>()
  for (const student of roster?.students ?? []) {
    const normalized = normalizeRosterStudent(student)
    byId.set(normalized.studentId, { roster: normalized, timetable: timetableById.get(normalized.studentId) })
  }
  for (const timetable of dataset?.students ?? []) {
    const id = canonicalStudentId(timetable.student.studentId)
    if (!byId.has(id)) byId.set(id, { roster: timetableFallback(timetable), timetable })
  }
  return [...byId.values()].sort((a, b) => a.roster.studentId.localeCompare(b.roster.studentId, 'ko', { numeric: true }))
}

export function parseStudentLocationInputWorkbook(data: ArrayBuffer | Uint8Array): StudentLocationInputRow[] {
  const workbook = XLSX.read(data, { type: 'array', cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Excel 첫 시트를 찾을 수 없습니다.')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  const parsed = rows.map((row, index) => {
    const studentId = clean(row['학번'] ?? row['학생 학번'] ?? row['번호'])
    const name = clean(row['이름'] ?? row['성명'] ?? row['학생 이름'])
    return { rowNumber: index + 2, studentId, name }
  }).filter(row => row.studentId || row.name)
  if (!parsed.length) throw new Error('학번 또는 이름이 입력된 행을 찾지 못했습니다. 머리글은 ‘학번’, ‘이름’을 사용해 주세요.')
  if (parsed.length > 1000) throw new Error('한 번에 조회할 수 있는 학생은 1,000명까지입니다.')
  return parsed
}

function setColumnWidths(sheet: XLSX.WorkSheet, widths: number[]) {
  sheet['!cols'] = widths.map(wch => ({ wch }))
  sheet['!autofilter'] = sheet['!ref'] ? { ref: sheet['!ref'] } : undefined
  ;(sheet as XLSX.WorkSheet & { '!freeze'?: unknown })['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' }
}

const thinBorder = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
}

function styleRange(sheet: XLSX.WorkSheet, rangeRef: string, style: Record<string, unknown>) {
  const range = XLSX.utils.decode_range(rangeRef)
  for (let row = range.s.r; row <= range.e.r; row += 1) for (let column = range.s.c; column <= range.e.c; column += 1) {
    const address = XLSX.utils.encode_cell({ r: row, c: column })
    const cell = sheet[address]
    if (cell) cell.s = style
  }
}

function workbookBytes(workbook: XLSX.WorkBook) {
  return binaryToNumberArray(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))
}

export function buildStudentLocationTemplateWorkbookBytes(): number[] {
  const workbook = XLSX.utils.book_new()
  const input = XLSX.utils.aoa_to_sheet([
    ['학번', '이름'],
    ['2201', ''],
    ['', '홍길동'],
  ])
  setColumnWidths(input, [16, 18])
  styleRange(input, 'A1:B1', { fill: { fgColor: { rgb: '0F766E' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder })
  styleRange(input, 'A2:B3', { fill: { fgColor: { rgb: 'F8FAFC' } }, font: { color: { rgb: '0F172A' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder })
  input['!rows'] = [{ hpt: 26 }, { hpt: 23 }, { hpt: 23 }]
  XLSX.utils.book_append_sheet(workbook, input, '학생입력')
  const guide = XLSX.utils.aoa_to_sheet([
    ['학생 특정 시간 위치찾기 입력 안내'],
    ['학번과 이름 중 하나만 입력해도 됩니다.'],
    ['학번은 4자리 또는 기존 5자리 모두 입력할 수 있으며 프로그램에서 4자리로 정리합니다.'],
    ['이름만 입력하면 동명이인을 모두 출력합니다.'],
    ['학번과 이름이 서로 다르면 어느 한쪽을 자동 선택하지 않고 각각 확인할 수 있게 표시합니다.'],
    ['이 파일과 조회 결과는 현재 PC에서만 처리되며 학교 공유 서버나 구글시트로 전송되지 않습니다.'],
  ])
  setColumnWidths(guide, [96])
  styleRange(guide, 'A1:A1', { fill: { fgColor: { rgb: 'DBEAFE' } }, font: { bold: true, color: { rgb: '1E3A8A' }, sz: 14 }, alignment: { vertical: 'center' }, border: thinBorder })
  styleRange(guide, 'A2:A6', { fill: { fgColor: { rgb: 'F8FAFC' } }, font: { color: { rgb: '0F172A' } }, alignment: { vertical: 'center', wrapText: true }, border: thinBorder })
  guide['!rows'] = [{ hpt: 30 }, ...Array.from({ length: 5 }, () => ({ hpt: 28 }))]
  XLSX.utils.book_append_sheet(workbook, guide, '사용안내')
  return workbookBytes(workbook)
}

function labelValidation(value: StudentLocationValidation) {
  return { normal: '정상', homonym: '동명이인', mismatch: '학번·이름 불일치', not_found: '명렬 확인 필요', empty: '입력 확인 필요' }[value]
}

function resultShell(input: StudentLocationInputRow, date: string, day: string, period: number, validation: StudentLocationValidation, message: string): StudentSpecificLocationRow {
  return {
    key: `${input.rowNumber}-${validation}-${period}-${message}`,
    inputRowNumber: input.rowNumber, inputStudentId: input.studentId, inputName: input.name,
    confirmedStudentId: '', confirmedName: '', grade: '', className: '', classLabel: '',
    date, day, period, subject: '', classroom: '', teacher: '', source: '공유 학생 명렬',
    validation, validationLabel: labelValidation(validation), scheduleState: 'review', scheduleLabel: '확인 필요', message,
  }
}

function resolveInput(input: StudentLocationInputRow, directory: StudentDirectoryEntry[]) {
  const id = canonicalStudentId(input.studentId)
  const name = compact(input.name)
  const byId = input.studentId ? directory.filter(item => studentIdsMatch(item.roster.studentId, id)) : []
  const byName = input.name ? directory.filter(item => compact(item.roster.name) === name) : []
  if (!input.studentId && !input.name) return { entries: [] as StudentDirectoryEntry[], validation: 'empty' as const, message: '학번 또는 이름을 입력해 주세요.' }
  if (input.studentId && input.name) {
    if (byId.length === 1 && compact(byId[0].roster.name) === name) return { entries: byId, validation: 'normal' as const, message: '학번과 이름이 일치합니다.' }
    const entries = [...byId, ...byName.filter(item => !byId.some(idItem => idItem.roster.studentId === item.roster.studentId))]
    const idText = byId.map(item => `${item.roster.studentId} ${item.roster.name}`).join(', ') || '없음'
    const nameText = byName.map(item => `${item.roster.studentId} ${item.roster.name}`).join(', ') || '없음'
    return { entries, validation: entries.length ? 'mismatch' as const : 'not_found' as const, message: `학번 기준 학생: ${idText} / 이름 기준 후보: ${nameText}` }
  }
  if (input.studentId) return byId.length
    ? { entries: byId, validation: 'normal' as const, message: '학번으로 확인했습니다.' }
    : { entries: [], validation: 'not_found' as const, message: '입력한 학번을 공유 학생 명렬에서 찾지 못했습니다.' }
  if (!byName.length) return { entries: [], validation: 'not_found' as const, message: '입력한 이름을 공유 학생 명렬에서 찾지 못했습니다.' }
  return { entries: byName, validation: byName.length > 1 ? 'homonym' as const : 'normal' as const, message: byName.length > 1 ? `동명이인 ${byName.length}명을 모두 표시합니다.` : '이름으로 확인했습니다.' }
}

function parseSchoolSlot(value: string) {
  const lines = value.split(/\r?\n/).map(clean).filter(Boolean)
  const combined = lines.join(' ')
  const classMatch = combined.match(/(?:^|\s)([1-3]\d{2})(?:\s|$|[·._-])/)
  return { classCode: classMatch?.[1] ?? combined.slice(0, 3).replace(/\D/g, ''), text: combined }
}

function refineTeacher(slot: PersonalTimetableSlot | undefined, classLabel: string, slotIndex: number, timetable: SchoolTimetable | null) {
  if (!slot || !timetable || slotIndex < 0) return slot
  const wantedClass = normalizeClassCode(classLabel)
  const subjectTokens = [slot.subject, slot.raw].map(compact).filter(Boolean)
  const candidates = timetable.teachers.filter(teacher => {
    const value = teacher.slots[slotIndex]?.value ?? ''
    const parsed = parseSchoolSlot(value)
    if (normalizeClassCode(parsed.classCode) !== wantedClass) return false
    if (!subjectTokens.length) return true
    const compactValue = compact(parsed.text)
    return subjectTokens.some(token => compactValue.includes(token) || token.includes(compactValue.replace(/^\d{3}/, '')))
  })
  const teacher = candidates.length === 1 ? candidates[0].name : slot.teacher
  return { ...slot, teacher }
}

function matchingUnconfirmedChange(changes: TimetableChangeRequest[], classLabel: string, date: string, slotIndex: number) {
  const wanted = normalizeClassCode(classLabel)
  return changes.find(item => {
    if (item.status === 'approved' || ['cancelled', 'rejected'].includes(item.status)) return false
    const original = item.originalDate === date && item.originalSlotIndex === slotIndex && normalizeClassCode(item.originalClass) === wanted
    const replacement = item.kind === 'exchange' && item.replacementDate === date && item.replacementSlotIndex === slotIndex && normalizeClassCode(item.replacementClass) === wanted
    return original || replacement
  })
}

function pulledFor(classLabel: string, date: string, day: StudentTimetableDay, period: number) {
  const wanted = normalizeClassCode(classLabel)
  const applied = PULLED_LESSONS_2026.find(item => item.date === date && item.period === period && normalizeClassCode(item.classLabel) === wanted)
  if (applied) return { kind: 'applied' as const, item: applied }
  const moved = PULLED_LESSONS_2026.find(item => item.originalDate === date && item.originalSlot === `${day}${period}` && normalizeClassCode(item.classLabel) === wanted)
  return moved ? { kind: 'moved' as const, item: moved } : null
}

function locateStudent(entry: StudentDirectoryEntry, date: string, period: number, school: SchoolTimetable | null, neis: SharedNeisSnapshot | null, changes: TimetableChangeRequest[]) {
  const rule = getAcademicDayRule(date)
  const day = rule.sourceDayIndex >= 0 ? TIMETABLE_DAYS[rule.sourceDayIndex] : undefined
  const baseSource = entry.timetable ? '학생 개인시간표' : 'NEIS 학급시간표'
  if (rule.kind !== 'instruction' || !day) return { day: '', subject: '', classroom: '', teacher: '', source: `학사일정 · ${rule.label}`, state: 'no_lesson' as const, label: '수업 없음', message: rule.label || '수업일이 아닙니다.' }
  const personal = entry.timetable?.slots[`${day}${period}`]
  const neisSlot = neis?.timetables.find(item => item.date === date.replace(/-/g, '') && String(Number(item.grade)) === String(Number(entry.roster.grade)) && String(Number(item.classNm)) === String(Number(entry.roster.className)) && Number(item.period) === period)
  let slot: PersonalTimetableSlot | undefined = personal?.subject ? personal : neisSlot ? {
    day, period, subject: neisSlot.subject, teacher: neisSlot.teacher, classroom: neisSlot.classroom,
    raw: '', selectedCourse: false,
  } : personal
  const slotIndex = schoolTimetableSlotIndex(rule.sourceDayIndex, period)
  slot = refineTeacher(slot, `${entry.roster.grade}-${Number(entry.roster.className)}`, slotIndex, school)
  const before = slot ? `${slot.subject}|${slot.teacher}|${slot.classroom}` : ''
  const unconfirmed = matchingUnconfirmedChange(changes, `${entry.roster.grade}-${Number(entry.roster.className)}`, date, slotIndex)
  slot = applyStudentLessonOverride(slot, `${entry.roster.grade}-${Number(entry.roster.className)}`, date, slotIndex, changes)
  let source = baseSource
  let state: StudentLocationScheduleState = 'normal'
  let label = '기본 시간표'
  let message = rule.specialWeekdayLabel ? `${rule.specialWeekdayLabel}을 적용했습니다.` : ''
  const pulled = pulledFor(`${entry.roster.grade}-${Number(entry.roster.className)}`, date, day, period)
  if (pulled?.kind === 'applied') {
    slot = { day, period, subject: pulled.item.subject, teacher: pulled.item.teacherName, classroom: '', raw: pulled.item.subject, selectedCourse: false }
    source = '당김수업 기록'; state = 'changed'; label = '변경 시간표 적용'; message = '당김수업이 반영되었습니다. 필요하면 원자료를 확인해 주세요.'
  } else if (pulled?.kind === 'moved') {
    slot = undefined; source = '당김수업 기록'; state = 'changed'; label = '변경 시간표 적용'; message = '이 수업은 다른 날짜로 당겨 운영되어 현재 교시는 수업 없음으로 처리했습니다.'
  } else if (slot && 'effectiveChange' in slot) {
    source = '승인된 교환·대강'; state = 'changed'; label = '변경 시간표 적용'; message = '수업 교체·대강 변경사항이 반영되었습니다. 필요하면 원자료를 확인해 주세요.'
  } else if (before && slot && before !== `${slot.subject}|${slot.teacher}|${slot.classroom}`) {
    source = '승인된 변경 기록'; state = 'changed'; label = '변경 시간표 적용'
  } else if (rule.specialWeekdayLabel) {
    source = `${baseSource} · ${rule.specialWeekdayLabel}`; state = 'changed'; label = '특정 요일 시간표 적용'
  }
  if (unconfirmed) {
    state = 'review'; label = unconfirmed.requesterAppliedAt ? '나만 우선 반영 · 확인 필요' : '승인 대기 · 확인 필요'
    message = `${label}: 학생 전체에 확정 반영되지 않은 변경 요청입니다. 기본 시간표를 표시하므로 원자료를 확인해 주세요.`
  }
  slot = applyHelpClassLocation(slot, entry.roster, day, period)
  if (slot && 'helpClass' in slot) {
    source = `${source} · 도움반 개인시간표`
    message = [message, '색칠된 도움반 개인시간표에 따라 위치를 도움반으로 표시했습니다.'].filter(Boolean).join(' ')
  }
  if (!slot?.subject) return { day, subject: '', classroom: '', teacher: '', source, state: state === 'review' ? state : 'no_lesson' as const, label: state === 'review' ? label : '수업 없음', message: message || '등록된 수업이 없습니다.' }
  const classroom = slot.classroom || `${entry.roster.grade}-${Number(entry.roster.className)}반 교실`
  return { day, subject: slot.subject, classroom: classroom || '위치 미확정', teacher: slot.teacher || '담당 교사 미확정', source, state, label, message }
}

export function buildStudentSpecificLocationRows(options: {
  inputs: StudentLocationInputRow[]
  date: string
  periods: number[]
  dataset: SharedStudentTimetable | null
  roster: SharedStudentRoster | null
  schoolTimetable: SchoolTimetable | null
  sharedNeis: SharedNeisSnapshot | null
  changes: TimetableChangeRequest[]
}): StudentSpecificLocationRow[] {
  const directory = buildStudentDirectory(options.dataset, options.roster)
  const periods = [...new Set(options.periods)].filter(period => period >= 1 && period <= 7).sort((a, b) => a - b)
  const rule = getAcademicDayRule(options.date)
  const day = rule.sourceDayIndex >= 0 ? TIMETABLE_DAYS[rule.sourceDayIndex] : ''
  return options.inputs.flatMap(input => {
    const resolved = resolveInput(input, directory)
    if (!resolved.entries.length) return periods.map(period => resultShell(input, options.date, day, period, resolved.validation, resolved.message))
    return resolved.entries.flatMap(entry => periods.map(period => {
      const located = locateStudent(entry, options.date, period, options.schoolTimetable, options.sharedNeis, options.changes)
      return {
        key: `${input.rowNumber}-${entry.roster.studentId}-${period}`,
        inputRowNumber: input.rowNumber, inputStudentId: input.studentId, inputName: input.name,
        confirmedStudentId: entry.roster.studentId, confirmedName: entry.roster.name,
        grade: entry.roster.grade, className: entry.roster.className, classLabel: `${entry.roster.grade}-${Number(entry.roster.className)}`,
        date: options.date, day: located.day, period,
        subject: located.subject || '수업 없음', classroom: located.subject ? located.classroom || '위치 미확정' : '-', teacher: located.subject ? located.teacher || '담당 교사 미확정' : '-',
        source: located.source, validation: resolved.validation, validationLabel: labelValidation(resolved.validation),
        scheduleState: located.state, scheduleLabel: located.label,
        message: [resolved.message, located.message].filter(Boolean).join(' '),
      }
    }))
  })
}

export function buildStudentLocationResultWorkbookBytes(rows: StudentSpecificLocationRow[], date: string, periods: number[]): number[] {
  const workbook = XLSX.utils.book_new()
  const headers = ['입력 행', '입력 학번', '입력 이름', '확인된 학번', '확인된 이름', '학년·반', '날짜', '요일·교시', '수업', '강의실/현재 위치', '담당 교사', '적용 시간표 근거', '검증 상태', '시간표 상태', '확인 메시지']
  const data = rows.map(row => [row.inputRowNumber, row.inputStudentId, row.inputName, row.confirmedStudentId, row.confirmedName, row.classLabel, row.date, `${row.day || '-'} ${row.period}교시`, row.subject, row.classroom, row.teacher, row.source, row.validationLabel, row.scheduleLabel, row.message])
  const result = XLSX.utils.aoa_to_sheet([headers, ...data])
  setColumnWidths(result, [8, 13, 12, 13, 12, 10, 13, 12, 20, 20, 16, 24, 17, 20, 52])
  styleRange(result, `A1:O1`, { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: thinBorder })
  rows.forEach((row, index) => {
    const excelRow = index + 2
    const fill = row.scheduleState === 'changed' ? 'DCFCE7' : row.scheduleState === 'review' || row.validation !== 'normal' ? 'FFEDD5' : index % 2 ? 'F8FAFC' : 'FFFFFF'
    styleRange(result, `A${excelRow}:O${excelRow}`, { fill: { fgColor: { rgb: fill } }, font: { color: { rgb: '0F172A' } }, alignment: { vertical: 'top', wrapText: true }, border: thinBorder })
  })
  result['!rows'] = [{ hpt: 34 }, ...rows.map(() => ({ hpt: 42 }))]
  ;(result as XLSX.WorkSheet & { '!pageSetup'?: unknown })['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  ;(result as XLSX.WorkSheet & { '!margins'?: unknown })['!margins'] = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
  XLSX.utils.book_append_sheet(workbook, result, '조회결과')
  const info = XLSX.utils.aoa_to_sheet([
    ['학생 특정 시간 위치찾기 조회 정보'],
    ['조회 날짜', date],
    ['조회 교시', periods.map(period => `${period}교시`).join(', ')],
    ['생성 시각', new Date().toLocaleString('ko-KR')],
    ['개인정보 처리', '업로드 명단과 조회 결과는 현재 PC에서만 처리되며 학교 공유 서버·구글시트로 전송되지 않습니다.'],
    ['확인 안내', '변경 시간표 적용 또는 확인 필요 행은 당김수업·수업 교체 등 원자료를 함께 확인해 주세요.'],
  ])
  setColumnWidths(info, [20, 100])
  styleRange(info, 'A1:B1', { fill: { fgColor: { rgb: '0F766E' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 }, alignment: { vertical: 'center' }, border: thinBorder })
  styleRange(info, 'A2:B6', { fill: { fgColor: { rgb: 'F8FAFC' } }, font: { color: { rgb: '0F172A' } }, alignment: { vertical: 'top', wrapText: true }, border: thinBorder })
  info['!rows'] = [{ hpt: 30 }, ...Array.from({ length: 5 }, () => ({ hpt: 30 }))]
  XLSX.utils.book_append_sheet(workbook, info, '조회정보')
  return workbookBytes(workbook)
}
