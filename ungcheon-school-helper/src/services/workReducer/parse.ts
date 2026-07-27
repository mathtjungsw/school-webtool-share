// 명렬표/교직원부/시간표 입력 파싱 (엑셀 .xlsx + TSV 붙여넣기)
import * as XLSX from 'xlsx'
import { DAYS, type Day, type Student, type Teacher, type Lesson } from './types'

const uid = () => `L${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

// 셀 → 정수 (1.0, "1", "1학년" 등 허용)
function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const m = String(v).match(/-?\d+/)
  return m ? parseInt(m[0], 10) : null
}
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

// TSV/CSV 붙여넣기 → 2차원 배열
export function parseClipboard(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t').map((c) => c.trim()))
}

// xlsx 바이트 → 2차원 배열 (첫 시트)
export function parseXlsx(bytes: Uint8Array): string[][] {
  const wb = XLSX.read(bytes, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' })
  return rows.map((r) => (r as unknown[]).map((c) => str(c)))
}

// 명렬표: 학년 | 반 | 번호 | 학번 | 이름
export function parseStudents(rows: string[][]): Student[] {
  const out: Student[] = []
  for (const r of rows) {
    const grade = toInt(r[0])
    const name = str(r[4])
    if (grade === null || !name || name === '이름' || name === '성명') continue   // 헤더/빈 행 제외
    out.push({ grade, classNo: toInt(r[1]) ?? 0, num: toInt(r[2]) ?? 0, sid: str(r[3]), name })
  }
  return out
}

// 교직원부: 순 | 학교명 | 성명 | 학년(담임) | 반(담임)
export function parseTeachers(rows: string[][]): Teacher[] {
  const out: Teacher[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    // 성명 컬럼: 3번째(원본) 우선, 없으면 첫 순수 한글 토큰
    let name = str(r[2])
    if (!/^[가-힣]{2,5}$/.test(name)) name = r.map(str).find((c) => /^[가-힣]{2,5}$/.test(c)) || ''
    if (!name || name === '성명' || name === '학교명' || seen.has(name)) continue
    seen.add(name)
    out.push({ name, homeroomGrade: toInt(r[3]) ?? undefined, homeroomClass: toInt(r[4]) ?? undefined })
  }
  return out
}

// 시간표: 헤더가 있으면 정확 일치로 컬럼 매핑, 없으면 원본 위치(교사1/요일4/교시5/학년6/반7/과목8)
export function parseTimetable(rows: string[][]): Lesson[] {
  if (rows.length === 0) return []
  let idx = { teacher: 1, day: 4, period: 5, grade: 6, classNo: 7, subject: 8 }
  let start = 0
  const head = rows[0].map(str)
  if (['교사성명', '교사', '요일', '과목'].some((l) => head.join(' ').includes(l))) {
    start = 1
    const exact = (name: string, def: number) => {
      const i = head.findIndex((h) => h === name)
      return i >= 0 ? i : def
    }
    const teacherIdx = head.findIndex((h) => h === '교사성명') >= 0
      ? head.findIndex((h) => h === '교사성명')
      : (head.findIndex((h) => h.includes('교사')) >= 0 ? head.findIndex((h) => h.includes('교사')) : 1)
    // '학년과목(반)'·'요일교시' 합본 컬럼과 구분하기 위해 단일 라벨 정확 일치 우선
    idx = {
      teacher: teacherIdx,
      day: exact('요일', 4),
      period: exact('교시', 5),
      grade: exact('학년', 6),
      classNo: exact('반', 7),
      subject: exact('과목', 8),
    }
  }
  const out: Lesson[] = []
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]
    const teacher = str(r[idx.teacher])
    const day = DAYS.find((d) => str(r[idx.day]).includes(d)) as Day | undefined
    const period = toInt(r[idx.period])
    const grade = toInt(r[idx.grade])
    if (!teacher || teacher === '교사성명' || !day || period === null || grade === null) continue
    out.push({ id: uid(), teacher, day, period, grade, classNo: toInt(r[idx.classNo]) ?? 0, subject: str(r[idx.subject]) })
  }
  return out
}
