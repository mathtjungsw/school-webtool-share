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
      'submitStaffChecklist',
      'deleteStaffChecklist',
      'listCommitteeState',
      'saveCommitteeMembers',
      'addCommitteeEvent',
      'deleteCommitteeEvent',
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

export const getSharedStudentTimetable = () =>
  hubRequest<SharedStudentTimetable | null>({ action: 'getStudentTimetable' })

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

export const getSharedStaffRoster = () =>
  hubRequest<SharedStaffRoster | null>({ action: 'getStaffRoster' })

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

export const getSharedStudentRoster = () =>
  hubRequest<SharedStudentRoster | null>({ action: 'getStudentRoster' })

export const replaceSharedStudentRoster = (
  students: StudentRosterEntry[],
  adminPassword: string,
  uploadedBy: string,
  sourceFileName = '',
) => hubRequest<{ version: number; uploadedAt: string }>({
  action: 'replaceStudentRoster',
  students,
  adminPassword,
  uploadedBy,
  sourceFileName,
})

export const listStaffChecklists = (viewerName: string, adminPassword = '') =>
  hubRequest<StaffChecklist[]>({
    action: 'listStaffChecklists',
    viewerName,
    adminPassword,
  })

export const addStaffChecklist = (input: {
  title: string
  description: string
  deadline: string
  creatorName: string
  items: string[]
  targetNames: string[]
}) => hubRequest<{ id: string }>({ action: 'addStaffChecklist', ...input })

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

export const listCommitteeState = () =>
  hubRequest<CommitteeState>({ action: 'listCommitteeState' })

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
