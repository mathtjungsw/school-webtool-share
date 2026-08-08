import * as XLSX from 'xlsx'

const SPREADSHEET_ID = '1ku5VufC7Pv_dIS0h7lbYMaWSeKzMnyAoBU0QPq5uR00'
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?gid=1578654997#gid=1578654997`
const CACHE_TTL_MS = 10 * 60 * 1000

export type CreativeScheduleKind = 'activity' | 'schoolEvent'
export interface CreativeScheduleEvent {
  date: string
  title: string
  kind: CreativeScheduleKind
  period: string
  grades: string
  guidance: string
  department: string
  sourceSheet: string
  sourceUrl: string
}
export interface CreativeScheduleResult {
  events: CreativeScheduleEvent[]
  fetchedAt: string
  sourceSheets: string[]
  sourceUrl: string
}

const cache = new Map<string, { expiresAt: number; value: CreativeScheduleResult }>()
const clean = (value: unknown) => String(value ?? '').replace(/\r/g, '').trim()
const ymd = (date: Date) => `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`

async function fetchSheet(sheetName: string) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'cache-control': 'no-cache', 'user-agent': 'Mozilla/5.0 UngcheonSchoolHelper/1.0' } })
  if (!response.ok) throw new Error(`${sheetName} 시트 응답 오류 (${response.status})`)
  const csv = await response.text()
  // raw=true를 유지해야 GViz의 ISO 날짜(2026-08-11)가 지역화된
  // 8/11/26 문자열로 바뀌지 않아 월 필터가 정확하게 동작한다.
  const workbook = XLSX.read(csv, { type: 'string', raw: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
}

function parseActivities(rows: unknown[][]): CreativeScheduleEvent[] {
  return rows.slice(1).flatMap(row => {
    const isoDate = clean(row[0])
    const activity = clean(row[4])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !activity) return []
    const grades = [1, 2, 3].filter(grade => clean(row[4 + grade]).toUpperCase() === 'TRUE').map(String).join('·')
    const period = clean(row[2])
    const guidance = clean(row[9])
    const details = [period && `${period}교시`, grades && `${grades}학년`, guidance].filter(Boolean).join(', ')
    return [{
      date: isoDate.replace(/-/g, ''), title: details ? `${activity}(${details})` : activity,
      kind: 'activity' as const, period, grades, guidance, department: clean(row[8]),
      sourceSheet: '창체입력', sourceUrl: SOURCE_URL,
    }]
  })
}

function resolveSchoolDate(baseYear: number, baseMonth: number, day: number, weekday: number) {
  const anchor = Date.UTC(baseYear, baseMonth - 1, 15)
  const candidates: Date[] = []
  for (let offset = -1; offset <= 1; offset += 1) {
    const candidate = new Date(Date.UTC(baseYear, baseMonth - 1 + offset, day))
    if (candidate.getUTCDate() === day && candidate.getUTCDay() === weekday) candidates.push(candidate)
  }
  return candidates.sort((a, b) => Math.abs(a.getTime() - anchor) - Math.abs(b.getTime() - anchor))[0]
}

function parseSchoolEvents(rows: unknown[][]): CreativeScheduleEvent[] {
  const events: CreativeScheduleEvent[] = []
  for (const row of rows) {
    const month = Number(clean(row[1]))
    if (!Number.isInteger(month) || month < 1 || month > 12) continue
    const baseYear = month <= 2 ? 2027 : 2026
    for (let weekdayOffset = 0; weekdayOffset < 5; weekdayOffset += 1) {
      // 월~금 날짜/행사는 수업일수·수업시수 열 다음인 8번째 열부터 두 칸씩 배치된다.
      const day = Number(clean(row[8 + weekdayOffset * 2]))
      const title = clean(row[9 + weekdayOffset * 2])
      if (!day || !title) continue
      const date = resolveSchoolDate(baseYear, month, day, weekdayOffset + 1)
      if (!date) continue
      events.push({
        date: ymd(date), title, kind: 'schoolEvent', period: '', grades: '', guidance: '', department: '',
        sourceSheet: '학사일정_2학기', sourceUrl: SOURCE_URL,
      })
    }
  }
  return events
}

export async function getCreativeScheduleMonth(year: number, month: number, force = false): Promise<CreativeScheduleResult> {
  const key = `${year}-${month}`
  const cached = cache.get(key)
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value
  const [activityRows, schoolRows] = await Promise.all([fetchSheet('창체입력'), fetchSheet('학사일정_2학기')])
  const prefix = `${year}${String(month).padStart(2, '0')}`
  const all = [...parseActivities(activityRows), ...parseSchoolEvents(schoolRows)]
  const seen = new Set<string>()
  const events = all.filter(item => item.date.startsWith(prefix)).filter(item => {
    const eventKey = `${item.date}\u0000${item.kind}\u0000${item.title}`
    if (seen.has(eventKey)) return false
    seen.add(eventKey)
    return true
  }).sort((a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period) || a.title.localeCompare(b.title, 'ko'))
  const result = { events, fetchedAt: new Date().toISOString(), sourceSheets: ['창체입력', '학사일정_2학기'], sourceUrl: SOURCE_URL }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: result })
  return result
}
