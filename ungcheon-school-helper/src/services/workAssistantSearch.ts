export interface WorkAssistantEntry {
  id: string
  title: string
  page: string
  category: string
  summary: string
  steps: string[]
  keywords: string[]
  teacherContext?: boolean
}

export interface WorkAssistantResult extends WorkAssistantEntry {
  score: number
}

export const WORK_ASSISTANT_SUGGESTIONS = [
  '내 수업 출석부 출력하고 싶어',
  '개인 업무를 등록하고 싶어',
  '수업 교환이나 대강 교사 찾기',
  '연수등록부 출력하기',
  '성취도 분포를 미리 보고 싶어',
  'NEIS API 키 입력 방법',
]

export const WORK_ASSISTANT_ENTRIES: WorkAssistantEntry[] = [
  {
    id: 'attendance-teacher', title: '내 수업 출석부 묶음 출력', page: 'attendance_print', category: '학사·기록',
    summary: '환경설정에 등록한 교사를 기준으로 담당 강좌 출석부를 한 번에 출력하거나 내려받습니다.',
    steps: ['출석부 출력 메뉴를 엽니다.', '교사별 묶음 출력에서 본인 이름을 선택합니다.', '미리보기 후 인쇄·PDF 또는 Excel 저장을 선택합니다.'],
    keywords: ['내 수업 출석부', '내수업출석부출력', '교사 출석부', '교사별 출석부', '담당수업 명단', '수업 명렬', '출석부 묶음', '출석부 출력'],
    teacherContext: true,
  },
  {
    id: 'attendance-class', title: '학급·수업별 출석부 출력', page: 'attendance_print', category: '학사·기록',
    summary: '학급 출석부 또는 이동수업을 포함한 강좌별 출석부를 출력합니다.',
    steps: ['출석부 출력 메뉴를 엽니다.', '학급 출석부 또는 수업 출석부를 선택합니다.', '학년·반 또는 강좌를 고른 뒤 인쇄합니다.'],
    keywords: ['학급 출석부', '반 출석부', '수업 출석부', '이동수업 출석부', '학생 명단 출력', '출석부 인쇄'],
  },
  {
    id: 'personal-task', title: '개인 업무 등록·관리', page: 'calendar', category: '개인 도구',
    summary: '개인 업무의 마감일·시간·중요도·메모를 등록하고 캘린더와 대시보드에서 확인합니다.',
    steps: ['캘린더 메뉴를 엽니다.', '날짜를 선택하고 오른쪽 개인 업무 등록 칸을 작성합니다.', '대시보드에서 마감 업무를 확인하거나 바로 완료 처리합니다.'],
    keywords: ['개인 업무', '할 일', '해야 할 일', '업무 등록', '마감 업무', '오늘 할일', '일정에 업무', '개인 일정'],
  },
  {
    id: 'personal-memo', title: '개인 메모 작성', page: 'dashboard', category: '개인 도구',
    summary: '학교 공유 서버로 전송하지 않고 현재 PC에만 개인 메모를 자동 저장합니다.',
    steps: ['대시보드의 개인 메모 칸을 찾습니다.', '내용을 입력하면 잠시 후 자동 저장됩니다.', '공용 Windows 계정에서는 민감한 내용을 기록하지 않습니다.'],
    keywords: ['개인 메모', '메모장', '메모 쓰기', '기억할 내용', '나만 보는 메모'],
  },
  {
    id: 'monthly-calendar', title: '월간 통합 캘린더 보기', page: 'calendar', category: '일정',
    summary: 'NEIS 학사일정·주간계획·내 위원회·개인 업무를 한 달 단위로 확인합니다.',
    steps: ['캘린더 메뉴를 엽니다. 앱 실행 중 한 번 불러온 월은 임시 캐시에서 먼저 표시됩니다.', '이전 달·다음 달 버튼으로 월을 이동합니다.', '날짜를 선택하면 그날의 전체 일정이 표시되며 서버 변경 내용은 뒤에서 갱신됩니다.'],
    keywords: ['월간 캘린더', '한달 일정', '학교 일정', '이번달 일정', '학사 일정', '주간 계획', '달력 보기', '캘린더 새로고침', '일정 캐시', '일정이 늦게 떠요'],
  },
  {
    id: 'timetable-swap', title: '수업 교환 계획', page: 'timetable_swap', category: '학사·기록',
    summary: '서로 공강이면서 같은 학급 수업을 담당하는 교환 가능 교사를 찾고 예상 시간표를 확인합니다.',
    steps: ['교환·대강 계획 메뉴를 엽니다.', '본인 교사와 교환할 수업을 선택합니다.', '색칠된 시간 또는 교환 후보를 눌러 예상 시간표를 확인합니다.'],
    keywords: ['수업 교환', '시간표 교체', '교환 보강', '교환보강', '수업 바꾸기', '교체 후보', '교환 계획서'],
    teacherContext: true,
  },
  {
    id: 'substitute-teacher', title: '대강 가능한 교사 찾기', page: 'timetable_swap', category: '학사·기록',
    summary: '선택한 시간에 수업이 없는 교사를 찾고 연강 여부를 확인한 뒤 대강 계획에 추가합니다.',
    steps: ['교환·대강 계획 메뉴에서 수업을 선택합니다.', '대강 교사 찾기 버튼을 누릅니다.', '후보 교사의 예상 시간표를 확인하고 계획서에 추가합니다.'],
    keywords: ['대강', '대강 교사', '빈 선생님', '공강 교사', '보강 교사', '출장 수업', '수업 대신'],
  },
  {
    id: 'swap-document', title: '교환·대강 계획서 출력', page: 'timetable_swap', category: '서식 출력',
    summary: '선택한 교환·대강 내용을 학교 계획서 양식으로 편집해 HWP 또는 PDF로 출력합니다.',
    steps: ['교환 또는 대강 항목을 계획서에 추가합니다.', '교환·대강 계획서 출력 버튼을 누릅니다.', '내용을 수정한 뒤 HWP·인쇄·PDF 중 원하는 방식을 선택합니다.'],
    keywords: ['교환보강 계획서', '교환 대강 출력', '보강 계획서', '대강 계획서', 'hwp 계획서'],
  },
  {
    id: 'student-timetable', title: '학생별 시간표 조회·인쇄', page: 'student_timetable', category: '학사·기록',
    summary: '학생을 검색해 선택과목이 반영된 개인 시간표를 조회하고 인쇄합니다.',
    steps: ['학생별 시간표 메뉴를 엽니다.', '학년·반 또는 학생 이름으로 검색합니다.', '학생을 선택한 뒤 인쇄 또는 PDF 저장을 누릅니다.'],
    keywords: ['학생 시간표', '개인 시간표', '학생별시간표', '선택과목 시간표', '학생 시간표 출력'],
  },
  {
    id: 'grade-preview', title: '성적 산출 미리보기', page: 'grade_preview', category: '성적',
    summary: '평가 점수를 합산해 환산점수·석차등급·성취도 분포를 미리 확인합니다.',
    steps: ['성적 산출 미리보기 메뉴를 엽니다.', '평가 구성과 반영 비율을 설정합니다.', '점수 Excel을 불러와 결과와 오류 검사를 확인합니다.'],
    keywords: ['성적 산출', '성적 계산', '등급 계산', '석차 등급', '성취도 분포', '점수 합산', '성적 미리보기'],
  },
  {
    id: 'split-score', title: '추정분할점수 구성·역산', page: 'estimated_split_score', category: '성적',
    summary: '원하는 성취도 분포를 위한 추정분할점수와 난이도별 예상 정답률을 계산합니다.',
    steps: ['추정분할점수 도우미 메뉴를 엽니다.', '시험·수행평가 구성과 목표 분할점수를 입력합니다.', '예측 또는 역산 결과에서 필요한 정답률을 확인합니다.'],
    keywords: ['추정분할점수', '분할 점수', '정답률', '난이도', '성취도 역산', '희망 성취도 분포'],
  },
  {
    id: 'curriculum', title: '교육과정 편제표 확인·출력', page: 'curriculum', category: '교육과정',
    summary: '전학년 및 학년별 교육과정 편제표를 확인하고 PDF로 출력합니다.',
    steps: ['교육과정 편제표 출력 메뉴를 엽니다.', '전학년 또는 학년별 탭을 선택합니다.', 'PDF 열기·저장 또는 과목선택 상담 기능을 이용합니다.'],
    keywords: ['교육과정 편제표', '편제표', '교육과정 출력', '과목선택 상담', '1학년 과목선택', '2학년 과목선택'],
  },
  {
    id: 'staff-task', title: '업무센터에서 업무 등록·확인', page: 'staff_tasks', category: '학교운영',
    summary: '내 공유 업무, 내가 만든 업무, 기본 부서 업무, 이 PC에만 저장되는 개인 업무를 한곳에서 관리합니다.',
    steps: ['업무센터 메뉴를 엽니다.', '공유 업무는 대상 교원 또는 부서를 선택해 배부하고 시작일·마감일·중요도·상태·관련 링크를 입력합니다.', '내 업무에서 항목별 진행 상태를 저장하거나, 내가 만든 업무에서 응답 현황·미완료자를 확인합니다.', '개인 업무는 개인 업무 보기에서 등록하며 학교 공유 서버로 전송되지 않습니다.'],
    keywords: ['업무센터', '업무 체크리스트', '교사 할 일', '부서 업무', '업무 배부', '업무 완료 확인', '미완료 교사', '개인 업무', '업무 복제', '업무 달력'],
  },
  {
    id: 'training-roster', title: '연수등록부 출력', page: 'staff_roster', category: '학교운영',
    summary: '교원 명렬을 이용해 제목과 날짜가 포함된 2단 연수등록부를 출력합니다.',
    steps: ['교원 명렬 메뉴를 엽니다.', '연수등록부 탭에서 제목과 날짜를 입력합니다.', '미리보기 후 인쇄 또는 PDF 저장을 선택합니다.'],
    keywords: ['연수 등록부', '연수등록부 출력', '연수 명부', '교원 서명부', '연수 서명'],
  },
  {
    id: 'staff-roster', title: '교원 명렬 조회·관리', page: 'staff_roster', category: '학교운영',
    summary: '교장·교감 우선 및 가나다순으로 정리된 교원의 직책·부서·교과·담임 정보를 조회하고 내려받습니다.',
    steps: ['교원 명렬 메뉴를 엽니다.', '직책·부서·교과·담임 정보를 조회하거나 내려받습니다.', '명렬 교체와 수정은 관리자 모드에서 진행합니다.'],
    keywords: ['교원 명렬', '교직원 명단', '선생님 명단', '교원명렬 다운로드', '교직원 목록', '담임 교사', '담당 교과', '교사 부서', '업무분장'],
  },
  {
    id: 'committee', title: '위원회 명단·일정 관리', page: 'committees', category: '학교운영',
    summary: '경남교육청 기준 위원회 목록에 위원을 배정하고 개최 일정과 충돌을 확인합니다.',
    steps: ['각종 위원회 현황 메뉴를 엽니다.', '위원 명단에서 교원을 선택하거나 직접 입력합니다.', '위원회 캘린더에서 일정을 등록하고 중복 경고를 확인합니다.'],
    keywords: ['위원회', '위원 명단', '위원회 일정', '위원회 캘린더', '위원 겹침', '위원회 개최'],
  },
  {
    id: 'neis-key', title: 'NEIS API 키 입력 방법', page: 'help', category: '설정·도움말',
    summary: 'NEIS 교육정보 개방 포털에서 인증키를 발급받아 환경설정에 입력하는 방법을 안내합니다.',
    steps: ['사용 매뉴얼의 NEIS API 인증키 항목을 엽니다.', '개방 포털에서 인증키를 발급·복사합니다.', '환경설정의 NEIS API 키에 붙여넣고 저장합니다.'],
    keywords: ['나이스 키', 'NEIS API 키', '인증키', '급식', '나이스 급식', '급식이 안 나와', '급식 안나옴', '학사일정 안나옴', '호출 권한', '나이스 정보'],
  },
  {
    id: 'neis-information', title: 'NEIS 급식·학사일정 확인', page: 'dashboard', category: '학사·기록',
    summary: '웅천고 급식은 대시보드에서, 학사일정은 대시보드 2주 일정과 통합 캘린더에서 확인합니다.',
    steps: ['대시보드를 엽니다.', '상단 2주 일정에서 NEIS 학사일정을 확인합니다.', '그 아래 날씨·급식 카드에서 급식을 확인하거나 월간 캘린더로 이동합니다.', '정보가 없으면 사용 매뉴얼에서 NEIS API 키 입력 상태를 확인합니다.'],
    keywords: ['NEIS 정보', '나이스 조회', '급식 조회', '학사일정 조회', '오늘 급식', '학교 일정', '대시보드 급식', '통합 캘린더'],
  },
  {
    id: 'school-link', title: '학교 공유 링크 등록', page: 'school_hub', category: '학교 공유',
    summary: '부서별 자료·사이트 URL을 등록해 전체 교직원과 공유합니다.',
    steps: ['학교 공유 링크 메뉴를 엽니다.', '부서·제목·URL·등록자 이름을 입력합니다.', '등록하면 모든 사용자에게 바로 표시됩니다.'],
    keywords: ['학교 공유 링크', '링크 등록', '부서 링크', '자료 공유', 'URL 공유', '공지 등록'],
  },
  {
    id: 'feature-request', title: '기능개선 요청 등록', page: 'feature_requests', category: '지원',
    summary: '새 기능 또는 기존 기능 개선 요청을 실명으로 등록하고 처리 상태를 확인합니다.',
    steps: ['기능개선 요청 메뉴를 엽니다.', '요청 유형·제목·내용·작성자 이름을 입력합니다.', '등록 후 관리자 답변과 처리 상태를 확인합니다.'],
    keywords: ['기능 개선', '오류 신고', '새 기능 요청', '건의사항', '프로그램 문의', '개선 요청'],
  },
  {
    id: 'excel-clean', title: 'Excel 명단·자료 정리', page: 'excel_processor', category: '파일 처리',
    summary: 'Excel의 공백·날짜·중복·빈 셀 등을 점검하고 정리된 새 파일을 만듭니다.',
    steps: ['Excel 전처리 메뉴를 엽니다.', '원본 Excel 파일을 선택합니다.', '필요한 정리 항목을 선택한 뒤 새 파일로 저장합니다.'],
    keywords: ['엑셀 정리', '명단 정리', '중복 검사', '빈셀 검사', '공백 제거', '엑셀 전처리'],
  },
  {
    id: 'recommended-subjects', title: '대학·학과별 권장과목 검색', page: 'recommended_subjects', category: '자료·진로',
    summary: '2028학년도 대학과 학과별 권장 이수과목을 검색해 과목선택 상담에 활용합니다.',
    steps: ['대학 권장과목 메뉴를 엽니다.', '대학 또는 모집단위·학과를 검색합니다.', '권장과목과 핵심과목을 확인해 상담에 활용합니다.'],
    keywords: ['대학 권장과목', '학과 권장과목', '권장 이수과목', '대입 과목', '과목선택 상담', '2028 대입'],
  },
  {
    id: 'pdf-text', title: 'PDF 텍스트 추출', page: 'pdf_extractor', category: '파일 처리',
    summary: '일반 PDF 또는 스캔 PDF에서 텍스트를 추출해 복사하거나 저장합니다.',
    steps: ['PDF 텍스트 추출 메뉴를 엽니다.', 'PDF 파일을 선택하고 추출을 실행합니다.', '결과를 복사하거나 텍스트 파일로 저장합니다.'],
    keywords: ['PDF 글자 추출', 'pdf 텍스트', '스캔 pdf', 'OCR', 'PDF 복사'],
  },
  {
    id: 'file-parser', title: 'Excel·HWP·PDF 구조 분석', page: 'file_parser', category: '파일 처리',
    summary: '파일 내부의 시트·표·텍스트 구조를 분석해 다른 기능 제작에 사용할 수 있도록 확인합니다.',
    steps: ['만능 파일 파서 메뉴를 엽니다.', '분석할 파일을 선택합니다.', '표·텍스트·메타데이터 결과를 확인합니다.'],
    keywords: ['파일 분석', '한글 파일 분석', 'HWP 분석', '엑셀 구조', '만능 파일 파서'],
  },
  {
    id: 'payroll', title: '호봉획정 계산', page: 'payroll', category: '인사행정',
    summary: '경력별 인정률과 기간을 반영해 초임 호봉을 계산합니다.',
    steps: ['호봉획정 계산기 메뉴를 엽니다.', '학력·자격·경력 정보를 입력합니다.', '인정 경력과 최종 호봉 계산 결과를 확인합니다.'],
    keywords: ['호봉', '호봉 계산', '경력 인정', '초임 호봉', '호봉 획정'],
  },
  {
    id: 'insa', title: 'NEIS 인사기록 분석', page: 'insa_analysis', category: '인사행정',
    summary: 'NEIS 인사기록 PDF를 PC에서 분석해 경력과 법정연수 등을 점검합니다.',
    steps: ['NEIS 인사기록 분석 메뉴를 엽니다.', '인사기록 PDF를 선택합니다.', '분석 결과와 점검 항목을 확인합니다.'],
    keywords: ['인사기록', '나이스 인사기록', '법정 연수', '경력 분석', '인사 PDF'],
  },
  {
    id: 'notifier', title: '업무 알리미 설정', page: 'notifier', category: '알림',
    summary: '오늘의 학사일정과 학교 공지를 일정한 간격으로 확인하도록 알림을 설정합니다.',
    steps: ['업무 알리미 메뉴를 엽니다.', '확인 간격과 알림 조건을 설정합니다.', '알리미를 시작하고 실행 상태를 확인합니다.'],
    keywords: ['업무 알리미', '일정 알림', '공지 알림', '알림 설정', '오늘 일정 알림', '알리미 시작'],
  },
  {
    id: 'settings-name', title: '교사 이름·학교 설정', page: 'settings', category: '설정·도움말',
    summary: '내 시간표·위원회·업무에 사용할 교사 이름과 학교 연결 정보를 설정합니다.',
    steps: ['환경설정 메뉴를 엽니다.', '교사 이름과 필요한 학교 정보를 입력합니다.', '설정 저장 버튼을 누릅니다.'],
    keywords: ['이름 설정', '교사 이름', '내 시간표 안나옴', '환경 설정', '학교 설정', '사용자 이름'],
  },
]

const STOP_WORDS = new Set(['하고', '싶어', '싶어요', '해줘', '해주세요', '어떻게', '하려면', '방법', '보여줘', '찾아줘', '기능', '메뉴'])

export function normalizeAssistantText(value: string) {
  return value.toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣]+/g, '')
}

function scoreEntry(query: string, entry: WorkAssistantEntry) {
  const normalizedQuery = normalizeAssistantText(query)
  if (!normalizedQuery) return 0
  const title = normalizeAssistantText(entry.title)
  const searchable = normalizeAssistantText([
    entry.title, entry.category, entry.summary, ...entry.steps, ...entry.keywords,
  ].join(' '))
  let score = 0
  if (title === normalizedQuery) score += 240
  else if (title.includes(normalizedQuery)) score += 130
  if (searchable.includes(normalizedQuery)) score += 100

  for (const keyword of entry.keywords) {
    const normalizedKeyword = normalizeAssistantText(keyword)
    if (!normalizedKeyword) continue
    if (normalizedQuery.includes(normalizedKeyword)) score += 90 + Math.min(normalizedKeyword.length, 20)
    else if (normalizedKeyword.includes(normalizedQuery)) score += 55
  }

  const tokens = query.toLocaleLowerCase('ko-KR').split(/\s+/).map(token => token.replace(/[^0-9a-z가-힣]/g, '')).filter(token => token.length > 1 && !STOP_WORDS.has(token))
  for (const token of tokens) {
    if (searchable.includes(normalizeAssistantText(token))) score += 14
  }
  return score
}

export function searchWorkAssistant(query: string, limit = 5): WorkAssistantResult[] {
  return WORK_ASSISTANT_ENTRIES
    .map(entry => ({ ...entry, score: scoreEntry(query, entry) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ko'))
    .slice(0, limit)
}
