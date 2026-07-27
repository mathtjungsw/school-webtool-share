// 만능 파일 파서 — 공통 타입
// 엑셀: SheetJS 기반 강타입 파싱(ExcelParserProject 접근법 참고)
// 문서(HWP/HWPX/PDF): kordoc

export type CellKind = 'number' | 'boolean' | 'date' | 'array' | 'string' | 'empty'

export interface TypedCell {
  raw: string          // 원본 문자열
  kind: CellKind
  value: string | number | boolean | (string | number)[] | null
  formula?: string     // 수식(있으면)
  merged?: boolean     // 병합셀에서 채워진 값인지
}

export interface ParsedSheet {
  name: string
  headers: string[]            // 헤더 행(추정)
  colKinds: CellKind[]         // 컬럼별 대표 타입
  rows: TypedCell[][]          // 데이터 행(헤더 제외, 병합 채움 반영)
  rowCount: number
  colCount: number
  mergeCount: number
}

export interface ParsedWorkbook {
  kind: 'excel'
  sheets: ParsedSheet[]
}

export interface ParsedDoc {
  kind: 'doc'
  markdown: string
  format: string               // hwp/hwpx/pdf/...
}

export interface ParsedText {
  kind: 'text'
  text: string
}

export type ParseResult = ParsedWorkbook | ParsedDoc | ParsedText

export type FileCategory = 'excel' | 'doc' | 'text' | 'unsupported'

export function categorize(name: string): FileCategory {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (['xlsx', 'xls', 'xlsb', 'xlsm', 'csv', 'ods'].includes(ext)) return 'excel'
  if (['hwp', 'hwpx', 'pdf'].includes(ext)) return 'doc'
  if (['txt', 'tsv', 'md', 'json', 'log'].includes(ext)) return 'text'
  return 'unsupported'
}
