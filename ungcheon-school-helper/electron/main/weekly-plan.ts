import { readScheduleCache, writeScheduleCache } from './schedule-cache'
import { fetchWithSystemNetwork } from './system-network'
import { parseHtmlRows } from './html-table'

const SPREADSHEET_ID = '1Bn2hJ8vehxRCgWJmF2CJzaUiiZM6iRxdYLPS4iadB_k'
const HTML_VIEW_URL = `https://docs.google.com/spreadsheets/u/0/d/${SPREADSHEET_ID}/htmlview`
const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_RESPONSE_CHARS = 5_000_000

export interface WeeklyPlanEvent {
  date: string
  department: string
  eventName: string
  sheetName: string
}

export interface WeeklyPlanNote {
  department: string
  content: string
  sheetName: string
  weekStart: string
  weekEnd: string
}

export interface WeeklyPlanResult {
  events: WeeklyPlanEvent[]
  notes: WeeklyPlanNote[]
  sourceSheets: string[]
  fetchedAt: string
}

interface SheetTab {
  name: string
  gid: string
  start: Date
  end: Date
}

const monthCache = new Map<string, { expiresAt: number; value: WeeklyPlanResult }>()

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day))
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

function formatYmd(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('')
}

function parseSheetRange(name: string): { start: Date; end: Date } | null {
  const numbers = (name.replace(/,/g, '.').match(/\d+/g) ?? []).map(Number)
  if (numbers.length < 4) return null

  const year = 2000 + numbers[0]
  const month = numbers[1]
  const day = numbers[2]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  let endYear = year
  let endMonth = month
  let endDay: number
  const rest = numbers.slice(3)
  if (rest.length >= 3) {
    endYear = 2000 + rest[0]
    endMonth = rest[1]
    endDay = rest[2]
  } else if (rest.length === 2) {
    endMonth = rest[0]
    endDay = rest[1]
    if (endMonth < month && month === 12) endYear += 1
  } else {
    endDay = rest[0]
  }

  const start = utcDate(year, month, day)
  const statedEnd = utcDate(endYear, endMonth, endDay)
  if (Number.isNaN(start.getTime()) || Number.isNaN(statedEnd.getTime())) return null

  // 방학식 주처럼 시트명이 이틀만 적혀도 표에는 주말까지 열이 있으므로 한 주 범위를 확보한다.
  const fullWeekEnd = addUtcDays(start, 6)
  return { start, end: statedEnd > fullWeekEnd ? statedEnd : fullWeekEnd }
}

function decodeJavaScriptString(value: string) {
  const hexDecoded = value.replace(/\\x([0-9a-f]{2})/gi, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )
  try {
    return JSON.parse(`"${hexDecoded}"`) as string
  } catch {
    return hexDecoded.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

export function extractSheetTabs(html: string): SheetTab[] {
  const tabs: SheetTab[] = []
  const seen = new Set<string>()
  const pattern = /items\.push\(\{name:\s*"((?:\\.|[^"])*)",[\s\S]*?gid:\s*"(\d+)"/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    const name = decodeJavaScriptString(match[1]).trim()
    const gid = match[2]
    const range = parseSheetRange(name)
    if (!range || seen.has(gid)) continue
    seen.add(gid)
    tabs.push({ name, gid, ...range })
  }
  return tabs
}

function resolveHeaderDate(day: number, weekStart: Date) {
  const candidates: Date[] = []
  for (let monthOffset = -1; monthOffset <= 1; monthOffset += 1) {
    candidates.push(new Date(Date.UTC(
      weekStart.getUTCFullYear(),
      weekStart.getUTCMonth() + monthOffset,
      day,
    )))
  }
  return candidates.sort((a, b) =>
    Math.abs(a.getTime() - weekStart.getTime()) - Math.abs(b.getTime() - weekStart.getTime()),
  )[0]
}

function headerDates(text: string, weekStart: Date) {
  const dates: Date[] = []
  const pattern = /(\d{1,2})\s*일?\s*\(([월화수목금토일])\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const resolved = resolveHeaderDate(Number(match[1]), weekStart)
    const daysFromStart = Math.round((resolved.getTime() - weekStart.getTime()) / 86_400_000)
    if (daysFromStart >= -1 && daysFromStart <= 7) dates.push(resolved)
  }
  return dates
}

export function parseWeeklySheet(
  html: string,
  sheet: Pick<SheetTab, 'name' | 'start' | 'end'>,
): { events: WeeklyPlanEvent[]; notes: WeeklyPlanNote[] } {
  const rows = parseHtmlRows(html)
  const headerRowIndex = rows.findIndex(row =>
    row.cells.some(cell => /\d{1,2}\s*일?\s*\([월화수목금토일]\)/.test(cell.text)),
  )
  if (headerRowIndex < 0) return { events: [], notes: [] }

  const headerRow = rows[headerRowIndex]
  const dateColumns = new Map<number, Date[]>()
  let otherColumn = -1
  for (const cell of headerRow.cells) {
    if (cell.text.includes('기타')) {
      otherColumn = cell.col
      continue
    }
    const dates = headerDates(cell.text, sheet.start)
    if (dates.length) dateColumns.set(cell.col, dates)
  }

  const events: WeeklyPlanEvent[] = []
  const notes: WeeklyPlanNote[] = []
  for (const row of rows.slice(headerRowIndex + 1)) {
    const department = row.cells.find(cell => cell.col === 0)?.text.trim() ?? ''
    if (!department) continue

    for (const cell of row.cells) {
      const content = cell.text.trim()
      if (!content || cell.col === 0 || !/[가-힣A-Za-z0-9]/.test(content)) continue

      const coversOtherColumn = otherColumn >= cell.col && otherColumn < cell.col + cell.colspan
      if (coversOtherColumn) {
        notes.push({
          department: cell.rowspan > 1 ? '공통' : department,
          content,
          sheetName: sheet.name,
          weekStart: formatYmd(sheet.start),
          weekEnd: formatYmd(sheet.end),
        })
      }
      // 날짜 열부터 기타 열까지 합쳐진 셀은 특정일 행사가 아니라 주간 공통 참고사항이다.
      if (coversOtherColumn && cell.colspan > 1) continue

      const coveredDates: Date[] = []
      for (let col = cell.col; col < cell.col + cell.colspan; col += 1) {
        for (const date of dateColumns.get(col) ?? []) coveredDates.push(date)
      }
      for (const date of coveredDates) {
        events.push({
          date: formatYmd(date),
          department,
          eventName: content,
          sheetName: sheet.name,
        })
      }
    }
  }

  return { events, notes }
}

async function fetchText(url: string) {
  const response = await fetchWithSystemNetwork(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'cache-control': 'no-cache',
      'user-agent': 'Mozilla/5.0 UngcheonSchoolHelper/1.0',
    },
  }, { attempts: 3, timeoutMs: 15_000 })
  if (!response.ok) throw new Error(`웅천고 주간계획 응답 오류 (${response.status})`)
  const text = await response.text()
  if (text.length > MAX_RESPONSE_CHARS) throw new Error('웅천고 주간계획 응답이 너무 큽니다.')
  return text
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>()
  return items.filter(item => {
    const value = key(item)
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}

async function refreshWeeklyPlanMonth(year: number, month: number): Promise<WeeklyPlanResult> {
  const cacheKey = `${year}-${month}`
  const indexHtml = await fetchText(`${HTML_VIEW_URL}?_=${Date.now()}`)
  const tabs = extractSheetTabs(indexHtml)
  if (tabs.length === 0) throw new Error('웅천고 주간계획 시트 목록을 찾을 수 없습니다.')
  const monthStart = utcDate(year, month, 1)
  const monthEnd = utcDate(year, month + 1, 0)
  const relevantTabs = tabs
    .filter(tab => tab.start <= monthEnd && tab.end >= monthStart)
    .slice(0, 8)

  const parsed = await Promise.allSettled(relevantTabs.map(async tab => {
    const url = `${HTML_VIEW_URL}/sheet?headers=true&gid=${encodeURIComponent(tab.gid)}&_=${Date.now()}`
    const html = await fetchText(url)
    return parseWeeklySheet(html, tab)
  }))
  if (relevantTabs.length > 0 && parsed.every(item => item.status === 'rejected')) {
    throw new Error('웅천고 주간계획 시트 내용을 불러오지 못했습니다.')
  }

  const monthStartYmd = formatYmd(monthStart)
  const monthEndYmd = formatYmd(monthEnd)
  const events = uniqueBy(
    parsed.flatMap(item => item.status === 'fulfilled' ? item.value.events : []),
    item => `${item.date}\u0000${item.department}\u0000${item.eventName}`,
  )
    .filter(item => item.date >= monthStartYmd && item.date <= monthEndYmd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.department.localeCompare(b.department))
  const notes = uniqueBy(
    parsed.flatMap(item => item.status === 'fulfilled' ? item.value.notes : []),
    item => `${item.weekStart}\u0000${item.department}\u0000${item.content}`,
  )

  const result: WeeklyPlanResult = {
    events,
    notes,
    sourceSheets: relevantTabs
      .filter((_, index) => parsed[index]?.status === 'fulfilled')
      .map(tab => tab.name),
    fetchedAt: new Date().toISOString(),
  }
  monthCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result })
  if (parsed.every(item => item.status === 'fulfilled')) {
    writeScheduleCache(`weekly-plan:${cacheKey}`, result)
  }
  return result
}

export async function getWeeklyPlanMonth(year: number, month: number, force = false): Promise<WeeklyPlanResult> {
  const cacheKey = `${year}-${month}`
  const cached = monthCache.get(cacheKey)
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value

  const persistentKey = `weekly-plan:${cacheKey}`
  const persistent = readScheduleCache<WeeklyPlanResult>(persistentKey)
  if (!force && persistent) {
    monthCache.set(cacheKey, { expiresAt: Date.now() + 30_000, value: persistent })
    void refreshWeeklyPlanMonth(year, month).catch(() => undefined)
    return persistent
  }

  try {
    return await refreshWeeklyPlanMonth(year, month)
  } catch (error) {
    if (persistent) {
      monthCache.set(cacheKey, { expiresAt: Date.now() + 30_000, value: persistent })
      return persistent
    }
    throw error
  }
}
