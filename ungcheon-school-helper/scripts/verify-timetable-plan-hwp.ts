import * as CFB from 'cfb'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { inflateRawSync } from 'zlib'
import { buildTimetablePlanHwp, type TimetablePlanDraftInput } from '../electron/main/timetable-plan-hwp'
import { buildTimetablePlanHtml } from '../src/services/timetablePlanDocument'
import type { TimetablePlanDraft } from '../src/services/timetablePlan'

const outputDirectory = join(process.cwd(), 'tmp', 'pdfs', 'exchange-plan-20260814')
mkdirSync(outputDirectory, { recursive: true })

const draft: TimetablePlanDraftInput = {
  meta: {
    reason: '출장',
    customReason: '',
    startDate: '2026-08-14',
    endDate: '2026-08-14',
    author: '정승원',
    documentDate: '2026-08-10',
  },
  entries: [{
    kind: 'exchange',
    originalSlotIndex: 3,
    replacementSlotIndex: 1,
    originalDate: '2026-08-14',
    replacementDate: '2026-08-14',
    originalTeacher: '정승원',
    replacementTeacher: '박진우',
    originalClass: '2-3',
    replacementClass: '2-3',
    originalSubject: '논술',
    replacementSubject: '영어1',
    note: '',
  }],
}

const templatePath = join(process.cwd(), 'resources', 'templates', 'exchange-plan-template.hwp')
const result = buildTimetablePlanHwp(templatePath, draft)
const outputPath = join(outputDirectory, 'generated-reference-sample.hwp')
writeFileSync(outputPath, result)

const compound = CFB.read(readFileSync(outputPath), { type: 'buffer' })
const header = compound.FileIndex.find(entry => entry.name === 'FileHeader')
const section = compound.FileIndex.find(entry => entry.name === 'Section0')
if (!header?.content || !section?.content) throw new Error('생성된 HWP의 필수 스트림이 없습니다.')
if (!Buffer.from(header.content).subarray(0, 17).toString('ascii').startsWith('HWP Document File')) throw new Error('HWP 파일 머리글이 올바르지 않습니다.')
const raw = inflateRawSync(Buffer.from(section.content))
const text = extractParagraphText(raw)
for (const expected of ['1. 사  유(택1) : 출장', '2026. 8. 14.', '정승원', '박진우', '영어1', '2026년 8월 10일']) {
  if (!text.includes(expected)) throw new Error(`생성된 HWP에서 '${expected}' 내용을 찾을 수 없습니다.`)
}
if (!text.includes('이\r') || !text.includes('하\r') || !text.includes('여\r') || !text.includes('백\r')) {
  throw new Error('첫 번째 빈 행의 이하여백 표기가 없습니다.')
}

const changedDraft: TimetablePlanDraftInput = {
  meta: {
    reason: '기타',
    customReason: '교육과정 협의회 참석',
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    author: '홍길동',
    documentDate: '2026-08-31',
  },
  entries: [
    {
      kind: 'substitution',
      originalSlotIndex: 7,
      replacementSlotIndex: 7,
      originalDate: '2026-09-01',
      replacementDate: '2026-09-01',
      originalTeacher: '홍길동',
      replacementTeacher: '김교사',
      originalClass: '1-1',
      replacementClass: '1-1',
      originalSubject: '통합사회',
      replacementSubject: '통합사회',
      note: '교과협의 완료',
    },
    {
      kind: 'change',
      originalSlotIndex: 16,
      replacementSlotIndex: 18,
      originalDate: '2026-09-02',
      replacementDate: '2026-09-02',
      originalTeacher: '홍길동',
      replacementTeacher: '이교사',
      originalClass: '3-4',
      replacementClass: '3-4',
      originalSubject: '경제수학',
      replacementSubject: '경제수학',
      note: '',
    },
  ],
}
const changedOutputPath = join(outputDirectory, 'generated-content-replacement-sample.hwp')
writeFileSync(changedOutputPath, buildTimetablePlanHwp(templatePath, changedDraft))
const changedText = readHwpText(changedOutputPath)
for (const expected of ['기타(교육과정 협의회 참석)', '2026. 9. 1. ~ 2026. 9. 3.', '홍길동', '김교사', '통합사회', '교과협의 완료', '경제수학', '2026년 8월 31일']) {
  if (!changedText.includes(expected)) throw new Error(`다른 내용 치환 검증에서 '${expected}' 내용을 찾을 수 없습니다.`)
}
if (!changedText.includes('3\r') || !changedText.includes('이\r') || !changedText.includes('하\r') || !changedText.includes('여\r') || !changedText.includes('백\r')) {
  throw new Error('여러 행 출력 뒤 첫 번째 빈 행의 이하여백 표기가 없습니다.')
}

const multiPageDraft: TimetablePlanDraftInput = {
  ...draft,
  entries: Array.from({ length: 8 }, (_, index) => ({
    ...draft.entries[0],
    originalSubject: `결강과목${index + 1}`,
    replacementSubject: `실시과목${index + 1}`,
  })),
}
const multiPageOutputPath = join(outputDirectory, 'generated-multi-page-sample.hwp')
writeFileSync(multiPageOutputPath, buildTimetablePlanHwp(templatePath, multiPageDraft))
const multiPageCompound = CFB.read(readFileSync(multiPageOutputPath), { type: 'buffer' })
const sectionNames = multiPageCompound.FileIndex.map(entry => entry.name).filter(name => /^Section\d+$/.test(name)).sort()
if (sectionNames.join(',') !== 'Section0,Section1') throw new Error(`8개 항목 HWP의 구역 수가 올바르지 않습니다: ${sectionNames.join(',')}`)
const firstPageText = readHwpSectionText(multiPageCompound, 'Section0')
const secondPageText = readHwpSectionText(multiPageCompound, 'Section1')
if (!firstPageText.includes('결강과목6') || firstPageText.includes('결강과목7')) throw new Error('첫 페이지에 1~6번 항목이 올바르게 나뉘지 않았습니다.')
if (!secondPageText.includes('결강과목7') || !secondPageText.includes('결강과목8') || !secondPageText.includes('7\r') || !secondPageText.includes('8\r')) throw new Error('둘째 페이지에 7~8번 항목과 연속 번호가 없습니다.')
if (readDocumentSectionCount(multiPageCompound) !== 2) throw new Error('HWP 문서 속성의 구역 수가 2로 기록되지 않았습니다.')

const htmlDraft: TimetablePlanDraft = {
  meta: draft.meta,
  entries: draft.entries.map((entry, index) => ({
    ...entry,
    id: `preview-${index + 1}`,
    createdAt: '2026-08-10T00:00:00.000Z',
  })),
}
writeFileSync(join(outputDirectory, 'generated-preview.html'), buildTimetablePlanHtml(htmlDraft), 'utf8')
console.log(`PASS 편집 가능한 원본 HWP 템플릿 생성: ${outputPath}`)
console.log(`PASS 다른 내용·여러 행 HWP 치환: ${changedOutputPath}`)
console.log(`PASS 7개 이상 자동 페이지 분리: ${multiPageOutputPath}`)

function extractParagraphText(data: Buffer) {
  let offset = 0
  const paragraphs: string[] = []
  while (offset + 4 <= data.length) {
    const headerValue = data.readUInt32LE(offset)
    offset += 4
    const tag = headerValue & 0x3ff
    let size = (headerValue >>> 20) & 0xfff
    if (size === 0xfff) {
      size = data.readUInt32LE(offset)
      offset += 4
    }
    const payload = data.subarray(offset, offset + size)
    offset += size
    if (tag === 67) paragraphs.push(payload.toString('utf16le'))
  }
  return paragraphs.join('\n')
}

function readHwpText(path: string) {
  const hwp = CFB.read(readFileSync(path), { type: 'buffer' })
  return readHwpSectionText(hwp, 'Section0')
}

function readHwpSectionText(hwp: CFB.CFB$Container, sectionName: string) {
  const body = hwp.FileIndex.find(entry => entry.name === sectionName)
  if (!body?.content) throw new Error('생성된 HWP 본문 스트림이 없습니다.')
  return extractParagraphText(inflateRawSync(Buffer.from(body.content)))
}

function readDocumentSectionCount(hwp: CFB.CFB$Container) {
  const docInfo = hwp.FileIndex.find(entry => entry.name === 'DocInfo')
  if (!docInfo?.content) throw new Error('생성된 HWP 문서 정보 스트림이 없습니다.')
  const data = inflateRawSync(Buffer.from(docInfo.content))
  let offset = 0
  while (offset + 4 <= data.length) {
    const headerValue = data.readUInt32LE(offset)
    offset += 4
    const tag = headerValue & 0x3ff
    let size = (headerValue >>> 20) & 0xfff
    if (size === 0xfff) { size = data.readUInt32LE(offset); offset += 4 }
    if (tag === 16) return data.readUInt16LE(offset)
    offset += size
  }
  throw new Error('HWP 문서 속성 레코드를 찾을 수 없습니다.')
}
