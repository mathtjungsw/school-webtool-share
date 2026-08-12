import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import JSZip from 'jszip'
import { buildClassVolunteerHwpx, buildClassVolunteerHtml } from '../electron/main/class-volunteer-document'

async function main() {
const outputDir = join(process.cwd(), 'tmp', 'class-volunteer-output-check')
mkdirSync(outputDir, { recursive: true })

const students = Array.from({ length: 29 }, (_, index) => ({
  studentId: `31${String(index + 1).padStart(2, '0')}`,
  name: index === 0 ? '정승원' : `학생${index + 1}`,
  hours: index === 4 ? '결석' : 2,
  remarks: index === 4 ? '결석' : '',
}))
const draft = {
  activityName: '사제동행 교내 환경정화',
  startDate: '2026-08-12',
  endDate: '2026-08-12',
  institution: '웅천고등학교',
  area: 'environment' as const,
  location: '학교 내',
  activityContent: '사제동행 교내 환경정화',
  confirmTeacher: '정승원',
  schoolName: '웅천고등학교',
  commonRemarks: '',
  grade: '3',
  className: '1',
  periodLabel: '5, 6교시',
  certificateDate: '2026-08-12',
  students,
}

const templatePath = join(process.cwd(), 'resources', 'templates', 'class-volunteer-template.hwpx')
const bytes = await buildClassVolunteerHwpx(templatePath, draft)
const outputPath = join(outputDir, '3학년_1반_단체봉사활동확인서.hwpx')
writeFileSync(outputPath, bytes)

const zip = await JSZip.loadAsync(readFileSync(outputPath))
const mimetype = await zip.file('mimetype')?.async('string')
const xml = await zip.file('Contents/section0.xml')?.async('string') || ''
const required = [
  '※ 3학년용', '웅천고등학교 ( 3 )학년 ( 1 )반', '총원 29명 중, 28명 참가',
  '2026 년     8월    12일', '5, 6교시', '사제동행 교내 환경정화',
  '정승원', '결석', '2026.   8.  12.',
]
if (mimetype !== 'application/hwp+zip') throw new Error(`잘못된 HWPX mimetype: ${mimetype}`)
for (const text of required) if (!xml.includes(text)) throw new Error(`HWPX 누락 문구: ${text}`)
if (bytes.length < 30_000) throw new Error(`HWPX 크기가 비정상입니다: ${bytes.length}`)

const html = buildClassVolunteerHtml(draft)
for (const text of ['총원 29명 중, 28명 참가', '학생29', '결석']) {
  if (!html.includes(text)) throw new Error(`인쇄 문서 누락 문구: ${text}`)
}
writeFileSync(join(outputDir, 'class-volunteer-preview.html'), html, 'utf8')
console.log(`PASS 반별 HWPX ${bytes.length} bytes · 원본 구조 유지 · 29명/결석 처리 · PDF/인쇄 HTML 정상`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
