import assert from 'node:assert/strict'
import { applyHelpClassLocation, findHelpClassLesson, HELP_CLASS_SCHEDULES } from '../src/services/helpClassSchedule'
import { getSpecialTimetableDay } from '../src/services/specialTimetableDays'
import type { PersonalTimetableSlot } from '../src/services/studentTimetable'

const student = { grade: '1', className: '01', name: '장 은 재' }
const baseSlot: PersonalTimetableSlot = {
  day: '월', period: 1, subject: '체육', teacher: '담당교사', classroom: '체육관', raw: '체육', selectedCourse: false,
}

assert.equal(HELP_CLASS_SCHEDULES.length, 6, 'HWPX에서 확인한 도움반 학생 6명을 포함해야 합니다.')
assert.equal(HELP_CLASS_SCHEDULES.reduce((sum, item) => sum + item.lessons.length, 0), 58, '비흰색 수업 58칸을 포함해야 합니다.')
assert.equal(findHelpClassLesson(student, '월', 1)?.sourceSubject, '체육', '색칠된 수업을 도움반으로 찾아야 합니다.')
assert.equal(findHelpClassLesson(student, '월', 2), null, '흰색 일반 수업은 도움반으로 처리하면 안 됩니다.')
assert.equal(findHelpClassLesson(student, '목', 5), null, '색칠된 동아리는 도움반으로 처리하면 안 됩니다.')

const located = applyHelpClassLocation(baseSlot, student, '월', 1)
assert.equal(located?.classroom, '도움반')
assert.equal(located && 'helpClass' in located, true)
assert.equal(located && 'originalClassroom' in located ? located.originalClassroom : '', '체육관')
assert.equal(applyHelpClassLocation(baseSlot, student, '월', 2)?.classroom, '체육관')

const special = getSpecialTimetableDay('2026-08-11')
assert.equal(special?.sourceWeekday, '월')
assert.equal(findHelpClassLesson(student, special!.sourceWeekday, 1)?.sourceSubject, '체육', '특별 운영일은 적용 요일로 판정해야 합니다.')

assert.equal(findHelpClassLesson(student, '화', 2)?.sourceSubject, '진로 직업', '쉬는 시간 앞·뒤 판정에 사용할 수 있어야 합니다.')
assert.equal(findHelpClassLesson(student, '화', 4), null, '한쪽만 도움반인 쉬는 시간도 구분되어야 합니다.')

console.log('도움반 시간표 판정 12건 통과')
