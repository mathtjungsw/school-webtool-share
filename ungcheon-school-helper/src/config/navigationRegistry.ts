import {
  ArrowLeftRight, Bell, BookOpen, Building2, Calculator, CalendarDays, CalendarRange,
  ClipboardCheck, FileCode2, FileDown, FilePenLine, FileScan, FileText, HeartHandshake,
  HelpCircle, Landmark, LayoutDashboard, Link2, MapPinned, MessageSquareText, ScanSearch,
  ScrollText, SearchCheck, Settings, ShieldCheck, Table2, UsersRound, Wrench,
  type LucideIcon,
} from 'lucide-react'

/**
 * 사이드바와 업무 도우미 검색이 공동으로 사용하는 메뉴 원본입니다.
 * 새 메뉴는 이 목록에만 추가해도 사이드바와 검색 기본 안내에 동시 반영됩니다.
 * 세부 사용법은 workAssistantSearch.ts의 전문 안내가 있을 때 우선 사용합니다.
 */
export interface NavigationItem {
  id: string
  label: string
  icon: LucideIcon
  assistantCategory: string
  searchAliases?: string[]
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'help', label: '사용 매뉴얼', icon: HelpCircle, assistantCategory: '설정·도움말', searchAliases: ['설명서', '사용법', '도움말'] },
  { id: 'notifier', label: '업무알리미', icon: Bell, assistantCategory: '알림', searchAliases: ['일정 알림', '공지 알림'] },
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, assistantCategory: '일정', searchAliases: ['홈', '오늘 브리핑', '주간 시간표'] },
  { id: 'calendar', label: '캘린더', icon: CalendarDays, assistantCategory: '일정', searchAliases: ['달력', '월간 일정', '통합 캘린더'] },
  { id: 'settings', label: '환경설정', icon: Settings, assistantCategory: '설정·도움말', searchAliases: ['사용자 설정', '이름 설정', '테마 설정'] },
  { id: 'admin_center', label: '관리자 센터', icon: ShieldCheck, assistantCategory: '관리자', searchAliases: ['관리자 동기화', 'NEIS 동기화'] },
  { id: 'staff_tasks', label: '업무센터', icon: ClipboardCheck, assistantCategory: '학교운영', searchAliases: ['업무 등록', '배부 업무', '체크리스트'] },
  { id: 'school_hub', label: '학교 공유 링크', icon: Link2, assistantCategory: '학교 공유', searchAliases: ['공유 링크', '부서 링크'] },
  { id: 'timetable_swap', label: '교환·대강 계획', icon: ArrowLeftRight, assistantCategory: '학사·기록', searchAliases: ['수업 교체', '대강', '공동 공강'] },
  { id: 'student_timetable', label: '학생별 시간표', icon: CalendarRange, assistantCategory: '학사·기록', searchAliases: ['개인 시간표', '학생 시간표'] },
  { id: 'attendance_print', label: '출석부 출력', icon: UsersRound, assistantCategory: '학사·기록', searchAliases: ['학급 출석부', '수업 출석부', '교사별 출석부'] },
  { id: 'volunteer_work', label: '봉사활동 업무', icon: HeartHandshake, assistantCategory: '학생·학사', searchAliases: ['봉사활동 확인서', '봉사 검증'] },
  { id: 'student_locator', label: '학생 위치 찾기', icon: SearchCheck, assistantCategory: '학사·기록', searchAliases: ['현재 교실', '학생 수업 찾기'] },
  { id: 'schoolinfo_evaluation', label: '타학교 평가계획', icon: Building2, assistantCategory: '학사·평가', searchAliases: ['다른 학교 평가계획', '학교알리미'] },
  { id: 'student_identity_audit', label: '학생 학번·이름 교정기', icon: ScanSearch, assistantCategory: '학사·기록', searchAliases: ['학번 이름 오류', '명단 교정'] },
  { id: 'subject_remarks_print', label: '교과세특 개별 인쇄기', icon: ScrollText, assistantCategory: '학사·기록', searchAliases: ['세특 인쇄', '교과세특'] },
  { id: 'staff_roster', label: '교직원 명렬', icon: UsersRound, assistantCategory: '학교운영', searchAliases: ['교원 명렬', '연수등록부'] },
  { id: 'committees', label: '각종 위원회 현황', icon: Landmark, assistantCategory: '학교운영', searchAliases: ['위원회 명단', '위원회 일정'] },
  { id: 'feature_requests', label: '기능개선 요청', icon: MessageSquareText, assistantCategory: '지원', searchAliases: ['개선 의견', '새 기능 요청'] },
  { id: 'transfer_score', label: '전보내신점수 계산기', icon: MapPinned, assistantCategory: '인사행정', searchAliases: ['전보 점수', '내신 이동'] },
  { id: 'grade_preview', label: '성적 산출 미리보기', icon: Calculator, assistantCategory: '성적', searchAliases: ['성적 미리보기', '성취도 분포'] },
  { id: 'estimated_split_score', label: '추정분할점수 도우미', icon: Table2, assistantCategory: '성적', searchAliases: ['분할점수', '정답률 역산'] },
  { id: 'curriculum', label: '교육과정 편제표 출력', icon: FileText, assistantCategory: '교육과정', searchAliases: ['편제표', '교육과정 출력'] },
  { id: 'form_center', label: '서식센터', icon: FilePenLine, assistantCategory: '서식 출력', searchAliases: ['학교 서식', '회의록', '계획서'] },
  { id: 'teacher_tools', label: '교사용 도구', icon: Wrench, assistantCategory: '개인 도구', searchAliases: ['명단 비교', '날짜 계산', '추첨'] },
  { id: 'excel_processor', label: 'Excel 전처리', icon: Table2, assistantCategory: '파일 처리', searchAliases: ['엑셀 정리', '명단 정리'] },
  { id: 'recommended_subjects', label: '대학 권장과목', icon: BookOpen, assistantCategory: '자료·진로', searchAliases: ['학과 권장과목', '선택과목 상담'] },
  { id: 'payroll', label: '호봉획정 계산기', icon: Calculator, assistantCategory: '인사행정', searchAliases: ['호봉 계산', '경력 인정'] },
  { id: 'insa_analysis', label: 'NEIS 인사기록 분석', icon: FileScan, assistantCategory: '인사행정', searchAliases: ['나이스 인사기록', '경력 분석'] },
  { id: 'pdf_extractor', label: 'PDF 텍스트 추출', icon: FileDown, assistantCategory: '파일 처리', searchAliases: ['PDF OCR', '스캔 PDF'] },
  { id: 'file_parser', label: '만능 파일 파서', icon: FileCode2, assistantCategory: '파일 처리', searchAliases: ['HWP 분석', '파일 구조 분석'] },
]

export const NAVIGATION_BY_ID = new Map(NAVIGATION_ITEMS.map(item => [item.id, item]))
export const SIDEBAR_MENU_OPTIONS = NAVIGATION_ITEMS.map(({ id, label }) => ({ id, label }))

