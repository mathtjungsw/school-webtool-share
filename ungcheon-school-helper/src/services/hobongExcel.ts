import * as XLSX from 'xlsx'
import { JAGYEOK, HAKRYEOK, CAREER_TYPES, calcPeriod, calcConversion, type Period, type HobongResult } from './hobong'
import { binaryToNumberArray } from '../utils/binaryBytes'

export interface CareerRowData {
  content: string
  typeName: string
  rate: number
  startStr: string
  endStr: string
}

export interface HobongExportData {
  dept: string
  name: string
  writer: string
  reason: string
  fixDate: string
  jagyeokCode: number
  hakryeokCode: number
  currentHobong: number
  rows: CareerRowData[]
  result: HobongResult & {
    realPeriod: string
    convertedPeriod: string
    nextPromo: string | null
  }
}

export function parseDate(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function normalizePeriodTotals(cols: number[]): [number, number, number] {
  // cols: [y, m, d] — months and days may overflow
  let [y, m, d] = cols
  m += Math.floor(d / 30); d = d % 30
  y += Math.floor(m / 12); m = m % 12
  return [y, m, d]
}

export function exportHobongXlsx(data: HobongExportData): number[] {
  const wb = XLSX.utils.book_new()
  const jagyeokName = JAGYEOK[data.jagyeokCode]?.[0] ?? ''
  const hakryeokName = HAKRYEOK[data.hakryeokCode]?.[0] ?? ''

  // ── 출력용 시트 ───────────────────────────────────
  const printRows: (string | number | null)[][] = []

  // 행 1: 제목 + 결재란 헤더
  printRows.push(['호 봉 획 정 표', null, null, null, null, null, null, null, null, null, null, '작성자', null, '본인', null, '검토자', null])
  // 행 2-3: 결재란 서명 공간
  printRows.push([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null])
  printRows.push([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null])
  // 행 4: 기본 정보
  printRows.push(['소속', data.dept, null, '성명', data.name, null, '자격증', jagyeokName, null, '학력', hakryeokName, null, '획정사유', data.reason, null, '획정기준일', data.fixDate])
  // 행 5: 현호봉 + 작성자
  printRows.push(['현호봉', data.currentHobong > 0 ? `${data.currentHobong}호봉` : '', null, '작성자', data.writer, null, null, null, null, null, null, null, null, null, null, null, null])
  // 행 6: 빈 줄
  printRows.push([])
  // 행 7: 경력 테이블 헤더
  printRows.push(['부터', '까지', '경력내용', '유형', '환산율', '경력년', '경력월', '경력일', '환산년', '환산월', '환산일'])

  // 경력 데이터 행
  let realY = 0, realM = 0, realD = 0
  let convY = 0, convM = 0, convD = 0

  for (const row of data.rows) {
    const start = parseDate(row.startStr)
    const end = parseDate(row.endStr)
    if (!start || !end) {
      printRows.push([row.startStr || '', row.endStr || '', row.content, row.typeName, row.rate, '', '', '', '', '', ''])
      continue
    }
    const real: Period = calcPeriod(start, end)
    const conv: Period = calcConversion(start, end, row.rate)
    realY += real.years; realM += real.months; realD += real.days
    convY += conv.years; convM += conv.months; convD += conv.days
    printRows.push([
      row.startStr, row.endStr, row.content, row.typeName, row.rate,
      real.years, real.months, real.days,
      conv.years, conv.months, conv.days,
    ])
  }

  // 합계 행 (overflow 정규화)
  const [ty, tm, td] = normalizePeriodTotals([realY, realM, realD])
  const [cy, cm, cd] = normalizePeriodTotals([convY, convM, convD])
  printRows.push(['합계', null, null, null, null, ty, tm, td, cy, cm, cd])
  printRows.push([])

  // 결과 요약 행
  printRows.push([
    '사정호봉', `${data.result.sabong}호봉`, null,
    '기산호봉', `${data.result.kisanHobong}호봉`, null,
    '환산경력', data.result.convertedPeriod, null,
    '실경력', data.result.realPeriod, null,
    '차기승급일', data.result.nextPromo ?? '-',
  ])

  const wsP = XLSX.utils.aoa_to_sheet(printRows)
  wsP['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 7 },
    { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 },
    { wch: 8 }, { wch: 4 }, { wch: 8 }, { wch: 4 }, { wch: 8 }, { wch: 4 },
  ]
  XLSX.utils.book_append_sheet(wb, wsP, '출력용')

  // ── 데이터 시트 ───────────────────────────────────
  const dataRows: (string | number)[][] = [
    ['소속', '성명', '자격코드', '학력코드', '현호봉', '획정사유', '획정기준일', '작성자'],
    [data.dept, data.name, data.jagyeokCode, data.hakryeokCode, data.currentHobong, data.reason, data.fixDate, data.writer],
    [],
    ['부터', '까지', '경력내용', '유형', '환산율'],
    ...data.rows.map(r => [r.startStr, r.endStr, r.content, r.typeName, r.rate]),
  ]
  const wsD = XLSX.utils.aoa_to_sheet(dataRows)
  wsD['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 7 },
    { wch: 12 }, { wch: 12 }, { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, wsD, '데이터')

  return binaryToNumberArray(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))
}

export function exportHobongTemplate(): number[] {
  const wb = XLSX.utils.book_new()
  const careerTypeNames = CAREER_TYPES.map(([n]) => n)

  // ── 출력용(빈 양식) 시트 ─────────────────────────────────────────────────
  // exportHobongXlsx와 동일한 구조, 빈 값으로 채움
  const printRows: (string | number | null)[][] = []
  printRows.push(['호 봉 획 정 표', null, null, null, null, null, null, null, null, null, null, '작성자', null, '본인', null, '검토자', null])
  printRows.push([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null])
  printRows.push([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null])
  printRows.push(['소속', '', null, '성명', '', null, '자격증', '', null, '학력', '', null, '획정사유', '', null, '획정기준일', ''])
  printRows.push(['현호봉', '', null, '작성자', '', null, null, null, null, null, null, null, null, null, null, null, null])
  printRows.push([])
  printRows.push(['부터', '까지', '경력내용', '유형', '환산율', '경력년', '경력월', '경력일', '환산년', '환산월', '환산일'])
  for (let i = 0; i < 10; i++) {
    printRows.push(['', '', '', '기간제교사', 1.0, '', '', '', '', '', ''])
  }
  printRows.push(['합계', null, null, null, null, '', '', '', '', '', ''])
  printRows.push([])
  printRows.push(['사정호봉', '', null, '기산호봉', '', null, '환산경력', '', null, '실경력', '', null, '차기승급일', ''])

  const wsP = XLSX.utils.aoa_to_sheet(printRows)
  wsP['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 7 },
    { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 },
    { wch: 8 }, { wch: 4 }, { wch: 8 }, { wch: 4 }, { wch: 8 }, { wch: 4 },
  ]
  XLSX.utils.book_append_sheet(wb, wsP, '출력용')

  // ── 데이터 시트 ───────────────────────────────────────────────────────────
  const dataRows: (string | number | null)[][] = [
    ['소속', '성명', '자격코드', '학력코드', '현호봉', '획정사유', '획정기준일', '작성자'],
    ['', '', 2, 5, 0, '계약제교원임용', '', ''],
    [],
    ['부터', '까지', '경력내용', '유형', '환산율'],
    ...Array.from({ length: 10 }, () => ['', '', '', '기간제교사', 1.0]),
  ]
  const wsData = XLSX.utils.aoa_to_sheet(dataRows)
  wsData['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 18 }, { wch: 14 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsData, '데이터')

  // ── 사용안내 시트 ─────────────────────────────────────────────────────────
  const guideRows: (string | null)[][] = [
    ['호봉획정표 양식 사용 안내'],
    [null],
    ["1. '데이터' 시트에 기본 정보와 경력 내용을 입력하세요."],
    ["2. 저장 후 앱의 [불러오기] 버튼으로 이 파일을 선택하세요."],
    ["3. 자격코드: 2=2급정교사, 3=1급정교사, 4=수석교사, 5=교장·교감 등"],
    ["   학력코드: 3=전문대졸, 4=대졸(2+2), 5=대졸(4년), 6=석사, 7=박사"],
    ["4. 경력 유형에 사용 가능한 값:"],
  ]
  for (let i = 0; i < careerTypeNames.length; i += 5) {
    guideRows.push(["   " + careerTypeNames.slice(i, i + 5).join(', ')])
  }
  guideRows.push(
    ["5. 환산율: 1.0=100%, 0.88=88%, 0.83=83%, 0=미환산"],
    ["6. 날짜 형식: YYYY-MM-DD  (예: 2020-03-01)"],
  )
  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows)
  wsGuide['!cols'] = [{ wch: 80 }]
  XLSX.utils.book_append_sheet(wb, wsGuide, '사용안내')

  return binaryToNumberArray(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))
}

export function importHobongXlsx(buffer: ArrayBuffer): Partial<HobongExportData> {
  const wb = XLSX.read(buffer, { type: 'array' })
  const wsD = wb.Sheets['데이터']
  if (!wsD) return {}

  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wsD, { header: 1, defval: '' }) as (string | number)[][]

  const info = rows[1] ?? []
  const careerRows: CareerRowData[] = []
  // 경력 데이터는 행 4(index 4)부터 (행 0=헤더, 행 1=값, 행 2=빈줄, 행 3=경력헤더)
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(c => c === '')) break
    careerRows.push({
      startStr: String(r[0] ?? ''),
      endStr: String(r[1] ?? ''),
      content: String(r[2] ?? ''),
      typeName: String(r[3] ?? '기간제교사'),
      rate: Number(r[4] ?? 1.0),
    })
  }

  return {
    dept: String(info[0] ?? ''),
    name: String(info[1] ?? ''),
    jagyeokCode: Number(info[2] ?? 2),
    hakryeokCode: Number(info[3] ?? 5),
    currentHobong: Number(info[4] ?? 0),
    reason: String(info[5] ?? '신규임용'),
    fixDate: String(info[6] ?? ''),
    writer: String(info[7] ?? ''),
    rows: careerRows.length > 0 ? careerRows : undefined,
  }
}
