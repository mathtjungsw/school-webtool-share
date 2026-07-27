import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, Loader2, AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp, RotateCcw, AlertCircle, Square } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { analyzeFile } from '../services/llm'
import clsx from 'clsx'

const CHECKLIST_INSTRUCTIONS = `당신은 대한민국 고등학교 생활기록부(School Life Record) 기재요령 점검 최고 전문가입니다.
사용자가 업로드한 생활기록부 데이터를 정밀 분석하여 위반 사항, 오탈자, 개선 필요 사항을 찾아내야 합니다.
다음 체크리스트를 매우 엄격하고 비판적으로 적용하여 분석하세요.

### 1. [Zero Tolerance] 형식 및 필수 금지 사항
- 날짜 형식 엄수(YYYY.MM.DD.): 마지막에도 점(.)을 찍어야 함
- 비교 및 서열화 표현 절대 금지: 1등, 우승, 최고, 유일, 독보적 등
- 특정 명칭 금지: 학교명, 대학명, 병원명, 기업명, 사설 학원/기관명
- 서술 시점: 관찰자 시점("~함", "~임") 준수. 1인칭 및 존칭 금지

### 2. [논리적 일관성] 정밀 점검
- 출결-특기사항 모순 탐지
- 봉사 실적: 학교 교육계획 외 개인 봉사활동 구체 내용 기재 불가
- 중복 기재: 서로 다른 항목에 동일 문장 중복 확인

### 3. [항목별] 핵심 가이드
- [수상/자격증]: 교내상만 가능, 공인어학시험 절대 불가
- [교과세특]: 방과후학교, 영재교실, 소논문(R&E), 도서 출판 언급 금지
- [독서]: 도서명(저자)만 기재, 줄거리나 감상평 포함 시 수정 권고

응답 형식: 반드시 아래 JSON 형식을 준수하여 응답하세요.
{
  "overallSummary": "전체적인 총평 3~4문장",
  "sections": [
    {
      "sectionName": "항목 이름",
      "status": "pass" | "warning" | "fail",
      "issues": [
        {
          "type": "error" | "warning" | "info",
          "message": "구체적인 문제점 (원문 인용)",
          "suggestion": "수정 제안"
        }
      ],
      "positiveFeedback": "잘 된 부분 (없으면 생략)"
    }
  ]
}`

interface Issue {
  type: 'error' | 'warning' | 'info'
  message: string
  suggestion?: string
}

interface Section {
  sectionName: string
  status: 'pass' | 'warning' | 'fail'
  issues: Issue[]
  positiveFeedback?: string
}

interface CheckResult {
  overallSummary: string
  sections: Section[]
}

export default function SaenggibuCheckPage() {
  const { config } = useAppStore()
  const [file, setFile] = useState<{ name: string; base64: string; mimeType: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const hasApiKey = !!(config.claudeApiKey || config.openaiApiKey || config.geminiApiKey)

  const handleFileSelect = async (f: File) => {
    if (!f.type.includes('pdf') && !f.type.includes('image')) {
      setError('PDF 또는 이미지 파일만 지원합니다.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      setFile({ name: f.name, base64, mimeType: f.type || 'application/pdf' })
      setResult(null)
      setError('')
    }
    reader.readAsDataURL(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelect(f)
  }

  const handleAnalyze = async () => {
    if (!file) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setAnalyzing(true)
    setError('')
    try {
      const raw = await analyzeFile(
        config,
        file.base64,
        file.mimeType,
        `다음 생활기록부 파일을 정밀 점검하여 지정된 JSON 형식으로 응답해주세요.`,
        CHECKLIST_INSTRUCTIONS,
        ctrl.signal,
      )
      let json: CheckResult
      try {
        json = JSON.parse(raw.replace(/```json|```/g, '').trim()) as CheckResult
      } catch {
        throw new Error('AI 응답을 분석할 수 없습니다. Gemini 모델 사용을 권장합니다.')
      }
      setResult(json)
      setExpanded(Object.fromEntries(json.sections.map((_, i) => [i, json.sections[i].status !== 'pass'])))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      abortRef.current = null
      setAnalyzing(false)
    }
  }

  const statusColor = (s: 'pass' | 'warning' | 'fail') =>
    s === 'pass' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
    s === 'warning' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
    'text-red-400 bg-red-500/10 border-red-500/20'

  const issueIcon = (t: Issue['type']) =>
    t === 'error' ? <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" /> :
    t === 'warning' ? <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" /> :
    <Info size={14} className="text-sky-400 flex-shrink-0 mt-0.5" />

  const totalIssues = result?.sections.reduce((a, s) => a + s.issues.length, 0) ?? 0
  const failCount = result?.sections.filter(s => s.status === 'fail').length ?? 0
  const warnCount = result?.sections.filter(s => s.status === 'warning').length ?? 0

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title">학생부 점검</h1>
        <p className="page-subtitle">생활기록부 PDF를 업로드하면 AI가 기재요령 위반 사항을 자동으로 점검합니다.</p>
      </div>

      {!hasApiKey && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-4">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-300">AI 기능을 사용하려면 <strong>환경설정</strong>에서 API 키를 먼저 입력해주세요.</p>
        </div>
      )}

      {/* Upload area */}
      {!result && (
        <div
          className={clsx(
            'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-4',
            dragging ? 'border-violet-400 bg-violet-500/10' :
            file ? 'border-violet-500/40 bg-violet-500/5' :
            'border-white/10 hover:border-white/20 hover:bg-white/3'
          )}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileText size={32} className="text-violet-400" />
              <p className="text-white font-medium">{file.name}</p>
              <p className="text-xs text-slate-500">클릭하여 다른 파일 선택</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Upload size={32} />
              <p className="font-medium">PDF 또는 이미지 파일을 드래그하거나 클릭하여 업로드</p>
              <p className="text-xs">생활기록부 PDF, JPG, PNG 지원</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {file && !result && (
        analyzing ? (
          <button
            onClick={() => abortRef.current?.abort()}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 bg-red-600/80 hover:bg-red-600"
          >
            <Square size={16} /> 점검 중단
          </button>
        ) : (
          <button
            onClick={handleAnalyze}
            disabled={!hasApiKey}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-40"
          >
            <CheckCircle2 size={16} /> 학생부 점검 시작
          </button>
        )
      )}

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Summary card */}
            <div className="card">
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-semibold text-white">종합 총평</h2>
                <div className="flex gap-2">
                  {failCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/20">
                      수정필요 {failCount}개
                    </span>
                  )}
                  {warnCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/20">
                      주의 {warnCount}개
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/20">
                    총 {totalIssues}건
                  </span>
                </div>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{result.overallSummary}</p>
            </div>

            {/* Section cards */}
            {result.sections.map((section, i) => (
              <div key={i} className="card overflow-hidden">
                <button
                  onClick={() => setExpanded(v => ({ ...v, [i]: !v[i] }))}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className={clsx('text-xs px-2.5 py-1 rounded-lg border font-medium', statusColor(section.status))}>
                      {section.status === 'pass' ? '통과' : section.status === 'warning' ? '주의' : '수정필요'}
                    </span>
                    <span className="font-medium text-white">{section.sectionName}</span>
                    {section.issues.length > 0 && (
                      <span className="text-xs text-slate-500">{section.issues.length}건</span>
                    )}
                  </div>
                  {expanded[i] ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>

                <AnimatePresence>
                  {expanded[i] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                        {section.positiveFeedback && (
                          <div className="flex gap-2 p-3 bg-emerald-500/10 rounded-xl">
                            <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-emerald-300">{section.positiveFeedback}</p>
                          </div>
                        )}
                        {section.issues.map((issue, j) => (
                          <div key={j} className="flex gap-2 p-3 bg-white/3 rounded-xl">
                            {issueIcon(issue.type)}
                            <div className="space-y-1">
                              <p className="text-sm text-white">{issue.message}</p>
                              {issue.suggestion && (
                                <p className="text-xs text-slate-400">→ {issue.suggestion}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {section.issues.length === 0 && (
                          <p className="text-xs text-slate-500 text-center py-2">이슈 없음</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {/* Re-analyze button */}
            <button
              onClick={() => { setResult(null); setFile(null) }}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw size={14} />
              다른 파일 점검하기
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
