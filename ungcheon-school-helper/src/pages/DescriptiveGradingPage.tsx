import { useState, useRef } from 'react'
import {
  SquarePen, Loader2, Square, RotateCcw, Sparkles, AlertTriangle,
  Type as TypeIcon, Image as ImageIcon, CheckCircle2, TriangleAlert, FileUp,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import {
  gradeAnswer, type GradingContext, type GradingResult, type Answer,
} from '../services/descriptiveGrading'
import clsx from 'clsx'

type PageState = 'input' | 'loading' | 'result' | 'error'
type AnswerMode = 'text' | 'image'

const IMG_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
}

export default function DescriptiveGradingPage() {
  const { config } = useAppStore()
  const [state, setState] = useState<PageState>('input')
  const [ctx, setCtx] = useState<GradingContext>({ target: '', subject: '', problem: '' })
  const [mode, setMode] = useState<AnswerMode>('text')
  const [answerText, setAnswerText] = useState('')
  const [imageData, setImageData] = useState<{ name: string; mimeType: string; data: string } | null>(null)
  const [result, setResult] = useState<GradingResult | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const canGrade = ctx.target.trim() && ctx.subject.trim() && ctx.problem.trim() &&
    (mode === 'text' ? answerText.trim() : imageData)

  const handlePickImage = async () => {
    const path = await window.electron?.openFileDialog([
      { name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
    ])
    if (!path) return
    const ext = (path.split('.').pop() ?? '').toLowerCase()
    const mimeType = IMG_MIME[ext] ?? 'image/png'
    const data = await window.electron?.readFileBase64(path)
    if (!data) { setError('이미지를 읽을 수 없습니다.'); return }
    setImageData({ name: path.split(/[/\\]/).pop() ?? path, mimeType, data })
  }

  const handleGrade = async () => {
    if (!canGrade) return
    const answer: Answer = mode === 'text'
      ? { text: answerText.trim() }
      : { image: { mimeType: imageData!.mimeType, data: imageData!.data } }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setState('loading')
    setError('')
    setResult(null)
    try {
      const data = await gradeAnswer(config, ctx, answer, ctrl.signal)
      setResult(data)
      setState('result')
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setState('input')
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
      <div className="descriptive-grading-root flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={36} className="text-emerald-400 animate-spin" />
        <div className="text-center">
          <p className="font-semibold text-white">AI가 답안을 채점 중...</p>
          <p className="text-sm text-slate-400 mt-1">논리성·내용·표현력을 기준으로 평가하고 있습니다.</p>
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
      <div className="descriptive-grading-root p-6 max-w-2xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-red-300 mb-1">채점 실패</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button
            onClick={() => setState('input')}
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
      <div className="descriptive-grading-root p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <SquarePen size={18} className="text-emerald-400" /> 채점 결과
          </h2>
          <button
            onClick={() => setState('input')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white transition-colors"
          >
            <RotateCcw size={12} /> 새 채점
          </button>
        </div>

        {!result.isGradable ? (
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <TriangleAlert size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300 mb-1">채점할 수 없는 답안입니다</p>
              <p className="text-sm text-slate-300">{result.overallFeedback.summary}</p>
            </div>
          </div>
        ) : (
          <>
            {/* 총점 + 기준별 */}
            <div className="bg-surface-800 rounded-xl p-5 border border-white/5">
              <div className="flex items-end gap-2 mb-4">
                <span className="text-4xl font-bold text-emerald-400">{result.totalScore}</span>
                <span className="text-sm text-slate-500 mb-1.5">/ 100점</span>
              </div>
              <div className="space-y-3">
                {result.criteria.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-200">{c.name}</span>
                      <span className="text-xs text-slate-400">{c.score} / 10</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, c.score * 10)}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{c.feedback}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 종합 */}
            <div className="bg-surface-800 rounded-xl p-4 border border-white/5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">종합 총평</p>
              <p className="text-sm text-slate-300 leading-relaxed">{result.overallFeedback.summary}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/20">
                <p className="text-sm font-bold text-emerald-300 flex items-center gap-1.5 mb-2"><CheckCircle2 size={15} /> 강점</p>
                <ul className="space-y-1.5 text-sm text-slate-300 list-disc list-inside">
                  {result.overallFeedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/20">
                <p className="text-sm font-bold text-amber-300 flex items-center gap-1.5 mb-2"><TriangleAlert size={15} /> 개선 방안</p>
                <ul className="space-y-1.5 text-sm text-slate-300 list-disc list-inside">
                  {result.overallFeedback.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── 입력 ──
  return (
    <div className="descriptive-grading-root p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <SquarePen size={20} className="text-emerald-400" /> 서·논술형 채점
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          평가 맥락과 학생 답안(텍스트/사진)을 입력하면 AI가 루브릭으로 채점하고 피드백을 제공합니다.
        </p>
      </div>

      <div className="bg-surface-800 rounded-2xl p-6 border border-white/5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="평가 대상" value={ctx.target} onChange={v => setCtx({ ...ctx, target: v })} placeholder="예: 고등학교 1학년" />
          <Field label="교과" value={ctx.subject} onChange={v => setCtx({ ...ctx, subject: v })} placeholder="예: 국어(문학)" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">문제</label>
          <textarea
            value={ctx.problem}
            onChange={e => setCtx({ ...ctx, problem: e.target.value })}
            placeholder="학생이 답해야 할 서술형 문제를 입력하세요."
            className="w-full h-20 bg-surface-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 resize-y"
          />
        </div>

        {/* 답안 입력 모드 */}
        <div>
          <div className="flex items-center gap-1 bg-surface-900 rounded-xl p-1 border border-white/5 w-fit mb-2">
            {([['text', '텍스트', TypeIcon], ['image', '사진', ImageIcon]] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  mode === k ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          {mode === 'text' ? (
            <textarea
              value={answerText}
              onChange={e => setAnswerText(e.target.value)}
              placeholder="학생 답안을 붙여넣으세요."
              className="w-full h-40 bg-surface-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 resize-y leading-relaxed"
            />
          ) : (
            <button
              onClick={handlePickImage}
              className="w-full border-2 border-dashed border-emerald-500/30 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-emerald-400/60 hover:bg-emerald-500/5 transition-all"
            >
              <FileUp size={22} className="text-emerald-400" />
              <p className="text-sm text-slate-300">{imageData ? imageData.name : '답안 사진 선택 (png/jpg/webp)'}</p>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-500">설정된 AI API(Gemini 권장)로 채점됩니다.</p>
          <button
            onClick={handleGrade}
            disabled={!canGrade}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
          >
            <Sparkles size={15} /> AI 채점
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
      />
    </div>
  )
}
