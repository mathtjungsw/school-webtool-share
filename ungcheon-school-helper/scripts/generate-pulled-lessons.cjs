const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const root = path.resolve(__dirname, '..')
const input = process.argv[2] || path.join(root, 'resources', 'schedules', '2026.2학기 3학년 당김수업(8.11완성).xlsx')
const output = process.argv[3] || path.join(root, 'src', 'data', 'pulledLessons2026.ts')
const workbook = XLSX.readFile(input, { cellDates: true })
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
const headers = rows[2].map(value => String(value).trim())
const lessons = []

function dateValue(value) {
  const match = String(value).match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/)
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : ''
}

for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
  const row = rows[rowIndex]
  const date = dateValue(row[1])
  const periodMatch = String(row[2]).match(/([1-8])\s*교시/)
  if (!date || !periodMatch) continue
  const period = Number(periodMatch[1])
  for (let column = 5; column <= 13; column += 1) {
    const classLabel = headers[column]
    const lines = String(row[column] || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)
    if (!classLabel || lines.length < 2) continue
    const subject = lines[0]
    const originalTeacherName = lines[1].replace(/[()]/g, '').trim()
    const substitute = lines.slice(2).map(value => value.match(/^\(([^)]+)\)$/)?.[1]?.trim()).find(Boolean) || ''
    const teacherName = substitute || originalTeacherName
    lessons.push({
      id: `pulled-${rowIndex + 1}-${column + 1}`,
      date,
      period,
      classLabel,
      subject,
      teacherName,
      originalTeacherName,
      substituteTeacherName: substitute,
      originalSlot: String(row[3] || '').trim(),
      originalDate: dateValue(row[4]),
      note: String(row[14] || '').trim(),
      sourceRow: rowIndex + 1,
    })
  }
}

const source = `// scripts/generate-pulled-lessons.cjs로 원본 Excel 첫 시트에서 생성합니다.\n` +
  `export interface PulledLesson {\n` +
  `  id: string\n  date: string\n  period: number\n  classLabel: string\n  subject: string\n  teacherName: string\n  originalTeacherName: string\n  substituteTeacherName: string\n  originalSlot: string\n  originalDate: string\n  note: string\n  sourceRow: number\n}\n\n` +
  `export const PULLED_LESSONS_2026: PulledLesson[] = ${JSON.stringify(lessons, null, 2)}\n`

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, source, 'utf8')
console.log(`당김수업 ${lessons.length}건 생성: ${output}`)
