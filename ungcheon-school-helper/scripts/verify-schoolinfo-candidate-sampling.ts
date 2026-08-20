import assert from 'node:assert/strict'
import { sampleSchoolInfoCandidates } from '../src/services/schoolInfoCandidates'

const schools = Array.from({ length: 60 }, (_, index) => index + 1)
const first = sampleSchoolInfoCandidates(schools, 12345)
const repeated = sampleSchoolInfoCandidates(schools, 12345)
const reshuffled = sampleSchoolInfoCandidates(schools, 67890)

assert.equal(first.length, 12)
assert.equal(new Set(first).size, 12)
assert.ok(first.every((number) => number >= 1 && number <= 50))
assert.deepEqual(first, repeated)
assert.notDeepEqual(first, reshuffled)
assert.deepEqual(sampleSchoolInfoCandidates([1, 2, 3], 1).sort(), [1, 2, 3])

console.log('학교 후보 무작위 추출 검증 6건 통과')
