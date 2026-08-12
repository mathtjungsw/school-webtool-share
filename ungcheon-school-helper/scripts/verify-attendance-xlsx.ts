import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as XLSX from 'xlsx'
import { buildAttendanceRosterWorkbookBytes, type AttendanceRosterPrintGroup } from '../src/services/rosterAttendance'

const outputDir = join(process.cwd(), 'tmp', 'attendance-xlsx-check')
mkdirSync(outputDir, { recursive: true })

const group: AttendanceRosterPrintGroup = {
  title: '2026학년도 수업 출석부',
  subtitle: '일본어 · 정승원',
  date: '2026-08-12',
  students: [
    { studentId: '2101', name: '학생가', gender: '', remark: '', grade: '2', className: '1', number: '1', homeroomTeacher: '', assistantTeacher: '' },
    { studentId: '2102', name: '학생나', gender: '', remark: '', grade: '2', className: '1', number: '2', homeroomTeacher: '', assistantTeacher: '' },
  ],
}

const bytes = buildAttendanceRosterWorkbookBytes([group])
if (bytes.length < 10_000) throw new Error(`출석부 XLSX 크기가 비정상입니다: ${bytes.length} bytes`)
if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('출석부 XLSX가 ZIP/OOXML 형식이 아닙니다.')

const filePath = join(outputDir, 'attendance-test.xlsx')
writeFileSync(filePath, Buffer.from(bytes))
const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer' })
if (workbook.SheetNames.length !== 1) throw new Error(`시트 수가 올바르지 않습니다: ${workbook.SheetNames.length}`)
const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })
if (rows[0]?.[0] !== group.title || rows[4]?.[2] !== '학생가') throw new Error('출석부 내용 검증에 실패했습니다.')
console.log(`PASS 출석부 XLSX ${bytes.length} bytes · ${workbook.SheetNames[0]} · Excel OOXML 정상`)
