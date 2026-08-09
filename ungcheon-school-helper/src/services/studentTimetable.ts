import * as XLSX from 'xlsx'
import type { StudentRosterEntry } from './rosterAttendance'

export const STUDENT_TIMETABLE_DAYS = ['월', '화', '수', '목', '금'] as const
export type StudentTimetableDay = (typeof STUDENT_TIMETABLE_DAYS)[number]

export interface BaseTimetableSlot {
  day: StudentTimetableDay
  period: number
  subject: string
  teacher: string
  raw: string
}

export interface CourseOffering {
  grade: string
  group: string
  times: string[]
  courseName: string
  teacher: string
  classroom: string
  sourceFile: string
}

export interface StudentEnrollment {
  studentId: string
  name: string
  courseName: string
  group: string
  grade: string
  sourceFile: string
}

export interface StudentTimetableDataset {
  classes: Record<string, Record<string, BaseTimetableSlot>>
  classFile: string
  courses: CourseOffering[]
  courseFiles: string[]
  enrollments: StudentEnrollment[]
  enrollmentFiles: string[]
  subjectNames: Record<string, Record<string, string>>
  subjectFile: string
  warnings: string[]
}

export interface StudentTimetableImport {
  kind: 'master' | 'courses' | 'enrollments' | 'subjectNames'
  fileName: string
  grades: string[]
  classes?: StudentTimetableDataset['classes']
  courses?: CourseOffering[]
  enrollments?: StudentEnrollment[]
  subjectNames?: StudentTimetableDataset['subjectNames']
  warnings: string[]
}

export interface StudentSummary {
  studentId: string
  name: string
  grade: string
  className: string
  classLabel: string
  number: string
  enrollmentCount: number
}

export interface PersonalTimetableSlot extends BaseTimetableSlot {
  classroom: string
  selectedCourse: boolean
  group?: string
}

export interface PersonalTimetable {
  student: StudentSummary
  slots: Record<string, PersonalTimetableSlot>
  selections: Array<CourseOffering & { group: string }>
  warnings: string[]
}

export interface SharedStudentTimetableUpload {
  title: string
  semester: string
  studentCount: number
  classCount: number
  courseCount: number
  students: PersonalTimetable[]
}

export interface SharedStudentTimetable extends SharedStudentTimetableUpload {
  version: number
  uploadedBy: string
  uploadedAt: string
}

type Cell = string | number | boolean | Date | null | undefined
type Matrix = Cell[][]

const clean = (value: Cell): string =>
  String(value ?? '')
    .replace(/_x000D_/gi, '')
    .replace(/\r\n?/g, '\n')
    .trim()

const compact = (value: Cell): string => clean(value).replace(/\s+/g, '')

const slotKey = (day: StudentTimetableDay, period: number) => `${day}${period}`

const normalizeClassLabel = (value: Cell): string => {
  const text = compact(value)
  const dashed = text.match(/^([123])-(\d{1,2})(?:반)?$/)
  if (dashed) return `${dashed[1]}-${Number(dashed[2])}`
  const plain = text.match(/^([123])(\d{2})(?:반)?$/)
  if (plain) return `${plain[1]}-${Number(plain[2])}`
  return ''
}

const findHeaderRow = (rows: Matrix, required: string[]): number =>
  rows.findIndex(row => {
    const values = row.map(compact)
    return required.every(header => values.includes(header))
  })

const sheetRows = (bytes: number[]): Matrix => {
  const workbook = XLSX.read(Uint8Array.from(bytes), {
    type: 'array',
    cellDates: true,
    cellFormula: false,
  })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) throw new Error('첫 번째 시트를 읽을 수 없습니다.')
  return XLSX.utils.sheet_to_json<Cell[]>(firstSheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  }) as Matrix
}

const rowObject = (headers: string[], row: Cell[]): Record<string, string> =>
  Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))

function parseBaseCell(
  rawValue: Cell,
  grade: string,
  subjectNames: Record<string, Record<string, string>>,
): Omit<BaseTimetableSlot, 'day' | 'period'> {
  const raw = clean(rawValue)
  if (!raw) return { subject: '', teacher: '', raw: '' }
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length === 2 && lines[0] === '창' && lines[1] === '체') {
    return { subject: '창체', teacher: '', raw }
  }
  if (lines.length === 2 && lines[0] === '여' && lines[1] === '유') {
    return { subject: '여유', teacher: '', raw }
  }

  const coded = (lines[0] ?? '').replace(/^[A-J]\d?_/, '')
  const withoutTrailingNumber = coded.replace(/\d+$/, '')
  const subjectMap = subjectNames[grade] ?? {}
  const subject = subjectMap[coded] ?? subjectMap[withoutTrailingNumber] ?? coded
  return {
    subject,
    teacher: lines.slice(1).join(' · '),
    raw,
  }
}

function parseMaster(
  rows: Matrix,
  fileName: string,
): StudentTimetableImport {
  const headerRow = rows.findIndex(row => row.some(value => compact(value) === '학급'))
  if (headerRow < 0) throw new Error('전체시간표에서 ‘학급’ 헤더를 찾지 못했습니다.')
  const classColumn = rows[headerRow].findIndex(value => compact(value) === '학급')
  const periodRow = headerRow + 1
  const dayStarts: Array<{ day: StudentTimetableDay; column: number }> =
    STUDENT_TIMETABLE_DAYS.map(day => ({
      day,
      column: rows[headerRow].findIndex(value => compact(value) === day),
    }))
  if (dayStarts.some(item => item.column < 0)) {
    throw new Error('전체시간표에서 월~금 요일 헤더를 모두 찾지 못했습니다.')
  }

  const classes: StudentTimetableDataset['classes'] = {}
  for (let rowIndex = periodRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const classLabel = normalizeClassLabel(rows[rowIndex][classColumn])
    if (!classLabel) continue
    const grade = classLabel.slice(0, 1)
    const slots: Record<string, BaseTimetableSlot> = {}
    for (let dayIndex = 0; dayIndex < dayStarts.length; dayIndex += 1) {
      const current = dayStarts[dayIndex]
      const nextColumn = dayStarts[dayIndex + 1]?.column ?? rows[rowIndex].length
      for (let column = current.column; column < nextColumn; column += 1) {
        const period = Number(compact(rows[periodRow]?.[column]))
        if (!Number.isInteger(period) || period < 1 || period > 8) continue
        const parsed = parseBaseCell(rows[rowIndex][column], grade, {})
        slots[slotKey(current.day, period)] = {
          day: current.day,
          period,
          ...parsed,
        }
      }
    }
    classes[classLabel] = slots
  }
  if (Object.keys(classes).length === 0) {
    throw new Error('전체시간표에서 학급별 시간표를 찾지 못했습니다.')
  }
  return {
    kind: 'master',
    fileName,
    grades: [...new Set(Object.keys(classes).map(label => label.slice(0, 1)))],
    classes,
    warnings: [],
  }
}

function parseCourses(rows: Matrix, fileName: string, headerRow: number): StudentTimetableImport {
  const headers = rows[headerRow].map(compact)
  const courses: CourseOffering[] = rows.slice(headerRow + 1)
    .map(row => rowObject(headers, row))
    .filter(row => row['강좌이름'] && row['선택군'])
    .map(row => ({
      grade: row['학년'],
      group: row['선택군'].toUpperCase(),
      times: row['운영시간'].split(',').map(value => compact(value)).filter(Boolean),
      courseName: row['강좌이름'],
      teacher: row['담당교사'],
      classroom: row['교실'],
      sourceFile: fileName,
    }))
  if (courses.length === 0) throw new Error('강좌 일괄개설 자료에 강좌가 없습니다.')
  const invalidTimes = courses.filter(course =>
    course.times.length === 0 || course.times.some(time => !/^[월화수목금][1-8]$/.test(time)),
  )
  return {
    kind: 'courses',
    fileName,
    grades: [...new Set(courses.map(course => course.grade).filter(Boolean))],
    courses,
    warnings: invalidTimes.length > 0
      ? [`${invalidTimes.length}개 강좌의 운영시간 형식을 확인해 주세요.`]
      : [],
  }
}

function parseEnrollments(rows: Matrix, fileName: string, headerRow: number): StudentTimetableImport {
  const headers = rows[headerRow].map(compact)
  const enrollments: StudentEnrollment[] = rows.slice(headerRow + 1)
    .map(row => rowObject(headers, row))
    .filter(row => row['학번'] && row['이름'] && row['강좌이름'])
    .map(row => ({
      studentId: compact(row['학번']),
      name: row['이름'],
      courseName: row['강좌이름'],
      group: row['선택군'].toUpperCase(),
      grade: compact(row['학번']).slice(0, 1),
      sourceFile: fileName,
    }))
  if (enrollments.length === 0) throw new Error('수강생 일괄개설 자료에 학생이 없습니다.')
  return {
    kind: 'enrollments',
    fileName,
    grades: [...new Set(enrollments.map(item => item.grade).filter(Boolean))],
    enrollments,
    warnings: [],
  }
}

function parseSubjectNames(rows: Matrix, fileName: string): StudentTimetableImport {
  const subjectNames: Record<string, Record<string, string>> = {}
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let column = 0; column < rows[rowIndex].length - 1; column += 1) {
      if (compact(rows[rowIndex][column]) !== '줄임' || compact(rows[rowIndex][column + 1]) !== '정식') continue
      let grade = ''
      for (let above = rowIndex - 1; above >= 0; above -= 1) {
        const match = compact(rows[above][column]).match(/^([123])학년$/)
        if (match) {
          grade = match[1]
          break
        }
      }
      if (!grade) continue
      subjectNames[grade] ??= {}
      for (let dataRow = rowIndex + 1; dataRow < rows.length; dataRow += 1) {
        const shortName = clean(rows[dataRow][column])
        const formalName = clean(rows[dataRow][column + 1])
        if (!shortName && !formalName) break
        if (shortName && formalName) subjectNames[grade][shortName] = formalName
      }
    }
  }
  if (Object.values(subjectNames).every(values => Object.keys(values).length === 0)) {
    throw new Error('과목 정식 명칭 자료에서 ‘줄임/정식’ 표를 찾지 못했습니다.')
  }
  return {
    kind: 'subjectNames',
    fileName,
    grades: Object.keys(subjectNames),
    subjectNames,
    warnings: [],
  }
}

export function parseStudentTimetableWorkbook(
  fileName: string,
  bytes: number[],
): StudentTimetableImport {
  const rows = sheetRows(bytes)
  const courseHeader = findHeaderRow(rows, ['선택군', '운영시간', '강좌이름', '담당교사', '학년', '교실'])
  if (courseHeader >= 0) return parseCourses(rows, fileName, courseHeader)

  const enrollmentHeader = findHeaderRow(rows, ['학번', '이름', '강좌이름', '선택군'])
  if (enrollmentHeader >= 0) return parseEnrollments(rows, fileName, enrollmentHeader)

  if (rows.some(row => row.some(value => compact(value) === '학급')) &&
      rows.some(row => row.some(value => compact(value) === '월'))) {
    return parseMaster(rows, fileName)
  }

  if (rows.some(row => row.some(value => compact(value) === '줄임')) &&
      rows.some(row => row.some(value => compact(value) === '정식'))) {
    return parseSubjectNames(rows, fileName)
  }

  throw new Error('지원하는 자료 형식을 찾지 못했습니다.')
}

export function emptyStudentTimetableDataset(): StudentTimetableDataset {
  return {
    classes: {},
    classFile: '',
    courses: [],
    courseFiles: [],
    enrollments: [],
    enrollmentFiles: [],
    subjectNames: {},
    subjectFile: '',
    warnings: [],
  }
}

export function mergeStudentTimetableImport(
  dataset: StudentTimetableDataset,
  imported: StudentTimetableImport,
): StudentTimetableDataset {
  const next: StudentTimetableDataset = {
    ...dataset,
    classes: { ...dataset.classes },
    courses: [...dataset.courses],
    courseFiles: [...dataset.courseFiles],
    enrollments: [...dataset.enrollments],
    enrollmentFiles: [...dataset.enrollmentFiles],
    subjectNames: Object.fromEntries(
      Object.entries(dataset.subjectNames).map(([grade, values]) => [grade, { ...values }]),
    ),
    warnings: [...dataset.warnings, ...imported.warnings],
  }

  if (imported.kind === 'master' && imported.classes) {
    next.classes = imported.classes
    next.classFile = imported.fileName
  } else if (imported.kind === 'courses' && imported.courses) {
    const grades = new Set(imported.grades)
    next.courses = [
      ...next.courses.filter(item => !grades.has(item.grade)),
      ...imported.courses,
    ]
    next.courseFiles = [
      ...next.courseFiles.filter(file => !dataset.courses.some(item => grades.has(item.grade) && item.sourceFile === file)),
      imported.fileName,
    ]
  } else if (imported.kind === 'enrollments' && imported.enrollments) {
    const grades = new Set(imported.grades)
    next.enrollments = [
      ...next.enrollments.filter(item => !grades.has(item.grade)),
      ...imported.enrollments,
    ]
    next.enrollmentFiles = [
      ...next.enrollmentFiles.filter(file => !dataset.enrollments.some(item => grades.has(item.grade) && item.sourceFile === file)),
      imported.fileName,
    ]
  } else if (imported.kind === 'subjectNames' && imported.subjectNames) {
    next.subjectNames = imported.subjectNames
    next.subjectFile = imported.fileName
  }
  next.courseFiles = [...new Set(next.courseFiles)]
  next.enrollmentFiles = [...new Set(next.enrollmentFiles)]
  return next
}

function summarizeStudent(studentId: string, name: string, enrollmentCount: number): StudentSummary {
  const grade = studentId.slice(0, 1)
  const className = String(Number(studentId.slice(1, 3)))
  return {
    studentId,
    name,
    grade,
    className,
    classLabel: `${grade}-${className}`,
    number: String(Number(studentId.slice(3, 5))),
    enrollmentCount,
  }
}

export function getStudentSummaries(dataset: StudentTimetableDataset): StudentSummary[] {
  const grouped = new Map<string, { name: string; count: number }>()
  for (const enrollment of dataset.enrollments) {
    const current = grouped.get(enrollment.studentId)
    grouped.set(enrollment.studentId, {
      name: enrollment.name || current?.name || '',
      count: (current?.count ?? 0) + 1,
    })
  }
  return [...grouped.entries()]
    .map(([studentId, value]) => summarizeStudent(studentId, value.name, value.count))
    .sort((a, b) => a.studentId.localeCompare(b.studentId, 'ko'))
}

function mappedBaseSlot(
  slot: BaseTimetableSlot,
  grade: string,
  subjectNames: StudentTimetableDataset['subjectNames'],
): PersonalTimetableSlot {
  const parsed = parseBaseCell(slot.raw, grade, subjectNames)
  return {
    ...slot,
    ...parsed,
    classroom: '',
    selectedCourse: false,
  }
}

export function buildPersonalTimetable(
  dataset: StudentTimetableDataset,
  studentId: string,
): PersonalTimetable {
  const enrollments = dataset.enrollments.filter(item => item.studentId === studentId)
  if (enrollments.length === 0) throw new Error('학생의 과목선택 자료를 찾지 못했습니다.')
  const student = summarizeStudent(studentId, enrollments[0].name, enrollments.length)
  const base = dataset.classes[student.classLabel]
  const warnings: string[] = []
  if (!base) warnings.push(`${student.classLabel} 학급 시간표를 찾지 못했습니다.`)

  const slots: Record<string, PersonalTimetableSlot> = {}
  for (const day of STUDENT_TIMETABLE_DAYS) {
    for (let period = 1; period <= 7; period += 1) {
      const key = slotKey(day, period)
      const baseSlot = base?.[key] ?? { day, period, subject: '', teacher: '', raw: '' }
      slots[key] = mappedBaseSlot(baseSlot, student.grade, dataset.subjectNames)
    }
  }

  const selections: Array<CourseOffering & { group: string }> = []
  for (const enrollment of enrollments) {
    const matches = dataset.courses.filter(course =>
      course.grade === student.grade &&
      course.group === enrollment.group &&
      course.courseName === enrollment.courseName,
    )
    if (matches.length === 0) {
      warnings.push(`${enrollment.group}군 ‘${enrollment.courseName}’ 강좌 정보를 찾지 못했습니다.`)
      continue
    }
    if (matches.length > 1) {
      warnings.push(`${enrollment.group}군 ‘${enrollment.courseName}’ 강좌가 중복되어 첫 항목을 사용했습니다.`)
    }
    const course = matches[0]
    selections.push({ ...course, group: enrollment.group })
    for (const time of course.times) {
      const match = time.match(/^([월화수목금])([1-8])$/)
      if (!match) {
        warnings.push(`${course.courseName}의 운영시간 ‘${time}’을 읽지 못했습니다.`)
        continue
      }
      const key = slotKey(match[1] as StudentTimetableDay, Number(match[2]))
      if (slots[key]?.selectedCourse && slots[key].subject !== course.courseName) {
        warnings.push(`${time}에 선택과목이 중복됩니다: ${slots[key].subject}, ${course.courseName}`)
      }
      slots[key] = {
        day: match[1] as StudentTimetableDay,
        period: Number(match[2]),
        subject: course.courseName,
        teacher: course.teacher,
        classroom: course.classroom,
        raw: course.courseName,
        selectedCourse: true,
        group: enrollment.group,
      }
    }
  }

  return { student, slots, selections, warnings }
}

export function getStudentTimetableStats(dataset: StudentTimetableDataset) {
  const students = getStudentSummaries(dataset)
  const courseIndex = new Set(dataset.courses.map(item => `${item.grade}|${item.group}|${item.courseName}`))
  const unmatched = dataset.enrollments.filter(item =>
    !courseIndex.has(`${item.grade}|${item.group}|${item.courseName}`),
  )
  const missingClasses = students.filter(student => !dataset.classes[student.classLabel])
  return {
    classes: Object.keys(dataset.classes).length,
    courses: dataset.courses.length,
    enrollments: dataset.enrollments.length,
    students: students.length,
    subjectNames: Object.values(dataset.subjectNames).reduce((sum, values) => sum + Object.keys(values).length, 0),
    unmatched: unmatched.length,
    missingClasses: missingClasses.length,
  }
}

export function isStudentTimetableReady(dataset: StudentTimetableDataset): boolean {
  return Object.keys(dataset.classes).length > 0 &&
    dataset.courses.length > 0 &&
    dataset.enrollments.length > 0
}

export function prepareSharedStudentTimetable(
  dataset: StudentTimetableDataset,
  rosterStudents: StudentRosterEntry[] = [],
  title = '2026학년도 2학기 학생별 시간표',
  semester = '2026-2',
): SharedStudentTimetableUpload {
  if (!isStudentTimetableReady(dataset)) {
    throw new Error('전체시간표·강좌 일괄개설·수강생 일괄개설 자료를 모두 불러와 주세요.')
  }

  const stats = getStudentTimetableStats(dataset)
  if (stats.unmatched > 0 || stats.missingClasses > 0) {
    throw new Error(
      `자료 연결을 확인해 주세요. 강좌 미매칭 ${stats.unmatched}건 · 학급 시간표 없음 ${stats.missingClasses}명`,
    )
  }

  const students = getStudentSummaries(dataset).map(student => {
    const personal = buildPersonalTimetable(dataset, student.studentId)
    return {
      ...personal,
      slots: Object.fromEntries(
        Object.entries(personal.slots).map(([key, slot]) => [key, { ...slot, raw: '' }]),
      ),
      selections: personal.selections.map(selection => ({ ...selection, sourceFile: '' })),
      warnings: [],
    }
  })
  const includedIds = new Set(students.map(item => item.student.studentId))
  for (const rosterStudent of rosterStudents) {
    if (includedIds.has(rosterStudent.studentId)) continue
    const grade = rosterStudent.grade || rosterStudent.studentId.slice(0, 1)
    const className = String(Number(rosterStudent.className))
    const classLabel = `${grade}-${className}`
    const base = dataset.classes[classLabel]
    if (!base) continue
    const slots: Record<string, PersonalTimetableSlot> = {}
    for (const day of STUDENT_TIMETABLE_DAYS) {
      for (let period = 1; period <= 7; period += 1) {
        const key = slotKey(day, period)
        const baseSlot = base[key] ?? { day, period, subject: '', teacher: '', raw: '' }
        slots[key] = mappedBaseSlot(baseSlot, grade, dataset.subjectNames)
      }
    }
    students.push({
      student: {
        studentId: rosterStudent.studentId,
        name: rosterStudent.name,
        grade,
        className,
        classLabel,
        number: String(Number(rosterStudent.number)),
        enrollmentCount: 0,
      },
      slots,
      selections: [],
      warnings: [],
    })
    includedIds.add(rosterStudent.studentId)
  }
  students.sort((a, b) => a.student.studentId.localeCompare(b.student.studentId, 'ko'))
  const warningCount = students.reduce((sum, student) => sum + student.warnings.length, 0)
  if (warningCount > 0) {
    throw new Error(`학생별 시간표 생성 중 ${warningCount}건의 경고가 발견되었습니다. 입력 파일을 확인해 주세요.`)
  }

  return {
    title,
    semester,
    studentCount: students.length,
    classCount: stats.classes,
    courseCount: stats.courses,
    students,
  }
}
