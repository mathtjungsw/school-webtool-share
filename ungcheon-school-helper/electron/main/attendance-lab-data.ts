export type LabRole = 'homeroom' | 'subject'
export type AttendanceStatus = '출석' | '지각' | '조퇴' | '결석' | '미확인'
export type LabField = LabRole | 'note'
export type LabStudent = { id: string; name: string; classId: string; number: number }
export type LabLesson = {
  id: string
  subject: string
  teacher: string
  teacherId: string
  kind: '학급수업' | '이동수업'
  room: string
  change?: '교환' | '대강' | '당김' | '시간표 변경'
  from?: string
}
export type LabRow = LabStudent & {
  lesson?: LabLesson
  exception?: '자습' | '장소 이동' | '명단 확인 필요' | '수업 없음'
}
export type LabOptions = { classes: { id: string; label: string }[]; lessons: LabLesson[] }
export type LabRecord = { homeroom?: AttendanceStatus; subject?: AttendanceStatus; note?: string }
export type LabBoard = { rows: LabRow[]; records: Record<string, LabRecord> }
export type LabChange = { student: string; field: LabField; value: string }
export type LabAccess = { roles: LabRole[]; readOnly: boolean; requiresExecutive?: boolean }
export type LabStaff = { id: string; name: string; homeroom?: string; leadership?: 'principal' | 'vice-principal' }

export const LAB_DATES = ['2026-11-24', '2026-11-25', '2026-11-26']
export const LAB_CLASSES = ['3-1', '3-2'].map(id => ({ id, label: `3학년 ${id.at(-1)}반` }))
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['미확인', '출석', '지각', '조퇴', '결석']

export const LAB_STAFF: LabStaff[] = [
  { id: 'demo-math', name: '테스트교사', homeroom: '3-1' },
  { id: 'demo-social', name: '시험사회교사', homeroom: '3-2' },
  { id: 'demo-physics', name: '시험물리교사' },
  { id: 'demo-english', name: '시험영어교사' },
  { id: 'demo-substitute', name: '시험대강교사' },
  { id: 'demo-principal', name: '시험교장', leadership: 'principal' },
  { id: 'demo-vice-principal', name: '시험교감', leadership: 'vice-principal' },
  { id: 'demo-unassigned', name: '시험미배정' },
]

const staffById = new Map(LAB_STAFF.map(staff => [staff.id, staff]))

const names = [
  ['윤가람', '한도담', '서하늘', '배나린', '송이든', '노다온', '류바다', '고아라'],
  ['오이랑', '진라온', '구하람', '주은들', '신마루', '백새봄', '문나래', '임가온'],
]
const students: LabStudent[] = LAB_CLASSES.flatMap(({ id }, i) => names[i].map((name, n) => ({ id: `${id}-${n + 1}`, name, classId: id, number: n + 1 })))

function assignedTo(teacherId: string) {
  const teacher = staffById.get(teacherId)
  if (!teacher) throw new Error('Unknown fixture teacher')
  return { teacher: teacher.name, teacherId }
}

const classLessons: LabLesson[] = [
  { id: 'math-class', subject: '미적분', ...assignedTo('demo-math'), kind: '학급수업', room: '3학년 1반' },
  { id: 'english-class', subject: '영어 독해', ...assignedTo('demo-english'), kind: '학급수업', room: '3학년 2반' },
]
const electiveLessons: LabLesson[] = [
  { id: 'physics', subject: '물리학Ⅱ', ...assignedTo('demo-physics'), kind: '이동수업', room: '과학실' },
  { id: 'social', subject: '사회·문화', ...assignedTo('demo-social'), kind: '이동수업', room: '사회실' },
]

function lessonsFor(date: string, period: number): LabLesson[] {
  if (period === 1) return classLessons
  if (period === 2) return electiveLessons
  if (period === 3) return [
    { ...electiveLessons[0], change: '교환', from: '원래 4교시 물리학Ⅱ 강좌' },
    { ...electiveLessons[1], ...assignedTo('demo-substitute'), change: '대강', from: `원래 담당 ${electiveLessons[1].teacher}` },
  ]
  if (period === 4) return [{ ...electiveLessons[1], change: '당김', from: `${date === '2026-11-26' ? '11월 27일' : '11월 26일'} 2교시 사회·문화 강좌` }]
  return []
}

const subjectTeachers = new Set(LAB_DATES.flatMap(date => [1, 2, 3, 4, 5, 6, 7]
  .flatMap(period => lessonsFor(date, period).map(lesson => lesson.teacherId))))

export function labAccess(staff: LabStaff): LabAccess {
  if (staff.leadership) return { roles: ['homeroom', 'subject'], readOnly: true }
  const roles: LabRole[] = []
  if (staff.homeroom) roles.push('homeroom')
  if (subjectTeachers.has(staff.id)) roles.push('subject')
  return { roles, readOnly: false }
}

export function permittedLabOptions(staff: LabStaff, options: LabOptions): LabOptions {
  if (staff.leadership) return options
  return {
    classes: options.classes.filter(item => item.id === staff.homeroom),
    lessons: options.lessons.filter(lesson => lesson.teacherId === staff.id),
  }
}

function buildRows(period: number, lessons: LabLesson[]): LabRow[] {
  return students.map(student => {
    if (period >= 5) return { ...student, exception: '수업 없음' }
    if (period === 1) return { ...student, lesson: lessons[student.classId === '3-1' ? 0 : 1] }
    if (student.id === '3-1-7') return { ...student, exception: '자습' }
    if (student.id === '3-2-7') return { ...student, exception: '장소 이동' }
    if (student.id === '3-1-8') return { ...student, exception: '명단 확인 필요' }
    const elective = [1, 2, 4, 6].includes(student.number) ? 'physics' : 'social'
    const lesson = lessons.find(item => item.id === elective)
    return lesson ? { ...student, lesson } : { ...student, exception: '자습' }
  })
}

export function labOptionsPath(date: string, period: number) {
  return `labDays/${date}/periods/${period}`
}

export function labBoardPath(date: string, period: number, role: LabRole, group: string) {
  return `${labOptionsPath(date, period)}/boards/${role}-${group}`
}

export function labRecordPath(date: string, period: number, row: LabRow, field: LabField) {
  if (field === 'note') return `labDays/${date}/notes/${row.id}`
  const id = field === 'subject' ? `subject-${row.lesson?.id}-${row.id}` : `homeroom-${row.id}`
  return `${labOptionsPath(date, period)}/checks/${id}`
}

export function makeLabFixtures() {
  const documents = new Map<string, LabOptions | LabRow[] | string>()
  for (const date of LAB_DATES) {
    for (let period = 1; period <= 7; period++) {
      const lessons = lessonsFor(date, period)
      const rows = buildRows(period, lessons)
      documents.set(labOptionsPath(date, period), { classes: LAB_CLASSES, lessons })
      for (const { id } of LAB_CLASSES) documents.set(labBoardPath(date, period, 'homeroom', id), rows.filter(row => row.classId === id))
      for (const { id } of lessons) documents.set(labBoardPath(date, period, 'subject', id), rows.filter(row => row.lesson?.id === id))
    }
  }
  const sampleDay = LAB_DATES[1]
  const secondPeriod = buildRows(2, lessonsFor(sampleDay, 2))
  const sampleRecords: [string, LabField, string][] = [
    ['3-1-1', 'homeroom', '출석'], ['3-1-1', 'subject', '출석'],
    ['3-1-2', 'homeroom', '지각'], ['3-1-2', 'subject', '출석'], ['3-1-2', 'note', '2교시 시작 후 교실 도착'],
    ['3-1-3', 'homeroom', '출석'], ['3-1-3', 'subject', '출석'], ['3-1-3', 'note', '3교시 후 조퇴 예정'],
    ['3-1-4', 'homeroom', '출석'], ['3-1-4', 'note', ''],
    ['3-2-1', 'subject', '출석'], ['3-2-2', 'homeroom', '출석'], ['3-2-2', 'subject', '출석'],
  ]
  for (const [id, field, value] of sampleRecords) {
    const row = secondPeriod.find(item => item.id === id)!
    documents.set(labRecordPath(sampleDay, 2, row, field), value)
  }
  return documents
}
