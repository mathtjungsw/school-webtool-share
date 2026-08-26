import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Clock3, CornerDownLeft, Lightbulb, Search, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import ReferenceMetadataView from './ReferenceMetadata'
import {
  searchWorkAssistant,
  WORK_ASSISTANT_SUGGESTIONS,
  type WorkAssistantResult,
} from '../services/workAssistantSearch'

const RECENT_KEY = 'ungcheon:work-assistant:recent:v1'
const MAX_RECENT = 6

function loadRecentQuestions() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(saved) ? saved.filter(item => typeof item === 'string').slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

export default function WorkAssistantSearch({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (page: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recent, setRecent] = useState<string[]>(loadRecentQuestions)
  const teacherName = useAppStore(state => state.config.teacherName?.trim())
  const results = useMemo(() => searchWorkAssistant(query), [query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (!results.length) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex(index => Math.min(index + 1, results.length - 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex(index => Math.max(index - 1, 0))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, results.length])

  if (!open) return null

  const saveRecent = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const next = [trimmed, ...recent.filter(item => item !== trimmed)].slice(0, MAX_RECENT)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  }

  const openResult = (result: WorkAssistantResult) => {
    saveRecent(query || result.title)
    onClose()
    onNavigate(result.page)
  }

  const chooseQuestion = (value: string) => {
    setQuery(value)
    setSelectedIndex(0)
    inputRef.current?.focus()
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm p-4 sm:p-8 flex items-start justify-center" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label="업무 도우미 검색" className="w-full max-w-4xl max-h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-violet-300 bg-white shadow-2xl flex flex-col text-slate-950">
        <header className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-sky-50">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl grid place-items-center bg-violet-100 text-violet-900 border border-violet-200">
              <Sparkles size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black text-slate-950">업무 도우미 검색</h2>
              <p className="text-xs font-semibold text-slate-700 mt-0.5">하고 싶은 일을 평소 말하듯 입력하세요. 담당 시스템부터 처리 후 확인사항까지 알려드립니다.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 rounded-lg grid place-items-center text-slate-700 hover:text-slate-950 hover:bg-slate-200">
              <X size={17} />
            </button>
          </div>

          <form
            className="mt-4 relative"
            onSubmit={event => {
              event.preventDefault()
              if (results[selectedIndex]) openResult(results[selectedIndex])
            }}
          >
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-violet-800" />
            <input
              ref={inputRef}
              value={query}
              onChange={event => { setQuery(event.target.value); setSelectedIndex(0) }}
              placeholder="예: 내 수업 출석부 출력하고 싶어"
              className="w-full h-12 rounded-xl border border-violet-300 bg-white pl-11 pr-24 text-sm font-semibold text-slate-950 placeholder:text-slate-500 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 text-[10px] text-slate-500">
              <CornerDownLeft size={11} /> 바로가기
            </span>
          </form>
        </header>

        <div className="overflow-y-auto p-5">
          {!query.trim() ? (
            <div className="space-y-5">
              <section>
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-2.5"><Lightbulb size={14} className="text-amber-700" />이렇게 물어보세요</h3>
                <div className="flex flex-wrap gap-2">
                  {WORK_ASSISTANT_SUGGESTIONS.filter(suggestion => !recent.includes(suggestion)).map(suggestion => (
                    <button key={suggestion} type="button" onClick={() => chooseQuestion(suggestion)} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:text-slate-950 hover:border-violet-400 hover:bg-violet-50 transition-colors">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </section>

              {recent.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5"><Clock3 size={14} className="text-sky-700" />최근 질문</h3>
                    <button type="button" onClick={() => { setRecent([]); localStorage.removeItem(RECENT_KEY) }} className="text-[10px] font-semibold text-slate-600 hover:text-slate-950">모두 지우기</button>
                  </div>
                  <div className="space-y-1">
                    {recent.map(item => (
                      <button key={item} type="button" onClick={() => chooseQuestion(item)} className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100">
                        <span className="truncate">{item}</span><ArrowRight size={12} className="flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500">관련 기능 {results.length}개 · ↑↓로 선택하고 Enter를 누르면 바로 이동합니다.</p>
              {results.map((result, index) => (
                <article
                  key={result.id}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`rounded-xl border p-4 transition-colors ${selectedIndex === index ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black text-violet-900 bg-violet-100 rounded px-1.5 py-0.5">{result.category}</span>
                        <h3 className="text-sm font-black text-slate-950">{result.title}</h3>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-700">{result.summary}</p>
                      {result.teacherContext && (
                        <p className="mt-2 text-[11px] font-semibold text-sky-900">
                          {teacherName ? `현재 설정된 교사: ${teacherName}` : '교사 이름이 아직 없습니다. 환경설정에서 이름을 먼저 등록하세요.'}
                        </p>
                      )}
                      {selectedIndex === index && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <h4 className="text-[11px] font-black text-violet-900">업무 경로 안내</h4>
                        <dl className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                          <div><dt className="font-black text-slate-950">담당 시스템</dt><dd className="font-semibold text-slate-700">{result.system || '웅천고 업무도우미'}</dd></div>
                          <div><dt className="font-black text-slate-950">담당 역할 또는 부서</dt><dd className="font-semibold text-slate-700">{result.roleOrDepartment || `${result.category} 관련 업무 담당자`}</dd></div>
                          <div><dt className="font-black text-slate-950">메뉴 경로</dt><dd className="font-semibold text-slate-700">{result.menuPath || `왼쪽 메뉴 > ${result.title}`}</dd></div>
                          <div><dt className="font-black text-slate-950">준비자료</dt><dd className="font-semibold text-slate-700">{(result.preparations || ['해당 업무에 필요한 원본 또는 입력자료']).join(' · ')}</dd></div>
                        </dl>
                        <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[10px] font-black text-sky-950">도교육청 예시이며, 실제 담당은 학교 업무분장표에 따릅니다.</p>
                        <h4 className="mt-3 text-[11px] font-black text-slate-950">처리 순서</h4>
                        <ol className="mt-1.5 grid gap-1.5">
                          {result.steps.map((step, stepIndex) => <li key={step} className="flex gap-2 text-[11px] font-semibold leading-relaxed text-slate-700"><span className="grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-violet-100 text-[9px] font-black text-violet-900">{stepIndex + 1}</span>{step}</li>)}
                        </ol>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg bg-emerald-50 p-2"><b className="text-[10px] text-emerald-950">처리 후 확인사항</b><p className="mt-1 text-[10px] font-semibold text-slate-700">{(result.afterChecks || ['저장·출력 결과와 화면 안내를 다시 확인합니다.']).join(' · ')}</p></div>
                          <div className="rounded-lg bg-amber-50 p-2"><b className="text-[10px] text-amber-950">자주 발생하는 실수</b><p className="mt-1 text-[10px] font-semibold text-slate-700">{(result.commonMistakes || ['필수 항목을 입력하지 않고 다음 단계로 이동하는 경우']).join(' · ')}</p></div>
                        </div>
                        <ReferenceMetadataView compact metadata={result.reference || { standardDate: '앱 현재 버전 기준', source: '웅천고 업무도우미 기능 안내', verifiedAt: '2026-08-26' }} />
                      </div>}
                    </div>
                    <button type="button" onClick={() => openResult(result)} className="flex-shrink-0 px-3 py-2 rounded-lg bg-violet-700 text-white hover:bg-violet-800 text-xs font-bold flex items-center gap-1.5">
                      바로가기 <ArrowRight size={13} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center">
              <Search size={27} className="mx-auto text-slate-600" />
              <h3 className="mt-3 text-sm font-black text-slate-950">알맞은 기능을 찾지 못했습니다</h3>
              <p className="mt-1 text-xs text-slate-500">기능 이름이나 하고 싶은 일을 조금 더 짧게 입력해 보세요.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" onClick={() => { onClose(); onNavigate('help') }} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 hover:bg-slate-100">사용 매뉴얼</button>
                <button type="button" onClick={() => { saveRecent(query); onClose(); onNavigate('feature_requests') }} className="px-3 py-2 rounded-lg bg-violet-700 text-xs font-bold text-white hover:bg-violet-800">기능개선 요청</button>
              </div>
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-slate-600">
          <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-emerald-400" />외부 AI·API를 사용하지 않으며 질문은 이 PC 밖으로 전송되지 않습니다.</span>
          <span>메뉴 검색 <kbd className="ml-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-900">Ctrl K</kbd></span>
        </footer>
      </section>
    </div>
  )
}
