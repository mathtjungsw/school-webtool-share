import * as XLSX from 'xlsx'
import { roundedMonthsInclusive, type CareerPeriodInput, type TransferGrade } from './teacherTransferScore'

export interface NeisExcludedPeriod {
  reason: string
  startDate: string
  endDate: string
  months: number
}

export interface NeisAppointmentImportResult {
  applicantName: string
  currentSchool: string
  sourceDate: string
  tenureStartDate: string
  careerPeriods: CareerPeriodInput[]
  workMonths: number
  excludedPeriods: NeisExcludedPeriod[]
  educationActivityMonths: {
    homeroom: number
    department_head: number
  }
  warnings: string[]
}

export interface NeisAppointmentSource {
  applicantName: string
  currentSchool: string
  sourceDate: string
  title: string
  appointmentRows: unknown[][]
}

interface AppointmentRecord {
  startDate: string
  endDate: string
  appointmentType: string
  position: string
  department: string
  issuer: string
}

interface DateRange {
  start: Date
  end: Date
}

const DAY_MS = 86_400_000

function cellText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeDateText(value: string): string {
  const match = value.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function parsePeriod(value: string): { startDate: string; endDate: string } | null {
  const parts = value.split('~')
  const startDate = normalizeDateText(parts[0] ?? '')
  if (!startDate) return null
  return { startDate, endDate: normalizeDateText(parts[1] ?? '') }
}

function clipRange(startValue: string, endValue: string, windowStart: Date, windowEnd: Date): DateRange | null {
  const start = parseDate(startValue)
  const end = parseDate(endValue)
  if (!start || !end || end < start) return null
  const clippedStart = start > windowStart ? start : windowStart
  const clippedEnd = end < windowEnd ? end : windowEnd
  if (clippedEnd < clippedStart) return null
  return { start: clippedStart, end: clippedEnd }
}

function mergeRanges(ranges: DateRange[]): DateRange[] {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: DateRange[] = []
  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (!previous || range.start.getTime() > addDays(previous.end, 1).getTime()) {
      merged.push({ ...range })
    } else if (range.end > previous.end) {
      previous.end = range.end
    }
  }
  return merged
}

function subtractRanges(source: DateRange, excluded: DateRange[]): DateRange[] {
  let result = [source]
  for (const exclusion of excluded) {
    result = result.flatMap(range => {
      if (exclusion.end < range.start || exclusion.start > range.end) return [range]
      const segments: DateRange[] = []
      if (exclusion.start > range.start) segments.push({ start: range.start, end: addDays(exclusion.start, -1) })
      if (exclusion.end < range.end) segments.push({ start: addDays(exclusion.end, 1), end: range.end })
      return segments
    })
  }
  return result
}

function toAppointmentRecords(rows: unknown[][]): AppointmentRecord[] {
  return rows.flatMap(row => {
    const period = parsePeriod(cellText(row[0]))
    if (!period) return []
    return [{
      ...period,
      appointmentType: cellText(row[1]),
      position: cellText(row[2]),
      department: cellText(row[3]),
      issuer: cellText(row[4]),
    }]
  })
}

function isCurrentSchool(record: AppointmentRecord, currentSchool: string): boolean {
  return Boolean(currentSchool) && (record.department.includes(currentSchool) || record.issuer === currentSchool)
}

function isTenureAnchor(record: AppointmentRecord): boolean {
  return /(전보|공채|신규|임용)/.test(record.appointmentType)
}

function isExcludedAbsence(record: AppointmentRecord): boolean {
  const type = record.appointmentType.replace(/\s+/g, '')
  if (/복직/.test(type)) return false
  if (/공상.*휴직|휴직.*공상/.test(type)) return false
  return /휴직|정직|직위해제/.test(type)
}

function activityRanges(
  records: AppointmentRecord[],
  predicate: (record: AppointmentRecord) => boolean,
  tenure: DateRange,
  excluded: DateRange[],
): DateRange[] {
  const ranges = records.flatMap(record => {
    if (!predicate(record)) return []
    const clipped = clipRange(record.startDate, record.endDate || formatDate(tenure.end), tenure.start, tenure.end)
    return clipped ? subtractRanges(clipped, excluded) : []
  })
  return mergeRanges(ranges)
}

function totalRoundedMonths(ranges: DateRange[]): number {
  return ranges.reduce((sum, range) => sum + roundedMonthsInclusive(formatDate(range.start), formatDate(range.end)), 0)
}

function directCell(sheet: XLSX.WorkSheet, address: string): string {
  return cellText(sheet[address]?.w ?? sheet[address]?.v)
}

export function readNeisAppointmentSource(bytes: number[] | Uint8Array): NeisAppointmentSource {
  const workbook = XLSX.read(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { type: 'array', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new Error('엑셀 파일에서 시트를 찾지 못했습니다.')

  const title = `${directCell(sheet, 'A1')} ${directCell(sheet, 'B1')}`.trim()
  if (!title.includes('개인인사기록') || !title.includes('임용발령사항')) {
    throw new Error('나이스 개인인사기록의 인사발령상황(전체) Excel data 파일이 아닙니다.')
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:E8')
  const appointmentRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    range: { s: { r: 8, c: 0 }, e: { r: range.e.r, c: 4 } },
  })

  return {
    applicantName: directCell(sheet, 'A3'),
    currentSchool: directCell(sheet, 'H5'),
    sourceDate: normalizeDateText(directCell(sheet, 'R1')),
    title,
    appointmentRows,
  }
}

export function parseNeisAppointmentSource(
  source: NeisAppointmentSource,
  evaluationDateValue: string,
  grade: TransferGrade = '라',
): NeisAppointmentImportResult {
  const evaluationDate = parseDate(evaluationDateValue)
  if (!evaluationDate) throw new Error('평정기준일을 먼저 확인해 주세요.')
  if (!source.currentSchool) throw new Error('나이스 파일에서 현재 소속 학교를 찾지 못했습니다.')

  const records = toAppointmentRecords(source.appointmentRows)
  if (!records.length) throw new Error('나이스 파일에서 인사발령 이력을 찾지 못했습니다.')

  const currentRecords = records.filter(record => isCurrentSchool(record, source.currentSchool))
  const anchors = currentRecords
    .filter(isTenureAnchor)
    .map(record => ({ record, date: parseDate(record.startDate) }))
    .filter((item): item is { record: AppointmentRecord; date: Date } => Boolean(item.date) && item.date! <= evaluationDate)
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  const warnings: string[] = []
  let tenureStart = anchors[0]?.date ?? null
  if (!tenureStart) {
    tenureStart = currentRecords
      .map(record => parseDate(record.startDate))
      .filter((date): date is Date => Boolean(date) && date! <= evaluationDate)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
    if (tenureStart) warnings.push('현임교 전보·임용 발령을 특정하지 못해 현임교의 가장 이른 기록을 시작일로 사용했습니다. 시작일을 확인해 주세요.')
  }
  if (!tenureStart) throw new Error('현임교 근무 시작일을 찾지 못했습니다.')

  const tenure = { start: tenureStart, end: evaluationDate }
  const excludedRecords = currentRecords.flatMap(record => {
    if (!isExcludedAbsence(record)) return []
    const clipped = clipRange(record.startDate, record.endDate || evaluationDateValue, tenure.start, tenure.end)
    return clipped ? [{ record, range: clipped }] : []
  })
  const excludedRanges = mergeRanges(excludedRecords.map(item => item.range))
  const workRanges = subtractRanges(tenure, excludedRanges)

  const excludedPeriods = excludedRanges.map(range => {
    const matching = excludedRecords.find(item => item.range.start <= range.end && item.range.end >= range.start)
    const startDate = formatDate(range.start)
    const endDate = formatDate(range.end)
    return {
      reason: matching?.record.appointmentType || '평정 제외 기간',
      startDate,
      endDate,
      months: roundedMonthsInclusive(startDate, endDate),
    }
  })

  const careerPeriods = workRanges.map((range, index): CareerPeriodInput => ({
    id: `neis-${index + 1}-${formatDate(range.start)}`,
    schoolName: source.currentSchool,
    grade,
    startDate: formatDate(range.start),
    endDate: formatDate(range.end),
  }))

  const activityRecords = currentRecords.filter(record => {
    const start = parseDate(record.startDate)
    return Boolean(start && start <= evaluationDate)
  })
  const homeroom = activityRanges(
    activityRecords,
    record => /담임/.test(`${record.appointmentType} ${record.position}`),
    tenure,
    excludedRanges,
  )
  const departmentHead = activityRanges(
    activityRecords,
    record => /보직교사/.test(record.appointmentType) || /부장/.test(record.position),
    tenure,
    excludedRanges,
  )

  if (currentRecords.some(record => /파견/.test(record.appointmentType))) {
    warnings.push('파견은 종류에 따라 근무경력 인정 여부가 달라 자동으로 제외하지 않았습니다. 인사 담당자에게 확인해 주세요.')
  }
  if (source.currentSchool !== '웅천고등학교') {
    warnings.push(`${source.currentSchool}의 급지를 자동 판정하지 않았습니다. 현재 선택된 ${grade}급지가 맞는지 확인해 주세요.`)
  }
  warnings.push('나이스에 나타나지 않는 겸임·공동교육과정·표창·상장·자격·우대조건 등은 직접 입력해 주세요.')

  return {
    applicantName: source.applicantName,
    currentSchool: source.currentSchool,
    sourceDate: source.sourceDate,
    tenureStartDate: formatDate(tenureStart),
    careerPeriods,
    workMonths: totalRoundedMonths(workRanges),
    excludedPeriods,
    educationActivityMonths: {
      homeroom: totalRoundedMonths(homeroom),
      department_head: totalRoundedMonths(departmentHead),
    },
    warnings,
  }
}

export function parseNeisAppointmentWorkbook(
  bytes: number[] | Uint8Array,
  evaluationDate: string,
  grade: TransferGrade = '라',
): NeisAppointmentImportResult {
  return parseNeisAppointmentSource(readNeisAppointmentSource(bytes), evaluationDate, grade)
}
