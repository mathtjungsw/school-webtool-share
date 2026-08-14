import assert from 'node:assert/strict'
import {
  SCHOOL_INFO_SEARCH_PERIODS,
  SCHOOL_INFO_SEARCH_RANGE_LABEL,
  SCHOOL_INFO_SEARCH_RANGE_SHORT_LABEL,
  SCHOOL_INFO_SEARCH_SCOPE_VERSION,
} from '../src/data/schoolInfoSearchPeriods'

assert.deepEqual(SCHOOL_INFO_SEARCH_PERIODS, [
  { year: 2025, semester: 1 },
  { year: 2025, semester: 2 },
  { year: 2026, semester: 1 },
])
assert.equal(SCHOOL_INFO_SEARCH_PERIODS.length, 3)
assert.equal(new Set(SCHOOL_INFO_SEARCH_PERIODS.map(({ year, semester }) => `${year}-${semester}`)).size, 3)
assert.equal(SCHOOL_INFO_SEARCH_RANGE_SHORT_LABEL, '최근 3학기')
assert.match(SCHOOL_INFO_SEARCH_RANGE_LABEL, /2025학년도 1·2학기/)
assert.match(SCHOOL_INFO_SEARCH_RANGE_LABEL, /2026학년도 1학기/)
assert.equal(SCHOOL_INFO_SEARCH_SCOPE_VERSION, '2025-1_2025-2_2026-1')

console.log('PASS 타학교 평가계획 검색 범위: 2025-1·2025-2·2026-1 (최근 3학기)')
