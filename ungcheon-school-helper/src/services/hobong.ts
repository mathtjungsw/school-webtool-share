// 호봉획정 계산 엔진 — Python calculator.py / reference_data.py 완전 이식

export interface Period {
  years: number
  months: number
  days: number
}

// 자격코드 → [명칭, 기산호봉]
export const JAGYEOK: Record<number, [string, number]> = {
  1:  ['1급정교사',         9],
  2:  ['2급정교사',         8],
  3:  ['1급보건교사',       9],
  4:  ['2급보건교사',       8],
  5:  ['특수1급정교사',     9],
  6:  ['특수2급정교사',     8],
  7:  ['특수준교사',        5],
  8:  ['1급영양교사',       9],
  9:  ['2급영양교사',       8],
  10: ['교장·교감',         9],
  11: ['교도교사',          9],
  12: ['2급사서교사',       8],
  13: ['실기교사',          5],
  14: ['준교사',            5],
  15: ['교육장',            9],
  16: ['장학관',            9],
  17: ['교육연구관',        9],
  18: ['장학사',            9],
  19: ['교육연구사',        9],
  20: ['원장·원감',         9],
  21: ['1급사서교사',       9],
  22: ['전문상담교사 1급',  9],
  23: ['전문상담교사 2급',  8],
}

// 학력코드 → [명칭, 학령수]
export const HAKRYEOK: Record<number, [string, number]> = {
  1:  ['교대졸(4년)',    1],
  2:  ['교대졸(2년)',   -1],
  3:  ['사범대졸(4년)',  1],
  4:  ['사범대졸(2년)', -1],
  5:  ['대졸(4년)',      0],
  6:  ['전문대졸(3년)', -1],
  7:  ['전문대졸(2년)', -2],
  8:  ['사범학교졸',    -3],
  9:  ['고졸',          -4],
  10: ['고2년수료',     -5],
  11: ['고1년수료',     -6],
  12: ['중졸',          -7],
  13: ['중2년수료',     -8],
  14: ['중1년수료',     -9],
  15: ['초졸',         -10],
}

// 경력 유형 → [명칭, 환산율, 설명]
export const CAREER_TYPES: [string, number, string][] = [
  ['기간제교사',          1.00, '국·공·사립 전일제 기간제 교사'],
  ['교사',                1.00, '국·공·사립 정규 교사'],
  ['사립교사(미보고)',    0.50, '사립학교 교사 (보고 미이행)'],
  ['어린이집교사',        1.00, '유아교육법 자격자 어린이집'],
  ['공무원경력',          1.00, '국가·지방공무원'],
  ['임시고용공무원',      0.80, '임시·일용 고용 공무원'],
  ['전일제강사',          1.00, '학교 전일제(8시간 이상) 시간강사'],
  ['시간제기간제',        0.88, '시간제 기간제 (주35h/주40h)'],
  ['시간강사(10할)',      1.00, '학교 시간강사 — 전일제'],
  ['시간강사(5할)',       0.50, '학교 시간강사 — 주 20시간 미만'],
  ['시간강사(3할)',       0.30, '학교 시간강사 — 주 12시간 이하'],
  ['대학강사(10할)',      1.00, '대학 강사 — 주 10시간 이상'],
  ['대학강사(9할)',       0.90, '대학 강사 — 주 9시간'],
  ['대학강사(8할)',       0.80, '대학 강사 — 주 8시간'],
  ['대학강사(7할)',       0.70, '대학 강사 — 주 7시간'],
  ['대학강사(6할)',       0.60, '대학 강사 — 주 6시간'],
  ['대학강사(5할)',       0.50, '대학 강사 — 주 5시간 이하'],
  ['학원강사(5할)',       0.50, '교육감 등록 학원 또는 신고된 교습소'],
  ['학원강사(3할)',       0.30, '미등록 학원/교습소'],
  ['대학원(석사)',        1.00, '대학원 석사 수업연한'],
  ['대학원(박사)',        1.00, '대학원 박사 최대 3년'],
  ['공공기관경력',        0.50, '공기업·준정부기관·공공단체'],
  ['기업경력',            0.40, '상법상 회사 등'],
  ['교원노조경력',        0.70, '1999.1.29 이후 전임자'],
  ['종교단체교육활동',   0.60, '목사·신부·스님 등 교육활동'],
  ['기타전문직(3할)',     0.30, '법인·병원·정당 등'],
  ['병역',                1.00, '군 복무 (최대 3년 인정)'],
  ['기타',                0.00, '미인정 경력'],
]

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function zeroPeriod(): Period { return { years: 0, months: 0, days: 0 } }

function toDateTuple(d: Date): [number, number, number] {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
}

export function calcPeriod(start: Date, end: Date): Period {
  if (!start || !end || start > end) return zeroPeriod()

  const [ya, ma, da] = toDateTuple(start)
  const [yb, mb, db] = toDateTuple(end)

  let ty = yb - ya
  let tm: number
  if (mb < ma) { ty -= 1; tm = mb + 12 - ma } else { tm = mb - ma }

  const endLast = lastDayOfMonth(yb, mb)
  let td: number

  if (da === 1) {
    if (db === endLast) { td = 0; tm += 1 } else { td = db }
    if (td >= 30) td = 29
  } else {
    if (db >= da - 1) {
      td = db - da + 1
    } else {
      const prevMonth = mb > 1 ? mb - 1 : 12
      const prevYear = mb > 1 ? yb : yb - 1
      const prevLast = lastDayOfMonth(prevYear, prevMonth)
      td = prevLast - da + 1 + db
      tm -= 1
    }
    if (td >= 30) td = 29
  }

  if (tm < 0) { tm += 12; ty -= 1 }
  if (tm >= 12) { tm -= 12; ty += 1 }

  return { years: Math.max(ty, 0), months: Math.max(tm, 0), days: Math.max(td, 0) }
}

function toDays(p: Period): number {
  return p.years * 360 + p.months * 30 + p.days
}

function fromDays(total: number): Period {
  if (total < 0) return zeroPeriod()
  const y = Math.floor(total / 360)
  const rem = total % 360
  const m = Math.floor(rem / 30)
  const d = rem % 30
  return { years: y, months: m, days: d }
}

export function calcConversion(start: Date, end: Date, rate: number): Period {
  const p = calcPeriod(start, end)
  if (rate <= 0) return zeroPeriod()
  return fromDays(Math.floor(toDays(p) * Math.abs(rate)))
}

export interface CareerEntry {
  type: string
  rate: number
  start: Date | null
  end: Date | null
  isBYEOKYI: boolean
}

const BYEOKYI_MAX = 3 * 360

export function calcTotalConverted(entries: CareerEntry[]): Period {
  let totalDays = 0
  for (const e of entries) {
    if (!e.start || !e.end || e.rate <= 0) continue
    if (e.isBYEOKYI) {
      const raw = toDays(calcPeriod(e.start, e.end))
      const capped = Math.min(raw, BYEOKYI_MAX)
      totalDays += Math.floor(capped * Math.abs(e.rate))
    } else {
      totalDays += toDays(calcConversion(e.start, e.end, e.rate))
    }
  }
  return fromDays(totalDays)
}

export function calcTotalReal(entries: CareerEntry[]): Period {
  let totalDays = 0
  for (const e of entries) {
    if (!e.start || !e.end || e.rate <= 0) continue
    totalDays += toDays(calcPeriod(e.start, e.end))
  }
  return fromDays(totalDays)
}

export interface HobongResult {
  kisanHobong: number
  sabong: number
  remainMonths: number
  remainDays: number
  atCap: boolean
}

export function calcHobong(
  jagyeokCode: number,
  hakryeokCode: number,
  converted: Period,
  hobongCap = false,
  capHobong = 40
): HobongResult {
  const [, base] = JAGYEOK[jagyeokCode] ?? ['', 8]
  const [, supplement] = HAKRYEOK[hakryeokCode] ?? ['', 0]

  const kisan = base + supplement
  let sabong = kisan + converted.years
  const atCap = hobongCap && sabong > capHobong
  if (hobongCap) sabong = Math.min(sabong, capHobong)

  return {
    kisanHobong: kisan,
    sabong,
    remainMonths: atCap ? 0 : converted.months,
    remainDays: atCap ? 0 : converted.days,
    atCap,
  }
}

export function calcNextPromotion(
  hobongDate: Date,
  remainMonths: number,
  remainDays: number
): Date | null {
  if (!hobongDate) return null
  remainMonths = Math.max(0, Math.min(Math.floor(remainMonths), 11))
  remainDays = Math.max(0, Math.floor(remainDays))
  const monthsToAdd = (12 - remainMonths) + (remainDays > 0 ? 1 : 0)
  const total = (hobongDate.getMonth()) + monthsToAdd // 0-indexed
  const y = hobongDate.getFullYear() + Math.floor(total / 12)
  const m = (total % 12) + 1
  return new Date(y, m - 1, 1)
}

export function periodToString(p: Period): string {
  const parts: string[] = []
  if (p.years) parts.push(`${p.years}년`)
  if (p.months) parts.push(`${p.months}개월`)
  if (p.days) parts.push(`${p.days}일`)
  return parts.join(' ') || '0일'
}
