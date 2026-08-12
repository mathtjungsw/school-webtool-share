import assert from 'node:assert/strict'
import { PULLED_LESSONS_2026 } from '../src/data/pulledLessons2026'
import { listPulledLessonsForTeacher } from '../src/services/pulledLessons'

assert.equal(PULLED_LESSONS_2026.length, 346, '첫 시트의 학급별 당김수업 건수')
assert.equal(new Set(PULLED_LESSONS_2026.map(item => `${item.date}:${item.period}`)).size, 43, '당김수업 날짜·교시 수')

const replacement = PULLED_LESSONS_2026.find(item => item.date === '2026-08-11' && item.classLabel === '3-4')
assert.equal(replacement?.originalTeacherName, '최경희')
assert.equal(replacement?.teacherName, '김중오')
assert.equal(replacement?.substituteTeacherName, '김중오')

const teacherLessons = listPulledLessonsForTeacher('정승원')
assert(teacherLessons.some(item => item.date === '2026-08-12' && item.period === 7 && item.classLabel === '3-3'))
assert(!teacherLessons.some(item => item.date === '2026-08-14' && item.classLabel === '3-1'), '보강 교사가 지정된 수업은 원 담당자에게 표시하지 않음')

console.log(`PASS 당김수업 ${PULLED_LESSONS_2026.length}건 · 날짜·교시 43개 · 정승원 ${teacherLessons.length}건`)
