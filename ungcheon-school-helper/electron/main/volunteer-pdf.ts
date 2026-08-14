import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { createRequire } from 'module'
import { createCanvas } from '@napi-rs/canvas'
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import type { ParsedVolunteerForm, ParsedVolunteerParticipant } from './volunteer-hwp'

const require = createRequire(import.meta.url)
const PAGE_WIDTH = 1191
const PAGE_HEIGHT = 1683
const TABLE_TOP = 490
const ROW_HEIGHT = 33
const NAME_COLUMNS = [{ left: 401, width: 96 }, { left: 881, width: 97 }]
const HOURS_COLUMNS = [{ left: 503, width: 101 }, { left: 984, width: 100 }]

export interface VolunteerPdfParseResult {
  forms: ParsedVolunteerForm[]
  pageCount: number
  analysisMode: 'text' | 'ocr' | 'mixed'
  pageModes: Array<'text' | 'ocr'>
  averageConfidence: number
  warnings: string[]
}

type TextItem = { text: string; x: number; y: number }

export async function parseVolunteerPdfFile(filePath: string): Promise<VolunteerPdfParseResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const bytes = new Uint8Array(readFileSync(filePath))
  const pdfPackage = require.resolve('pdfjs-dist/package.json')
  const wasmUrl = join(dirname(pdfPackage), 'wasm').replace(/\\/g, '/') + '/'
  const document = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false, wasmUrl } as any).promise
  const forms: ParsedVolunteerForm[] = []
  const pageModes: Array<'text' | 'ocr'> = []
  const warnings: string[] = []
  const confidences: number[] = []
  let worker: Worker | null = null

  try {
    for (let index = 0; index < document.numPages; index += 1) {
      const page = await document.getPage(index + 1)
      const textContent = await page.getTextContent()
      const text = textContent.items.map((item: any) => String(item.str || '')).join(' ')
      const normalized = compact(text)
      const coordinatorForm = parseCoordinatorForm(text, index)
      if (coordinatorForm) {
        pageModes.push('text')
        forms.push(coordinatorForm)
        confidences.push(100)
        continue
      }
      const textBased = text.replace(/\s/g, '').length >= 40
        && /봉사활동/.test(normalized)
        && /(성명|이름)/.test(normalized)
      if (textBased) {
        pageModes.push('text')
        const items = textItems(textContent.items as any[], page.view)
        forms.push(parseTextPage(items, text, index))
        confidences.push(100)
        continue
      }

      pageModes.push('ocr')
      worker ||= await createOfflineWorker()
      const canvas = await renderPage(page)
      const parsed = await parseOcrPage(worker, canvas, index)
      forms.push(parsed.form)
      confidences.push(parsed.confidence)
      warnings.push(...parsed.warnings)
    }
  } finally {
    if (worker) await worker.terminate()
    await (document as any).cleanup?.()
  }

  const modes = new Set(pageModes)
  return {
    forms,
    pageCount: document.numPages,
    analysisMode: modes.size > 1 ? 'mixed' : pageModes[0] || 'text',
    pageModes,
    averageConfidence: confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0,
    warnings,
  }
}

function parseCoordinatorForm(pageText: string, formIndex: number): ParsedVolunteerForm | null {
  const compactText = pageText.replace(/\s+/g, '')
  const encoded = compactText.match(/UNGCOORDV1:([A-Za-z0-9+/=]+)/)?.[1]
  if (!encoded) return null
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as ParsedVolunteerForm
    if (!parsed || !Array.isArray(parsed.participants)) return null
    return {
      ...parsed,
      formIndex,
      participants: parsed.participants.map(participant => ({
        ...participant,
        studentId: String(participant.studentId || '').replace(/\D/g, '').slice(-4),
        name: String(participant.name || '').trim(),
        hours: participant.hours == null ? null : Number(participant.hours),
        remarks: String(participant.remarks || ''),
      })),
    }
  } catch {
    return null
  }
}

async function createOfflineWorker() {
  const language = require('@tesseract.js-data/kor') as { langPath: string; gzip: boolean }
  return createWorker('kor', OEM.LSTM_ONLY, {
    langPath: language.langPath,
    gzip: language.gzip,
    cacheMethod: 'none',
    workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js'),
    corePath: dirname(require.resolve('tesseract.js-core/package.json')),
  })
}

async function renderPage(page: any) {
  const viewport = page.getViewport({ scale: PAGE_WIDTH / page.getViewport({ scale: 1 }).width })
  const canvas = createCanvas(PAGE_WIDTH, Math.round(viewport.height))
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas: canvas as any, canvasContext: context as any, viewport }).promise
  if (canvas.height === PAGE_HEIGHT) return canvas
  const normalized = createCanvas(PAGE_WIDTH, PAGE_HEIGHT)
  const normalizedContext = normalized.getContext('2d')
  normalizedContext.fillStyle = '#fff'
  normalizedContext.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  normalizedContext.drawImage(canvas, 0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  return normalized
}

async function parseOcrPage(worker: Worker, canvas: any, formIndex: number) {
  const png = canvas.toBuffer('image/png')
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: '1' })
  const recognize = async (left: number, top: number, width: number, height: number) => {
    const result = await worker.recognize(png, { rectangle: { left, top, width, height } })
    return { text: cleanOcr(result.data.text), confidence: result.data.confidence }
  }
  const [identity, period, institution, area, location, activity, teacher] = await Promise.all([
    recognize(285, 205, 800, 42),
    recognize(285, 240, 800, 42),
    recognize(285, 276, 800, 40),
    recognize(285, 310, 800, 45),
    recognize(285, 347, 800, 42),
    recognize(285, 382, 800, 48),
    recognize(450, 1240, 430, 52),
  ])
  const identityCompact = compact(identity.text)
  const gradeClass = identityCompact.match(/([1-3])학년\(?([1-9]\d*)\)?반/) || identityCompact.match(/\(([1-3])\)학년\(([1-9]\d*)\)반/)
  const grade = gradeClass?.[1] || ''
  const className = gradeClass?.[2] || ''
  const totalStudents = Number(identityCompact.match(/총원(\d+)명/)?.[1] || 40)
  const expectedParticipants = Number(identityCompact.match(/(\d+)명참가/)?.[1] || 0)
  const dates = parseDate(period.text)
  const content = normalizeActivity(stripLabel(activity.text, '활동내용') || stripLabel(activity.text, '봉사활동'))
  const participants: ParsedVolunteerParticipant[] = []
  const candidates: Array<ParsedVolunteerParticipant & { ink: number; numeric: boolean }> = []
  const confidenceValues = [identity, period, institution, area, location, activity, teacher].map(value => value.confidence)
  const warnings: string[] = []
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data

  if (!grade || !className) warnings.push(`${formIndex + 1}쪽의 학년·반을 정확히 읽지 못했습니다.`)
  for (let side = 0; side < 2; side += 1) {
    for (let row = 0; row < 20; row += 1) {
      const nameRegion = NAME_COLUMNS[side]
      const hourRegion = HOURS_COLUMNS[side]
      const top = TABLE_TOP + ROW_HEIGHT * row
      const nameInk = inkCount(pixels, canvas.width, nameRegion.left + 3, top + 5, nameRegion.width - 6, 23)
      if (nameInk < 90) continue
      const nameResult = await recognize(nameRegion.left, top + 2, nameRegion.width, 28)
      const name = nameResult.text.replace(/[^가-힣A-Za-z]/g, '')
      if (!name || /여백/.test(name)) continue
      const hourResult = await recognize(hourRegion.left, top + 2, hourRegion.width, 28)
      const rawHours = hourResult.text
      const hourConfidence = hourResult.confidence
      const hourInk = inkCount(pixels, canvas.width, hourRegion.left + 3, top + 5, hourRegion.width - 6, 23)
      const number = row + 1 + side * 20
      if (number > totalStudents) continue
      const hoursMatch = rawHours.match(/\d+(?:\.\d+)?/)
      const parsedHours = hoursMatch ? Number(hoursMatch[0]) : null
      const hours = parsedHours != null && parsedHours > 0 && parsedHours <= 24 && hourConfidence >= 60 ? parsedHours : null
      const studentId = grade && className ? `${grade}${className}${String(number).padStart(2, '0')}` : ''
      candidates.push({ studentId, name, hours, remarks: hours == null ? rawHours : '', ink: hourInk, numeric: hours != null })
      confidenceValues.push(nameResult.confidence, hourConfidence)
      if (nameResult.confidence < 70) warnings.push(`${formIndex + 1}쪽 ${number}번 이름 '${name}'은 확인이 필요합니다.`)
    }
  }

  participants.push(...candidates.filter(candidate => candidate.numeric).map(({ ink: _ink, numeric: _numeric, ...candidate }) => candidate))
  const numericHourCounts = candidates.reduce((counts, candidate) => {
    if (candidate.hours != null) counts.set(candidate.hours, (counts.get(candidate.hours) || 0) + 1)
    return counts
  }, new Map<number, number>())
  const dominantHours = [...numericHourCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (dominantHours && dominantHours[1] >= Math.max(3, Math.ceil(candidates.length * 0.8))) {
    const outliers = candidates.filter(candidate => candidate.hours != null && candidate.hours !== dominantHours[0])
    if (outliers.length) {
      warnings.push(`${formIndex + 1}쪽에서 다수 학생과 다른 시수 ${outliers.map(value => `${value.studentId || '?'}(${value.hours}시간)`).join(', ')}를 인식했습니다. 원본과 대조해 주세요.`)
    }
  }
  const targetCount = expectedParticipants || Math.min(totalStudents, candidates.length)
  if (participants.length < targetCount) {
    const recovered = candidates.filter(candidate => !candidate.numeric)
      .sort((a, b) => a.ink - b.ink)
      .slice(0, targetCount - participants.length)
      .map(({ ink: _ink, numeric: _numeric, ...candidate }) => ({ ...candidate, hours: 1, remarks: '' }))
    participants.push(...recovered)
  }
  participants.sort((a, b) => a.studentId.localeCompare(b.studentId, 'ko', { numeric: true }))
  if (expectedParticipants && participants.length !== expectedParticipants) {
    warnings.push(`${formIndex + 1}쪽 참가 인원을 ${participants.length}/${expectedParticipants}명으로 인식했습니다.`)
  }

  return {
    form: {
      formIndex,
      activityName: content,
      startDate: dates,
      endDate: dates,
      institution: stripLabel(institution.text, '봉사활동기관'),
      area: stripLabel(area.text, '봉사영역'),
      location: stripLabel(location.text, '활동장소'),
      activityContent: content,
      confirmTeacher: stripLabel(teacher.text, '확인자').replace(/담임교사/g, '').replace(/\(인\)/g, '').trim(),
      participants,
    },
    confidence: Math.round(confidenceValues.reduce((a, b) => a + b, 0) / Math.max(1, confidenceValues.length)),
    warnings,
  }
}

function parseTextPage(items: TextItem[], pageText: string, formIndex: number): ParsedVolunteerForm {
  const identity = lineText(items, 195, 250)
  const gradeClass = compact(identity).match(/([1-3])학년\(?([1-9]\d*)\)?반/) || compact(identity).match(/\(([1-3])\)학년\(([1-9]\d*)\)반/)
  const grade = gradeClass?.[1] || ''
  const className = gradeClass?.[2] || ''
  const period = lineText(items, 235, 290)
  const content = stripLabel(lineText(items, 375, 440), '활동내용')
  const participants: ParsedVolunteerParticipant[] = []
  for (let side = 0; side < 2; side += 1) {
    for (let row = 0; row < 20; row += 1) {
      const top = TABLE_TOP + ROW_HEIGHT * row
      const nameColumn = NAME_COLUMNS[side]
      const hoursColumn = HOURS_COLUMNS[side]
      const name = regionText(items, nameColumn.left - 12, top - 4, nameColumn.width + 24, ROW_HEIGHT).replace(/[^가-힣A-Za-z]/g, '')
      if (!name) continue
      const rawHours = regionText(items, hoursColumn.left - 10, top - 4, hoursColumn.width + 20, ROW_HEIGHT)
      const hoursMatch = rawHours.match(/\d+(?:\.\d+)?/)
      const number = row + 1 + side * 20
      if (hoursMatch) participants.push({
        studentId: grade && className ? `${grade}${className}${String(number).padStart(2, '0')}` : '',
        name,
        hours: Number(hoursMatch[0]),
        remarks: '',
      })
    }
  }
  return {
    formIndex,
    activityName: content,
    startDate: parseDate(period || pageText),
    endDate: parseDate(period || pageText),
    institution: stripLabel(lineText(items, 270, 325), '봉사활동기관'),
    area: stripLabel(lineText(items, 305, 365), '봉사영역'),
    location: stripLabel(lineText(items, 340, 405), '활동장소'),
    activityContent: content,
    confirmTeacher: stripLabel(lineText(items, 1220, 1310), '확인자').replace(/담임교사/g, '').replace(/\(인\)/g, '').trim(),
    participants,
  }
}

function textItems(rawItems: any[], view: number[]): TextItem[] {
  const width = Number(view[2]) || 1
  const height = Number(view[3]) || 1
  return rawItems.map(item => ({
    text: String(item.str || '').trim(),
    x: Number(item.transform?.[4] || 0) / width * PAGE_WIDTH,
    y: (height - Number(item.transform?.[5] || 0)) / height * PAGE_HEIGHT,
  })).filter(item => item.text)
}

function lineText(items: TextItem[], top: number, bottom: number) {
  return items.filter(item => item.y >= top && item.y <= bottom).sort((a, b) => a.x - b.x).map(item => item.text).join(' ')
}

function regionText(items: TextItem[], left: number, top: number, width: number, height: number) {
  return items.filter(item => item.x >= left && item.x <= left + width && item.y >= top && item.y <= top + height)
    .sort((a, b) => a.x - b.x).map(item => item.text).join(' ').trim()
}

function cleanOcr(value: string) { return value.replace(/[|ㅣ]/g, ' ').replace(/\s+/g, ' ').trim() }
function compact(value: string) { return value.replace(/\s+/g, '').replace(/[|ㅣ]/g, '') }
function stripLabel(value: string, label: string) { return value.replace(new RegExp(label.split('').join('\\s*')), '').replace(/^[:：\s]+/, '').trim() }
function normalizeActivity(value: string) {
  const clean = value.replace(/[^가-힣A-Za-z0-9\s·()]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/[봄봉]\s*사활동\s*소양교육/.test(clean.replace(/\s/g, ''))) return '봉사활동 소양교육'
  return clean
}
function parseDate(value: string) {
  const match = value.match(/(20\d{2})\D{0,6}(\d{1,2})\D{0,6}(\d{1,2})/)
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : ''
}
function inkCount(data: Uint8ClampedArray, canvasWidth: number, left: number, top: number, width: number, height: number) {
  let count = 0
  for (let y = top; y < top + height; y += 1) for (let x = left; x < left + width; x += 1) {
    const index = (y * canvasWidth + x) * 4
    if (data[index] < 150 && data[index + 1] < 150 && data[index + 2] < 150) count += 1
  }
  return count
}
