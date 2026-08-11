import * as CFB from 'cfb'
import { readFileSync } from 'fs'
import { deflateRawSync, inflateRawSync } from 'zlib'

interface TimetablePlanEntryInput {
  kind: 'exchange' | 'substitution' | 'change'
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
}

export interface TimetablePlanDraftInput {
  meta: {
    reason: string
    customReason: string
    startDate: string
    endDate: string
    author: string
    documentDate: string
  }
  entries: TimetablePlanEntryInput[]
}

interface HwpRecord {
  tag: number
  level: number
  payload: Buffer
}

const TAG_PARA_HEADER = 66
const TAG_PARA_TEXT = 67
const TAG_PARA_CHAR_SHAPE = 68
const TAG_LIST_HEADER = 72
const DATA_ROW_COUNT = 6
const DATA_COLUMN_COUNT = 14

export function buildTimetablePlanHwp(templatePath: string, draft: TimetablePlanDraftInput) {
  const compound = CFB.read(readFileSync(templatePath), { type: 'buffer' })
  const fileHeader = findEntry(compound, 'FileHeader')
  const section = findEntry(compound, 'Section0')
  const compressed = (Buffer.from(fileHeader.content).readUInt32LE(36) & 1) === 1
  const sectionBytes = Buffer.from(section.content)
  const records = parseRecords(compressed ? inflateRawSync(sectionBytes) : sectionBytes)
  const pages = chunkEntries(draft.entries)
  pages.forEach((entries, pageIndex) => {
    const pageDraft = { ...draft, entries }
    const nextRecords = replaceDocumentContents(records, pageDraft, pageIndex * DATA_ROW_COUNT)
    const nextSection = encodeRecords(nextRecords)
    const content = compressed ? deflateRawSync(nextSection) : nextSection
    if (pageIndex === 0) {
      section.content = content
      section.size = content.length
    } else {
      CFB.utils.cfb_add(compound, `BodyText/Section${pageIndex}`, content)
    }
  })
  updateDocumentSectionCount(compound, pages.length, compressed)

  const previewText = compound.FileIndex.find(entry => entry.name === 'PrvText')
  if (previewText) {
    previewText.content = Buffer.from(buildPreviewText(draft), 'utf16le')
    previewText.size = previewText.content.length
  }
  return Buffer.from(CFB.write(compound, { type: 'buffer' }))
}

function findEntry(compound: CFB.CFB$Container, name: string) {
  const entry = compound.FileIndex.find(item => item.name === name)
  if (!entry?.content) throw new Error(`교환보강 HWP 템플릿의 ${name} 영역을 찾을 수 없습니다.`)
  return entry
}

function parseRecords(data: Buffer) {
  const records: HwpRecord[] = []
  let offset = 0
  while (offset + 4 <= data.length) {
    const header = data.readUInt32LE(offset)
    offset += 4
    const tag = header & 0x3ff
    const level = (header >>> 10) & 0x3ff
    let size = (header >>> 20) & 0xfff
    if (size === 0xfff) {
      if (offset + 4 > data.length) throw new Error('HWP 레코드 크기 정보가 손상되었습니다.')
      size = data.readUInt32LE(offset)
      offset += 4
    }
    if (offset + size > data.length) throw new Error('HWP 레코드 범위가 손상되었습니다.')
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
    const header = (record.tag & 0x3ff)
      | ((record.level & 0x3ff) << 10)
      | ((extended ? 0xfff : size) << 20)
    const headerBuffer = Buffer.alloc(extended ? 8 : 4)
    headerBuffer.writeUInt32LE(header >>> 0, 0)
    if (extended) headerBuffer.writeUInt32LE(size, 4)
    chunks.push(headerBuffer, record.payload)
  })
  return Buffer.concat(chunks)
}

function replaceDocumentContents(records: HwpRecord[], draft: TimetablePlanDraftInput, rowOffset = 0) {
  const cellRanges = findDataCellRanges(records)
  if (cellRanges.length < DATA_ROW_COUNT * DATA_COLUMN_COUNT) {
    throw new Error('교환보강 HWP 템플릿의 수업계획표 6행을 찾을 수 없습니다.')
  }

  const rowValues = buildDataRows(draft, rowOffset)
  const replacements = new Map<number, { end: number; records: HwpRecord[] }>()
  rowValues.flat().forEach((value, index) => {
    const range = cellRanges[index]
    replacements.set(range.start, {
      end: range.end,
      records: replaceCell(records.slice(range.start, range.end), value),
    })
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

  replaceParagraph(rebuilt, text => text.startsWith('1. 사  유(택1) :'), `1. 사  유(택1) : ${reasonText(draft)}`)
  replaceParagraph(rebuilt, text => text.trimStart().startsWith('일      시 :'), `   일      시 :  ${periodText(draft)}`)
  replaceParagraph(rebuilt, text => /^\d{4}년\s+\d+월\s+\d+일/.test(text.trim()), `${fullDateKorean(draft.meta.documentDate)}   `)
  replaceParagraph(rebuilt, text => text.startsWith('웅천고등학교 교사'), `웅천고등학교 교사   성명 : ${draft.meta.author.trim()} (인)`)

  return rebuilt
}

function findDataCellRanges(records: HwpRecord[]) {
  const ranges: Array<{ start: number; end: number; text: string }> = []
  records.forEach((record, start) => {
    if (record.tag !== TAG_LIST_HEADER || record.level !== 2) return
    let end = start + 1
    while (end < records.length) {
      const next = records[end]
      if ((next.tag === TAG_LIST_HEADER && next.level === 2) || next.level < 2) break
      end += 1
    }
    const text = records.slice(start, end)
      .filter(item => item.tag === TAG_PARA_TEXT)
      .map(item => recordText(item).replace(/[\r\n]/g, ''))
      .join('')
    ranges.push({ start, end, text })
  })

  const firstDataCell = ranges.findIndex((range, index) =>
    range.text === '1'
    && ranges[index + 1]?.text.replace(/[()금월화수목토일]/g, '').includes('8/14')
    && ranges[index + 2]?.text === '4'
    && ranges[index + 3]?.text === '2-3',
  )
  if (firstDataCell < 0) throw new Error('교환보강 HWP 템플릿의 첫 번째 입력행을 찾을 수 없습니다.')
  return ranges.slice(firstDataCell, firstDataCell + DATA_ROW_COUNT * DATA_COLUMN_COUNT)
}

function replaceCell(records: HwpRecord[], value: string) {
  const listHeader = records[0]
  const headerIndexes = records
    .map((record, index) => record.tag === TAG_PARA_HEADER ? index : -1)
    .filter(index => index >= 0)
  if (!listHeader || !headerIndexes.length) throw new Error('HWP 수업계획표 셀 형식이 손상되었습니다.')

  const sourceLines = value.replace(/\r\n?/g, '\n').trim().split('\n')
  const lines = sourceLines.length <= headerIndexes.length
    ? sourceLines
    : [...sourceLines.slice(0, headerIndexes.length - 1), sourceLines.slice(headerIndexes.length - 1).join('\n')]
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
    if (text) {
      next.push({
        tag: TAG_PARA_TEXT,
        level: existingText?.level ?? paragraphHeader.level + 1,
        payload: Buffer.from(`${text}\r`, 'utf16le'),
      })
    }
    next.push(...segment.slice(1).filter(record => record.tag !== TAG_PARA_TEXT))
  })
  return next
}

function replaceParagraph(records: HwpRecord[], matches: (text: string) => boolean, value: string) {
  const textIndex = records.findIndex(record => record.tag === TAG_PARA_TEXT && matches(recordText(record).replace(/[\r\n]/g, '')))
  if (textIndex < 0) throw new Error('교환보강 HWP 템플릿의 기본 입력란을 찾을 수 없습니다.')
  const headerIndex = findPreviousParagraphHeader(records, textIndex)
  const text = value.replace(/\r\n?/g, '\n')
  records[textIndex] = { ...records[textIndex], payload: Buffer.from(`${text}\r`, 'utf16le') }
  const headerPayload = Buffer.from(records[headerIndex].payload)
  const originalCount = headerPayload.readUInt32LE(0)
  const characterCount = Buffer.from(`${text}\r`, 'utf16le').length / 2
  headerPayload.writeUInt32LE(((originalCount & 0x80000000) | characterCount) >>> 0, 0)
  records[headerIndex] = { ...records[headerIndex], payload: headerPayload }
}

function findPreviousParagraphHeader(records: HwpRecord[], from: number) {
  for (let index = from - 1; index >= 0; index -= 1) {
    if (records[index].tag === TAG_PARA_HEADER) return index
  }
  throw new Error('HWP 문단 머리 정보를 찾을 수 없습니다.')
}

function recordText(record: HwpRecord) {
  return record.payload.toString('utf16le')
}

function buildDataRows(draft: TimetablePlanDraftInput, rowOffset = 0) {
  const entries = draft.entries.slice(0, DATA_ROW_COUNT)
  return Array.from({ length: DATA_ROW_COUNT }, (_, index) => {
    const entry = entries[index]
    if (!entry) {
      const isFirstEmpty = index === entries.length
      const cells = Array.from({ length: DATA_COLUMN_COUNT }, () => '')
      cells[0] = String(rowOffset + index + 1)
      if (isFirstEmpty) [cells[1], cells[2], cells[3], cells[4]] = ['이', '하', '여', '백']
      return cells
    }
    return [
      String(rowOffset + index + 1),
      tableDate(entry.originalDate),
      String(slotPeriod(entry.originalSlotIndex)),
      entry.originalClass,
      entry.originalSubject,
      entry.originalTeacher,
      tableDate(entry.replacementDate),
      String(slotPeriod(entry.replacementSlotIndex)),
      entry.replacementClass,
      entry.replacementSubject,
      entry.replacementTeacher,
      '',
      planKindLabel(entry.kind),
      entry.note,
    ]
  })
}

function buildPreviewText(draft: TimetablePlanDraftInput) {
  const lines = [
    '<별첨 1>',
    '<교환·보강 계획서>',
    `1. 사  유(택1) : ${reasonText(draft)}`,
    `   일      시 : ${periodText(draft)}`,
    '2. 수업계획',
  ]
  draft.entries.forEach((entry, index) => {
    lines.push(`${index + 1}. ${tableDate(entry.originalDate).replace('\n', ' ')} ${slotPeriod(entry.originalSlotIndex)}교시 ${entry.originalClass} ${entry.originalSubject} ${entry.originalTeacher}`)
    lines.push(`   → ${tableDate(entry.replacementDate).replace('\n', ' ')} ${slotPeriod(entry.replacementSlotIndex)}교시 ${entry.replacementClass} ${entry.replacementSubject} ${entry.replacementTeacher} ${planKindLabel(entry.kind)}`)
  })
  lines.push(fullDateKorean(draft.meta.documentDate))
  lines.push(`웅천고등학교 교사 성명 : ${draft.meta.author.trim()} (인)`)
  return lines.join('\r\n')
}

function chunkEntries(entries: TimetablePlanEntryInput[]) {
  if (!entries.length) return [[]]
  return Array.from({ length: Math.ceil(entries.length / DATA_ROW_COUNT) }, (_, index) =>
    entries.slice(index * DATA_ROW_COUNT, (index + 1) * DATA_ROW_COUNT),
  )
}

function updateDocumentSectionCount(compound: CFB.CFB$Container, sectionCount: number, compressed: boolean) {
  const docInfo = findEntry(compound, 'DocInfo')
  const bytes = Buffer.from(docInfo.content)
  const records = parseRecords(compressed ? inflateRawSync(bytes) : bytes)
  const properties = records.find(record => record.tag === 16)
  if (!properties || properties.payload.length < 2) throw new Error('HWP 문서의 구역 수 정보를 찾을 수 없습니다.')
  const payload = Buffer.from(properties.payload)
  payload.writeUInt16LE(sectionCount, 0)
  properties.payload = payload
  const encoded = encodeRecords(records)
  docInfo.content = compressed ? deflateRawSync(encoded) : encoded
  docInfo.size = docInfo.content.length
}

function reasonText(draft: TimetablePlanDraftInput) {
  return draft.meta.reason === '기타'
    ? `기타(${draft.meta.customReason.trim()})`
    : draft.meta.reason
}

function periodText(draft: TimetablePlanDraftInput) {
  return draft.meta.startDate === draft.meta.endDate
    ? fullDate(draft.meta.startDate)
    : `${fullDate(draft.meta.startDate)} ~ ${fullDate(draft.meta.endDate)}`
}

function tableDate(value: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(year, month - 1, day).getDay()]
  return `${month}/${day}\n(${weekday})`
}

function fullDate(value: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return `${year}. ${month}. ${day}.`
}

function fullDateKorean(value: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}

function slotPeriod(slotIndex: number) {
  return (slotIndex % 7) + 1
}

function planKindLabel(kind: TimetablePlanEntryInput['kind']) {
  if (kind === 'exchange') return '교환'
  if (kind === 'substitution') return '보강'
  return '변경'
}
