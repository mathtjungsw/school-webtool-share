import { parentPort, workerData } from 'worker_threads'
import * as XLSX from 'xlsx'
type Cell = { x: number; y: number; w: number; text: string }
type Page = { page: number; width: number; height: number; cells: Cell[]; text: string }
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, '')
const num = (v: unknown) => /^\d+(?:\.\d+)?$/.test(clean(v)) ? Number(clean(v)) : null
export interface GradeRow { id: string; student: string; year: string; semester: string; group: string; subject: string; credit: number | null; rank: number | null; source: string; scale: number | null }
export function parseXlsx(bytes: Uint8Array, source: string): GradeRow[] {
  const book = XLSX.read(bytes, { type: 'array', cellHTML: false, cellFormula: true })
  const out: GradeRow[] = []
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName]
    const cells = Object.keys(sheet).filter(k => /^[A-Z]+\d+$/.test(k))
    const maxRow = Math.max(0, ...cells.map(k => XLSX.utils.decode_cell(k).r))
    if (maxRow > 200000 || cells.length > 1000000) throw new Error('XLSX 처리 한도를 초과했습니다.')
    const rows = new Map<number, Record<number, any>>()
    for (const key of cells) { const c = XLSX.utils.decode_cell(key); const row = rows.get(c.r) || {}; row[c.c] = sheet[key]; rows.set(c.r, row) }
    let map: Record<string, number> = {}; let student = ''; let year = ''; let semester = ''; let group = ''
    for (const [index, row] of [...rows].sort((a, b) => a[0] - b[0])) {
      const vals = Object.entries(row).map(([k, v]) => [Number(k), clean(v.v)] as const)
      if (vals.some(([, v]) => v === '과목') && vals.some(([, v]) => ['학점', '단위수', '이수단위'].includes(v))) {
        map = Object.fromEntries(vals.map(([k, v]) => [v, k])); group = ''; continue
      }
      if (map['과목'] === undefined) continue
      const value = (...keys: string[]) => { const key = keys.find(k => map[k] !== undefined); return key ? row[map[key]]?.v : undefined }
      const subject = clean(value('과목')); const name = clean(value('성명', '이름')); const number = clean(value('번호', '학번'))
      if (name && !/성명|학교생활/.test(name)) { student = `${source} · ${number} ${name}`.trim(); year = ''; semester = ''; group = '' }
      if (value('학년')) year = clean(value('학년'))
      if (value('학기')) semester = clean(value('학기'))
      if (value('교과', '교과(군)', '교과군')) group = clean(value('교과', '교과(군)', '교과군'))
      if (!subject || /합계|세부능력|특기사항|해당사항|과목$/.test(subject) || !student) continue
      const creditCell = row[map['학점'] ?? map['단위수'] ?? map['이수단위']]
      const rankCell = row[map['석차등급']]
      const credit = creditCell?.f ? null : num(creditCell?.v)
      const rank = rankCell?.f ? null : num(rankCell?.v)
      if (credit === null && rank === null) continue
      out.push({ id: `${source}:${sheetName}:${index}`, student, year, semester, group, subject, credit, rank, scale: null, source: `${source} / ${sheetName} ${index + 1}행` })
    }
  }
  return out
}
function lines(cells: Cell[], x1 = 0, x2 = Infinity) {
  const groups: Cell[][] = []
  for (const c of [...cells].filter(c => c.x >= x1 && c.x < x2).sort((a,b) => a.y-b.y || a.x-b.x)) {
    const last = groups[groups.length - 1]; if (last && Math.abs(last[0].y-c.y) < 3) last.push(c); else groups.push([c])
  }
  return groups.map(items => ({ y: items[0].y, items: items.sort((a,b) => a.x-b.x), text: items.map(c => c.text).join(' ') }))
}
async function readPdf(bytes: Uint8Array): Promise<Page[]> {
  const pdfjs = await import('pdfjs-dist-v3/legacy/build/pdf.js') as any
  const api = pdfjs.default || pdfjs
  const doc = await api.getDocument({ data: bytes, disableFontFace: true, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise
  if (doc.numPages > 1000) throw new Error('PDF는 1,000쪽 이하로 나눠 주세요.')
  const pages: Page[] = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n); const vp = page.getViewport({ scale: 1 }); const tc = await page.getTextContent()
      const cells: Cell[] = tc.items.filter((i: any) => i.str?.trim()).map((i: any) => ({ x: i.transform[4], y: vp.height-i.transform[5], w: i.width, text: i.str }))
      pages.push({ page: n, width: vp.width, height: vp.height, cells, text: lines(cells).map(l => l.text).join('\n') })
      parentPort?.postMessage({ progress: n / doc.numPages })
    }
  } finally { await doc.destroy() }
  return pages
}
export function parseGradePdf(pages: Page[], source: string): GradeRow[] {
  const out: GradeRow[] = []; let studentN = 0; let student = ''; let year = ''; let semester = ''; let active = false
  let columns: { credit: number; rank: number; subject: number; group: number } | null = null
  for (const page of pages) {
    if (/인적.?학적.?사항/.test(clean(page.text))) { studentN++; student = `${source} · 학생 ${studentN}`; active = false; columns = null }
    if (!student) student = `${source} · 학생 1`
    const ls = lines(page.cells)
    for (let li = 0; li < ls.length; li++) {
      const l = ls[li]; const flat = clean(l.text)
      const ym = flat.match(/\[([1-3])학년\]/); if (ym) year = ym[1]
      if (/교과학습발달상황/.test(flat)) active = true
      if (!active) continue
      if (/세부능력.{0,3}특기사항|이수학점합계|창의적체험|독서활동상황|행동특성/.test(flat)) columns = null
      if (/학기/.test(flat) && /과목/.test(flat)) {
        const near = page.cells.filter(c => c.y >= l.y-18 && c.y <= l.y+30)
        const find = (re: RegExp) => near.find(c => re.test(clean(c.text)))
        const credit = find(/^(학점|단위수)$/); const rank = find(/^(석차등급|석차)$/); const subject = find(/^과목$/); const group = find(/^교과(?:\(군\))?$/)
        if (credit && rank && subject && group) columns = { credit: credit.x+credit.w/2, rank: rank.x+rank.w/2, subject: subject.x, group: group.x }
        else columns = null
        continue
      }
      if (!columns) continue
      const col = columns
      const creditCell = l.items.find(c => Math.abs(c.x+c.w/2-col.credit) < 13 && num(c.text) !== null)
      if (!creditCell) continue
      const near = page.cells.filter(c => Math.abs(c.y-l.y) < 5)
      const rankCell = near.find(c => Math.abs(c.x+c.w/2-col.rank) < 14 && /^(?:[1-9]|·|-)$/.test(clean(c.text)))
      const subject = near.filter(c => c.x >= (col.group+col.subject)/2 && c.x+c.w/2 < col.credit-15).map(c => c.text).join('').trim()
      if (!subject || /과목|학점|합계/.test(subject)) continue
      const group = near.filter(c => c.x >= col.group-10 && c.x < (col.group+col.subject)/2).map(c => c.text).join('') || page.cells.filter(c => Math.abs(c.y-l.y)<20 && c.x >= col.group-15 && c.x < (col.group+col.subject)/2 && /[가-힣]/.test(c.text)).sort((a,b)=>Math.abs(a.y-l.y)-Math.abs(b.y-l.y))[0]?.text || ''
      const sem = near.find(c => c.x < col.group-5 && /^[12]$/.test(clean(c.text))); if (sem) semester = clean(sem.text)
      out.push({ id: `${source}:${page.page}:${li}`, student, year, semester, group, subject, credit: num(creditCell.text), rank: rankCell ? num(rankCell.text) : null, scale: null, source: `${source} ${page.page}쪽` })
    }
  }
  return out
}
export function parseCases(pages: Page[], title: string) {
  const tocPage = pages[2]; if (!tocPage) throw new Error('자료집 목차를 찾지 못했습니다.')
  const entries: { number: number; university: string; department: string; start: number }[] = []
  for (const [a,b] of [[0,tocPage.width/2],[tocPage.width/2,tocPage.width]]) {
    for (const l of lines(tocPage.cells,a,b)) {
      const match = l.text.match(/^\s*(\d+)\s*\.\s*(.*?)\s*\/\s*(.*?)\s*[.…·\s]+(\d+)\s*쪽/)
      if (match) entries.push({ number: +match[1], university: match[2].trim(), department: match[3].trim(), start: +match[4] })
    }
  }
  entries.sort((a,b)=>a.number-b.number)
  if (entries.length !== 39 || new Set(entries.map(e=>e.number)).size !== 39) throw new Error(`목차를 정확히 확인하지 못했습니다 (${entries.length}/39). 원본 서식을 확인해 주세요.`)
  return { title, pageCount: pages.length, cases: entries.map((entry,i) => {
    const end = entries[i+1]?.start ? entries[i+1].start-1 : pages.length
    const body = pages.slice(entry.start-1,end)
    const first = body[0]; const header = first.cells.filter(c => /지원대학|지원학과|전형유형|내신등급|합\/불|^합$/.test(clean(c.text)))
    const points = ['지원대학','지원학과','전형유형','내신등급','합/불'].map(k => header.find(c=>clean(c.text).includes(k) || (k==='합/불' && clean(c.text)==='합')))
    const applications: any[] = []
    if (points.every(Boolean)) {
      const cs = points as Cell[]; const centres = cs.map(c=>c.x+c.w/2); const top = Math.max(...cs.map(c=>c.y))+5
      const bottom = first.cells.find(c=>clean(c.text).includes('학년별성적추이'))?.y || top+160
      const grades = first.cells.filter(c=>c.y>top && c.y<bottom && Math.abs(c.x+c.w/2-centres[3])<25 && num(c.text)!==null).sort((a,b)=>a.y-b.y)
      for (let n=0;n<grades.length;n++) {
        const y1 = n ? (grades[n-1].y+grades[n].y)/2 : top; const y2 = n+1<grades.length ? (grades[n].y+grades[n+1].y)/2 : bottom
        const values = centres.map((x,k) => first.cells.filter(c=>c.y>=y1 && c.y<y2 && c.x+c.w/2 >= (k?(centres[k-1]+x)/2:0) && c.x+c.w/2<(k+1<centres.length?(x+centres[k+1])/2:x+25)).sort((a,b)=>a.y-b.y||a.x-b.x).map(c=>c.text).join(' ').trim())
        applications.push({ university: values[0], department: values[1], type: values[2], grade: values[3], result: values[4] })
      }
    }
    return { ...entry, end, applications, pages: body.map(p=>({ page:p.page,text:p.text })), verified: false }
  }) }
}
if (parentPort) (async () => {
  try {
    const bytes = new Uint8Array(workerData.bytes)
    const data = workerData.kind === 'xlsx' ? parseXlsx(bytes,workerData.title) : workerData.kind === 'grade' ? parseGradePdf(await readPdf(bytes),workerData.title) : parseCases(await readPdf(bytes),workerData.title)
    parentPort!.postMessage({ data })
  } catch (e) { parentPort!.postMessage({ error: e instanceof Error ? e.message : '파일 판독 실패' }) }
})()
