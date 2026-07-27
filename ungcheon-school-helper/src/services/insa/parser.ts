// 원시 셀 → 구조화 InsaRecord
import type {
  InsaRecord, PageGrid, SectionRef, TextItem, Training, Promotion,
} from './types'
import { sectionIndex, extractSection, findValueRight, gridRows } from './grid'

const g = (c: string[], i: number) => (c[i] ?? '').trim()
const joinDigits = (s: string) => s.replace(/(\d)\s+(?=\d)/g, '$1').trim()   // "2026.06.1 8" → "2026.06.18"
const stripSpace = (s: string) => s.replace(/\s+/g, ' ').trim()

function splitPeriod(s: string): { start: string; end: string; hours: string } {
  const start = (s.match(/(\d{4}\.\d{2}\.\d{2})/) || [])[1] || ''
  const ends = s.match(/~\s*(\d{4}\.\d{2}\.\d{2})/)
  const hrs = s.match(/\(([^)]*)\)/)
  return { start, end: ends ? ends[1] : '', hours: hrs ? stripSpace(hrs[1]) : '' }
}
// "4.00000 62시간 45분" → {credit:"4.00000", cum:"62시간 45분"}, "9시간 11분" → {credit:"", cum:"9시간 11분"}
function splitCredit(s: string): { credit: string; cum: string } {
  const t = stripSpace(s)
  const m = t.match(/^(\d+\.\d+)\s*(.*)$/)
  if (m) return { credit: m[1], cum: m[2].trim() }
  return { credit: '', cum: t }
}
const yearOf = (s: string): number | null => {
  const m = s.match(/(\d{4})/); return m ? +m[1] : null
}

function parseProfile(items: TextItem[]) {
  const hanja = findValueRight(items, '漢字')
  const eng = findValueRight(items, 'Eng')
  const rrn = findValueRight(items, '주민등록번호')
  // 이름: '漢字' 라벨과 같은 행에서 왼쪽 끝 한글 토큰
  let name = ''
  const han = items.find((it) => it.s.trim() === '漢字')
  if (han) {
    const left = items
      .filter((it) => Math.abs(it.y - han.y) < 6 && it.x < han.x - 1 && /^[가-힣]{2,5}$/.test(it.s.trim()))
      .sort((a, b) => a.x - b.x)
    if (left.length) name = left[0].s.trim()
  }
  if (!name) name = findValueRight(items, '출력자')
  const ageM = items.find((it) => /\(\s*\d+\s*세\)/.test(it.s))
  const age = ageM ? (ageM.s.match(/(\d+)\s*세/) || [])[1] || '' : ''
  return {
    name, hanja, eng, rrn,
    rrnMasked: rrn ? rrn.replace(/(\d{6})-?(\d).*/, '$1-$2******') : '',
    age,
    office: findValueRight(items, '소속'),
    teacherType: findValueRight(items, '교원구분'),
    position: findValueRight(items, '직위'),
    rank: findValueRight(items, '직급'),
    hobong: findValueRight(items, '호봉'),
    status: findValueRight(items, '재직'),
    subject: findValueRight(items, '임용과목'),
    duty: findValueRight(items, '보직'),
  }
}

// 14.승급 기록: 가로 6열 블록(호봉/발령연월일/기록자) → 쌍으로 복원
function parsePromotions(grids: PageGrid[], secs: SectionRef[]): Promotion[] {
  const s14 = secs.find((s) => s.no === 14) as (SectionRef & { y?: number }) | undefined
  const s15 = secs.find((s) => s.no === 15) as (SectionRef & { y?: number }) | undefined
  if (!s14) return []
  const g0 = grids[s14.page]
  const yTop = (s14.y ?? 0) + 4
  const yBot = s15 && s15.page === s14.page ? (s15.y ?? g0.h) - 4 : g0.h - 26
  const within = g0.items.filter((it) => it.y > yTop && it.y < yBot)
  const hobongs = within.filter((it) => /^\d+호봉$/.test(it.s.trim())).sort((a, b) => a.y - b.y || a.x - b.x)
  const dates = within.filter((it) => /^\d{4}\.\d{2}\.\d{2}$/.test(it.s.trim())).sort((a, b) => a.y - b.y || a.x - b.x)
  const out: Promotion[] = []
  for (let i = 0; i < hobongs.length; i++) {
    out.push({ hobong: hobongs[i].s.trim(), date: dates[i] ? dates[i].s.trim() : '', recorder: '' })
  }
  return out
}

export function parseInsaGrids(grids: PageGrid[]): InsaRecord {
  const secs = sectionIndex(grids)
  const p0 = grids[0]?.items ?? []
  const warnings: string[] = []

  const profile = parseProfile(p0)
  const baseDate = findValueRight(p0, '기준일')
  const printer = findValueRight(p0, '출력자')

  // 신상(1): key-value
  const personal = {
    zipcode: (findValueRight(p0, '주소').match(/^\d{5}/) || [''])[0],
    address: findValueRight(p0, '주소').replace(/^\d{5}\s*/, ''),
    nationality: findValueRight(p0, '국적'),
    birth: findValueRight(p0, '생일'),
    base: findValueRight(p0, '생활근거지'),
  }

  // 병역(2): 표 1행
  const milCells = extractSection(grids, secs, 2)[0]
  const military = milCells && milCells.length >= 5
    ? { category: g(milCells, 0), kind: g(milCells, 1), branch: g(milCells, 2), grade: g(milCells, 3), period: stripSpace(g(milCells, 4)), discharge: g(milCells, 5) }
    : null

  const family = extractSection(grids, secs, 3).map((c) => ({ relation: g(c, 0), name: g(c, 1), birth: g(c, 2) }))
  const education = extractSection(grids, secs, 4).map((c) => ({ admit: g(c, 0), graduate: g(c, 1), level: g(c, 2), dept: g(c, 3), major: g(c, 4) }))
  const licenses = extractSection(grids, secs, 5).map((c) => ({ date: g(c, 0), kind: g(c, 1), type: stripSpace(g(c, 2)), subject: g(c, 3), issuer: g(c, 4), law: g(c, 5) }))

  const trainings: Training[] = extractSection(grids, secs, 7).map((c) => {
    const per = splitPeriod(g(c, 4))
    const cc = splitCredit(g(c, 7))
    return {
      num: stripSpace(g(c, 0)), course: stripSpace(g(c, 1)), org: stripSpace(g(c, 2)),
      type: g(c, 3).replace(/\s*연수\s*$/, '').trim(),
      start: per.start, end: per.end, recognizedHours: per.hours,
      resultScore: stripSpace(g(c, 5)), jobRelated: g(c, 6),
      credit: cc.credit, cumHours: cc.cum,
      regDate: joinDigits(g(c, 8)), recorder: g(c, 9),
      year: yearOf(per.start || g(c, 8)),
    }
  })

  const rewards = extractSection(grids, secs, 9).map((c) => ({ date: g(c, 0), honor: g(c, 1), name: stripSpace(g(c, 2)), merit: stripSpace(g(c, 3)), org: g(c, 4) }))
  const bonusPoints = extractSection(grids, secs, 12).map((c) => ({ area: g(c, 0), period: stripSpace(g(c, 1)), org: stripSpace(g(c, 2)), note: stripSpace(g(c, 3)) }))
  const careers = extractSection(grids, secs, 16).map((c) => ({ period: stripSpace(g(c, 0)), type: stripSpace(g(c, 1)), rank: stripSpace(g(c, 2)), dept: stripSpace(g(c, 3)), office: stripSpace(g(c, 4)), startYear: yearOf(g(c, 0)) }))
  const qualifications = extractSection(grids, secs, 19).map((c) => {
    const certRaw = stripSpace(g(c, 1))
    const cm = certRaw.match(/^(\S+)\s+(\S+)$/)
    return {
      name: stripSpace(g(c, 0)),
      certNo: cm ? cm[1] : certRaw, certType: cm ? cm[2] : '',
      date: g(c, 2), issuer: stripSpace(g(c, 3)), jobRelated: g(c, 4),
      credit: g(c, 5), cumCredit: g(c, 6), regDate: joinDigits(g(c, 7)),
    }
  })
  const promotions = parsePromotions(grids, secs)

  if (!profile.name) warnings.push('성명을 인식하지 못했습니다.')
  if (trainings.length === 0) warnings.push('연수이수 기록을 찾지 못했습니다. (양식이 다를 수 있음)')
  if (secs.length < 10) warnings.push('일부 섹션이 누락되었을 수 있습니다. NEIS 인사카드 PDF가 맞는지 확인하세요.')

  return {
    baseDate, printer, profile, personal, military,
    family, education, licenses, trainings, rewards,
    bonusPoints, promotions, careers, qualifications,
    sections: secs.map((s) => ({ no: s.no, title: s.title, page: s.page + 1 })),
    warnings,
  }
}

// (선택) 디버그용: 호봉획정 총경력 등은 분석기에서 계산
export { gridRows }
