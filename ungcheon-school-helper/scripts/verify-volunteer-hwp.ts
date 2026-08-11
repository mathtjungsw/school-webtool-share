import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { buildVolunteerCertificateHwp, parseVolunteerHwpBuffer } from '../electron/main/volunteer-hwp'

const project = process.cwd()
const outputDir = join(project, 'tmp', 'volunteer-hwp-verification')
mkdirSync(outputDir, { recursive: true })

for (const count of [5, 20, 30, 50, 65]) {
  const students = Array.from({ length: count }, (_, index) => ({
    studentId: `${Math.floor(index / 30) + 1}${String((index % 8) + 1).padStart(2, '0')}${String((index % 30) + 1).padStart(2, '0')}`,
    name: `검증학생${index + 1}`,
    hours: index % 2 ? 2 : 1.5,
  }))
  const buffer = buildVolunteerCertificateHwp(
    join(project, 'resources', 'templates', 'volunteer-single-source.hwp'),
    join(project, 'resources', 'templates', 'volunteer-double-source.hwp'),
    {
      activityName: '도서관 도우미', startDate: '2026-03-02', endDate: '2026-07-17',
      institution: '웅천고등학교', area: 'neighbor', location: '도서관',
      activityContent: '도서관 정리 및 이용 안내', confirmTeacher: '정승원', schoolName: '웅천고등학교',
      commonRemarks: '', students,
    },
  )
  const forms = parseVolunteerHwpBuffer(buffer)
  const parsed = forms[0]
  if (forms.length !== 1) throw new Error(`${count}명: 확인서가 ${forms.length}개 검출됨`)
  if (parsed.participants.length !== count) throw new Error(`${count}명: 학생 ${parsed.participants.length}명만 재검출됨`)
  parsed.participants.forEach((student, index) => {
    if (student.hours !== students[index].hours) throw new Error(`${count}명 ${index + 1}행: 시수 ${student.hours} != ${students[index].hours}`)
  })
  const target = join(outputDir, `volunteer-${count}.hwp`)
  writeFileSync(target, buffer)
  console.log(`PASS ${count}명 -> ${target}`)
}
