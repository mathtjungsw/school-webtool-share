import * as XLSX from 'xlsx'
import { canonicalStudentId, studentIdsMatch, studentIdParts } from '../src/services/studentId'
import { normalizeSharedStudentRoster } from '../src/services/rosterAttendance'
import { normalizeSharedStudentTimetable } from '../src/services/studentTimetable'
import { buildVolunteerRosterTemplate, compareVolunteerRosterSources, parseNeisVolunteerWorkbook, parseRosterWorkbook } from '../src/services/volunteerWork'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const cases = [
  ['10101', '1101'],
  ['20101', '2101'],
  ['30101', '3101'],
  ['1101', '1101'],
  [' 201-01 ', '2101'],
] as const

for (const [input, expected] of cases) {
  assert(canonicalStudentId(input) === expected, `${input} → ${expected} 정규화 실패`)
}
assert(studentIdsMatch('10101', '1101'), '4자리·5자리 학번 검색 호환 실패')
assert(studentIdParts('20117').className === '1', '반 추출 실패')
assert(studentIdParts('20117').number === '17', '번호 추출 실패')

const normalizedRoster = normalizeSharedStudentRoster({
  version: 1, uploadedBy: '', uploadedAt: '', sourceFileName: '',
  students: [{
    studentId: '20117', name: '테스트', gender: '', remark: '삭제', grade: '2', className: '01',
    number: '17', homeroomTeacher: '', assistantTeacher: '',
  }],
})
assert(normalizedRoster?.students[0].studentId === '2117', '공유 학생 명렬 4자리 변환 실패')
assert(normalizedRoster?.students[0].remark === '', '학생 비고 제거 실패')

const normalizedTimetable = normalizeSharedStudentTimetable({
  version: 1, uploadedBy: '', uploadedAt: '', title: '', semester: '', studentCount: 1, classCount: 1, courseCount: 0,
  students: [{
    student: { studentId: '10103', name: '테스트', grade: '1', className: '01', classLabel: '1-1', number: '3', enrollmentCount: 0 },
    slots: {}, selections: [], warnings: [],
  }],
})
assert(normalizedTimetable?.students[0].student.studentId === '1103', '공유 학생 시간표 4자리 변환 실패')

const templateBytes = buildVolunteerRosterTemplate()
const workbook = XLSX.read(Uint8Array.from(templateBytes), { type: 'array' })
assert(workbook.SheetNames[0] === '봉사활동 명단', '봉사활동 명단 시트명 오류')
const sheet = workbook.Sheets[workbook.SheetNames[0]]
assert(String(sheet.A4?.v) === '학번(4자리)', '봉사활동 명단 학번 헤더 오류')
assert(String(sheet.B4?.v) === '이름', '봉사활동 명단 이름 헤더 오류')
assert(String(sheet.C4?.v) === '실제 시수', '봉사활동 명단 시수 헤더 오류')
sheet.A5 = { t: 's', v: '10101' }
sheet.B5 = { t: 's', v: '홍길동' }
sheet.C5 = { t: 'n', v: 2 }
const filledOutput = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
const filledBytes = Array.from(new Uint8Array(filledOutput))
const parsed = parseRosterWorkbook(filledBytes)
assert(parsed.length === 1, '봉사활동 명단 양식 재불러오기 인원 오류')
assert(parsed[0].studentId === '1101', '봉사활동 양식 5자리→4자리 변환 실패')
assert(parsed[0].name === '홍길동' && parsed[0].hours === 2, '봉사활동 양식 이름·시수 재불러오기 실패')

const neisSheet = XLSX.utils.aoa_to_sheet([
  [],
  ['', '', '', '', '봉사활동 누가기록'],
  ['2026학년도 1학년 공통과정 1반'],
  ['번호', '성명', '시작일', '종료일', '영역구분', '봉사활동 내용', '장소또는주관기관명', '시간', '시간누계'],
  [1, '강보경', '2026.04.01.', '2026.07.15.', '', '과학탐구실험 수업 교사 지원', '(학교)웅천고등학교', 10, 10],
  ['', '', '2026.04.09.', '', '자율·자치활동', '봉사활동 소양 교육', '(학교)웅천고등학교', 1, 11],
  [10, '박찬주', '2026.04.09.', '', '자율·자치활동', '봉사활동 소양 교육', '(학교)웅천고등학교', 1, 1],
])
neisSheet.A5 = { t: 'n', v: 1, w: '1.0' }
neisSheet.A7 = { t: 'n', v: 10, w: '10.0' }
const neisWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(neisWorkbook, neisSheet, 'sheet1')
const neisOutput = XLSX.write(neisWorkbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
const neisRecords = parseNeisVolunteerWorkbook(Array.from(new Uint8Array(neisOutput)))
assert(neisRecords[0].studentId === '1101', '나이스 1학년 1반 1번 → 1101 변환 실패')
assert(neisRecords[1].studentId === '1101', '나이스 병합·빈 번호 행의 이전 학번 유지 실패')
assert(neisRecords[2].studentId === '1110', '나이스 1학년 1반 10번 → 1110 변환 실패')

const comparison = compareVolunteerRosterSources([{
  id: 'neis-1', originalName: '1-1.xlsx', importedAt: '', sha256: 'test', recordCount: 4, studentCount: 3,
  records: [
    { ...neisRecords[0], studentId: '1101', name: '홍길동', activityContent: '도서관 도우미', hours: 1 },
    { ...neisRecords[0], studentId: '1102', name: '김철수', activityContent: '급식 도우미', hours: 2 },
    { ...neisRecords[0], studentId: '1102', name: '김철수', activityContent: '급식 도우미', hours: 2 },
    { ...neisRecords[0], studentId: '1104', name: '박영미', activityContent: '환경 도우미', hours: 1 },
  ],
}], [{
  id: 'hwp-1', originalName: '확인서.hwp', forms: [{
    formIndex: 0, activityName: '도우미', startDate: '', endDate: '', institution: '', area: '', location: '', activityContent: '도서관 도우미', confirmTeacher: '',
    participants: [
      { studentId: '1101', name: '홍길동', hours: 1, remarks: '' },
      { studentId: '1103', name: '이영희', hours: 1, remarks: '' },
      { studentId: '1104', name: '박영희', hours: 1, remarks: '' },
    ],
  }],
}], [
  { studentId: '1101', name: '홍길동' },
  { studentId: '1102', name: '김철수' },
  { studentId: '1103', name: '이영희' },
  { studentId: '1104', name: '박영미' },
])
assert(comparison.rows.find(row => row.studentId === '1101')?.status === 'matched', '누적 명단 정상 일치 판정 실패')
assert(comparison.rows.find(row => row.studentId === '1102')?.status === 'neis-only', '확인서 누락 판정 실패')
assert(comparison.rows.find(row => row.studentId === '1103')?.status === 'hwp-only', '나이스 누락 판정 실패')
assert(comparison.unclassified.find(row => row.studentId === '1104')?.status === 'unclassified', '확인서 학번·이름 미분류 판정 실패')
assert(comparison.rows.filter(row => row.studentId === '1101').length === 1, '일치 활동을 같은 행으로 묶지 못했습니다.')
assert(comparison.duplicates.some(item => item.source === 'neis' && item.studentId === '1102'), '나이스 동일 자료 중복 판정 실패')

const multiActivity = compareVolunteerRosterSources([{
  id: 'neis-many', originalName: '1-1.xlsx', importedAt: '', sha256: 'many', recordCount: 5, studentCount: 1,
  records: [1, 2, 3, 4, 5].map(hours => ({ ...neisRecords[0], studentId: '1101', name: '홍길동', activityContent: `활동 ${hours}`, hours })),
}], [{
  id: 'hwp-many', originalName: '여러활동.hwp', forms: [1, 2].map(hours => ({
    formIndex: hours, activityName: `활동 ${hours}`, startDate: '', endDate: '', institution: '', area: '', location: '', activityContent: `활동 ${hours}`, confirmTeacher: '',
    participants: [{ studentId: '1101', name: '홍길동', hours, remarks: '' }],
  })),
}], [{ studentId: '1101', name: '홍길동' }])
assert(multiActivity.rows.length === 5, '나이스 5개·확인서 2개를 활동별 여러 행으로 펼치지 못했습니다.')
assert(multiActivity.rows.filter(row => row.status === 'matched').length === 2, '내용·시간이 같은 2개 활동을 같은 행에 배치하지 못했습니다.')
assert(multiActivity.rows.filter(row => row.status === 'neis-only').length === 3, '나이스에만 있는 3개 활동을 별도 행으로 배치하지 못했습니다.')

console.log('PASS 4자리 학번 표준화·4/5자리 검색·봉사활동 Excel 양식')
