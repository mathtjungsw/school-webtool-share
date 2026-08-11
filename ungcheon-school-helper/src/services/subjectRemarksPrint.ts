import * as XLSX from 'xlsx'
import { escapeHtml, printHtml } from '../utils/printHtml'

export interface SubjectRemarkStudent {
  id: string
  className: string
  studentNumber: string
  name: string
  remark: string
}

export interface SubjectRemarksDataset {
  schemaVersion: 1
  sourceFileName: string
  importedAt: string
  schoolName: string
  academicYear: string
  semester: string
  grade: string
  classroom: string
  course: string
  students: SubjectRemarkStudent[]
}

type CellRow = string[]

const clean = (value: unknown) => String(value ?? '').replace(/\u00a0/g, ' ').trim()
const compact = (value: unknown) => clean(value).replace(/\s+/g, '')

function readMeta(rows: CellRow[]) {
  const joined = rows.slice(0, 12).flat().map(clean).filter(Boolean).join(' ')
  const year = joined.match(/(20\d{2})\s*학년도/)?.[1] ?? ''
  const semester = joined.match(/([12])\s*학기/)?.[1] ?? ''
  const grade = joined.match(/([123])\s*학년/)?.[1] ?? ''
  const classroom = joined.match(/(\d+)\s*강의실/)?.[1] ?? ''
  const course = rows.flat().map(clean).find(value => /^교과목\s*:/.test(value))
    ?.replace(/^교과목\s*:\s*/, '').trim() ?? ''
  const schoolName = rows.flat().map(clean).find(value => /고등학교$/.test(value)) ?? '웅천고등학교'
  return { year, semester, grade, classroom, course, schoolName }
}

function headerIndexes(row: CellRow) {
  const normalized = row.map(compact)
  const classIndex = normalized.findIndex(value => value === '반/번호' || value === '반번호')
  const nameIndex = normalized.findIndex(value => value === '성명' || value === '이름')
  const remarkIndex = normalized.findIndex(value => value.includes('세부능력및특기사항'))
  return classIndex >= 0 && nameIndex >= 0 && remarkIndex >= 0
    ? { classIndex, nameIndex, remarkIndex }
    : null
}

/** NEIS 출력물의 페이지마다 반복되는 머리글과 다음 페이지로 이어지는 세특 문장을 합친다. */
export function parseSubjectRemarksWorkbook(bytes: number[], sourceFileName: string): SubjectRemarksDataset {
  if (!bytes.length) throw new Error('선택한 파일이 비어 있습니다.')
  const workbook = XLSX.read(Uint8Array.from(bytes), { type: 'array', cellDates: false })
  const students = new Map<string, SubjectRemarkStudent>()
  let meta = { year: '', semester: '', grade: '', classroom: '', course: '', schoolName: '웅천고등학교' }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1, raw: false, defval: '', blankrows: true,
    }).map(row => row.map(clean))
    const sheetMeta = readMeta(rows)
    meta = {
      year: meta.year || sheetMeta.year,
      semester: meta.semester || sheetMeta.semester,
      grade: meta.grade || sheetMeta.grade,
      classroom: meta.classroom || sheetMeta.classroom,
      course: meta.course || sheetMeta.course,
      schoolName: sheetMeta.schoolName || meta.schoolName,
    }

    let columns: ReturnType<typeof headerIndexes> = null
    let lastStudent: SubjectRemarkStudent | null = null
    for (const row of rows) {
      const nextColumns = headerIndexes(row)
      if (nextColumns) {
        columns = nextColumns
        continue
      }
      if (!columns) continue

      const classNumber = clean(row[columns.classIndex])
      const name = clean(row[columns.nameIndex])
      const remark = clean(row[columns.remarkIndex])
      const match = classNumber.match(/^(\d+)\s*[\/-]\s*(\d+)$/)
      if (match && name) {
        const className = String(Number(match[1]))
        const studentNumber = String(Number(match[2]))
        const key = `${meta.course}|${className}|${studentNumber}|${name}`
        const existing = students.get(key)
        if (existing) {
          existing.remark += remark
          lastStudent = existing
        } else {
          const student: SubjectRemarkStudent = {
            id: key,
            className,
            studentNumber,
            name,
            remark,
          }
          students.set(key, student)
          lastStudent = student
        }
        continue
      }

      // NEIS XLS data는 인쇄 페이지가 바뀌면 빈 반/번호·성명 뒤에 본문만 이어진다.
      if (!classNumber && !name && remark && lastStudent) lastStudent.remark += remark
    }
  }

  const sorted = [...students.values()].sort((a, b) =>
    Number(a.className) - Number(b.className)
      || Number(a.studentNumber) - Number(b.studentNumber)
      || a.name.localeCompare(b.name, 'ko'),
  )
  if (!sorted.length) {
    throw new Error('학생별 교과세특을 찾지 못했습니다. 나이스 성적조회에서 내려받은 XLS data 파일인지 확인해 주세요.')
  }

  return {
    schemaVersion: 1,
    sourceFileName,
    importedAt: new Date().toISOString(),
    schoolName: meta.schoolName,
    academicYear: meta.year,
    semester: meta.semester,
    grade: meta.grade,
    classroom: meta.classroom,
    course: meta.course,
    students: sorted,
  }
}

export async function loadStoredSubjectRemarks(): Promise<SubjectRemarksDataset | null> {
  const raw = await window.electron?.subjectRemarksGet()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SubjectRemarksDataset
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.students)) return null
    return parsed
  } catch {
    return null
  }
}

export async function saveSubjectRemarks(dataset: SubjectRemarksDataset): Promise<void> {
  await window.electron?.subjectRemarksSet(JSON.stringify(dataset))
}

export async function clearSubjectRemarks(): Promise<void> {
  await window.electron?.subjectRemarksClear()
}

function printSheet(dataset: SubjectRemarksDataset, student: SubjectRemarkStudent, index: number, total: number) {
  const meta = [
    dataset.academicYear && `${dataset.academicYear}학년도`,
    dataset.semester && `${dataset.semester}학기`,
    dataset.grade && `${dataset.grade}학년`,
    dataset.course && `교과목: ${dataset.course}`,
  ].filter(Boolean).join(' · ')
  const fontSize = student.remark.length > 1400 ? 9 : student.remark.length > 1000 ? 9.8 : 10.8
  return `<section class="subject-remark-sheet">
    <header><p class="document-kicker">${escapeHtml(dataset.schoolName)}</p><h1>과목별 세부능력 및 특기사항</h1><p class="document-meta">${escapeHtml(meta)}</p></header>
    <table class="student-info"><tbody><tr><th>반</th><td>${escapeHtml(student.className)}</td><th>번호</th><td>${escapeHtml(student.studentNumber)}</td><th>성명</th><td class="student-name">${escapeHtml(student.name)}</td></tr></tbody></table>
    <section class="remark-box"><h2>세부능력 및 특기사항</h2><p style="font-size:${fontSize}pt">${escapeHtml(student.remark)}</p></section>
    <footer><span>${escapeHtml(dataset.sourceFileName)}</span><span>${index + 1} / ${total}</span></footer>
  </section>`
}

export function printSubjectRemarks(dataset: SubjectRemarksDataset, students: SubjectRemarkStudent[]) {
  if (!students.length) return
  const body = students.map((student, index) => printSheet(dataset, student, index, students.length)).join('')
  printHtml(body, `
    body{background:#fff;}
    .subject-remark-sheet{width:210mm;height:297mm;padding:17mm 16mm 14mm;display:flex;flex-direction:column;page-break-after:always;overflow:hidden;background:#fff;color:#111;}
    .subject-remark-sheet:last-child{page-break-after:auto;}
    header{text-align:center;border-bottom:2px solid #1f2937;padding-bottom:8mm;}
    .document-kicker{font-size:9pt;letter-spacing:.12em;color:#475569;margin-bottom:3mm;}
    h1{font-size:20pt;letter-spacing:-.04em;}
    .document-meta{font-size:9.5pt;color:#334155;margin-top:3mm;}
    .student-info{width:100%;border-collapse:collapse;margin-top:8mm;font-size:11pt;}
    .student-info th,.student-info td{border:1px solid #64748b;padding:3.2mm;text-align:center;}
    .student-info th{width:13%;background:#f1f5f9;font-weight:700;}
    .student-info td{width:15%;}.student-info .student-name{width:29%;font-weight:700;}
    .remark-box{flex:1;min-height:0;border:1px solid #64748b;border-top:0;padding:7mm 8mm;}
    .remark-box h2{font-size:10pt;color:#334155;margin-bottom:5mm;}
    .remark-box p{line-height:1.86;text-align:justify;word-break:keep-all;overflow-wrap:anywhere;white-space:pre-wrap;}
    footer{display:flex;justify-content:space-between;gap:10mm;padding-top:4mm;font-size:8pt;color:#64748b;}
    @page{size:A4 portrait;margin:0;}
  `)
}
