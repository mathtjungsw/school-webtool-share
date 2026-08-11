import { readScheduleCache, writeScheduleCache } from './schedule-cache'
import { fetchWithSystemNetwork } from './system-network'
import {
  parseDutySheet,
  type DutyScheduleEvent,
  type DutyScheduleKind,
  type DutyScheduleSource,
} from './duty-schedule-parser'

export { parseDutySheet } from './duty-schedule-parser'
export type { DutyScheduleEvent, DutyScheduleKind } from './duty-schedule-parser'

const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_RESPONSE_CHARS = 1_000_000
const DUTY_CACHE_VERSION = 'v2-two-teachers'

export interface DutyScheduleResult {
  events: DutyScheduleEvent[]
  fetchedAt: string
  sources: Array<{ kind: DutyScheduleKind; sheetName: string; url: string }>
}

const DUTY_SOURCES: DutyScheduleSource[] = [
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

async function fetchSource(source: DutyScheduleSource, force: boolean) {
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
    writeScheduleCache(`duty-schedule:${DUTY_CACHE_VERSION}:${cacheKey}`, result)
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

  const persistent = readScheduleCache<DutyScheduleResult>(`duty-schedule:${DUTY_CACHE_VERSION}:${cacheKey}`)
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
