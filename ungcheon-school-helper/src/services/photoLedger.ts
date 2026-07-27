// 사진대장 — 타입 · 레이아웃 계산(순수) · 파일 입출력(IPC) · 인쇄(iframe)
// 원본 58-photo-ledger 의 lib/io.js + App.jsx 레이아웃 로직을 호스트 인프라에 맞게 포팅.
import * as XLSX from 'xlsx'

// ── 타입 ──────────────────────────────────────────────────────────────────
export interface PhotoFilters {
  brightness: number
  contrast: number
  saturation: number
}

export interface PhotoItem {
  id: string
  src: string | null // data URL
  originalSrc: string | null
  filters: PhotoFilters
  fileName: string
  title: string
  texts: string[]
  blank: boolean
}

export interface PhotoLayout {
  cols: number
  ratioW: number
  ratioH: number
  imageFit: 'cover' | 'contain'
  captionLines: number
  colGap: number
  rowGap: number
  titlePosition: 'top' | 'bottom' | 'hidden'
  showDocTitle: boolean
}

export interface PhotoMargin {
  top: number
  bottom: number
  left: number
  right: number
}

export interface PhotoPageCfg {
  size: string
  orientation: 'portrait' | 'landscape'
  margin: PhotoMargin
}

export interface PhotoLedgerState {
  items: PhotoItem[]
  docTitle: string
  filename: string
  border: boolean
  layout: PhotoLayout
  page: PhotoPageCfg
}

export interface Caption {
  fileName: string
  title: string
  texts: string[]
}

// ── 상수 / 기본값 ───────────────────────────────────────────────────────────
export const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  B4: { w: 257, h: 364 },
  B5: { w: 182, h: 257 },
  Letter: { w: 216, h: 279 },
}
export const SCALE = 3.2 // px per mm (preview)
export const LINE_H = 15 // px per caption line
export const DEFAULT_FILTERS: PhotoFilters = { brightness: 100, contrast: 100, saturation: 100 }

export const uid = (p = 'ph'): string =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function defaultState(): PhotoLedgerState {
  return {
    items: [],
    docTitle: '사진대장',
    filename: '사진대장',
    border: true,
    layout: {
      cols: 2,
      ratioW: 3,
      ratioH: 4,
      imageFit: 'cover',
      captionLines: 1,
      colGap: 5,
      rowGap: 5,
      titlePosition: 'bottom',
      showDocTitle: true,
    },
    page: {
      size: 'A4',
      orientation: 'portrait',
      margin: { top: 15, bottom: 15, left: 15, right: 15 },
    },
  }
}

/** 저장 데이터를 기본값과 깊은 병합 — 새 필드가 생겨도 안전하게 복원. */
export function mergeState(v: Partial<PhotoLedgerState> | undefined): PhotoLedgerState {
  const d = defaultState()
  if (!v) return d
  return {
    ...d,
    ...v,
    layout: { ...d.layout, ...(v.layout ?? {}) },
    page: { ...d.page, ...(v.page ?? {}), margin: { ...d.page.margin, ...((v.page?.margin) ?? {}) } },
    items: Array.isArray(v.items) ? v.items : d.items,
  }
}

// ── 레이아웃 계산(순수) — 미리보기·인쇄 공용 ───────────────────────────────
export function pageDims(st: PhotoLedgerState): { wmm: number; hmm: number } {
  const base = PAGE_SIZES[st.page.size] || PAGE_SIZES.A4
  const portrait = st.page.orientation === 'portrait'
  return { wmm: portrait ? base.w : base.h, hmm: portrait ? base.h : base.w }
}

export interface CellMetrics {
  wmm: number
  hmm: number
  contentW: number
  contentH: number
  titleH: number
  colGapPx: number
  rowGapPx: number
  cellW: number
  imgH: number
  cellH: number
  rowsPerPage: number
  perPage: number
}

export function cellMetrics(st: PhotoLedgerState): CellMetrics {
  const { wmm, hmm } = pageDims(st)
  const m = st.page.margin
  const L = st.layout
  const contentW = (wmm - m.left - m.right) * SCALE
  const titleH = L.showDocTitle ? 34 : 0
  const contentH = (hmm - m.top - m.bottom) * SCALE - titleH
  const colGapPx = L.colGap * SCALE
  const rowGapPx = L.rowGap * SCALE
  const cellW = (contentW - (L.cols - 1) * colGapPx) / L.cols
  const imgH = cellW * (L.ratioH / L.ratioW)
  const capLines = (L.titlePosition !== 'hidden' ? 1 : 0) + L.captionLines
  const capH = capLines * LINE_H + (capLines > 0 ? 4 : 0)
  const cellH = imgH + capH
  const rowsPerPage = Math.max(1, Math.floor((contentH + rowGapPx) / (cellH + rowGapPx)))
  return { wmm, hmm, contentW, contentH, titleH, colGapPx, rowGapPx, cellW, imgH, cellH, rowsPerPage, perPage: L.cols * rowsPerPage }
}

export function buildPages(st: PhotoLedgerState): PhotoItem[][] {
  if (!st.items.length) return []
  const { perPage } = cellMetrics(st)
  const pages: PhotoItem[][] = []
  for (let i = 0; i < st.items.length; i += perPage) pages.push(st.items.slice(i, i + perPage))
  return pages
}

// ── 파일 입출력 (Electron IPC) ──────────────────────────────────────────────
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
}
const mimeFromPath = (p: string): string => EXT_MIME[(p.split('.').pop() || '').toLowerCase()] ?? 'image/jpeg'
const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p

/** 사진 다중 선택 → data URL 항목 배열. */
export async function pickAndReadImages(): Promise<PhotoItem[]> {
  const paths = await window.electron.openFilesDialog([
    { name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
  ])
  const items: PhotoItem[] = []
  for (const p of paths) {
    const b64 = await window.electron.readFileBase64(p)
    items.push({
      id: uid(),
      src: `data:${mimeFromPath(p)};base64,${b64}`,
      originalSrc: null,
      filters: { ...DEFAULT_FILTERS },
      fileName: baseName(p),
      title: '',
      texts: [],
      blank: false,
    })
  }
  return items
}

/** CSV/엑셀 캡션 양식 불러오기 (순서대로 덮어쓰기용 파싱 결과). */
export async function pickAndImportCaptions(): Promise<Caption[] | null> {
  const path = await window.electron.openFileDialog([
    { name: 'CSV/Excel', extensions: ['csv', 'xlsx', 'xls'] },
  ])
  if (!path) return null
  const bytes = await window.electron.readFile(path)
  const wb = XLSX.read(Uint8Array.from(bytes), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  return rows.map((r) => {
    const texts: string[] = []
    Object.keys(r)
      .filter((k) => /^텍스트\d+$/.test(k))
      .sort((a, b) => Number(a.replace('텍스트', '')) - Number(b.replace('텍스트', '')))
      .forEach((k) => texts.push(String(r[k] ?? '')))
    return {
      fileName: String(r['사진(파일)이름'] ?? r['사진이름'] ?? '').trim(),
      title: String(r['텍스트제목'] ?? '').trim(),
      texts,
    }
  })
}

/** 현재 사진 순서대로 캡션 CSV 양식 저장 (Excel 한글용 BOM 포함). */
export async function exportCsv(items: PhotoItem[], textCols: number): Promise<boolean> {
  const head = ['연번', '사진(파일)이름', '텍스트제목']
  for (let i = 1; i <= textCols; i++) head.push(`텍스트${i}`)
  const rows = items.map((it, idx) => {
    const r: (string | number)[] = [idx + 1, it.fileName || `사진${idx + 1}.jpg`, it.title || '']
    for (let i = 0; i < textCols; i++) r.push((it.texts || [])[i] || '')
    return r
  })
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '사진명부')
  const out = XLSX.write(wb, { bookType: 'csv', type: 'array' }) as Uint8Array
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const merged = new Uint8Array(bom.length + out.length)
  merged.set(bom, 0)
  merged.set(out, bom.length)
  return window.electron.saveFileDialog('사진대장_캡션양식.csv', Array.from(merged))
}

/** 프로젝트 JSON 저장. */
export async function saveProject(state: PhotoLedgerState): Promise<boolean> {
  const bytes = new TextEncoder().encode(JSON.stringify(state))
  return window.electron.saveFileDialog(`${state.filename || '사진대장'}.rsphoto.json`, Array.from(bytes))
}

/** 프로젝트 JSON 불러오기. */
export async function pickAndLoadProject(): Promise<PhotoLedgerState | null> {
  const path = await window.electron.openFileDialog([
    { name: '사진대장 프로젝트', extensions: ['json'] },
  ])
  if (!path) return null
  const bytes = await window.electron.readFile(path)
  const text = new TextDecoder().decode(Uint8Array.from(bytes))
  return mergeState(JSON.parse(text))
}

// ── 인쇄 (mm 기준 독립 HTML → 숨김 iframe) ─────────────────────────────────
const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function buildPrintHtml(st: PhotoLedgerState): string {
  const pages = buildPages(st)
  const { wmm, hmm } = pageDims(st)
  const L = st.layout
  const m = st.page.margin

  const filterCss = (it: PhotoItem): string =>
    it.filters
      ? `filter:brightness(${it.filters.brightness}%) contrast(${it.filters.contrast}%) saturate(${it.filters.saturation}%);`
      : ''

  const cellHtml = (it: PhotoItem): string => {
    const titleHtml = L.titlePosition !== 'hidden' ? `<div class="cap title">${esc(it.title)}</div>` : ''
    const img = it.src
      ? `<img src="${it.src}" style="object-fit:${L.imageFit};${filterCss(it)}"/>`
      : `<span class="empty"></span>`
    const texts =
      L.captionLines > 0
        ? `<div class="caps">${Array.from({ length: L.captionLines })
            .map((_, i) => `<div class="capline">${esc((it.texts || [])[i] || '')}</div>`)
            .join('')}</div>`
        : ''
    return `<div class="cell"${st.border ? '' : ' style="border:none;"'}>
      ${L.titlePosition === 'top' ? titleHtml : ''}
      <div class="imgwrap">${img}</div>
      ${L.titlePosition === 'bottom' ? titleHtml : ''}
      ${texts}
    </div>`
  }

  const sheets = pages
    .map(
      (pg, pi) => `<div class="sheet">
      ${L.showDocTitle && pi === 0 ? `<div class="doc-title">${esc(st.docTitle)}</div>` : ''}
      <div class="grid">${pg.map(cellHtml).join('')}</div>
    </div>`
    )
    .join('')

  const css = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;color:#111;}
    .sheet{width:${wmm}mm;min-height:${hmm}mm;padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;page-break-after:always;position:relative;}
    .sheet:last-child{page-break-after:auto;}
    .doc-title{text-align:center;font-weight:800;font-size:18pt;margin-bottom:6mm;}
    .grid{display:grid;grid-template-columns:repeat(${L.cols},1fr);column-gap:${L.colGap}mm;row-gap:${L.rowGap}mm;}
    .cell{border:1px solid #bbb;display:flex;flex-direction:column;overflow:hidden;}
    .imgwrap{width:100%;aspect-ratio:${L.ratioW}/${L.ratioH};display:flex;align-items:center;justify-content:center;background:#f3f3f3;overflow:hidden;}
    .imgwrap img{width:100%;height:100%;}
    .cap{padding:1mm;text-align:center;font-size:9pt;}
    .cap.title{font-weight:700;}
    .caps{padding:0 1mm 1mm;}
    .capline{border-bottom:1px dotted #ccc;min-height:4.5mm;font-size:8pt;text-align:center;}
    @page{size:${wmm}mm ${hmm}mm;margin:0;}
  `
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>${css}</style></head><body>${sheets}</body></html>`
}

/** 숨김 iframe 으로 사진대장만 인쇄(앱 전체 창 인쇄 방지). */
export function printLedger(st: PhotoLedgerState): void {
  const html = buildPrintHtml(st)
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()

  const cleanup = () => setTimeout(() => {
    try { document.body.removeChild(iframe) } catch { /* noop */ }
  }, 500)
  iframe.contentWindow!.onafterprint = cleanup
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch { /* noop */ }
    cleanup()
  }, 300)
}
