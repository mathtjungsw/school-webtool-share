import { app, net } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  findAchievementStandardRecord,
  findAchievementStandardCodes,
  hasAchievementStandardCode,
  normalizeOfficialSubjectKey,
  type AchievementStandardDataset,
  type AchievementStandardSubjectRecord,
} from './schoolinfo-achievement'

const SCHOOLINFO_WEB_ORIGIN = 'https://school.gomdori.app'
const SCHOOLINFO_MCP_URL = 'https://mcp.gomdori.app/school'
const CACHE_FILE_NAME = 'schoolinfo-evaluation-cache.json'
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000
const EVALUATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 80
const MAX_RESPONSE_TEXT = 1_500_000
const ACHIEVEMENT_STANDARD_FILE = 'achievement-standard-subject-prefixes.json'

let achievementStandardDataset: AchievementStandardDataset | null | undefined

export interface SchoolInfoSchool {
  name: string
  shlIdfCd: string
  schoolCode: string
  sido: string
  sgg: string
  dong: string
  kind: string
  foundation: string
  address: string
}

export interface SchoolInfoEvaluationFile {
  seq: string
  filename: string
  sizeKB: number
  downloadUrl: string
}

export interface SchoolInfoEvaluationRequest {
  school: SchoolInfoSchool
  year: number
  semester: 1 | 2
  grade: 1 | 2 | 3
  subject: string
  force?: boolean
}

interface CacheEntry {
  expiresAt: number
  storedAt: number
  value: unknown
}

interface CacheDocument {
  version: 1
  entries: Record<string, CacheEntry>
}

function emptyCache(): CacheDocument {
  return { version: 1, entries: {} }
}

function cachePath() {
  return join(app.getPath('userData'), CACHE_FILE_NAME)
}

function readCache(): CacheDocument {
  try {
    const path = cachePath()
    if (!existsSync(path)) return emptyCache()
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CacheDocument
    return parsed?.version === 1 && parsed.entries ? parsed : emptyCache()
  } catch {
    return emptyCache()
  }
}

function writeCache(cache: CacheDocument) {
  try {
    const entries = Object.entries(cache.entries)
      .filter(([, entry]) => entry.expiresAt > Date.now())
      .sort((a, b) => b[1].storedAt - a[1].storedAt)
      .slice(0, MAX_CACHE_ENTRIES)
    writeFileSync(cachePath(), JSON.stringify({ version: 1, entries: Object.fromEntries(entries) }), 'utf8')
  } catch {
    // 공개 공시자료 캐시는 편의 기능이다. 캐시 저장 실패가 조회 자체를 막지 않게 한다.
  }
}

function cacheGet<T>(key: string): T | null {
  const entry = readCache().entries[key]
  if (!entry || entry.expiresAt <= Date.now()) return null
  return entry.value as T
}

function cacheSet(key: string, value: unknown, ttlMs: number) {
  const cache = readCache()
  cache.entries[key] = { value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs }
  writeCache(cache)
}

function loadAchievementStandardDataset() {
  if (achievementStandardDataset !== undefined) return achievementStandardDataset
  const candidates = [
    join(process.resourcesPath, 'curriculum', ACHIEVEMENT_STANDARD_FILE),
    join(process.resourcesPath, 'resources', 'curriculum', ACHIEVEMENT_STANDARD_FILE),
    join(app.getAppPath(), 'resources', 'curriculum', ACHIEVEMENT_STANDARD_FILE),
    join(process.cwd(), 'resources', 'curriculum', ACHIEVEMENT_STANDARD_FILE),
  ]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as AchievementStandardDataset
      if (Number(parsed?.schemaVersion) >= 1 && Array.isArray(parsed?.records)) {
        achievementStandardDataset = parsed
        return achievementStandardDataset
      }
    } catch {
      // 다음 후보 경로를 확인한다.
    }
  }
  achievementStandardDataset = null
  return achievementStandardDataset
}

function validateSchool(school: SchoolInfoSchool) {
  if (!school || school.kind !== '고등학교') throw new Error('고등학교만 조회할 수 있습니다.')
  for (const value of [school.name, school.sido, school.sgg]) {
    if (typeof value !== 'string' || !value.trim() || value.length > 60) {
      throw new Error('학교 정보가 올바르지 않습니다.')
    }
  }
}

async function fetchText(url: string, init?: RequestInit, timeoutMs = 25_000) {
  const parsed = new URL(url)
  if (!['school.gomdori.app', 'mcp.gomdori.app'].includes(parsed.hostname)) {
    throw new Error('허용되지 않은 학교알리미 연동 주소입니다.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await net.fetch(url, { ...init, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`학교알리미 연동 HTTP ${response.status}`)
    if (text.length > MAX_RESPONSE_TEXT) throw new Error('학교알리미 응답 크기가 너무 큽니다.')
    return text
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('학교알리미 조회 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('학교알리미 응답 형식을 읽지 못했습니다.')
  }
}

function normalizeSubject(value: string) {
  return normalizeOfficialSubjectKey(value)
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripCellMarkup(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\*\*|__|`/g, '')
    .trim()
}

/** 과목명은 코드가 없는 문서를 '원문 확인 필요'로 보여 주는 보조 근거로만 쓴다. */
function hasStructuredSubjectNameEvidence(markdown: string, subject: string) {
  const normalizedSubject = normalizeSubject(subject)
  if (!normalizedSubject) return false

  const htmlCells = [...markdown.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
  if (htmlCells.some((match) => normalizeSubject(stripCellMarkup(match[1])) === normalizedSubject)) return true

  for (const line of markdown.split(/\r?\n/)) {
    if (line.includes('|')) {
      const cells = line.split('|').map(stripCellMarkup).filter(Boolean)
      if (cells.some((cell) => normalizeSubject(cell) === normalizedSubject)) return true
    }
  }

  const flexibleSubject = escapeRegex(subject.normalize('NFKC').trim()).replace(/\s+/g, '\\s*')
  const labelledSubject = new RegExp(`(?:과목명|교과목|과목)\\s*[:：]\\s*${flexibleSubject}(?=$|[^0-9A-Za-z가-힣])`, 'im')
  if (labelledSubject.test(markdown.normalize('NFKC'))) return true

  const headingSubject = new RegExp(`^\\s*(?:#{1,6}\\s*)?${flexibleSubject}\\s*(?:$|[-–—(（])`, 'im')
  if (headingSubject.test(markdown.normalize('NFKC'))) return true

  // 과목명 길이에 관계없이 일반 본문 속 단순 등장은 근거로 사용하지 않는다.
  // 구조적 근거가 없으면 원문 확인 필요로 남긴다.
  return false
}

function parseMcpPayload(raw: string) {
  let payload = raw
  if (raw.startsWith('data:') || raw.includes('\ndata:')) {
    const chunks = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
    payload = chunks.at(-1) ?? ''
  }
  const parsed = parseJson<{
    result?: { content?: Array<{ type?: string; text?: string }>; isError?: boolean }
    error?: { message?: string }
  }>(payload)
  if (parsed.error?.message) throw new Error(parsed.error.message)
  const text = (parsed.result?.content ?? []).map((item) => item.text ?? '').join('\n').trim()
  if (!text) throw new Error('학교알리미에서 평가계획 내용을 받지 못했습니다.')
  if (parsed.result?.isError) throw new Error(text)
  return text
}

async function callSchoolInfoMcp(toolName: 'find_school' | 'search_school', args: Record<string, unknown>) {
  const raw = await fetchText(SCHOOLINFO_MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })
  return parseMcpPayload(raw)
}

function fallbackSchoolCode(sido: string, sgg: string, name: string) {
  return `mcp:${sido}:${sgg}:${name}`
}

function schoolFromFallback(input: {
  name: string
  sido: string
  sgg: string
  foundation: string
  address?: string
}) : SchoolInfoSchool {
  const schoolCode = fallbackSchoolCode(input.sido, input.sgg, input.name)
  return {
    name: input.name,
    shlIdfCd: schoolCode,
    schoolCode,
    sido: input.sido,
    sgg: input.sgg,
    dong: '',
    kind: '고등학교',
    foundation: input.foundation,
    address: input.address ?? `${input.sido} ${input.sgg}`,
  }
}

function parseRegionSchoolFallback(markdown: string, sido: string, sgg: string) {
  const schools: SchoolInfoSchool[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.trim().match(/^-\s+(.+?)\s+\(([^,()]+),\s*(.+)\)$/)
    if (!match) continue
    const [, name, foundation, address] = match
    if (!name.endsWith('고등학교')) continue
    schools.push(schoolFromFallback({ name, sido, sgg, foundation, address }))
  }
  return schools
}

function parseNamedSchoolFallback(markdown: string) {
  const schools: SchoolInfoSchool[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.trim().match(/^-\s+(.+?)\s+—\s+(.+?)\s+·\s+([^·]+?)\s+·\s+([^·]+?)\s*$/)
    if (!match) continue
    const [, name, location, kind, foundation] = match
    if (kind.trim() !== '고등학교') continue
    const locationMatch = location.trim().match(/^(.+?(?:특별자치도|특별자치시|특별시|광역시|도))\s+(.+)$/)
    if (!locationMatch) continue
    schools.push(schoolFromFallback({
      name,
      sido: locationMatch[1],
      sgg: locationMatch[2],
      foundation: foundation.trim(),
      address: location.trim(),
    }))
  }
  return schools
}

function subjectSegments(markdown: string, subject: string, achievementRecord: AchievementStandardSubjectRecord | null) {
  const segments = markdown.split(/\n\s*---\s*\n/g)
  const codeMatched = segments.filter((segment) => hasAchievementStandardCode(segment, achievementRecord))
  const codeMatchedSet = new Set(codeMatched.map((segment) => segment.trim()))
  const nameMatched = segments.filter((segment) => (
    !codeMatchedSet.has(segment.trim()) && hasStructuredSubjectNameEvidence(segment, subject)
  ))
  const matched = [...codeMatched, ...nameMatched]
  if (!matched.length) return { text: markdown, scope: 'document' as const }
  const header = markdown.split(/\n\s*---\s*\n/g)[0]?.split('\n').slice(0, 5).join('\n') ?? ''
  const text = [header, ...matched.slice(0, 8)].join('\n\n---\n\n')
  if (text.length >= markdown.length * 0.8) return { text: markdown, scope: 'document' as const }
  return { text, scope: 'subject' as const }
}

function downloadUrl(school: SchoolInfoSchool, year: number, seq: string) {
  const params = new URLSearchParams({
    sido: school.sido,
    sgg: school.sgg,
    kind: school.kind,
    name: school.name,
    year: String(year),
    seq,
  })
  return `${SCHOOLINFO_WEB_ORIGIN}/api/download?${params.toString()}`
}

async function listEvaluationFiles(school: SchoolInfoSchool, year: number) {
  const cacheKey = `evaluation-files:${school.schoolCode || school.shlIdfCd}:${year}`
  const cached = cacheGet<SchoolInfoEvaluationFile[]>(cacheKey)
  if (cached) return cached
  const params = new URLSearchParams({
    sido: school.sido,
    sgg: school.sgg,
    kind: school.kind,
    name: school.name,
    year: String(year),
  })
  const data = parseJson<{
    files?: Array<{ seq: string; filename: string; sizeKB?: number }>
    downloads?: Array<{ seq: string; filename: string; sizeKB?: number }>
    error?: string
  }>(
    await fetchText(`${SCHOOLINFO_WEB_ORIGIN}/api/evaluation?${params.toString()}`),
  )
  if (data.error) throw new Error(data.error)
  const files = (data.files ?? data.downloads ?? [])
    .filter((file) => {
      const normalized = String(file.filename).replace(/\s+/g, '')
      return !normalized.includes('학업성적관리규정') && /평가|교수학습|교수·학습/.test(normalized)
    })
    .map((file) => ({
      seq: String(file.seq),
      filename: String(file.filename),
      sizeKB: Number(file.sizeKB ?? 0),
      downloadUrl: downloadUrl(school, year, String(file.seq)),
    }))
  cacheSet(cacheKey, files, EVALUATION_TTL_MS)
  return files
}

export async function searchSchoolInfoSchools(query: string, force = false) {
  const word = String(query ?? '').trim()
  if (word.length < 2 || word.length > 40) throw new Error('학교 이름을 두 글자 이상 입력해 주세요.')
  const cacheKey = `search:${word}`
  if (!force) {
    const cached = cacheGet<{ schools: SchoolInfoSchool[]; fetchedAt: string }>(cacheKey)
    if (cached) return { ...cached, cached: true }
  }
  let schools: SchoolInfoSchool[] = []
  let source: 'web' | 'mcp' = 'web'
  try {
    const data = parseJson<{ schools?: SchoolInfoSchool[] }>(
      await fetchText(`${SCHOOLINFO_WEB_ORIGIN}/api/searchName?word=${encodeURIComponent(word)}`),
    )
    schools = (data.schools ?? []).filter((school) => school.kind === '고등학교')
  } catch {
    source = 'mcp'
    schools = parseNamedSchoolFallback(await callSchoolInfoMcp('find_school', { name: word }))
  }
  const value = {
    schools: schools.slice(0, 30),
    fetchedAt: new Date().toISOString(),
    source,
  }
  cacheSet(cacheKey, value, SEARCH_TTL_MS)
  return { ...value, cached: false }
}

export async function searchSchoolInfoSchoolsByRegion(sidoInput: string, sggInput: string, force = false) {
  const sido = String(sidoInput ?? '').trim()
  const sgg = String(sggInput ?? '').trim()
  if (!sido || sido.length > 30 || !sgg || sgg.length > 30) {
    throw new Error('시·도와 시·군·구를 올바르게 선택해 주세요.')
  }
  const cacheKey = `region-v2:${sido}:${sgg}`
  if (!force) {
    const cached = cacheGet<{ schools: SchoolInfoSchool[]; fetchedAt: string }>(cacheKey)
    if (cached) return { ...cached, cached: true }
  }
  const params = new URLSearchParams({ sido, sgg, kind: '고등학교', name: '' })
  let schools: SchoolInfoSchool[] = []
  let source: 'web' | 'mcp' = 'web'
  try {
    const data = parseJson<{ schools?: SchoolInfoSchool[]; error?: string }>(
      await fetchText(`${SCHOOLINFO_WEB_ORIGIN}/api/search?${params.toString()}`),
    )
    if (data.error) throw new Error(data.error)
    schools = data.schools ?? []
  } catch {
    source = 'mcp'
    const markdown = await callSchoolInfoMcp('search_school', { sido, sgg, kind: '고등학교', name: '' })
    schools = parseRegionSchoolFallback(markdown, sido, sgg)
  }
  const value = {
    schools: schools.map((school) => ({
      ...school,
      sido: school.sido || sido,
      sgg: school.sgg || sgg,
      dong: school.dong || '',
      kind: school.kind || '고등학교',
    })).filter((school) => school.kind === '고등학교'),
    fetchedAt: new Date().toISOString(),
    source,
  }
  cacheSet(cacheKey, value, SEARCH_TTL_MS)
  return { ...value, cached: false }
}

export async function getSchoolInfoEvaluationPlan(request: SchoolInfoEvaluationRequest) {
  const { school, year, semester, grade } = request
  const subject = String(request.subject ?? '').trim()
  validateSchool(school)
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('조회 학년도가 올바르지 않습니다.')
  if (![1, 2].includes(semester) || ![1, 2, 3].includes(grade)) throw new Error('학년 또는 학기가 올바르지 않습니다.')
  if (!subject || subject.length > 60) throw new Error('정식 과목명을 선택해 주세요.')

  const dataset = loadAchievementStandardDataset()
  if (!dataset) throw new Error('내장 성취기준 코드 데이터를 읽지 못했습니다. 시험판을 다시 설치해 주세요.')
  const achievementRecord = findAchievementStandardRecord(dataset, subject, grade)

  const cacheKey = `evaluation-v7-mcp-file-index-fallback:${school.schoolCode || school.shlIdfCd}:${year}:${semester}:${grade}:${normalizeSubject(subject)}`
  if (!request.force) {
    const cached = cacheGet<Record<string, unknown>>(cacheKey)
    if (cached) return { ...cached, cached: true }
  }

  let files: SchoolInfoEvaluationFile[] = []
  let fileIndexWarning = ''
  try {
    files = await listEvaluationFiles(school, year)
    if (!files.length) fileIndexWarning = '평가파일 목록에서는 자료를 확인하지 못했지만 MCP 원문 검색을 계속했습니다.'
  } catch (error) {
    fileIndexWarning = `평가파일 목록 확인 실패(${error instanceof Error ? error.message : String(error)}). MCP 원문 검색은 계속 진행했습니다.`
  }
  const gradeFile = files.find((file) => file.filename.includes(`${grade}학년`))
  if (files.some((file) => /\d학년/.test(file.filename)) && !gradeFile) {
    fileIndexWarning = `${school.name}의 ${grade}학년 파일을 목록에서 확인하지 못했지만 MCP 원문 검색을 계속했습니다.`
  }

  const args = {
    sido: school.sido,
    sgg: school.sgg,
    kind: '고등학교',
    name: school.name,
    year,
    semester,
    subject,
    grade,
    // 기본 응답은 수행평가 부분만 잘라 성취기준 코드가 빠질 수 있으므로,
    // 선택된 평가계획 원문 전체를 받은 뒤 앱에서 코드로 최종 판정한다.
    full: true,
  }
  const raw = await fetchText(SCHOOLINFO_MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: 'get_evaluation_plan', arguments: args },
    }),
  }, 45_000)
  const markdown = parseMcpPayload(raw)
  const matchedAchievementCodes = findAchievementStandardCodes(markdown, achievementRecord, 6)
  const exactMatch = matchedAchievementCodes.length > 0
  const subjectNameMatch = hasStructuredSubjectNameEvidence(markdown, subject)
  const notFound = /찾지 못했습니다|찾을 수 없습니다/.test(markdown)
  const segmented = subjectSegments(markdown, subject, achievementRecord)
  const value = {
    school,
    year,
    semester,
    grade,
    subject,
    markdown: segmented.text,
    originalLength: markdown.length,
    scope: segmented.scope,
    matchStatus: exactMatch ? 'exact' : notFound ? 'not-found' : 'review',
    matchBasis: exactMatch ? 'achievement-code' : subjectNameMatch ? 'subject-name' : 'none',
    achievementCodePrefix: achievementRecord?.codePrefix ?? null,
    achievementCodeStatus: achievementRecord?.status ?? 'mapping-not-found',
    matchedAchievementCodes,
    files,
    primaryFile: gradeFile ?? files[0] ?? null,
    fileIndexWarning: fileIndexWarning || undefined,
    fetchedAt: new Date().toISOString(),
    privacyNote: '학생·교직원 자료는 전송하지 않으며, 학교명·학년도·학기·학년·과목명만 조회에 사용합니다.',
  }
  cacheSet(cacheKey, value, EVALUATION_TTL_MS)
  return { ...value, cached: false }
}

export function clearSchoolInfoEvaluationCache() {
  writeCache(emptyCache())
  return true
}
