import {structuredPage,applicationTable,CASE_PARSER_VERSION} from './case-layout'
import { parentPort, workerData } from 'worker_threads'
import * as XLSX from 'xlsx'
import {readPdf, lines, type Page, type Cell} from './pdf-layout'
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, '')
const num = (v: unknown) => /^\d+(?:\.\d+)?$/.test(clean(v)) ? Number(clean(v)) : null
import type {GradeRow, StudentInfo} from '../../src/features/private/domain'
import {parseGradePdf} from './grade-pdf'
export {parseGradePdf} from './grade-pdf'
export function parseXlsx(bytes: Uint8Array, source: string, sourceId=source): GradeRow[] {
  const book = XLSX.read(bytes, { type: 'array', cellHTML: false, cellFormula: true })
  const out: GradeRow[] = []
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName]
    const cells = Object.keys(sheet).filter(k => /^[A-Z]+\d+$/.test(k))
    const maxRow = cells.reduce((n,k)=>Math.max(n,XLSX.utils.decode_cell(k).r),0)
    if (maxRow > 200000 || cells.length > 1000000) throw new Error('XLSX 처리 한도를 초과했습니다.')
    const rows = new Map<number, Record<number, any>>()
    for (const key of cells) { const c = XLSX.utils.decode_cell(key); const row = rows.get(c.r) || {}; row[c.c] = sheet[key]; rows.set(c.r, row) }
    let info:StudentInfo|undefined; let currentGrade='';let className='';let map: Record<string, number> = {}; let student = ''; let year = ''; let semester = ''; let group = '';let previousPerson='';const people=new Map<string,StudentInfo>()
    for (const [index, row] of [...rows].sort((a, b) => a[0] - b[0])) {
      const vals = Object.entries(row).map(([k, v]) => [Number(k), clean(v.v)] as const)
      if(!Object.keys(map).length){const heading=vals.map(([,v])=>v).join(' '),m=heading.match(/([1-3])학년\s*(\d{1,2})반/);if(m){currentGrade=m[1];className=m[2]}}
      if (vals.some(([, v]) => v === '과목') && vals.some(([, v]) => ['학점', '단위수', '이수단위'].includes(v))) {
        map = Object.fromEntries(vals.map(([k, v]) => [v, k])); group = ''; continue
      }
      if (map['과목'] === undefined) continue
      const value = (...keys: string[]) => { const key = keys.find(k => map[k] !== undefined); return key ? row[map[key]]?.v : undefined }
      const subject = clean(value('과목')); const name = clean(value('성명', '이름'))
      const identifier=(key:string)=>map[key]===undefined?'':clean(row[map[key]]?.w??row[map[key]]?.v)
      const person=[currentGrade,className,identifier('번호'),identifier('학번'),name].join('|')
      if (name && !/성명|학교생활/.test(name)&&person!==previousPerson) {previousPerson=person;info=people.get(person);if(!info){student = `${sourceId}:${sheetName}:student:${people.size+1}`;info={id:student,name:String(value('성명','이름')||'').trim(),studentNumber:identifier('학번'),currentGrade,className,number:identifier('번호'),schoolYear:''};people.set(person,info)}student=info.id;year = ''; semester = ''; group = '' }
      if (value('학년')) year = clean(value('학년'))
      if (value('학기')) semester = clean(value('학기'))
      if (value('교과', '교과(군)', '교과군')) group = clean(value('교과', '교과(군)', '교과군'))
      if (!subject || /합계|세부능력|특기사항|해당사항|과목$/.test(subject) || !student) continue
      const creditCell = row[map['학점'] ?? map['단위수'] ?? map['이수단위']]
      const rankCell = row[map['석차등급']]
      const credit = creditCell?.f ? null : num(creditCell?.v)
      const rank = rankCell?.f ? null : num(rankCell?.v)
      if (credit === null && rank === null && !creditCell && !rankCell) continue
      const review=!!creditCell?.f||!!rankCell?.f||credit===null||rank===null&&!!clean(rankCell?.v)&&!/^[-·ㆍ.]$/.test(clean(rankCell?.v))
      out.push({ id: `${sourceId}:${sheetName}:${index}`, student, studentInfo:info, sourceId, readState:review?'review':rank===null?'unranked':'parsed', issues:review?['학점·석차등급을 원문과 대조하세요.']:[], year, semester, group, subject, credit, rank, scale: null, source: `${source} / ${sheetName} ${index + 1}행` })
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
  return { title, pageCount: pages.length, parserVersion:CASE_PARSER_VERSION, cases: entries.map((entry,i) => {
    const end = entries[i+1]?.start ? entries[i+1].start-1 : pages.length
    const body = pages.slice(entry.start-1,end)
    const applications=applicationTable(body[0])
    return { ...entry, end, applications, pages: body.map(p=>({ page:p.page,text:p.text,blocks:structuredPage(p) })), verified: false }
  }) }
}
if (parentPort) (async () => {
  try {
    const bytes = new Uint8Array(workerData.bytes)
    const data = workerData.kind === 'xlsx' ? parseXlsx(bytes,workerData.title,workerData.fileId) : workerData.kind === 'grade' ? parseGradePdf(await readPdf(bytes,progress=>parentPort?.postMessage({progress})),workerData.title,workerData.fileId) : parseCases(await readPdf(bytes,progress=>parentPort?.postMessage({progress})),workerData.title)
    parentPort!.postMessage({ data })
  } catch (e) { parentPort!.postMessage({ error: e instanceof Error ? e.message : '파일 판독 실패' }) }
})()
