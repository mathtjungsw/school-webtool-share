import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, AlertCircle, AlertTriangle, RotateCcw,
  BarChart3, GraduationCap, Lightbulb, ClipboardCheck,
  ShieldCheck, LayoutDashboard, CheckCircle2, Star, TrendingUp, Info, Square,
  Target, Sparkles, Printer,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { generateStructuredGemini, generateText, analyzeFile, analyzeFileStructuredGemini, Type } from '../services/llm'
import {
  analyzeGrades, analyzeAdmissionFit, analyzeSehakQuality,
  type FileInput, type GradeReport, type AdmissionFit, type SehakQuality, type FitLevel,
} from '../services/saenggibuAnalysis'
import clsx from 'clsx'

// ── Types ──────────────────────────────────────────────────────────────────
interface AnalyzedRecord {
  summary: string
  strengths: string[]
  weaknesses: string[]
  attendance: { summary: string; unauthorizedAbsences: number; specialNotes: string[] }
  awards: { summary: string; keyAchievements: string[] }
  creativeActivities: { autonomous: string[]; club: string[]; volunteer: string[]; career: string[]; keywords: string[] }
  subjectSpecialties: { summary: string; strongSubjects: string[]; academicKeywords: string[] }
  behavioralCharacteristics: { summary: string; coreValues: string[] }
  careerHistory: { history: string[]; consistency: 'High' | 'Medium' | 'Low'; comment: string }
  keyActivities: Array<{ activity: string; description: string; category?: string }>
}

interface RecommendedMajor { major: string; reason: string; suitability: number }
interface MissingItemsResult {
  missingItems: Array<{ item: string; suggestion: string }>
  duplicateItems: Array<{ item: string; suggestion: string }>
}
interface RecommendedTopic { topic: string; reason: string }

interface CheckSection {
  sectionName: string; status: 'pass' | 'warning' | 'fail'
  issues: Array<{ type: 'error' | 'warning' | 'info'; message: string; suggestion?: string }>
  positiveFeedback?: string
}
interface CheckResult { overallSummary: string; sections: CheckSection[] }

// ── System Prompts ──────────────────────────────────────────────────────────
const ANALYSIS_PROMPT = `당신은 대한민국 상위권 대학 15년 경력의 수석 입학사정관입니다.
다음 생활기록부 텍스트를 정밀 분석하여 학생의 학업 역량, 전공 적합성, 발전 가능성을 평가하세요.
입시사정관의 관점에서 학생을 객관적으로 평가하되, 발전 가능성도 제시하세요.`

const CHECK_PROMPT = `당신은 대한민국 고등학교 생활기록부 기재요령 점검 최고 전문가입니다.
생활기록부 데이터를 정밀 분석하여 위반 사항(날짜형식, 비교표현, 특정명칭, 사교육유발, 소논문, 금지어)을 찾아내세요.
이슈의 message 필드에 문제가 되는 원문을 인용하여 구체적으로 지적하세요.`

type Tab = 'analysis' | 'grades' | 'sehak' | 'majors' | 'admission' | 'topics' | 'missing' | 'check'

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'analysis', label: '심층 분석', icon: LayoutDashboard },
  { id: 'grades', label: '성적 분석', icon: BarChart3 },
  { id: 'sehak', label: '세특 품질', icon: Sparkles },
  { id: 'majors', label: '전공 추천', icon: GraduationCap },
  { id: 'admission', label: '전형·대학', icon: Target },
  { id: 'topics', label: '탐구 주제', icon: Lightbulb },
  { id: 'missing', label: '누락 점검', icon: ClipboardCheck },
  { id: 'check', label: '기재 점검', icon: ShieldCheck },
]

export default function SaenggibuMasterPage() {
  const { config } = useAppStore()
  const [fileText, setFileText] = useState<string | null>(null)
  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [fileMimeType, setFileMimeType] = useState('application/pdf')
  const [fileName, setFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState('')
  const [tab, setTab] = useState<Tab>('analysis')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [record, setRecord] = useState<AnalyzedRecord | null>(null)
  const [gradeReport, setGradeReport] = useState<GradeReport | null>(null)
  const [admissionFit, setAdmissionFit] = useState<AdmissionFit | null>(null)
  const [sehakQuality, setSehakQuality] = useState<SehakQuality | null>(null)
  const [majors, setMajors] = useState<RecommendedMajor[] | null>(null)
  const [missing, setMissing] = useState<MissingItemsResult | null>(null)
  const [topics, setTopics] = useState<RecommendedTopic[] | null>(null)
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)

  const apiKey = (config.aiProvider === 'claude' ? config.claudeApiKey : config.aiProvider === 'openai' ? config.openaiApiKey : config.geminiApiKey) ?? ''
  const hasApiKey = !!apiKey

  const handleFileSelect = async (f: File) => {
    setError('')
    resetResults()
    setFileName(f.name)
    if (f.name.endsWith('.pdf') || f.type === 'application/pdf' || f.type.startsWith('image/')) {
      // Binary file: read as base64 for multimodal AI analysis
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setFileBase64(dataUrl.split(',')[1])
        setFileMimeType(f.type || 'application/pdf')
        setFileText(null)
      }
      reader.onerror = () => setError('파일을 읽을 수 없습니다.')
      reader.readAsDataURL(f)
    } else {
      // Text file (.txt, .xlsx, etc.)
      const reader = new FileReader()
      reader.onload = () => {
        setFileText(reader.result as string)
        setFileBase64(null)
      }
      reader.onerror = () => setError('파일을 읽을 수 없습니다.')
      reader.readAsText(f, 'utf-8')
    }
  }

  const resetResults = () => {
    setRecord(null); setGradeReport(null); setAdmissionFit(null); setSehakQuality(null)
    setMajors(null); setMissing(null); setTopics(null); setCheckResult(null)
  }

  const handleAnalyze = async () => {
    const hasFile = !!(fileText || fileBase64)
    if (!hasFile || !apiKey) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const signal = ctrl.signal
    setAnalyzing(true)
    setError('')
    setTab('analysis')
    const provider = config.aiProvider ?? 'gemini'
    const fileInput: FileInput = fileBase64
      ? { base64: fileBase64, mimeType: fileMimeType }
      : { text: fileText ?? '' }
    let recForExtras: AnalyzedRecord | null = null

    try {
      // 1. 심층 분석
      setProgress('생기부 심층 분석 중...')
      if (provider === 'gemini') {
        const rec = fileBase64
          ? await analyzeFileStructuredGemini<AnalyzedRecord>(
              apiKey, fileBase64, fileMimeType,
              '다음 생활기록부를 분석해주세요.',
              ANALYSIS_SCHEMA, ANALYSIS_PROMPT, signal,
            )
          : await generateStructuredGemini<AnalyzedRecord>(
              apiKey,
              `다음 생활기록부를 분석해주세요:\n\n${fileText}`,
              ANALYSIS_SCHEMA, ANALYSIS_PROMPT, signal,
            )
        recForExtras = rec
        setRecord(rec)
      } else {
        const raw = fileBase64
          ? await analyzeFile(
              config, fileBase64, fileMimeType,
              '다음 생활기록부를 분석하여 강점, 약점, 핵심 특징을 JSON으로 응답해주세요.\n응답은 { summary, strengths, weaknesses, keyActivities } 형태의 JSON이어야 합니다.',
              ANALYSIS_PROMPT, signal,
            )
          : await generateText(
              config,
              `다음 생활기록부를 분석하여 강점, 약점, 핵심 특징을 JSON으로 응답해주세요:\n\n${fileText}\n\n응답은 { summary, strengths, weaknesses, keyActivities } 형태의 JSON이어야 합니다.`,
              ANALYSIS_PROMPT, signal,
            )
        try {
          const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
          setRecord({
            summary: parsed.summary ?? '', strengths: parsed.strengths ?? [],
            weaknesses: parsed.weaknesses ?? [], keyActivities: parsed.keyActivities ?? [],
            attendance: { summary: '', unauthorizedAbsences: 0, specialNotes: [] },
            awards: { summary: '', keyAchievements: [] },
            creativeActivities: { autonomous: [], club: [], volunteer: [], career: [], keywords: [] },
            subjectSpecialties: { summary: '', strongSubjects: [], academicKeywords: [] },
            behavioralCharacteristics: { summary: '', coreValues: [] },
            careerHistory: { history: [], consistency: 'Medium', comment: '' },
          })
        } catch {
          throw new Error('AI 응답을 분석할 수 없습니다. Gemini 모델 사용을 권장합니다.')
        }
      }

      // 2. 성적·전형·세특 정밀 분석 — 원본에서 직접 판독 (모든 provider)
      setProgress('성적·전형·세특 정밀 분석 중...')
      const [grR, afR, sqR] = await Promise.allSettled([
        analyzeGrades(config, fileInput, signal),
        analyzeAdmissionFit(config, fileInput, signal),
        analyzeSehakQuality(config, fileInput, signal),
      ])
      if (signal.aborted) return
      if (grR.status === 'fulfilled') setGradeReport(grR.value)
      if (afR.status === 'fulfilled') setAdmissionFit(afR.value)
      if (sqR.status === 'fulfilled') setSehakQuality(sqR.value)
      const failed = [grR, afR, sqR].find(
        r => r.status === 'rejected' && (r.reason as Error)?.name !== 'AbortError',
      ) as PromiseRejectedResult | undefined

      // 3. 전공·탐구·누락·기재 점검 — Gemini 전용(구조화 출력)
      if (provider === 'gemini' && recForExtras) {
        setProgress('전공·탐구·누락·기재 점검 중...')
        const summary = JSON.stringify(recForExtras).slice(0, 4000)
        const [maj, mis, top] = await Promise.all([
          generateStructuredGemini<RecommendedMajor[]>(
            apiKey, `다음 학생 특성을 바탕으로 적합한 전공 3가지를 추천하세요:\n\n${summary}`,
            MAJORS_SCHEMA, undefined, signal,
          ),
          generateStructuredGemini<MissingItemsResult>(
            apiKey, `다음 생기부 요약을 바탕으로 누락 활동과 중복 의심 항목을 점검하세요:\n\n${summary}`,
            MISSING_SCHEMA, undefined, signal,
          ),
          generateStructuredGemini<RecommendedTopic[]>(
            apiKey, `학생 활동 요약을 기반으로 생기부에 기재 가능한 창의적 탐구 주제 5가지를 제안하세요:\n\n${summary}`,
            TOPICS_SCHEMA, undefined, signal,
          ),
        ])
        setMajors(maj); setMissing(mis); setTopics(top)

        const chk = fileBase64
          ? await analyzeFileStructuredGemini<CheckResult>(
              apiKey, fileBase64, fileMimeType,
              '다음 생활기록부의 기재요령 위반 사항을 점검하세요.',
              CHECK_SCHEMA, CHECK_PROMPT, signal,
            )
          : await generateStructuredGemini<CheckResult>(
              apiKey,
              `다음 생활기록부의 기재요령 위반 사항을 점검하세요:\n\n${fileText}`,
              CHECK_SCHEMA, CHECK_PROMPT, signal,
            )
        setCheckResult(chk)
      }

      if (failed) {
        setError('일부 분석 항목을 불러오지 못했습니다. (' + ((failed.reason as Error)?.message ?? '오류') + ')')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      abortRef.current = null
      setAnalyzing(false)
      setProgress('')
    }
  }

  const consistencyColor = (c: 'High' | 'Medium' | 'Low') =>
    c === 'High' ? 'text-emerald-400' : c === 'Medium' ? 'text-amber-400' : 'text-red-400'

  const statusBadge = (s: 'pass' | 'warning' | 'fail') => (
    <span className={clsx('text-xs px-2 py-0.5 rounded-full border font-medium',
      s === 'pass' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
      s === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
      'bg-red-500/10 border-red-500/20 text-red-400'
    )}>
      {s === 'pass' ? '통과' : s === 'warning' ? '주의' : '수정필요'}
    </span>
  )

  const hasResults = !!(record || gradeReport || checkResult)

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="page-title">학생부 분석</h1>
        <p className="page-subtitle">AI 입시사정관이 생활기록부를 심층 분석합니다. 성적·세특 품질·전형 적합도·전공 추천까지 종합 분석.</p>
      </div>

      {!hasApiKey && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-4">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-300">AI 기능을 사용하려면 <strong>환경설정</strong>에서 API 키를 먼저 입력해주세요.</p>
        </div>
      )}

      {/* Upload + Analyze */}
      {!hasResults && (
        <>
          <div
            className={clsx(
              'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-4',
              dragging ? 'border-violet-400 bg-violet-500/10' :
              (fileText || fileBase64) ? 'border-violet-500/40 bg-violet-500/5' :
              'border-white/10 hover:border-white/20 hover:bg-white/3'
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f) }}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".pdf,.txt,.xlsx,.xls,image/*" className="hidden"
              onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
            {(fileText || fileBase64) ? (
              <div className="flex flex-col items-center gap-2">
                <FileText size={32} className="text-violet-400" />
                <p className="text-white font-medium">{fileName}</p>
                <p className="text-xs text-slate-500">클릭하여 다른 파일 선택</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Upload size={32} />
                <p className="font-medium">생활기록부 파일을 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs">PDF, 이미지(JPG/PNG), 텍스트 지원</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {(fileText || fileBase64) && (
            analyzing ? (
              <button onClick={() => abortRef.current?.abort()}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 bg-red-600/80 hover:bg-red-600">
                <Square size={16} /> 분석 중단
                {progress && <span className="text-xs opacity-70 ml-1">({progress})</span>}
              </button>
            ) : (
              <button onClick={handleAnalyze} disabled={!hasApiKey}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-40">
                <Star size={16} /> 학생부 분석 시작
              </button>
            )
          )}
        </>
      )}

      {/* Results */}
      {hasResults && (
        <div>
          {/* 진행/오류 알림 */}
          {analyzing && (
            <div className="flex items-center gap-2 px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-xl mb-4 text-sm text-violet-300">
              <span className="w-3 h-3 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
              {progress || '분석 중...'}
              <button onClick={() => abortRef.current?.abort()} className="ml-auto text-xs text-red-300 hover:text-red-200">중단</button>
            </div>
          )}
          {error && !analyzing && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-4 text-amber-300 text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* Non-Gemini notice */}
          {(config.aiProvider === 'claude' || config.aiProvider === 'openai') && !checkResult && (
            <div className="flex items-start gap-2 px-4 py-3 bg-sky-500/10 border border-sky-500/20 rounded-xl mb-4 text-xs text-sky-300">
              <Info size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>{config.aiProvider === 'claude' ? 'Claude' : 'ChatGPT'}</strong>는 심층 분석·성적·전형·세특 탭을 지원합니다.
                전공 추천·탐구 주제·누락/기재 점검 탭까지 모두 이용하려면 <strong>Gemini</strong>를 사용해주세요.
              </span>
            </div>
          )}

          {/* 상단 액션 */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => { resetResults(); setFileText(null); setFileBase64(null); setFileName('') }}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              <RotateCcw size={14} /> 다른 파일 분석하기
            </button>
            <button onClick={() => printReport({ record, gradeReport, sehakQuality, admissionFit, majors, schoolName: config.schoolName })}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 transition-colors">
              <Printer size={14} /> 리포트 내보내기
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-surface-950 rounded-xl p-1 overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon
              const available =
                t.id === 'analysis' ? !!record :
                t.id === 'grades' ? !!gradeReport :
                t.id === 'sehak' ? !!sehakQuality :
                t.id === 'majors' ? !!majors :
                t.id === 'admission' ? !!admissionFit :
                t.id === 'topics' ? !!topics :
                t.id === 'missing' ? !!missing :
                !!checkResult
              return (
                <button key={t.id} onClick={() => setTab(t.id)} disabled={!available}
                  className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0',
                    tab === t.id ? 'bg-violet-500/20 text-violet-300' :
                    available ? 'text-slate-400 hover:text-white hover:bg-white/5' :
                    'text-slate-600 cursor-not-allowed'
                  )}>
                  <Icon size={14} /> {t.label}
                </button>
              )
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Analysis tab */}
              {tab === 'analysis' && record && (
                <div className="space-y-4">
                  <div className="card">
                    <h3 className="font-semibold text-white mb-2">종합 요약</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">{record.summary}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-emerald-400 mb-1 font-medium">강점</p>
                        <ul className="space-y-1">{record.strengths.map((s, i) => (
                          <li key={i} className="text-xs text-slate-300 flex gap-1.5"><CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />{s}</li>
                        ))}</ul>
                      </div>
                      <div>
                        <p className="text-xs text-amber-400 mb-1 font-medium">개선 필요</p>
                        <ul className="space-y-1">{record.weaknesses.map((w, i) => (
                          <li key={i} className="text-xs text-slate-300 flex gap-1.5"><AlertCircle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />{w}</li>
                        ))}</ul>
                      </div>
                    </div>
                  </div>
                  {record.keyActivities.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold text-white mb-3">핵심 활동</h3>
                      <div className="space-y-2">
                        {record.keyActivities.map((a, i) => (
                          <div key={i} className="p-3 bg-white/3 rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-white">{a.activity}</span>
                              {a.category && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400">{a.category}</span>}
                            </div>
                            <p className="text-xs text-slate-400">{a.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {record.careerHistory.history.length > 0 && (
                    <div className="card">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-white">진로 일관성</h3>
                        <span className={clsx('text-sm font-bold', consistencyColor(record.careerHistory.consistency))}>
                          {record.careerHistory.consistency === 'High' ? '높음' : record.careerHistory.consistency === 'Medium' ? '보통' : '낮음'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {record.careerHistory.history.map((h, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-white/5 rounded-lg text-slate-300">{h}</span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400">{record.careerHistory.comment}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Grades tab */}
              {tab === 'grades' && gradeReport && (
                <div className="space-y-4">
                  <div className="card">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h3 className="font-semibold text-white">성적 분석</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-300">{gradeReport.gradingSystem}</span>
                      {gradeReport.entranceYear && <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-300">{gradeReport.entranceYear}년 입학</span>}
                      {gradeReport.mainSubjectAverage != null && (
                        <span className="ml-auto text-sm font-bold text-violet-400">주요교과 {gradeReport.mainSubjectAverage.toFixed(2)}등급</span>
                      )}
                      {gradeReport.allSubjectAverage != null && (
                        <span className="text-xs text-slate-400">전교과 {gradeReport.allSubjectAverage.toFixed(2)}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{gradeReport.summary}</p>
                    {gradeReport.trendComment && <p className="text-xs text-slate-400 mb-3">📈 {gradeReport.trendComment}</p>}

                    {/* 교과영역별 평균 */}
                    {gradeReport.areaAverages.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {gradeReport.areaAverages.map((a, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 w-20 flex-shrink-0">{a.area}</span>
                            <div className="flex-1 bg-white/5 rounded-full h-1.5">
                              <div className={clsx('h-1.5 rounded-full', a.avg <= 2 ? 'bg-emerald-500' : a.avg <= 3.5 ? 'bg-amber-500' : 'bg-red-500')}
                                style={{ width: `${Math.max(8, 100 - (a.avg - 1) * 18)}%` }} />
                            </div>
                            <span className="text-xs text-slate-300 w-12 text-right">{a.avg.toFixed(2)}등급</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(gradeReport.strongAreas.length > 0 || gradeReport.weakAreas.length > 0) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="card">
                        <p className="text-xs text-emerald-400 mb-1.5 font-medium">강한 교과</p>
                        <div className="flex flex-wrap gap-1">{gradeReport.strongAreas.map((s, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-300 rounded-lg">{s}</span>))}</div>
                      </div>
                      <div className="card">
                        <p className="text-xs text-amber-400 mb-1.5 font-medium">약한 교과</p>
                        <div className="flex flex-wrap gap-1">{gradeReport.weakAreas.map((s, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-300 rounded-lg">{s}</span>))}</div>
                      </div>
                    </div>
                  )}

                  {/* 전 과목 표 */}
                  {gradeReport.semesters.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold text-white mb-3">학기별 과목 성적</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 border-b border-white/5">
                              <th className="text-left py-2 pr-3">학기</th>
                              <th className="text-left py-2 pr-3">교과</th>
                              <th className="text-left py-2 pr-3">과목</th>
                              <th className="text-center py-2 px-2">학점</th>
                              <th className="text-center py-2 px-2">석차등급</th>
                              <th className="text-center py-2 px-2">성취도</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gradeReport.semesters.flatMap((sem, si) =>
                              sem.subjects.map((s, ri) => (
                                <tr key={`${si}-${ri}`} className="border-b border-white/5 text-slate-300">
                                  <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{ri === 0 ? sem.label : ''}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{s.area}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{s.name}</td>
                                  <td className="text-center py-1.5 px-2">{s.credits ?? '-'}</td>
                                  <td className={clsx('text-center py-1.5 px-2 font-medium', s.rank != null && s.rank <= 2 ? 'text-emerald-400' : s.rank != null && s.rank >= 4 ? 'text-amber-400' : 'text-slate-300')}>{s.rank ?? '-'}</td>
                                  <td className="text-center py-1.5 px-2">{s.achievement ?? '-'}</td>
                                </tr>
                              )),
                            )}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-2">※ AI가 PDF를 판독한 결과로, 등급·수치는 원본과 대조 확인을 권장합니다.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Sehak quality tab */}
              {tab === 'sehak' && sehakQuality && (
                <div className="space-y-4">
                  <div className="card">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-white">세특 품질 종합</h3>
                      <span className="ml-auto text-lg font-bold text-violet-400">{sehakQuality.overallScore}<span className="text-xs text-slate-500">/100</span></span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{sehakQuality.overallComment}</p>
                  </div>
                  {sehakQuality.subjects.map((s, i) => (
                    <div key={i} className="card">
                      <h4 className="font-medium text-white mb-2">{s.subject}</h4>
                      <div className="space-y-1.5 mb-2">
                        <ScoreBar label="구체성" value={s.concreteness} />
                        <ScoreBar label="탐구성" value={s.inquiry} />
                        <ScoreBar label="진로연계" value={s.careerLink} />
                      </div>
                      <p className="text-xs text-slate-300">{s.comment}</p>
                      {s.improvement && <p className="text-xs text-violet-300 mt-1">→ {s.improvement}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Majors tab */}
              {tab === 'majors' && majors && (
                <div className="space-y-3">
                  {majors.map((m, i) => (
                    <div key={i} className="card">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                          <h3 className="font-semibold text-white">{m.major}</h3>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp size={13} className="text-violet-400" />
                          <span className="text-sm font-bold text-violet-400">{m.suitability}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-1.5 mb-2">
                        <div className="bg-gradient-to-r from-violet-500 to-sky-500 h-1.5 rounded-full" style={{ width: `${m.suitability}%` }} />
                      </div>
                      <p className="text-sm text-slate-300">{m.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Admission tab */}
              {tab === 'admission' && admissionFit && (
                <div className="space-y-4">
                  <div className="card">
                    <h3 className="font-semibold text-white mb-2">대입 전략 종합</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">{admissionFit.overallComment}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {admissionFit.byType.map((t, i) => (
                      <div key={i} className="card">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-white">{t.type}</span>
                          {fitBadge(t.fit)}
                        </div>
                        <p className="text-xs text-slate-400">{t.reason}</p>
                      </div>
                    ))}
                  </div>
                  <div className="card">
                    <h3 className="font-semibold text-white mb-3">참고 대학 라인</h3>
                    <div className="space-y-2">
                      {admissionFit.universityLines.map((u, i) => (
                        <div key={i} className="p-3 bg-white/3 rounded-xl">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                              u.tier.includes('도전') ? 'bg-red-500/15 text-red-300' :
                              u.tier.includes('안정') ? 'bg-emerald-500/15 text-emerald-300' :
                              'bg-violet-500/15 text-violet-300')}>{u.tier}</span>
                            <div className="flex flex-wrap gap-1">
                              {u.examples.map((ex, j) => (
                                <span key={j} className="text-xs px-2 py-0.5 bg-white/5 rounded-lg text-slate-300">{ex}</span>
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-slate-400">{u.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-white/3 rounded-xl text-[11px] text-slate-500">
                    <Info size={12} className="flex-shrink-0 mt-0.5" />
                    <span>{admissionFit.disclaimer || '실제 합격 여부는 모집요강·경쟁률·수능 결과 등에 따라 달라집니다. 본 결과는 참고용 추정입니다.'}</span>
                  </div>
                </div>
              )}

              {/* Topics tab */}
              {tab === 'topics' && topics && (
                <div className="space-y-3">
                  {topics.map((t, i) => (
                    <div key={i} className="card">
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                        <div>
                          <h3 className="font-medium text-white mb-1">{t.topic}</h3>
                          <p className="text-xs text-slate-400">{t.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Missing tab */}
              {tab === 'missing' && missing && (
                <div className="space-y-4">
                  {missing.missingItems.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold text-white mb-3">보완 필요 항목 ({missing.missingItems.length}개)</h3>
                      <div className="space-y-2">
                        {missing.missingItems.map((m, i) => (
                          <div key={i} className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                            <p className="text-sm font-medium text-amber-300">{m.item}</p>
                            <p className="text-xs text-slate-400 mt-1">→ {m.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {missing.duplicateItems.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold text-white mb-3">중복 의심 항목 ({missing.duplicateItems.length}개)</h3>
                      <div className="space-y-2">
                        {missing.duplicateItems.map((m, i) => (
                          <div key={i} className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                            <p className="text-sm font-medium text-red-300">{m.item}</p>
                            <p className="text-xs text-slate-400 mt-1">→ {m.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Check tab */}
              {tab === 'check' && checkResult && (
                <div className="space-y-3">
                  <div className="card">
                    <h3 className="font-semibold text-white mb-2">기재요령 점검 종합</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">{checkResult.overallSummary}</p>
                  </div>
                  {checkResult.sections.map((s, i) => (
                    <div key={i} className="card">
                      <div className="flex items-center gap-3 mb-3">
                        {statusBadge(s.status)}
                        <span className="font-medium text-white">{s.sectionName}</span>
                      </div>
                      {s.positiveFeedback && (
                        <div className="flex gap-2 p-2 bg-emerald-500/10 rounded-lg mb-2">
                          <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-emerald-300">{s.positiveFeedback}</p>
                        </div>
                      )}
                      {s.issues.map((issue, j) => (
                        <div key={j} className="flex gap-2 p-2 bg-white/3 rounded-lg mb-1">
                          {issue.type === 'error' ? <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" /> :
                           issue.type === 'warning' ? <AlertCircle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" /> :
                           <Info size={13} className="text-sky-400 flex-shrink-0 mt-0.5" />}
                          <div>
                            <p className="text-xs text-white">{issue.message}</p>
                            {issue.suggestion && <p className="text-xs text-slate-500 mt-0.5">→ {issue.suggestion}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ── 소형 UI 컴포넌트 ─────────────────────────────────────────────────────────
function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(5, value))
  const color = v >= 4 ? 'bg-emerald-500' : v >= 3 ? 'bg-violet-500' : 'bg-amber-500'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 w-14 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-white/5 rounded-full h-1.5">
        <div className={clsx('h-1.5 rounded-full', color)} style={{ width: `${(v / 5) * 100}%` }} />
      </div>
      <span className="text-[11px] text-slate-300 w-8 text-right">{v}/5</span>
    </div>
  )
}

function fitBadge(fit: FitLevel) {
  const map: Record<FitLevel, { label: string; cls: string }> = {
    High: { label: '높음', cls: 'bg-emerald-500/15 text-emerald-300' },
    Medium: { label: '보통', cls: 'bg-amber-500/15 text-amber-300' },
    Low: { label: '낮음', cls: 'bg-red-500/15 text-red-300' },
  }
  const m = map[fit] ?? map.Medium
  return <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', m.cls)}>{m.label}</span>
}

// ── 리포트 인쇄(숨김 iframe, ContractPage 패턴) ──────────────────────────────
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function printReport(data: {
  record: AnalyzedRecord | null
  gradeReport: GradeReport | null
  sehakQuality: SehakQuality | null
  admissionFit: AdmissionFit | null
  majors: RecommendedMajor[] | null
  schoolName?: string
}) {
  const { record, gradeReport, sehakQuality, admissionFit, majors, schoolName } = data
  const parts: string[] = []
  parts.push(`<div class="title">학생부 분석 리포트</div>`)
  parts.push(`<div class="sub">${esc(schoolName ?? '')} · ${new Date().toLocaleDateString('ko-KR')} · 학교업무도우미 AI 분석</div>`)

  if (record) {
    parts.push(`<h2>종합 요약</h2><p>${esc(record.summary)}</p>`)
    if (record.strengths.length) parts.push(`<h3>강점</h3><ul>${record.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`)
    if (record.weaknesses.length) parts.push(`<h3>개선 필요</h3><ul>${record.weaknesses.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`)
    if (record.careerHistory?.history?.length) {
      const c = record.careerHistory.consistency === 'High' ? '높음' : record.careerHistory.consistency === 'Low' ? '낮음' : '보통'
      parts.push(`<h3>진로 일관성: ${c}</h3><p>${esc(record.careerHistory.history.join(' → '))}<br>${esc(record.careerHistory.comment)}</p>`)
    }
  }

  if (gradeReport) {
    parts.push(`<h2>성적 분석 (${esc(gradeReport.gradingSystem)})</h2>`)
    const avg = gradeReport.mainSubjectAverage != null ? `주요교과 평균 ${gradeReport.mainSubjectAverage.toFixed(2)}등급` : ''
    const allAvg = gradeReport.allSubjectAverage != null ? ` · 전교과 ${gradeReport.allSubjectAverage.toFixed(2)}` : ''
    parts.push(`<p><b>${avg}${allAvg}</b><br>${esc(gradeReport.summary)}<br>${esc(gradeReport.trendComment)}</p>`)
    if (gradeReport.areaAverages.length) {
      parts.push(`<table><tr><th>교과영역</th><th>평균등급</th><th>과목수</th></tr>${
        gradeReport.areaAverages.map(a => `<tr><td>${esc(a.area)}</td><td class="center">${a.avg.toFixed(2)}</td><td class="center">${a.count}</td></tr>`).join('')
      }</table>`)
    }
    const rows = gradeReport.semesters.flatMap(sem => sem.subjects.map(s =>
      `<tr><td>${esc(sem.label)}</td><td>${esc(s.area)}</td><td>${esc(s.name)}</td><td class="center">${s.credits ?? '-'}</td><td class="center">${s.rank ?? '-'}</td><td class="center">${esc(s.achievement ?? '-')}</td></tr>`,
    ))
    if (rows.length) parts.push(`<table><tr><th>학기</th><th>교과</th><th>과목</th><th>학점</th><th>석차등급</th><th>성취도</th></tr>${rows.join('')}</table>`)
  }

  if (sehakQuality) {
    parts.push(`<h2>세특 품질 진단 (${sehakQuality.overallScore}/100)</h2><p>${esc(sehakQuality.overallComment)}</p>`)
    if (sehakQuality.subjects.length) {
      parts.push(`<table><tr><th>과목</th><th>구체성</th><th>탐구성</th><th>진로연계</th><th>개선 제안</th></tr>${
        sehakQuality.subjects.map(s => `<tr><td>${esc(s.subject)}</td><td class="center">${s.concreteness}/5</td><td class="center">${s.inquiry}/5</td><td class="center">${s.careerLink}/5</td><td>${esc(s.improvement)}</td></tr>`).join('')
      }</table>`)
    }
  }

  if (admissionFit) {
    parts.push(`<h2>대입 전형 적합도</h2><p>${esc(admissionFit.overallComment)}</p>`)
    parts.push(`<table><tr><th>전형</th><th>적합도</th><th>근거</th></tr>${
      admissionFit.byType.map(t => `<tr><td>${esc(t.type)}</td><td class="center">${t.fit === 'High' ? '높음' : t.fit === 'Low' ? '낮음' : '보통'}</td><td>${esc(t.reason)}</td></tr>`).join('')
    }</table>`)
    if (admissionFit.universityLines.length) {
      parts.push(`<h3>참고 대학 라인</h3><table><tr><th>구분</th><th>예시</th><th>비고</th></tr>${
        admissionFit.universityLines.map(u => `<tr><td>${esc(u.tier)}</td><td>${esc(u.examples.join(', '))}</td><td>${esc(u.note)}</td></tr>`).join('')
      }</table>`)
    }
    parts.push(`<p class="muted">${esc(admissionFit.disclaimer || '실제 합격 여부는 모집요강·경쟁률·수능 결과 등에 따라 달라지는 참고용 추정입니다.')}</p>`)
  }

  if (majors && majors.length) {
    parts.push(`<h2>전공 추천</h2><table><tr><th>전공</th><th>적합도</th><th>근거</th></tr>${
      majors.map(m => `<tr><td>${esc(m.major)}</td><td class="center">${m.suitability}%</td><td>${esc(m.reason)}</td></tr>`).join('')
    }</table>`)
  }

  const html = parts.join('\n')
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Malgun Gothic', sans-serif; font-size: 11pt; color: #111; background: #fff; line-height: 1.55; }
      h2 { font-size: 14pt; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #7c3aed; color: #4c1d95; }
      h3 { font-size: 12pt; margin: 12px 0 4px; color: #333; }
      p { margin: 4px 0; }
      ul { margin: 4px 0 4px 18px; padding: 0; }
      li { margin: 2px 0; }
      table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; }
      td, th { border: 1px solid #bbb; padding: 4px 7px; font-size: 9.5pt; vertical-align: top; }
      th { background: #f1edfb; font-weight: bold; }
      .center { text-align: center; }
      .title { font-size: 19pt; font-weight: bold; text-align: center; margin: 4px 0 6px; letter-spacing: 2px; }
      .sub { font-size: 9pt; text-align: center; color: #666; margin-bottom: 10px; }
      .muted { font-size: 8.5pt; color: #888; margin-top: 4px; }
    </style>
  </head><body>${html}</body></html>`)
  doc.close()
  iframe.onload = () => {
    iframe.contentWindow!.focus()
    iframe.contentWindow!.print()
    setTimeout(() => document.body.removeChild(iframe), 3000)
  }
}

// ── Gemini Response Schemas ────────────────────────────────────────────────
const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    attendance: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, unauthorizedAbsences: { type: Type.INTEGER }, specialNotes: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['summary', 'unauthorizedAbsences', 'specialNotes'] },
    awards: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, keyAchievements: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['summary', 'keyAchievements'] },
    creativeActivities: { type: Type.OBJECT, properties: { autonomous: { type: Type.ARRAY, items: { type: Type.STRING } }, club: { type: Type.ARRAY, items: { type: Type.STRING } }, volunteer: { type: Type.ARRAY, items: { type: Type.STRING } }, career: { type: Type.ARRAY, items: { type: Type.STRING } }, keywords: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['autonomous', 'club', 'volunteer', 'career', 'keywords'] },
    subjectSpecialties: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, strongSubjects: { type: Type.ARRAY, items: { type: Type.STRING } }, academicKeywords: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['summary', 'strongSubjects', 'academicKeywords'] },
    behavioralCharacteristics: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, coreValues: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['summary', 'coreValues'] },
    careerHistory: { type: Type.OBJECT, properties: { history: { type: Type.ARRAY, items: { type: Type.STRING } }, consistency: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] }, comment: { type: Type.STRING } }, required: ['history', 'consistency', 'comment'] },
    keyActivities: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { activity: { type: Type.STRING }, description: { type: Type.STRING }, category: { type: Type.STRING } }, required: ['activity', 'description'] } },
  },
  required: ['summary', 'strengths', 'weaknesses', 'attendance', 'awards', 'creativeActivities', 'subjectSpecialties', 'behavioralCharacteristics', 'careerHistory', 'keyActivities'],
}

const MAJORS_SCHEMA = {
  type: Type.ARRAY,
  items: { type: Type.OBJECT, properties: { major: { type: Type.STRING }, reason: { type: Type.STRING }, suitability: { type: Type.INTEGER } }, required: ['major', 'reason', 'suitability'] },
}

const MISSING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    missingItems: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { item: { type: Type.STRING }, suggestion: { type: Type.STRING } }, required: ['item', 'suggestion'] } },
    duplicateItems: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { item: { type: Type.STRING }, suggestion: { type: Type.STRING } }, required: ['item', 'suggestion'] } },
  },
  required: ['missingItems', 'duplicateItems'],
}

const TOPICS_SCHEMA = {
  type: Type.ARRAY,
  items: { type: Type.OBJECT, properties: { topic: { type: Type.STRING }, reason: { type: Type.STRING } }, required: ['topic', 'reason'] },
}

const CHECK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallSummary: { type: Type.STRING },
    sections: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { sectionName: { type: Type.STRING }, status: { type: Type.STRING, enum: ['pass', 'warning', 'fail'] }, issues: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING, enum: ['error', 'warning', 'info'] }, message: { type: Type.STRING }, suggestion: { type: Type.STRING } }, required: ['type', 'message'] } }, positiveFeedback: { type: Type.STRING } }, required: ['sectionName', 'status', 'issues'] } },
  },
  required: ['overallSummary', 'sections'],
}
