import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Loader2, CheckCircle2, AlertTriangle, RotateCcw,
  ChevronDown, FileDown, ListChecks, Info, FileText, Square,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAppStore } from '../stores/appStore'
import {
  analyzeStudentReport, getCategorySummary,
  CHECKLIST_ITEMS, type AnalysisResult,
} from '../services/studentReportChecker'
import clsx from 'clsx'

type PageState = 'idle' | 'analyzing' | 'results' | 'error'

const CATEGORY_ORDER = [
  '기본 원칙', '사교육 유발 요인', '고교 블라인드', '기재 금지 사항', '서식',
  '출결 특기사항', '수상경력', '자격증 및 인증', '창의적 체험활동',
  '봉사활동', '교과학습발달상황', '독서활동상황', '행동특성 및 종합의견',
]

function categoryItems(category: string) {
  return CHECKLIST_ITEMS.filter(i => i.category === category)
}

export default function StudentReportCheckerPage() {
  const { config } = useAppStore()
  const [state, setState] = useState<PageState>('idle')
  const [fileName, setFileName] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const [results, setResults] = useState<AnalysisResult[]>([])
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'issues' | 'pass'>('all')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORY_ORDER))

  const issueCount = results.filter(r => r.has_issue).length
  const passCount = results.length - issueCount

  const handleSelectFile = async () => {
    const path = await window.electron?.openFileDialog([{ name: 'PDF 파일', extensions: ['pdf'] }])
    if (!path) return
    setFileName(path.split(/[/\\]/).pop() ?? path)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setState('analyzing')
    setError('')
    setExpanded(new Set())
    try {
      const base64 = await window.electron?.readFileBase64(path)
      if (!base64) throw new Error('파일을 읽을 수 없습니다.')
      const res = await analyzeStudentReport(config, base64, ctrl.signal)
      setResults(res)
      setExpanded(new Set(res.filter(r => r.has_issue).map(r => r.id)))
      setExpandedCats(new Set(CATEGORY_ORDER))
      setState('results')
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setState('idle')
      } else {
        setError((e as Error).message)
        setState('error')
      }
    } finally {
      abortRef.current = null
    }
  }

  const toggleItem = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleCat = (cat: string) =>
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  const handleExport = async () => {
    const issues = results.filter(r => r.has_issue)
    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['AI 학교생활기록부 점검 결과 요약'],
      [],
      ['파일명', fileName],
      ['생성일시', new Date().toLocaleString('ko-KR')],
      ['총 점검 항목', results.length],
      ['검토 필요', issueCount],
      ['문제 없음', passCount],
    ])
    summarySheet['!cols'] = [{ wch: 16 }, { wch: 40 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, summarySheet, '요약')

    if (issues.length > 0) {
      const rows = issues.map(r => ({
        '번호': r.id,
        '구분': r.category,
        '점검 항목': r.title,
        '지적 사항': r.issue_description ?? '',
        '개선 문장 예시': r.suggestion ?? '',
        '근거 지침': r.source_guideline ?? '',
      }))
      const detailSheet = XLSX.utils.json_to_sheet(rows)
      detailSheet['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 40 }, { wch: 50 }, { wch: 50 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, detailSheet, '상세 결과')
    }

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[]
    await window.electron?.saveFileDialog('학생부_점검결과.xlsx', Array.from(buf))
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (state === 'idle') {
    return (
      <div className="student-report-root p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ListChecks size={20} className="text-violet-400" />
            AI 학생 보고서 체크리스트
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            생활기록부 PDF를 업로드하면 교육부 기재요령 49개 항목을 자동 점검합니다.
          </p>
        </div>

        <button
          onClick={handleSelectFile}
          className="w-full border-2 border-dashed border-violet-500/40 rounded-2xl p-10 flex flex-col items-center gap-3
                     hover:border-violet-400/70 hover:bg-violet-500/5 transition-all group"
        >
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
            <Upload size={24} className="text-violet-400" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-white">PDF 파일 선택</p>
            <p className="text-sm text-slate-400 mt-0.5">클릭하여 생활기록부 PDF를 선택하세요</p>
          </div>
        </button>

        {/* 점검 항목 미리보기 */}
        <div className="mt-6 bg-surface-800 rounded-xl p-4 border border-white/5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">점검 항목 ({CHECKLIST_ITEMS.length}개)</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ORDER.map(cat => {
              const count = categoryItems(cat).length
              return (
                <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 text-xs text-slate-300">
                  {cat} <span className="text-violet-400 font-semibold">{count}</span>
                </span>
              )
            })}
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 bg-white/3 rounded-lg p-3">
          <Info size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
          <span>PDF는 외부 서버에 전송되지 않습니다. 분석은 설정된 AI API (Gemini 권장)를 통해 수행됩니다.</span>
        </div>
      </div>
    )
  }

  // ── Analyzing ─────────────────────────────────────────────────────────────
  if (state === 'analyzing') {
    return (
      <div className="student-report-root flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={36} className="text-violet-400 animate-spin" />
        <div className="text-center">
          <p className="font-semibold text-white">AI 점검 중...</p>
          <p className="text-sm text-slate-400 mt-1">49개 항목을 분석하고 있습니다.</p>
        </div>
        <button
          onClick={() => abortRef.current?.abort()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium transition-colors"
        >
          <Square size={14} /> 분석 중단
        </button>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="student-report-root p-6 max-w-2xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-red-300 mb-1">분석 중 오류 발생</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button
            onClick={() => setState('idle')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-slate-300 transition-colors"
          >
            <RotateCcw size={14} />
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  // ── Results ───────────────────────────────────────────────────────────────
  const categorySummary = getCategorySummary(results)

  return (
    <div className="student-report-root p-6 max-w-4xl mx-auto space-y-4">
      {/* 헤더 요약 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ListChecks size={18} className="text-violet-400" />
            점검 결과
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
            <FileText size={11} />
            {fileName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setState('idle')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors"
          >
            <RotateCcw size={12} />
            새로 분석
          </button>
          <button
            onClick={handleExport}
            disabled={issueCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-white transition-colors"
          >
            <FileDown size={12} />
            Excel 저장
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-800 rounded-xl p-4 border border-white/5 text-center">
          <p className="text-2xl font-bold text-white">{results.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">전체 항목</p>
        </div>
        <div className={clsx(
          'rounded-xl p-4 border text-center',
          issueCount > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-surface-800 border-white/5',
        )}>
          <p className={clsx('text-2xl font-bold', issueCount > 0 ? 'text-amber-400' : 'text-white')}>{issueCount}</p>
          <p className="text-xs text-slate-400 mt-0.5">검토 필요</p>
        </div>
        <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20 text-center">
          <p className="text-2xl font-bold text-emerald-400">{passCount}</p>
          <p className="text-xs text-slate-400 mt-0.5">문제 없음</p>
        </div>
      </div>

      {issueCount === 0 && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-emerald-300">훌륭합니다! 모든 항목이 교육부 지침을 준수합니다.</p>
        </div>
      )}

      {/* 필터 탭 */}
      <div className="flex gap-1 bg-surface-800 rounded-xl p-1 border border-white/5 w-fit">
        {([['all', '전체'], ['issues', '검토 필요'], ['pass', '문제 없음']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              filter === key
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {label}
            {key === 'all' && ` (${results.length})`}
            {key === 'issues' && ` (${issueCount})`}
            {key === 'pass' && ` (${passCount})`}
          </button>
        ))}
      </div>

      {/* 카테고리별 결과 */}
      <div className="space-y-2">
        {CATEGORY_ORDER.map(cat => {
          const catItems = results.filter(r =>
            r.category === cat &&
            (filter === 'all' || (filter === 'issues' && r.has_issue) || (filter === 'pass' && !r.has_issue)),
          )
          if (catItems.length === 0) return null
          const summary = categorySummary.get(cat) ?? { total: 0, issues: 0 }
          const catOpen = expandedCats.has(cat)

          return (
            <div key={cat} className="bg-surface-800 rounded-xl border border-white/5 overflow-hidden">
              {/* 카테고리 헤더 */}
              <button
                onClick={() => toggleCat(cat)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{cat}</span>
                  {summary.issues > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-md">
                      <AlertTriangle size={10} />
                      {summary.issues}건
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {summary.total - summary.issues}/{summary.total} 통과
                  </span>
                  <motion.div animate={{ rotate: catOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={14} className="text-slate-500" />
                  </motion.div>
                </div>
              </button>

              {/* 항목 목록 */}
              <AnimatePresence initial={false}>
                {catOpen && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="border-t border-white/5 divide-y divide-white/5">
                      {catItems.map(item => {
                        const open = expanded.has(item.id)
                        return (
                          <div key={item.id}>
                            <button
                              onClick={() => item.has_issue && toggleItem(item.id)}
                              className={clsx(
                                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                                item.has_issue ? 'hover:bg-white/3 cursor-pointer' : 'cursor-default',
                              )}
                            >
                              {item.has_issue ? (
                                <AlertTriangle size={15} className="text-amber-400 flex-shrink-0" />
                              ) : (
                                <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
                              )}
                              <span className={clsx(
                                'text-sm flex-1',
                                item.has_issue ? 'text-slate-200' : 'text-slate-400',
                              )}>
                                {item.title}
                              </span>
                              {item.has_issue && (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xs text-amber-400 font-medium">검토 필요</span>
                                  <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
                                    <ChevronDown size={13} className="text-slate-500" />
                                  </motion.div>
                                </div>
                              )}
                              {!item.has_issue && (
                                <span className="text-xs text-emerald-500 flex-shrink-0">문제 없음</span>
                              )}
                            </button>

                            {/* 상세 내용 (이슈 있는 항목만) */}
                            <AnimatePresence initial={false}>
                              {item.has_issue && open && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.18 }}
                                  style={{ overflow: 'hidden' }}
                                >
                                  <div className="px-4 pb-4 space-y-3 bg-amber-400/3">
                                    {item.issue_description && (
                                      <div>
                                        <p className="text-xs font-semibold text-slate-400 mb-1">지적 사항</p>
                                        <p className="text-sm text-slate-200 bg-red-500/10 border border-red-500/20 rounded-lg p-3 leading-relaxed">
                                          {item.issue_description}
                                        </p>
                                      </div>
                                    )}
                                    {item.suggestion && (
                                      <div>
                                        <p className="text-xs font-semibold text-slate-400 mb-1">개선 문장 예시</p>
                                        <p className="text-sm text-slate-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 leading-relaxed">
                                          {item.suggestion}
                                        </p>
                                      </div>
                                    )}
                                    {item.source_guideline && (
                                      <p className="text-xs text-slate-500">
                                        근거 지침: {item.source_guideline}
                                      </p>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
