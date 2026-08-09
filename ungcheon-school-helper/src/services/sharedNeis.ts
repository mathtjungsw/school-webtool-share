import { addDays, format } from 'date-fns'
import type { AppConfig, MealInfo, ScheduleEvent, TimetableEntry } from '../types'
import { getClassInfo, getMealRange, getScheduleRange, getSchoolDetail, getTimetableRange } from './neis'
import { hubRequest } from './schoolHub'

export interface SharedNeisSnapshot {
  version: number
  fromDate: string
  toDate: string
  fetchedAt: string
  uploadedAt: string
  schoolName: string
  meals: MealInfo[]
  schedules: ScheduleEvent[]
  timetables: TimetableEntry[]
}

export interface NeisSyncStatus {
  registered: boolean
  isThisDevice: boolean
  registeredAt: string
  registeredBy: string
  lastSyncedAt: string
  fromDate: string
  toDate: string
  version: number
  lastStatus: 'ready' | 'success' | 'error'
  lastError: string
}

const DEVICE_ID_KEY = 'neisSync.deviceId'
const LAST_SUCCESS_DAY_KEY = 'neisSync.lastSuccessDay'
const LAST_ATTEMPT_AT_KEY = 'neisSync.lastAttemptAt'
const LOCAL_SNAPSHOT_KEY = 'neisSync.localSnapshot'
const SYNC_TOKEN_NAME = 'neisSyncToken'

let schedulerTimer: number | null = null
let syncInFlight: Promise<SharedNeisSnapshot> | null = null
let sharedSnapshotCache: SharedNeisSnapshot | null | undefined
let sharedSnapshotRequest: Promise<SharedNeisSnapshot | null> | null = null
let sharedSnapshotLoadedAt = 0

function localYmd(date: Date) {
  return format(date, 'yyyyMMdd')
}

export async function getNeisSyncDeviceId() {
  const existing = String(await window.electron.configGet(DEVICE_ID_KEY) ?? '').trim()
  if (existing) return existing
  const created = crypto.randomUUID()
  await window.electron.configSet(DEVICE_ID_KEY, created)
  return created
}

async function getSyncToken() {
  return (await window.electron.apiKeyGet(SYNC_TOKEN_NAME)).trim()
}

export async function getNeisSyncStatus(): Promise<NeisSyncStatus> {
  const deviceId = await getNeisSyncDeviceId()
  return hubRequest<NeisSyncStatus>({ action: 'getNeisSyncStatus', deviceId })
}

export async function registerThisNeisSyncDevice(adminPassword: string, registeredBy: string) {
  const deviceId = await getNeisSyncDeviceId()
  const result = await hubRequest<{ token: string; status: NeisSyncStatus }>({
    action: 'registerNeisSyncDevice',
    adminPassword,
    deviceId,
    registeredBy,
  })
  await window.electron.apiKeySet(SYNC_TOKEN_NAME, result.token)
  return result.status
}

export async function revokeNeisSyncDevice(adminPassword: string) {
  const deviceId = await getNeisSyncDeviceId()
  await hubRequest<void>({ action: 'revokeNeisSyncDevice', adminPassword, deviceId })
  await window.electron.apiKeyDelete(SYNC_TOKEN_NAME)
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const result = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      result[index] = await mapper(items[index])
    }
  })
  await Promise.all(workers)
  return result
}

export async function runNeisSync(config: AppConfig): Promise<SharedNeisSnapshot> {
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    const apiKey = config.neisApiKey?.trim() ?? ''
    const officeCode = config.officeCode?.trim() ?? ''
    const schoolCode = config.schoolCode?.trim() ?? ''
    const schoolType = config.schoolType?.trim() || '고등학교'
    if (!apiKey) throw new Error('이 동기화 PC에 NEIS API 키를 먼저 입력하세요.')
    if (!officeCode || !schoolCode) throw new Error('학교 코드가 설정되지 않았습니다.')

    const deviceId = await getNeisSyncDeviceId()
    const syncToken = await getSyncToken()
    if (!syncToken) throw new Error('이 PC가 NEIS 동기화 PC로 등록되지 않았습니다.')

    const from = new Date()
    const to = addDays(from, 9)
    const fromDate = localYmd(from)
    const toDate = localYmd(to)
    await window.electron.configSet(LAST_ATTEMPT_AT_KEY, new Date().toISOString())

    const [school, classes, meals, schedules] = await Promise.all([
      getSchoolDetail(apiKey, officeCode, schoolCode),
      getClassInfo(apiKey, officeCode, schoolCode),
      getMealRange(apiKey, officeCode, schoolCode, fromDate, toDate),
      getScheduleRange(apiKey, officeCode, schoolCode, fromDate, toDate),
    ])
    if (!school || school.schoolCode !== schoolCode) throw new Error('API 키로 웅천고등학교 정보를 확인하지 못했습니다.')

    const uniqueClasses = classes.filter((item, index, all) =>
      item.grade && item.classNm && all.findIndex(other => other.grade === item.grade && other.classNm === item.classNm) === index,
    )
    if (!uniqueClasses.length) throw new Error('NEIS에서 학급 정보를 가져오지 못했습니다.')
    const classTimetables = await mapWithConcurrency(uniqueClasses, 4, item =>
      getTimetableRange(apiKey, officeCode, schoolCode, schoolType, item.grade, item.classNm, fromDate, toDate),
    )

    const snapshot: SharedNeisSnapshot = {
      version: 0,
      fromDate,
      toDate,
      fetchedAt: new Date().toISOString(),
      uploadedAt: '',
      schoolName: school.schoolName,
      meals,
      schedules,
      timetables: classTimetables.flat(),
    }
    await window.electron.configSet(LOCAL_SNAPSHOT_KEY, snapshot)
    const uploaded = await hubRequest<SharedNeisSnapshot>({
      action: 'replaceNeisSnapshot',
      deviceId,
      syncToken,
      snapshot,
    })
    await window.electron.configSet(LAST_SUCCESS_DAY_KEY, localYmd(new Date()))
    await window.electron.configSet(LOCAL_SNAPSHOT_KEY, uploaded)
    sharedSnapshotCache = uploaded
    sharedSnapshotLoadedAt = Date.now()
    return uploaded
  })().finally(() => { syncInFlight = null })
  return syncInFlight
}

export function getSharedNeisSnapshot(force = false) {
  if (!force && sharedSnapshotCache !== undefined && Date.now() - sharedSnapshotLoadedAt < 5 * 60_000) return Promise.resolve(sharedSnapshotCache)
  if (!force && sharedSnapshotRequest) return sharedSnapshotRequest
  sharedSnapshotRequest = hubRequest<SharedNeisSnapshot | null>({ action: 'getNeisSnapshot' })
    .then(value => {
      sharedSnapshotCache = value
      sharedSnapshotLoadedAt = Date.now()
      return value
    })
    .finally(() => { sharedSnapshotRequest = null })
  return sharedSnapshotRequest
}

export function startNeisSyncScheduler(getConfig: () => AppConfig) {
  if (schedulerTimer !== null) window.clearInterval(schedulerTimer)
  const check = async () => {
    const now = new Date()
    if (now.getHours() < 13) return
    const config = getConfig()
    if (!config.neisApiKey?.trim() || !config.schoolHubUrl?.trim()) return
    const today = localYmd(now)
    const lastSuccess = String(await window.electron.configGet(LAST_SUCCESS_DAY_KEY) ?? '')
    if (lastSuccess === today) return
    const lastAttemptValue = String(await window.electron.configGet(LAST_ATTEMPT_AT_KEY) ?? '')
    const lastAttempt = Date.parse(lastAttemptValue)
    if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < 10 * 60_000) return
    try {
      const status = await getNeisSyncStatus()
      if (status.isThisDevice) await runNeisSync(config)
    } catch {
      // 자동 재시도는 10분 간격으로 수행하며 기존 공용 자료는 유지합니다.
    }
  }
  void check()
  schedulerTimer = window.setInterval(() => void check(), 60_000)
  return () => {
    if (schedulerTimer !== null) window.clearInterval(schedulerTimer)
    schedulerTimer = null
  }
}
