const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { buildSync } = require('esbuild')

const root = path.resolve(__dirname, '..')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ungcheon-student-location-'))
const bundle = path.join(tempDir, 'studentSpecificLocator.cjs')

try {
  buildSync({
    entryPoints: [path.join(root, 'src/services/studentSpecificLocator.ts')],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    logLevel: 'silent',
  })
  const service = require(bundle)
  const emptySlots = () => {
    const slots = {}
    for (const day of ['월', '화', '수', '목', '금']) for (let period = 1; period <= 7; period += 1) slots[`${day}${period}`] = { day, period, subject: '', teacher: '', classroom: '', raw: '', selectedCourse: false }
    return slots
  }
  const student = (studentId, name, className) => {
    const slots = emptySlots()
    slots['월5'] = { day: '월', period: 5, subject: '미술', teacher: '미술교사', classroom: '미술실', raw: '미술', selectedCourse: false }
    slots['월6'] = { day: '월', period: 6, subject: '영어', teacher: '영어교사', classroom: '영어실', raw: '영어', selectedCourse: false }
    slots['월7'] = { day: '월', period: 7, subject: '수학', teacher: '수학교사', classroom: '', raw: '수학', selectedCourse: false }
    return { student: { studentId, name, grade: '2', className, classLabel: `2-${Number(className)}`, number: studentId.slice(-2), enrollmentCount: 0 }, slots, selections: [], warnings: [] }
  }
  const rosterStudent = (studentId, name, className) => ({ studentId, name, gender: '', remark: '', grade: '2', className, number: studentId.slice(-2), homeroomTeacher: '', assistantTeacher: '' })
  const dataset = { version: 1, title: 'test', semester: '2', studentCount: 3, classCount: 3, courseCount: 0, uploadedBy: 'test', uploadedAt: '', students: [student('2201', '김예은', '2'), student('2501', '박지은', '5'), student('2601', '김예은', '6')] }
  const roster = { version: 1, uploadedBy: 'test', uploadedAt: '', sourceFileName: 'test.xlsx', students: [rosterStudent('2201', '김예은', '2'), rosterStudent('2501', '박지은', '5'), rosterStudent('2601', '김예은', '6')] }
  const base = { date: '2026-08-31', dataset, roster, schoolTimetable: null, sharedNeis: null, changes: [] }

  const byId = service.buildStudentSpecificLocationRows({ ...base, inputs: [{ rowNumber: 2, studentId: '20201', name: '' }], periods: [5, 6, 7] })
  assert.equal(byId.length, 3)
  assert.deepEqual(byId.map(row => row.subject), ['미술', '영어', '수학'])
  assert.ok(byId.every(row => row.confirmedStudentId === '2201'))

  const homonyms = service.buildStudentSpecificLocationRows({ ...base, inputs: [{ rowNumber: 2, studentId: '', name: '김예은' }], periods: [5] })
  assert.equal(homonyms.length, 2)
  assert.ok(homonyms.every(row => row.validation === 'homonym'))

  const mismatch = service.buildStudentSpecificLocationRows({ ...base, inputs: [{ rowNumber: 2, studentId: '2201', name: '박지은' }], periods: [5] })
  assert.equal(mismatch.length, 2)
  assert.ok(mismatch.every(row => row.validation === 'mismatch'))

  const change = { id: 'change-1', kind: 'substitution', originalSlotIndex: 4, replacementSlotIndex: 4, originalDate: '2026-08-31', replacementDate: '2026-08-31', originalTeacher: '미술교사', replacementTeacher: '대강교사', originalClass: '202', replacementClass: '202', originalSubject: '미술', replacementSubject: '미술', note: '', createdAt: '', requesterName: '미술교사', targetTeacherName: '대강교사', status: 'approved', respondedAt: '', responderName: '', requesterAppliedAt: '' }
  const changed = service.buildStudentSpecificLocationRows({ ...base, inputs: [{ rowNumber: 2, studentId: '2201', name: '김예은' }], periods: [5], changes: [change] })
  assert.equal(changed[0].teacher, '대강교사')
  assert.equal(changed[0].scheduleState, 'changed')

  const pending = service.buildStudentSpecificLocationRows({ ...base, inputs: [{ rowNumber: 2, studentId: '2201', name: '김예은' }], periods: [5], changes: [{ ...change, status: 'pending' }] })
  assert.equal(pending[0].scheduleState, 'review')
  assert.match(pending[0].scheduleLabel, /승인 대기/)

  const templateBytes = service.buildStudentLocationTemplateWorkbookBytes()
  assert.ok(templateBytes.length > 1000)
  const templateRows = service.parseStudentLocationInputWorkbook(Uint8Array.from(templateBytes))
  assert.equal(templateRows.length, 2)
  const resultBytes = service.buildStudentLocationResultWorkbookBytes([...byId, ...changed], base.date, [5, 6, 7])
  assert.ok(resultBytes.length > 2000)
  if (process.env.STUDENT_LOCATION_QA_DIR) {
    fs.mkdirSync(process.env.STUDENT_LOCATION_QA_DIR, { recursive: true })
    fs.writeFileSync(path.join(process.env.STUDENT_LOCATION_QA_DIR, 'student-location-template.xlsx'), Buffer.from(templateBytes))
    fs.writeFileSync(path.join(process.env.STUDENT_LOCATION_QA_DIR, 'student-location-result.xlsx'), Buffer.from(resultBytes))
  }

  const search = fs.readFileSync(path.join(root, 'src/services/workAssistantSearch.ts'), 'utf8')
  const third = structuredClone(dataset.students[0])
  third.student = { ...third.student, studentId: '3101', grade: '3', className: '1', classLabel: '3-1' }
  third.slots['월4'] = { ...third.slots['월5'], period: 4 }
  const thirdDataset = { ...dataset, students: [third] }
  const queryThird = date => service.buildStudentSpecificLocationRows({
    ...base, date, dataset: thirdDataset, roster: null,
    inputs: [{ rowNumber: 2, studentId: '3101', name: '' }], periods: [4, 5, 6, 7],
  })
  assert.ok(queryThird('2026-11-16').every(row => row.subject))
  const after = queryThird('2026-11-23')
  assert.ok(after[0].subject)
  assert.ok(after.slice(1).every(row => row.subject === '수업 없음' && row.scheduleState === 'no_lesson'))
  console.log('PASS 3학년 오전 수업 유지, 오후 위치 없음, 변경 전 날짜 보존')

  const calendarBundle = path.join(tempDir, 'teacherTimetableCalendar.cjs')
  buildSync({ entryPoints: [path.join(root, 'src/services/teacherTimetableCalendar.ts')], outfile: calendarBundle, bundle: true, platform: 'node', format: 'cjs', target: 'node18', logLevel: 'silent' })
  const { buildCompositeTeacherDay } = require(calendarBundle)
  const slots = Array.from({ length: 35 }, (_, index) => ({ value: index % 7 === 5 ? '201\n수학' : '301\n국어', locked: false }))
  const school = { teachers: [{ name: '합성교사', slots }] }
  const approved = { ...change, originalDate: '2026-11-23', originalTeacher: '원교사', replacementTeacher: '합성교사', originalClass: '3-1', originalSubject: '승인수업' }
  const pulled = [{ teacherName: '합성교사', date: '2026-11-23', period: 7, classLabel: '3-2', subject: '당김수업' }]
  const day = buildCompositeTeacherDay(school, '합성교사', '2026-11-23', [approved], pulled)
  assert.ok(day.lessons.slice(0, 4).every(lesson => lesson.value))
  assert.deepEqual(day.lessons.slice(4).map(lesson => lesson.value), ['', '201\n수학', ''])
  assert.ok(buildCompositeTeacherDay(school, '합성교사', '2026-11-16').lessons[4].value)
  assert.equal(slots[4].value, '301\n국어')
  console.log('PASS 최종 교사 시간표에서 대강·당김 3학년 오후 제외, 다른 학년과 원본 보존')

  for (const keyword of ['여러 학생 위치 찾기', '특정 날짜 학생 위치', '학생 위치 엑셀', '학생 위치 일괄 조회']) assert.ok(search.includes(keyword), `검색도우미 누락: ${keyword}`)
  console.log('PASS 학생 특정 시간 위치찾기 · 학번 정규화 · 동명이인 · 불일치 · 변경상태 · Excel 왕복')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
