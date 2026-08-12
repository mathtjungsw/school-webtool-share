import { parseVolunteerPdfFile } from '../electron/main/volunteer-pdf'

const input = process.argv[2]
if (!input) throw new Error('검증할 봉사활동 확인서 PDF 경로가 필요합니다.')

async function main() {
const result = await parseVolunteerPdfFile(input)
if (result.pageCount !== 7) throw new Error(`페이지 수가 다릅니다: ${result.pageCount}`)
if (result.analysisMode !== 'ocr') throw new Error(`스캔 PDF가 OCR로 판정되지 않았습니다: ${result.analysisMode}`)
if (result.forms.length !== 7) throw new Error(`확인서 수가 다릅니다: ${result.forms.length}`)

const expectedCounts = [31, 31, 31, 30, 30, 29, 28]
console.log('COUNTS', result.forms.map(form => form.participants.length))
result.forms.forEach((form, index) => {
  if (form.participants.length !== expectedCounts[index]) {
    throw new Error(`${index + 1}쪽 인식 인원이 다릅니다: ${form.participants.length}/${expectedCounts[index]}`)
  }
})

console.log(JSON.stringify({
  pageCount: result.pageCount,
  analysisMode: result.analysisMode,
  averageConfidence: result.averageConfidence,
  warnings: result.warnings,
  forms: result.forms.map(form => ({
    page: form.formIndex + 1,
    activity: form.activityContent,
    date: form.startDate,
    students: form.participants.length,
    first: form.participants[0],
    last: form.participants.at(-1),
  })),
}, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
