import * as XLSX from 'xlsx'

export interface TranscriptCourse {
  grade: string
  semester: string
  subjectGroup: string
  subject: string
  credit: string
  rawScore: string
  average: string
  achievement: string
  distribution: string
  rankGrade: string
  enrollment: string
}

export interface TranscriptStudent {
  studentId: string
  number: string
  name: string
  courses: TranscriptCourse[]
}

export interface StoredTranscript {
  id: string
  fileName: string
  fingerprint: string
  importedAt: string
  grade: number
  classNo: number
  curriculum: '2015' | '2022'
  students: TranscriptStudent[]
}

const STORAGE_KEY = 'recommendedSubjects.transcripts.v1'
const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()
const key = (value: unknown) => clean(value).replace(/[\s·()]/g, '').toLowerCase()

function findIndex(headers: unknown[], names: string[]) {
  const normalized = headers.map(key)
  return normalized.findIndex(value => names.some(name => value.includes(key(name))))
}

export async function parseTranscriptFile(file: File): Promise<StoredTranscript> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: '' })
  const allText = rows.slice(0, 80).flat().map(clean).join(' ')
  const classMatch = allText.match(/([123])\s*학년\s*([0-9]+)\s*반/)
  const grade = Number(classMatch?.[1] ?? 0)
  const classNo = Number(classMatch?.[2] ?? 0)
  if (!grade || !classNo) throw new Error('파일 안에서 학년·반을 찾지 못했습니다. 나이스 교과학습발달상황(개인별출력) XLSX data인지 확인해 주세요.')

  let columns: Record<string, number> | null = null
  let current: TranscriptStudent | null = null
  let currentGrade = ''
  let currentSemester = ''
  const students = new Map<string, TranscriptStudent>()
  const seen = new Set<string>()

  for (const row of rows) {
    const rowText = row.map(clean)
    const hasHeader = rowText.some(value => key(value) === '번호') && rowText.some(value => key(value) === '성명') && rowText.some(value => key(value) === '과목')
    if (hasHeader) {
      columns = {
        number: findIndex(row, ['번호']), name: findIndex(row, ['성명']), grade: findIndex(row, ['학년']), semester: findIndex(row, ['학기']),
        group: findIndex(row, ['교과']), subject: findIndex(row, ['과목']), credit: findIndex(row, ['학점수', '학점', '단위수', '단위']),
        score: findIndex(row, ['원점수/과목평균', '원점수']), achievement: findIndex(row, ['성취도']), distribution: findIndex(row, ['성취도별분포비율', '분포비율']),
        rank: findIndex(row, ['석차등급']), enrollment: findIndex(row, ['수강자수']),
      }
      continue
    }
    if (!columns || columns.subject < 0) continue
    const number = columns.number >= 0 ? clean(row[columns.number]) : ''
    const name = columns.name >= 0 ? clean(row[columns.name]) : ''
    if (/^\d{1,2}$/.test(number) && name && !/성명|합계/.test(name)) {
      const studentId = `${grade}${classNo}${String(Number(number)).padStart(2, '0')}`
      current = students.get(studentId) ?? { studentId, number: String(Number(number)), name, courses: [] }
      current.name = name
      students.set(studentId, current)
      currentGrade = ''
      currentSemester = ''
    }
    if (!current) continue
    const rowGrade = columns.grade >= 0 ? clean(row[columns.grade]) : ''
    const rowSemester = columns.semester >= 0 ? clean(row[columns.semester]) : ''
    if (/^[123]$/.test(rowGrade)) currentGrade = rowGrade
    if (/^[12]$/.test(rowSemester)) currentSemester = rowSemester
    const subject = clean(row[columns.subject])
    if (!subject || /과목|이수학점|페이지|합계/.test(subject)) continue
    const scoreCell = columns.score >= 0 ? clean(row[columns.score]) : ''
    const scoreParts = scoreCell.split('/').map(part => part.trim())
    const achievementCell = columns.achievement >= 0 ? clean(row[columns.achievement]) : ''
    const achievementMatch = achievementCell.match(/^([^()]+)(?:\((\d+)\))?/)
    const course: TranscriptCourse = {
      grade: currentGrade, semester: currentSemester,
      subjectGroup: columns.group >= 0 ? clean(row[columns.group]) : '', subject,
      credit: columns.credit >= 0 ? clean(row[columns.credit]) : '',
      rawScore: scoreParts[0] ?? '', average: scoreParts.slice(1).join('/') || '',
      achievement: clean(achievementMatch?.[1] ?? achievementCell),
      distribution: columns.distribution >= 0 ? clean(row[columns.distribution]) : '',
      rankGrade: columns.rank >= 0 ? clean(row[columns.rank]) : '',
      enrollment: columns.enrollment >= 0 ? clean(row[columns.enrollment]) : clean(achievementMatch?.[2] ?? ''),
    }
    const dedupe = `${current.studentId}|${course.grade}|${course.semester}|${course.subject}|${course.credit}|${course.rawScore}|${course.achievement}`
    if (!seen.has(dedupe)) { seen.add(dedupe); current.courses.push(course) }
  }
  const studentList = [...students.values()].filter(student => student.courses.length).sort((a, b) => Number(a.number) - Number(b.number))
  if (!studentList.length) throw new Error('학생별 교과 기록을 찾지 못했습니다. 나이스 XLSX data 파일인지 확인해 주세요.')
  const curriculum: StoredTranscript['curriculum'] = grade <= 2 ? '2022' : '2015'
  return {
    id: crypto.randomUUID(), fileName: file.name, fingerprint: `${file.name}|${file.size}|${file.lastModified}`,
    importedAt: new Date().toISOString(), grade, classNo, curriculum, students: studentList,
  }
}

export async function loadStoredTranscripts(): Promise<StoredTranscript[]> {
  const value = window.electron ? await window.electron.configGet(STORAGE_KEY) : JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  return Array.isArray(value) ? value as StoredTranscript[] : []
}

export async function saveStoredTranscripts(value: StoredTranscript[]) {
  if (window.electron) await window.electron.configSet(STORAGE_KEY, value)
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}
