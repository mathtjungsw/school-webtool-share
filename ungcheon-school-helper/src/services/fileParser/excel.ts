// 엑셀 강타입 파싱 (SheetJS) — .xlsx/.xls/.xlsb/.xlsm/.csv/.ods
// ExcelParserProject(C# Unity 로더)의 타입파싱 개념을 TS로 재구현:
//  · 멀티시트, 병합셀 채움, 셀 타입 추론(숫자/불리언/날짜/배열/문자), 수식 보존
import * as XLSX from 'xlsx'
import type { CellKind, TypedCell, ParsedSheet, ParsedWorkbook } from './types'

const BOOL_TRUE = new Set(['true', 'yes', 'y', 'o', '예', '참', '1', 'on'])
const BOOL_FALSE = new Set(['false', 'no', 'n', 'x', '아니오', '아니요', '거짓', '0', 'off'])
const ARRAY_SEP = /[,|;/]/

const isNumeric = (s: string) => /^-?\d{1,15}(\.\d+)?$/.test(s) || /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)
const isDateStr = (s: string) => /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(s) || /^\d{4}년\s?\d{1,2}월\s?\d{1,2}일$/.test(s)

// 단일 값 타입 추론
function inferScalar(raw: string): { kind: Exclude<CellKind, 'array'>; value: TypedCell['value'] } {
  const s = raw.trim()
  if (s === '') return { kind: 'empty', value: null }
  const low = s.toLowerCase()
  if (BOOL_TRUE.has(low)) return { kind: 'boolean', value: true }
  if (BOOL_FALSE.has(low)) return { kind: 'boolean', value: false }
  if (isNumeric(s)) return { kind: 'number', value: parseFloat(s.replace(/,/g, '')) }
  if (isDateStr(s)) return { kind: 'date', value: s }
  return { kind: 'string', value: s }
}

// 셀 → TypedCell (배열 포함)
function inferCell(raw: string, formula?: string, merged?: boolean): TypedCell {
  const s = raw.trim()
  // 배열: 구분자로 2개 이상 + 각 토큰이 비어있지 않을 때
  if (ARRAY_SEP.test(s) && !isDateStr(s)) {
    const parts = s.split(ARRAY_SEP).map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2 && parts.every((p) => p.length <= 24)) {
      const vals = parts.map((p) => {
        const sc = inferScalar(p)
        return (sc.kind === 'number' ? sc.value : p) as string | number
      })
      return { raw, kind: 'array', value: vals, formula, merged }
    }
  }
  const sc = inferScalar(s)
  return { raw, kind: sc.kind, value: sc.value, formula, merged }
}

// 컬럼 대표 타입: empty 제외 최빈값
function dominantKind(cells: TypedCell[]): CellKind {
  const cnt: Record<string, number> = {}
  for (const c of cells) {
    if (c.kind === 'empty') continue
    cnt[c.kind] = (cnt[c.kind] || 0) + 1
  }
  let best: CellKind = 'string'; let max = 0
  for (const k in cnt) if (cnt[k] > max) { max = cnt[k]; best = k as CellKind }
  return best
}

function cellAddr(r: number, c: number) { return XLSX.utils.encode_cell({ r, c }) }

export function parseWorkbook(bytes: Uint8Array): ParsedWorkbook {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true, cellFormula: true, cellNF: false })
  const sheets: ParsedSheet[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws || !ws['!ref']) { continue }
    const range = XLSX.utils.decode_range(ws['!ref'])
    const merges = ws['!merges'] ?? []
    // 병합셀 채움 맵: 병합영역의 모든 칸 → 좌상단 값
    const mergeFill = new Map<string, { r: number; c: number }>()
    for (const m of merges) {
      for (let r = m.s.r; r <= m.e.r; r++) {
        for (let c = m.s.c; c <= m.e.c; c++) {
          if (r === m.s.r && c === m.s.c) continue
          mergeFill.set(cellAddr(r, c), { r: m.s.r, c: m.s.c })
        }
      }
    }
    const getRaw = (r: number, c: number): { raw: string; formula?: string; merged: boolean } => {
      const fill = mergeFill.get(cellAddr(r, c))
      const merged = !!fill
      const src = fill ?? { r, c }
      const cell = ws[cellAddr(src.r, src.c)]
      if (!cell) return { raw: '', merged }
      // Excel 표시값(w)을 우선 사용 → 날짜 시간대 오차·서식 손실 방지
      let raw = cell.w
      if (raw == null || raw === '') {
        if (cell.v instanceof Date) {
          const d = cell.v
          raw = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        } else {
          raw = cell.v != null ? String(cell.v) : ''
        }
      }
      return { raw, formula: cell.f ? `=${cell.f}` : undefined, merged }
    }

    // 전체 그리드
    const grid: TypedCell[][] = []
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: TypedCell[] = []
      for (let c = range.s.c; c <= range.e.c; c++) {
        const { raw, formula, merged } = getRaw(r, c)
        row.push(inferCell(raw, formula, merged))
      }
      grid.push(row)
    }
    // 헤더 행: 비어있지 않은 첫 행
    let headerIdx = grid.findIndex((row) => row.some((cell) => cell.kind !== 'empty'))
    if (headerIdx < 0) headerIdx = 0
    const headerRow = grid[headerIdx] ?? []
    const headers = headerRow.map((cell, i) => cell.raw || XLSX.utils.encode_col(range.s.c + i))
    const rows = grid.slice(headerIdx + 1).filter((row) => row.some((cell) => cell.kind !== 'empty'))
    const colCount = headers.length
    const colKinds: CellKind[] = []
    for (let c = 0; c < colCount; c++) colKinds.push(dominantKind(rows.map((row) => row[c]).filter(Boolean)))

    sheets.push({
      name, headers, colKinds, rows,
      rowCount: rows.length, colCount, mergeCount: merges.length,
    })
  }
  return { kind: 'excel', sheets }
}

// ── 내보내기 ────────────────────────────────────────────────────────────────
const jsonVal = (c: TypedCell) => c.value

export function sheetToJson(sheet: ParsedSheet): string {
  const objs = sheet.rows.map((row) => {
    const o: Record<string, unknown> = {}
    sheet.headers.forEach((h, i) => { o[h || `col${i}`] = jsonVal(row[i] ?? { raw: '', kind: 'empty', value: null }) })
    return o
  })
  return JSON.stringify(objs, null, 2)
}

const csvEsc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
export function sheetToCsv(sheet: ParsedSheet): string {
  const lines = [sheet.headers.map(csvEsc).join(',')]
  for (const row of sheet.rows) lines.push(sheet.headers.map((_, i) => csvEsc(row[i]?.raw ?? '')).join(','))
  return lines.join('\n')
}

export function sheetToMarkdown(sheet: ParsedSheet): string {
  const head = `| ${sheet.headers.join(' | ')} |`
  const sep = `| ${sheet.headers.map(() => '---').join(' | ')} |`
  const body = sheet.rows.map((row) => `| ${sheet.headers.map((_, i) => (row[i]?.raw ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`)
  return [head, sep, ...body].join('\n')
}
