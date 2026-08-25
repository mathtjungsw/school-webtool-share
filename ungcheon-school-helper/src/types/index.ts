export interface SchoolInfo {
  schoolName: string
  officeName: string
  officeCode: string
  schoolCode: string
  schoolType: string
  address: string
  phone: string
  fax?: string
  website?: string
  region?: string
  zipcode?: string
  coedu?: string
  founded?: string
  foundType?: string
}

export interface ClassEntry {
  grade: string
  classNm: string
  dept: string
}

export interface DeptEntry {
  name: string
  series: string
}

export interface MealInfo {
  date: string
  mealType: string
  dishNames: string[]
  calories: string
  ntrInfo: string
}

export interface ScheduleEvent {
  date: string
  eventName: string
  eventLevel: string
}

export interface WeeklyPlanEvent {
  date: string
  department: string
  eventName: string
  sheetName: string
}

export interface WeeklyPlanNote {
  department: string
  content: string
  sheetName: string
  weekStart: string
  weekEnd: string
}

export interface WeeklyPlanResult {
  events: WeeklyPlanEvent[]
  notes: WeeklyPlanNote[]
  sourceSheets: string[]
  fetchedAt: string
}

export interface TimetableEntry {
  date?: string      // YYYYMMDD
  grade?: string
  classNm?: string
  period: number
  subject: string
  teacher: string
  classroom: string
}

export interface AppConfig {
  schoolName?: string
  officeName?: string
  officeCode?: string
  schoolCode?: string
  schoolType?: string
  neisApiKey?: string
  teacherName?: string
  schoolHubUrl?: string
  userRole?: 'teacher' | 'admin'
  grade?: string
  classNm?: string
  portalOffice?: string
  portalId?: string
  aiProvider?: 'claude' | 'openai' | 'gemini'
  claudeApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
  googleCalendarUrl?: string
  period1Start?: string
  period2Start?: string
  period3Start?: string
  period4Start?: string
  period5Start?: string
  period6Start?: string
  period7Start?: string
  lunchStart?: string
  lunchEnd?: string
  teacherClasses?: Array<{ grade: string; classNm: string; subject: string }>
  webFavorites?: Array<{ label: string; url: string }>
  favTcreatorSeeded?: boolean   // 교사크리에이터협회 즐겨찾기 1회 마이그레이션 플래그
  // 공문알리미 포털 설정
  portalOfficeKey?: string
  portalCertName?: string
  portalBrowser?: 'chrome' | 'edge'
  portalNeisOrder?: number
  portalUseSound?: boolean
  portalUseKakao?: boolean
  portalAutoMonitor?: boolean
  schoolAddress?: string
  secondLocationName?: string
  theme?: 'light'
  showNeisSchedule?: boolean
}

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

export type CreativeScheduleKind = 'activity' | 'schoolEvent'
export interface CreativeScheduleEvent {
  date: string
  title: string
  kind: CreativeScheduleKind
  period: string
  grades: string
  guidance: string
  department: string
  sourceSheet: string
  sourceUrl: string
}
export interface CreativeScheduleResult {
  events: CreativeScheduleEvent[]
  fetchedAt: string
  sourceSheets: string[]
  sourceUrl: string
}

export interface LogEntry {
  id: string
  time: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

export interface NavItem {
  id: string
  label: string
  icon: string
  category?: string
  badge?: string
}
