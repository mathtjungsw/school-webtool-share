// NEIS 개인인사기록(인사카드) 파싱/분석 타입

export interface TextItem { s: string; x: number; y: number; w: number; h: number }
export interface HLine { y: number; x0: number; x1: number }
export interface VLine { x: number; y0: number; y1: number }
export interface PageGrid { w: number; h: number; items: TextItem[]; hLines: HLine[]; vLines: VLine[] }

export interface SectionRef { no: number; title: string; page: number }

export interface Profile {
  name: string; hanja: string; eng: string
  rrn: string; rrnMasked: string; age: string
  office: string; teacherType: string; position: string; rank: string
  hobong: string; status: string; subject: string; duty: string
}
export interface Personal { zipcode: string; address: string; nationality: string; birth: string; base: string }
export interface Military { category: string; kind: string; branch: string; grade: string; period: string; discharge: string }
export interface Family { relation: string; name: string; birth: string }
export interface Education { admit: string; graduate: string; level: string; dept: string; major: string }
export interface License { date: string; kind: string; type: string; subject: string; issuer: string; law: string }
export interface Training {
  num: string; course: string; org: string; type: string
  start: string; end: string; recognizedHours: string
  resultScore: string; jobRelated: string; credit: string
  cumHours: string; regDate: string; recorder: string
  year: number | null
}
export interface Reward { date: string; honor: string; name: string; merit: string; org: string }
export interface BonusPoint { area: string; period: string; org: string; note: string }
export interface Promotion { hobong: string; date: string; recorder: string }
export interface Career { period: string; type: string; rank: string; dept: string; office: string; startYear: number | null }
export interface Qualification {
  name: string; certNo: string; certType: string; date: string; issuer: string
  jobRelated: string; credit: string; cumCredit: string; regDate: string
}

export interface InsaRecord {
  baseDate: string
  printer: string
  profile: Profile
  personal: Personal
  military: Military | null
  family: Family[]
  education: Education[]
  licenses: License[]
  trainings: Training[]
  rewards: Reward[]
  bonusPoints: BonusPoint[]
  promotions: Promotion[]
  careers: Career[]
  qualifications: Qualification[]
  sections: SectionRef[]
  warnings: string[]
}

export type MandatoryStatus = 'ok' | 'warn' | 'missing'
export interface MandatoryCheck {
  key: string; label: string
  lastDate: string; lastCourse: string; count: number
  status: MandatoryStatus; note: string
}
export interface YearStat { year: number; hours: number; count: number }
export interface BonusArea { area: string; count: number; years: number }

export interface InsaAnalysis {
  summary: {
    name: string; office: string; position: string; subject: string
    hobong: string; status: string; duty: string
    careerYears: string; currentSchoolSince: string
  }
  training: {
    total: number
    byType: Record<string, number>
    totalRecognizedHours: number
    totalCredit: number
    byYear: YearStat[]
  }
  mandatory: MandatoryCheck[]
  hobong: { current: string; history: Promotion[]; nextExpected: string }
  bonus: { areas: BonusArea[] }
  rewards: { count: number; recent: string }
  qualifications: { count: number; list: string[] }
  warnings: string[]
}
