// 생기부(NEIS 학교생활기록부II) 결정적 파서
// 입력: pdfjs 추출 레이아웃(좌표 포함). 출력: 구조화된 SaenggibuRecord + 정량 메트릭.
// 좌표 기반이라 LLM 없이 성적·출결·시수 등 정량 데이터를 정확히 추출한다.
import type {
  PdfPage, SaenggibuRecord, Personal, AttendanceRow, Award, Creative,
  Grades, GradeSubject, ArtsPeSubject, Reading, Metrics,
} from './types'

interface Cell { x: number; str: string }
interface Line { y: number; page: number; cells: Cell[]; text: string }

const NOISE_WATERMARK = /\/\s?20\d\d\.\d{2}\.\d{2}\s+\d{2}:\d{2}\//
const cellIn = (line: Line, lo: number, hi: number): Cell[] => line.cells.filter(c => c.x >= lo && c.x < hi)
const firstIn = (line: Line, lo: number, hi: number, re?: RegExp): string | null => {
  for (const c of cellIn(line, lo, hi)) { const s = c.str.trim(); if (!re || re.test(s)) return s }
  return null
}

// 1) items → 행(y, tol 4) 묶기 + x 정렬, 노이즈 제거, 전 페이지 순서 유지
function buildLines(pages: PdfPage[]): Line[] {
  const lines: Line[] = []
  for (const pg of pages) {
    const items = pg.items
      .filter(i => i.str && i.str.trim() !== '')
      .map(i => ({ x: Math.round(i.x), y: Math.round(i.y), str: i.str }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
    const rows: Line[] = []
    for (const it of items) {
      let row = rows.find(r => Math.abs(r.y - it.y) <= 4)
      if (!row) { row = { y: it.y, page: pg.page, cells: [], text: '' }; rows.push(row) }
      row.cells.push({ x: it.x, str: it.str })
    }
    rows.sort((a, b) => a.y - b.y)
    for (const r of rows) {
      r.cells.sort((a, b) => a.x - b.x)
      r.text = r.cells.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim()
    }
    for (const r of rows) {
      if (NOISE_WATERMARK.test(r.text)) continue
      if (r.y > pg.h - 60 && /성명/.test(r.text) && /번호/.test(r.text)) continue
      lines.push(r)
    }
  }
  return lines
}

// 2) 섹션 분할 (번호가 아니라 섹션명으로 — 학교/NEIS 버전 차이에 강건)
const SECTIONS: Array<[string, RegExp]> = [
  ['personal', /^\s*\d+\s*\.\s*인적/],
  ['attendance', /^\s*\d+\s*\.\s*출결상황/],
  ['awards', /^\s*\d+\s*\.\s*수상경력/],
  ['certs', /^\s*\d+\s*\.\s*자격증/],
  ['violence', /^\s*\d+\s*\.\s*학교폭력/],
  ['creative', /^\s*\d+\s*\.\s*창의적/],
  ['grades', /^\s*\d+\s*\.\s*교과학습/],
  ['reading', /^\s*\d+\s*\.\s*독서활동/],
  ['behavior', /^\s*\d+\s*\.\s*행동특성/],
]
function splitSections(lines: Line[]): Record<string, Line[]> {
  const idx: Array<{ key: string; i: number }> = []
  lines.forEach((l, i) => {
    for (const [key, re] of SECTIONS) if (re.test(l.text)) { idx.push({ key, i }); break }
  })
  const segs: Record<string, Line[]> = { pre: [] }
  const firstI = idx.length ? idx[0].i : lines.length
  segs.pre = lines.slice(0, firstI)
  for (let k = 0; k < idx.length; k++) {
    const start = idx[k].i
    const end = k + 1 < idx.length ? idx[k + 1].i : lines.length
    segs[idx[k].key] = lines.slice(start, end)
  }
  return segs
}

// 3) 인적·학적 + 표지(학년/반/번호/담임)
function parsePersonal(pre: Line[], personal: Line[]): Personal {
  const out: Personal = { name: null, gender: null, birth: null, address: null, enrollment: [], classes: [] }
  for (const l of pre) {
    const g = firstIn(l, 30, 100, /^\d$/)
    const name = firstIn(l, 360, 600, /[가-힣]{2,4}/)
    if (g && name) {
      out.classes.push({
        grade: Number(g),
        classNo: firstIn(l, 250, 292, /^\d+$/),
        number: firstIn(l, 292, 340, /^\d+$/),
        teacher: name,
      })
    }
  }
  const all = personal.map(l => l.text).join('\n')
  out.name = (all.match(/성명\s*:?\s*([가-힣]{2,4})/) || [])[1] || null
  out.gender = (all.match(/성별\s*:?\s*([남녀])/) || [])[1] || null
  out.birth = (all.match(/(\d{6})-\d{7}/) || [])[1] || null
  out.address = (all.match(/주소\s*:?\s*(.+)/) || [])[1] || null
  for (const l of personal) {
    const m = l.text.match(/(\d{4})년\s*(\d{2})월\s*(\d{2})일\s+(.+?)\s+제\d학년\s*(졸업|입학)/)
    if (m) out.enrollment.push({ date: `${m[1]}.${m[2]}.${m[3]}`, school: m[4], type: m[5] })
  }
  return out
}

// 4) 출결
function parseAttendance(seg: Line[]): AttendanceRow[] {
  const out: AttendanceRow[] = []
  for (const l of seg) {
    const cells = l.cells.map(c => c.str.trim())
    if (/^\d$/.test(cells[0] || '') && /^\d{2,3}$/.test(cells[1] || '')) {
      const rest = cells.slice(2)
      const note = rest.filter(s => /[가-힣]/.test(s)).join(' ') || null
      const nums = rest.filter(s => /^\d+$/.test(s)).map(Number)
      out.push({
        grade: Number(cells[0]),
        schoolDays: Number(cells[1]),
        note,
        absenceFigures: nums.reduce((a, b) => a + b, 0),
        perfectAttendance: /개근/.test(note || ''),
      })
    }
  }
  return out
}

// 5) 수상경력 — 날짜패턴 기준 블록화
function parseAwards(seg: Line[]): Award[] {
  const out: Award[] = []
  for (let i = 0; i < seg.length; i++) {
    const l = seg[i]
    const dm = l.text.match(/(20\d\d\.\d{2}\.\d{2}\.)/)
    if (!dm) continue
    let title = ''
    for (let j = Math.max(0, i - 2); j <= Math.min(seg.length - 1, i + 1); j++) {
      const t = cellIn(seg[j], 80, 240).map(c => c.str).join('')
      if (t && !/20\d\d\./.test(t)) title += t
    }
    const org = firstIn(l, 380, 470, /[가-힣]/) || cellIn(l, 380, 470).map(c => c.str).join('')
    const target = firstIn(l, 480, 600, /[가-힣\d]/) || cellIn(l, 480, 600).map(c => c.str).join('')
    const grade = firstIn(l, 30, 80, /^\d$/)
    out.push({
      date: dm[1],
      title: title.replace(/\s+/g, ' ').trim(),
      org: org || null,
      target: target || null,
      grade: grade ? Number(grade) : null,
    })
  }
  return out
}

// 6) 창의적 체험활동 (영역·시간·희망분야·특기사항 + 봉사실적)
function parseCreative(seg: Line[]): Creative {
  const areas: Creative['areas'] = []
  let aspiration: string | null = null
  const textLines: string[] = []
  const volunteer: Creative['volunteer'] = []
  let inVolunteer = false

  for (const l of seg) {
    if (/봉\s*사\s*활\s*동\s*실\s*적/.test(l.text)) { inVolunteer = true; continue }
    const areaCell = cellIn(l, 75, 170).map(c => c.str).join('')
    const am = areaCell.match(/(자율·?자치활동|동아리활동|진로활동|봉사활동)/)
    const hoursCell = firstIn(l, 160, 185, /^\d{1,3}$/)
    if (am && hoursCell && !inVolunteer && !areas.some(a => a.area === am[1])) {
      areas.push({ area: am[1], hours: Number(hoursCell) })
    }
    const asp = l.text.match(/희망분야\s+([가-힣A-Za-z·]+)/)
    if (asp) aspiration = asp[1]

    if (!inVolunteer) {
      const t = cellIn(l, 190, 600).map(c => c.str).join(' ')
      if (t && !/창의적 체험활동상황|특기사항|희망분야/.test(t)) textLines.push(t)
    } else {
      const dm = l.text.match(/(20\d\d\.\d{2}\.\d{2}\.)/)
      const hours = firstIn(l, 488, 516, /^\d{1,3}$/)
      const cum = firstIn(l, 516, 548, /^\d{1,3}$/)
      if (dm && hours && cum) volunteer.push({ date: dm[1], hours: Number(hours), cumulative: Number(cum) })
    }
  }
  return {
    areas,
    aspiration,
    specialText: textLines.join(' ').replace(/\s+/g, ' ').trim(),
    volunteer,
    volunteerTotal: volunteer.length ? volunteer[volunteer.length - 1].cumulative : 0,
    volunteerCount: volunteer.length,
  }
}

// 7) 교과학습발달상황 (성적표 + 체육예술/과탐실 + 세특)
const SCORE = /^\d{1,3}\/\d{1,3}(?:\.\d)?$/
interface GradeTable { type: 'grade' | 'arts'; year: number | null; lines: Line[] }
function parseGrades(seg: Line[]): Grades {
  const subjects: GradeSubject[] = []
  const artsPe: ArtsPeSubject[] = []
  const sebak: Grades['sebak'] = []
  const noData: Record<number, boolean> = {}

  // 표 단위 세그먼트화: 헤더(학기 교과 과목 학점)로 시작, 종결 마커로 종료.
  // 학기는 표 내부 단독 숫자(x35~56)로 표 전체에 일괄 적용(중앙 배치된 라벨 문제 회피).
  const tables: GradeTable[] = []
  let curYear: number | null = null
  let cur: GradeTable | null = null
  let lastMarkerArts = false
  const closeTable = () => { if (cur && cur.lines.length) tables.push(cur); cur = null }
  for (const l of seg) {
    const ym = l.text.match(/\[(\d)학년\]/)
    if (ym) { closeTable(); curYear = Number(ym[1]); lastMarkerArts = false }
    if (/해당 학년의 자료가 없습니다/.test(l.text) && curYear) noData[curYear] = true
    if (/<체육·예술/.test(l.text)) { closeTable(); lastMarkerArts = true; continue }
    if (/<교양교과>/.test(l.text)) { closeTable(); lastMarkerArts = false; continue }
    if (/이수학점 합계/.test(l.text)) { closeTable(); continue }
    if (/세부능력 및 특기사항/.test(l.text)) { closeTable(); continue }
    if (/학기\s+교과\s+과목\s+학점/.test(l.text)) {
      closeTable(); cur = { type: lastMarkerArts ? 'arts' : 'grade', year: curYear, lines: [] }; continue
    }
    if (cur) cur.lines.push(l)
  }
  closeTable()

  for (const t of tables) {
    let sem: number | null = null
    for (const l of t.lines) { const s = firstIn(l, 35, 56, /^\d$/); if (s) { sem = Number(s); break } }
    for (const l of t.lines) {
      if (t.type === 'grade') {
        const score = firstIn(l, 205, 245, SCORE)
        if (!score) continue
        const subj = firstIn(l, 108, 185, /[가-힣]/)
        const credit = firstIn(l, 188, 205, /^\d$/)
        const ach = firstIn(l, 270, 300, /^[A-E]$/)
        const rank = firstIn(l, 430, 453, /^[1-9]$|^·$/)
        const enroll = firstIn(l, 453, 482, /^\d+$/)
        let dept = ''
        for (const l2 of t.lines) if (Math.abs(l2.y - l.y) <= 16 && l2.page === l.page) dept += cellIn(l2, 55, 96).map(c => c.str).join('')
        let dist = ''
        for (const l2 of t.lines) if (Math.abs(l2.y - l.y) <= 11 && l2.page === l.page) dist += cellIn(l2, 300, 348).map(c => c.str).join(' ')
        const [raw, avg] = score.split('/')
        subjects.push({
          year: t.year, semester: sem,
          dept: dept.replace(/\s+/g, '').trim() || null,
          subject: subj, credit: credit ? Number(credit) : null,
          rawScore: Number(raw), subjectAvg: Number(avg),
          achievement: ach, rank: rank === '·' ? null : (rank ? Number(rank) : null),
          enrolled: enroll ? Number(enroll) : null,
          distribution: dist.replace(/\s+/g, ' ').trim() || null,
        })
      } else {
        const subj = firstIn(l, 175, 232, /[가-힣]/)
        const ach = firstIn(l, 380, 412, /^[A-E]$/)
        const credit = firstIn(l, 320, 348, /^\d$/)
        if (subj && ach && !/이수학점/.test(l.text)) {
          const dept = firstIn(l, 55, 130, /[가-힣]/)
          artsPe.push({ year: t.year, semester: sem, dept, subject: subj, credit: credit ? Number(credit) : null, achievement: ach })
        }
      }
    }
  }

  // 세특: '세부능력 및 특기사항' 이후 x34 텍스트를 과목별로 분리
  const sebakText: string[] = []
  let collecting = false
  for (const l of seg) {
    if (/세부능력 및 특기사항/.test(l.text)) { collecting = true; continue }
    if (collecting) {
      const t = cellIn(l, 30, 600).map(c => c.str).join(' ')
      if (t && !/^학기 교과|이수학점 합계|성취도별 분포|원점수/.test(t)) sebakText.push(t)
    }
  }
  const joined = sebakText.join(' ').replace(/\s+/g, ' ').trim()
  const SUBJ_HEAD = /(?:^|\s)((?:공통[가-힣]+\d?|한국사\d?|통합[가-힣]+\d?|기술·가정|정보|과학탐구실험\d?|스포츠\s?[가-힣]+|음악|미술)(?:\s*·\s*(?:공통[가-힣]+\d?|한국사\d?|통합[가-힣]+\d?|과학탐구실험\d?))*)\s*:\s/g
  const heads: Array<{ name: string; idx: number; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = SUBJ_HEAD.exec(joined))) heads.push({ name: m[1].replace(/\s+/g, ''), idx: m.index, end: m.index + m[0].length })
  for (let i = 0; i < heads.length; i++) {
    const s = heads[i].end
    const e = i + 1 < heads.length ? heads[i + 1].idx : joined.length
    const body = joined.slice(s, e).trim()
    if (body && body !== '해당 사항 없음') sebak.push({ subject: heads[i].name, text: body })
  }

  return { subjects, artsPe, sebak, noData }
}

// 8) 독서
function parseReading(seg: Line[]): Reading {
  const books: string[] = []
  for (const l of seg) {
    const t = cellIn(l, 70, 600).map(c => c.str).join(' ')
    const mm = t.match(/([^(),]+\([^)]+\))/g)
    if (mm) for (const b of mm) if (!/독서 활동 상황|과목 또는 영역/.test(b)) books.push(b.trim())
  }
  return { books, hasReading: books.length > 0 }
}

// 9) 행동특성
function parseBehavior(seg: Line[]): Record<number, string> {
  const byYear: Record<number, string> = {}
  let cur: number | null = null
  for (const l of seg) {
    const g2 = firstIn(l, 45, 60, /^\d$/)
    if (g2 && /행동특성/.test(l.text)) { cur = Number(g2); continue }
    const t = cellIn(l, 75, 600).map(c => c.str).join(' ')
    if (t && !/행동특성 및 종합의견|^학년$/.test(t)) {
      const y = cur || 1
      byYear[y] = (byYear[y] || '') + ' ' + t
    }
  }
  for (const k of Object.keys(byYear)) byYear[Number(k)] = byYear[Number(k)].replace(/\s+/g, ' ').trim()
  return byYear
}

// 정량 메트릭
function computeMetrics(rec: Omit<SaenggibuRecord, 'metrics'>): Metrics {
  const g = rec.grades.subjects
  const graded = g.filter(s => s.rank != null)
  const mean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const avgRank = mean(graded.map(s => s.rank as number))
  const avgRaw = mean(g.map(s => s.rawScore))
  const bySem: Record<string, number[]> = {}
  for (const s of g) { const k = `${s.year}-${s.semester}`; (bySem[k] = bySem[k] || []).push(s.rawScore) }
  const semAvg: Record<string, number> = {}
  for (const k of Object.keys(bySem)) semAvg[k] = +(mean(bySem[k]) as number).toFixed(1)
  const ach: Record<string, number> = {}
  for (const s of [...g, ...rec.grades.artsPe]) if (s.achievement) ach[s.achievement] = (ach[s.achievement] || 0) + 1
  const credits = [...g, ...rec.grades.artsPe].reduce((a, s) => a + (s.credit || 0), 0)
  const enroll = rec.personal.enrollment.find(x => x.type === '입학')
  const admissionYear = enroll ? Number(enroll.date.slice(0, 4)) : null
  const gradeSystem = admissionYear && admissionYear >= 2025 ? '5등급제(2022개정)' : '9등급제'
  return {
    admissionYear,
    cohort: admissionYear ? `${admissionYear} 고1 → ${admissionYear + 3} 대입` : null,
    gradeSystem,
    gradedSubjectCount: graded.length,
    avgRank: avgRank != null ? +avgRank.toFixed(2) : null,
    avgRawScore: avgRaw != null ? +avgRaw.toFixed(1) : null,
    semesterRawAvg: semAvg,
    achievementCounts: ach,
    totalCredits: credits,
    perfectAttendance: rec.attendance.length > 0 && rec.attendance.every(a => a.perfectAttendance),
    volunteerHours: rec.creative.volunteerTotal,
    volunteerCount: rec.creative.volunteerCount,
    creativeHours: Object.fromEntries(rec.creative.areas.map(a => [a.area, a.hours])),
    careerAspiration: rec.creative.aspiration,
    sebakSubjectCount: rec.grades.sebak.length,
    sebakTotalChars: rec.grades.sebak.reduce((a, s) => a + s.text.length, 0),
    hasReading: rec.reading.hasReading,
  }
}

export function parseSaenggibu(pages: PdfPage[]): SaenggibuRecord {
  const lines = buildLines(pages)
  const seg = splitSections(lines)
  const base: Omit<SaenggibuRecord, 'metrics'> = {
    personal: parsePersonal(seg.pre || [], seg.personal || []),
    attendance: parseAttendance(seg.attendance || []),
    awards: parseAwards(seg.awards || []),
    creative: parseCreative(seg.creative || []),
    grades: parseGrades(seg.grades || []),
    reading: parseReading(seg.reading || []),
    behavior: parseBehavior(seg.behavior || []),
  }
  return { ...base, metrics: computeMetrics(base) }
}
