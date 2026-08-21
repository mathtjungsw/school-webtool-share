import assert from 'node:assert/strict'
import { compareVolunteerRosterSources, normalizeVolunteerDateRange, volunteerDateRangesMatch, type ParsedVolunteerForm, type StoredVolunteerNeisDataset } from '../src/services/volunteerWork'

const neis: StoredVolunteerNeisDataset[] = [{
  id: 'neis', originalName: 'neis.xlsx', importedAt: '', sha256: '', recordCount: 1, studentCount: 1,
  records: [{ studentId: '1201', name: '실제이름', startDate: '2026-04-09', endDate: '2026-04-09', area: '', activityContent: '봉사활동 소양교육', institution: '', hours: 1, sourceRow: 5 }],
}]
const form: ParsedVolunteerForm = {
  formIndex: 0, activityName: '봉사활동 소양교육', startDate: '2026-04-09', endDate: '2026-04-09', institution: '', area: '', location: '', activityContent: '봉사활동 소양교육', confirmTeacher: '',
  participants: [{ studentId: '1201', name: 'OCR오타', hours: 1, remarks: '' }],
}
const roster = [{ studentId: '1201', name: '실제이름' }]
const before = compareVolunteerRosterSources(neis, [{ id: 'hwp', originalName: 'scan.pdf', forms: [form] }], roster)
assert.equal(before.unclassified.length, 1)
assert.deepEqual(before.unclassified[0].correctionTarget, { sourceId: 'hwp', formIndex: 0, participantIndex: 0 })

form.participants[0] = { ...form.participants[0], name: '실제이름', correctionNote: '이름 맞춤: OCR오타 → 실제이름' }
const after = compareVolunteerRosterSources(neis, [{ id: 'hwp', originalName: 'scan.pdf', forms: [form] }], roster)
assert.equal(after.unclassified.length, 0)
assert.equal(after.rows[0].status, 'matched')
assert.match(after.rows[0].message, /수기 수정/)
assert.deepEqual(normalizeVolunteerDateRange('2026. 6. 11.', ''), { startDate: '2026-06-11', endDate: '2026-06-11' })
assert(volunteerDateRangesMatch('2026년 6월 11일', '', '2026/06/11', '2026/06/11'))
form.startDate = '2026. 4. 9.'
form.endDate = ''
const sameDay = compareVolunteerRosterSources(neis, [{ id: 'hwp', originalName: 'same-day.pdf', forms: [form] }], roster)
assert.equal(sameDay.rows[0].status, 'matched')
form.startDate = '2026-04-10'
const differentDay = compareVolunteerRosterSources(neis, [{ id: 'hwp', originalName: 'different-day.pdf', forms: [form] }], roster)
assert.equal(differentDay.rows.filter(row => row.status === 'neis-only').length, 1)
assert.equal(differentDay.rows.filter(row => row.status === 'hwp-only').length, 1)
console.log('PASS 미분류 이름 맞춤·수정 이력·반 탭 복귀용 메타데이터')
