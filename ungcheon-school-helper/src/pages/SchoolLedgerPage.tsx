import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookCopy, Search, ChevronDown, ChevronUp, X, Monitor, FileText, Check,
} from 'lucide-react'
import clsx from 'clsx'

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

interface Ledger {
  id: number
  name: string
  dept: string
  schoolTypes: string[]   // '유','초','중','고','특수','각종'
  legal: boolean          // 법정 여부
  mgmt: string            // 자료관리형태
  note?: string           // 비고
}

// ─────────────────────────────────────────────
// 데이터 (2025년 학교 비치 장부 현황 — 경기도교육청)
// ─────────────────────────────────────────────

const LEDGERS: Ledger[] = [
  // ── 교육과정정책과 ──
  { id:  1, name: '결보강일지',                     dept: '교육과정정책과', schoolTypes: ['초','중','고'],           legal: false, mgmt: 'NEIS(초,중등)' },
  { id:  2, name: '수상대장',                       dept: '교육과정정책과', schoolTypes: ['초','중','고'],           legal: false, mgmt: 'NEIS(중등)' },
  { id:  3, name: '진급반편성일람표',               dept: '교육과정정책과', schoolTypes: ['초','중','고'],           legal: false, mgmt: 'NEIS(초,중등)' },
  { id:  4, name: '학업성적관리위원회 회의록',      dept: '교육과정정책과', schoolTypes: ['초','중','고'],           legal: true,  mgmt: 'NEIS(초,중등)' },
  { id:  5, name: '학교교육과정편제 및 시간배당표', dept: '교육과정정책과', schoolTypes: ['초','중','고'],           legal: false, mgmt: 'NEIS(초,중등)' },
  { id:  6, name: '교과협의록',                     dept: '교육과정정책과', schoolTypes: ['중','고'],                legal: true,  mgmt: 'NEIS(중등)' },
  { id:  7, name: '지필평가일람표',                 dept: '교육과정정책과', schoolTypes: ['중','고'],                legal: true,  mgmt: 'NEIS(중등)' },
  { id:  8, name: '수행평가일람표',                 dept: '교육과정정책과', schoolTypes: ['중','고'],                legal: true,  mgmt: 'NEIS(중등)' },
  { id:  9, name: '학기말성적일람표(과목별)',       dept: '교육과정정책과', schoolTypes: ['중','고'],                legal: true,  mgmt: 'NEIS(중등)' },
  { id: 10, name: '학생 성적 확인용 NEIS 출력 자료(지필·수행평가)', dept: '교육과정정책과', schoolTypes: ['중','고'], legal: true, mgmt: 'NEIS(중등)', note: '학생 성적 확인용' },

  // ── 교육과정정책과 + 유아교육과 (학적) ──
  { id: 11, name: '전입/편입/재취학/복학',          dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초'],  legal: true,  mgmt: 'NEIS(유,초,중등)' },
  { id: 12, name: '전입/편입/재입/복학',            dept: '교육과정정책과·유아교육과', schoolTypes: ['고'],       legal: true,  mgmt: 'NEIS(유,초,중등)' },
  { id: 13, name: '전출',                           dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초'],  legal: true,  mgmt: 'NEIS(유,초,중등)' },
  { id: 14, name: '유예/면제',                      dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초'],  legal: true,  mgmt: 'NEIS(유,초,중등)' },
  { id: 15, name: '추가입학/전산미등록자',          dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초'],  legal: true,  mgmt: 'NEIS(유,초,중등)' },
  { id: 16, name: '추가입학/입력누락자',            dept: '교육과정정책과·유아교육과', schoolTypes: ['고'],       legal: true,  mgmt: 'NEIS(유,초,중등)' },
  { id: 17, name: '반변경',                         dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초'],  legal: true,  mgmt: 'NEIS(유,초,중등)' },
  { id: 18, name: '자퇴/퇴학/제적/휴학',           dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초'],  legal: true,  mgmt: 'NEIS(유,초,중등)' },
  { id: 19, name: '계열/학과/반변경',              dept: '교육과정정책과·유아교육과', schoolTypes: ['고'],       legal: true,  mgmt: 'NEIS(유,초,중등)' },
  { id: 20, name: '졸업대장 (유)수료·졸업대장',   dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초','중','고'], legal: true, mgmt: 'NEIS+출력물' },
  { id: 21, name: '학교생활기록부Ⅰ,Ⅱ (유)유치원생활기록부', dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초','중','고'], legal: true, mgmt: 'NEIS' },
  { id: 22, name: '학교생활기록부 정정대장 (유)유치원생활기록부 정정대장', dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초','중','고'], legal: true, mgmt: 'NEIS+출력물' },
  { id: 23, name: '출석부',                        dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초'],  legal: true, mgmt: 'NEIS(유,초,중등)' },
  { id: 24, name: '전입/편입/재취학',              dept: '교육과정정책과·유아교육과', schoolTypes: ['중','고'],  legal: true, mgmt: 'NEIS(유,초,중등)' },
  { id: 25, name: '반편성',                        dept: '교육과정정책과·유아교육과', schoolTypes: ['유','초'],  legal: true, mgmt: 'NEIS(유,초,중등)' },

  // ── 행정역량정책과 ──
  { id: 26, name: '학교(유치원)운영위원회 회의록', dept: '행정역량정책과', schoolTypes: ['유','초','중','고','특수','각종'], legal: true,  mgmt: '전자관리·서면 선택 가능', note: '업무관리시스템 K-에듀파인' },
  { id: 27, name: '학교운영위원회 안건 접수 대장', dept: '행정역량정책과', schoolTypes: ['유','초','중','고','특수','각종'], legal: false, mgmt: '전자관리·서면 선택 가능' },
  { id: 28, name: '학교운영위원회 공고대장',       dept: '행정역량정책과', schoolTypes: ['유','초','중','고','특수','각종'], legal: false, mgmt: '전자관리·서면 선택 가능' },

  // ── 생활인성교육과 ──
  { id: 29, name: '학생생활교육위원회 회의록',     dept: '생활인성교육과', schoolTypes: ['초','중','고'],           legal: false, mgmt: 'NEIS' },
  { id: 30, name: '학생징계처리부',                dept: '생활인성교육과', schoolTypes: ['초','중','고'],           legal: false, mgmt: 'NEIS·서면 선택' },
  { id: 31, name: '학교폭력신고접수대장',          dept: '생활인성교육과', schoolTypes: ['초','중','고'],           legal: false, mgmt: 'NEIS' },
  { id: 32, name: '학교폭력전담기구 심의결과보고서', dept: '생활인성교육과', schoolTypes: ['초','중','고'],         legal: false, mgmt: '서면' },
  { id: 33, name: '학교폭력가해학생조치사항 관리대장', dept: '생활인성교육과', schoolTypes: ['초','중','고'],       legal: false, mgmt: '서면' },
  { id: 34, name: '학교폭력가해학생조치 조건부 기재유보 관리대장', dept: '생활인성교육과', schoolTypes: ['초','중','고'], legal: false, mgmt: '서면' },
  { id: 35, name: '학업중단숙려제 대상자 명부',   dept: '생활인성교육과', schoolTypes: ['초','중','고'],           legal: false, mgmt: 'NEIS' },
  { id: 36, name: '학업중단숙려제 운영대장',       dept: '생활인성교육과', schoolTypes: ['초','중','고'],           legal: false, mgmt: 'NEIS' },

  // ── 운영지원과 ──
  { id: 37, name: '하자보수관리부',                dept: '운영지원과', schoolTypes: ['유','초','중','고','특수','각종'], legal: true, mgmt: '교육시설통합정보망' },
  { id: 38, name: '정보공개처리대장',              dept: '운영지원과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '전자관리' },
  { id: 39, name: '이의신청처리대장',              dept: '운영지원과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '전자관리' },
  { id: 40, name: '제증명발급대장',                dept: '운영지원과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '전자관리' },
  { id: 41, name: '어디서나민원(FAX민원)처리대장', dept: '운영지원과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '전자관리' },
  { id: 42, name: '어디서나민원(FAX민원)교부접수대장', dept: '운영지원과', schoolTypes: ['유','초','중','고'],      legal: true,  mgmt: '전자관리' },
  { id: 43, name: '보호구역대장',                 dept: '운영지원과', schoolTypes: ['유','초','중','고'],           legal: true,  mgmt: '서면' },
  { id: 44, name: '보안교육일지',                 dept: '운영지원과', schoolTypes: ['유','초','중','고'],           legal: true,  mgmt: 'NEIS' },
  { id: 45, name: '당직근무일지',                 dept: '운영지원과', schoolTypes: ['유','초','중','고'],           legal: true,  mgmt: 'NEIS' },
  { id: 46, name: '민원처리부',                   dept: '운영지원과', schoolTypes: ['유','초','중','고'],           legal: true,  mgmt: '전자관리' },

  // ── 융합교육정책과 ──
  { id: 47, name: '과학교구·기자재관리대장',      dept: '융합교육정책과', schoolTypes: ['초','중','고'],            legal: false, mgmt: '서면·전자 선택' },
  { id: 48, name: '화학물질 관리대장',             dept: '융합교육정책과', schoolTypes: ['초','중','고'],            legal: true,  mgmt: '서면', note: '유해화학물질 보유 학교' },
  { id: 49, name: '과학실험실안전관리점검표',      dept: '융합교육정책과', schoolTypes: ['초','중','고'],            legal: true,  mgmt: '서면' },
  { id: 50, name: '폐수 폐기물 관리대장',          dept: '융합교육정책과', schoolTypes: ['초','중','고'],            legal: true,  mgmt: '서면' },
  { id: 51, name: '유해화학물질 취급시설 자체점검대장', dept: '융합교육정책과', schoolTypes: ['초','중','고'],      legal: true,  mgmt: '서면', note: '유해화학물질 보유 학교에 한함' },

  // ── 재무관리과 ──
  { id: 52, name: '세입세출외현금출납부',          dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },
  { id: 53, name: '세입세출외현금내역부',          dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },
  { id: 54, name: '신용카드발급대장',              dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },
  { id: 55, name: '현금영수증카드 사용대장',       dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인', note: '학교 신용카드가 현금영수증 발급용인 경우 불필요' },
  { id: 56, name: '징수부',                        dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },
  { id: 57, name: '현금출납부',                    dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인 출력물' },
  { id: 58, name: '지출부',                        dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },
  { id: 59, name: '학교발전기금접수대장',          dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },
  { id: 60, name: '학교발전기금출납부',            dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },
  { id: 61, name: '학교발전기금운용계획서',        dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },
  { id: 62, name: '학교발전기금기탁서',            dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },
  { id: 63, name: '학교발전기금회계결산보고서',    dept: '재무관리과', schoolTypes: ['유','초','중','고'],          legal: true,  mgmt: '에듀파인' },

  // ── 지방공무원인사과 ──
  { id: 64, name: '근무상황부',                    dept: '지방공무원인사과', schoolTypes: ['유','초','중','고'],     legal: true,  mgmt: '서면' },
  { id: 65, name: '출장신청서',                    dept: '지방공무원인사과', schoolTypes: ['유','초','중','고'],     legal: true,  mgmt: '서면' },
  { id: 66, name: '초과근무명령서',                dept: '지방공무원인사과', schoolTypes: ['유','초','중','고'],     legal: true,  mgmt: '서면' },
  { id: 67, name: '초과근무대장',                  dept: '지방공무원인사과', schoolTypes: ['유','초','중','고'],     legal: true,  mgmt: '서면' },
  { id: 68, name: '초과근무확인대장',              dept: '지방공무원인사과', schoolTypes: ['유','초','중','고'],     legal: true,  mgmt: '서면' },
  { id: 69, name: '시간외근무시간 연가 전환 신청 및 사용대장', dept: '지방공무원인사과', schoolTypes: ['유','초','중','고'], legal: true, mgmt: '서면' },

  // ── 지역교육담당관 ──
  { id: 70, name: '방과후학교계획서',              dept: '지역교육담당관', schoolTypes: ['중','고'],                legal: false, mgmt: '서면' },
  { id: 71, name: '방과후학교 수강생 출석부',      dept: '지역교육담당관', schoolTypes: ['중','고'],                legal: false, mgmt: '서면' },
  { id: 72, name: '방과후학교 프로그램 위탁강사 대장', dept: '지역교육담당관', schoolTypes: ['중','고'],            legal: false, mgmt: '서면', note: '강사료 지급 근거' },
  { id: 73, name: '월별 수강료 지원대장(자유수강권 지원 대장)', dept: '지역교육담당관', schoolTypes: ['초','중','고'], legal: false, mgmt: '서면' },

  // ── 특수교육과 ──
  { id: 74, name: '개별화교육계획',               dept: '특수교육과', schoolTypes: ['유','초','특수'],            legal: true,  mgmt: 'NEIS', note: '특수교육 대상자' },
  { id: 75, name: '통합교육계획',                 dept: '특수교육과', schoolTypes: ['유','초','특수'],            legal: true,  mgmt: 'NEIS' },

  // ── 평생교육과 ──
  { id: 76, name: '도서대장',                     dept: '평생교육과', schoolTypes: ['초','중','고'],              legal: false, mgmt: 'DLS' },
  { id: 77, name: '도서관통계대장',               dept: '평생교육과', schoolTypes: ['초','중','고'],              legal: false, mgmt: 'DLS' },

  // ── 학교급식보건과 ──
  { id: 78, name: '학교급식일지',                 dept: '학교급식보건과', schoolTypes: ['유','초','중','고'],     legal: true,  mgmt: '서면' },
  { id: 79, name: '학교급식일일위생청소점검표',   dept: '학교급식보건과', schoolTypes: ['유','초','중','고'],     legal: true,  mgmt: '서면', note: '청소점검표 포함' },
  { id: 80, name: '출입검사기록부',               dept: '학교급식보건과', schoolTypes: ['유','초','중','고'],     legal: true,  mgmt: '서면' },
  { id: 81, name: '식재료검수일지',               dept: '학교급식보건과', schoolTypes: ['유','초','중','고'],     legal: true,  mgmt: '서면' },
  { id: 82, name: 'CCP 및 CP 기록지',            dept: '학교급식보건과', schoolTypes: ['유','초','중','고'],     legal: false, mgmt: '서면' },
  { id: 83, name: 'HACCP자체검증 결과표 및 CCP,CP 점검결과', dept: '학교급식보건과', schoolTypes: ['유','초','중','고'], legal: false, mgmt: '서면' },
  { id: 84, name: '다량배출사업장 음식물류 폐기물 관리대장', dept: '학교급식보건과', schoolTypes: ['유','초','중','고'], legal: false, mgmt: '서면', note: '급식인원 100명 이상 학교' },

  // ── 학교안전과 ──
  { id: 85, name: '어린이놀이시설 안전점검실시대장 및 안전진단실시대장', dept: '학교안전과', schoolTypes: ['유','초','특수'], legal: true, mgmt: '전자관리·서면 선택', note: '어린이놀이시설 보유 학교' },

  // ── 교육복지과 ──
  { id: 86, name: '늘봄학교계획서',               dept: '교육복지과', schoolTypes: ['초','중','고'],              legal: false, mgmt: 'NEIS', note: '늘봄학교 운영 학교' },
  { id: 87, name: '늘봄학교 수강생 출석부',       dept: '교육복지과', schoolTypes: ['초','중','고'],              legal: false, mgmt: 'NEIS' },
  { id: 88, name: '늘봄학교 프로그램 위탁강사 대장', dept: '교육복지과', schoolTypes: ['초','중','고'],           legal: false, mgmt: '서면', note: '강사료 지급 근거' },
  { id: 89, name: '초등돌봄교실 귀가 일지',       dept: '교육복지과', schoolTypes: ['초'],                        legal: false, mgmt: '서면', note: '학생 귀가 안전관리' },

  // ── 체육건강과 ──
  { id: 90, name: '학교운동부 지도교사 확인대장', dept: '체육건강과', schoolTypes: ['중','고'],                   legal: true,  mgmt: '서면', note: '학교운동부 운영 학교 필수' },

  // ── 학교교권보호위원회 ──
  { id: 91, name: '학교교권보호위원회 사안처리대장(신고서 접수대장)', dept: '생활인성교육과', schoolTypes: ['초','중','고'], legal: false, mgmt: '서면', note: '학교는 작성 대상 아님 — 불요' },
]

// ─────────────────────────────────────────────
// 관리형태 → 뱃지 색상
// ─────────────────────────────────────────────

function mgmtColor(mgmt: string): string {
  if (mgmt.includes('NEIS')) return 'bg-sky-500/20 text-sky-300 border-sky-500/20'
  if (mgmt.includes('에듀파인')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20'
  if (mgmt.includes('DLS')) return 'bg-purple-500/20 text-purple-300 border-purple-500/20'
  if (mgmt.includes('교육시설')) return 'bg-teal-500/20 text-teal-300 border-teal-500/20'
  return 'bg-slate-500/20 text-slate-400 border-slate-500/20'
}

// ─────────────────────────────────────────────
// 학교급 필터 목록
// ─────────────────────────────────────────────

const SCHOOL_TYPE_OPTIONS = ['전체', '유', '초', '중', '고', '특수', '각종']
const DEPT_OPTIONS = ['전체', ...Array.from(new Set(LEDGERS.map(l => l.dept))).sort()]

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

export default function SchoolLedgerPage() {
  const [search, setSearch] = useState('')
  const [schoolType, setSchoolType] = useState('전체')
  const [legalFilter, setLegalFilter] = useState<'전체' | '법정' | '비법정'>('전체')
  const [deptFilter, setDeptFilter] = useState('전체')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    return LEDGERS.filter(l => {
      if (search) {
        const q = search.toLowerCase()
        if (!l.name.toLowerCase().includes(q) && !l.dept.includes(q)) return false
      }
      if (schoolType !== '전체' && !l.schoolTypes.includes(schoolType)) return false
      if (legalFilter === '법정' && !l.legal) return false
      if (legalFilter === '비법정' && l.legal) return false
      if (deptFilter !== '전체' && l.dept !== deptFilter) return false
      return true
    })
  }, [search, schoolType, legalFilter, deptFilter])

  const toggleExpand = (id: number) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 pt-5 pb-4 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <BookCopy size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">학교 비치 장부 현황</h1>
            <p className="text-xs text-slate-500 mt-0.5">2025년 경기도교육청 — 학교 내 각종 비치 장부 자료</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-600">
              {filtered.length} / {LEDGERS.length}건
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
              법정 {LEDGERS.filter(l => l.legal).length}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-500/20 text-slate-400 border border-slate-500/20">
              비법정 {LEDGERS.filter(l => !l.legal).length}
            </span>
          </div>
        </div>

        {/* 필터 행 */}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          {/* 검색 */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="장부명·담당부서 검색"
              className="bg-surface-800 border border-white/10 text-white text-xs rounded-lg pl-7 pr-3 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-slate-600"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X size={11} />
              </button>
            )}
          </div>

          {/* 학교급 */}
          <div className="flex gap-1">
            {SCHOOL_TYPE_OPTIONS.map(t => (
              <button
                key={t}
                onClick={() => setSchoolType(t)}
                className={clsx(
                  'px-2.5 py-1 text-xs rounded-lg transition-all',
                  schoolType === t
                    ? 'bg-amber-600 text-white font-medium'
                    : 'bg-surface-700 text-slate-400 hover:text-slate-200',
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* 법정 여부 */}
          <div className="flex gap-1">
            {(['전체', '법정', '비법정'] as const).map(f => (
              <button
                key={f}
                onClick={() => setLegalFilter(f)}
                className={clsx(
                  'px-2.5 py-1 text-xs rounded-lg transition-all',
                  legalFilter === f
                    ? f === '법정' ? 'bg-rose-600 text-white font-medium' : f === '비법정' ? 'bg-slate-600 text-white' : 'bg-surface-600 text-white'
                    : 'bg-surface-700 text-slate-400 hover:text-slate-200',
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* 담당부서 */}
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="bg-surface-800 border border-white/10 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-700">
            <BookCopy size={32} className="opacity-20 mb-2" />
            <p className="text-sm">검색 결과가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(ledger => {
              const isOpen = expandedId === ledger.id
              return (
                <div
                  key={ledger.id}
                  className={clsx(
                    'rounded-xl border transition-all',
                    isOpen ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5 bg-surface-800/60 hover:bg-surface-800',
                  )}
                >
                  {/* 행 */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                    onClick={() => toggleExpand(ledger.id)}
                  >
                    {/* 번호 */}
                    <span className="text-[10px] text-slate-600 w-5 flex-shrink-0">{ledger.id}</span>

                    {/* 장부명 */}
                    <span className="flex-1 text-sm font-medium text-slate-200 truncate">{ledger.name}</span>

                    {/* 배지들 */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* 법정 여부 */}
                      <span className={clsx(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded border',
                        ledger.legal
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/20'
                          : 'bg-slate-500/20 text-slate-500 border-slate-500/20',
                      )}>
                        {ledger.legal ? '법정' : '비법정'}
                      </span>

                      {/* 학교급 */}
                      <div className="hidden sm:flex gap-0.5">
                        {['유','초','중','고','특수'].map(t => (
                          <span key={t} className={clsx(
                            'text-[9px] w-5 h-4 flex items-center justify-center rounded font-medium',
                            ledger.schoolTypes.includes(t)
                              ? 'bg-amber-500/30 text-amber-300'
                              : 'bg-transparent text-slate-700',
                          )}>
                            {t}
                          </span>
                        ))}
                      </div>

                      {/* 관리형태 */}
                      <span className={clsx('text-[9px] px-1.5 py-0.5 rounded border hidden md:inline', mgmtColor(ledger.mgmt))}>
                        {ledger.mgmt.split(/[·,\(]/)[0].trim()}
                      </span>

                      {isOpen ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-600" />}
                    </div>
                  </button>

                  {/* 상세 */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-white/5 pt-2.5">
                          <div>
                            <div className="text-[10px] text-slate-500 mb-0.5">담당부서</div>
                            <div className="text-xs text-slate-300">{ledger.dept}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 mb-0.5">해당 학교급</div>
                            <div className="flex gap-1 flex-wrap">
                              {ledger.schoolTypes.map(t => (
                                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/20">{t}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 mb-0.5">자료 관리 형태</div>
                            <div className="flex items-center gap-1">
                              <Monitor size={10} className="text-slate-500" />
                              <span className="text-xs text-slate-300">{ledger.mgmt}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 mb-0.5">법정 여부</div>
                            <div className="flex items-center gap-1">
                              {ledger.legal
                                ? <><Check size={10} className="text-rose-400" /><span className="text-xs text-rose-300">법정 (의무 비치)</span></>
                                : <><FileText size={10} className="text-slate-500" /><span className="text-xs text-slate-400">비법정 (선택 비치)</span></>
                              }
                            </div>
                          </div>
                          {ledger.note && (
                            <div className="col-span-2 md:col-span-4">
                              <div className="text-[10px] text-slate-500 mb-0.5">비고</div>
                              <div className="text-xs text-amber-200/80 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2.5 py-1.5">{ledger.note}</div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 하단 안내 */}
      <div className="px-6 py-2 border-t border-white/5 flex-shrink-0">
        <p className="text-[10px] text-slate-700">출처: 경기도교육청 2025년 학교 내 각종 비치 장부 자료 | 법정 장부는 법령에 따른 의무 비치, 비법정 장부는 학교 자율 선택</p>
      </div>
    </div>
  )
}
