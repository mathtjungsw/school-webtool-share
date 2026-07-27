// PDF 페이지 → 텍스트 좌표 + 괘선 그리드 복원
// (PyMuPDF 검증 알고리즘을 pdfjs-dist로 포팅)
import * as pdfjsLib from 'pdfjs-dist'
import type { PageGrid, TextItem, HLine, VLine, SectionRef } from './types'

type Mat = [number, number, number, number, number, number]
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]
const mul = (a: Mat, b: Mat): Mat => [
  a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
  a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5],
]

export function clusterVals(vals: number[], tol = 2.5): number[] {
  const sorted = [...vals].sort((a, b) => a - b)
  const out: number[] = []
  let cur: number[] = []
  for (const v of sorted) {
    if (cur.length && v - cur[cur.length - 1] > tol) { out.push(cur.reduce((s, x) => s + x, 0) / cur.length); cur = [] }
    cur.push(v)
  }
  if (cur.length) out.push(cur.reduce((s, x) => s + x, 0) / cur.length)
  return out
}

// 출력 워터마크(기관/일시/IP/출력자)·페이지번호 제거
const isWatermark = (s: string) => /\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}\//.test(s)
const isPageNo = (s: string) => /^\d+\s*\/\s*\d+$/.test(s.trim())

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function pageToGrid(page: any): Promise<PageGrid> {
  const OPS = pdfjsLib.OPS as Record<string, number>
  const NAME: Record<number, string> = {}
  for (const k in OPS) NAME[OPS[k]] = k

  const vp = page.getViewport({ scale: 1 })
  const H = vp.height as number, W = vp.width as number

  const tc = await page.getTextContent()
  const items: TextItem[] = tc.items
    .filter((i: any) => i.str && i.str.trim())
    .map((i: any) => ({ s: i.str as string, x: i.transform[4] as number, y: H - i.transform[5], w: (i.width as number) || 0, h: (i.height as number) || 9 }))
    .filter((it: TextItem) => !isWatermark(it.s) && !isPageNo(it.s))

  const opl = await page.getOperatorList()
  let ctm: Mat = [1, 0, 0, 1, 0, 0]
  const stack: Mat[] = []
  const hLines: HLine[] = []
  const vLines: VLine[] = []
  const addSeg = (x0: number, y0b: number, x1: number, y1b: number) => {
    const Y0 = H - y0b, Y1 = H - y1b
    if (Math.abs(Y0 - Y1) < 0.8 && Math.abs(x0 - x1) > 1) hLines.push({ y: (Y0 + Y1) / 2, x0: Math.min(x0, x1), x1: Math.max(x0, x1) })
    else if (Math.abs(x0 - x1) < 0.8 && Math.abs(Y0 - Y1) > 1) vLines.push({ x: (x0 + x1) / 2, y0: Math.min(Y0, Y1), y1: Math.max(Y0, Y1) })
  }
  for (let i = 0; i < opl.fnArray.length; i++) {
    const name = NAME[opl.fnArray[i]]
    const args = opl.argsArray[i]
    if (name === 'save') stack.push(ctm.slice() as Mat)
    else if (name === 'restore') ctm = stack.pop() || [1, 0, 0, 1, 0, 0]
    else if (name === 'transform') ctm = mul(ctm, args as Mat)
    else if (name === 'constructPath') {
      // pdfjs v6: args = [opType, subpaths[[code,x,y,...]], bbox]
      const subpaths = args[1] as number[][]
      for (const arr of subpaths) {
        let k = 0, cx = 0, cy = 0, sx = 0, sy = 0
        while (k < arr.length) {
          const c = arr[k++]
          if (c === 0) { [cx, cy] = apply(ctm, arr[k], arr[k + 1]); sx = cx; sy = cy; k += 2 }
          else if (c === 1) { const [nx, ny] = apply(ctm, arr[k], arr[k + 1]); addSeg(cx, cy, nx, ny); cx = nx; cy = ny; k += 2 }
          else if (c === 2 || c === 3) { const [nx, ny] = apply(ctm, arr[k + 4], arr[k + 5]); cx = nx; cy = ny; k += 6 }
          else if (c === 4) { addSeg(cx, cy, sx, sy); cx = sx; cy = sy }
          else k++
        }
      }
    }
  }
  return { w: W, h: H, items, hLines, vLines }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// 영역 내 텍스트를 좌상→우 순으로 결합
export function textIn(items: TextItem[], x0: number, x1: number, y0: number, y1: number): string {
  const ws = items.filter((it) => {
    const cx = it.x + it.w / 2
    return cx >= x0 - 0.5 && cx <= x1 + 0.5 && it.y > y0 - 0.5 && it.y <= y1 + 1.5
  })
  ws.sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x))
  return ws.map((w) => w.s).join(' ').replace(/\s+/g, ' ').trim()
}

export interface GridResult { colXs: number[]; rowYs: number[]; rows: { y0: number; y1: number; cells: string[] }[] }

// y구간의 표를 괘선으로 복원
export function gridRows(grid: PageGrid, yTop: number, yBot: number): GridResult {
  const { items, hLines, vLines } = grid
  const xs = vLines.map((v) => v.x)
  if (!xs.length) return { colXs: [], rowYs: [], rows: [] }
  const xMin = Math.min(...xs), xMax = Math.max(...xs), tWidth = xMax - xMin

  const need = (yBot - yTop) * 0.35
  const covByX: Record<string, number> = {}
  for (const v of vLines) {
    const a = Math.max(v.y0, yTop), b = Math.min(v.y1, yBot)
    if (b > a) { const key = v.x.toFixed(1); covByX[key] = (covByX[key] || 0) + (b - a) }
  }
  const colXs = clusterVals(Object.entries(covByX).filter(([, c]) => c >= need).map(([x]) => +x), 3)

  const rowYs = clusterVals(
    hLines.filter((h) => h.y >= yTop - 2 && h.y <= yBot + 2 && (h.x1 - h.x0) >= tWidth * 0.6).map((h) => h.y), 3)

  const rows: { y0: number; y1: number; cells: string[] }[] = []
  for (let i = 0; i < rowYs.length - 1; i++) {
    const y0 = rowYs[i], y1 = rowYs[i + 1]
    const cells: string[] = []
    for (let j = 0; j < colXs.length - 1; j++) cells.push(textIn(items, colXs[j], colXs[j + 1], y0, y1))
    if (cells.some((c) => c)) rows.push({ y0, y1, cells })
  }
  return { colXs, rowYs, rows }
}

// 섹션 헤더 인덱싱 (제목은 한글로 시작 → '4.00000' 오인식 차단)
const SEC_RE = /^(\d{1,2})\.\s*([가-힣][가-힣A-Za-z0-9·()\s]*)$/
export function sectionIndex(grids: PageGrid[]): SectionRef[] {
  const secs: (SectionRef & { y: number })[] = []
  grids.forEach((g, pi) => {
    for (const it of g.items) {
      const m = it.s.trim().match(SEC_RE)
      if (m && +m[1] >= 1 && +m[1] <= 20) secs.push({ no: +m[1], title: m[2].trim(), page: pi, y: it.y })
    }
  })
  secs.sort((a, b) => a.page - b.page || a.y - b.y)
  const seen = new Set<number>()
  const uniq: (SectionRef & { y: number })[] = []
  for (const s of secs) { if (!seen.has(s.no)) { seen.add(s.no); uniq.push(s) } }
  return uniq.sort((a, b) => a.no - b.no)
}

const looksHeader = (cells: string[]) =>
  /이수번호|과정명|시간누계|연수기관|관계.*성명|입학년월|병역구분|포상일|영\s*역|기\s*간|자\s*격\s*구\s*분|연구주제|학교명|처분일|호\s*봉|자\s*격\s*명\s*칭|자\s*격\s*증|수여기관/.test(cells.join(' '))
const isEmpty = (cells: string[]) => /조회된 데이터가 없습니다/.test(cells.join(''))

// 섹션 N의 표(라벨 아래 ~ 다음 섹션 라벨 위), 멀티페이지 자동 처리 → 셀배열 목록
export function extractSection(grids: PageGrid[], secs: SectionRef[], no: number): string[][] {
  const withY = secs as (SectionRef & { y?: number })[]
  const idx = secs.findIndex((s) => s.no === no)
  if (idx < 0) return []
  const tgt = withY[idx]
  const nxt = (withY[idx + 1] || null)
  const startPage = tgt.page
  const endPage = nxt ? nxt.page : grids.length - 1
  const out: string[][] = []
  for (let pi = startPage; pi <= endPage; pi++) {
    const g = grids[pi]
    const yTop = pi === startPage ? (tgt.y ?? 28) + 6 : 28
    const yBot = nxt && pi === endPage ? (nxt.y ?? g.h - 26) - 3 : g.h - 26
    if (yBot - yTop < 8) continue
    const { rows } = gridRows(g, yTop, yBot)
    for (const r of rows) {
      if (looksHeader(r.cells) || isEmpty(r.cells) || !r.cells.some((c) => c)) continue
      out.push(r.cells)
    }
  }
  return out
}

// 라벨 텍스트의 오른쪽/아래 값 찾기 (key-value 영역용)
export function findValueRight(items: TextItem[], label: string, sameRowTol = 6): string {
  const lab = items.find((it) => it.s.trim() === label)
  if (!lab) return ''
  const cand = items
    .filter((it) => it !== lab && Math.abs(it.y - lab.y) < sameRowTol && it.x > lab.x + lab.w - 2)
    .sort((a, b) => a.x - b.x)
  return cand.length ? cand[0].s.trim() : ''
}
