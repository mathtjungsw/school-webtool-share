import * as CFB from 'cfb'
import { readFileSync } from 'fs'
import { deflateRawSync, inflateRawSync } from 'zlib'

export interface VolunteerStudentInput {
  studentId: string
  name: string
  hours: number | string
  remarks?: string
}

export interface VolunteerCertificateDraftInput {
  activityName: string
  startDate: string
  endDate: string
  institution: string
  area: 'neighbor' | 'environment' | 'campaign'
  location: string
  activityContent: string
  confirmTeacher: string
  schoolName?: string
  commonRemarks?: string
  students: VolunteerStudentInput[]
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

interface HwpRecord { tag: number; level: number; payload: Buffer }
interface CellRange { start: number; end: number; text: string }

const TAG_PARA_HEADER = 66
const TAG_PARA_TEXT = 67
const TAG_LIST_HEADER = 72
const TAG_CTRL_HEADER = 71

export function buildVolunteerCertificateHwp(
  singleTemplatePath: string,
  doubleTemplatePath: string,
  draft: VolunteerCertificateDraftInput,
) {
  const students = draft.students.filter(student => student.studentId.trim() || student.name.trim())
  if (!students.length) throw new Error('확인서에 입력할 학생이 없습니다.')
  if (students.length > 68) throw new Error('한 장 출력은 최대 68명까지 지원합니다. 활동 명단을 나누어 발급해 주세요.')
  students.forEach((student, index) => {
    if (!student.studentId.trim() || !student.name.trim()) throw new Error(`${index + 1}번째 학생의 학번 또는 이름이 비어 있습니다.`)
    const hours = Number(student.hours)
    if ((!Number.isFinite(hours) || hours <= 0) && !String(student.hours).trim()) throw new Error(`${student.name} 학생의 실제 봉사 시수 또는 예외 사유를 입력해 주세요.`)
  })

  const useSingle = students.length <= 20
  const templatePath = useSingle ? singleTemplatePath : doubleTemplatePath
  const sourceFormIndex = useSingle ? 0 : students.length <= 40 ? 1 : students.length <= 60 ? 5 : 0
  const compound = CFB.read(readFileSync(templatePath), { type: 'buffer' })
  const fileHeader = findEntry(compound, 'FileHeader')
  const section = findEntry(compound, 'Section0')
  const compressed = (Buffer.from(fileHeader.content).readUInt32LE(36) & 1) === 1
  const original = parseRecords(compressed ? inflateRawSync(Buffer.from(section.content)) : Buffer.from(section.content))
  const records = isolateForm(original, sourceFormIndex)
  const tableStart = findTableStarts(records)[0]
  const tableEnd = findTopLevelTableEnd(records, tableStart)
  const cells = findCellRanges(records, tableStart, tableEnd)
  const capacity = useSingle ? 20 : students.length <= 40 ? 40 : students.length <= 60 ? 60 : 68
  const values = buildCellValues(draft, students, capacity, !useSingle)
  const replacements = new Map<number, { end: number; records: HwpRecord[] }>()
  Object.entries(values).forEach(([cellIndex, value]) => {
    const range = cells[Number(cellIndex)]
    if (!range) throw new Error(`봉사활동 HWP 양식의 ${cellIndex}번 셀을 찾지 못했습니다.`)
    replacements.set(range.start, { end: range.end, records: replaceCell(records.slice(range.start, range.end), value) })
  })
  const rebuilt: HwpRecord[] = []
  for (let index = 0; index < records.length;) {
    const replacement = replacements.get(index)
    if (replacement) {
      rebuilt.push(...replacement.records)
      index = replacement.end
    } else {
      rebuilt.push(records[index])
      index += 1
    }
  }
  const encoded = encodeRecords(rebuilt)
  const content = compressed ? deflateRawSync(encoded) : encoded
  section.content = content
  section.size = content.length
  const preview = compound.FileIndex.find(entry => entry.name === 'PrvText')
  if (preview) {
    preview.content = Buffer.from(buildPreviewText(draft, students), 'utf16le')
    preview.size = preview.content.length
  }
  return Buffer.from(CFB.write(compound, { type: 'buffer' }))
}

export function parseVolunteerHwpFile(filePath: string) {
  return parseVolunteerHwpBuffer(readFileSync(filePath))
}

export function parseVolunteerHwpBuffer(buffer: Buffer): ParsedVolunteerForm[] {
  const compound = CFB.read(buffer, { type: 'buffer' })
  const fileHeader = findEntry(compound, 'FileHeader')
  const sectionEntries = compound.FileIndex
    .filter(entry => /^Section\d+$/.test(entry.name) && entry.content)
    .sort((a, b) => Number(a.name.slice(7)) - Number(b.name.slice(7)))
  const compressed = (Buffer.from(fileHeader.content).readUInt32LE(36) & 1) === 1
  const forms: ParsedVolunteerForm[] = []
  sectionEntries.forEach(entry => {
    const bytes = Buffer.from(entry.content!)
    const records = parseRecords(compressed ? inflateRawSync(bytes) : bytes)
    findTableStarts(records).forEach(start => {
      const end = findTopLevelTableEnd(records, start)
      const cells = findCellRanges(records, start, end)
      if (cells.length < 30 || !cells[0]?.text.includes('봉사활동 확인서')) return
      forms.push(parseForm(cells, forms.length))
    })
  })
  if (!forms.length) throw new Error('봉사활동 확인서 표를 찾지 못했습니다. 첨부된 웅천고 양식으로 만든 HWP인지 확인해 주세요.')
  return forms
}

function buildCellValues(
  draft: VolunteerCertificateDraftInput,
  students: VolunteerStudentInput[],
  capacity: number,
  doubleColumn: boolean,
) {
  const values: Record<number, string> = {
    0: `학교 교육계획에 의한 각종 도우미 봉사활동 확인서\n(${draft.activityName.trim()})`,
    2: dateRangeKorean(draft.startDate, draft.endDate),
    4: draft.institution.trim(),
    6: areaText(draft.area),
    8: draft.location.trim(),
    10: draft.activityContent.trim(),
  }
  const footerIndex = doubleColumn ? (capacity === 40 ? 182 : capacity === 60 ? 262 : 294) : 98
  values[footerIndex] = `위 학생들은 위와 같이 ${draft.activityName.trim()} 봉사활동에 참여하였으며 활동 시간은 개인별 실제 참여시간임을 확인합니다.\n확인자 : 교사 ${draft.confirmTeacher.trim()} (인)\n${(draft.schoolName || '웅천고등학교').trim()}장(직인)`
  if (!doubleColumn) {
    values[21] = draft.commonRemarks?.trim() || ''
    for (let row = 0; row < capacity; row += 1) {
      const student = students[row]
      const start = row === 0 ? 17 : 22 + (row - 1) * 4
      values[start] = student ? String(row + 1) : ''
      values[start + 1] = student ? formatVolunteerStudentId(student.studentId) : ''
      values[start + 2] = student?.name.trim() || ''
      values[start + 3] = student ? formatHours(student.hours) : ''
    }
    return values
  }
  values[29] = draft.commonRemarks?.trim() || ''
  const rowsPerSide = capacity / 2
  for (let slot = 0; slot < capacity; slot += 1) {
    const side = slot < rowsPerSide ? 0 : 1
    const row = side === 0 ? slot : slot - rowsPerSide
    const student = students[slot]
    const start = row === 0 ? 21 + side * 4 : 30 + (row - 1) * 8 + side * 4
    values[start] = student ? String(slot + 1) : ''
    values[start + 1] = student ? formatVolunteerStudentId(student.studentId) : ''
    values[start + 2] = student?.name.trim() || ''
    values[start + 3] = student ? formatHours(student.hours) : ''
  }
  return values
}

function parseForm(cells: CellRange[], formIndex: number): ParsedVolunteerForm {
  const isDouble = cells[16]?.text.replace(/\s/g, '').includes('번호')
  const capacity = isDouble ? Math.max(0, Math.round((cells.length - 23) / 4)) : 20
  const participants: ParsedVolunteerParticipant[] = []
  const previousHours: Array<number | null> = [null, null]
  const readStudent = (start: number, side: number) => {
    const studentId = formatVolunteerStudentId(cleanText(cells[start + 1]?.text))
    const name = cleanText(cells[start + 2]?.text)
    const rawHours = cleanText(cells[start + 3]?.text)
    let hours = parseHours(rawHours)
    if (hours == null && /[″〃"]/u.test(rawHours)) hours = previousHours[side]
    if (hours != null) previousHours[side] = hours
    const exception = hours == null ? rawHours.trim() : ''
    if ((studentId || name) && !/결석|결과|조퇴|지각|미참여|불참|병결|인정결/u.test(exception)) participants.push({ studentId, name, hours, remarks: exception })
  }
  if (isDouble) {
    const rows = capacity / 2
    for (let side = 0; side < 2; side += 1) {
      for (let row = 0; row < rows; row += 1) {
        readStudent(row === 0 ? 21 + side * 4 : 30 + (row - 1) * 8 + side * 4, side)
      }
    }
  } else {
    for (let row = 0; row < capacity; row += 1) readStudent(row === 0 ? 17 : 22 + (row - 1) * 4, 0)
  }
  const title = cleanText(cells[0]?.text)
  const range = parseDateRange(cleanText(cells[2]?.text))
  const footer = cleanText(cells[cells.length - 1]?.text)
  return {
    formIndex,
    activityName: title.match(/\(([^()]+)\)/)?.[1]?.trim() || title.split(/\r?\n/).at(-1)?.trim() || '',
    startDate: range.startDate,
    endDate: range.endDate,
    institution: cleanText(cells[4]?.text),
    area: cleanText(cells[6]?.text),
    location: cleanText(cells[8]?.text),
    activityContent: cleanText(cells[10]?.text),
    confirmTeacher: footer.match(/확인자\s*:\s*교사\s*(.+?)\s*\(인\)/)?.[1]?.trim() || '',
    participants,
  }
}

function isolateForm(records: HwpRecord[], formIndex: number) {
  const starts = findTableStarts(records)
  const start = starts[formIndex]
  if (start == null) throw new Error('선택한 인원 구간의 봉사활동 HWP 고정 양식을 찾지 못했습니다.')
  const prefix = records.slice(0, starts[0])
  let end = findTopLevelTableEnd(records, start)
  const noteText = records.findIndex((record, index) => index >= end && index < (starts[formIndex + 1] ?? records.length) && record.tag === TAG_PARA_TEXT && recordText(record).includes('※ 인정시간'))
  if (noteText >= 0) {
    end = noteText + 1
    while (end < records.length && records[end].level > 0) end += 1
  }
  return [...prefix, ...records.slice(start, end)]
}

function findTableStarts(records: HwpRecord[]) {
  const starts: number[] = []
  records.forEach((record, index) => {
    if (record.tag === TAG_CTRL_HEADER && record.level === 1 && record.payload.subarray(0, 4).toString('ascii') === ' lbt') starts.push(index)
  })
  return starts
}

function findTopLevelTableEnd(records: HwpRecord[], start: number) {
  let end = start + 1
  while (end < records.length && !(records[end].level === 0 && records[end].tag === TAG_PARA_HEADER)) end += 1
  return end
}

function findCellRanges(records: HwpRecord[], start: number, end: number) {
  const ranges: CellRange[] = []
  for (let index = start; index < end; index += 1) {
    const record = records[index]
    if (record.tag !== TAG_LIST_HEADER || record.level !== 2) continue
    let cellEnd = index + 1
    while (cellEnd < end) {
      const next = records[cellEnd]
      if ((next.tag === TAG_LIST_HEADER && next.level === 2) || next.level < 2) break
      cellEnd += 1
    }
    ranges.push({
      start: index,
      end: cellEnd,
      text: records.slice(index, cellEnd).filter(item => item.tag === TAG_PARA_TEXT).map(recordText).join('\n').replace(/\r/g, ''),
    })
  }
  return ranges
}

function replaceCell(records: HwpRecord[], value: string) {
  const headerIndexes = records.map((record, index) => record.tag === TAG_PARA_HEADER ? index : -1).filter(index => index >= 0)
  if (!records[0] || !headerIndexes.length) throw new Error('봉사활동 HWP 표 셀 형식이 올바르지 않습니다.')
  const sourceLines = value.replace(/\r\n?/g, '\n').split('\n')
  const lines = sourceLines.length <= headerIndexes.length
    ? sourceLines
    : [...sourceLines.slice(0, headerIndexes.length - 1), sourceLines.slice(headerIndexes.length - 1).join(' ')]
  const next: HwpRecord[] = records.slice(0, headerIndexes[0])
  headerIndexes.forEach((headerIndex, paragraphIndex) => {
    const end = headerIndexes[paragraphIndex + 1] ?? records.length
    const segment = records.slice(headerIndex, end)
    const paragraphHeader = segment[0]
    const existingText = segment.find(record => record.tag === TAG_PARA_TEXT)
    const text = lines[paragraphIndex] ?? ''
    const headerPayload = Buffer.from(paragraphHeader.payload)
    const originalCount = headerPayload.readUInt32LE(0)
    const characterCount = Buffer.from(`${text}\r`, 'utf16le').length / 2
    headerPayload.writeUInt32LE(((originalCount & 0x80000000) | characterCount) >>> 0, 0)
    next.push({ ...paragraphHeader, payload: headerPayload })
    if (text) next.push({ tag: TAG_PARA_TEXT, level: existingText?.level ?? paragraphHeader.level + 1, payload: Buffer.from(`${text}\r`, 'utf16le') })
    next.push(...segment.slice(1).filter(record => record.tag !== TAG_PARA_TEXT))
  })
  return next
}

function findEntry(compound: CFB.CFB$Container, name: string) {
  const entry = compound.FileIndex.find(item => item.name === name)
  if (!entry?.content) throw new Error(`HWP 파일의 ${name} 영역을 찾지 못했습니다.`)
  return entry
}

function parseRecords(data: Buffer) {
  const records: HwpRecord[] = []
  let offset = 0
  while (offset + 4 <= data.length) {
    const header = data.readUInt32LE(offset); offset += 4
    const tag = header & 0x3ff
    const level = (header >>> 10) & 0x3ff
    let size = (header >>> 20) & 0xfff
    if (size === 0xfff) { size = data.readUInt32LE(offset); offset += 4 }
    if (offset + size > data.length) throw new Error('HWP 레코드 범위가 올바르지 않습니다.')
    records.push({ tag, level, payload: Buffer.from(data.subarray(offset, offset + size)) })
    offset += size
  }
  return records
}

function encodeRecords(records: HwpRecord[]) {
  const chunks: Buffer[] = []
  records.forEach(record => {
    const size = record.payload.length
    const extended = size >= 0xfff
    const header = (record.tag & 0x3ff) | ((record.level & 0x3ff) << 10) | ((extended ? 0xfff : size) << 20)
    const bytes = Buffer.alloc(extended ? 8 : 4)
    bytes.writeUInt32LE(header >>> 0, 0)
    if (extended) bytes.writeUInt32LE(size, 4)
    chunks.push(bytes, record.payload)
  })
  return Buffer.concat(chunks)
}

function recordText(record: HwpRecord) { return record.payload.toString('utf16le') }
function cleanText(value = '') { return value.replace(/\r/g, '').replace(/^[汤捯]+/u, '').trim() }
function formatVolunteerStudentId(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (/^[1-3]\d{4}$/.test(digits)) return `${digits[0]}${digits.slice(2)}`
  return digits
}
function formatHours(value: number | string) {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return `${Number.isInteger(numeric) ? numeric.toFixed(0) : String(numeric)}시간`
  return String(value).trim()
}

function areaText(area: VolunteerCertificateDraftInput['area']) {
  return `이웃돕기활동(${area === 'neighbor' ? 'O' : ' '})  환경보호활동(${area === 'environment' ? 'O' : ' '})  캠페인활동(${area === 'campaign' ? 'O' : ' '})`
}

function dateRangeKorean(start: string, end: string) {
  const format = (value: string) => { const [y, m, d] = value.split('-').map(Number); return `${y}년 ${m}월 ${d}일` }
  return start === end ? format(start) : `${format(start)} ~ ${format(end)}`
}

function parseDateRange(value: string) {
  const matches = [...value.matchAll(/(\d{4})\s*[.년-]\s*(\d{1,2})\s*[.월-]\s*(\d{1,2})/g)]
  const iso = (match?: RegExpMatchArray) => match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : ''
  return { startDate: iso(matches[0]), endDate: iso(matches[1] || matches[0]) }
}

function parseHours(value: string) {
  const match = value.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function buildPreviewText(draft: VolunteerCertificateDraftInput, students: VolunteerStudentInput[]) {
  return [`학교 교육계획에 의한 각종 도우미 봉사활동 확인서 (${draft.activityName})`, dateRangeKorean(draft.startDate, draft.endDate), `${students.length}명`, ...students.map(student => `${formatVolunteerStudentId(student.studentId)} ${student.name} ${formatHours(student.hours)}`)].join('\r\n')
}
