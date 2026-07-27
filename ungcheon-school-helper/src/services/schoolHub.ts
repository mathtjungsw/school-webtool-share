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

interface HubResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export async function hubRequest<T>(request: Record<string, unknown>): Promise<T> {
  const response = await window.electron.schoolHubRequest(request) as HubResponse<T>
  if (!response?.ok) throw new Error(response?.error || '학교 공유 서비스 요청에 실패했습니다.')
  return response.data as T
}

export const listLinks = () => hubRequest<SharedLink[]>({ action: 'listLinks' })
export const listNotices = () => hubRequest<SchoolNotice[]>({ action: 'listNotices' })
