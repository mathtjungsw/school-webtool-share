// InsaRecord → 분석 인사이트
import type { InsaRecord, InsaAnalysis, MandatoryCheck, YearStat, BonusArea, Training } from './types'

// "62시간 45분" → 분
function toMinutes(s: string): number {
  if (!s) return 0
  const h = (s.match(/(\d+)\s*시간/) || [])[1]
  const m = (s.match(/(\d+)\s*분/) || [])[1]
  return (h ? +h : 0) * 60 + (m ? +m : 0)
}
const fmtHours = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}

interface MandatoryDef { key: string; label: string; kw: RegExp; years: number }
const MANDATORY: MandatoryDef[] = [
  { key: 'sexual',    label: '성희롱·성폭력 예방', kw: /성희롱|성폭력|성매매|4대\s*폭력|폭력예방|성\s*인지|가정폭력/, years: 1 },
  { key: 'child',     label: '아동학대 예방',       kw: /아동학대|아동\s*학대|학대예방/, years: 1 },
  { key: 'cpr',       label: '심폐소생술·응급처치', kw: /심폐소생|응급처치|응급\s*처치|4분의\s*기적|생명을\s*살리/, years: 1 },
  { key: 'disabled',  label: '장애인식개선',         kw: /장애\s*인식|장애인식|장애인\s*인식/, years: 1 },
  { key: 'integrity', label: '청렴·부패방지',        kw: /청렴|부패|반부패/, years: 1 },
  { key: 'safety',    label: '안전·재난 대응',        kw: /재난|학교\s*안전|안전사고|생활안전|감염병/, years: 1 },
  { key: 'suicide',   label: '자살예방·생명존중',     kw: /자살\s*예방|자살예방|생명존중|위기\s*지원/, years: 1 },
  { key: 'personal',  label: '개인정보보호',          kw: /개인정보/, years: 1 },
]

function trainingDate(t: Training): string { return t.start || t.regDate || '' }
function ymToNum(d: string): number {
  const m = d.match(/(\d{4})\.(\d{2})\.?(\d{2})?/)
  if (!m) return 0
  return +m[1] * 10000 + (+m[2]) * 100 + (m[3] ? +m[3] : 1)
}

function checkMandatory(trainings: Training[], baseDate: string): MandatoryCheck[] {
  const baseNum = ymToNum(baseDate) || ymToNum(new Date().toISOString().slice(0, 10).replace(/-/g, '.'))
  const baseYear = Math.floor(baseNum / 10000)
  return MANDATORY.map((def) => {
    const hits = trainings.filter((t) => def.kw.test(t.course) || def.kw.test(t.num))
    if (!hits.length) {
      return { key: def.key, label: def.label, lastDate: '', lastCourse: '', count: 0, status: 'missing' as const, note: '이수 기록 없음' }
    }
    hits.sort((a, b) => ymToNum(trainingDate(b)) - ymToNum(trainingDate(a)))
    const last = hits[0]
    const lastDate = trainingDate(last)
    const lastYear = Math.floor(ymToNum(lastDate) / 10000)
    const gap = baseYear - lastYear
    const status: MandatoryCheck['status'] = gap <= def.years ? 'ok' : 'warn'
    return {
      key: def.key, label: def.label, lastDate, lastCourse: last.course, count: hits.length,
      status,
      note: status === 'ok' ? `최근 이수 (${lastDate})` : `${gap}년 경과 — 재이수 권장`,
    }
  })
}

export function analyzeInsa(rec: InsaRecord): InsaAnalysis {
  const t = rec.trainings

  // 연수 통계
  const byType: Record<string, number> = {}
  let totalRecognized = 0, totalCredit = 0
  const yearMap: Record<number, { hours: number; count: number }> = {}
  for (const tr of t) {
    const ty = tr.type || '기타'
    byType[ty] = (byType[ty] || 0) + 1
    const mins = toMinutes(tr.recognizedHours)
    totalRecognized += mins
    totalCredit += tr.credit ? parseFloat(tr.credit) || 0 : 0
    if (tr.year) {
      yearMap[tr.year] = yearMap[tr.year] || { hours: 0, count: 0 }
      yearMap[tr.year].hours += mins
      yearMap[tr.year].count += 1
    }
  }
  const byYear: YearStat[] = Object.entries(yearMap)
    .map(([y, v]) => ({ year: +y, hours: Math.round(v.hours / 60 * 10) / 10, count: v.count }))
    .sort((a, b) => b.year - a.year)

  // 경력연수: 가장 오래된 발령 시작연도 ~ 기준일
  const startYears = rec.careers.map((c) => c.startYear).filter((y): y is number => !!y)
  const baseYear = +(rec.baseDate.match(/(\d{4})/) || [])[1] || new Date().getFullYear()
  const minYear = startYears.length ? Math.min(...startYears) : null
  const careerYears = minYear ? `약 ${baseYear - minYear}년 (${minYear}~)` : '—'
  const currentSchoolSince = rec.careers.length ? (rec.careers[0].period.match(/(\d{4}\.\d{2}\.\d{2})/) || [''])[0] : ''

  // 호봉
  const nextExpected = (() => {
    const cur = rec.promotions[rec.promotions.length - 1]
    if (!cur) return ''
    const y = +(cur.date.match(/(\d{4})/) || [])[1]
    return y ? `${y + 1}.01.01 (예상)` : ''
  })()

  // 가산점 영역별
  const areaMap: Record<string, number> = {}
  for (const b of rec.bonusPoints) {
    const a = b.area || '기타'
    areaMap[a] = (areaMap[a] || 0) + 1
  }
  const areas: BonusArea[] = Object.entries(areaMap)
    .map(([area, count]) => ({ area, count, years: count }))
    .sort((a, b) => b.count - a.count)

  // 경고 종합
  const warnings = [...rec.warnings]
  const mandatory = checkMandatory(t, rec.baseDate)
  for (const m of mandatory) {
    if (m.status === 'missing') warnings.push(`법정의무연수 미이수 의심: ${m.label}`)
    else if (m.status === 'warn') warnings.push(`법정의무연수 갱신 필요: ${m.label} (${m.note})`)
  }

  return {
    summary: {
      name: rec.profile.name, office: rec.profile.office, position: rec.profile.position,
      subject: rec.profile.subject, hobong: rec.profile.hobong, status: rec.profile.status,
      duty: rec.profile.duty, careerYears, currentSchoolSince,
    },
    training: {
      total: t.length, byType,
      totalRecognizedHours: Math.round(totalRecognized / 60 * 10) / 10,
      totalCredit: Math.round(totalCredit * 100) / 100,
      byYear,
    },
    mandatory,
    hobong: { current: rec.profile.hobong, history: rec.promotions, nextExpected },
    bonus: { areas },
    rewards: { count: rec.rewards.length, recent: rec.rewards[rec.rewards.length - 1]?.name || rec.rewards[0]?.name || '' },
    qualifications: { count: rec.qualifications.length, list: rec.qualifications.map((q) => q.name).filter(Boolean) },
    warnings,
  }
}

export { fmtHours, toMinutes }
