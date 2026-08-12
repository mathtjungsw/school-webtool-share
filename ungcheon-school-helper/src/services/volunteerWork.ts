import * as XLSX from 'xlsx'
import { canonicalStudentId, studentIdParts } from './studentId'

export interface VolunteerStudentRow {
  id: string
  studentId: string
  name: string
  hours: number | string
  remarks: string
}

export interface VolunteerCertificateDraft {
  activityName: string
  startDate: string
  endDate: string
  institution: string
  area: 'neighbor' | 'environment' | 'campaign'
  location: string
  activityContent: string
  confirmTeacher: string
  schoolName: string
  commonRemarks: string
  students: VolunteerStudentRow[]
}

export interface ClassVolunteerCertificateDraft extends VolunteerCertificateDraft {
  grade: string
  className: string
  periodLabel: string
  certificateDate: string
}

export interface StoredVolunteerHwp {
  id: string
  originalName: string
  importedAt: string
  size: number
  sha256: string
  formCount: number
  activities: string[]
  fileType?: 'hwp' | 'pdf'
  pageCount?: number
  analysisMode?: 'hwp' | 'text' | 'ocr' | 'mixed'
  averageConfidence?: number
  warnings?: string[]
  forms?: ParsedVolunteerForm[]
}

export interface StoredVolunteerNeisDataset {
  id: string
  originalName: string
  importedAt: string
  sha256: string
  recordCount: number
  studentCount: number
  records: NeisVolunteerRecord[]
}

export interface VolunteerHwpRosterSource {
  id: string
  originalName: string
  forms: ParsedVolunteerForm[]
}

export interface VolunteerRosterStudent {
  studentId: string
  name: string
}

export type VolunteerRosterStatus = 'matched' | 'neis-only' | 'hwp-only' | 'unclassified'

export interface VolunteerActivitySide {
  content: string
  hours: number | null
  startDate: string
  endDate: string
  sourceName: string
  sourceLocation: string
  duplicateCount: number
  correctionNote?: string
}

export interface VolunteerRosterComparisonRow {
  id: string
  studentId: string
  grade: string
  className: string
  displayName: string
  neis: VolunteerActivitySide | null
  hwp: VolunteerActivitySide | null
  status: VolunteerRosterStatus
  message: string
  correctionTarget?: {
    sourceId: string
    formIndex: number
    participantIndex: number
  }
}

export interface VolunteerRosterDuplicate {
  source: 'neis' | 'hwp'
  studentId: string
  name: string
  count: number
  activity: string
  sourceNames: string[]
}

export interface VolunteerRosterComparisonResult {
  rows: VolunteerRosterComparisonRow[]
  unclassified: VolunteerRosterComparisonRow[]
  duplicates: VolunteerRosterDuplicate[]
}

export interface ParsedVolunteerParticipant {
  studentId: string
  name: string
  hours: number | null
  remarks: string
  correctionNote?: string
}

export interface ParsedVolunteerForm {
  formIndex: number
  activityName: string
  startDate: string
  endDate: string
  institution: string
  area: string
  location: string
  activityContent: string
  confirmTeacher: string
  participants: ParsedVolunteerParticipant[]
}

export interface NeisVolunteerRecord {
  studentId: string
  name: string
  startDate: string
  endDate: string
  area: string
  activityContent: string
  institution: string
  hours: number | null
  sourceRow: number
}

export interface VolunteerValidationIssue {
  severity: 'error' | 'warning' | 'info'
  type: 'unknown' | 'name' | 'missing' | 'duplicate' | 'hours' | 'date' | 'content' | 'institution'
  studentId: string
  name: string
  message: string
  hwpValue?: string
  neisValue?: string
}

export function emptyVolunteerDraft(teacherName = ''): VolunteerCertificateDraft {
  const today = new Date().toISOString().slice(0, 10)
  return {
    activityName: '', startDate: today, endDate: today, institution: '웅천고등학교',
    area: 'neighbor', location: '학교 내', activityContent: '', confirmTeacher: teacherName,
    schoolName: '웅천고등학교', commonRemarks: '', students: [],
  }
}

export function emptyClassVolunteerDraft(teacherName = ''): ClassVolunteerCertificateDraft {
  const today = new Date().toISOString().slice(0, 10)
  return {
    ...emptyVolunteerDraft(teacherName),
    activityName: '사제동행 교내 환경정화',
    activityContent: '사제동행 교내 환경정화',
    institution: '웅천고등학교',
    area: 'environment',
    location: '학교 내',
    schoolName: '웅천고등학교',
    grade: '',
    className: '',
    periodLabel: '5, 6교시',
    certificateDate: today,
  }
}

export function validateClassIssuanceDraft(draft: ClassVolunteerCertificateDraft) {
  const errors = validateIssuanceDraft(draft)
    .filter(error => !error.includes('68'))
  if (!draft.grade || !draft.className) errors.push('학급을 선택해 주세요.')
  if (!draft.periodLabel.trim()) errors.push('봉사활동 교시 또는 시간 표시를 입력해 주세요.')
  if (!draft.certificateDate) errors.push('확인서 하단 날짜를 입력해 주세요.')
  if (draft.students.length > 40) errors.push('제공된 반별 HWPX 양식은 최대 40명까지 지원합니다.')
  return [...new Set(errors)]
}

export function createVolunteerRow(partial: Partial<VolunteerStudentRow> = {}): VolunteerStudentRow {
  return { id: crypto.randomUUID(), studentId: '', name: '', hours: '', remarks: '', ...partial }
}

/** 봉사활동 확인서와 나이스 봉사자료에서는 학년·반·번호를 4자리로 표시한다. */
export function volunteerStudentId(value: unknown) {
  return canonicalStudentId(value)
}

export function parseRosterPaste(text: string): VolunteerStudentRow[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length) return []
  const rows = lines.map(line => line.split(/\t|\s*,\s*/).map(cell => cell.trim()))
  const header = rows[0].map(normalize)
  const headerLike = header.some(cell => /학번|성명|이름|시수|시간/.test(cell))
  const data = headerLike ? rows.slice(1) : rows
  const idIndex = headerLike ? Math.max(0, header.findIndex(cell => cell.includes('학번'))) : 0
  const nameIndex = headerLike ? Math.max(0, header.findIndex(cell => /성명|이름/.test(cell))) : 1
  const hoursIndex = headerLike ? header.findIndex(cell => /시수|시간/.test(cell)) : 2
  const remarksIndex = headerLike ? header.findIndex(cell => /비고|메모/.test(cell)) : 3
  return data.map(cells => {
    if (cells.length === 1) {
      const match = cells[0].match(/(\d{4,5})\s+([가-힣A-Za-z·]+)(?:\s+(\d+(?:\.\d+)?))?/)
      if (match) return createVolunteerRow({ studentId: volunteerStudentId(match[1]), name: match[2], hours: match[3] ? Number(match[3]) : '' })
    }
    const rawId = cells[idIndex] || ''
    const hours = hoursIndex >= 0 ? Number(String(cells[hoursIndex] || '').replace(/[^\d.]/g, '')) : NaN
    return createVolunteerRow({
      studentId: volunteerStudentId(rawId),
      name: cells[nameIndex] || '',
      hours: Number.isFinite(hours) && hours > 0 ? hours : '',
      remarks: remarksIndex >= 0 ? cells[remarksIndex] || '' : '',
    })
  }).filter(row => row.studentId || row.name)
}

export function parseRosterWorkbook(bytes: number[]) {
  const workbook = XLSX.read(Uint8Array.from(bytes), { type: 'array', cellDates: false })
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    expandBrokenRange(sheet)
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false })
    const headerIndex = matrix.findIndex(row => row.some(cell => /학번/.test(String(cell))) && row.some(cell => /성명|이름/.test(String(cell))))
    if (headerIndex < 0) continue
    return parseRosterMatrix(matrix.slice(headerIndex))
  }
  throw new Error('학번과 이름 열을 찾지 못했습니다. 붙여넣기 기능을 이용하거나 열 이름을 확인해 주세요.')
}

export function buildVolunteerRosterTemplate(): number[] {
  const rows: unknown[][] = [
    ['봉사활동 확인서 학생 명단 입력 양식'],
    ['학번은 4자리로 입력합니다. 기존 5자리 학번을 입력해도 불러올 때 4자리로 자동 변환됩니다. 실제 시수는 학생마다 숫자로 입력해 주세요.'],
    [],
    ['학번(4자리)', '이름', '실제 시수', '비고'],
  ]
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  ]
  sheet['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 32 }]
  sheet['!rows'] = [{ hpt: 28 }, { hpt: 36 }, { hpt: 8 }, { hpt: 24 }]
  sheet['!autofilter'] = { ref: 'A4:D72' }
  sheet['!ref'] = 'A1:D72'
  for (let row = 5; row <= 72; row += 1) {
    const idCell = `A${row}`
    sheet[idCell] = { t: 's', v: '', z: '@' }
  }
  const workbook = XLSX.utils.book_new()
  workbook.Props = {
    Title: '봉사활동 확인서 학생 명단 입력 양식',
    Subject: '웅천고등학교 봉사활동 확인서 발급용',
    Author: '웅천고등학교',
  }
  XLSX.utils.book_append_sheet(workbook, sheet, '봉사활동 명단')
  const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return Array.from(new Uint8Array(output))
}

function parseRosterMatrix(matrix: unknown[][]) {
  const headers = matrix[0].map(cell => normalize(String(cell)))
  const idIndex = headers.findIndex(cell => cell.includes('학번'))
  const nameIndex = headers.findIndex(cell => /성명|이름/.test(cell))
  const hoursIndex = headers.findIndex(cell => /시수|시간/.test(cell))
  const remarksIndex = headers.findIndex(cell => /비고|메모/.test(cell))
  return matrix.slice(1).map(row => {
    const hours = hoursIndex >= 0 ? Number(String(row[hoursIndex] ?? '').replace(/[^\d.]/g, '')) : NaN
    return createVolunteerRow({
      studentId: volunteerStudentId(row[idIndex]),
      name: String(row[nameIndex] ?? '').trim(),
      hours: Number.isFinite(hours) && hours > 0 ? hours : '',
      remarks: remarksIndex >= 0 ? String(row[remarksIndex] ?? '').trim() : '',
    })
  }).filter(row => row.studentId || row.name)
}

export function parseNeisVolunteerWorkbook(bytes: number[]) {
  const workbook = XLSX.read(Uint8Array.from(bytes), { type: 'array', cellDates: false })
  const records: NeisVolunteerRecord[] = []
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    expandBrokenRange(sheet)
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false })
    const headerIndex = matrix.findIndex(row => row.some(cell => normalize(String(cell)) === '번호') && row.some(cell => /봉사활동내용/.test(normalize(String(cell)))))
    if (headerIndex < 0) return
    // 나이스 봉사활동 누가기록은 A열 제목에 학년과 반을 표시하고,
    // 학생 행의 A열에는 학급 내 번호만 표시한다.
    const aColumnHeading = matrix.slice(0, headerIndex).map(row => String(row[0] ?? '')).join(' ')
    const headingText = matrix.slice(0, headerIndex).flat().map(String).join(' ')
    const classMatch = (aColumnHeading.match(/([1-3])\s*학년.*?([1-9]\d*)\s*반/)
      || headingText.match(/([1-3])\s*학년.*?([1-9]\d*)\s*반/))
    const grade = classMatch?.[1] || ''
    const classNumber = classMatch?.[2] ? String(Number(classMatch[2])) : ''
    const headers = matrix[headerIndex].map(cell => normalize(String(cell)))
    const find = (...names: RegExp[]) => headers.findIndex(cell => names.some(name => name.test(cell)))
    const numberIndex = find(/^번호$/, /학번/)
    const nameIndex = find(/성명/, /이름/)
    const startIndex = find(/시작일/)
    const endIndex = find(/종료일/)
    const areaIndex = find(/영역구분/)
    const contentIndex = find(/봉사활동내용/, /활동내용/)
    const institutionIndex = find(/장소또는주관기관명/, /주관기관/, /장소/)
    const hoursIndex = find(/^시간$/, /시수/)
    let previousNumber = ''
    let previousName = ''
    matrix.slice(headerIndex + 1).forEach((row, offset) => {
      const rawNumber = String(row[numberIndex] ?? '').trim()
      const rawName = String(row[nameIndex] ?? '').trim()
      if (rawNumber) previousNumber = rawNumber
      if (rawName) previousName = rawName
      const content = String(row[contentIndex] ?? '').trim()
      const hours = Number(String(row[hoursIndex] ?? '').replace(/[^\d.]/g, ''))
      if (!previousNumber || !previousName || !content) return
      const sequenceNumber = neisStudentSequenceNumber(previousNumber)
      const studentId = grade && classNumber && sequenceNumber
        ? volunteerStudentId(`${grade}${classNumber}${sequenceNumber}`)
        : volunteerStudentId(previousNumber)
      records.push({
        studentId, name: previousName,
        startDate: excelDate(row[startIndex]), endDate: excelDate(row[endIndex]),
        area: String(row[areaIndex] ?? '').trim(), activityContent: content,
        institution: String(row[institutionIndex] ?? '').trim(),
        hours: Number.isFinite(hours) ? hours : null, sourceRow: headerIndex + offset + 2,
      })
    })
  })
  if (!records.length) throw new Error('나이스 봉사활동 자료를 찾지 못했습니다. 성적조회에서 내려받은 XLS data 파일인지 확인해 주세요.')
  return records
}

/** 나이스 XLS data가 번호를 `1.0`, `10.0`처럼 표시해도 학급 내 번호로 복원한다. */
function neisStudentSequenceNumber(value: unknown) {
  const text = String(value ?? '').trim().replace(/,/g, '')
  if (!text) return ''
  const numeric = Number(text)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 99) {
    return String(numeric).padStart(2, '0')
  }
  const digits = text.replace(/\D/g, '')
  if (!digits || digits.length > 2) return ''
  const integer = Number(digits)
  return Number.isInteger(integer) && integer >= 1 && integer <= 99
    ? String(integer).padStart(2, '0')
    : ''
}

export function validateVolunteerForms(forms: ParsedVolunteerForm[], neis: NeisVolunteerRecord[]) {
  const issues: VolunteerValidationIssue[] = []
  forms.forEach(form => {
    const seen = new Set<string>()
    form.participants.forEach(student => {
      const studentId = volunteerStudentId(student.studentId)
      const key = studentId || normalize(student.name)
      if (seen.has(key)) issues.push(issue('error', 'duplicate', studentId, student.name, '확인서 안에 같은 학생이 중복 입력되어 있습니다.'))
      seen.add(key)
      const sameId = neis.filter(record => record.studentId === studentId)
      if (!sameId.length) {
        issues.push(issue('error', 'unknown', studentId, student.name, '나이스 파일에서 해당 학번을 찾지 못했습니다.'))
        return
      }
      if (!sameId.some(record => normalize(record.name) === normalize(student.name))) {
        issues.push(issue('error', 'name', studentId, student.name, '학번과 이름이 나이스 자료와 일치하지 않습니다.', student.name, [...new Set(sameId.map(record => record.name))].join(', ')))
      }
      const candidates = sameId.filter(record => activityMatches(form, record))
      if (!candidates.length) {
        issues.push(issue('error', 'missing', studentId, student.name, '확인서의 활동과 일치하는 나이스 봉사활동 기록이 없습니다.', form.activityContent || form.activityName, sameId.map(record => record.activityContent).join(' / ')))
        return
      }
      const hoursValues = candidates.map(record => record.hours).filter((hours): hours is number => hours != null)
      const neisHours = hoursValues.length ? hoursValues.reduce((sum, hours) => sum + hours, 0) : null
      const startDates = candidates.map(record => record.startDate).filter(Boolean).sort()
      const endDates = candidates.map(record => record.endDate || record.startDate).filter(Boolean).sort()
      const neisStartDate = startDates[0] || ''
      const neisEndDate = endDates.at(-1) || ''
      const institutions = [...new Set(candidates.map(record => record.institution).filter(Boolean))]
      if (student.hours != null && neisHours !== student.hours) issues.push(issue('error', 'hours', studentId, student.name, '동일 활동의 나이스 시수 합계와 확인서 시수가 서로 다릅니다.', `${student.hours}시간`, neisHours == null ? '빈칸' : `${neisHours}시간`))
      if (form.startDate && neisStartDate && form.startDate !== neisStartDate) issues.push(issue('warning', 'date', studentId, student.name, '활동 시작일이 서로 다릅니다.', form.startDate, neisStartDate))
      if (form.endDate && neisEndDate && form.endDate !== neisEndDate) issues.push(issue('warning', 'date', studentId, student.name, '활동 종료일이 서로 다릅니다.', form.endDate, neisEndDate))
      if (form.institution && institutions.length && !institutions.some(institution => textMatches(form.institution, institution))) issues.push(issue('warning', 'institution', studentId, student.name, '활동 기관·장소 표기가 서로 다릅니다.', form.institution, institutions.join(' / ')))
    })
    const formIds = new Set(form.participants.map(student => volunteerStudentId(student.studentId)))
    const missingByStudent = new Map<string, NeisVolunteerRecord[]>()
    neis.filter(record => activityMatches(form, record) && !formIds.has(record.studentId)).forEach(record => {
      missingByStudent.set(record.studentId, [...(missingByStudent.get(record.studentId) || []), record])
    })
    missingByStudent.forEach(records => {
      const record = records[0]
      const total = records.map(item => item.hours).filter((hours): hours is number => hours != null).reduce((sum, hours) => sum + hours, 0)
      issues.push(issue('warning', 'missing', record.studentId, record.name, '나이스에는 있으나 확인서 명단에서 누락된 학생입니다.', '확인서 없음', `${record.activityContent} / ${total}시간`))
    })
  })
  return issues
}

/** 여러 나이스 기록과 확인서 기록을 학생·활동·시간 단위로 일대일 대조한다. */
export function compareVolunteerRosterSources(
  neisDatasets: StoredVolunteerNeisDataset[],
  hwpSources: VolunteerHwpRosterSource[],
  rosterStudents: VolunteerRosterStudent[],
): VolunteerRosterComparisonResult {
  const neisEntries: VolunteerRosterEntry[] = neisDatasets.flatMap(dataset => dataset.records.map((record, index) => ({
    id: `${dataset.id}:neis:${index}`,
    source: 'neis' as const,
    sourceId: dataset.id,
    sourceName: dataset.originalName,
    sourceLocation: record.sourceRow ? `Excel ${record.sourceRow}행` : '',
    studentId: volunteerStudentId(record.studentId),
    name: record.name.trim(),
    activity: record.activityContent.trim(),
    startDate: record.startDate,
    endDate: record.endDate,
    hours: record.hours,
    duplicateCount: 1,
  })))
  const hwpEntries: VolunteerRosterEntry[] = hwpSources.flatMap(source => source.forms.flatMap(form => form.participants.map((participant, index) => ({
    id: `${source.id}:hwp:${form.formIndex}:${index}`,
    source: 'hwp' as const,
    sourceId: source.id,
    sourceName: source.originalName,
    sourceLocation: `문서 내 ${form.formIndex + 1}번째 확인서`,
    studentId: volunteerStudentId(participant.studentId),
    name: participant.name.trim(),
    activity: (form.activityContent || form.activityName).trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    hours: participant.hours,
    duplicateCount: 1,
    correctionNote: participant.correctionNote,
    formIndex: form.formIndex,
    participantIndex: index,
  }))))

  const duplicates = [
    ...markDuplicateVolunteerEntries(neisEntries, 'neis'),
    ...markDuplicateVolunteerEntries(hwpEntries, 'hwp'),
  ]
  const rosterById = new Map(rosterStudents.map(student => [volunteerStudentId(student.studentId), student]))
  const rosterByName = groupBy(rosterStudents, student => normalize(student.name))
  const validHwp: VolunteerRosterEntry[] = []
  const unclassified: VolunteerRosterComparisonRow[] = []

  hwpEntries.forEach(entry => {
    const roster = rosterById.get(entry.studentId)
    if (roster && normalize(roster.name) === normalize(entry.name)) {
      validHwp.push(entry)
      return
    }
    const sameName = rosterByName.get(normalize(entry.name)) || []
    const idParts = studentIdParts(entry.studentId)
    let message = '확인서의 학번·이름을 서버 학생 명렬에서 찾지 못했습니다.'
    if (roster) message = `서버 학생 명렬의 ${entry.studentId} 학생 이름은 '${roster.name}'입니다.`
    else if (sameName.length === 1) message = `서버 학생 명렬에서 '${entry.name}' 학생의 학번은 ${volunteerStudentId(sameName[0].studentId)}입니다.`
    else if (sameName.length > 1) message = `서버 학생 명렬에 '${entry.name}' 동명이인이 있어 학번을 확인해야 합니다.`
    unclassified.push({
      id: entry.id,
      studentId: entry.studentId,
      grade: idParts.grade,
      className: idParts.className,
      displayName: entry.name || '(이름 없음)',
      neis: null,
      hwp: activitySide(entry),
      status: 'unclassified',
      message,
      correctionTarget: {
        sourceId: entry.sourceId,
        formIndex: entry.formIndex ?? 0,
        participantIndex: entry.participantIndex ?? 0,
      },
    })
  })

  const neisById = groupBy(neisEntries, entry => entry.studentId)
  const hwpById = groupBy(validHwp, entry => entry.studentId)
  const studentIds = [...new Set([...neisById.keys(), ...hwpById.keys()])]
  const rows = studentIds.flatMap(studentId => matchVolunteerStudentActivities(
    studentId,
    neisById.get(studentId) || [],
    hwpById.get(studentId) || [],
    rosterById.get(studentId)?.name,
  )).sort(compareVolunteerRows)

  return { rows, unclassified: unclassified.sort(compareVolunteerRows), duplicates }
}

type VolunteerRosterEntry = {
  id: string
  source: 'neis' | 'hwp'
  sourceId: string
  sourceName: string
  sourceLocation: string
  studentId: string
  name: string
  activity: string
  startDate: string
  endDate: string
  hours: number | null
  duplicateCount: number
  correctionNote?: string
  formIndex?: number
  participantIndex?: number
}

function groupBy<T>(items: T[], keyOf: (item: T) => string) {
  const grouped = new Map<string, T[]>()
  items.forEach(item => {
    const key = keyOf(item)
    grouped.set(key, [...(grouped.get(key) || []), item])
  })
  return grouped
}

function markDuplicateVolunteerEntries(entries: VolunteerRosterEntry[], source: 'neis' | 'hwp') {
  const grouped = groupBy(entries, entry => [
    entry.studentId,
    normalize(entry.name),
    normalizeMeaningful(entry.activity),
    entry.startDate,
    entry.endDate,
    entry.hours ?? '',
  ].join('|'))
  return [...grouped.values()].filter(group => group.length > 1).map(group => {
    group.forEach(entry => { entry.duplicateCount = group.length })
    return {
      source,
      studentId: group[0].studentId,
      name: group[0].name,
      count: group.length,
      activity: group[0].activity,
      sourceNames: unique(group.map(entry => entry.sourceName)),
    }
  })
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function matchVolunteerStudentActivities(
  studentId: string,
  neisEntries: VolunteerRosterEntry[],
  hwpEntries: VolunteerRosterEntry[],
  rosterName?: string,
) {
  const rows: VolunteerRosterComparisonRow[] = []
  const usedHwp = new Set<string>()
  const idParts = studentIdParts(studentId)
  const displayName = rosterName || neisEntries[0]?.name || hwpEntries[0]?.name || '(이름 없음)'

  neisEntries.forEach(neis => {
    const candidate = hwpEntries
      .filter(hwp => !usedHwp.has(hwp.id) && volunteerActivitiesMatch(neis, hwp))
      .sort((a, b) => volunteerActivityMatchScore(neis, b) - volunteerActivityMatchScore(neis, a))[0]
    if (candidate) usedHwp.add(candidate.id)
    rows.push({
      id: `${neis.id}:${candidate?.id || 'none'}`,
      studentId,
      grade: idParts.grade,
      className: idParts.className,
      displayName,
      neis: activitySide(neis),
      hwp: candidate ? activitySide(candidate) : null,
      status: candidate ? 'matched' : 'neis-only',
      message: candidate ? correctionMessage('내용과 시간이 일치합니다.', candidate) : unmatchedActivityMessage(neis, hwpEntries, 'neis'),
    })
  })

  hwpEntries.filter(hwp => !usedHwp.has(hwp.id)).forEach(hwp => {
    rows.push({
      id: `none:${hwp.id}`,
      studentId,
      grade: idParts.grade,
      className: idParts.className,
      displayName,
      neis: null,
      hwp: activitySide(hwp),
      status: 'hwp-only',
      message: correctionMessage(unmatchedActivityMessage(hwp, neisEntries, 'hwp'), hwp),
    })
  })
  return rows
}

function volunteerActivitiesMatch(a: VolunteerRosterEntry, b: VolunteerRosterEntry) {
  return volunteerActivityContentMatches(a.activity, b.activity) && volunteerHoursMatch(a.hours, b.hours)
}

function volunteerActivityContentMatches(a: string, b: string) {
  const x = normalizeMeaningful(a)
  const y = normalizeMeaningful(b)
  return Boolean(x && y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)))))
}

function volunteerHoursMatch(a: number | null, b: number | null) {
  if (a == null || b == null) return a == null && b == null
  return Math.abs(a - b) < 0.001
}

function volunteerActivityMatchScore(a: VolunteerRosterEntry, b: VolunteerRosterEntry) {
  const x = normalizeMeaningful(a.activity)
  const y = normalizeMeaningful(b.activity)
  return (x === y ? 100 : 60) + (volunteerHoursMatch(a.hours, b.hours) ? 20 : 0)
}

function unmatchedActivityMessage(entry: VolunteerRosterEntry, opposite: VolunteerRosterEntry[], side: 'neis' | 'hwp') {
  const sameContent = opposite.find(candidate => volunteerActivityContentMatches(entry.activity, candidate.activity))
  if (sameContent && !volunteerHoursMatch(entry.hours, sameContent.hours)) {
    return `상대 자료에 같은 내용이 있으나 시간이 다릅니다. 나이스 ${side === 'neis' ? hoursText(entry.hours) : hoursText(sameContent.hours)} / 확인서 ${side === 'hwp' ? hoursText(entry.hours) : hoursText(sameContent.hours)}`
  }
  return side === 'neis' ? '나이스에만 있는 활동입니다.' : '확인서에만 있는 활동입니다.'
}

function hoursText(hours: number | null) {
  return hours == null ? '시간 없음' : `${hours}시간`
}

function correctionMessage(message: string, entry: VolunteerRosterEntry) {
  return entry.correctionNote ? `${message} · 수기 수정: ${entry.correctionNote}` : message
}

function activitySide(entry: VolunteerRosterEntry): VolunteerActivitySide {
  return {
    content: entry.activity,
    hours: entry.hours,
    startDate: entry.startDate,
    endDate: entry.endDate,
    sourceName: entry.sourceName,
    sourceLocation: entry.sourceLocation,
    duplicateCount: entry.duplicateCount,
    correctionNote: entry.correctionNote,
  }
}

function compareVolunteerRows(a: VolunteerRosterComparisonRow, b: VolunteerRosterComparisonRow) {
  return a.studentId.localeCompare(b.studentId, 'ko', { numeric: true })
    || a.displayName.localeCompare(b.displayName, 'ko')
    || (a.neis?.startDate || a.hwp?.startDate || '').localeCompare(b.neis?.startDate || b.hwp?.startDate || '')
}

export function validateIssuanceDraft(draft: VolunteerCertificateDraft) {
  const errors: string[] = []
  if (!draft.activityName.trim()) errors.push('봉사활동명을 입력해 주세요.')
  if (!draft.startDate || !draft.endDate) errors.push('활동 시작일과 종료일을 입력해 주세요.')
  if (!draft.institution.trim()) errors.push('활동 기관을 입력해 주세요.')
  if (!draft.activityContent.trim()) errors.push('활동 내용을 입력해 주세요.')
  if (!draft.confirmTeacher.trim()) errors.push('확인 교사 이름을 입력해 주세요.')
  if (!draft.students.length) errors.push('학생 명단을 입력해 주세요.')
  if (draft.students.length > 68) errors.push('한 장 고정 양식은 최대 68명까지 지원합니다.')
  const ids = new Set<string>()
  draft.students.forEach((student, index) => {
    if (!/^[1-3]\d{3}$/.test(volunteerStudentId(student.studentId))) errors.push(`${index + 1}행 학번을 확인해 주세요. 봉사활동 확인서는 4자리 학번을 사용합니다.`)
    if (!student.name.trim()) errors.push(`${index + 1}행 이름을 입력해 주세요.`)
    const numericHours = Number(student.hours)
    const exceptionText = String(student.hours).trim()
    if ((!Number.isFinite(numericHours) || numericHours <= 0) && !exceptionText) errors.push(`${student.name || index + 1 + '행'}의 실제 시수 또는 결석·결과 등 예외 사유를 입력해 주세요.`)
    const id = volunteerStudentId(student.studentId)
    if (ids.has(id)) errors.push(`${id} 학번이 중복 입력되어 있습니다.`)
    ids.add(id)
  })
  return [...new Set(errors)]
}

function issue(severity: VolunteerValidationIssue['severity'], type: VolunteerValidationIssue['type'], studentId: string, name: string, message: string, hwpValue?: string, neisValue?: string): VolunteerValidationIssue {
  return { severity, type, studentId, name, message, hwpValue, neisValue }
}

function activityMatches(form: ParsedVolunteerForm, record: NeisVolunteerRecord) {
  const needles = [form.activityContent, form.activityName].map(normalizeMeaningful).filter(value => value.length >= 2)
  const target = normalizeMeaningful(record.activityContent)
  return needles.some(needle => target.includes(needle) || needle.includes(target))
}

function textMatches(a: string, b: string) {
  const x = normalizeMeaningful(a).replace(/^학교/, '')
  const y = normalizeMeaningful(b).replace(/^학교/, '')
  return x.includes(y) || y.includes(x)
}

function normalize(value: string) { return value.replace(/\s+/g, '').trim() }
function normalizeMeaningful(value: string) { return normalize(value).replace(/[()（）·ㆍ,._\-]/g, '').replace(/^\(학교\)/, '') }

function excelDate(value: unknown) {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}` : ''
  }
  const text = String(value ?? '').trim()
  const match = text.match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/)
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : text
}

function expandBrokenRange(sheet: XLSX.WorkSheet) {
  const cells = Object.keys(sheet).filter(key => !key.startsWith('!') && /^[A-Z]+\d+$/.test(key))
  if (!cells.length) return
  const ranges = cells.map(XLSX.utils.decode_cell)
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: Math.min(...ranges.map(cell => cell.r)), c: Math.min(...ranges.map(cell => cell.c)) },
    e: { r: Math.max(...ranges.map(cell => cell.r)), c: Math.max(...ranges.map(cell => cell.c)) },
  })
}
