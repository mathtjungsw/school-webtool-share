import type { ParsedTimetable, SchoolTimetable } from './schoolTimetable'

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

export interface SchoolNeisStatus {
  configured: boolean
  schoolName: string
}

interface HubResponse<T> {
  ok: boolean
  data?: T
  error?: string
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
      'getNeisStatus',
      'setNeisApiKey',
      'neisQuery',
    ].includes(action)
    if (needsServerUpdate && message.includes('허용되지 않는 요청')) {
      throw new Error('학교 공유 서버 업데이트가 필요합니다. 관리자에게 문의하세요.')
    }
    throw new Error(message)
  }
  return response.data as T
}

export const listLinks = () => hubRequest<SharedLink[]>({ action: 'listLinks' })
export const listNotices = () => hubRequest<SchoolNotice[]>({ action: 'listNotices' })
export const verifyAdmin = (adminPassword: string) =>
  hubRequest<{ verified: boolean }>({ action: 'verifyAdmin', adminPassword })
export const listFeatureRequests = () =>
  hubRequest<FeatureRequest[]>({ action: 'listFeatureRequests' })
export const getSchoolTimetable = () =>
  hubRequest<SchoolTimetable | null>({ action: 'getTimetable' })
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

export const getSchoolNeisStatus = () =>
  hubRequest<SchoolNeisStatus>({ action: 'getNeisStatus' })

export const setSchoolNeisApiKey = (apiKey: string, adminPassword: string) =>
  hubRequest<SchoolNeisStatus>({
    action: 'setNeisApiKey',
    apiKey,
    adminPassword,
  })
