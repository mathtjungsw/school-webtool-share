import { useState, useMemo, useRef } from 'react'
import {
  BarChart3, Upload, Loader2, RotateCcw, AlertTriangle, ChevronLeft,
  Users, Layers, User, Sparkles, Square, Printer, FileSpreadsheet,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import {
  analyzeExcelBytes, generateAdmissionConsultation,
  type Student, type ClassAnalysisData,
} from '../services/gradeAnalysis'
import { printHtml, escapeHtml } from '../utils/printHtml'
import clsx from 'clsx'

const GRADE_COLORS: Record<string, string> = {
  '1등급': '#2E86DE', '2등급': '#27AE60', '3등급': '#F39C12', '4등급': '#E74C3C', '5등급': '#8E44AD',
}
const GRADE_BG: Record<number, string> = {
  1: 'bg-[#2E86DE]', 2: 'bg-[#27AE60]', 3: 'bg-[#F39C12]', 4: 'bg-[#E74C3C]', 5: 'bg-[#8E44AD]',
}

type View = 'upload' | 'dashboard' | 'report'
type Tab = 'overall' | 'subject' | 'student'

export default function GradeAnalysisPage() {
  const { config } = useAppStore()
  const [view, setView] = useState<View>('upload')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [analysis, setAnalysis] = useState<ClassAnalysisData | null>(null)
  const [tab, setTab] = useState<Tab>('overall')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const handleUpload = async () => {
    const path = await window.electron?.openFileDialog([{ name: 'Excel', extensions: ['xlsx', 'xls'] }])
    if (!path) return
    setFileName(path.split(/[/\\]/).pop() ?? path)
    setLoading(true)
    setError('')
    try {
      const bytes = await window.electron?.readFile(path)
      if (!bytes) throw new Error('파일을 읽을 수 없습니다.')
      const { students, classAnalysisData } = analyzeExcelBytes(bytes)
      setStudents(students)
      setAnalysis(classAnalysisData)
      setTab('overall')
      setView('dashboard')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setStudents([]); setAnalysis(null); setSelectedStudent(null)
    setFileName(''); setError(''); setView('upload')
  }

  // ── 업로드 ──
  if (view === 'upload') {
    return (
      <div className="grade-analysis-root p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 size={20} className="text-sky-400" /> 내신 분석 (5등급제 · 2022 개정)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            NEIS '학기말성적종합일람표' 엑셀을 업로드하면 5/9등급 환산·학급 분석·AI 대입 컨설팅을 제공합니다.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={32} className="text-sky-400 animate-spin" />
            <p className="text-sm text-slate-400">성적 데이터를 분석하는 중...</p>
          </div>
        ) : (
          <button
            onClick={handleUpload}
            className="w-full border-2 border-dashed border-sky-500/40 rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-sky-400/70 hover:bg-sky-500/5 transition-all group"
          >
            <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center group-hover:bg-sky-500/20 transition-colors">
              <Upload size={24} className="text-sky-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-white">엑셀 파일 선택</p>
              <p className="text-sm text-slate-400 mt-0.5">NEIS 학기말성적종합일람표 (.xlsx)</p>
            </div>
          </button>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />{error}
          </div>
        )}
      </div>
    )
  }

  // ── 학생 리포트 ──
  if (view === 'report' && selectedStudent && analysis) {
    return (
      <StudentReportView
        student={selectedStudent}
        analysis={analysis}
        config={config}
        onBack={() => { setSelectedStudent(null); setView('dashboard') }}
      />
    )
  }

  // ── 대시보드 ──
  if (view === 'dashboard' && analysis) {
    const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
      { id: 'overall', label: '전체 분석', icon: Users },
      { id: 'subject', label: '과목별 분석', icon: Layers },
      { id: 'student', label: '학생별 분석', icon: User },
    ]
    return (
      <div className="grade-analysis-root p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-sky-400" /> {fileName || '내신 분석'}
          </h1>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors"
          >
            <RotateCcw size={12} /> 새 파일
          </button>
        </div>

        <div className="flex gap-1 bg-surface-800 rounded-xl p-1 border border-white/5 w-fit mb-5">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === t.id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'overall' && (
          <OverallView analysis={analysis} onSubjectSelect={() => setTab('subject')} />
        )}
        {tab === 'subject' && <SubjectView students={students} />}
        {tab === 'student' && (
          <StudentListView
            students={students}
            onSelect={(s) => { setSelectedStudent(s); setView('report') }}
          />
        )}
      </div>
    )
  }

  return null
}

// ── 전체 분석 ──
function OverallView({ analysis, onSubjectSelect }: { analysis: ClassAnalysisData; onSubjectSelect: () => void }) {
  const maxDist = Math.max(1, ...analysis.gradeDistribution.map(d => d.value))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="총 학생 수" value={`${analysis.totalStudents}명`} />
        <StatCard title="전체 평균 등급 (5등급제)" value={analysis.overallAverageFiveGrade.toFixed(2)} />
      </div>

      <div className="bg-surface-800 rounded-2xl p-5 border border-white/5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">전체 등급 분포 (과목 단위)</h3>
        <div className="flex items-end justify-around gap-3 h-48">
          {analysis.gradeDistribution.map(d => (
            <div key={d.name} className="flex flex-col items-center flex-1 h-full justify-end gap-1.5">
              <span className="text-xs text-slate-400">{d.value}</span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{ height: `${(d.value / maxDist) * 100}%`, backgroundColor: GRADE_COLORS[d.name], minHeight: d.value > 0 ? 4 : 0 }}
              />
              <span className="text-xs text-slate-400">{d.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface-800 rounded-2xl p-5 border border-white/5">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">과목별 평균 등급 (낮을수록 우수)</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {[...analysis.subjectMetrics].sort((a, b) => a.averageGrade - b.averageGrade).map(m => (
            <button
              key={m.subjectName}
              onClick={onSubjectSelect}
              className="w-full flex items-center text-sm p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
            >
              <span className="w-2/5 font-medium text-slate-200 truncate pr-2">{m.subjectName}</span>
              <div className="w-3/5 flex items-center">
                <div className="w-full bg-white/5 rounded-full h-2 mr-3">
                  <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${(m.averageGrade / 5) * 100}%` }} />
                </div>
                <span className="font-semibold text-slate-300 w-28 text-right text-xs">
                  평균 {m.averageGrade.toFixed(2)} <span className="text-slate-500">(±{m.standardDeviation.toFixed(2)})</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 과목별 분석 ──
function SubjectView({ students }: { students: Student[] }) {
  const subjectList = useMemo(() => {
    const set = new Set<string>()
    students.forEach(s => s.scores.forEach(sc => set.add(sc.subjectName)))
    return Array.from(set).sort()
  }, [students])
  const [selected, setSelected] = useState(subjectList[0] ?? '')

  const data = useMemo(() => {
    if (!selected) return null
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let total = 0, sum = 0
    students.forEach(s => {
      const sc = s.scores.find(x => x.subjectName === selected)
      if (sc) { counts[sc.fiveGrade]++; sum += sc.fiveGrade; total++ }
    })
    return { counts, total, avg: total > 0 ? (sum / total).toFixed(2) : 'N/A' }
  }, [selected, students])

  const maxCount = data ? Math.max(1, ...Object.values(data.counts)) : 1

  return (
    <div className="bg-surface-800 rounded-2xl p-5 border border-white/5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
        <h3 className="text-sm font-semibold text-slate-300">과목별 등급 분포</h3>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="bg-surface-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50"
        >
          {subjectList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {data && (
        <>
          <p className="text-center text-sm text-slate-400 mb-4">
            <span className="font-bold text-slate-200">{selected}</span> · 수강자 {data.total}명 · 평균 등급 <span className="font-bold text-sky-400">{data.avg}</span>
          </p>
          <div className="flex items-end justify-around gap-3 h-48">
            {[1, 2, 3, 4, 5].map(g => (
              <div key={g} className="flex flex-col items-center flex-1 h-full justify-end gap-1.5">
                <span className="text-xs text-slate-400">{data.counts[g]}</span>
                <div
                  className="w-full rounded-t-md"
                  style={{ height: `${(data.counts[g] / maxCount) * 100}%`, backgroundColor: GRADE_COLORS[`${g}등급`], minHeight: data.counts[g] > 0 ? 4 : 0 }}
                />
                <span className="text-xs text-slate-400">{g}등급</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── 학생 목록 ──
function StudentListView({ students, onSelect }: { students: Student[]; onSelect: (s: Student) => void }) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'classRank' | 'name'>('classRank')
  const list = useMemo(() =>
    students
      .filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.number.includes(search))
      .sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name) : a.classRank - b.classRank)
  , [students, search, sortKey])

  return (
    <div>
      <div className="flex flex-col md:flex-row gap-3 justify-between mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="이름 또는 번호로 검색..."
          className="w-full md:w-1/2 bg-surface-900 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">정렬</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as 'classRank' | 'name')}
            className="bg-surface-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50"
          >
            <option value="classRank">성적순</option>
            <option value="name">이름순</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {list.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="bg-surface-800 p-4 rounded-xl border border-white/5 hover:border-sky-500/40 hover:bg-surface-700 transition-all text-left"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-white">{s.name}</p>
                <p className="text-xs text-slate-500">{s.class}반 {s.number}번</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">학급 내 순위</p>
                <p className="font-bold text-slate-300">{s.classRank}<span className="font-normal text-xs">/{students.length}</span></p>
              </div>
            </div>
            <div className="flex justify-between items-end mt-3">
              <div>
                <p className="text-[10px] text-slate-500">환산 9등급</p>
                <p className="text-sm font-medium text-slate-300">{s.averageNineGrade.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">평균 5등급</p>
                <p className="text-lg font-bold text-sky-400">{s.averageFiveGrade.toFixed(2)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 학생 리포트 ──
function StudentReportView({ student, analysis, config, onBack }: {
  student: Student
  analysis: ClassAnalysisData
  config: import('../types').AppConfig
  onBack: () => void
}) {
  const [consult, setConsult] = useState('')
  const [consulting, setConsulting] = useState(false)
  const [consultErr, setConsultErr] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const strong = student.scores.filter(s => s.zScore >= 0.7).sort((a, b) => b.zScore - a.zScore).map(s => s.subjectName)
  const weak = student.scores.filter(s => s.zScore <= -0.7).sort((a, b) => a.zScore - b.zScore).map(s => s.subjectName)
  const sorted = [...student.scores].sort((a, b) => a.fiveGrade - b.fiveGrade)

  const handleConsult = async () => {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setConsulting(true)
    setConsultErr('')
    try {
      const text = await generateAdmissionConsultation(config, student, ctrl.signal)
      setConsult(text)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setConsultErr((e as Error).message)
    } finally {
      setConsulting(false)
      abortRef.current = null
    }
  }

  const handlePrint = () => printHtml(buildReportHtml(student), REPORT_PRINT_CSS)

  return (
    <div className="grade-analysis-root p-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-slate-300 transition-colors">
          <ChevronLeft size={15} /> 뒤로
        </button>
        <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors">
          <Printer size={12} /> 인쇄
        </button>
      </div>

      <div className="bg-surface-800 rounded-2xl p-6 border border-white/5">
        <div className="text-center border-b border-white/10 pb-4 mb-6">
          <h2 className="text-xl font-bold text-white">학생 성적 분석 리포트</h2>
          <p className="text-lg mt-2 font-semibold text-sky-400">{student.name}</p>
          <p className="text-sm text-slate-500">{student.class}반 {student.number}번</p>
        </div>

        {(strong.length > 0 || weak.length > 0) && (
          <div className="mb-6 p-4 bg-surface-900 rounded-xl border border-white/5 space-y-2 text-sm text-slate-300">
            {strong.length > 0 && <p>👍 <span className="font-bold text-sky-400">{strong.join(', ')}</span> 과목에서 학급 평균 대비 높은 성취도를 보입니다.</p>}
            {weak.length > 0 && <p>✍️ <span className="font-bold text-amber-400">{weak.join(', ')}</span> 과목은 추가 학습 시 전체 성적 향상에 도움이 됩니다.</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard title="평균 등급 (5등급제)" value={student.averageFiveGrade.toFixed(3)} accent />
          <StatCard title="환산 평균 등급 (9등급제)" value={student.averageNineGrade.toFixed(3)} />
        </div>

        {/* 과목별 등급 막대 */}
        <h3 className="text-sm font-semibold text-slate-300 mb-3">과목별 등급</h3>
        <div className="space-y-2 mb-6">
          {sorted.map((sc, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="w-28 truncate text-slate-200">{sc.subjectName}</span>
              <div className="flex-1 bg-white/5 rounded-full h-2.5">
                <div className={clsx('h-2.5 rounded-full', GRADE_BG[sc.fiveGrade])} style={{ width: `${((6 - sc.fiveGrade) / 5) * 100}%` }} />
              </div>
              <span className="w-12 text-right text-slate-300 font-semibold">{sc.fiveGrade}등급</span>
            </div>
          ))}
        </div>

        {/* 상세 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-400">
            <thead className="text-slate-500 border-b border-white/10">
              <tr>
                <th className="px-3 py-2">과목명</th>
                <th className="px-3 py-2 text-center">5등급</th>
                <th className="px-3 py-2 text-center">9등급</th>
                <th className="px-3 py-2 text-center">Z</th>
                <th className="px-3 py-2 text-center">석차/수강</th>
                <th className="px-3 py-2 text-center">백분위</th>
                <th className="px-3 py-2 text-center">원점수</th>
                <th className="px-3 py-2 text-center">과목평균(±표준편차)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((sc, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="px-3 py-2 text-slate-200 font-medium whitespace-nowrap">{sc.subjectName}</td>
                  <td className="px-3 py-2 text-center">{sc.fiveGrade}</td>
                  <td className="px-3 py-2 text-center">{sc.nineGrade.toFixed(2)}</td>
                  <td className={clsx('px-3 py-2 text-center font-mono', sc.zScore > 0 ? 'text-sky-400' : 'text-rose-400')}>{sc.zScore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-center">{sc.rank}/{sc.totalStudents}</td>
                  <td className="px-3 py-2 text-center">{sc.percentile.toFixed(2)}</td>
                  <td className="px-3 py-2 text-center">{sc.originalScore}</td>
                  <td className="px-3 py-2 text-center">{sc.subjectAverage.toFixed(1)} (±{sc.standardDeviation.toFixed(1)})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI 대입 컨설팅 */}
      <div className="mt-6 bg-surface-800 rounded-2xl p-5 border border-violet-500/20">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" /> AI 대입 전략 컨설팅
          </h3>
          {consulting ? (
            <button onClick={() => abortRef.current?.abort()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-xs text-white">
              <Square size={12} /> 중단
            </button>
          ) : (
            <button onClick={handleConsult} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs text-white">
              <Sparkles size={12} /> {consult ? '다시 생성' : '상담 시작'}
            </button>
          )}
        </div>
        {consulting && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
            <Loader2 size={16} className="animate-spin text-violet-400" /> 성취도를 분석해 전략을 수립하고 있습니다...
          </div>
        )}
        {consultErr && <p className="text-sm text-red-400 py-2">{consultErr}</p>}
        {consult && !consulting && (
          <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap bg-surface-900 rounded-xl p-4 border border-white/5">{consult}</div>
        )}
        {!consult && !consulting && !consultErr && (
          <p className="text-xs text-slate-500">설정된 AI API(Gemini 권장)를 통해 학생 맞춤 대입 전략을 생성합니다.</p>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value, accent }: { title: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-surface-800 rounded-xl p-4 border border-white/5">
      <p className="text-[11px] text-slate-500 uppercase tracking-wider">{title}</p>
      <p className={clsx('mt-1 text-2xl font-bold', accent ? 'text-sky-400' : 'text-white')}>{value}</p>
    </div>
  )
}

// ── 인쇄 ──
const REPORT_PRINT_CSS = `
.sheet h1{font-size:18pt;text-align:center;}
.sheet .sub{text-align:center;color:#2E86DE;font-size:13pt;font-weight:bold;margin-top:6px;}
.sheet .cls{text-align:center;color:#555;font-size:10pt;margin-bottom:14px;}
.sheet .avg{display:flex;gap:24px;justify-content:center;margin:14px 0;font-size:11pt;}
.sheet table{border-collapse:collapse;width:100%;margin-top:10px;}
.sheet th,.sheet td{border:1px solid #888;padding:4px 6px;font-size:9pt;text-align:center;}
.sheet th{background:#eef;}
`

function buildReportHtml(student: Student): string {
  const sorted = [...student.scores].sort((a, b) => a.fiveGrade - b.fiveGrade)
  const rows = sorted.map(sc => `<tr>
    <td>${escapeHtml(sc.subjectName)}</td><td>${sc.fiveGrade}</td><td>${sc.nineGrade.toFixed(2)}</td>
    <td>${sc.zScore.toFixed(2)}</td><td>${sc.rank}/${sc.totalStudents}</td><td>${sc.percentile.toFixed(2)}</td>
    <td>${sc.originalScore}</td><td>${sc.subjectAverage.toFixed(1)} (±${sc.standardDeviation.toFixed(1)})</td></tr>`).join('')
  return `<div class="sheet">
    <h1>학생 성적 분석 리포트</h1>
    <div class="sub">${escapeHtml(student.name)}</div>
    <div class="cls">${escapeHtml(student.class)}반 ${escapeHtml(student.number)}번</div>
    <div class="avg"><span>평균 등급(5등급제): <b>${student.averageFiveGrade.toFixed(3)}</b></span><span>환산 평균(9등급제): <b>${student.averageNineGrade.toFixed(3)}</b></span></div>
    <table><thead><tr><th>과목명</th><th>5등급</th><th>9등급</th><th>Z</th><th>석차/수강</th><th>백분위</th><th>원점수</th><th>과목평균(±편차)</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="text-align:center;color:#888;font-size:8pt;margin-top:12px;">생성일: ${new Date().toLocaleString('ko-KR')} | 내신 분석 (2022 개정 교육과정)</p>
  </div>`
}
