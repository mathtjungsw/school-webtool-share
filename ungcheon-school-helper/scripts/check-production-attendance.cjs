const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const today = '2026-11-25'
const staff = [
  { id: 'h1', name: '시험담임', homeroom: '3-1', position: '교사' },
  { id: 'h2', name: '다른담임', homeroom: '3-2', position: '교사' },
  { id: 'h101', name: '일학년담임', homeroom: '1학년 1반', position: '교사' },
  { id: 'h201', name: '이학년담임', homeroom: '201', position: '교사' },
  { id: 's1', name: '시험교과', position: '교사' },
  { id: 's2', name: '다른교과', position: '교사' },
  { id: 'sub', name: '시험대강', position: '교사' },
  { id: 'p', name: '시험교장', position: '교장' },
  { id: 'v', name: '시험교감', position: '교감' },
]
const roster = ['1','2'].flatMap(className => [1,2].map(number => ({
  studentId: `30${className}0${number}`, grade: '3', className, number: String(number), name: `학생${className}${number}`,
})))
for (const grade of ['1','2']) {
  for (const number of ['1','2']) roster.push({
    grade, className: '1', number, studentId: `${grade}10${number}`, name: `${grade}학년학생${number}`,
  })
}
const classSlot = (teacher, classroom) => ({ teacher, classroom, subject: '미적분', selectedCourse: false })
const courseSlot = (teacher, classroom, subject) => ({ teacher, classroom, subject, group: '1', selectedCourse: true })
const personal = roster.filter(student => student.grade === '3' || student.number === '1').map(student => {
  if (student.grade !== '3') return { student, slots: { 수2: courseSlot('시험교과','과학실','물리학') } }
  const one = student.className === '1' ? classSlot('시험담임','3-1') : classSlot('다른담임','3-2')
  const move = student.number === '1' ? courseSlot('시험교과','과학실','물리학') : courseSlot('다른교과','사회실','사회문화')
  return { student, slots: { 수1: one, 수2: move, 수3: move } }
})
function teacherSchedule(name, values) {
  const slots = Array.from({ length: 35 }, () => ({ value: '' }))
  Object.entries(values).forEach(([period, value]) => { slots[13 + Number(period)] = { value } })
  return { name, slots }
}
const timetable = { teachers: [
  teacherSchedule('시험담임', {1:'3-1\n미적분'}), teacherSchedule('다른담임', {1:'3-2\n미적분'}),
  teacherSchedule('일학년담임', {1:'101\n공통수학',5:'1-01반\n공통수학'}),
  teacherSchedule('이학년담임', {1:'2학년 1반\n문학',5:'201\n문학'}),
  teacherSchedule('시험교과', {2:'과학실\n물리학',3:'과학실\n물리학'}), teacherSchedule('다른교과', {2:'사회실\n사회문화',3:'사회실\n사회문화'}),
], pulledLessons: [] }
const changes = [{ kind:'substitution',status:'approved',originalTeacher:'다른교과',replacementTeacher:'시험대강',originalDate:today,originalSlotIndex:16,originalClass:'사회실',originalSubject:'사회문화' }]
const documents = new Map()
let commitCount = 0
const repo = {
  get: key => documents.get(key) || null,
  batchGet: keys => keys.map(key => documents.get(key) || null),
  commit: changes => {
    commitCount++
    changes.forEach(change => {
      const before = documents.get(change.path)
      assert.equal(Boolean(before), !change.createOnly)
      if (before) assert.equal(change.updateTime, before.updateTime)
      documents.set(change.path, { path: change.path, data: change.data, updateTime: String(++sequence) })
    })
  },
}
let sequence = 0
const context = vm.createContext({
  Utilities: { formatDate: () => today },
  migrationHash_: value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  migrationPrimaryConfig_: () => ({ phase: 'FIRESTORE' }), migrationBackendContext_: { revision: 1 },
  migrationPrimaryRepository_: () => repo,
  staffRequire_: body => {
    if (body.staffToken !== 'test-desktop') throw Error('인증 필요')
    return { name: '시험담임' }
  },
  ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
})
for (const file of ['Code.gs','AttendanceAssignments.gs','AttendanceOperations.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../server',file), 'utf8'), context, { filename: file })
}
context.getTimetable_ = () => timetable
context.listTimetableChanges_ = () => changes
context.attendanceStaffMembers_ = () => staff
context.mobileAssertAccess_ = body => {
  if (!body.viewerName || body.accessToken !== 'test-' + body.viewerName) throw Error('인증 필요')
  return body.viewerName
}
context.executiveIdentity_ = viewer => {
  if (!['시험교장','시험교감'].includes(viewer)) throw Error('보호 메뉴 권한 필요')
  return { name: viewer }
}
context.executiveAssertAccess_ = body => {
  if (!['시험교장','시험교감'].includes(body.viewerName) || body.accessToken !== 'test-protected') throw Error('보호 메뉴 인증 필요')
}
const dataset = { staff, roster, personal, timetable, changes, overrides: [], pulled: [] }
context.attendanceScope_ = (date, period) => context.attendanceBuildScope_(date, period, dataset)
const normalized = value => JSON.parse(JSON.stringify(value))
const post = (body) => context.doPost({ postData: { contents: JSON.stringify(body) } })
const home = { staffToken: 'test-desktop', date: today, period: 2, role: 'homeroom', group: '3-1' }
const mobile = name => ({ viewerName: name, accessToken: 'test-' + name, date: today, period: 2 })
const options = (body) => normalized(post({ ...body, role: undefined, group: undefined, action: 'attendanceOptions' }).data)

assert.equal(post({ action: 'attendanceInfo' }).ok, false)
assert.deepEqual(normalized(post({ ...home, action: 'attendanceInfo' }).data.access.roles), ['homeroom','subject'])
assert.deepEqual(options(home).classes.map(item=>item.id), ['3-1'])
assert.equal(options(home).lessons.length,0)
const physics = options(mobile('시험교과')).lessons
assert.deepEqual(physics.map(lesson => lesson.grade).sort(), ['1','2','3'])
assert.equal(new Set(physics.map(lesson => lesson.id)).size, 3)
assert.ok(physics.every(lesson => lesson.subject === '물리학' && lesson.kind === '이동수업' && lesson.teacherIds === undefined))
const physicsThird = physics.find(lesson => lesson.grade === '3')
assert.equal(physicsThird.id, 'c-' + context.migrationHash_([today, 2, true, '1', '물리학', '과학실']).slice(0, 40))
assert.equal(post({ ...home, group:'3-2', action:'attendanceBoard' }).ok,false)
assert.equal(post({ ...mobile('다른교과'), role:'subject', group:physicsThird.id, action:'attendanceBoard' }).ok,false)
assert.equal(options({ ...mobile('다른교과'), period:3 }).lessons.length,0)
assert.deepEqual(normalized(post({ ...mobile('시험대강'), action:'attendanceInfo' }).data.access.roles), ['subject'])
assert.equal(options({ ...mobile('시험대강'), period:3 }).lessons[0].change,'대강')
assert.equal(options({ ...home, period:1 }).lessons[0].kind,'학급수업')
assert.equal(options({ ...mobile('시험교과'), period:5 }).lessons.length,0)

const classBoard = post({ ...home, action:'attendanceBoard' }).data
assert.equal(classBoard.rows.length,2)
assert.ok(classBoard.rows.every(row => row.classId === '3-1' && !('studentId' in row)))
const row = classBoard.rows[0]
const course = { ...mobile('시험교과'), role:'subject', group:physicsThird.id }
const postRecord = (who, field, value) => post({ ...who, action:'attendanceRecord', student:row.id, field, value })
assert.equal(postRecord(home,'homeroom','출석').ok,true)
assert.equal(postRecord(home,'note','시험 비고').ok,true)
assert.equal(postRecord(course,'subject','결석').ok,true)
assert.equal(postRecord(course,'note','수정 시도').ok,false)
assert.deepEqual(normalized(post({ ...course, action:'attendanceBoard' }).data.records[row.id]), { note:'시험 비고',homeroom:'출석',subject:'결석' })
assert.equal(post({ ...course, date:'2026-11-24', action:'attendanceBoard' }).ok,false)
const fresh = post({ ...course, action:'attendanceBoard' }).data
assert.equal(post({ ...course, action:'attendanceBoard', ifRevision:fresh.revision }).data.notModified,true)
const whole = (where, field, extra = {}) => post({ ...where, action:'attendanceRecord', allPresent:true, field, ...extra })
assert.equal(whole(course,'homeroom').ok,false)
assert.equal(whole({ ...home, group:'3-2' },'homeroom').ok,false)
assert.equal(whole(course,'subject',{allPeriods:true}).ok,false)
const beforeCourse = commitCount
assert.equal(whole(course,'subject').data.students.length,2)
assert.equal(commitCount,beforeCourse + 1)
assert.equal(whole(course,'subject').ok,true)
assert.equal(commitCount,beforeCourse + 1)
assert.deepEqual(normalized(post({ ...course, action:'attendanceBoard' }).data.records[row.id]), { note:'시험 비고',homeroom:'출석',subject:'출석' })

const daily = { ...home, allPeriods:'true' }
const initialDay = post({ ...daily, action:'attendanceBoard' }).data
assert.equal(initialDay.students.length,2)
assert.ok(initialDay.students.every(student => Object.keys(student.periods).length === 7))
assert.equal(initialDay.students[0].note,'시험 비고')
assert.equal(initialDay.students[0].periods[2].subject,'출석')
assert.equal(initialDay.students[0].periods[5].exception,'수업 없음')
assert.equal(post({ ...daily, action:'attendanceBoard', ifRevision:initialDay.revision }).data.notModified,true)
const beforeStudent = commitCount
assert.deepEqual(normalized(whole(daily,'homeroom',{student:row.id}).data.updates.map(item => item.period)),[1,2,3,4])
assert.equal(commitCount,beforeStudent + 1)
const studentDay = post({ ...daily, action:'attendanceBoard' }).data
assert.equal(studentDay.students[0].periods[1].homeroom,'출석')
assert.equal(studentDay.students[1].periods[1].homeroom,undefined)
assert.equal(whole(daily,'homeroom',{student:'outside-class'}).ok,false)
const beforeClass = commitCount
assert.ok(whole(daily,'homeroom').data.updates.every(item => item.students.length === 2))
assert.equal(commitCount,beforeClass + 1)
assert.equal(whole(daily,'homeroom').ok,true)
assert.equal(commitCount,beforeClass + 1)
const finishedDay = post({ ...daily, action:'attendanceBoard' }).data
assert.ok(finishedDay.students.every(student => student.periods[4].homeroom === '출석' && student.periods[5].homeroom === undefined))
assert.equal(finishedDay.students[0].periods[2].subject,'출석')
assert.equal(finishedDay.students[0].note,'시험 비고')

const bulk = (where, field, bulkValue, student) => post({ ...where, action:'attendanceRecord', field, bulkValue, student })
assert.equal(bulk(daily,'homeroom','결석').ok,false)
assert.equal(bulk(course,'subject','결석').ok,false)
assert.equal(bulk(course,'homeroom','미확인').ok,false)
assert.equal(bulk(daily,'homeroom','결석','outside-class').ok,false)
assert.equal(bulk(daily,'homeroom','결석',row.id).ok,true)
const afterAbsence = post({ ...daily, action:'attendanceBoard' }).data
assert.equal(afterAbsence.students[0].periods[4].homeroom,'결석')
assert.equal(afterAbsence.students[1].periods[4].homeroom,'출석')
assert.equal(afterAbsence.students[0].periods[2].subject,'출석')
assert.equal(bulk(daily,'homeroom','미확인',row.id).ok,true)
assert.equal(post({ ...daily, action:'attendanceBoard' }).data.students[0].periods[4].homeroom,'미확인')
assert.equal(bulk(daily,'homeroom','미확인').ok,true)
const afterReset = post({ ...daily, action:'attendanceBoard' }).data
assert.ok(afterReset.students.every(student => student.periods[4].homeroom === '미확인' && student.periods[5].homeroom === undefined))
assert.equal(afterReset.students[0].note,'시험 비고')
assert.equal(afterReset.students[0].periods[2].subject,'출석')
assert.equal(bulk(course,'subject','미확인').data.value,'미확인')
assert.equal(post({ ...course, action:'attendanceBoard' }).data.records[row.id].subject,'미확인')

for (const [grade, name] of [['1','일학년담임'],['2','이학년담임']]) {
  const teacher = mobile(name)
  assert.deepEqual(options(teacher).classes.map(item => item.id), [grade + '-1'])
  const lesson = physics.find(item => item.grade === grade)
  const group = { ...mobile('시험교과'), group:lesson.id, role:'subject' }
  const elective = post({ ...group, action:'attendanceBoard' }).data
  assert.deepEqual(normalized(elective.rows.map(student => [student.classId, student.number])), [[grade + '-1', 1]])
  assert.equal(post({ ...group, student:row.id, field:'subject', value:'결석', action:'attendanceRecord' }).ok,false)
  for (const period of [1,5]) {
    const classLesson = options({ ...teacher, period }).lessons[0]
    assert.equal(classLesson.kind,'학급수업')
    assert.equal(classLesson.grade,grade)
    const classGroup = { ...teacher, period, group:classLesson.id, role:'subject' }
    const classRows = post({ ...classGroup, action:'attendanceBoard' }).data.rows
    assert.deepEqual(normalized(classRows.map(student => [student.classId, student.number])), [[grade + '-1',1],[grade + '-1',2]])
    assert.equal(post({ ...classGroup, student:classRows[0].id, field:'subject', value:'출석', action:'attendanceRecord' }).ok,true)
  }
}
const thirdAfternoon = post({ ...home, period:5, action:'attendanceBoard' }).data
assert.ok(thirdAfternoon.rows.every(student => student.exception === '수업 없음' && !student.lesson))
assert.equal(post({ ...home, period:5, student:row.id, field:'homeroom', value:'출석', action:'attendanceRecord' }).ok,false)

const varied = context.attendanceBuildScope_(today, 5, { ...dataset, overrides: [
  { active:true, date:today, targetGrade:'1', targetClass:'1', targetPeriod:5, action:'clear' },
  { active:true, date:today, targetGrade:'2', targetClass:'1', targetPeriod:5, action:'copy', sourceDate:today, sourcePeriod:1 },
] })
assert.ok(varied.rows.filter(student => student.classId === '1-1').every(student => student.exception === '수업 없음'))
assert.ok(varied.rows.filter(student => student.classId === '2-1').every(student => student.lesson?.change === '시간표 변경'))
const noFirstElectives = { ...dataset, personal: personal.filter(item => item.student.grade !== '1') }
assert.deepEqual(normalized(context.attendanceBuildScope_(today, 2, noFirstElectives).electiveRosterGrades), ['2','3'])
for (const name of ['시험교장','시험교감']) {
  const plain = mobile(name)
  const elevated = { ...plain, executiveToken:'test-protected' }
  assert.equal(post({ ...plain, action:'attendanceInfo' }).data.access.requiresExecutive,true)
  assert.equal(post({ ...plain, action:'attendanceOptions' }).ok,false)
  assert.deepEqual(options(elevated).classes.map(item => item.id), ['1-1','2-1','3-1','3-2'])
  assert.equal(options(elevated).lessons.length,4)
  assert.equal(postRecord({ ...home, ...elevated, staffToken:undefined },'note','수정 시도').ok,false)
  assert.equal(post({ ...daily, ...elevated, staffToken:undefined, action:'attendanceBoard' }).data.students.length,2)
  assert.equal(whole({ ...daily, ...elevated, staffToken:undefined },'homeroom').ok,false)
  assert.equal(bulk({ ...daily, ...elevated, staffToken:undefined },'homeroom','미확인').ok,false)
}
console.log('PASS all grade assignments, daily homeroom and class or student bulk attendance with atomic scoped writes')
