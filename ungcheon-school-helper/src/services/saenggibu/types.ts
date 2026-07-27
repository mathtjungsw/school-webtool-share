// 생기부(학교생활기록부II) 구조화 데이터 타입

export interface PdfTextItem { x: number; y: number; w: number; str: string }
export interface PdfPage { page: number; w: number; h: number; items: PdfTextItem[] }

export interface ClassInfo { grade: number; classNo: string | null; number: string | null; teacher: string }
export interface Enrollment { date: string; school: string; type: string }
export interface Personal {
  name: string | null
  gender: string | null
  birth: string | null
  address: string | null
  enrollment: Enrollment[]
  classes: ClassInfo[]
}

export interface AttendanceRow {
  grade: number
  schoolDays: number
  note: string | null
  absenceFigures: number
  perfectAttendance: boolean
}

export interface Award { date: string; title: string; org: string | null; target: string | null; grade: number | null }

export interface CreativeArea { area: string; hours: number }
export interface VolunteerEntry { date: string; hours: number; cumulative: number }
export interface Creative {
  areas: CreativeArea[]
  aspiration: string | null
  specialText: string
  volunteer: VolunteerEntry[]
  volunteerTotal: number
  volunteerCount: number
}

export interface GradeSubject {
  year: number | null
  semester: number | null
  dept: string | null
  subject: string | null
  credit: number | null
  rawScore: number
  subjectAvg: number
  achievement: string | null
  rank: number | null
  enrolled: number | null
  distribution: string | null
}
export interface ArtsPeSubject {
  year: number | null
  semester: number | null
  dept: string | null
  subject: string | null
  credit: number | null
  achievement: string | null
}
export interface Sebak { subject: string; text: string }
export interface Grades {
  subjects: GradeSubject[]
  artsPe: ArtsPeSubject[]
  sebak: Sebak[]
  noData: Record<number, boolean>
}

export interface Reading { books: string[]; hasReading: boolean }

export interface Metrics {
  admissionYear: number | null
  cohort: string | null
  gradeSystem: string
  gradedSubjectCount: number
  avgRank: number | null
  avgRawScore: number | null
  semesterRawAvg: Record<string, number>
  achievementCounts: Record<string, number>
  totalCredits: number
  perfectAttendance: boolean
  volunteerHours: number
  volunteerCount: number
  creativeHours: Record<string, number>
  careerAspiration: string | null
  sebakSubjectCount: number
  sebakTotalChars: number
  hasReading: boolean
}

export interface SaenggibuRecord {
  personal: Personal
  attendance: AttendanceRow[]
  awards: Award[]
  creative: Creative
  grades: Grades
  reading: Reading
  behavior: Record<number, string>
  metrics: Metrics
}
