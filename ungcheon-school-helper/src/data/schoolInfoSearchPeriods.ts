export interface SchoolInfoSearchPeriod {
  year: number
  semester: 1 | 2
}

/** 타학교 평가계획 검색 범위: 2026학년도 기준 최근 완료 3학기 */
export const SCHOOL_INFO_SEARCH_PERIODS: readonly SchoolInfoSearchPeriod[] = [
  { year: 2025, semester: 1 },
  { year: 2025, semester: 2 },
  { year: 2026, semester: 1 },
]

export const SCHOOL_INFO_SEARCH_RANGE_LABEL = '2025학년도 1·2학기 · 2026학년도 1학기'
export const SCHOOL_INFO_SEARCH_RANGE_SHORT_LABEL = '최근 3학기'
export const SCHOOL_INFO_SEARCH_SCOPE_VERSION = '2025-1_2025-2_2026-1'
