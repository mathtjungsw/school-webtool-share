import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Users, Scale, ChevronDown, ChevronUp, Building2, BookOpen } from 'lucide-react'
import clsx from 'clsx'

interface Committee {
  name: string
  schoolTypes: string[]
  legal: boolean
  memberCount: string
  chair: string
  role: string
  basis: string
  note?: string
}

const COMMITTEES: Committee[] = [
  { name: '학교운영위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '학생수에 따라 5~15인', chair: '호선', role: '학교헌장·학칙 제·개정, 학교예산·결산, 교육과정 운영, 교과용도서 선정 등 심의', basis: '초·중등교육법 제31조', note: '예·결산 소위원회 의무 설치(100명 미만 면제)' },
  { name: '예결산소위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '학교운영위원회 위임 구성', chair: '호선', role: '학교 예·결산 실무 검토 및 학교운영위원회 심의 자료 준비', basis: '초·중등교육법 제31조', note: '공립 학교회계 규칙 제13조 제4항, 100명 미만 학교 미구성 가능' },
  { name: '학교급식소위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '9명 이내(학부모 1명 이상)', chair: '호선', role: '학교급식운영계획(안) 실무 검토, 학교급식모니터링 등', basis: '초·중등교육법시행령 제60조의2', note: '학교운영위원회와 통합 구성 가능하되 기능·운영 유지' },
  { name: '학교체육소위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '9명 이내(학부모 1명 이상)', chair: '학교운영위원회 위원', role: '체육교육과정 개선, 학생건강체력평가, 학교스포츠클럽 및 운동부 운영, 학교체육행사 개최 등 심의', basis: '경기도 학교체육진흥위원회 구성 및 운영에 관한 조례', note: '' },
  { name: '방과후학교소위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '수요자 중심 5인 이상', chair: '호선', role: '방과후·돌봄 운영계획 등 운영 전반 심의', basis: '학교운영위원회 위임', note: '학생복지심사위원회와 통합 운영 가능' },
  { name: '학교교육과정위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '적정 인원(교원, 학부모, 전문가 등)', chair: '교장 또는 교감', role: '학교 교육과정 편성·운영·평가에 대한 심의·자문, 교장의 교육과정 운영 및 의사결정 자문', basis: '초중등학교 교육과정 총론(교육부고시 2022-33호)', note: '위원회가 별도 미구성 시 학교교육과정위원회로 업무 추진 가능' },
  { name: '학업성적관리위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '적정 인원(위원장: 부기관장)', chair: '교감', role: '학생 평가·관리 및 학업성적 관련 사항, 학교생활기록부 기록 및 정정 사항 심의', basis: '초등/중등 학업성적관리 시행지침', note: '' },
  { name: '학교폭력전담기구', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '전담기구 운영 규정에 따름', chair: '교감', role: '학교폭력 사실 확인 및 사안조사, 학교장 자체해결 부의여부 심의, 학교장 긴급조치 여부 심의, 졸업 전 가해학생 조치사항 삭제 심의 등', basis: '학교폭력예방 및 대책에 관한 법률 제14조', note: '2026 학교폭력 사안처리 가이드북 참조' },
  { name: '학생생활교육위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '학교 규모에 따라 결정', chair: '교감', role: '학생 선도 및 생활교육에 대한 사항, 학생생활규정 제정·개정 심의', basis: '학생생활규정 운영 매뉴얼', note: '' },
  { name: '학생봉사활동추진위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '7명 이내(부위원장: 교감, 담당부장)', chair: '교장', role: '학생봉사활동 운영 계획 검토, 봉사활동 프로그램 심의', basis: '경기도교육청 학교 학생봉사활동추진위원회 설치 및 운영에 관한 조례 제3조', note: '소규모학교는 교육과정위원회 등과 통합 운영 가능' },
  { name: '에너지절약추진위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '5~10명(위원장: 교감, 부위원장: 담당부장)', chair: '교감', role: '에너지이용 합리화 추진, 연간 에너지절약계획 수립 및 추진실적 분석·평가', basis: '공공기관 에너지이용 합리화 추진에 관한 규정 제4조', note: '상·하반기 각 1회 이상 개최' },
  { name: '교원인사자문위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '위원장 1인 포함 15인 이내', chair: '교장', role: '합리적·민주적 인사행정 구현, 다면평가 결과 인사 반영', basis: '교육공무원 승진규정 제28조의4', note: '' },
  { name: '다면평가관리위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '적정 인원', chair: '교장 또는 교감', role: '다면평가자 선정기준 마련, 다면평가 평가지표 수정 등 관리', basis: '교육공무원인사관리규정 제34조, 제35조', note: '' },
  { name: '교육공무직원인사위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '교육공무직원 2명 포함 7명 이내', chair: '교감', role: '교육공무직원 인사관리에 관한 사항', basis: '경기도교육청 교육공무직원 운영 규정 제3조', note: '교(원)감, 행정실장, 부장교사, 교육공무직원, 학교운영위원회 위원 중 1명 이상 포함' },
  { name: '물품선정위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '8명 이상(학생비율 1/2 이상)', chair: '교장', role: '학교 구매물품 선정', basis: '물품선정위원회 운영기준', note: '교장·행정실장·업체 이해관계자 위촉 불가, 학생·학부모 참여 필수' },
  { name: '규정개정심의위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '적정 인원', chair: '교감', role: '각종 학교규칙 제·개정 심의', basis: '학교 규칙 표준안', note: '' },
  { name: '학교도서관운영위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '위원장 포함 5~10명(위원장: 교감)', chair: '교감', role: '자료 수집·폐기·제적·열람제한 및 학교도서관 행사, 기타 운영에 대한 사항 심의', basis: '학교도서관진흥법 제10조', note: '' },
  { name: '학교인정도서추천위원회', schoolTypes: ['고'], legal: false, memberCount: '해당 교과목의 교원자격을 가진 교원 3인 이상', chair: '교감', role: '교육부 장관의 고시 교과목 이외의 교과목(고시 외 과목)에 대한 인정도서의 선정 및 사용 심의', basis: '교과용도서에 관한 규정 제14조 3항', note: '' },
  { name: '원격수업관리위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '적정 인원', chair: '교감', role: '원격수업 운영 관리 및 계획 심의', basis: '초·중등학교 및 특수학교 원격수업 운영기준(2023.1)', note: '' },
  { name: '의무교육관리위원회', schoolTypes: ['초', '중'], legal: true, memberCount: '적정 인원', chair: '교장', role: '미취학, 미인정 결석 학생 유예·면제, 취학의무의 면제 및 유예 결정 등에 관한 심의', basis: '초·중등교육법 시행규칙 제24조', note: '기존 취학유예·면제심의위원회를 의무교육관리위원회로 명칭 변경' },
  { name: '학업중단예방위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '교직원, 학생, 학부모 대표 등 8명 이상(학생비율 1/2 이상)', chair: '교장', role: '학업중단 숙려제 운영, 학업중단 위기학생 지원 계획 심의', basis: '학업중단 숙려제 운영 매뉴얼', note: '' },
  { name: '학습지원대상학생지원협의회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '8인 내외(위원장 1인, 부위원장 1인, 간사 포함)', chair: '교감', role: '학습지원대상학생 선정 심의, 학습지원대상학생 지원 계획 심의', basis: '2026 경기 기초학력 보장 시행 계획', note: '학기별 1회 이상 개최, 유사 위원회와 통합 운영 가능' },
  { name: '영재교육대상자선정심사위원회', schoolTypes: ['초', '중', '고'], legal: true, memberCount: '5인 이상 10인 이하', chair: '교감', role: '영재교육대상자 선정에 관한 사항, 학칙에서 선정심사위원회 심의를 거치도록 정한 사항', basis: '영재교육진흥법 시행령 제16조', note: '학교운영위원회와 구성 인원 전원 중복 허용' },
  { name: '조기진급졸업진학평가위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '위원장 포함 5~11인', chair: '교감', role: '조기졸업, 조기입학 자격인정, 조기진급·졸업 관련 심의', basis: '조기진급등에 관한 규정 제5조', note: '' },
  { name: '원어민보조교사관리위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '당연직(교장, 교감, 주무부장, 영어과 전교사, 교육행정실장)', chair: '교장', role: '원어민보조교사 활용 및 관리', basis: '원어민보조교사 업무편람', note: '' },
  { name: '교복선정위원회', schoolTypes: ['중', '고'], legal: false, memberCount: '8~12명(학생위원 전체의 1/3 이상, 교원위원 학생위원 수 이하)', chair: '호선', role: '교복 학교주관구매 선정, 업체 선정 등', basis: '교복 학교주관구매 가이드북', note: '학생들의 의견 반영을 위해 학생대표 실질적 참여 지원' },
  { name: '졸업앨범심의위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '학부모, 학생, 사서, 교사, 외부 전문가 등', chair: '교감', role: '앨범의 사양, 가격 심의', basis: '학교운영위원회 업무편람', note: '업체선정·계약은 학교장 권한. 학생수에 따라 정함' },
  { name: '체험학습활성화위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '위원장 포함 5~7인', chair: '교감', role: '숙박형 현장체험학습 기본계획 검토 및 자문', basis: '경기도교육청 현장체험학습 학생안전관리조례', note: '' },
  { name: '위기관리위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '교장·교감, 관련 부장교사, 학교운영위원회 지역위원·교원위원, 상담교사, 사회복지사 등', chair: '교장', role: '위기학생 지원 및 긴급 대응, 위기 상황 대응 계획 심의', basis: '2026 위기학생지원계획', note: '' },
  { name: '학생복지심사위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '5~10인', chair: '교감', role: '학비감면, 방과후학교 지원 등 학생복지 관련 심의', basis: '경기도교육청 교육복지우선지원사업 지원 조례 제8조', note: '' },
  { name: '교육복지(소)위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '적정 인원', chair: '교감', role: '교육복지 지원 대상 선정 및 지원 계획 심의', basis: '경기도교육청 교육복지우선지원사업 지원 조례 제8조', note: '학교 상황에 따라 별도 위원회 또는 타 위원회 통합 운영' },
  { name: '학교(자체)평가위원회', schoolTypes: ['초', '중', '고'], legal: false, memberCount: '적정 인원(교원, 교육과정 전문가, 학부모 등)', chair: '교감', role: '학교평가 계획 수립 및 시행, 지표별 자료 수집 및 분석, 결과 분석 및 차년도 환류 방안 강구', basis: '2026 학교평가 편람', note: '' },
  { name: '개별화교육지원팀', schoolTypes: ['특수'], legal: true, memberCount: '보호자, 특수교육교원, 일반교육교원, 진로 및 직업교육 담당 교원, 특수교육 관련서비스 담당 인력 등', chair: '특수교육교원', role: '특수교육대상자의 인적사항, 현재 학습수행수준, 교육목표, 교육내용, 교육방법, 평가계획 및 특수교육 관련서비스 내용·방법 등 개별화교육계획 수립·심의', basis: '장애인 등에 대한 특수교육법 시행규칙 제4조', note: '매 학년도 시작 후 30일 이내 작성' },
  { name: '현장실습운영위원회', schoolTypes: ['직업계고'], legal: true, memberCount: '7인 이상(학부모, 학생, 전담노무사, 산업체 관계자, 안전전문가 각 1명 이상 필수)', chair: '교감', role: '현장실습 운영계획서 심의, 현장실습 운영 자치진단 평가 실시', basis: '경기도 고등학교 현장실습 지원에 관한 조례 제14조', note: '연 2회 이상 필수 개최' },
  { name: '직업교육과정추진위원회', schoolTypes: ['직업계고'], legal: false, memberCount: '적정 인원', chair: '교감', role: '직업(위탁)교육 과정 운영 여부, 직업(위탁)교육기관 선정', basis: '직업교육 관련 규정', note: '' },
]

const SCHOOL_TYPE_TABS = ['전체', '초', '중', '고', '직업계고', '특수'] as const
const LEGAL_TABS = ['전체', '법정', '비법정'] as const

const SCHOOL_TYPE_COLORS: Record<string, string> = {
  '초': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  '중': 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  '고': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  '특수': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  '직업계고': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

export default function SchoolCommitteesPage() {
  const [search, setSearch] = useState('')
  const [schoolFilter, setSchoolFilter] = useState<string>('전체')
  const [legalFilter, setLegalFilter] = useState<string>('전체')
  const [expandedName, setExpandedName] = useState<string | null>(null)

  const filtered = COMMITTEES.filter(c => {
    if (search && !c.name.includes(search) && !c.role.includes(search) && !c.basis.includes(search)) return false
    if (schoolFilter !== '전체' && !c.schoolTypes.includes(schoolFilter)) return false
    if (legalFilter === '법정' && !c.legal) return false
    if (legalFilter === '비법정' && c.legal) return false
    return true
  })

  const totalCount = COMMITTEES.length
  const legalCount = COMMITTEES.filter(c => c.legal).length
  const nonLegalCount = COMMITTEES.filter(c => !c.legal).length

  const toggleExpand = (name: string) => {
    setExpandedName(prev => prev === name ? null : name)
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">학교 내 각종 위원회 현황</h1>
          <p className="page-subtitle">2026학년도 기준 · 경기도교육청</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
            <Building2 size={12} className="text-slate-400" />
            전체 <span className="font-bold text-white">{totalCount}</span>개
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-xs text-violet-300">
            <Scale size={12} />
            법정 <span className="font-bold text-violet-200">{legalCount}</span>개
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-500/10 border border-slate-500/25 text-xs text-slate-400">
            <Users size={12} />
            비법정 <span className="font-bold text-slate-300">{nonLegalCount}</span>개
          </span>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="card mb-4 space-y-3">
        {/* 검색창 */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            className="input pl-9"
            placeholder="위원회명, 역할, 설치근거 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* 학교급 탭 */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-500 mr-1">학교급</span>
          {SCHOOL_TYPE_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setSchoolFilter(tab)}
              className={clsx(
                'px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150',
                schoolFilter === tab
                  ? 'bg-violet-500 text-white shadow-sm shadow-violet-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* 법정 구분 탭 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 mr-1">구분</span>
          {LEGAL_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setLegalFilter(tab)}
              className={clsx(
                'px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150',
                legalFilter === tab
                  ? 'bg-violet-500 text-white shadow-sm shadow-violet-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 수 */}
      <p className="text-xs text-slate-500 mb-2 px-1">
        {filtered.length}개 위원회
        {search && <span className="text-violet-400 ml-1">· "{search}" 검색 결과</span>}
      </p>

      {/* 위원회 목록 */}
      <div className="space-y-1">
        {filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-slate-500">
            <Search size={28} className="mb-3 opacity-30" />
            <p className="text-sm">검색 결과가 없습니다.</p>
          </div>
        ) : (
          filtered.map((committee, idx) => {
            const isExpanded = expandedName === committee.name
            return (
              <motion.div
                key={committee.name}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: idx * 0.02 }}
                className={clsx(
                  'rounded-2xl border transition-all duration-200',
                  isExpanded
                    ? 'bg-surface-800 border-violet-500/25'
                    : 'bg-white/3 border-white/5 hover:bg-white/5 hover:border-white/10'
                )}
              >
                {/* 행 헤더 (클릭 영역) */}
                <button
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                  onClick={() => toggleExpand(committee.name)}
                >
                  {/* 법정 배지 */}
                  <span
                    className={clsx(
                      'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                      committee.legal
                        ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                        : 'bg-slate-500/15 text-slate-400 border-slate-500/25'
                    )}
                  >
                    {committee.legal ? <Scale size={10} /> : <Users size={10} />}
                    {committee.legal ? '법정' : '비법정'}
                  </span>

                  {/* 위원회명 */}
                  <span className="flex-1 font-medium text-sm text-white text-left">
                    {committee.name}
                  </span>

                  {/* 학교급 칩 */}
                  <div className="hidden sm:flex items-center gap-1 shrink-0">
                    {committee.schoolTypes.map(type => (
                      <span
                        key={type}
                        className={clsx(
                          'inline-flex px-2 py-0.5 rounded-full text-xs border',
                          SCHOOL_TYPE_COLORS[type] ?? 'bg-white/5 text-slate-400 border-white/10'
                        )}
                      >
                        {type}
                      </span>
                    ))}
                  </div>

                  {/* 위원장 */}
                  <span className="hidden md:block text-xs text-slate-400 shrink-0 w-28 text-right">
                    위원장: {committee.chair}
                  </span>

                  {/* 인원 */}
                  <span className="hidden lg:block text-xs text-slate-500 shrink-0 w-32 text-right truncate">
                    {committee.memberCount}
                  </span>

                  {/* 펼침 아이콘 */}
                  <span className="shrink-0 text-slate-500 ml-1">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                </button>

                {/* 상세 펼침 */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
                        {/* 모바일: 학교급 + 위원장 */}
                        <div className="flex flex-wrap gap-2 sm:hidden">
                          {committee.schoolTypes.map(type => (
                            <span
                              key={type}
                              className={clsx(
                                'inline-flex px-2 py-0.5 rounded-full text-xs border',
                                SCHOOL_TYPE_COLORS[type] ?? 'bg-white/5 text-slate-400 border-white/10'
                              )}
                            >
                              {type}
                            </span>
                          ))}
                          <span className="text-xs text-slate-400">위원장: {committee.chair}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* 구성 인원 (모바일 상단 노출) */}
                          <div className="md:hidden">
                            <p className="field-label flex items-center gap-1">
                              <Users size={11} />구성 인원
                            </p>
                            <p className="text-sm text-slate-200">{committee.memberCount}</p>
                          </div>

                          {/* 주요 역할 */}
                          <div className="md:col-span-2">
                            <p className="field-label flex items-center gap-1">
                              <BookOpen size={11} />주요 역할
                            </p>
                            <p className="text-sm text-slate-200 leading-relaxed">{committee.role}</p>
                          </div>

                          {/* 구성 인원 (데스크탑) */}
                          <div className="hidden md:block">
                            <p className="field-label flex items-center gap-1">
                              <Users size={11} />구성 인원
                            </p>
                            <p className="text-sm text-slate-200">{committee.memberCount}</p>
                          </div>

                          {/* 설치 근거 */}
                          <div>
                            <p className="field-label flex items-center gap-1">
                              <Scale size={11} />설치 근거
                            </p>
                            <p className="text-sm text-slate-300">{committee.basis}</p>
                          </div>
                        </div>

                        {/* 비고 */}
                        {committee.note && (
                          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                            <p className="text-xs text-amber-300/80 leading-relaxed">
                              <span className="font-semibold text-amber-300 mr-1">비고</span>
                              {committee.note}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}
