import { formatStudentNumber, parseStudentNumber, studentsFromRows, subjectGroup, type GradeRow, type StudentInfo } from './domain'
import { subjectKey } from './curriculum2022'

function identityKey(s: StudentInfo) {
  const name = s.name.normalize('NFC').replace(/\s/g, '')
  const explicit = parseStudentNumber(s.studentNumber)
  if (!name || (s.studentNumber && !explicit)) return ''
  if (explicit && (['currentGrade', 'className', 'number'] as const).some(field =>
    s[field] && Number(s[field]) !== Number(explicit[field]))) return ''
  const number = formatStudentNumber(explicit || s, 5)
  return number ? JSON.stringify([number, name]) : ''
}

function gradeFields(row: GradeRow) {
  return [row.credit, row.rank, row.scale, subjectGroup(row), row.readState === 'review' && !row.reviewed]
}

export type CourseChoice = { rows: GradeRow[]; sources: GradeRow[][]; selected: string; signature: string }

export function reconcileGrades(raw: GradeRow[]) {
  const people = studentsFromRows(raw)
  const years = new Map<string, Set<string>>()
  for (const person of people) {
    const key = identityKey(person)
    if (!key || !person.schoolYear) continue
    if (!years.has(key)) years.set(key, new Set())
    years.get(key)!.add(person.schoolYear)
  }
  const owner = new Map<string, string>(), byIdentity = new Map<string, StudentInfo>()
  const students: StudentInfo[] = []
  for (const person of people) {
    const key = identityKey(person), knownYears = years.get(key)
    const year = person.schoolYear || (knownYears?.size === 1 ? [...knownYears][0] : '')
    const identity = key && (year || !knownYears?.size) ? JSON.stringify([key, year]) : ''
    let chosen = identity ? byIdentity.get(identity) : undefined
    if (!chosen) {
      chosen = { ...person }
      if (identity) byIdentity.set(identity, chosen)
      students.push(chosen)
    } else {
      if (!chosen.studentNumber) chosen.studentNumber = person.studentNumber
      if (!chosen.schoolYear) chosen.schoolYear = person.schoolYear
    }
    owner.set(person.id, chosen.id)
  }
  const buckets = new Map<string, GradeRow[]>()
  for (const row of raw) {
    const student = owner.get(row.student) || row.student
    const subject = subjectKey(row.subject)
    const key = subject && /^[123]$/.test(row.year) && /^[12]$/.test(row.semester)
      ? JSON.stringify([student, row.year, row.semester, subject]) : JSON.stringify([row.id])
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(row)
  }
  const byStudent = new Map<string, GradeRow[]>(), conflicts = new Map<string, CourseChoice[]>()
  let duplicates = 0
  for (const group of buckets.values()) {
    const first = group[0], student = owner.get(first.student) || first.student
    if (!byStudent.has(student)) byStudent.set(student, [])
    const result = byStudent.get(student)!
    const sources = new Map<string, GradeRow[]>()
    for (const row of group) {
      const source = row.sourceId || row.student
      if (!sources.has(source)) sources.set(source, [])
      sources.get(source)!.push(row)
    }
    if (sources.size < 2) {
      result.push(...group)
      continue
    }
    const signature = JSON.stringify(group.map(row => JSON.stringify([row.id, ...gradeFields(row)])).sort())
    const maxCounts = new Map<string, number>()
    const choices = [...sources.values()]
    for (const records of choices) {
      const count = new Map<string, number>()
      for (const row of records) {
        const key = JSON.stringify(gradeFields(row))
        const n = (count.get(key) || 0) + 1
        count.set(key, n)
        maxCounts.set(key, Math.max(n, maxCounts.get(key) || 0))
      }
    }
    // If an original contains every observed value and occurrence, it covers
    // every other original one-to-one. Keep its repeated course rows intact.
    const needed = [...maxCounts.values()].reduce((total, n) => total + n, 0)
    const complete = choices.find(records => records.length === needed)
    if (complete) {
      result.push(...complete)
      duplicates += group.length - complete.length
      continue
    }
    const accepted = choices.find(records => records.some(row => row.courseChoice === signature))
    if (!conflicts.has(student)) conflicts.set(student, [])
    conflicts.get(student)!.push({ rows: group, sources: choices, selected: accepted?.[0].id || '', signature })
    if (accepted) result.push(...accepted)
    else result.push({ ...first, readState: 'review', reviewed: false,
      issues: ['자료마다 성적이 달라 원본 선택이 필요합니다.'] })
  }
  return { students, owner, byStudent, conflicts, duplicates }
}
