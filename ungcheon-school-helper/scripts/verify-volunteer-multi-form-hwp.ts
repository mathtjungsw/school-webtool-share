import { existsSync } from 'fs'
import { parseVolunteerHwpFile } from '../electron/main/volunteer-hwp'

const fixture = process.env.VOLUNTEER_HWP_FIXTURE

if (!fixture || !existsSync(fixture)) {
  console.log('봉사활동 다중 HWP 회귀검사 생략: VOLUNTEER_HWP_FIXTURE가 없습니다.')
  process.exit(0)
}

const forms = parseVolunteerHwpFile(fixture)
if (forms.length !== 14) throw new Error(`확인서 14개를 예상했지만 ${forms.length}개를 읽었습니다.`)

const song = forms.flatMap(form => form.participants
  .filter(student => student.studentId === '3707' && student.name === '송윤주')
  .map(student => ({ activity: form.activityContent, hours: student.hours })))

const expected = [
  { activity: '졸업앨범 제작 및 학교행사 지원', hours: 20 },
  { activity: '학급 활동 운영 지원 및 보조(반장, 부반장)', hours: 10 },
]

if (JSON.stringify(song) !== JSON.stringify(expected)) {
  throw new Error(`3707 송윤주 학생 판독 결과가 올바르지 않습니다: ${JSON.stringify(song)}`)
}

console.log('봉사활동 다중 HWP 회귀검사 통과: 확인서 14개, 송윤주 활동 2개')
