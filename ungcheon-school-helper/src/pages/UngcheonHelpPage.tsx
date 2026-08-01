import { useState } from 'react'
import {
  ArrowLeftRight, Bell, BookOpen, CalendarDays, ExternalLink, FileSpreadsheet, Files, HelpCircle,
  KeyRound, Link2, MapPinned, MessageSquareText, RefreshCw, School, Search, ShieldCheck,
} from 'lucide-react'

const NEIS_KEY_URL = 'https://open.neis.go.kr/portal/guide/actKeyPage.do'

const NEIS_KEY_STEPS = [
  {
    title: '1. 나이스 교육정보 개방 포털 로그인',
    detail: '아래 ‘NEIS 인증키 발급·확인’ 버튼을 누르고 Google·카카오·네이버·Facebook 계정 중 하나로 로그인합니다.',
  },
  {
    title: '2. 인증키 신청',
    detail: '활용가이드 → 인증키 신청으로 이동합니다. 활용 목적에는 “웅천고 업무도우미의 급식·학사일정·시간표 조회”처럼 실제 용도를 적습니다.',
  },
  {
    title: '3. 발급 상태와 인증키 확인',
    detail: '인증키 신청 화면에서 발급 상태를 확인하고, 발급된 인증키 문자열 전체를 복사합니다. NEIS 아이디나 비밀번호를 복사하는 것이 아닙니다.',
  },
  {
    title: '4. 프로그램에 입력',
    detail: '웅천고 업무도우미 → 환경설정 → NEIS API 키에 붙여넣고 ‘설정 저장’을 누릅니다. 키 앞뒤에 공백이 들어가지 않도록 주의합니다.',
  },
  {
    title: '5. 정상 작동 확인',
    detail: '대시보드에서 급식·학사일정·시간표를 확인합니다. 방학·휴업일에는 데이터가 없을 수 있으므로 대시보드 날짜를 수업일로 바꿔 확인합니다.',
  },
]

const SECTIONS = [
  {
    title: '처음 시작하기',
    icon: School,
    items: [
      '환경설정에서 교사 이름과 담당 학년·반을 입력합니다.',
      '대시보드에서 웅천고 급식·학사일정·시간표가 표시되는지 확인합니다.',
      '공유 서비스 URL은 관리자가 Google Apps Script 배포 후 한 번만 안내합니다.',
    ],
  },
  {
    title: '업무 도우미 검색',
    icon: Search,
    items: [
      '상단 “업무 검색”을 누르거나 Ctrl+K를 누른 뒤 “내 수업 출석부 출력하고 싶어”처럼 평소 말하듯 입력합니다.',
      '검색 결과에서 관련 메뉴, 단계별 사용법과 현재 설정된 교사 이름을 확인하고 “바로가기”로 이동합니다.',
      '최근 질문은 현재 PC에만 저장하며 “모두 지우기”로 삭제할 수 있습니다.',
      '외부 AI나 유료 API를 사용하지 않아 별도 비용이 없고, 입력한 질문도 PC 밖으로 전송되지 않습니다.',
      '도우미는 메뉴 안내와 이동만 수행하며 등록·삭제·출력 같은 작업은 사용자가 해당 화면에서 최종 확인합니다.',
      '프로그램 기능이나 메뉴가 변경될 때 검색 설명·단계·검색어도 함께 갱신하며, 누락 여부를 배포 전에 자동 검사합니다.',
    ],
  },
  {
    title: '학교 공유',
    icon: Link2,
    items: [
      '모든 교직원이 부서별 링크를 등록할 수 있으며 등록 즉시 전체에 반영됩니다.',
      '링크 삭제와 공지 등록·삭제에는 관리자 비밀번호가 필요합니다.',
      '학생 이름, 성적, 연락처 등 개인정보는 공유 링크 설명이나 공지에 입력하지 않습니다.',
    ],
  },
  {
    title: '관리자·기능개선',
    icon: MessageSquareText,
    items: [
      '프로그램은 항상 사용자 모드로 시작하며 상단의 사용자 버튼에서 관리자 비밀번호를 입력하면 관리자 모드가 시작됩니다.',
      '기능개선 요청은 새 기능과 기존 기능 개선으로 구분하고 작성자 실명을 입력해 등록합니다.',
      '관리자는 요청 상태와 답변을 등록하거나 부적절한 요청을 삭제할 수 있습니다.',
    ],
  },
  {
    title: '업무센터·교원 명렬',
    icon: FileSpreadsheet,
    items: [
      '로그인 도입 전에는 환경설정의 교사 이름을 업무 작성자와 응답자 확인 기준으로 사용합니다.',
      '관리자가 교원 명렬 Excel을 한 번 등록하면 교장·교감이 먼저, 나머지 교원이 가나다순으로 표시됩니다.',
      '업무센터에서 전체·부서·개별 교원에게 업무를 배부하고, 상태·중요도·마감일·관련 링크와 교원별 완료 현황을 관리할 수 있습니다.',
      '새로 배부된 업무, 오늘 마감, 3일 이내 마감 임박, 기한 초과 업무가 자동 분류되며 대시보드 업무 알림에서도 확인할 수 있습니다.',
      '새 업무 여부는 현재 PC와 환경설정의 교사 이름을 기준으로 하며 업무센터를 열면 확인 처리됩니다.',
      '개인 업무는 현재 PC에만 저장되며 대시보드와 캘린더에 함께 표시됩니다.',
      '교원 명렬에는 2026 업무분장에서 선별한 부서·교과·담임 정보만 반영합니다.',
      '연수등록부에서는 제목과 날짜를 입력해 교원 명렬이 반영된 2단 서명표를 인쇄하거나 PDF로 저장합니다.',
    ],
  },
  {
    title: '교환·대강 계획',
    icon: ArrowLeftRight,
    items: [
      '교사와 수업을 선택하면 같은 학급 수업을 맡으면서 서로 공강인 교환 후보를 찾아줍니다.',
      '교환 가능한 시간표 칸에는 상대 교사명과 해당 수업이 바로 표시되며, 그 칸을 눌러 예상 시간표를 열 수 있습니다.',
      '후보 교사를 누르면 교환·대강 적용 전후의 주간 시간표와 연강 변화를 미리 확인할 수 있습니다.',
      '대강에서는 색상 제한 수업도 선택할 수 있으며, 선택한 시간에 공강인 교사를 찾아 계획서에 추가할 수 있습니다.',
      '계획서 편집 화면에서 사유·기간·수업 정보를 수정하거나 행을 삭제한 뒤 HWP 또는 인쇄·PDF로 출력합니다.',
      '교환·대강 계획은 이 PC에만 임시 저장되며, 관리자가 올린 학교 공유 시간표 원본은 수정하지 않습니다.',
      '원본 시간표에서 색상이 지정된 수업은 기존 VBA 프로그램과 동일하게 교체 대상에서 제외합니다.',
      '관리자 모드의 “새 시간표 업로드”에서 XLSM·XLSX·XLS 파일을 선택하면 기존 공유 시간표 전체가 새 내용으로 교체됩니다.',
      '업로드한 Excel 파일과 VBA 코드는 전송하지 않고, 시간표 내용과 교체 제한 표시만 학교 공유 서비스에 저장합니다.',
    ],
  },
  {
    title: 'NEIS·학사',
    icon: BookOpen,
    items: [
      'NEIS 정보와 대시보드는 NEIS Open API를 사용하며 실제 NEIS 로그인 정보는 요구하지 않습니다.',
      '대시보드의 학사일정·주간계획은 교무기획부 공개 시트의 새 주간 탭을 자동으로 찾아 30분마다 갱신합니다.',
      '학생별 시간표는 관리자가 2학기 Excel 자료를 한 번 업로드하면 모든 사용자가 별도 파일 없이 조회·인쇄할 수 있습니다.',
      '앱을 실행하면 시간표·명렬·위원회 등 학교 공유자료를 실행 중 메모리에 미리 내려받습니다. 메뉴에서는 임시자료를 즉시 표시하고 서버 버전이 바뀐 경우에만 새 자료로 자동 교체합니다.',
      '시간표와 명렬 등 임시 공유자료는 앱 종료 시 자동 삭제되며, 환경설정의 “임시 저장자료 모두 삭제” 버튼으로 실행 중에도 바로 지울 수 있습니다.',
      '출석부 출력에서는 학급별 명렬과 이동수업 강좌 명렬을 출력하고, 교사별 담당 강좌 전체 또는 과목별 전체 분반을 묶음 인쇄·Excel 저장할 수 있습니다.',
      '성적 산출 미리보기는 기존 도구 그대로 평가항목별 점수 Excel을 합산해 환산점수·석차등급·성취도를 미리 확인하고, 복원용 정리 Excel로 작업을 옮길 수 있습니다.',
      '추정분할점수 도우미는 시험 전 희망 분할점수에 맞는 난이도별 예상 정답률 구성, 1·2차 시험과 수행평가를 반영한 성취도 분포 예측, 희망 분포에 필요한 2차 분할점수와 정답률 역산을 담당합니다. 선택형 배점이 0점이면 선택형을 계산에서 완전히 제외하고 서술형 정답률만 제시합니다.',
      '일반 사용자는 공유된 시간표를 변경하거나 Excel 원본을 내려받을 수 없습니다.',
      '교육과정 편제표 출력에서는 전학년·1학년·2학년·3학년 PDF와 과목선택 상담 기능을 이용할 수 있습니다.',
      '업무 알리미는 실제 미결 공문이 아니라 오늘의 학사일정과 학교 공지를 확인합니다.',
    ],
  },
  {
    title: '캘린더·개인 업무·메모',
    icon: CalendarDays,
    items: [
      '대시보드에서는 이번 주와 다음 주 일정만 크게 표시하며, “월간 캘린더” 버튼으로 전체 달력을 엽니다.',
      '캘린더에는 NEIS 학사일정·교무기획부 주간계획·내 위원회 일정·공유 업무·개인 업무가 색상별로 함께 표시됩니다.',
      '한 번 불러온 월별 일정은 앱을 켜 둔 동안 로컬 세션에 보관되어 다시 열 때 먼저 표시되고, 서버 변경 내용은 뒤에서 갱신됩니다. 앱을 종료하면 이 임시 일정 캐시는 삭제됩니다.',
      '날짜를 선택해 개인 업무의 마감일·시간·중요도·메모를 등록하고 완료 처리하거나 수정·삭제할 수 있습니다.',
      '개인 업무와 개인 메모는 현재 Windows 사용자 PC에만 저장되며 학교 공유 서버와 관리자에게 전송되지 않습니다.',
      '대시보드 개인 메모는 입력 후 자동 저장되고, 개인 업무는 대시보드에서도 바로 완료 처리할 수 있습니다.',
      '같은 Windows 계정을 여러 사람이 함께 사용한다면 개인 메모도 서로 보일 수 있으므로 공용 PC에는 민감한 내용을 기록하지 않습니다.',
    ],
  },
  {
    title: '서식센터',
    icon: FileSpreadsheet,
    items: [
      '학교명·학년도·담당 부서·작성자·결재란을 공통 정보로 입력하면 이 PC에 자동 저장됩니다.',
      '회의록, 행사 계획서, 결과보고서, 참가자 명단, 가정통신문, 위원회 개최 안내와 회의록을 작성할 수 있습니다.',
      '작성 중인 내용은 서식별로 이 PC에 자동 저장되며 학교 공유 서버나 관리자에게 전송되지 않습니다.',
      'A4 미리보기를 확인한 뒤 인쇄·PDF, Excel 저장 또는 한글에 붙여넣기 좋은 표 복사를 선택합니다.',
      '기존 연수등록부·출석부·교환보강 계획서는 서식센터 상단 바로가기로 연결됩니다.',
    ],
  },
  {
    title: '교사용 도구',
    icon: Files,
    items: [
      '명단 비교에서는 Excel·CSV를 불러오거나 표를 붙여넣고 이름, 학번·사번, 이름+생년월일 기준으로 비교합니다.',
      '공통 명단, 한쪽에만 있는 명단, 중복 이름·학번을 확인하고 결과를 복사하거나 Excel로 저장합니다.',
      '날짜 계산에서는 전체 일수, 주말과 직접 지정한 휴업일을 제외한 근무·수업 가능일, D-day, 만 나이와 학기 주차를 계산합니다.',
      '추첨·모둠에서는 공유 학생·교원 명렬을 불러오거나 직접 명단을 넣고 제외 대상, 같은 모둠·분리 조건을 지정할 수 있습니다.',
      '추첨 시각과 시드를 최근 기록에 남기며 결과는 인쇄·PDF 또는 Excel로 저장할 수 있습니다.',
    ],
  },
  {
    title: '전보내신점수 계산기',
    icon: MapPinned,
    items: [
      '2027 경상남도교육청 중등 일반교사 기준의 근무경력점·교육활동경력점·가산점을 합산합니다.',
      '웅천고등학교는 라급지·연 5.5점으로 기본 설정되며, 최근 3년 근무경력점과 최근 5년 교육활동 경력을 자동 반영합니다.',
      '휴직·정직·직위해제와 평정 제외 파견 기간은 빼고 실제 근무 구간만 입력하며, 급지가 바뀐 경력은 구간을 나누어 입력합니다.',
      '담임·부장·공동교육과정 등은 인정받을 실제 월수만 입력하고, 표창·상장·대회지도는 동일 실적과 동일 학년도 중복 여부를 확인합니다.',
      '입력 내용은 현재 PC에만 자동 저장되고, 결과 산출표는 인쇄하거나 PDF로 저장할 수 있습니다.',
      '자동 계산은 참고용이므로 증빙 인정, 제외 기간과 예외 규정은 학교 인사 담당자에게 최종 확인합니다.',
    ],
  },
  {
    title: '파일 처리',
    icon: Files,
    items: [
      'Excel 전처리와 파일 파서는 원본 파일을 직접 덮어쓰지 않고 새 결과 파일을 만듭니다.',
      '일반 PDF는 텍스트를 바로 추출하고 스캔 PDF는 OCR 도구가 필요할 수 있습니다.',
      'NEIS 인사기록 등 민감한 파일은 학교 공유 서비스로 전송하지 않고 이 PC에서 처리합니다.',
    ],
  },
  {
    title: '업데이트',
    icon: Bell,
    items: [
      '프로그램 시작 시 GitHub Releases에서 새 버전을 확인합니다.',
      '새 버전이 있으면 백그라운드에서 내려받은 뒤 “지금 설치” 버튼이 표시됩니다.',
      '업데이트 후에도 개인 설정과 로컬 작업자료는 사용자 데이터 폴더에 유지됩니다.',
      '공지와 공유 링크 변경에는 프로그램 재설치가 필요하지 않습니다.',
      '새 버전의 기능 개선 내용은 공지사항에 [업데이트] 제목으로 누적 게시됩니다.',
    ],
  },
]

export default function UngcheonHelpPage() {
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  const checkUpdate = async () => {
    setCheckingUpdate(true)
    try {
      await window.electron?.checkForUpdates()
    } finally {
      window.setTimeout(() => setCheckingUpdate(false), 800)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <header>
        <h1 className="page-title flex items-center gap-2"><HelpCircle size={23} className="text-emerald-400" /> 사용 매뉴얼</h1>
        <p className="text-sm text-slate-400 mt-1">웅천고 업무도우미의 핵심 사용법입니다.</p>
      </header>

      <section className="card p-5 border border-sky-500/20">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="font-semibold text-white flex items-center gap-2">
              <KeyRound size={17} className="text-sky-400" />
              NEIS Open API 인증키 발급·입력
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              급식·학사일정·시간표 조회용 공개 API 키입니다. 업무포털·NEIS 로그인 비밀번호와는 전혀 다릅니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.electron?.openExternal(NEIS_KEY_URL)}
            className="px-3.5 py-2 rounded-lg bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            NEIS 인증키 발급·확인
            <ExternalLink size={13} />
          </button>
        </div>

        <ol className="grid md:grid-cols-2 gap-3">
          {NEIS_KEY_STEPS.map(step => (
            <li key={step.title} className="rounded-xl bg-white/[0.025] border border-white/5 p-4">
              <p className="text-sm font-semibold text-slate-200">{step.title}</p>
              <p className="text-xs text-slate-400 leading-relaxed mt-1.5">{step.detail}</p>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-600 leading-relaxed">
          인증키는 교직원에게 메신저나 공지로 공개하지 마세요. 이 프로그램에 저장한 키는 Windows 보안 저장소로 암호화되며 해당 PC에만 보관됩니다.
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {SECTIONS.map(section => {
          const Icon = section.icon
          return (
            <section key={section.title} className="card p-5">
              <h2 className="font-semibold text-white flex items-center gap-2 mb-4"><Icon size={16} className="text-violet-400" />{section.title}</h2>
              <ul className="space-y-3">
                {section.items.map(item => <li key={item} className="text-sm text-slate-400 leading-relaxed flex gap-2"><span className="text-emerald-400">•</span>{item}</li>)}
              </ul>
            </section>
          )
        })}
        <section className="card p-5">
          <h2 className="font-semibold text-white flex items-center gap-2 mb-4"><FileSpreadsheet size={16} className="text-violet-400" />선택된 도구</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Excel 전처리, 대학 권장과목, 호봉획정, 전보내신점수 계산, 방과후 점검, 인사기록 분석,
            시간표 교체, 교육과정 편제표 출력, 과목선택 상담, 사진대장, 학적업무, 출석부,
            위원회 명단·캘린더, PDF 추출, 파일 파서가 포함되어 있습니다.
          </p>
        </section>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 flex gap-3">
        <ShieldCheck size={18} className="text-emerald-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-200">개인정보 처리 원칙</p>
          <p className="text-xs text-emerald-100/70 mt-1 leading-relaxed">
            업로드한 Excel 원본은 관리자 PC에서만 처리하며 서버로 보내지 않습니다. 학교 공유 서비스에는 공지·URL·기능개선 요청,
            교원 명렬, 업무 체크 응답, 교사 시간표와 학생 명렬·수업별 조회·인쇄에 필요한 학번·이름·수업 정보만 저장합니다. 성적·연락처는 저장하지 않습니다.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={checkUpdate}
          disabled={checkingUpdate}
          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 text-xs text-slate-300 flex items-center gap-2 transition-colors"
        >
          <RefreshCw size={13} className={checkingUpdate ? 'animate-spin' : ''} />
          {checkingUpdate ? '업데이트 확인 중' : '지금 업데이트 확인'}
        </button>
      </div>
    </div>
  )
}
