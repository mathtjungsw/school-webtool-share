import { parseDutySheet, type DutyScheduleSource } from '../electron/main/duty-schedule-parser'

const source: DutyScheduleSource = {
  kind: 'meal',
  spreadsheetId: 'test-sheet',
  gid: '1083112532',
  sheetName: '급식 지도(2학기)',
  title: '급식지도',
  time: '12:30~13:10',
  location: '급식실',
}

const html = `<table>
  <tr><td></td><td></td><td>08월 11일</td><td>08월 12일</td></tr>
  <tr><td>급식지도</td><td>12:30~13:10</td><td>배병희, 박민자</td><td>안소정</td></tr>
  <tr><td></td><td></td><td>이미경</td><td>이정용</td></tr>
</table>`

assertDate('배병희', '20260811')
assertDate('박민자', '20260811')
assertDate('이미경', '20260811')
assertDate('안소정', '20260812')
assertDate('이정용', '20260812')

console.log('PASS 급식지도 2인 배정·한 셀 복수 이름 인식')

function assertDate(teacherName: string, expectedDate: string) {
  const events = parseDutySheet(html, source, 2026, 8, teacherName)
  if (events.length !== 1 || events[0]?.date !== expectedDate) {
    throw new Error(`${teacherName} 급식지도 날짜가 올바르지 않습니다: ${JSON.stringify(events)}`)
  }
}
