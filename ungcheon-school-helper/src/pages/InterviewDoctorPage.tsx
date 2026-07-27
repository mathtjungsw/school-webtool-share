import { useState, useRef } from 'react'
import {
  Mic, Loader2, Square, RotateCcw, Sparkles, AlertTriangle,
  Lightbulb, CheckCircle2, TriangleAlert,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { analyzeInterview, type InterviewAnalysis } from '../services/interviewDoctor'

type PageState = 'idle' | 'loading' | 'result' | 'error'

export default function InterviewDoctorPage() {
  const { config } = useAppStore()
  const [state, setState] = useState<PageState>('idle')
  const [script, setScript] = useState('')
  const [result, setResult] = useState<InterviewAnalysis | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const handleAnalyze = async () => {
    if (!script.trim()) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setState('loading')
    setError('')
    setResult(null)
    try {
      const data = await analyzeInterview(config, script.trim(), ctrl.signal)
      setResult(data)
      setState('result')
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

  // ── 로딩 ──
  if (state === 'loading') {
    return (
      <div className="interview-doctor-root flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={36} className="text-sky-400 animate-spin" />
        <div className="text-center">
          <p className="font-semibold text-white">AI가 면접 답변을 분석 중...</p>
          <p className="text-sm text-slate-400 mt-1">표현력·논리 구조·역량 표현을 살펴보고 있습니다.</p>
        </div>
        <button
          onClick={() => abortRef.current?.abort()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium transition-colors"
        >
          <Square size={14} /> 중단
        </button>
      </div>
    )
  }

  // ── 오류 ──
  if (state === 'error') {
    return (
      <div className="interview-doctor-root p-6 max-w-2xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-red-300 mb-1">분석 실패</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button
            onClick={() => setState('idle')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-slate-300 transition-colors"
          >
            <RotateCcw size={14} /> 다시 시도
          </button>
        </div>
      </div>
    )
  }

  // ── 결과 ──
  if (state === 'result' && result) {
    return (
      <div className="interview-doctor-root p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Mic size={18} className="text-sky-400" /> 면접 피드백 결과
          </h2>
          <button
            onClick={() => { setState('idle'); setResult(null) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs text-white transition-colors"
          >
            <RotateCcw size={12} /> 새 분석
          </button>
        </div>

        <ResultCard title="전체 총평" icon={<Lightbulb size={16} className="text-amber-400" />} accent="amber">
          <p className="text-sm text-slate-300 leading-relaxed">{result.overallSummary}</p>
        </ResultCard>

        <div className="grid md:grid-cols-2 gap-4">
          <ResultCard title="잘한 점" icon={<CheckCircle2 size={16} className="text-emerald-400" />} accent="emerald">
            <ul className="space-y-2 text-sm text-slate-300 list-disc list-inside">
              {result.goodPoints.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </ResultCard>
          <ResultCard title="개선할 점" icon={<TriangleAlert size={16} className="text-rose-400" />} accent="rose">
            <ul className="space-y-2 text-sm text-slate-300 list-disc list-inside">
              {result.areasForImprovement.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </ResultCard>
        </div>

        <ResultCard title="코치의 마지막 조언" icon={<Lightbulb size={16} className="text-sky-400" />} accent="sky">
          <p className="text-sm text-slate-300 leading-relaxed">{result.finalAdvice}</p>
        </ResultCard>
      </div>
    )
  }

  // ── 입력 (idle) ──
  return (
    <div className="interview-doctor-root p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Mic size={20} className="text-sky-400" /> 면접닥터 — 대입 면접 코칭
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          학생부종합전형·면접형 전형 답변 스크립트를 붙여넣으면 AI가 표현력·논리·역량을 코칭합니다.
        </p>
      </div>

      <div className="bg-surface-800 rounded-2xl p-6 border border-white/5">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">면접 답변 스크립트</label>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          placeholder="예: 안녕하세요, 저는 생명과학에 관심이 많은 지원자 OOO입니다. 고등학교 3년간..."
          className="w-full h-56 bg-surface-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 resize-y leading-relaxed"
        />
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">설정된 AI API(Gemini 권장)로 분석됩니다.</p>
          <button
            onClick={handleAnalyze}
            disabled={!script.trim()}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
          >
            <Sparkles size={15} /> AI 분석 받기
          </button>
        </div>
      </div>
    </div>
  )
}

const ACCENT: Record<string, string> = {
  amber: 'border-amber-500/20',
  emerald: 'border-emerald-500/20',
  rose: 'border-rose-500/20',
  sky: 'border-sky-500/20',
}

function ResultCard({ title, icon, accent, children }: {
  title: string
  icon: React.ReactNode
  accent: string
  children: React.ReactNode
}) {
  return (
    <div className={`bg-surface-800 rounded-xl p-4 border ${ACCENT[accent] ?? 'border-white/5'}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}
