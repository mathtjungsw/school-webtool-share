import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileScan, Upload, AlertTriangle, CheckCircle2, XCircle,
  Clock, ChevronDown, ChevronUp, Eye, EyeOff, RefreshCw,
  User, GraduationCap, Award, TrendingUp, BookOpen, Briefcase,
} from 'lucide-react'
import clsx from 'clsx'
import { parseInsaPdf } from '../services/insa/pdf'
import { analyzeInsa } from '../services/insa/analyzer'
import type { InsaRecord, InsaAnalysis, MandatoryStatus } from '../services/insa/types'

// ─── 탭 정의 ────────────────────────────────────────────────────────────────
type Tab = 'summary' | 'mandatory' | 'training' | 'hobong' | 'bonus' | 'detail'
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'summary',   label: '요약',       icon: User },
  { id: 'mandatory', label: '법정의무연수', icon: CheckCircle2 },
  { id: 'training',  label: '연수통계',   icon: TrendingUp },
  { id: 'hobong',    label: '호봉이력',   icon: Award },
  { id: 'bonus',     label: '가산점',     icon: Briefcase },
  { id: 'detail',    label: '상세데이터', icon: BookOpen },
]

// ─── 법정의무연수 상태 뱃지 ────────────────────────────────────────────────
const STATUS_CONFIG: Record<MandatoryStatus, { label: string; cls: string; icon: React.ElementType }> = {
  ok:      { label: '이수 완료', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 },
  warn:    { label: '갱신 필요', cls: 'bg-amber-500/15   text-amber-300   border-amber-500/30',   icon: Clock },
  missing: { label: '기록 없음', cls: 'bg-red-500/15     text-red-300     border-red-500/30',     icon: XCircle },
}

// ─── 업로드 화면 ────────────────────────────────────────────────────────────
function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = (f: File) => {
    if (f.type === 'application/pdf' || f.name.endsWith('.pdf')) onFile(f)
  }
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) handle(f)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-64">
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'w-full max-w-lg border-2 border-dashed rounded-xl p-10 cursor-pointer text-center transition-colors',
          drag ? 'border-sky-400 bg-sky-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5',
        )}
      >
        <FileScan size={40} className="mx-auto mb-4 text-sky-400" />
        <p className="text-white font-medium mb-1">NEIS 개인인사기록카드 PDF 업로드</p>
        <p className="text-slate-400 text-sm">파일을 드래그하거나 클릭하여 선택하세요</p>
        <p className="text-slate-500 text-xs mt-2">※ PDF는 로컬에서만 처리됩니다 (개인정보 보호)</p>
      </div>
      <input ref={inputRef} type="file" accept=".pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f) }} />
    </div>
  )
}

// ─── 요약 탭 ────────────────────────────────────────────────────────────────
function SummaryTab({ rec, ana, rrnHidden, onToggleRrn }: {
  rec: InsaRecord; ana: InsaAnalysis; rrnHidden: boolean; onToggleRrn: () => void
}) {
  const s = ana.summary
  const rows1: [string, string][] = [
    ['성명',     s.name],
    ['한자명',   rec.profile.hanja],
    ['영문명',   rec.profile.eng],
    ['주민등록번호', rrnHidden ? rec.profile.rrnMasked : rec.profile.rrn],
    ['나이',     rec.profile.age ? `만 ${rec.profile.age}세` : ''],
  ]
  const rows2: [string, string][] = [
    ['소속',     s.office],
    ['직위',     s.position],
    ['직급',     rec.profile.rank],
    ['임용과목', s.subject],
    ['보직',     s.duty || '—'],
    ['현 호봉',  s.hobong],
    ['재직상태', s.status],
  ]
  const rows3: [string, string][] = [
    ['경력',           s.careerYears],
    ['현 학교 근무 시작', s.currentSchoolSince || '—'],
    ['포상 수',         `${ana.rewards.count}건${ana.rewards.recent ? ` (최근: ${ana.rewards.recent})` : ''}`],
    ['자격증 수',       `${ana.qualifications.count}건`],
    ['총 연수 건수',    `${ana.training.total}건`],
    ['총 연수 시간',    `${ana.training.totalRecognizedHours}h`],
  ]

  return (
    <div className="space-y-4">
      {ana.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            {ana.warnings.map((w, i) => <p key={i} className="text-amber-300 text-xs">{w}</p>)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">신상</h3>
            <button onClick={onToggleRrn} className="btn-ghost flex items-center gap-1 text-xs text-slate-400">
              {rrnHidden ? <><EyeOff size={12} />마스킹</> : <><Eye size={12} />공개</>}
            </button>
          </div>
          <InfoRows rows={rows1} />
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">재직 정보</h3>
          <InfoRows rows={rows2} />
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">경력 요약</h3>
          <InfoRows rows={rows3} />
        </div>
      </div>

      {/* 가족 */}
      {rec.family.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">가족 ({rec.family.length}명)</h3>
          <table className="insa-table">
            <thead><tr><th>관계</th><th>성명</th><th>생년월일</th></tr></thead>
            <tbody>{rec.family.map((f, i) => (
              <tr key={i}><td>{f.relation}</td><td>{f.name}</td><td>{f.birth}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* 학력 */}
      {rec.education.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">학력</h3>
          <table className="insa-table">
            <thead><tr><th>입학</th><th>졸업</th><th>구분</th><th>학과</th><th>전공</th></tr></thead>
            <tbody>{rec.education.map((e, i) => (
              <tr key={i}><td>{e.admit}</td><td>{e.graduate}</td><td>{e.level}</td><td>{e.dept}</td><td>{e.major}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InfoRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-1.5">
      {rows.map(([k, v]) => v ? (
        <div key={k} className="flex gap-2 text-xs">
          <dt className="text-slate-500 w-24 flex-shrink-0">{k}</dt>
          <dd className="text-slate-200 break-all">{v}</dd>
        </div>
      ) : null)}
    </dl>
  )
}

// ─── 법정의무연수 탭 ────────────────────────────────────────────────────────
function MandatoryTab({ ana }: { ana: InsaAnalysis }) {
  const okCount = ana.mandatory.filter(m => m.status === 'ok').length
  const warnCount = ana.mandatory.filter(m => m.status === 'warn').length
  const missingCount = ana.mandatory.filter(m => m.status === 'missing').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="이수 완료" value={okCount} color="emerald" />
        <StatCard label="갱신 필요" value={warnCount} color="amber" />
        <StatCard label="기록 없음" value={missingCount} color="red" />
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-4">8대 법정의무연수 이수 현황</h3>
        <div className="space-y-2">
          {ana.mandatory.map(m => {
            const cfg = STATUS_CONFIG[m.status]
            const Icon = cfg.icon
            return (
              <div key={m.key} className={clsx(
                'flex items-start gap-3 rounded-lg border p-3', cfg.cls,
              )}>
                <Icon size={16} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{m.label}</span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full border', cfg.cls)}>{cfg.label}</span>
                  </div>
                  <p className="text-xs mt-0.5 opacity-80">{m.note}</p>
                  {m.lastCourse && (
                    <p className="text-xs mt-0.5 opacity-60">최근 이수: {m.lastCourse}</p>
                  )}
                  {m.count > 0 && (
                    <p className="text-xs opacity-60">총 {m.count}건 이수</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── 연수통계 탭 ────────────────────────────────────────────────────────────
function TrainingTab({ rec, ana }: { rec: InsaRecord; ana: InsaAnalysis }) {
  const [showAll, setShowAll] = useState(false)
  const displayed = showAll ? rec.trainings : rec.trainings.slice(0, 20)
  const typeEntries = Object.entries(ana.training.byType).sort((a, b) => b[1] - a[1])
  const maxByYear = Math.max(...ana.training.byYear.map(y => y.hours), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="총 이수 건수" value={ana.training.total} suffix="건" color="sky" />
        <StatCard label="총 인정 시간" value={ana.training.totalRecognizedHours} suffix="h" color="sky" />
        <StatCard label="총 학점" value={ana.training.totalCredit} suffix="학점" color="sky" />
        <StatCard label="연수 유형 수" value={typeEntries.length} suffix="종" color="sky" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 유형별 */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">유형별 이수 건수</h3>
          <div className="space-y-2">
            {typeEntries.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 w-24 flex-shrink-0 truncate">{type || '기타'}</span>
                <div className="flex-1 bg-white/5 rounded-full h-1.5">
                  <div className="bg-sky-400 h-1.5 rounded-full"
                    style={{ width: `${(count / ana.training.total) * 100}%` }} />
                </div>
                <span className="text-slate-300 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 연도별 */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">연도별 이수 시간</h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {ana.training.byYear.map(y => (
              <div key={y.year} className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 w-10">{y.year}</span>
                <div className="flex-1 bg-white/5 rounded-full h-1.5">
                  <div className="bg-indigo-400 h-1.5 rounded-full"
                    style={{ width: `${(y.hours / maxByYear) * 100}%` }} />
                </div>
                <span className="text-slate-300 w-16 text-right">{y.hours}h·{y.count}건</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 연수 목록 */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">연수 목록</h3>
          <span className="text-xs text-slate-500">{rec.trainings.length}건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="insa-table">
            <thead>
              <tr>
                <th>연수명</th><th>기관</th><th>유형</th><th>기간</th>
                <th>인정시간</th><th>학점</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((t, i) => (
                <tr key={i}>
                  <td className="max-w-xs truncate" title={t.course}>{t.course}</td>
                  <td className="whitespace-nowrap">{t.org}</td>
                  <td>{t.type}</td>
                  <td className="whitespace-nowrap text-xs">{t.start}{t.end ? `~${t.end}` : ''}</td>
                  <td className="text-right whitespace-nowrap">{t.recognizedHours}</td>
                  <td className="text-right">{t.credit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rec.trainings.length > 20 && (
          <button onClick={() => setShowAll(v => !v)}
            className="mt-3 w-full text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1">
            {showAll ? <><ChevronUp size={13} />접기</> : <><ChevronDown size={13} />전체 보기 ({rec.trainings.length}건)</>}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── 호봉이력 탭 ────────────────────────────────────────────────────────────
function HobongTab({ ana }: { ana: InsaAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="현재 호봉" value={ana.hobong.current} color="sky" />
        <div className="card flex flex-col justify-center">
          <p className="text-xs text-slate-500 mb-1">다음 승급 예정</p>
          <p className="text-base font-semibold text-amber-300">{ana.hobong.nextExpected || '—'}</p>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3">승급 이력 ({ana.hobong.history.length}건)</h3>
        {ana.hobong.history.length > 0 ? (
          <table className="insa-table">
            <thead><tr><th>호봉</th><th>발령연월일</th></tr></thead>
            <tbody>
              {[...ana.hobong.history].reverse().map((p, i) => (
                <tr key={i}>
                  <td className="font-medium">{p.hobong}</td>
                  <td>{p.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500 text-sm">승급 이력을 추출하지 못했습니다.</p>
        )}
      </div>
    </div>
  )
}

// ─── 가산점 탭 ────────────────────────────────────────────────────────────
function BonusTab({ rec, ana }: { rec: InsaRecord; ana: InsaAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3">영역별 가산점 현황</h3>
        {ana.bonus.areas.length > 0 ? (
          <div className="space-y-2">
            {ana.bonus.areas.map((a, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-slate-300 flex-1">{a.area || '기타'}</span>
                <span className="text-sky-300 font-medium">{a.count}건</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">가산점 기록이 없습니다.</p>
        )}
      </div>

      {rec.bonusPoints.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">가산점 상세 ({rec.bonusPoints.length}건)</h3>
          <div className="overflow-x-auto">
            <table className="insa-table">
              <thead><tr><th>영역</th><th>기간</th><th>기관</th><th>비고</th></tr></thead>
              <tbody>
                {rec.bonusPoints.map((b, i) => (
                  <tr key={i}>
                    <td>{b.area}</td>
                    <td className="whitespace-nowrap text-xs">{b.period}</td>
                    <td className="max-w-xs truncate">{b.org}</td>
                    <td>{b.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 상세데이터 탭 ────────────────────────────────────────────────────────
function DetailTab({ rec }: { rec: InsaRecord }) {
  return (
    <div className="space-y-4">
      {/* 경력 */}
      {rec.careers.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">경력 ({rec.careers.length}건)</h3>
          <div className="overflow-x-auto">
            <table className="insa-table">
              <thead><tr><th>기간</th><th>구분</th><th>직급</th><th>부서</th><th>기관</th></tr></thead>
              <tbody>
                {rec.careers.map((c, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap text-xs">{c.period}</td>
                    <td>{c.type}</td><td>{c.rank}</td>
                    <td className="max-w-xs truncate">{c.dept}</td>
                    <td className="max-w-xs truncate">{c.office}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 포상 */}
      {rec.rewards.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">포상 ({rec.rewards.length}건)</h3>
          <table className="insa-table">
            <thead><tr><th>수상일</th><th>훈격</th><th>포상명</th><th>공적</th><th>수여기관</th></tr></thead>
            <tbody>
              {rec.rewards.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{r.date}</td>
                  <td>{r.honor}</td>
                  <td>{r.name}</td>
                  <td className="max-w-xs truncate">{r.merit}</td>
                  <td>{r.org}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 자격증 */}
      {rec.licenses.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">자격 ({rec.licenses.length}건)</h3>
          <table className="insa-table">
            <thead><tr><th>취득일</th><th>종류</th><th>자격명</th><th>과목</th><th>발급기관</th></tr></thead>
            <tbody>
              {rec.licenses.map((l, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{l.date}</td>
                  <td>{l.kind}</td>
                  <td>{l.type}</td>
                  <td>{l.subject}</td>
                  <td>{l.issuer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 자격증(19절) */}
      {rec.qualifications.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">자격증 ({rec.qualifications.length}건)</h3>
          <table className="insa-table">
            <thead><tr><th>자격명</th><th>취득일</th><th>발급기관</th><th>학점</th></tr></thead>
            <tbody>
              {rec.qualifications.map((q, i) => (
                <tr key={i}>
                  <td>{q.name}</td>
                  <td className="whitespace-nowrap">{q.date}</td>
                  <td>{q.issuer}</td>
                  <td>{q.credit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 병역 */}
      {rec.military && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">병역</h3>
          <InfoRows rows={[
            ['구분', rec.military.category],
            ['종류', rec.military.kind],
            ['병과', rec.military.branch],
            ['계급', rec.military.grade],
            ['복무기간', rec.military.period],
            ['제대구분', rec.military.discharge],
          ]} />
        </div>
      )}

      {/* 인식 섹션 목록 */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3">인식된 섹션 ({rec.sections.length}개)</h3>
        <div className="flex flex-wrap gap-2">
          {rec.sections.map(s => (
            <span key={s.no} className="text-xs px-2 py-0.5 rounded bg-white/5 text-slate-400">
              {s.no}. {s.title} <span className="text-slate-600">p.{s.page}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── 공용 StatCard ────────────────────────────────────────────────────────
type Color = 'sky' | 'emerald' | 'amber' | 'red' | 'indigo'
const COLOR_CLS: Record<Color, string> = {
  sky:     'text-sky-300',
  emerald: 'text-emerald-300',
  amber:   'text-amber-300',
  red:     'text-red-300',
  indigo:  'text-indigo-300',
}
function StatCard({ label, value, suffix, color }: {
  label: string; value: string | number; suffix?: string; color: Color
}) {
  return (
    <div className="card flex flex-col justify-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={clsx('text-xl font-bold', COLOR_CLS[color])}>
        {value}{suffix ? <span className="text-sm font-normal ml-0.5">{suffix}</span> : null}
      </p>
    </div>
  )
}

// ─── 메인 페이지 ────────────────────────────────────────────────────────────
export default function InsaAnalysisPage() {
  const [tab, setTab] = useState<Tab>('summary')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [rec, setRec] = useState<InsaRecord | null>(null)
  const [ana, setAna] = useState<InsaAnalysis | null>(null)
  const [rrnHidden, setRrnHidden] = useState(true)

  const handleFile = async (file: File) => {
    setLoading(true); setError(null); setRec(null); setAna(null)
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const parsed = await parseInsaPdf(new Uint8Array(buf))
      const analysis = analyzeInsa(parsed)
      setRec(parsed)
      setAna(analysis)
      setTab('summary')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const reset = () => { setRec(null); setAna(null); setError(null); setFileName('') }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="page-title">NEIS 인사기록 분석</h1>
          <p className="page-subtitle">인사카드 PDF 자동 파싱 · 법정의무연수 점검 · 연수통계</p>
        </div>
        {(rec || error) && (
          <button onClick={reset} className="btn-ghost flex items-center gap-1.5 text-xs mt-1">
            <RefreshCw size={13} />다른 파일
          </button>
        )}
      </div>

      {/* 로딩 */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <RefreshCw size={28} className="animate-spin text-sky-400" />
            <p className="text-sm">PDF 분석 중... ({fileName})</p>
            <p className="text-xs text-slate-600">최대 수 초 소요될 수 있습니다</p>
          </motion.div>
        )}

        {/* 에러 */}
        {!loading && error && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex gap-3">
            <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-medium text-sm mb-1">PDF 파싱 실패</p>
              <p className="text-red-400/80 text-xs">{error}</p>
              <p className="text-slate-500 text-xs mt-2">NEIS 개인인사기록카드 PDF인지 확인하세요. 스캔본(이미지 PDF)은 지원되지 않습니다.</p>
            </div>
          </motion.div>
        )}

        {/* 업로드 화면 */}
        {!loading && !error && !rec && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UploadZone onFile={handleFile} />
          </motion.div>
        )}

        {/* 분석 결과 */}
        {!loading && !error && rec && ana && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-4">
            {/* 탭 헤더 */}
            <div className="flex gap-1 bg-white/5 rounded-lg p-1 overflow-x-auto">
              {TABS.map(t => {
                const Icon = t.icon
                const isMandatoryWarn = t.id === 'mandatory' &&
                  ana.mandatory.some(m => m.status !== 'ok')
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
                      tab === t.id
                        ? 'bg-sky-500/20 text-sky-300'
                        : 'text-slate-400 hover:text-white hover:bg-white/5',
                    )}>
                    <Icon size={13} />
                    {t.label}
                    {isMandatoryWarn && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* 탭 콘텐츠 */}
            <AnimatePresence mode="wait">
              <motion.div key={tab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}>
                {tab === 'summary'   && <SummaryTab  rec={rec} ana={ana} rrnHidden={rrnHidden} onToggleRrn={() => setRrnHidden(v => !v)} />}
                {tab === 'mandatory' && <MandatoryTab ana={ana} />}
                {tab === 'training'  && <TrainingTab  rec={rec} ana={ana} />}
                {tab === 'hobong'    && <HobongTab    ana={ana} />}
                {tab === 'bonus'     && <BonusTab     rec={rec} ana={ana} />}
                {tab === 'detail'    && <DetailTab    rec={rec} />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 인라인 스타일 */}
      <style>{`
        .insa-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
        .insa-table th { padding: 4px 8px; text-align: left; color: rgb(148 163 184); border-bottom: 1px solid rgba(255,255,255,0.08); font-weight: 500; white-space: nowrap; }
        .insa-table td { padding: 4px 8px; color: rgb(203 213 225); border-bottom: 1px solid rgba(255,255,255,0.04); }
        .insa-table tbody tr:hover td { background: rgba(255,255,255,0.03); }
      `}</style>
    </div>
  )
}
