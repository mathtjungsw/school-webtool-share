// 만능 파서 디스패처: 확장자로 엔진 선택
//  · 엑셀 → SheetJS 강타입 파싱
//  · PDF → opendataloader-pdf (정밀)
//  · 한글(HWP/HWPX) → kordoc
//  · 텍스트/CSV/JSON → UTF-8 디코드
import { categorize, type ParseResult } from './types'
import { parseWorkbook } from './excel'

export * from './types'
export { parseWorkbook, sheetToJson, sheetToCsv, sheetToMarkdown } from './excel'

const decodeText = (bytes: number[] | Uint8Array) => new TextDecoder('utf-8').decode(new Uint8Array(bytes))

// 경로 기반 파싱 (파일 선택/드롭 경로)
export async function parseFile(path: string, name: string): Promise<ParseResult> {
  const cat = categorize(name)
  const ext = name.toLowerCase().split('.').pop() ?? ''

  if (cat === 'excel') {
    const bytes = await window.electron.readFile(path)
    return parseWorkbook(new Uint8Array(bytes))
  }
  if (cat === 'doc') {
    if (ext === 'pdf') {
      const r = await window.electron.extractDocument(path, 'markdown')
      if (!r?.success) throw new Error(r?.error === 'NO_JAVA' ? 'PDF 파싱에 Java가 필요합니다' : 'PDF 파싱 실패')
      return { kind: 'doc', markdown: r.content ?? '', format: ext }
    }
    const r = await window.electron.parseDocument(path)
    if (!r?.success) throw new Error('한글 문서 파싱 실패 (kordoc)')
    return { kind: 'doc', markdown: r.markdown ?? '', format: ext }
  }
  const bytes = await window.electron.readFile(path)
  return { kind: 'text', text: decodeText(bytes) }
}

// 바이트 기반 파싱 (경로 없는 드롭 폴백) — 엑셀/텍스트만 가능, 문서는 경로 필요
export function parseBytes(bytes: Uint8Array, name: string): ParseResult | null {
  const cat = categorize(name)
  if (cat === 'excel') return parseWorkbook(bytes)
  if (cat === 'text' || cat === 'unsupported') return { kind: 'text', text: decodeText(bytes) }
  return null
}
