// 2022 개정 교육과정 선택과목 표준 어휘 + 과목 토큰화 유틸.
// 권장과목 검색의 '역방향 매칭'·'과목별 역검색'에서 공용 사용.
// 데이터(recommendedSubjects.ts)의 핵심/권장 문자열에 실제 등장하는 과목명을 기준으로 구성.

export interface SubjectGroup {
  area: string
  subjects: string[]
}

// 교과(군)별 표준 과목. 같은 교과 안에서는 구체 과목 → 일반 교과명 순으로 둔다.
export const CANONICAL_SUBJECTS: SubjectGroup[] = [
  { area: '국어', subjects: [
    '독서 토론과 글쓰기', '주제 탐구 독서', '매체 의사소통', '문학과 영상',
    '화법과 언어', '독서와 작문', '문학', '국어',
  ]},
  { area: '수학', subjects: [
    '대수', '미적분Ⅰ', '미적분Ⅱ', '확률과 통계', '기하', '미적분',
    '경제 수학', '인공지능 수학', '직무 수학', '수학과제 탐구', '수학과제탐구', '수학②', '수학',
  ]},
  { area: '영어', subjects: [
    '심화 영어 독해와 작문', '영어 독해와 작문', '영어 발표와 토론', '영미 문학 읽기',
    '심화 영어', '직무 영어', '영어Ⅱ', '영어Ⅰ', '영어',
  ]},
  { area: '사회', subjects: [
    '세계시민과 지리', '한국지리 탐구', '도시의 미래 탐구', '동아시아 역사 기행',
    '현대사회와 윤리', '국제 관계의 이해', '인문학과 윤리', '윤리와 사상', '사회와 문화',
    '법과 사회', '세계사', '정치', '경제', '윤리', '지리', '일반사회',
    '통합사회', '한국사', '역사', '사회',
  ]},
  { area: '과학', subjects: [
    '화학 반응의 세계', '세포와 물질대사', '기후변화와 환경생태', '지구시스템과학',
    '행성우주과학', '역학과 에너지', '전자기와 양자', '물질과 에너지', '생물의 유전',
    '생활과학 탐구', '물리학', '화학', '생명과학', '지구과학', '과학',
  ]},
  { area: '정보·기술', subjects: [
    '소프트웨어와 생활', '인공지능 기초', '데이터 과학', '정보', '기술', '가정',
  ]},
  { area: '교양·제2외국어', subjects: [
    '논리와 사고', '인간과 철학', '인간과 심리', '인간과 경제',
    '제2외국어', '중국어', '한문',
  ]},
]

// 평탄화 + 길이 내림차순(부분 문자열 오매칭 방지: '미적분Ⅱ'를 '미적분'보다 먼저 매칭)
export const ALL_SUBJECTS: string[] = CANONICAL_SUBJECTS.flatMap(g => g.subjects)
const BY_LEN = [...new Set(ALL_SUBJECTS)].sort((a, b) => b.length - a.length)
const ORDER = new Map(ALL_SUBJECTS.map((s, i) => [s, i]))

// 핵심/권장 문자열에서 표준 과목 토큰을 추출. 길이 긴 과목부터 제거하며 중복 매칭 방지.
export function parseSubjects(text: string | null | undefined): string[] {
  if (!text) return []
  let s = ` ${text} `
  const found = new Set<string>()
  for (const subj of BY_LEN) {
    if (s.includes(subj)) {
      found.add(subj)
      s = s.split(subj).join(' ')
    }
  }
  return [...found].sort((a, b) => (ORDER.get(a)! - ORDER.get(b)!))
}

// 일반 교과명(영역 단위). 역방향 매칭의 '영역 충족' 처리 및 서술형 판별에서 사용.
export const GENERIC_SUBJECTS = new Set(['국어', '수학', '영어', '사회', '과학', '한국사', '역사'])

// 서술형(과목 지정 없음) 판별: '계열 구분 없이 …', '진로 및 적성을 고려하여 …' 류.
// 단, 콤마/괄호로 구체 과목을 함께 지정했거나 일반교과가 아닌 구체 과목명이 있으면 '지정 있음'.
// '인문사회계열' 처럼 합성어 속 일반교과명('사회')만 걸린 경우는 지정으로 보지 않는다.
const OPEN_MARKERS = ['고려하여', '구분 없이', '구분없이', '적성을', '선택 이수', '선택하여 이수']
export function isOpenRequirement(core: string | null | undefined): boolean {
  if (!core) return true
  const hasOpen = OPEN_MARKERS.some(m => core.includes(m))
  if (!hasOpen) return false
  const subs = parseSubjects(core)
  const hasSpecific =
    subs.some(s => !GENERIC_SUBJECTS.has(s)) ||      // 구체 과목명이 있음
    (/[,\[(]/.test(core) && subs.length > 0)         // 콤마/괄호로 과목을 명시
  return !hasSpecific
}

// area 라벨 색상(Tailwind 토큰) — 페이지 배지에서 사용.
export const AREA_COLOR: Record<string, string> = {
  '국어': 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  '수학': 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  '영어': 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  '사회': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  '과학': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  '정보·기술': 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  '교양·제2외국어': 'bg-slate-500/15 text-slate-300 border-slate-500/25',
}

export function subjectArea(subject: string): string {
  for (const g of CANONICAL_SUBJECTS) if (g.subjects.includes(subject)) return g.area
  return ''
}
