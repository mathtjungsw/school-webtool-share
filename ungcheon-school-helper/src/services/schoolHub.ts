import type { ParsedTimetable, SchoolTimetable } from './schoolTimetable'
import type {
  SharedStudentTimetable,
  SharedStudentTimetableUpload,
} from './studentTimetable'
import type {
  SharedStaffRoster,
  SharedStudentRoster,
  StaffChecklist,
  StaffMember,
  StudentRosterEntry,
} from './rosterAttendance'

export type NoticeLevel = 'info' | 'important' | 'urgent'

export interface SharedLink {
  id: string
  department: string
  title: string
  url: string
  description?: string
  registeredBy: string
  createdAt: string
}

export interface SchoolNotice {
  id: number
  title: string
  body: string
  level: NoticeLevel
  date: string
  expiresAt?: string
}

export type FeatureRequestType = 'new' | 'improvement'
export type FeatureRequestStatus = 'submitted' | 'reviewing' | 'planned' | 'completed' | 'declined'

export interface FeatureRequest {
  id: string
  requestType: FeatureRequestType
  title: string
  content: string
  author: string
  createdAt: string
  status: FeatureRequestStatus
  adminReply?: string
  updatedAt?: string
}

export interface CommitteeMember {
  name: string
  role: string
  source: 'staff' | 'direct'
}

export interface CommitteeAssignment {
  committeeId: string
  committeeName: string
  members: CommitteeMember[]
  updatedBy: string
  updatedAt: string
}

export interface CommitteeEvent {
  id: string
  committeeId: string
  committeeName: string
  title: string
  date: string
  startTime: string
  endTime: string
  location: string
  agenda: string
  memberNames: string[]
  createdBy: string
  createdAt: string
}

export interface CommitteeState {
  assignments: CommitteeAssignment[]
  events: CommitteeEvent[]
}

interface HubResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export type HubResource =
  | 'links'
  | 'notices'
  | 'featureRequests'
  | 'timetable'
  | 'studentTimetable'
  | 'staffRoster'
  | 'studentRoster'
  | 'staffChecklists'
  | 'committees'
  | 'sharedNeis'

interface SyncManifest {
  generatedAt: string
  resources: Partial<Record<HubResource, string>>
}

interface CacheEntry<T = unknown> {
  resource: HubResource
  data: T
  revision: string
  signature: string
  loadedAt: number
}

type CacheListener = (data: unknown, cacheKey: string) => void

const sessionCache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()
const listeners = new Map<HubResource, Set<CacheListener>>()
const resourceEpoch = new Map<HubResource, number>()
const MANIFEST_TTL_MS = 5_000
let manifest: SyncManifest | null = null
let manifestLoadedAt = 0
let manifestInflight: Promise<SyncManifest | null> | null = null
let manifestSupported: boolean | null = null
let preloadInflight: Promise<void> | null = null
let cacheGeneration = 0

const MUTATION_RESOURCE: Record<string, HubResource | undefined> = {
  addLink: 'links', deleteLink: 'links',
  addNotice: 'notices', deleteNotice: 'notices',
  addFeatureRequest: 'featureRequests', updateFeatureRequest: 'featureRequests', deleteFeatureRequest: 'featureRequests',
  replaceTimetable: 'timetable', replaceStudentTimetable: 'studentTimetable',
  replaceStaffRoster: 'staffRoster', replaceStudentRoster: 'studentRoster',
  addStaffChecklist: 'staffChecklists', updateStaffChecklist: 'staffChecklists', submitStaffChecklist: 'staffChecklists', deleteStaffChecklist: 'staffChecklists',
  saveCommitteeMembers: 'committees', addCommitteeEvent: 'committees', deleteCommitteeEvent: 'committees',
  replaceNeisSnapshot: 'sharedNeis',
}

function dataSignature(data: unknown) {
  try { return JSON.stringify(data) }
  catch { return String(data) }
}

function revisionFromData(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const record = data as Record<string, unknown>
  if (record.version !== undefined) return `v:${String(record.version)}`
  if (record.uploadedAt) return `at:${String(record.uploadedAt)}`
  return ''
}

function notifyResource(resource: HubResource, data: unknown, cacheKey: string) {
  listeners.get(resource)?.forEach(listener => listener(data, cacheKey))
}

export function subscribeHubResource<T>(resource: HubResource, listener: (data: T, cacheKey: string) => void) {
  const wrapped: CacheListener = (data, cacheKey) => listener(data as T, cacheKey)
  const resourceListeners = listeners.get(resource) ?? new Set<CacheListener>()
  resourceListeners.add(wrapped)
  listeners.set(resource, resourceListeners)
  return () => {
    resourceListeners.delete(wrapped)
    if (!resourceListeners.size) listeners.delete(resource)
  }
}

export function clearSchoolHubSessionCache() {
  cacheGeneration += 1
  sessionCache.clear()
  inflight.clear()
  manifest = null
  manifestLoadedAt = 0
  manifestInflight = null
  manifestSupported = null
  preloadInflight = null
  resourceEpoch.clear()
}

export function invalidateHubResource(resource: HubResource) {
  for (const [key, entry] of sessionCache) {
    if (entry.resource === resource) sessionCache.delete(key)
  }
  resourceEpoch.set(resource, (resourceEpoch.get(resource) ?? 0) + 1)
  manifestLoadedAt = 0
}

export function getSchoolHubCacheStatus() {
  const entries = [...sessionCache.values()]
  return {
    count: entries.length,
    newestAt: entries.length ? Math.max(...entries.map(entry => entry.loadedAt)) : null,
    resources: [...new Set(entries.map(entry => entry.resource))],
  }
}

export async function hubRequest<T>(request: Record<string, unknown>): Promise<T> {
  const response = await window.electron.schoolHubRequest(request) as HubResponse<T>
  if (!response?.ok) {
    const message = response?.error || '학교 공유 서비스 요청에 실패했습니다.'
    const action = String(request.action ?? '')
    const needsServerUpdate = [
      'verifyAdmin',
      'listFeatureRequests',
      'addFeatureRequest',
      'updateFeatureRequest',
      'deleteFeatureRequest',
      'getTimetable',
      'replaceTimetable',
      'getStudentTimetable',
      'replaceStudentTimetable',
      'getStaffRoster',
      'replaceStaffRoster',
      'getStudentRoster',
      'replaceStudentRoster',
      'listStaffChecklists',
      'addStaffChecklist',
      'updateStaffChecklist',
      'submitStaffChecklist',
      'deleteStaffChecklist',
      'listCommitteeState',
      'saveCommitteeMembers',
      'addCommitteeEvent',
      'deleteCommitteeEvent',
      'listTimetableChanges',
      'createTimetableChange',
      'respondTimetableChange',
      'cancelTimetableChange',
      'getNeisSyncStatus',
      'registerNeisSyncDevice',
      'revokeNeisSyncDevice',
      'getNeisSnapshot',
      'replaceNeisSnapshot',
    ].includes(action)
    if (needsServerUpdate && message.includes('허용되지 않는 요청')) {
      throw new Error('학교 공유 서버 업데이트가 필요합니다. 관리자에게 문의하세요.')
    }
    throw new Error(message)
  }
  const resource = MUTATION_RESOURCE[String(request.action ?? '')]
  if (resource) invalidateHubResource(resource)
  return response.data as T
}

async function refreshSyncManifest(force = false): Promise<SyncManifest | null> {
  if (manifestSupported === false) return null
  if (!force && manifest && Date.now() - manifestLoadedAt < MANIFEST_TTL_MS) return manifest
  if (manifestInflight) return manifestInflight
  const generation = cacheGeneration
  let nextRequest: Promise<SyncManifest | null>
  nextRequest = hubRequest<SyncManifest>({ action: 'getSyncManifest' })
    .then(next => {
      if (cacheGeneration !== generation) return null
      manifest = next
      manifestLoadedAt = Date.now()
      manifestSupported = true
      return next
    })
    .catch(() => {
      if (cacheGeneration !== generation) return null
      manifestSupported = false
      return null
    })
    .finally(() => {
      if (manifestInflight === nextRequest) manifestInflight = null
    })
  manifestInflight = nextRequest
  return nextRequest
}

async function fetchAndStore<T>(
  cacheKey: string,
  resource: HubResource,
  request: Record<string, unknown>,
  knownRevision = '',
): Promise<T> {
  const existingRequest = inflight.get(cacheKey)
  if (existingRequest) return existingRequest as Promise<T>
  const epoch = resourceEpoch.get(resource) ?? 0
  const generation = cacheGeneration
  let requestPromise: Promise<T>
  requestPromise = hubRequest<T>(request).then(data => {
    if (cacheGeneration !== generation || (resourceEpoch.get(resource) ?? 0) !== epoch) return data
    const revision = knownRevision || revisionFromData(data)
    const signature = revision || dataSignature(data)
    const previous = sessionCache.get(cacheKey)
    const changed = !previous || previous.signature !== signature
    sessionCache.set(cacheKey, { resource, data, revision, signature, loadedAt: Date.now() })
    if (changed) notifyResource(resource, data, cacheKey)
    return data
  }).finally(() => {
    if (inflight.get(cacheKey) === requestPromise) inflight.delete(cacheKey)
  })
  inflight.set(cacheKey, requestPromise)
  return requestPromise
}

async function revalidateCachedResource<T>(
  cacheKey: string,
  resource: HubResource,
  request: Record<string, unknown>,
) {
  if (inflight.has(cacheKey)) return
  const entry = sessionCache.get(cacheKey)
  if (!entry) return
  const nextManifest = await refreshSyncManifest()
  const serverRevision = nextManifest?.resources?.[resource] ?? ''
  if (serverRevision && entry.revision === serverRevision) return
  try { await fetchAndStore<T>(cacheKey, resource, request, serverRevision) }
  catch { /* 캐시가 있으면 네트워크 오류는 화면을 막지 않는다. */ }
}

async function cachedHubRequest<T>(
  cacheKey: string,
  resource: HubResource,
  request: Record<string, unknown>,
  force = false,
): Promise<T> {
  const cached = sessionCache.get(cacheKey)
  if (cached && !force) {
    void revalidateCachedResource<T>(cacheKey, resource, request)
    return cached.data as T
  }
  const nextManifest = await refreshSyncManifest()
  return fetchAndStore<T>(cacheKey, resource, request, nextManifest?.resources?.[resource] ?? '')
}

export const listLinks = (force = false) =>
  cachedHubRequest<SharedLink[]>('links', 'links', { action: 'listLinks' }, force)
export const listNotices = (force = false) =>
  cachedHubRequest<SchoolNotice[]>('notices', 'notices', { action: 'listNotices' }, force)
export const verifyAdmin = (adminPassword: string) =>
  hubRequest<{ verified: boolean }>({ action: 'verifyAdmin', adminPassword })
export const listFeatureRequests = (force = false) =>
  cachedHubRequest<FeatureRequest[]>('featureRequests', 'featureRequests', { action: 'listFeatureRequests' }, force)
export const getSchoolTimetable = (force = false) =>
  cachedHubRequest<SchoolTimetable | null>('timetable', 'timetable', { action: 'getTimetable' }, force)
export const replaceSchoolTimetable = (
  timetable: ParsedTimetable,
  adminPassword: string,
  uploadedBy: string,
) => hubRequest<{ version: number; uploadedAt: string }>({
  action: 'replaceTimetable',
  timetable,
  adminPassword,
  uploadedBy,
})

export const getSharedStudentTimetable = (force = false) =>
  cachedHubRequest<SharedStudentTimetable | null>('studentTimetable', 'studentTimetable', { action: 'getStudentTimetable' }, force)

export const replaceSharedStudentTimetable = (
  timetable: SharedStudentTimetableUpload,
  adminPassword: string,
  uploadedBy: string,
) => hubRequest<{ version: number; uploadedAt: string }>({
  action: 'replaceStudentTimetable',
  timetable,
  adminPassword,
  uploadedBy,
})

export const getSharedStaffRoster = (force = false) =>
  cachedHubRequest<SharedStaffRoster | null>('staffRoster', 'staffRoster', { action: 'getStaffRoster' }, force)

export const replaceSharedStaffRoster = (
  members: StaffMember[],
  adminPassword: string,
  uploadedBy: string,
  sourceFileName = '',
) => hubRequest<{ version: number; uploadedAt: string }>({
  action: 'replaceStaffRoster',
  members,
  adminPassword,
  uploadedBy,
  sourceFileName,
})

export const getSharedStudentRoster = (force = false) =>
  cachedHubRequest<SharedStudentRoster | null>('studentRoster', 'studentRoster', { action: 'getStudentRoster' }, force)
    .then(roster => roster ? {
      ...roster,
      students: roster.students.map(student => ({ ...student, remark: '' })),
    } : null)

export const replaceSharedStudentRoster = (
  students: StudentRosterEntry[],
  adminPassword: string,
  uploadedBy: string,
  sourceFileName = '',
) => hubRequest<{ version: number; uploadedAt: string }>({
  action: 'replaceStudentRoster',
  students: students.map(student => ({ ...student, remark: '' })),
  adminPassword,
  uploadedBy,
  sourceFileName,
})

export const listStaffChecklists = (viewerName: string, adminPassword = '', force = false) =>
  cachedHubRequest<StaffChecklist[]>(`staffChecklists:${viewerName}:${adminPassword ? 'admin' : 'user'}`, 'staffChecklists', {
    action: 'listStaffChecklists',
    viewerName,
    adminPassword,
  }, force)

export const addStaffChecklist = (input: {
  title: string
  description: string
  startDate: string
  deadline: string
  priority: StaffChecklist['priority']
  status: StaffChecklist['status']
  linkUrl: string
  creatorName: string
  items: string[]
  targetNames: string[]
  departmentNames: string[]
}) => hubRequest<{ id: string }>({ action: 'addStaffChecklist', ...input })

export const updateStaffChecklist = (input: {
  checklistId: string
  viewerName: string
  adminPassword?: string
  title: string
  description: string
  startDate: string
  deadline: string
  priority: StaffChecklist['priority']
  status: StaffChecklist['status']
  linkUrl: string
  items: string[]
  targetNames: string[]
  departmentNames: string[]
}) => hubRequest<{ updatedAt: string }>({ action: 'updateStaffChecklist', ...input })

export const submitStaffChecklist = (
  checklistId: string,
  teacherName: string,
  checkedItemIds: string[],
  memo: string,
) => hubRequest<{ updatedAt: string }>({
  action: 'submitStaffChecklist',
  checklistId,
  teacherName,
  checkedItemIds,
  memo,
})

export const deleteStaffChecklist = (
  checklistId: string,
  viewerName: string,
  adminPassword = '',
) => hubRequest<void>({
  action: 'deleteStaffChecklist',
  checklistId,
  viewerName,
  adminPassword,
})

export const listCommitteeState = (force = false) =>
  cachedHubRequest<CommitteeState>('committees', 'committees', { action: 'listCommitteeState' }, force)

export const saveCommitteeMembers = (
  committeeId: string,
  committeeName: string,
  members: CommitteeMember[],
  updatedBy: string,
) => hubRequest<{ updatedAt: string }>({
  action: 'saveCommitteeMembers',
  committeeId,
  committeeName,
  members,
  updatedBy,
})

export const addCommitteeEvent = (
  input: {
    committeeId: string
    committeeName: string
    title: string
    date: string
    startTime: string
    endTime: string
    location: string
    agenda: string
    memberNames: string[]
    createdBy: string
  },
) => hubRequest<CommitteeEvent>({
  action: 'addCommitteeEvent',
  ...input,
})

export const deleteCommitteeEvent = (id: string) => hubRequest<void>({
  action: 'deleteCommitteeEvent',
  id,
})

export function preloadSchoolHubCache(viewerName = '') {
  if (preloadInflight) return preloadInflight
  let nextPreload: Promise<void>
  nextPreload = (async () => {
    await refreshSyncManifest(true)
    const requests: Array<Promise<unknown>> = [
      listLinks(),
      listNotices(),
      listFeatureRequests(),
      getSchoolTimetable(),
      getSharedStudentTimetable(),
      getSharedStaffRoster(),
      getSharedStudentRoster(),
      listCommitteeState(),
    ]
    if (viewerName.trim()) requests.push(listStaffChecklists(viewerName.trim()))
    await Promise.allSettled(requests)
  })().finally(() => {
    if (preloadInflight === nextPreload) preloadInflight = null
  })
  preloadInflight = nextPreload
  return nextPreload
}
