import { parseHtmlRows } from './weekly-plan'
import { readScheduleCache, writeScheduleCache } from './schedule-cache'
import { fetchWithSystemNetwork } from './system-network'

const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_RESPONSE_CHARS = 1_000_000

export type DutyScheduleKind = 'gate' | 'meal'

export interface DutyScheduleEvent {
  date: string
  kind: DutyScheduleKind
  title: string
  time: string
  location: string
  sourceSheet: string
  sourceUrl: string
}

export interface DutyScheduleResult {
  events: DutyScheduleEvent[]
  fetchedAt: string
  sources: Array<{ kind: DutyScheduleKind; sheetName: string; url: string }>
}

interface DutySource {
  kind: DutyScheduleKind
  spreadsheetId: string
  gid: string
  sheetName: string
  title: string
  time: string
  location: string
}

const DUTY_SOURCES: DutySource[] = [
  {
    kind: 'gate',
    spreadsheetId: '1YhgrTJOuWKqCFRkFVPLQ__cARt17GOvsC633k10dBFU',
    gid: '510570270',
    sheetName: '교문지도(2학기)',
    title: '등교지도',
    time: '08:15~08:25',
    location: '교문',
  },
  {
    kind: 'meal',
    spreadsheetId: '10cPw-KaYGNPSN-JYDCmNC7MqPhUVOwtoIzD7kS6qKRE',
    gid: '1083112532',
    sheetName: '급식 지도(2학기)',
    title: '급식지도',
    time: '12:30~13:10',
    location: '급식실',
  },
]

const resultCache = new Map<string, { expiresAt: number; value: DutyScheduleResult }>()
const htmlCache = new Map<string, { expiresAt: number; value: string }>()

function formatYmd(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('')
}

function resolveDate(year: number, month: number, dateMonth: number, day: number) {
  const target = Date.UTC(year, month - 1, 15)
  return [year - 1, year, year + 1]
    .map(candidateYear => new Date(Date.UTC(candidateYear, dateMonth - 1, day)))
    .sort((a, b) => Math.abs(a.getTime() - target) - Math.abs(b.getTime() - target))[0]
}

function extractDate(text: string, year: number, month: number) {
  const match = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (!match) return null
  const dateMonth = Number(match[1])
  const day = Number(match[2])
  if (dateMonth < 1 || dateMonth > 12 || day < 1 || day > 31) return null
  const date = resolveDate(year, month, dateMonth, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function containsTeacher(text: string, teacherName: string) {
  return text
    .split(/[,，·/\s]+/)
    .map(value => value.trim())
    .filter(Boolean)
    .includes(teacherName)
}

export function parseDutySheet(
  html: string,
  source: DutySource,
  year: number,
  month: number,
  teacherName: string,
): DutyScheduleEvent[] {
  const rows = parseHtmlRows(html)
  const events: DutyScheduleEvent[] = []
  const monthPrefix = `${year}${String(month).padStart(2, '0')}`

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const dateCells = rows[rowIndex].cells
      .map(cell => ({ cell, date: extractDate(cell.text, year, month) }))
      .filter((item): item is { cell: (typeof rows)[number]['cells'][number]; date: Date } => Boolean(item.date))
    if (dateCells.length === 0) continue

    let blockEnd = rowIndex + 1
    while (blockEnd < rows.length && !rows[blockEnd].cells.some(cell => extractDate(cell.text, year, month))) {
      blockEnd += 1
    }

    for (const { cell: dateCell, date } of dateCells) {
      const dateYmd = formatYmd(date)
      if (!dateYmd.startsWith(monthPrefix)) continue
      for (const row of rows.slice(rowIndex + 1, blockEnd)) {
        const assignment = row.cells.find(cell =>
          cell.col <= dateCell.col &&
          dateCell.col < cell.col + cell.colspan &&
          containsTeacher(cell.text, teacherName),
        )
        if (!assignment) continue

        const gateLocation = row.cells
          .map(cell => cell.text.trim())
          .find(value => value === '정문' || value === '후문')
        const location = source.kind === 'gate' ? (gateLocation ?? source.location) : source.location
        events.push({
          date: dateYmd,
          kind: source.kind,
          title: source.kind === 'gate' ? `${source.title} · ${location}` : source.title,
          time: source.time,
          location,
          sourceSheet: source.sheetName,
          sourceUrl: `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/edit?gid=${source.gid}#gid=${source.gid}`,
        })
      }
    }
  }

  return events.filter((event, index, all) =>
    all.findIndex(item => item.date === event.date && item.kind === event.kind && item.location === event.location) === index,
  )
}

async function fetchSource(source: DutySource, force: boolean) {
  const cacheKey = `${source.spreadsheetId}:${source.gid}`
  const cached = htmlCache.get(cacheKey)
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value

  const url = `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/htmlview/sheet?headers=true&gid=${encodeURIComponent(source.gid)}&_=${Date.now()}`
  const response = await fetchWithSystemNetwork(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'cache-control': 'no-cache',
      'user-agent': 'Mozilla/5.0 UngcheonSchoolHelper/1.0',
    },
  }, { attempts: 3, timeoutMs: 15_000 })
  if (!response.ok) throw new Error(`${source.title} 시트 응답 오류 (${response.status})`)
  const text = await response.text()
  if (text.length > MAX_RESPONSE_CHARS) throw new Error(`${source.title} 시트 응답이 너무 큽니다.`)
  htmlCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: text })
  return text
}

async function refreshDutyScheduleMonth(
  year: number,
  month: number,
  teacherName: string,
  force: boolean,
): Promise<DutyScheduleResult> {
  const normalizedName = teacherName.trim()
  if (!normalizedName) return { events: [], fetchedAt: new Date().toISOString(), sources: [] }
  const cacheKey = `${year}-${month}-${normalizedName}`
  const parsed = await Promise.allSettled(DUTY_SOURCES.map(async source => {
    const html = await fetchSource(source, force)
    return parseDutySheet(html, source, year, month, normalizedName)
  }))
  if (parsed.every(item => item.status === 'rejected')) {
    throw new Error('등교지도·급식지도 시트를 불러오지 못했습니다.')
  }

  const result: DutyScheduleResult = {
    events: parsed
      .flatMap(item => item.status === 'fulfilled' ? item.value : [])
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    fetchedAt: new Date().toISOString(),
    sources: DUTY_SOURCES
      .filter((_, index) => parsed[index]?.status === 'fulfilled')
      .map(source => ({
        kind: source.kind,
        sheetName: source.sheetName,
        url: `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/edit?gid=${source.gid}#gid=${source.gid}`,
      })),
  }
  resultCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result })
  if (parsed.every(item => item.status === 'fulfilled')) {
    writeScheduleCache(`duty-schedule:${cacheKey}`, result)
  }
  return result
}

export async function getDutyScheduleMonth(
  year: number,
  month: number,
  teacherName: string,
  force = false,
): Promise<DutyScheduleResult> {
  const normalizedName = teacherName.trim()
  if (!normalizedName) return { events: [], fetchedAt: new Date().toISOString(), sources: [] }
  const cacheKey = `${year}-${month}-${normalizedName}`
  const cached = resultCache.get(cacheKey)
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value

  const persistent = readScheduleCache<DutyScheduleResult>(`duty-schedule:${cacheKey}`)
  if (!force && persistent) {
    resultCache.set(cacheKey, { expiresAt: Date.now() + 30_000, value: persistent })
    void refreshDutyScheduleMonth(year, month, normalizedName, true).catch(() => undefined)
    return persistent
  }

  try {
    return await refreshDutyScheduleMonth(year, month, normalizedName, force)
  } catch (error) {
    if (persistent) {
      resultCache.set(cacheKey, { expiresAt: Date.now() + 30_000, value: persistent })
      return persistent
    }
    throw error
  }
}
