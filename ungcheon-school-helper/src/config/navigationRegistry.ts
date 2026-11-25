import {
  ArrowLeftRight, Bell, BookOpen, Building2, Calculator, CalendarDays, CalendarRange,
  ClipboardCheck, FileCode2, FileDown, FileLock2, FilePenLine, FileScan, FileText, Grid2X2, HeartHandshake, Images,
  HelpCircle, Landmark, LayoutDashboard, Link2, MapPinned, MessageSquareText, ScanSearch,
  ScrollText, SearchCheck, Settings, ShieldAlert, ShieldCheck, Table2, UsersRound, Wrench,
  type LucideIcon,
} from 'lucide-react'

/**
 * 사이드바와 업무 도우미 검색이 공동으로 사용하는 메뉴 원본입니다.
 * 새 메뉴는 이 목록에만 추가해도 사이드바와 검색 기본 안내에 동시 반영됩니다.
 * 세부 사용법은 workAssistantSearch.ts의 전문 안내가 있을 때 우선 사용합니다.
 */
export type FeaturePreview = 'calendar' | 'table' | 'check' | 'document' | 'chart' | 'search' | 'books' | 'tools'

export interface NavigationItem {
  id: string
  label: string
  icon: LucideIcon
  assistantCategory: string
  description: string
  preview: FeaturePreview
  searchAliases?: string[]
}

export const ATTENDANCE_LAB_MENU = {
  id: 'attendance_lab',
  label: '수업 출결',
  icon: ClipboardCheck,
  assistantCategory: '학생·학사',
  description: '1~3학년 학급수업과 이동수업의 담임·교과 출결을 교시별로 확인합니다.',
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'feature_catalog', label: '전체 메뉴', icon: Grid2X2, assistantCategory: '설정·도움말', description: '분야별 기능을 찾아 열고 내 바로가기에 추가합니다.', preview: 'tools', searchAliases: ['메뉴 찾기', '전체 기능', '내 바로가기', '즐겨찾기'] },
  { id: 'feature_overview', label: '기능 훑어보기', icon: Images, assistantCategory: '설정·도움말', description: '각 기능으로 할 수 있는 일을 그림과 한 문장으로 살펴봅니다.', preview: 'tools', searchAliases: ['기능 소개', '기능 목록', '어떤 기능', '한눈에 보기'] },
  { id: 'mini_widget', label: '미니 위젯', icon: LayoutDashboard, assistantCategory: '일정', description: '바탕화면에서 오늘 시간표, 다음 수업과 업무 알림을 빠르게 확인합니다.', preview: 'calendar', searchAliases: ['바탕화면 위젯', '미니 대시보드', '현재 교시 타이머'] },
  { id: 'mandatory_training', label: '법정의무연수', icon: ClipboardCheck, assistantCategory: '학교운영', description: '연수 이수증을 제출하고 이수 현황을 엑셀로 내려받습니다.', preview: 'check', searchAliases: ['법정 의무 연수', '이수증 제출', '이수증 엑셀 내려받기', '의무연수'] },
  { id: 'saenggibu_generator', label: '웅천고 생기부 생성 도우미', icon: FilePenLine, assistantCategory: '진학·대입', description: '웅천고 생기부 생성 도우미에서 학생부 문장 초안을 작성합니다.', preview: 'document', searchAliases: ['생기부 생성', '학생부 생성'] },
  { id: 'university_webzines', label: '대학 웹진(아로리)', icon: BookOpen, assistantCategory: '진학·대입', description: '서울대 아로리를 비롯한 대학별 웹진을 한곳에서 찾아봅니다.', preview: 'books', searchAliases: ['아로리', '대학 웹진'] },
  { id: 'admission_results', label: '전년도 입시결과', icon: SearchCheck, assistantCategory: '진학·대입', description: '대학별 전년도 입시결과를 검색하고 교사용 어디가샘을 엽니다.', preview: 'search', searchAliases: ['입결', '대학별 입시결과', '어디가', '어디가샘'] },
  { id: 'gyeongnam_curriculum', label: '경남 고교 교육과정 편제표', icon: MapPinned, assistantCategory: '진학·대입', description: '경남 고교의 교육과정 편제표를 학교 이름이나 지도로 찾습니다.', preview: 'table', searchAliases: ['학교별 편제표', '경남 고교학점제', '웅천고 편제표'] },
  { id: 'performance_assessment_guide', label: '수행평가 영역명 가이드', icon: FilePenLine, assistantCategory: '진학·대입', description: '교과별 예시와 가이드북으로 수행평가 영역명을 정합니다.', preview: 'document', searchAliases: ['수행평가명', '수행평가 이름', '동국대 가이드북'] },
  { id: 'average_grade_calculator', label: '평균내신등급 산출기', icon: Calculator, assistantCategory: '진학·대입', description: '학생부 PDF나 나이스 파일로 학점 가중 평균 내신을 계산합니다.', preview: 'chart', searchAliases: ['평균 내신', '내신 계산', '교과학습발달상황'] },
  { id: 'admission_success_cases', label: '수시모집 우수사례', icon: FileLock2, assistantCategory: '진학·대입', description: '경남 수시모집 우수사례의 PDF와 대학·학과별 사례를 찾아봅니다.', preview: 'books', searchAliases: ['수시 우수사례', '합격사례'] },
  { id: 'ungcheon_library', label: '웅천 서가', icon: BookOpen, assistantCategory: '독서교육', description: '웅천 서가를 열어 본교 독서교육에 활용할 자료를 살펴봅니다.', preview: 'books', searchAliases: ['웅천서가', '독서교육'] },
  { id: 'university_recommended_books', label: '대학 추천도서', icon: BookOpen, assistantCategory: '독서교육', description: '서울대 추천도서 100선의 책 정보와 진로 연계 내용을 살펴봅니다.', preview: 'books', searchAliases: ['서울대 100선', '추천도서'] },
  { id: 'help', label: '사용 매뉴얼', icon: HelpCircle, assistantCategory: '설정·도움말', description: '주요 기능을 사용하는 순서와 문의 방법을 확인합니다.', preview: 'document', searchAliases: ['설명서', '사용법', '도움말'] },
  { id: 'notifier', label: '업무알리미', icon: Bell, assistantCategory: '알림', description: '학교 공지와 새 업무, 일정 변경 알림을 확인합니다.', preview: 'check', searchAliases: ['일정 알림', '공지 알림'] },
  { id: 'operations_notifications', label: '통합 알림·변경센터', icon: Bell, assistantCategory: '알림', description: '새 업무, 수업 변경, 위원회 일정 알림을 한곳에서 확인합니다.', preview: 'check', searchAliases: ['통합 알림', '변경 알림', '수업 변경 알림', '위원회 알림'] },
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, assistantCategory: '일정', description: '오늘 일정, 급식, 내 시간표와 처리할 업무를 한 화면에서 확인합니다.', preview: 'calendar', searchAliases: ['홈', '오늘 브리핑', '주간 시간표'] },
  { id: 'executive_live_classes', label: '현재 수업 현황', icon: Building2, assistantCategory: '교장·교감', description: '현재 교시의 수업과 교실별 운영 현황을 확인합니다.', preview: 'table', searchAliases: ['현재 교실', '수업 중 교실', '교실 현황'] },
  { id: 'executive_teacher_schedule', label: '교사 시간표 조회', icon: UsersRound, assistantCategory: '교장·교감', description: '교사별 시간표를 조회하고 해당 시간의 근무 현황을 확인합니다.', preview: 'calendar', searchAliases: ['전체 교사 시간표', '교사별 시간표'] },
  { id: 'calendar', label: '캘린더', icon: CalendarDays, assistantCategory: '일정', description: '학사 일정, 위원회, 수업 변경과 개인 일정을 달력에서 확인합니다.', preview: 'calendar', searchAliases: ['달력', '월간 일정', '통합 캘린더'] },
  { id: 'settings', label: '환경설정', icon: Settings, assistantCategory: '설정·도움말', description: '학교·사용자 설정을 확인하고 숨긴 메뉴와 저장 자료를 관리합니다.', preview: 'tools', searchAliases: ['사용자 설정', '이름 설정', '테마 설정'] },
  { id: 'admin_center', label: '관리자 센터', icon: ShieldCheck, assistantCategory: '관리자', description: '공유 자료와 나이스 동기화 상태를 확인하고 관리합니다.', preview: 'tools', searchAliases: ['관리자 동기화', 'NEIS 동기화'] },
  { id: 'staff_tasks', label: '업무센터', icon: ClipboardCheck, assistantCategory: '학교운영', description: '배부된 업무와 개인 할 일을 확인하고 완료 상태를 관리합니다.', preview: 'check', searchAliases: ['업무 등록', '배부 업무', '체크리스트'] },
  { id: 'audit_evidence', label: '감사 증빙센터', icon: ShieldAlert, assistantCategory: '학교운영', description: '감사 기준과 자체점검표를 확인하고 증빙 자료를 정리합니다.', preview: 'check', searchAliases: ['감사 규정', '감사 사례', '자체점검표', '자율형 종합감사'] },
  { id: 'school_hub', label: '학교 공유 링크', icon: Link2, assistantCategory: '학교 공유', description: '학교 공지와 부서별 공유 링크를 찾고 새 링크를 등록합니다.', preview: 'document', searchAliases: ['공유 링크', '부서 링크'] },
  { id: 'timetable_swap', label: '교사 시간표', icon: ArrowLeftRight, assistantCategory: '학사·기록', description: '내 시간표를 확인하고 교환·대강이나 공동 공강을 찾습니다.', preview: 'calendar', searchAliases: ['교환·대강 계획', '수업 교체', '대강', '공동 공강'] },
  { id: 'student_timetable', label: '학생별 시간표', icon: CalendarRange, assistantCategory: '학사·기록', description: '과목 선택이 반영된 학생별 시간표를 조회하거나 인쇄합니다.', preview: 'calendar', searchAliases: ['개인 시간표', '학생 시간표'] },
  { id: 'attendance_print', label: '출석부 출력', icon: UsersRound, assistantCategory: '학사·기록', description: '학급·과목·담당 교사별 출석부를 인쇄하거나 엑셀로 저장합니다.', preview: 'table', searchAliases: ['학급 출석부', '수업 출석부', '교사별 출석부'] },
  { id: 'volunteer_work', label: '봉사활동 업무', icon: HeartHandshake, assistantCategory: '학생·학사', description: '반별·부서별 봉사활동 확인서를 발급하고 나이스 시수와 대조합니다.', preview: 'document', searchAliases: ['봉사활동 확인서', '봉사 검증'] },
  { id: 'student_locator', label: '학생 위치 찾기', icon: SearchCheck, assistantCategory: '학사·기록', description: '학번이나 이름으로 조회해 해당 교시 학생의 수업과 교실을 찾습니다.', preview: 'search', searchAliases: ['현재 교실', '학생 수업 찾기'] },
  { id: 'schoolinfo_evaluation', label: '타학교 평가계획', icon: Building2, assistantCategory: '학사·평가', description: '학교알리미에서 다른 학교의 교과 평가계획을 찾아봅니다.', preview: 'search', searchAliases: ['다른 학교 평가계획', '학교알리미'] },
  { id: 'student_identity_audit', label: '학생 학번·이름 교정기', icon: ScanSearch, assistantCategory: '학사·기록', description: '명단의 학번과 이름이 바르게 연결됐는지 확인하고 수정합니다.', preview: 'table', searchAliases: ['학번 이름 오류', '명단 교정'] },
  { id: 'subject_remarks_print', label: '교과세특 개별 인쇄기', icon: ScrollText, assistantCategory: '학사·기록', description: '교과 세부능력 및 특기사항을 학생별로 나누어 인쇄합니다.', preview: 'document', searchAliases: ['세특 인쇄', '교과세특'] },
  { id: 'record_privacy_blind', label: '생기부 개인정보 블라인드', icon: FileLock2, assistantCategory: '학생·학사', description: '학생부 PDF에서 이름 등 개인정보를 가리고 사본을 만듭니다.', preview: 'document', searchAliases: ['생기부 블라인드', '학생부 개인정보 가리기', '생기부 이름 가리기', 'PDF 개인정보 삭제'] },
  { id: 'staff_roster', label: '교직원 명렬', icon: UsersRound, assistantCategory: '학교운영', description: '교직원 명렬을 확인하고 연수등록부를 출력합니다.', preview: 'table', searchAliases: ['교원 명렬', '연수등록부'] },
  { id: 'committees', label: '각종 위원회 현황', icon: Landmark, assistantCategory: '학교운영', description: '위원 명단과 개최 일정을 확인하고 일정이 겹치는지 살펴봅니다.', preview: 'calendar', searchAliases: ['위원회 명단', '위원회 일정'] },
  { id: 'feature_requests', label: '기능개선 요청', icon: MessageSquareText, assistantCategory: '지원', description: '개선 의견을 등록하고 처리 현황을 확인합니다.', preview: 'check', searchAliases: ['개선 의견', '새 기능 요청'] },
  { id: 'transfer_score', label: '전보내신점수 계산기', icon: MapPinned, assistantCategory: '인사행정', description: '경남 교원 전보 기준에 따라 전보내신점수를 계산합니다.', preview: 'chart', searchAliases: ['전보 점수', '내신 이동'] },
  { id: 'grade_preview', label: '등급 미리보기', icon: Calculator, assistantCategory: '성적', description: '평가 점수를 합산해 예상 석차등급과 성취도 분포를 확인합니다.', preview: 'chart', searchAliases: ['성적 산출 미리보기', '성적 미리보기', '성취도 분포'] },
  { id: 'estimated_split_score', label: '추정분할점수 도우미', icon: Table2, assistantCategory: '성적', description: '시험과 수행평가 점수를 바꿔 보며 성취도 분포와 권장 분할점수를 확인합니다.', preview: 'chart', searchAliases: ['분할점수', '정답률 역산'] },
  { id: 'curriculum', label: '교육과정 편제표 출력', icon: FileText, assistantCategory: '교육과정', description: '웅천고 교육과정 편제표를 확인하고 PDF로 출력합니다.', preview: 'table', searchAliases: ['편제표', '교육과정 출력'] },
  { id: 'form_center', label: '서식센터', icon: FilePenLine, assistantCategory: '서식 출력', description: '회의록과 계획서 등 학교에서 쓰는 공통 서식을 찾아 사용합니다.', preview: 'document', searchAliases: ['학교 서식', '회의록', '계획서'] },
  { id: 'teacher_tools', label: '교사용 도구', icon: Wrench, assistantCategory: '개인 도구', description: '명단 비교, 날짜 계산, 추첨 등 간단한 교무 작업을 처리합니다.', preview: 'tools', searchAliases: ['명단 비교', '날짜 계산', '추첨'] },
  { id: 'excel_processor', label: '파일 처리 도구', icon: Table2, assistantCategory: '파일 처리', description: '엑셀 자료를 정리하고 PDF 글자 추출이나 파일 구조 확인을 합니다.', preview: 'table', searchAliases: ['엑셀 정리', '명단 정리'] },
  { id: 'recommended_subjects', label: '대학 권장과목', icon: BookOpen, assistantCategory: '자료·진로', description: '대학과 학과별 권장 이수과목을 찾아 과목 선택 상담에 활용합니다.', preview: 'search', searchAliases: ['학과 권장과목', '선택과목 상담'] },
  { id: 'payroll', label: '호봉획정 계산기', icon: Calculator, assistantCategory: '인사행정', description: '인정 경력을 반영해 초임 호봉을 계산합니다.', preview: 'chart', searchAliases: ['호봉 계산', '경력 인정'] },
  { id: 'insa_analysis', label: 'NEIS 인사기록 분석', icon: FileScan, assistantCategory: '인사행정', description: '나이스 인사기록 PDF에서 경력과 법정연수 이력을 확인합니다.', preview: 'document', searchAliases: ['나이스 인사기록', '경력 분석'] },
  { id: 'pdf_extractor', label: 'PDF 텍스트 추출', icon: FileDown, assistantCategory: '파일 처리', description: '문서형 또는 스캔 PDF에서 글자를 뽑습니다.', preview: 'document', searchAliases: ['PDF OCR', '스캔 PDF'] },
  { id: 'file_parser', label: '만능 파일 파서', icon: FileCode2, assistantCategory: '파일 처리', description: '엑셀·한글·PDF 파일에서 내용과 구조를 확인합니다.', preview: 'tools', searchAliases: ['HWP 분석', '파일 구조 분석'] },
]

export const NAVIGATION_BY_ID = new Map(NAVIGATION_ITEMS.map(item => [item.id, item]))
export const SIDEBAR_MENU_OPTIONS = NAVIGATION_ITEMS.map(({ id, label }) => ({ id, label }))
