const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const [input, destination] = process.argv.slice(2)
if (!input || !destination || path.extname(destination).toLowerCase() !== '.json') {
  throw new Error('원본 XLSX 경로와 공개 저장소 밖의 JSON 출력 경로를 입력하세요.')
}
const repo = fs.realpathSync(path.resolve(__dirname, '..', '..'))
const output = path.join(fs.realpathSync(path.dirname(destination)), path.basename(destination))
const relative = path.relative(repo, output)
if (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
  throw new Error('당김수업 자료는 공개 소스 폴더에 저장할 수 없습니다.')
}
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

fs.writeFileSync(output, JSON.stringify(lessons, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
console.log(`당김수업 ${lessons.length}건 변환 완료`)
