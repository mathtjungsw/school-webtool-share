import { useState, useEffect } from 'react'
import {
  HelpCircle, LayoutDashboard, Radio, ShieldCheck, Brain,
  Table2, Calculator, Users, BookOpen, FileText, Shield,
  GraduationCap, Backpack, Archive, DollarSign, Briefcase,
  ClipboardList, School, ShoppingCart, FileSearch, Bell,
  Settings, ChevronDown, ChevronRight, ExternalLink, Zap,
  MessageCircle, Globe, Info, Star, RefreshCw,
  Landmark, Cloud, CircleDot, FileSpreadsheet
} from 'lucide-react'
import clsx from 'clsx'

interface Section {
  id: string
  icon: React.ElementType
  color: string
  title: string
  description: string
  steps?: string[]
  tips?: string[]
  apiRequired?: 'gemini' | 'any'
}

const SECTIONS: Section[] = [
  // ── 공통 ──
  {
    id: 'settings',
    icon: Settings,
    color: 'text-slate-400',
    title: '환경설정',
    description: '앱을 처음 사용하기 전에 반드시 설정해야 하는 항목들입니다.',
    steps: [
      '학교명 검색: 학교 이름 입력 후 검색 버튼을 눌러 학교를 선택합니다.',
      '담당 학년/반: 담임 학년과 반을 설정하면 대시보드에서 해당 반 시간표가 자동으로 표시됩니다.',
      'NEIS 공용자료: 일반 사용자는 API 키를 입력하지 않습니다. 등록된 관리자 PC가 매일 13시에 오늘 포함 10일치 급식·학사일정·학급 시간표를 자동으로 갱신합니다.',
      'AI 모델 설정: Gemini(무료), Claude, ChatGPT 중 사용할 AI를 선택하고 API 키를 입력합니다.',
    ],
    tips: [
      '13시에 관리자 PC가 꺼져 있었다면 다음 프로그램 실행 시 누락된 동기화를 자동으로 보충합니다.',
      'API 키는 등록된 관리자 PC의 Windows 보안 저장소에만 암호화해 보관되며 구글시트에는 저장되지 않습니다.',
      'Gemini API는 Google AI Studio에서 무료로 발급받을 수 있습니다.',
      '생기부 AI 기능을 모두 사용하려면 Gemini를 권장합니다.',
    ],
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    color: 'text-sky-400',
    title: '대시보드',
    description: '이번 주 시간표를 한눈에 확인할 수 있습니다.',
    steps: [
      '환경설정에서 학교와 담당 학년/반을 설정하면 자동으로 시간표가 불러와집니다.',
      '화살표 버튼으로 이전/다음 주를 탐색할 수 있습니다.',
      '오늘 날짜는 파란색으로 강조 표시됩니다.',
    ],
    tips: [
      '학교와 담당 학년/반이 모두 설정되어야 시간표가 표시됩니다.',
    ],
  },
  // ── AI 업무도우미 ──
  {
    id: 'saenggibu_check',
    icon: ShieldCheck,
    color: 'text-emerald-400',
    title: '학생부 점검',
    description: 'PDF로 된 생활기록부를 AI가 검토하여 교육부 기재요령 위반 여부를 확인합니다.',
    steps: [
      '파일 선택 버튼을 눌러 생기부 PDF를 불러옵니다.',
      '분석 시작 버튼을 클릭하면 AI가 내용을 분석합니다.',
      '결과는 OK / 주의 / 오류 세 단계로 표시됩니다.',
      '각 항목을 클릭하면 구체적인 위반 내용과 수정 제안을 확인할 수 있습니다.',
    ],
    tips: [
      'Gemini 사용 시 가장 정확한 결과를 얻을 수 있습니다.',
      '분석에 30초~2분 정도 소요될 수 있습니다.',
    ],
    apiRequired: 'any',
  },
  {
    id: 'saenggibu_master',
    icon: Brain,
    color: 'text-violet-400',
    title: '학생부 분석',
    description: '생활기록부 PDF를 분석하여 심층분석, 성적분석, 전공추천, 탐구주제 등을 제공합니다.',
    steps: [
      '파일 선택 버튼으로 생기부 PDF를 업로드합니다.',
      '분석 시작을 누르면 여러 탭에 걸쳐 결과가 생성됩니다.',
      '심층분석 탭: 학생 역량 종합 분석',
      '성적분석 탭: 교과 성취 패턴 분석 (Gemini 전용)',
      '전공추천 탭: 적합 학과 추천 (Gemini 전용)',
      '탐구주제 탭: 세특 작성용 탐구 주제 제안 (Gemini 전용)',
    ],
    tips: [
      'Claude/ChatGPT는 심층분석 탭만 지원합니다. 전체 기능은 Gemini를 사용하세요.',
    ],
    apiRequired: 'any',
  },
  {
    id: 'official_doc_writer',
    icon: FileText,
    color: 'text-cyan-400',
    title: '공문서 작성 AI',
    description: '행정업무규정에 맞는 공문서를 AI가 자동으로 작성합니다.',
    steps: [
      '문서 종류를 선택하고 핵심 내용을 입력합니다.',
      'AI 작성 버튼을 누르면 규정에 맞는 공문서 초안이 생성됩니다.',
      '결과를 직접 편집하거나 복사하여 사용합니다.',
    ],
    apiRequired: 'any',
  },
  {
    id: 'excel_processor',
    icon: Table2,
    color: 'text-teal-400',
    title: 'Excel 전처리',
    description: 'NEIS에서 받은 Excel 파일의 데이터를 정리합니다.',
    steps: [
      'Excel 파일 선택 버튼으로 .xlsx 파일을 불러옵니다.',
      '원하는 처리 옵션을 체크합니다: 공백 제거, 날짜 형식 통일, 결측치 처리, 중복 행 제거',
      '전처리 시작 버튼을 클릭합니다.',
      '처리 완료 후 저장 버튼으로 결과 파일을 저장합니다.',
    ],
  },
  {
    id: 'kireyo_guide',
    icon: HelpCircle,
    color: 'text-emerald-300',
    title: '기재요령 도우미',
    description: '2026학년도 고등학교 학교생활기록부 기재요령을 빠르게 검색하고, 상황별 시나리오 안내를 제공합니다.',
    steps: [
      '상단 검색창에 키워드를 입력하면 PDF 원문 전체에서 즉시 검색됩니다.',
      '시나리오 카드(결석, 수상, 봉사 등)를 클릭하면 상황별 단계 안내(위자드)가 열립니다.',
      '카테고리를 클릭하면 해당 영역의 핵심 규칙과 세부 시나리오를 확인할 수 있습니다.',
      'FAQ 섹션에서 자주 묻는 질문과 답변을 확인합니다.',
    ],
    tips: [
      '검색어 예시: 결석, 수상, 봉사, 학폭, 귀국, 자격증, 세특, 제17조 등',
      '전체화면 버튼(우상단)으로 더 넓게 볼 수 있습니다.',
      '제작: 이은덕 선생님 (은평메디텍고등학교 스마트AI과)',
    ],
  },
  // ── 인사행정 ──
  {
    id: 'payroll',
    icon: Calculator,
    color: 'text-yellow-400',
    title: '호봉획정 계산기',
    description: '경력 사항을 입력하면 초임 호봉을 자동으로 계산합니다.',
    steps: [
      '자격증 종류와 최종 학력을 선택합니다.',
      '경력 추가 버튼으로 각 근무 경력을 입력합니다.',
      '계산하기 버튼을 누르면 환산 경력과 초임 호봉이 표시됩니다.',
    ],
    tips: [
      '기간제 교사 경력은 환산율 80%로 적용됩니다.',
      '벽지 학교 근무 경력은 별도 체크박스를 선택하세요.',
    ],
  },
  {
    id: 'contract',
    icon: Users,
    color: 'text-orange-400',
    title: '계약제교원 발령관리',
    description: '계약제(기간제) 교원의 인적사항과 발령 이력을 관리합니다.',
    steps: [
      '교원 추가 버튼으로 기간제 교사 정보를 입력합니다.',
      '발령 탭에서 각 교원의 발령 이력을 관리합니다.',
      'Excel 내보내기로 NEIS 업로드용 서식을 생성합니다.',
    ],
  },
  // ── 학사관리 ──
  {
    id: 'exam_score',
    icon: FileSpreadsheet,
    color: 'text-emerald-400',
    title: '지필평가 성적확인',
    description: 'NEIS 정오표(교과목별 학생답 정오표) 파일을 업로드하여 학생별 성적과 문항별 정오 현황을 확인합니다.',
    steps: [
      'NEIS → 지필평가 → 교과목별 학생답 정오표를 xlsx 파일로 다운로드합니다.',
      '업로드 영역에 xlsx 파일을 끌어다 놓거나 클릭하여 선택합니다. (여러 반 동시 업로드 가능)',
      '왼쪽 목록에서 학생을 선택하면 선택형/서답형/총점과 문항별 정오 현황이 표시됩니다.',
      '방향키(◀ ▶) 또는 이전/다음 버튼으로 학생을 빠르게 이동할 수 있습니다.',
    ],
    tips: [
      '여러 반의 정오표를 한 번에 올리면 시험·과목·반별로 자동 분류됩니다.',
      '○는 정답, 숫자는 학생이 선택한 보기 번호, —는 무표기를 의미합니다.',
    ],
  },
  {
    id: 'new_semester_class',
    icon: Users,
    color: 'text-sky-400',
    title: '새학기 반배정',
    description: '반별 학생 배치를 수동으로 조정하고, 교환 이력을 관리합니다.',
    steps: [
      'JSON 불러오기 버튼으로 data.json 형식 파일을 불러오거나, Excel 불러오기로 엑셀 파일을 가져옵니다.',
      'Excel 형식: 학년, 반, 번호, 이름, 성별, 성적, 이전반 컬럼이 필요합니다.',
      '학생 카드를 클릭하면 선택(금색 강조) 상태가 되고, 다른 학생을 클릭하면 두 학생이 교환됩니다.',
      '별(★) 아이콘을 클릭하면 해당 학생을 특별 표시(파란색)할 수 있습니다.',
      '교환 이력 버튼으로 이력 패널을 열고, 되돌리기 버튼으로 교환을 취소합니다.',
      'JSON 저장 또는 Excel 내보내기로 결과를 파일로 저장합니다.',
      '반 추가 카드(+)를 클릭하면 새 반을 생성할 수 있습니다.',
    ],
    tips: [
      '같은 반 안에서 학생을 클릭해도 교환되지 않습니다(같은 반 내 이동).',
      '그룹 1/그룹 2 탭으로 두 개의 학년 데이터를 분리 관리합니다.',
      '제작: 김재현 선생님',
    ],
  },
  // ── 학생지도 ──
  {
    id: 'attendance',
    icon: Users,
    color: 'text-emerald-400',
    title: '출석체크(연수자명부)',
    description: '학생 출석을 날짜별로 기록하고 출석률 통계를 확인합니다.',
    steps: [
      '설정 탭에서 관리자 PIN(기본 0000) 입력 후 학생을 추가합니다.',
      '일괄 입력 기능으로 "번호 이름" 형식으로 여러 학생을 한 번에 추가할 수 있습니다.',
      '출석 체크 탭에서 날짜를 선택하고 각 학생의 출석/지각/결석 버튼을 누릅니다.',
      '같은 버튼을 다시 클릭하면 해당 기록이 취소됩니다.',
      '출석 현황 탭에서 최근 2주간 출결 내역을 표 형태로 확인합니다.',
      '통계 탭에서 학생별 출석률을 막대 그래프로 확인합니다.',
      '엑셀 내보내기 버튼으로 전체 출석 기록을 xlsx 파일로 저장합니다.',
    ],
    tips: [
      '기본 관리자 PIN은 0000입니다. 보안을 위해 설정 탭에서 변경하세요.',
      '출석 현황 표의 셀을 클릭하면 해당 기록을 취소할 수 있습니다.',
      '출석 체크 탭 상단 카드(출석/지각/결석)를 클릭하면 전체 학생에게 일괄 적용됩니다.',
    ],
  },
  // ── 학교운영 ──
  {
    id: 'committees',
    icon: Landmark,
    color: 'text-indigo-400',
    title: '각종 위원회',
    description: '학교 내 각종 위원회 현황을 관리하고 조회합니다.',
    steps: [
      '위원회 종류를 선택하여 현황을 확인합니다.',
      '위원 추가/수정/삭제 기능으로 정보를 관리합니다.',
    ],
  },
  // ── 공문서·업무 ──
  {
    id: 'documents',
    icon: FileSearch,
    color: 'text-cyan-400',
    title: '공문서·학생부 검색',
    description: 'HWP/PDF 문서를 파싱하고 AI로 공문서를 작성합니다.',
    steps: [
      '[파서 탭] 파일 선택 후 변환하면 HWP/PDF가 텍스트로 변환됩니다.',
      '[AI 작성 탭] 문서 종류를 선택하고 핵심 내용을 입력하면 AI가 공문서를 작성합니다.',
      '결과 텍스트를 직접 편집하거나 복사하여 사용합니다.',
    ],
    apiRequired: 'any',
  },
  // ── 게임 ──
  {
    id: 'score_gomoku',
    icon: CircleDot,
    color: 'text-indigo-400',
    title: '점수 오목',
    description: '5×5~7×7 보드에서 연속된 돌의 길이로 점수를 내는 점수제 오목 게임입니다. 오프라인 AI와 대전하거나 두 명이 함께 즐길 수 있습니다.',
    steps: [
      '게임 모드: "vs AI"는 컴퓨터와 대전, "2인 대전"은 같은 기기에서 두 명이 대전합니다.',
      '보드 크기: 5×5, 6×6, 7×7 중 선택합니다. 클수록 게임이 길어집니다.',
      'AI 난이도: 쉬움/중간/어려움 중 선택 (vs AI 모드 전용).',
      '선공: O(하늘색) 또는 X(붉은색) 중 먼저 둘 플레이어를 선택합니다.',
      '핸디캡: 후공 플레이어가 보너스 점수를 받습니다 (5×5:+2pt, 6×6:+3pt, 7×7:+4pt).',
      '점수: 3연속=1pt, 4연속=3pt, 5연속=5pt, 6연속=7pt, 7연속=9pt.',
      '제한시간: 각 턴마다 30초가 주어지며, 초과 시 상대방이 승리합니다.',
      '게임 종료 후 리플레이 버튼으로 수순을 다시 볼 수 있습니다.',
    ],
    tips: [
      'Elo 레이팅 시스템: vs AI 모드에서 이기면 레이팅이 오르고 지면 내려갑니다.',
      '시즌 기능: 시즌을 종료하면 실적이 기록되고 새 시즌이 시작됩니다.',
      '리더보드: 보드 크기별 상위 10개 점수가 저장됩니다.',
      '완전 오프라인으로 작동하며 인터넷 연결이 필요 없습니다.',
    ],
  },
  {
    id: 'streams',
    icon: Zap,
    color: 'text-indigo-400',
    title: '스트림스 마스터',
    description: '오름차순으로 숫자를 배치하는 전략 게임입니다. 닉네임을 입력하고 바로 플레이할 수 있습니다.',
    tips: [
      '인터넷 연결 없이 오프라인으로 즐길 수 있습니다.',
      '게임 규칙은 게임 화면 내 안내를 참고하세요.',
    ],
  },
  {
    id: 'quixo',
    icon: Info,
    color: 'text-indigo-400',
    title: 'Quixo 보드게임',
    description: '5×5 보드에서 가장자리 큐브를 선택해 밀어넣는 방식으로 같은 기호 5개를 한 줄로 만드는 전략 보드게임입니다.',
    steps: [
      '게임 모드(2인/AI 대전)와 난이도를 선택한 뒤 시작합니다.',
      '자신의 차례에 가장자리에 있는 빈 칸 또는 자신의 기호가 있는 칸을 클릭해 선택합니다.',
      '초록색으로 표시된 목적지를 클릭하면 해당 방향으로 행/열 전체가 밀립니다.',
      '같은 기호 5개가 가로·세로·대각선 중 하나로 완성되면 승리합니다.',
    ],
    tips: [
      'ESC를 누르거나 같은 칸을 다시 클릭하면 선택이 취소됩니다.',
      '구석 큐브는 가로 또는 세로 두 방향 중 선택해 밀 수 있습니다.',
    ],
  },
  // ── 기타 ──
  {
    id: 'notifier',
    icon: Bell,
    color: 'text-amber-400',
    title: '공문알리미',
    description: '새 공문서 도착 시 소리와 알림으로 알려줍니다.',
    steps: [
      '학교 포털 ID/비밀번호를 입력하고 모니터링 시작을 누릅니다.',
      '새 공문이 오면 알림음과 팝업으로 알려줍니다.',
      '알림 간격, 소리 여부를 설정에서 조절할 수 있습니다.',
    ],
    tips: [
      '앱을 최소화해도 계속 모니터링됩니다.',
    ],
  },
  {
    id: 'student_report_checker',
    icon: ShieldCheck,
    color: 'text-rose-400',
    title: '학생부 AI 점검',
    description: '학생부 파일을 AI가 검토하여 기재요령 위반 및 오류를 자동으로 찾아냅니다.',
    steps: [
      '파일 선택 버튼으로 학생부 파일을 불러옵니다.',
      '점검 시작 버튼을 클릭하면 AI가 내용을 분석합니다.',
      '결과는 위반 항목별로 정리되어 표시됩니다.',
    ],
    apiRequired: 'any',
  },
  {
    id: 'tic_tac_toe',
    icon: Star,
    color: 'text-indigo-400',
    title: '틱택토 (점수제)',
    description: '기존 틱택토와 달리 한 줄을 완성할 때마다 줄 길이에 따른 점수를 얻고, 보드가 꽉 차면 점수가 높은 쪽이 이기는 점수제 버전입니다.',
    steps: [
      '보드 크기(5×5 / 6×6 / 7×7), 게임 모드(2인/AI 대전/AI vs AI), 난이도를 선택합니다.',
      '게임 화면에서 빈 칸을 클릭해 말을 놓습니다. AI 모드에서는 AI가 자동으로 수를 둡니다.',
      '💡 추천수 버튼을 누르면 AI가 추천하는 최적의 위치를 보라색으로 표시합니다.',
      '보드가 꽉 차면 게임이 종료되고 최종 점수가 표시됩니다.',
    ],
    tips: [
      '줄 점수: 3목=1점, 4목=4점, 5목=9점, 6목=16점, 7목=25점',
      '후공(X)에게 핸디캡 점수가 부여됩니다 (5×5: +2점, 7×7: +3점)',
      '제작: 전북/김학례 선생님',
    ],
  },
  {
    id: 'weather',
    icon: Cloud,
    color: 'text-sky-300',
    title: '날씨 표시',
    description: '대시보드 상단에 학교 위치 기반 현재 날씨가 표시됩니다.',
    steps: [
      '환경설정에서 학교를 설정하면 학교 주소 기반으로 자동 날씨를 가져옵니다.',
      '두 번째 장소(예: 자택)도 환경설정에서 추가할 수 있습니다.',
    ],
    tips: [
      '날씨 정보는 기상청 단기예보 API를 사용합니다.',
    ],
  },
]

const FAQ = [
  {
    q: 'Gemini API 키는 어디서 받나요?',
    a: 'Google AI Studio(aistudio.google.com)에 구글 계정으로 로그인 후 "Get API key"를 클릭하면 무료로 발급됩니다.',
  },
  {
    q: '생기부 PDF 분석이 안 돼요.',
    a: 'AI API 키가 환경설정에 입력되어 있는지 확인하세요. 또한 PDF가 이미지 스캔 형식이 아닌 텍스트 PDF여야 합니다.',
  },
  {
    q: '일반 사용자도 NEIS API 키를 발급받아야 하나요?',
    a: '아닙니다. 등록된 관리자 PC 한 대만 API 키를 보관하며, 일반 사용자는 관리자가 동기화한 공용 급식·학사일정·학급 시간표를 조회합니다.',
  },
  {
    q: '시간표가 안 보여요.',
    a: '환경설정에서 담당 학년/반을 확인하고, 공용 NEIS 자료의 마지막 동기화 시각이 오래되었다면 관리자에게 동기화를 요청하세요.',
  },
  {
    q: '자동 업데이트는 어떻게 되나요?',
    a: '앱 실행 시 자동으로 새 버전을 확인합니다. 업데이트가 있으면 화면 중앙 팝업으로 알림이 표시되며, "지금 설치" 버튼을 누르면 자동으로 재시작 후 업데이트가 적용됩니다.',
  },
]

export function HelpContent() {
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [version, setVersion] = useState('')
  useEffect(() => {
    window.electron?.getVersion().then(setVersion)
  }, [])

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-sky-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
          <HelpCircle size={18} className="text-violet-400" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">사용 매뉴얼</h2>
          <p className="text-xs text-slate-400 mt-0.5">학교업무도우미 {version ? `v${version}` : ''} — 기능 안내</p>
        </div>
      </div>

      {/* Quick start */}
      <div className="bg-gradient-to-br from-violet-500/10 to-sky-500/5 border border-violet-500/20 rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Star size={13} className="text-violet-400" />
          <span className="text-xs font-semibold text-violet-300">빠른 시작</span>
        </div>
        <ol className="space-y-1.5 text-xs text-slate-300">
          <li className="flex gap-2"><span className="text-violet-400 font-bold flex-shrink-0">1.</span>AI 기능은 환경설정 → AI 모델 설정에서 <strong>Gemini API 키</strong> 입력.</li>
          <li className="flex gap-2"><span className="text-violet-400 font-bold flex-shrink-0">2.</span>저장 후 <strong>대시보드</strong>에서 이번 주 시간표를 확인합니다.</li>
          <li className="flex gap-2"><span className="text-violet-400 font-bold flex-shrink-0">3.</span><strong>구글 캘린더</strong>가 잘 열리는지 확인합니다.</li>
        </ol>
      </div>

      {/* Feature sections */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-1">기능별 사용법</h3>
        {SECTIONS.map((sec) => {
          const Icon = sec.icon
          const open = openSection === sec.id
          return (
            <div key={sec.id} className="bg-surface-800/50 border border-white/5 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenSection(open ? null : sec.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/3 transition-colors"
              >
                <Icon size={16} className={clsx('flex-shrink-0', sec.color)} />
                <span className="flex-1 text-sm font-medium text-slate-200">{sec.title}</span>
                {sec.apiRequired && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-medium mr-2">AI 필요</span>
                )}
                {open
                  ? <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
                  : <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                }
              </button>

              {open && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                  <p className="text-sm text-slate-400">{sec.description}</p>

                  {sec.steps && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">사용 방법</p>
                      <ol className="space-y-1">
                        {sec.steps.map((step, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-300">
                            <span className="text-slate-600 flex-shrink-0 font-mono text-xs mt-0.5">{String(i + 1).padStart(2, '0')}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {sec.tips && (
                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 space-y-1">
                      {sec.tips.map((tip, i) => (
                        <div key={i} className="flex gap-2 text-xs text-amber-300/80">
                          <Info size={11} className="flex-shrink-0 mt-0.5" />
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* FAQ */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-1">자주 묻는 질문</h3>
        {FAQ.map((faq, i) => {
          const open = openFaq === i
          return (
            <div key={i} className="bg-surface-800/50 border border-white/5 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(open ? null : i)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/3 transition-colors"
              >
                <span className="flex-1 text-sm font-medium text-slate-200">Q. {faq.q}</span>
                {open
                  ? <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
                  : <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                }
              </button>
              {open && (
                <div className="px-4 pb-3.5 border-t border-white/5 pt-3">
                  <p className="text-sm text-slate-400 leading-relaxed">A. {faq.a}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Links */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => window.electron?.openExternal('https://edu-hub-teal-two.vercel.app/neis')}
          className="flex items-center gap-3 px-4 py-3.5 bg-surface-800/50 border border-white/5 rounded-xl hover:border-sky-500/30 hover:bg-sky-500/5 transition-all group text-left"
        >
          <Globe size={16} className="text-slate-500 group-hover:text-sky-400 transition-colors flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">EduHub NEIS</p>
            <p className="text-xs text-slate-600">neis 정보 서비스</p>
          </div>
          <ExternalLink size={11} className="text-slate-600 ml-auto flex-shrink-0" />
        </button>

        <button
          onClick={() => window.electron?.openExternal('https://open.kakao.com/o/g0EqmsRh')}
          className="flex items-center gap-3 px-4 py-3.5 bg-surface-800/50 border border-white/5 rounded-xl hover:border-amber-500/30 hover:bg-amber-500/5 transition-all group text-left"
        >
          <MessageCircle size={16} className="text-slate-500 group-hover:text-amber-400 transition-colors flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">오픈채팅방</p>
            <p className="text-xs text-slate-600">문의 및 건의</p>
          </div>
          <ExternalLink size={11} className="text-slate-600 ml-auto flex-shrink-0" />
        </button>
      </div>

      {/* Version footer */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-600 pb-2">
        <span>학교업무도우미 {version ? `v${version}` : ''}</span>
        <span>·</span>
        <span>제작: 남원고 수학인생 김학례</span>
      </div>

    </div>
  )
}

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <HelpContent />
    </div>
  )
}
