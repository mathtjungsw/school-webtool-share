import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Clapperboard, Loader2, Square, RotateCcw, Printer, Sparkles,
  Eye, EyeOff, AlertTriangle,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { generateWorksheet, type WorksheetData } from '../services/movieWorksheet'
import { printHtml, escapeHtml } from '../utils/printHtml'
import clsx from 'clsx'

type PageState = 'idle' | 'loading' | 'result' | 'error'

export default function MovieWorksheetPage() {
  const { config } = useAppStore()
  const [state, setState] = useState<PageState>('idle')
  const [title, setTitle] = useState('')
  const [worksheet, setWorksheet] = useState<WorksheetData | null>(null)
  const [error, setError] = useState('')
  const [showAnswers, setShowAnswers] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const handleGenerate = async () => {
    const movie = title.trim()
    if (!movie) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setState('loading')
    setError('')
    setWorksheet(null)
    try {
      const data = await generateWorksheet(config, movie, ctrl.signal)
      setWorksheet(data)
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

  const handlePrint = () => {
    if (!worksheet) return
    printHtml(buildPrintHtml(worksheet, showAnswers), PRINT_CSS)
  }

  // ── 로딩 ──
  if (state === 'loading') {
    return (
      <div className="movie-worksheet-root flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={36} className="text-sky-400 animate-spin" />
        <div className="text-center">
          <p className="font-semibold text-white">학습지를 만드는 중...</p>
          <p className="text-sm text-slate-400 mt-1">「{title}」을(를) 분석해 문항을 구성하고 있습니다.</p>
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
      <div className="movie-worksheet-root p-6 max-w-2xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-red-300 mb-1">학습지 생성 실패</p>
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
  if (state === 'result' && worksheet) {
    return (
      <div className="movie-worksheet-root p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clapperboard size={18} className="text-sky-400" />
              {worksheet.movieTitle} — 영화 논술 학습지
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">중학교 3학년 수준 · 내용 {worksheet.contentQuestions.length} · 논술 {worksheet.essayQuestions.length} · 성찰 {worksheet.selfReflectionQuestions.length}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAnswers(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors"
            >
              {showAnswers ? <EyeOff size={12} /> : <Eye size={12} />}
              {showAnswers ? '예시답안 숨기기' : '예시답안 보기'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors"
            >
              <Printer size={12} /> 인쇄
            </button>
            <button
              onClick={() => { setState('idle'); setWorksheet(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs text-white transition-colors"
            >
              <RotateCcw size={12} /> 새 학습지
            </button>
          </div>
        </div>

        {/* 기본정보 */}
        <div className="grid grid-cols-3 gap-3">
          <InfoCard label="제작년도" value={worksheet.basicInfo.year} />
          <InfoCard label="네이버 평점" value={worksheet.basicInfo.naverRating} />
          <InfoCard label="관람등급" value={worksheet.basicInfo.ageRating} />
        </div>

        {/* 감독·배우 */}
        <Section title="감독 · 출연">
          <p className="text-sm text-slate-300"><span className="text-slate-500">감독</span> · {worksheet.directorAndActors.director}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {worksheet.directorAndActors.actors.map((a, i) => (
              <span key={i} className="text-xs bg-white/5 text-slate-300 px-2.5 py-1 rounded-lg">
                {a.name} <span className="text-slate-500">· {a.role}</span>
              </span>
            ))}
          </div>
        </Section>

        {/* 시놉시스 */}
        <Section title="시놉시스">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{worksheet.synopsis}</p>
        </Section>

        {/* 문항 */}
        <QList title="내용 관련 문제" color="sky" items={worksheet.contentQuestions} showAnswers={showAnswers} />
        <QList title="심화 논술형 문제" color="violet" items={worksheet.essayQuestions} showAnswers={showAnswers} />
        <QList title="'나'와 관련된 문제" color="amber" items={worksheet.selfReflectionQuestions} showAnswers={showAnswers} />
      </div>
    )
  }

  // ── 입력 (idle) ──
  return (
    <div className="movie-worksheet-root p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Clapperboard size={20} className="text-sky-400" />
          영화 논술 학습지 제작
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          영화 제목을 입력하면 30년차 국어 교사의 노하우로 중3 수준 논술 학습지를 자동 생성합니다.
        </p>
      </div>

      <div className="bg-surface-800 rounded-2xl p-6 border border-white/5">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">영화 제목</label>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleGenerate() }}
            placeholder="예: 인사이드 아웃, 기생충, 죽은 시인의 사회"
            className="flex-1 bg-surface-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50"
          />
          <button
            onClick={handleGenerate}
            disabled={!title.trim()}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
          >
            <Sparkles size={15} /> 학습지 생성
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          분석은 설정된 AI API(Gemini 권장)를 통해 수행됩니다. 환경설정에서 API 키를 먼저 등록하세요.
        </p>
      </div>
    </div>
  )
}

// ── 작은 컴포넌트 ──
function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-800 rounded-xl p-3 border border-white/5 text-center">
      <p className="text-sm font-semibold text-white truncate">{value || '정보 없음'}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-800 rounded-xl p-4 border border-white/5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      {children}
    </div>
  )
}

const Q_COLORS: Record<string, string> = {
  sky: 'text-sky-400',
  violet: 'text-violet-400',
  amber: 'text-amber-400',
}

function QList({ title, color, items, showAnswers }: {
  title: string
  color: string
  items: { question: string; answer: string }[]
  showAnswers: boolean
}) {
  return (
    <div className="bg-surface-800 rounded-xl p-4 border border-white/5">
      <p className={clsx('text-sm font-bold mb-3', Q_COLORS[color] ?? 'text-slate-300')}>{title} <span className="text-slate-600 font-normal">({items.length})</span></p>
      <ol className="space-y-3">
        {items.map((q, i) => (
          <li key={i} className="text-sm">
            <p className="text-slate-200">
              <span className="text-slate-500 mr-1.5">{i + 1}.</span>{q.question}
            </p>
            {showAnswers && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-1.5 ml-5 text-[13px] text-emerald-300/90 bg-emerald-500/5 border-l-2 border-emerald-500/40 pl-3 py-1.5 rounded-r leading-relaxed whitespace-pre-wrap"
              >
                <span className="text-emerald-500 font-semibold mr-1">예시답안</span>{q.answer}
              </motion.p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── 인쇄 ──
const PRINT_CSS = `
.sheet h1{font-size:18pt;text-align:center;margin-bottom:4px;}
.sheet .meta{text-align:center;color:#555;font-size:10pt;margin-bottom:14px;}
.sheet h2{font-size:13pt;border-bottom:2px solid #222;padding-bottom:3px;margin:16px 0 8px;}
.sheet .syn{font-size:10.5pt;white-space:pre-wrap;}
.sheet ol{padding-left:20px;}
.sheet li{margin-bottom:8px;font-size:10.5pt;}
.sheet .ans{color:#1a7f4b;font-size:9.5pt;margin-top:3px;padding-left:6px;border-left:2px solid #9bd6b4;}
.sheet .info{display:flex;gap:10px;font-size:10pt;color:#333;margin-bottom:6px;}
`

function buildPrintHtml(w: WorksheetData, showAnswers: boolean): string {
  const qBlock = (items: { question: string; answer: string }[]) =>
    `<ol>${items.map(q => `<li>${escapeHtml(q.question)}${showAnswers ? `<div class="ans">예시답안: ${escapeHtml(q.answer)}</div>` : ''}</li>`).join('')}</ol>`
  return `<div class="sheet">
    <h1>${escapeHtml(w.movieTitle)} — 영화 논술 학습지</h1>
    <div class="meta">제작년도 ${escapeHtml(w.basicInfo.year)} · 네이버 평점 ${escapeHtml(w.basicInfo.naverRating)} · 관람등급 ${escapeHtml(w.basicInfo.ageRating)}</div>
    <h2>감독 · 출연</h2>
    <p>감독: ${escapeHtml(w.directorAndActors.director)}<br/>${w.directorAndActors.actors.map(a => `${escapeHtml(a.name)}(${escapeHtml(a.role)})`).join(', ')}</p>
    <h2>시놉시스</h2>
    <p class="syn">${escapeHtml(w.synopsis)}</p>
    <h2>내용 관련 문제</h2>${qBlock(w.contentQuestions)}
    <h2>심화 논술형 문제</h2>${qBlock(w.essayQuestions)}
    <h2>'나'와 관련된 문제</h2>${qBlock(w.selfReflectionQuestions)}
  </div>`
}
