import type { ReferenceMetadata } from './auditEvidence'

export const REFERENCE_CATALOG: Record<string, ReferenceMetadata> = {
  transferScore: {
    standardDate: '2027학년도 인사관리기준 · 2026-12-31 취득분까지',
    source: '경상남도교육청 중등교육과 「2027. 중등 교육공무원 인사관리기준」 제21조·별표 3·별표 4',
    verifiedAt: '2026-08-26',
  },
  curriculum2026: {
    standardDate: '2026학년도 편성표',
    source: '2026학년도 웅천고등학교 전학년 교육과정 편성표',
    verifiedAt: '2026-08-26',
  },
  schoolInfoEvaluation: {
    standardDate: '검색범위 2025-1·2025-2·2026-1',
    source: '학교알리미 공개 평가계획 · 국가교육과정 성취기준 코드',
    verifiedAt: '2026-08-26',
  },
  estimatedSplitScore: {
    standardDate: '2026학년도 고등학교 성적처리 기준',
    source: '교육부·경상남도교육청 학업성적관리 관련 기준 및 학교 학업성적관리규정 확인 필요',
    verifiedAt: '2026-08-26',
  },
}
