import assert from 'node:assert/strict'
import {
  areSameTeachingSubject,
  rankSubstitutionCandidates,
} from '../src/services/timetablePlan'
import type { StaffMember } from '../src/services/rosterAttendance'
import type { TeacherTimetable } from '../src/services/schoolTimetable'

assert.equal(areSameTeachingSubject('국어', '국어'), true)
assert.equal(areSameTeachingSubject('물리', '화학'), true)
assert.equal(areSameTeachingSubject('생명과학', '지구과학'), true)
assert.equal(areSameTeachingSubject('지리', '윤리'), true)
assert.equal(areSameTeachingSubject('수학', '영어'), false)
assert.equal(areSameTeachingSubject('과학', '사회'), false)

const emptySlot = { value: '', locked: false }
const teachers: TeacherTimetable[] = [
  { name: '선택 교사', label: '선택 교사', load: '', slots: [emptySlot] },
  { name: '영어 교사', label: '영어 교사', load: '', slots: [emptySlot] },
  { name: '수학 교사', label: '수학 교사', load: '', slots: [emptySlot] },
  { name: '미등록 교사', label: '미등록 교사', load: '', slots: [emptySlot] },
]
const staffMembers: StaffMember[] = [
  { id: '1', name: '선택 교사', position: '교사', department: '', subject: '수학', homeroom: '' },
  { id: '2', name: '영어 교사', position: '교사', department: '', subject: '영어', homeroom: '' },
  { id: '3', name: '수학 교사', position: '교사', department: '', subject: '수학', homeroom: '' },
]

const ranked = rankSubstitutionCandidates([1, 2, 3], teachers[0], teachers, staffMembers)
assert.deepEqual(ranked.map(candidate => candidate.teacherIndex), [2, 1, 3])
assert.equal(ranked[0].isSameSubject, true)
assert.equal(ranked[1].isSameSubject, false)
assert.equal(ranked[0].teacherSubject, '수학')

const withoutRoster = rankSubstitutionCandidates([3, 1], teachers[0], teachers, [])
assert.deepEqual(withoutRoster.map(candidate => candidate.teacherIndex), [3, 1])

console.log('동교과 대강 후보 판정·정렬 테스트 11건 통과')
