import { useState } from 'react'
import {
  ArrowLeftRight, Bell, BookOpen, ExternalLink, FileSpreadsheet, Files, HelpCircle,
  KeyRound, Link2, MessageSquareText, RefreshCw, School, ShieldCheck,
} from 'lucide-react'

const NEIS_KEY_URL = 'https://open.neis.go.kr/portal/guide/actKeyPage.do'

const NEIS_KEY_STEPS = [
  {
    title: '1. 관리자만 인증키 발급',
    detail: '학교 관리자가 아래 버튼으로 나이스 교육정보 개방 포털에 로그인하고 학교 공용으로 사용할 인증키 하나를 발급합니다.',
  },
  {
    title: '2. 활용 목적 입력',
    detail: '활용가이드 → 인증키 신청으로 이동합니다. 활용 목적에는 “웅천고 업무도우미의 급식·학사일정·시간표 조회”처럼 실제 용도를 적습니다.',
  },
  {
    title: '3. 관리자 모드에서 등록',
    detail: '업무도우미 관리자 모드를 시작한 뒤 환경설정 → NEIS Open API에서 발급된 키를 등록합니다.',
  },
  {
    title: '4. 일반 사용자는 바로 이용',
    detail: '등록된 키는 학교 공유 서버가 비공개로 보관합니다. 일반 교직원은 별도 발급이나 입력 없이 급식·학사일정·시간표를 조회합니다.',
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
      'NEIS API 키도 관리자가 학교 공유 서버에 한 번만 등록하며 일반 사용자는 입력하지 않습니다.',
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
      '출석부·학적업무·교육과정편제표의 작업자료는 각 교직원 PC에 저장됩니다.',
      '업무 알리미는 실제 미결 공문이 아니라 오늘의 학사일정과 학교 공지를 확인합니다.',
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
              학교 공용 NEIS Open API 인증키 설정
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              학교 관리자가 한 번만 설정합니다. 일반 사용자는 인증키를 발급하거나 입력할 필요가 없습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.electron?.openExternal(NEIS_KEY_URL)}
            className="px-3.5 py-2 rounded-lg bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            관리자용 NEIS 인증키 발급
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
          인증키는 Google Apps Script의 비공개 속성에만 저장되고 사용자 PC로 전달되지 않습니다. 메신저·공지·공유 문서에는 인증키를 올리지 마세요.
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
            Excel 전처리, 대학 권장과목, 호봉획정, 방과후 점검, 인사기록 분석,
            시간표 교체, 업무경감 도우미, 교육과정편제표, 사진대장, 학적업무, 출석부,
            위원회·비치 장부, PDF 추출, 파일 파서가 포함되어 있습니다.
          </p>
        </section>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 flex gap-3">
        <ShieldCheck size={18} className="text-emerald-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-200">개인정보 처리 원칙</p>
          <p className="text-xs text-emerald-100/70 mt-1 leading-relaxed">
            학생 원본 자료와 업로드한 Excel 파일은 로컬에서만 처리합니다. 학교 공유 서비스에는 공지·URL·기능개선 요청과
            교직원에게 공유할 교사 시간표 내용만 저장합니다.
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
