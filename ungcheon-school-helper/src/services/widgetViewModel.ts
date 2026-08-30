import { UNGCHEON_LUNCH, UNGCHEON_PERIOD_PLAN } from './ungcheonSchedule'
import { canonicalStudentId } from './studentId'

export interface WidgetPeriodDefinition {
  period: string | number
  start: string
  end: string
}

export type WidgetPeriodPhase = 'before-school' | 'lesson' | 'break' | 'lunch' | 'after-school'

export interface WidgetPeriodTiming {
  phase: WidgetPeriodPhase
  currentPeriod: number | null
  completedPeriod: number | null
  nextPeriod: number | null
  remainingMinutes: number | null
  label: string
  detail: string
}

function minutesFromClock(value: string) {
  const matched = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!matched) return Number.NaN
  return Number(matched[1]) * 60 + Number(matched[2])
}

function periodNumber(value: string | number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function remainingMinutes(currentMinutes: number, targetMinutes: number) {
  return Math.max(0, Math.ceil(targetMinutes - currentMinutes))
}

/** Returns school-clock state without depending on React or the current timetable. */
export function getWidgetPeriodTiming(
  now: Date,
  periods: readonly WidgetPeriodDefinition[] = UNGCHEON_PERIOD_PLAN.slice(0, 7),
): WidgetPeriodTiming {
  const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  const normalized = periods
    .map(item => ({
      ...item,
      number: periodNumber(item.period),
      startMinutes: minutesFromClock(item.start),
      endMinutes: minutesFromClock(item.end),
    }))
    .filter(item => Number.isFinite(item.startMinutes) && Number.isFinite(item.endMinutes))
    .sort((left, right) => left.startMinutes - right.startMinutes)

  if (!normalized.length) {
    return {
      phase: 'after-school', currentPeriod: null, completedPeriod: null, nextPeriod: null,
      remainingMinutes: null, label: '수업 시간 정보 없음', detail: '학교 교시 시간을 확인해 주세요.',
    }
  }

  const first = normalized[0]
  if (currentMinutes < first.startMinutes) {
    const minutes = remainingMinutes(currentMinutes, first.startMinutes)
    return {
      phase: 'before-school', currentPeriod: null, completedPeriod: null, nextPeriod: first.number,
      remainingMinutes: minutes, label: '수업 시작 전', detail: `${first.number ?? 1}교시 시작까지 ${minutes}분`,
    }
  }

  for (let index = 0; index < normalized.length; index += 1) {
    const period = normalized[index]
    if (currentMinutes >= period.startMinutes && currentMinutes <= period.endMinutes) {
      const minutes = remainingMinutes(currentMinutes, period.endMinutes)
      return {
        phase: 'lesson', currentPeriod: period.number, completedPeriod: null,
        nextPeriod: normalized[index + 1]?.number ?? null, remainingMinutes: minutes,
        label: `${period.number ?? index + 1}교시 수업 중`, detail: `${minutes}분 남음 · ${period.end} 종료`,
      }
    }

    const next = normalized[index + 1]
    if (next && currentMinutes > period.endMinutes && currentMinutes < next.startMinutes) {
      const minutes = remainingMinutes(currentMinutes, next.startMinutes)
      const lunchStart = minutesFromClock(UNGCHEON_LUNCH.start)
      const lunchEnd = minutesFromClock(UNGCHEON_LUNCH.end)
      const lunch = currentMinutes >= lunchStart && currentMinutes < lunchEnd
      return {
        phase: lunch ? 'lunch' : 'break', currentPeriod: null, completedPeriod: period.number,
        nextPeriod: next.number, remainingMinutes: minutes,
        label: lunch ? '점심시간' : '쉬는 시간',
        detail: `${next.number ?? index + 2}교시 시작까지 ${minutes}분 · ${next.start} 시작`,
      }
    }
  }

  const last = normalized.at(-1)!
  return {
    phase: 'after-school', currentPeriod: null, completedPeriod: last.number, nextPeriod: null,
    remainingMinutes: null, label: '오늘 수업 종료', detail: `${last.end} 정규 수업 종료`,
  }
}

export function formatYmd(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseYmd(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day, 12)
  return formatYmd(parsed) === value ? parsed : null
}

export function addDaysYmd(value: string, amount: number) {
  const parsed = parseYmd(value)
  if (!parsed) return ''
  parsed.setDate(parsed.getDate() + Math.trunc(amount))
  return formatYmd(parsed)
}

export function differenceInYmdDays(from: string, to: string) {
  const left = parseYmd(from)
  const right = parseYmd(to)
  if (!left || !right) return Number.NaN
  return Math.round((right.getTime() - left.getTime()) / 86_400_000)
}

export interface WidgetTaskLike {
  id: string
  title: string
  deadline: string
  completed?: boolean
  source?: string
}

export type WidgetTaskBucketId = 'overdue' | 'today' | 'soon' | 'later'

export interface WidgetTaskBucket<T extends WidgetTaskLike = WidgetTaskLike> {
  id: WidgetTaskBucketId
  label: string
  count: number
  items: T[]
}

const TASK_BUCKET_LABELS: Record<WidgetTaskBucketId, string> = {
  overdue: '기한 초과',
  today: '오늘 마감',
  soon: '3일 이내',
  later: '그 이후',
}

export function taskBucketForDeadline(deadline: string, today: string): WidgetTaskBucketId {
  if (!parseYmd(deadline)) return 'later'
  const difference = differenceInYmdDays(today, deadline)
  if (difference < 0) return 'overdue'
  if (difference === 0) return 'today'
  if (difference <= 3) return 'soon'
  return 'later'
}

export function buildTaskBuckets<T extends WidgetTaskLike>(
  tasks: readonly T[],
  today: string,
  includeCompleted = false,
): WidgetTaskBucket<T>[] {
  const buckets: Record<WidgetTaskBucketId, T[]> = { overdue: [], today: [], soon: [], later: [] }
  tasks
    .filter(task => includeCompleted || !task.completed)
    .forEach(task => buckets[taskBucketForDeadline(task.deadline, today)].push(task))

  const order: WidgetTaskBucketId[] = ['overdue', 'today', 'soon', 'later']
  return order.map(id => {
    const items = [...buckets[id]].sort((left, right) =>
      (left.deadline || '9999-99-99').localeCompare(right.deadline || '9999-99-99')
      || left.title.localeCompare(right.title, 'ko'),
    )
    return { id, label: TASK_BUCKET_LABELS[id], count: items.length, items }
  })
}

export interface WidgetAcademicPreviewDay {
  date: string
  kind: string
  label: string
}

export interface WidgetTomorrowPreviewTarget {
  tomorrow: WidgetAcademicPreviewDay
  target: WidgetAcademicPreviewDay
  continued: boolean
}

export function shouldShowTomorrowPreview(
  now: Date,
  startTime = '16:00',
  lastLessonEndTime?: string,
) {
  const current = now.getHours() * 60 + now.getMinutes()
  const configured = minutesFromClock(startTime)
  const lessonEnd = lastLessonEndTime ? minutesFromClock(lastLessonEndTime) : Number.NaN
  return (Number.isFinite(configured) && current >= configured)
    || (Number.isFinite(lessonEnd) && current >= lessonEnd)
}

export function resolveTomorrowPreviewDay(
  today: string,
  days: readonly WidgetAcademicPreviewDay[],
  continueToNextInstructionDay = true,
): WidgetTomorrowPreviewTarget {
  const tomorrowDate = addDaysYmd(today, 1)
  const tomorrow = days.find(day => day.date === tomorrowDate) ?? {
    date: tomorrowDate,
    kind: 'unknown',
    label: '학사일정 확인 필요',
  }
  if (tomorrow.kind === 'instruction' || !continueToNextInstructionDay) {
    return { tomorrow, target: tomorrow, continued: false }
  }
  const target = [...days]
    .filter(day => day.date > tomorrowDate && day.kind === 'instruction')
    .sort((left, right) => left.date.localeCompare(right.date))[0] ?? tomorrow
  return { tomorrow, target, continued: target.date !== tomorrow.date }
}

export interface WidgetHourlyWeatherPoint {
  time: string | Date
  precipitationProbability?: number
  precipitationMm?: number
  windSpeedKph?: number
  temperatureC?: number
  weatherCode?: number
}

export interface WidgetWeatherWindow {
  id: string
  label: string
  start: string
  end: string
}

export interface WidgetWeatherActionOptions {
  now?: Date
  fetchedAt?: string | Date
  windows?: WidgetWeatherWindow[]
  precipitation?: boolean
  heat?: boolean
  cold?: boolean
  wind?: boolean
  precipitationProbabilityThreshold?: number
  windSpeedThreshold?: number
  heatThreshold?: number
  coldThreshold?: number
  staleAfterMinutes?: number
}

export interface WidgetWeatherAction {
  id: 'precipitation' | 'wind' | 'heat' | 'cold' | 'stale'
  severity: 'info' | 'attention'
  label: string
  detail: string
}

function pointClock(point: WidgetHourlyWeatherPoint) {
  if (point.time instanceof Date) return point.time.getHours() * 60 + point.time.getMinutes()
  const clock = point.time.match(/(?:T|^)(\d{2}):(\d{2})/)
  return clock ? Number(clock[1]) * 60 + Number(clock[2]) : Number.NaN
}

function isPrecipitationCode(code: number | undefined) {
  return typeof code === 'number' && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95)
}

function actionWindowLabel(point: WidgetHourlyWeatherPoint, windows: readonly WidgetWeatherWindow[]) {
  const clock = pointClock(point)
  return windows.find(window => {
    const start = minutesFromClock(window.start)
    const end = minutesFromClock(window.end)
    return Number.isFinite(clock) && clock >= start && clock <= end
  })?.label ?? '오늘'
}

/** Converts hourly forecast data into short, action-first school messages. */
export function buildWeatherActions(
  points: readonly WidgetHourlyWeatherPoint[],
  options: WidgetWeatherActionOptions = {},
): WidgetWeatherAction[] {
  const settings = {
    precipitation: options.precipitation !== false,
    heat: options.heat !== false,
    cold: options.cold !== false,
    wind: options.wind !== false,
    rainThreshold: options.precipitationProbabilityThreshold ?? 50,
    windThreshold: options.windSpeedThreshold ?? 9,
    heatThreshold: options.heatThreshold ?? 33,
    coldThreshold: options.coldThreshold ?? -8,
    staleAfter: options.staleAfterMinutes ?? 180,
  }
  const windows = options.windows ?? [
    { id: 'arrival', label: '등교지도 시간', start: '07:30', end: '09:10' },
    { id: 'departure', label: '퇴근 무렵', start: '16:00', end: '19:00' },
  ]
  const actions: WidgetWeatherAction[] = []
  const referenceNow = options.now ?? new Date()
  const currentHourStart = referenceNow.getHours() * 60
  const relevant = points.filter(point => {
    const clock = pointClock(point)
    return Number.isFinite(clock) && clock >= currentHourStart
  })
  const wet = relevant.find(point =>
    (point.precipitationProbability ?? 0) >= settings.rainThreshold
      || (point.precipitationMm ?? 0) > 0
      || isPrecipitationCode(point.weatherCode),
  )
  const windy = relevant.find(point => (point.windSpeedKph ?? 0) >= settings.windThreshold)
  const hot = relevant.find(point => (point.temperatureC ?? -999) >= settings.heatThreshold)
  const cold = relevant.find(point => (point.temperatureC ?? 999) <= settings.coldThreshold)
  const icy = relevant.find(point =>
    (point.temperatureC ?? 999) <= 1
      && ((point.precipitationMm ?? 0) > 0 || isPrecipitationCode(point.weatherCode)),
  )

  if (settings.precipitation && wet) {
    const probability = Math.round(wet.precipitationProbability ?? 0)
    actions.push({
      id: 'precipitation', severity: 'attention',
      label: `${actionWindowLabel(wet, windows)} 우산 필요`,
      detail: probability ? `강수확률 ${probability}%` : '비 또는 눈 예보가 있습니다.',
    })
  }
  if (settings.wind && windy) {
    actions.push({
      id: 'wind', severity: 'attention',
      label: `${actionWindowLabel(windy, windows)} 강풍 확인`,
      detail: `풍속 약 ${Math.round(windy.windSpeedKph ?? 0)}km/h · 야외 안내물과 활동을 확인하세요.`,
    })
  }
  if (settings.heat && hot) {
    actions.push({
      id: 'heat', severity: 'attention', label: '폭염 시 야외활동 확인',
      detail: `예상 최고 ${Math.round(hot.temperatureC ?? 0)}℃ · 활동 시간과 휴식을 확인하세요.`,
    })
  }
  if (settings.cold && (icy || cold)) {
    const point = icy ?? cold!
    actions.push({
      id: 'cold', severity: 'attention',
      label: icy ? '한파·결빙 주의' : '한파 시 야외활동 확인',
      detail: `예상 ${Math.round(point.temperatureC ?? 0)}℃ · 통행로와 지도 시간을 확인하세요.`,
    })
  }

  if (options.fetchedAt) {
    const fetched = options.fetchedAt instanceof Date ? options.fetchedAt : new Date(options.fetchedAt)
    const age = (referenceNow.getTime() - fetched.getTime()) / 60_000
    if (Number.isFinite(age) && age > settings.staleAfter) {
      actions.push({
        id: 'stale', severity: 'info', label: '날씨 갱신 필요',
        detail: `마지막 예보를 ${Math.floor(age / 60)}시간 전에 확인했습니다.`,
      })
    }
  }
  return actions
}

export interface WidgetTextCount {
  characters: number
  charactersWithoutSpaces: number
  utf8Bytes: number
  lines: number
}

export function countText(value: string): WidgetTextCount {
  const characters = Array.from(value).length
  const bytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(value).length
    : encodeURIComponent(value).replace(/%[0-9A-F]{2}|./gi, 'x').length
  return {
    characters,
    charactersWithoutSpaces: Array.from(value.replace(/\s/g, '')).length,
    utf8Bytes: bytes,
    lines: value ? value.split(/\r?\n/).length : 0,
  }
}

export interface WidgetStudentEntry {
  studentId: string
  name: string
  raw: string
  status: 'valid' | 'id-only' | 'name-only' | 'invalid'
}

export interface WidgetStudentListResult {
  entries: WidgetStudentEntry[]
  normalizedText: string
  invalidLines: string[]
  duplicateKeys: string[]
}

/** Normalizes pasted “학번 이름” rows without storing the source text. */
export function normalizeStudentList(value: string): WidgetStudentListResult {
  const entries = value.split(/\r?\n/).map(raw => {
    const studentToken = raw.match(/(?:^|[\s,;/])([0-9][0-9\s-]{2,7})(?=$|[\s,;/])/)?.[1] ?? ''
    const digits = studentToken.replace(/\D/g, '')
    const normalizedStudentId = canonicalStudentId(digits)
    const studentId = /^[1-3]\d{3}$/.test(normalizedStudentId) ? normalizedStudentId : ''
    const name = raw.match(/[가-힣]{2,5}/)?.[0] ?? ''
    const status: WidgetStudentEntry['status'] = studentId && name
      ? 'valid'
      : studentId
        ? 'id-only'
        : name
          ? 'name-only'
          : 'invalid'
    return { studentId, name, raw: raw.trim(), status }
  }).filter(entry => entry.raw)

  const seen = new Set<string>()
  const duplicates = new Set<string>()
  entries.forEach(entry => {
    const key = entry.studentId || entry.name
    if (!key) return
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  })
  return {
    entries,
    normalizedText: entries
      .filter(entry => entry.status !== 'invalid')
      .map(entry => [entry.studentId, entry.name].filter(Boolean).join('\t'))
      .join('\n'),
    invalidLines: entries.filter(entry => entry.status === 'invalid').map(entry => entry.raw),
    duplicateKeys: [...duplicates],
  }
}

/** Counts periods in a compact expression such as “월 5,6,7교시 / 화 1~4교시”. */
export function calculatePeriodTotal(value: string | readonly number[]) {
  if (Array.isArray(value)) return value.filter(number => Number.isInteger(number) && number >= 1 && number <= 8).length
  let source = String(value)
  let total = 0
  source = source.replace(/([1-8])\s*[~-]\s*([1-8])/g, (_, rawStart: string, rawEnd: string) => {
    const start = Number(rawStart)
    const end = Number(rawEnd)
    total += Math.abs(end - start) + 1
    return ' '
  })
  const explicitHours = [...source.matchAll(/(\d+)\s*시간/g)]
  if (explicitHours.length) {
    total += explicitHours.reduce((sum, matched) => sum + Number(matched[1]), 0)
    source = source.replace(/\d+\s*시간/g, ' ')
  }
  total += [...source.matchAll(/(?:^|[^0-9])([1-8])(?=\s*(?:,|교시|$|[월화수목금토일/]))/g)].length
  return total
}
