import { useState, useEffect, useRef } from 'react'
import {
  MessagesSquare, Loader2, Square, RotateCcw, Sparkles, AlertTriangle,
  Printer, ChevronDown, Plus, Trash2, Save, Download, ClipboardList, FileText,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import {
  generateFeedback, FeedbackStyle, defaultRubric, resizeLevelDescriptors,
  type AIFeedback, type CustomRubric, type GeneralContext,
} from '../services/feedbackAssistant'
import { printHtml, escapeHtml } from '../utils/printHtml'
import clsx from 'clsx'

type Mode = 'general' | 'rubric'
type PageState = 'input' | 'loading' | 'result' | 'error'

const PRESETS_KEY = 'feedback.rubricPresets'
const STYLE_OPTIONS = Object.values(FeedbackStyle)

export default function FeedbackAssistantPage() {
  const { config } = useAppStore()
  const [state, setState] = useState<PageState>('input')
  const [mode, setMode] = useState<Mode>('general')
  const [text, setText] = useState('')
  const [style, setStyle] = useState<FeedbackStyle>(FeedbackStyle.ENCOURAGING)
  const [studentName, setStudentName] = useState('')
  const [general, setGeneral] = useState<GeneralContext>({ targetAudience: '고등학교 1학년', subject: '국어', assignment: '' })
  const [rubric, setRubric] = useState<CustomRubric>(() => defaultRubric())
  const [feedback, setFeedback] = useState<AIFeedback | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const canRun = text.trim().length > 0

  const handleRun = async () => {
    if (!canRun) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setState('loading')
    setError('')
    setFeedback(null)
    try {
      const result = await generateFeedback(config, {
        text: text.trim(), style, fileType: '텍스트', mode,
        rubric: mode === 'rubric' ? rubric : undefined,
        generalContext: mode === 'general' ? general : undefined,
      }, ctrl.signal)
      setFeedback(result)
      setState('result')
    } catch (e) {
      if ((e as Error).name === 'AbortError') setState('input')
      else { setError((e as Error).message); setState('error') }
    } finally {
      abortRef.current = null
    }
  }

  const handlePrint = () => {
    if (!feedback) return
    printHtml(buildHtml(feedback, studentName || '학생', mode === 'rubric' ? rubric.numberOfLevels : 0), FB_PRINT_CSS)
  }

  // ── 로딩 ──
  if (state === 'loading') {
    return (
      <div className="feedback-assistant-root flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={36} className="text-emerald-400 animate-spin" />
        <div className="text-center">
          <p className="font-semibold text-white">AI가 과제를 분석 중...</p>
          <p className="text-sm text-slate-400 mt-1">{mode === 'rubric' ? '루브릭 기준별 점수와 피드백을 생성하고 있습니다.' : '잘한 점과 개선점을 정리하고 있습니다.'}</p>
        </div>
        <button onClick={() => abortRef.current?.abort()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium transition-colors">
          <Square size={14} /> 중단
        </button>
      </div>
    )
  }

  // ── 오류 ──
  if (state === 'error') {
    return (
      <div className="feedback-assistant-root p-6 max-w-2xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-red-300 mb-1">피드백 생성 실패</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button onClick={() => setState('input')} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-slate-300 transition-colors">
            <RotateCcw size={14} /> 다시 시도
          </button>
        </div>
      </div>
    )
  }

  // ── 결과 ──
  if (state === 'result' && feedback) {
    return (
      <div className="feedback-assistant-root p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MessagesSquare size={18} className="text-emerald-400" /> 피드백 결과
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors">
              <Printer size={12} /> 인쇄
            </button>
            <button onClick={() => setState('input')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white transition-colors">
              <RotateCcw size={12} /> 새 평가
            </button>
          </div>
        </div>

        <div className="bg-surface-800 rounded-xl p-4 border border-white/5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">총평</p>
          <p className="text-sm text-slate-300 leading-relaxed">{feedback.summary}</p>
        </div>

        {feedback.type === 'rubric' ? (
          <div className="space-y-3">
            {feedback.feedbackItems.map((it, i) => (
              <div key={i} className="bg-surface-800 rounded-xl p-4 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-200">{it.category}</span>
                  <span className="text-sm font-bold text-emerald-400">{it.score} / {rubric.numberOfLevels}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (it.score / rubric.numberOfLevels) * 100)}%` }} />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{it.feedback}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/20">
              <p className="text-sm font-bold text-emerald-300 mb-2">잘한 점</p>
              <ul className="space-y-1.5 text-sm text-slate-300 list-disc list-inside">
                {feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/20">
              <p className="text-sm font-bold text-amber-300 mb-2">개선할 점</p>
              <ul className="space-y-1.5 text-sm text-slate-300 list-disc list-inside">
                {feedback.areasForImprovement.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 입력 ──
  return (
    <div className="feedback-assistant-root p-6 max-w-3xl mx-auto pb-12">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <MessagesSquare size={20} className="text-emerald-400" /> 과제 피드백
        </h1>
        <p className="text-sm text-slate-400 mt-1">학생 과제 텍스트를 붙여넣으면 AI가 일반 피드백 또는 루브릭 기반 평가를 생성합니다.</p>
      </div>

      {/* 모드 토글 */}
      <div className="flex items-center gap-1 bg-surface-800 rounded-xl p-1 border border-white/5 w-fit mb-4">
        {([['general', '일반 피드백', FileText], ['rubric', '루브릭 평가', ClipboardList]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              mode === k ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200')}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {mode === 'general' ? (
          <div className="bg-surface-800 rounded-2xl p-5 border border-white/5 grid sm:grid-cols-3 gap-3">
            <TextField label="평가 대상" value={general.targetAudience} onChange={v => setGeneral({ ...general, targetAudience: v })} placeholder="예: 고1" />
            <TextField label="과목" value={general.subject} onChange={v => setGeneral({ ...general, subject: v })} placeholder="예: 국어" />
            <TextField label="과제 주제" value={general.assignment} onChange={v => setGeneral({ ...general, assignment: v })} placeholder="예: 시 감상문" />
          </div>
        ) : (
          <RubricEditor rubric={rubric} setRubric={setRubric} />
        )}

        {/* 공통: 스타일 + 학생명 */}
        <div className="bg-surface-800 rounded-2xl p-5 border border-white/5 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">피드백 어조</label>
            <select value={style} onChange={e => setStyle(e.target.value as FeedbackStyle)}
              className="w-full bg-surface-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50">
              {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <TextField label="학생 이름 (인쇄용, 선택)" value={studentName} onChange={setStudentName} placeholder="예: 홍길동" />
        </div>

        {/* 과제 텍스트 */}
        <div className="bg-surface-800 rounded-2xl p-5 border border-white/5">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">학생 과제 텍스트</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="학생이 제출한 과제 내용을 붙여넣으세요. (PDF/한글은 'PDF 텍스트 추출'·'만능 파일 파서'로 먼저 텍스트화)"
            className="w-full h-44 bg-surface-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 resize-y leading-relaxed"
          />
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-slate-500">설정된 AI API(Gemini 권장)로 분석됩니다.</p>
            <button onClick={handleRun} disabled={!canRun}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors">
              <Sparkles size={15} /> AI 피드백 생성
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 루브릭 편집기 ──
function RubricEditor({ rubric, setRubric }: { rubric: CustomRubric; setRubric: (r: CustomRubric) => void }) {
  const [openId, setOpenId] = useState<string | null>(rubric.criteria[0]?.id ?? null)
  const [presets, setPresets] = useState<Record<string, CustomRubric>>({})
  const [presetName, setPresetName] = useState('')

  useEffect(() => {
    window.electron?.configGet(PRESETS_KEY).then(v => {
      if (v && typeof v === 'object') setPresets(v as Record<string, CustomRubric>)
    })
  }, [])

  const savePresets = (next: Record<string, CustomRubric>) => {
    setPresets(next)
    window.electron?.configSet(PRESETS_KEY, next)
  }

  const setLevels = (n: number) => {
    const num = Math.max(2, Math.min(12, n || 2))
    setRubric({
      ...rubric,
      numberOfLevels: num,
      criteria: rubric.criteria.map(c => ({ ...c, levelDescriptors: resizeLevelDescriptors(c.levelDescriptors, num) })),
    })
  }

  const updateCriterionName = (id: string, name: string) =>
    setRubric({ ...rubric, criteria: rubric.criteria.map(c => c.id === id ? { ...c, name } : c) })

  const updateDescriptor = (id: string, level: number, description: string) =>
    setRubric({
      ...rubric,
      criteria: rubric.criteria.map(c => c.id === id
        ? { ...c, levelDescriptors: c.levelDescriptors.map(d => d.level === level ? { ...d, description } : d) }
        : c),
    })

  const addCriterion = () => {
    const id = `criterion-${Math.random().toString(36).slice(2)}`
    setRubric({
      ...rubric,
      criteria: [...rubric.criteria, {
        id, name: '새 평가 기준',
        levelDescriptors: resizeLevelDescriptors([], rubric.numberOfLevels),
      }],
    })
    setOpenId(id)
  }

  const removeCriterion = (id: string) =>
    setRubric({ ...rubric, criteria: rubric.criteria.filter(c => c.id !== id) })

  const META: [keyof CustomRubric, string][] = [
    ['targetAudience', '평가 대상'], ['subjectGroup', '교과'], ['topic', '과제 주제'],
    ['evaluationPurpose', '평가 목적'], ['achievementStandard', '성취기준'], ['directive', '평가 지시어'],
  ]

  return (
    <div className="bg-surface-800 rounded-2xl p-5 border border-white/5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        {META.map(([key, label]) => (
          <TextField key={key} label={label} value={String(rubric[key] ?? '')} onChange={v => setRubric({ ...rubric, [key]: v })} placeholder="" />
        ))}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">레벨 수</label>
          <input type="number" min={2} max={12} value={rubric.numberOfLevels}
            onChange={e => setLevels(parseInt(e.target.value, 10))}
            className="w-full bg-surface-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50" />
        </div>
      </div>

      {/* 기준 목록 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">평가 기준 ({rubric.criteria.length})</p>
          <button onClick={addCriterion} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">
            <Plus size={13} /> 기준 추가
          </button>
        </div>
        {rubric.criteria.map(c => {
          const open = openId === c.id
          return (
            <div key={c.id} className="bg-surface-900 rounded-xl border border-white/5 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                <input value={c.name} onChange={e => updateCriterionName(c.id, e.target.value)}
                  className="flex-1 bg-transparent text-sm text-slate-200 focus:outline-none" />
                <button onClick={() => setOpenId(open ? null : c.id)} className="p-1 text-slate-500 hover:text-slate-300">
                  <ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} />
                </button>
                <button onClick={() => removeCriterion(c.id)} className="p-1 text-slate-500 hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </div>
              {open && (
                <div className="px-3 pb-3 space-y-1.5 border-t border-white/5 pt-2">
                  {c.levelDescriptors.map(d => (
                    <div key={d.level} className="flex items-start gap-2">
                      <span className="text-[11px] text-slate-500 w-12 flex-shrink-0 pt-1.5">레벨 {d.level}</span>
                      <input value={d.description} onChange={e => updateDescriptor(c.id, d.level, e.target.value)}
                        className="flex-1 bg-surface-800 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/40" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 프리셋 */}
      <div className="border-t border-white/5 pt-3">
        <div className="flex gap-2 mb-2">
          <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="프리셋 이름으로 저장"
            className="flex-1 bg-surface-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50" />
          <button
            onClick={() => { if (presetName.trim()) { savePresets({ ...presets, [presetName.trim()]: rubric }); setPresetName('') } }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300">
            <Save size={12} /> 저장
          </button>
        </div>
        {Object.keys(presets).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(presets).map(([name, r]) => (
              <span key={name} className="inline-flex items-center gap-1 bg-surface-900 border border-white/10 rounded-lg pl-2.5 pr-1 py-1 text-xs text-slate-300">
                <button onClick={() => setRubric(r)} className="flex items-center gap-1 hover:text-emerald-300"><Download size={11} /> {name}</button>
                <button onClick={() => { const n = { ...presets }; delete n[name]; savePresets(n) }} className="text-slate-500 hover:text-red-400 px-0.5"><Trash2 size={11} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TextField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-surface-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50" />
    </div>
  )
}

// ── 인쇄 ──
const FB_PRINT_CSS = `
.sheet h1{font-size:18pt;border-bottom:2px solid #222;padding-bottom:6px;}
.sheet .meta{display:flex;gap:18px;font-size:10pt;color:#444;margin:10px 0 16px;}
.sheet h2{font-size:13pt;background:#eef;padding:5px 8px;border-radius:4px;margin:16px 0 8px;}
.sheet .item{border:1px solid #ccc;border-radius:6px;padding:8px 10px;margin-bottom:8px;}
.sheet .item .hd{display:flex;justify-content:space-between;font-weight:bold;font-size:11pt;margin-bottom:3px;}
.sheet ul{padding-left:20px;}
.sheet li{margin-bottom:5px;font-size:10.5pt;}
`

function buildHtml(fb: AIFeedback, student: string, levels: number): string {
  let body = `<h1>AI 피드백 리포트</h1>
    <div class="meta"><span><b>학생:</b> ${escapeHtml(student)}</span><span><b>평가일:</b> ${new Date().toLocaleDateString('ko-KR')}</span></div>
    <h2>총평</h2><p>${escapeHtml(fb.summary)}</p>`
  if (fb.type === 'rubric') {
    body += `<h2>세부 평가 항목</h2>` + fb.feedbackItems.map(it =>
      `<div class="item"><div class="hd"><span>${escapeHtml(it.category)}</span><span>${it.score} / ${levels}</span></div><p>${escapeHtml(it.feedback)}</p></div>`).join('')
  } else {
    body += `<h2>잘한 점</h2><ul>${fb.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    body += `<h2>개선할 점</h2><ul>${fb.areasForImprovement.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
  }
  body += `<p style="font-size:8pt;color:#888;text-align:center;margin-top:16px;">본 피드백은 AI가 생성했으며, 교사의 최종 검토를 거쳐 활용해야 합니다.</p>`
  return `<div class="sheet">${body}</div>`
}
