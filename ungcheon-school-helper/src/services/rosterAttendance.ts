import * as XLSX from 'xlsx'
import { escapeHtml, printHtml } from '../utils/printHtml'

type Cell = string | number | boolean | Date | null | undefined
type Matrix = Cell[][]

export interface StaffMember {
  id: string
  name: string
  position: string
  department: string
  subject: string
  homeroom: string
}

export interface SharedStaffRoster {
  version: number
  uploadedBy: string
  uploadedAt: string
  sourceFileName: string
  members: StaffMember[]
}

export interface StudentRosterEntry {
  studentId: string
  name: string
  gender: string
  /** Legacy compatibility field. Student roster remarks are never imported or shared. */
  remark: string
  grade: string
  className: string
  number: string
  homeroomTeacher: string
  assistantTeacher: string
}

export interface SharedStudentRoster {
  version: number
  uploadedBy: string
  uploadedAt: string
  sourceFileName: string
  students: StudentRosterEntry[]
}

export interface StaffChecklistResponse {
  teacherName: string
  checkedItemIds: string[]
  memo: string
  updatedAt: string
}

export type StaffTaskPriority = 'low' | 'normal' | 'high'
export type StaffTaskStatus = 'planned' | 'in_progress' | 'completed' | 'hold'

export interface StaffChecklist {
  id: string
  title: string
  description: string
  deadline: string
  startDate: string
  priority: StaffTaskPriority
  status: StaffTaskStatus
  linkUrl: string
  departmentNames: string[]
  creatorName: string
  createdAt: string
  updatedAt: string
  closed: boolean
  items: Array<{ id: string; label: string }>
  targetNames: string[]
  responses: StaffChecklistResponse[]
  canManage: boolean
}

export interface AttendanceRosterPrintGroup {
  title: string
  date: string
  subtitle: string
  students: StudentRosterEntry[]
}

const clean = (value: Cell): string =>
  String(value ?? '')
    .replace(/_x000D_/gi, '')
    .replace(/\r\n?/g, '\n')
    .trim()

const compact = (value: Cell): string => clean(value).replace(/\s+/g, '')

const studentClassFromId = (studentId: string): string =>
  String(Number(studentId.length === 4 ? studentId.slice(1, 2) : studentId.slice(1, 3)))

const studentNumberFromId = (studentId: string): string =>
  String(Number(studentId.length === 4 ? studentId.slice(2) : studentId.slice(3)))

const workbookFromBytes = (bytes: number[]): XLSX.WorkBook =>
  XLSX.read(Uint8Array.from(bytes), {
    type: 'array',
    cellDates: true,
    cellFormula: false,
  })

const rowsOf = (sheet: XLSX.WorkSheet): Matrix =>
  XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  }) as Matrix

export function sortStaffMembers(members: StaffMember[]): StaffMember[] {
  const positionRank = (position: string) => {
    const normalized = compact(position)
    if (normalized === '교장') return 0
    if (normalized === '교감') return 1
    if (normalized.includes('교사')) return 2
    if (normalized === '교무실무원') return 3
    return 4
  }
  return [...members].sort((a, b) => {
    const rank = positionRank(a.position) - positionRank(b.position)
    return rank || a.name.localeCompare(b.name, 'ko')
  })
}

export function parseStaffRosterWorkbook(bytes: number[]): StaffMember[] {
  const workbook = workbookFromBytes(bytes)
  const byName = new Map<string, StaffMember>()

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = rowsOf(sheet)
    rows.forEach((header, headerIndex) => {
      header.forEach((value, nameColumn) => {
        if (compact(value) !== '성명') return
        const nearbyColumns = [
          nameColumn - 3, nameColumn - 2, nameColumn - 1,
          nameColumn + 1, nameColumn + 2, nameColumn + 3,
        ].filter(column => column >= 0)
        const positionColumn = nearbyColumns.find(column => compact(header[column]) === '직책')
        if (positionColumn === undefined) return
        const departmentColumn = nearbyColumns.find(column =>
          ['부서', '부서명', '소속부서'].includes(compact(header[column])),
        )
        const subjectColumn = nearbyColumns.find(column =>
          ['교과', '과목', '담당교과'].includes(compact(header[column])),
        )
        const homeroomColumn = nearbyColumns.find(column => compact(header[column]) === '담임')

        for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
          const name = clean(rows[rowIndex]?.[nameColumn])
          const position = clean(rows[rowIndex]?.[positionColumn])
          const department = departmentColumn === undefined
            ? ''
            : clean(rows[rowIndex]?.[departmentColumn])
          const subject = subjectColumn === undefined ? '' : clean(rows[rowIndex]?.[subjectColumn])
          const homeroom = homeroomColumn === undefined ? '' : clean(rows[rowIndex]?.[homeroomColumn])
          if (!name || !position || name === '성명' || position === '직책') continue
          if (!/^[가-힣A-Za-z][가-힣A-Za-z·.\s]{1,29}$/.test(name)) continue
          const existing = byName.get(name)
          byName.set(name, {
            id: existing?.id ?? crypto.randomUUID(),
            name,
            position,
            department: department || existing?.department || '',
            subject: subject || existing?.subject || '',
            homeroom: homeroom || existing?.homeroom || '',
          })
        }
      })
    })
  }

  const members = sortStaffMembers([...byName.values()])
  if (!members.length) {
    throw new Error('엑셀에서 ‘직책 / 성명’ 형식의 교원 명렬을 찾지 못했습니다.')
  }
  return members
}

export function parseStudentRosterWorkbook(bytes: number[]): StudentRosterEntry[] {
  const workbook = workbookFromBytes(bytes)
  const byId = new Map<string, StudentRosterEntry>()

  for (const sheetName of workbook.SheetNames) {
    const gradeMatch = compact(sheetName).match(/^([123])학년/)
    if (!gradeMatch) continue
    const grade = gradeMatch[1]
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = rowsOf(sheet)
    const headerRow = rows.findIndex(row =>
      row.filter(value => compact(value) === '학번').length >= 2 &&
      row.filter(value => compact(value) === '성명').length >= 2,
    )
    if (headerRow < 0) continue

    for (let baseColumn = 0; baseColumn < rows[headerRow].length; baseColumn += 1) {
      if (compact(rows[headerRow][baseColumn]) !== '학번') continue
      if (compact(rows[headerRow][baseColumn + 1]) !== '성명') continue
      const classText = compact(rows[headerRow - 2]?.[baseColumn])
      const classMatch = classText.match(/^(\d{1,2})반$/)
      if (!classMatch) continue
      const className = String(Number(classMatch[1]))
      const teacherRow = rows[headerRow - 1] ?? []
      const homeroomTeacher = compact(teacherRow[baseColumn]) === '담임'
        ? clean(teacherRow[baseColumn + 1])
        : ''
      const assistantTeacher = compact(teacherRow[baseColumn + 2]) === '부담임'
        ? clean(teacherRow[baseColumn + 3])
        : ''

      for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
        const studentId = compact(rows[rowIndex]?.[baseColumn])
        const name = clean(rows[rowIndex]?.[baseColumn + 1])
        if (!/^\d{4,6}$/.test(studentId) || !name) continue
        if (studentId.slice(0, 1) !== grade) continue
        const inferredClass = studentClassFromId(studentId)
        if (inferredClass !== className) continue
        const previous = byId.get(studentId)
        byId.set(studentId, {
          studentId,
          name,
          gender: clean(rows[rowIndex]?.[baseColumn + 2]) || previous?.gender || '',
          remark: '',
          grade,
          className,
          number: studentNumberFromId(studentId),
          homeroomTeacher: homeroomTeacher || previous?.homeroomTeacher || '',
          assistantTeacher: assistantTeacher || previous?.assistantTeacher || '',
        })
      }
    }
  }

  const students = [...byId.values()].sort((a, b) => a.studentId.localeCompare(b.studentId, 'ko'))
  if (!students.length) {
    throw new Error('1~3학년 명렬 시트에서 학생 정보를 찾지 못했습니다.')
  }
  return students
}

const workbookBytes = (workbook: XLSX.WorkBook): number[] =>
  Array.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array)

export async function downloadStaffRoster(members: StaffMember[]): Promise<boolean> {
  const rows = sortStaffMembers(members).map((member, index) => ({
    순번: index + 1,
    직책: member.position,
    성명: member.name,
    부서: member.department,
    교과: member.subject,
    담임: member.homeroom,
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 14 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '교원명렬')
  return window.electron.saveFileDialog(
    `웅천고_교원명렬_${new Date().toISOString().slice(0, 10)}.xlsx`,
    workbookBytes(workbook),
  )
}

export function printTrainingRoster(
  members: StaffMember[],
  title: string,
  date: string,
): void {
  const sorted = sortStaffMembers(members)
  const splitAt = Math.max(33, Math.ceil(sorted.length / 2))
  const left = sorted.slice(0, splitAt)
  const right = sorted.slice(splitAt)
  const rowCount = Math.max(33, left.length, right.length)
  const rowHeight = Math.max(4.6, Math.min(6.2, 238 / rowCount))
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const first = left[index]
    const second = right[index]
    return `<tr>
      <td>${first ? index + 1 : ''}</td><td>${first ? escapeHtml(first.position) : ''}</td>
      <td>${first ? escapeHtml(first.name) : ''}</td><td></td>
      <td>${second ? splitAt + index + 1 : ''}</td><td>${second ? escapeHtml(second.position) : ''}</td>
      <td>${second ? escapeHtml(second.name) : ''}</td><td></td>
    </tr>`
  }).join('')
  const formattedDate = date
    ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })
      .format(new Date(`${date}T00:00:00`))
    : ''
  printHtml(
    `<section class="training-sheet" style="--training-row-height:${rowHeight.toFixed(2)}mm">
      <h1>${escapeHtml(title || '연수')}</h1>
      <p class="training-date">${escapeHtml(formattedDate)}</p>
      <table>
        <thead><tr>
          <th>순번</th><th>직책</th><th>성명</th><th>서명</th>
          <th>순번</th><th>직책</th><th>성명</th><th>서명</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`,
    `
      .sheet{padding:0}
      .training-sheet{
        width:210mm;height:297mm;padding:8mm 8mm 6mm;overflow:hidden;
        break-after:page;page-break-after:always;break-inside:avoid;
      }
      h1{text-align:center;font-size:20pt;line-height:1.15;margin:0 0 3mm;font-weight:800;}
      .training-date{text-align:right;font-size:10pt;line-height:1.2;margin:0 1mm 1.5mm;}
      table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt;line-height:1.05;}
      th,td{border:1px solid #222;height:var(--training-row-height);text-align:center;padding:.45mm .6mm;}
      th{font-weight:700;background:#e8f0df;border-bottom:3px double #333;}
      th:nth-child(1),th:nth-child(5),td:nth-child(1),td:nth-child(5){width:8%;}
      th:nth-child(2),th:nth-child(6),td:nth-child(2),td:nth-child(6){width:14%;}
      th:nth-child(3),th:nth-child(7),td:nth-child(3),td:nth-child(7){width:15%;}
      th:nth-child(4),th:nth-child(8),td:nth-child(4),td:nth-child(8){width:13%;}
      .training-sheet:last-child{break-after:auto;page-break-after:auto;}
    `,
  )
}

export function printAttendanceRoster(options: {
  title: string
  date: string
  subtitle: string
  students: StudentRosterEntry[]
}): void {
  printAttendanceRosters([options])
}

export function printAttendanceRosters(groups: AttendanceRosterPrintGroup[]): void {
  const sheets = groups.map(options => {
    const students = [...options.students].sort((a, b) =>
      Number(a.number) - Number(b.number) || a.studentId.localeCompare(b.studentId),
    )
    const rowHeight = Math.max(3.8, Math.min(6.4, 238 / Math.max(students.length, 1)))
    const rowFont = students.length > 45 ? 7.5 : students.length > 36 ? 8.5 : 9.5
    const rows = students.map((student, index) => `<tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(student.studentId)}</td>
      <td>${escapeHtml(student.name)}</td>
      <td>${escapeHtml(student.gender)}</td>
      <td></td>
      <td></td>
    </tr>`).join('')
    const date = options.date
      ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })
        .format(new Date(`${options.date}T00:00:00`))
      : ''
    return `<section class="attendance-sheet" style="--attendance-row-height:${rowHeight.toFixed(2)}mm;--attendance-font-size:${rowFont}pt">
        <h1>${escapeHtml(options.title)}</h1>
        <div class="meta"><span>${escapeHtml(options.subtitle)}</span><span>${escapeHtml(date)}</span></div>
        <table>
          <thead><tr><th>순번</th><th>학번</th><th>성명</th><th>성별</th><th>출석 확인</th><th>비고</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="count">재적 ${students.length}명</p>
      </section>`
  }).join('')
  printHtml(
    sheets,
    `
      .sheet{padding:0}
      .attendance-sheet{
        width:210mm;height:297mm;padding:9mm 11mm 6mm;overflow:hidden;
        break-after:page;page-break-after:always;break-inside:avoid;
      }
      .attendance-sheet:last-child{break-after:auto;page-break-after:auto}
      h1{text-align:center;font-size:19pt;line-height:1.15;margin:0 0 4mm;}
      .meta{display:flex;justify-content:space-between;font-size:9.5pt;line-height:1.2;margin-bottom:2mm;}
      table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:var(--attendance-font-size);line-height:1.05;}
      th,td{border:1px solid #222;text-align:center;height:var(--attendance-row-height);padding:.45mm .7mm;}
      th{background:#e8f0df;font-weight:700;border-bottom:2px solid #222;}
      th:nth-child(1){width:8%}th:nth-child(2){width:16%}th:nth-child(3){width:16%}
      th:nth-child(4){width:9%}th:nth-child(5){width:25%}th:nth-child(6){width:26%}
      .count{text-align:right;font-size:9pt;line-height:1.2;margin-top:1mm;}
    `,
  )
}

export async function downloadAttendanceRosters(
  groups: AttendanceRosterPrintGroup[],
  fileName: string,
): Promise<boolean> {
  const workbook = XLSX.utils.book_new()
  const usedSheetNames = new Set<string>()
  groups.forEach((group, groupIndex) => {
    const rows: Array<Array<string | number>> = [
      [group.title],
      [group.subtitle, group.date],
      [],
      ['순번', '학번', '성명', '성별', '출석 확인', '비고'],
      ...[...group.students]
        .sort((a, b) => Number(a.number) - Number(b.number) || a.studentId.localeCompare(b.studentId))
        .map((student, index) => [
          index + 1,
          student.studentId,
          student.name,
          student.gender,
          '',
          '',
        ]),
    ]
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    sheet['!cols'] = [{ wch: 7 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 24 }]
    const baseName = (group.subtitle || `출석부${groupIndex + 1}`)
      .replace(/[\\/?*[\]:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 27) || `출석부${groupIndex + 1}`
    let sheetName = baseName
    let suffix = 2
    while (usedSheetNames.has(sheetName)) {
      sheetName = `${baseName.slice(0, 27)}_${suffix}`
      suffix += 1
    }
    usedSheetNames.add(sheetName)
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  })
  return window.electron.saveFileDialog(
    `${fileName.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`,
    workbookBytes(workbook),
  )
}
