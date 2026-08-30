export type ScheduleSource = 'weekly' | 'creative' | 'schoolEvent' | 'committee' | 'gateDuty' | 'mealDuty' | 'timetableChange' | 'pulledLesson'

export interface MobileEvent {
  id: string
  date: string
  title: string
  source: ScheduleSource
  label: string
  time?: string
}

export interface StaffMember { name: string }
export interface SharedStaffRoster { version: number; members: StaffMember[] }
export interface TimetableSlot { value: string; locked: boolean }
export interface TeacherTimetable { name: string; label: string; load: string; slots: TimetableSlot[] }
export interface SchoolTimetable { version: number; title: string; uploadedAt: string; teachers: TeacherTimetable[] }
export interface CommitteeEvent { id: string; committeeName: string; title: string; date: string; startTime: string; endTime: string; location: string; memberNames: string[] }
export interface CommitteeState { events: CommitteeEvent[] }
export interface MealInfo { date: string; mealType: string; dishNames: string[]; calories: string }
export type MobileResourceKey = 'weekly' | 'creative' | 'gateDuty' | 'mealDuty' | 'timetable' | 'committee' | 'changes' | 'meals'
export type MobileResourceState = 'fresh' | 'empty' | 'cached' | 'unavailable'
export interface MobileResourceStatus {
  state: MobileResourceState
  mode?: 'live' | 'response-cache' | 'device-cache'
  lastAttemptAt: string
  lastSuccessAt?: string
  dataUpdatedAt?: string
  itemCount: number
  errorCode?: 'READ_FAILED'
}
export type MobileResourceStatusMap = Partial<Record<MobileResourceKey, MobileResourceStatus>>
export interface TimetableChange {
  id: string
  kind: 'exchange' | 'substitution' | 'change'
  status: 'pending' | 'approved' | 'held' | 'rejected' | 'cancelled'
  requesterName: string
  targetTeacherName: string
  requesterAppliedAt: string
  originalSlotIndex: number
  replacementSlotIndex: number
  originalDate: string
  replacementDate: string
  originalTeacher: string
  replacementTeacher: string
  originalClass: string
  replacementClass: string
  originalSubject: string
  replacementSubject: string
  updatedAt?: string
}
export interface MobileScheduleBundle {
  events: Array<{ date: string; title: string; source: 'weekly' | 'creative' | 'schoolEvent' | 'gateDuty' | 'mealDuty'; label: string; time?: string }>
  teacherTimetable: TeacherTimetable | null
  committeeEvents: CommitteeEvent[]
  timetableChanges: TimetableChange[]
  meals?: MealInfo[]
  todayMeals: MealInfo[]
  contractVersion?: number
  sourceStatus?: MobileResourceStatusMap
  fetchedAt: string
  servedAt?: string
}
export interface DashboardPayload {
  timetable: SchoolTimetable | null
  committees: CommitteeState
  changes: TimetableChange[]
  bundle: MobileScheduleBundle | null
  cachedAt: string
}
export interface LessonView { period: number; value: string; changed?: boolean; note?: string }
