import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, BarChart3, Calculator, CheckCircle2, ChevronDown, Download,
  Copy, FileSpreadsheet, FolderOpen, Info, Plus, RotateCcw, Save, ShieldCheck, Trash2, Upload,
} from 'lucide-react'
import clsx from 'clsx'
import ReferenceMetadataView from '../components/ReferenceMetadata'
import { REFERENCE_CATALOG } from '../data/referenceCatalog'
import {
  STORAGE_KEY as SPLIT_STORAGE_KEY, buildGradeCutSummary, calculateGradePreview, columnIndex,
  defaultComponents, defaultGradePreviewState, exportRestoreWorkbook, importRestoreWorkbook,
  normalizeScoreRows, numberValue, parseColumnGradeSheet, readScoreWorkbook, round2,
  uid, validateGradePreviewState,
  type CalculationMode, type GradeComponent, type GradePreviewConfig, type GradePreviewState,
  type GradeResult, type Matrix,
} from '../services/gradePreview'
import {
  DEFAULT_DIFFICULTY_WEIGHTS, DIFFICULTY_CATEGORIES, activeSplitBoundaries,
  defaultSplitScores, distributionCounts, emptySplitScores, optimizeCorrectRates,
  outcomeLabels, solveTargetDistribution, weightedFinalCuts,
  type DifficultyKey, type DifficultyWeights, type OutcomeLabel, type SplitBoundary,
  type SplitPlannerResult, type SplitScores, type TargetDistributionResult,
} from '../services/achievementScenario'

type ResultTab = 'students' | 'grades' | 'achievement'
type SortMode = 'class' | 'score'
type MappingDraft = { startRow: string; classCol: string; noCol: string; nameCol: string; scoreCol: string }

const LEGACY_STORAGE_KEY = 'ungcheon-grade-preview-v1'

const inputClass = 'input h-10 text-xs'
const smallButton = 'btn-secondary !px-3 !py-1.5 !text-xs inline-flex items-center gap-1.5'

function loadState(): GradePreviewState {
  try {
    const saved = JSON.parse(localStorage.getItem(SPLIT_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY) ?? 'null') as GradePreviewState | null
    if (saved?.config && Array.isArray(saved.components)) {
      const defaults = defaultGradePreviewState()
      const includeNonattainment = saved.config.includeNonattainment ?? saved.config.gradeYear === '1'
      return {
        ...saved,
        config: { ...defaults.config, ...saved.config, includeNonattainment, thresholds: { ...defaults.config.thresholds, ...saved.config.thresholds } },
        components: saved.components.map(component => ({
          ...component,
          splitScores: { ...defaultSplitScores(includeNonattainment), ...(component.splitScores ?? {}) },
        })),
        componentCache: saved.componentCache ?? {}, results: saved.results ?? [],
      }
    }
  } catch { /* 손상된 임시 저장은 기본값으로 시작 */ }
  return defaultGradePreviewState()
}

export default function EstimatedSplitScorePage() {
  const [state, setState] = useState<GradePreviewState>(loadState)
  const [tab, setTab] = useState<ResultTab>('students')
  const [toast, setToast] = useState('')
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({})
  const [mappingOpen, setMappingOpen] = useState<Record<string, boolean>>({})
  const [manualText, setManualText] = useState<Record<string, string>>({})
  const [mappingDraft, setMappingDraft] = useState<Record<string, MappingDraft>>({})
  const [pendingMatrices, setPendingMatrices] = useState<Record<string, Matrix[]>>({})
  const [classFilter, setClassFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [achievementFilter, setAchievementFilter] = useState('')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('class')
  const restoreInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(state)), 250)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const splitBoundaries = useMemo(
    () => activeSplitBoundaries(state.config.includeNonattainment, state.config.achievementScale),
    [state.config.includeNonattainment, state.config.achievementScale],
  )
  const preparedState = useMemo<GradePreviewState>(() => state.config.splitMethod === 'estimated'
    ? { ...state, config: { ...state.config, thresholds: weightedFinalCuts(state.components, splitBoundaries) } }
    : state,
  [state, splitBoundaries])
  const errors = useMemo(() => validateGradePreviewState(preparedState), [preparedState])
  const studentKeys = useMemo(() => {
    const keys = new Set<string>()
    state.components.forEach(component => Object.keys(component.scores).forEach(key => keys.add(key)))
    return keys
  }, [state.components])
  const weightTotal = round2(state.components.reduce((sum, component) => sum + (numberValue(component.weight) ?? 0), 0))
  const firstExamComponent = state.components.find(component => component.type === 'exam')
  const secondExamComponent = state.components.filter(component => component.type === 'exam')[1]

  const invalidate = (updater: (current: GradePreviewState) => GradePreviewState) => {
    setState(current => ({ ...updater(current), results: [], calculatedAt: null }))
  }

  const updateConfig = <K extends keyof GradePreviewConfig>(key: K, value: GradePreviewConfig[K]) => {
    invalidate(current => ({ ...current, config: { ...current.config, [key]: value } }))
  }

  const switchMode = (mode: CalculationMode) => {
    setState(current => {
      if (current.config.calculationMode === mode) return current
      const cache = { ...current.componentCache, [current.config.calculationMode]: structuredClone(current.components) }
      const restored = (cache[mode] ? structuredClone(cache[mode]!) : defaultComponents(mode)).map(component => ({
        ...component,
        splitScores: { ...defaultSplitScores(current.config.includeNonattainment), ...(component.splitScores ?? {}) },
      }))
      const components = mode === 'firstExam'
        ? [{ ...restored[0], type: 'exam' as const, weight: 100 }]
        : restored
      return { ...current, config: { ...current.config, calculationMode: mode }, componentCache: cache, components, results: [], calculatedAt: null }
    })
    setPendingMatrices({})
    setToast(mode === 'firstExam' ? '1차 시험 점수만으로 계산하도록 전환했습니다.' : '학기말 합산 계산으로 전환했습니다.')
  }

  const updateComponent = (id: string, patch: Partial<GradeComponent>) => {
    invalidate(current => ({ ...current, components: current.components.map(component => component.id === id ? { ...component, ...patch } : component) }))
  }

  const updateComponentSplit = (id: string, boundary: SplitBoundary, value: number | null) => {
    invalidate(current => ({
      ...current,
      components: current.components.map(component => component.id === id
        ? { ...component, splitScores: { ...component.splitScores, [boundary]: value } }
        : component),
    }))
  }

  const setComponentScores = (id: string, scores: GradeComponent['scores'], maxScore?: number) => {
    invalidate(current => {
      const components = current.components.map(component => component.id === id
        ? { ...component, scores, ...(maxScore !== undefined ? { maxScore } : {}) }
        : component)
      const sourceIndex = components.findIndex(component => component.id === id)
      if (current.config.calculationMode === 'term' && sourceIndex >= 0 && components[sourceIndex].type === 'exam') {
        const examIndexes = components.map((component, index) => component.type === 'exam' ? index : -1).filter(index => index >= 0)
        if (sourceIndex === examIndexes[0] && examIndexes[1] !== undefined && Object.keys(components[examIndexes[1]].scores).length === 0) {
          components[examIndexes[1]] = { ...components[examIndexes[1]], scores: structuredClone(scores) }
        }
      }
      return { ...current, components }
    })
  }

  const copyFirstExamTo = (target: GradeComponent, copyCuts = false) => {
    const firstExam = state.components.find(component => component.type === 'exam' && component.id !== target.id)
    if (!firstExam || !Object.keys(firstExam.scores).length) { setToast('먼저 1차 지필평가 점수를 입력해 주세요.'); return }
    updateComponent(target.id, {
      scores: structuredClone(firstExam.scores),
      ...(copyCuts ? { splitScores: structuredClone(firstExam.splitScores) } : {}),
    })
    setToast(`${target.name}에 1차 지필평가 ${copyCuts ? '점수와 분할점수' : '학생점수'}를 복사했습니다.`)
  }

  const fillExpectedScores = (target: GradeComponent, rawScore = target.maxScore) => {
    const source = state.components.find(component => Object.keys(component.scores).length > 0)
    if (!source) { setToast('학생 명단을 만들 1차 지필평가 점수를 먼저 입력해 주세요.'); return }
    const scores = Object.fromEntries(Object.entries(source.scores).map(([key, entry]) => [key, {
      ...entry, rawScore: Math.max(0, Math.min(target.maxScore, rawScore)), status: '',
    }]))
    updateComponent(target.id, { scores })
    setToast(`${target.name}에 학생별 예상점수 ${rawScore}점을 입력했습니다.`)
  }

  const removeComponent = (component: GradeComponent) => {
    if (Object.keys(component.scores).length && !window.confirm(`${component.name}의 업로드 점수도 함께 삭제됩니다. 계속할까요?`)) return
    invalidate(current => ({ ...current, components: current.components.filter(item => item.id !== component.id) }))
    setPendingMatrices(current => { const next = { ...current }; delete next[component.id]; return next })
  }

  const uploadScores = async (file: File, component: GradeComponent) => {
    try {
      const { matrices, parsed, detectedMax } = await readScoreWorkbook(file)
      setPendingMatrices(current => ({ ...current, [component.id]: matrices }))
      if (!parsed.length) {
        if (detectedMax !== null) updateComponent(component.id, { maxScore: detectedMax })
        setMappingOpen(current => ({ ...current, [component.id]: true }))
        setToast('자동 인식하지 못했습니다. 열 위치를 지정해 주세요.')
        return
      }
      const scores = normalizeScoreRows(parsed)
      setComponentScores(component.id, scores, detectedMax ?? undefined)
      const isFirstExam = state.components.filter(item => item.type === 'exam')[0]?.id === component.id
      setToast(`${file.name}에서 ${Object.keys(scores).length}명의 정보를 읽었습니다.${detectedMax !== null ? ` 만점 ${detectedMax}점을 반영했습니다.` : ''}${isFirstExam && state.config.calculationMode === 'term' ? ' 2차 시험 예상점수에도 동일하게 복사했습니다.' : ''}`)
    } catch (error) {
      console.error(error)
      setToast('엑셀 파일을 읽지 못했습니다. 파일 형식을 확인해 주세요.')
    }
  }

  const applyManual = (component: GradeComponent) => {
    const rows = (manualText[component.id] ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const values = line.split(/[\t,]/).map(value => value.trim())
      return values.length === 3
        ? { classNo: values[0], studentNo: values[1], studentName: '', rawScore: values[2] }
        : { classNo: values[0], studentNo: values[1], studentName: values[2] ?? '', rawScore: values[3] }
    })
    const scores = normalizeScoreRows(rows)
    if (!Object.keys(scores).length) { setToast('읽을 수 있는 점수가 없습니다. 입력 형식을 확인해 주세요.'); return }
    setComponentScores(component.id, scores)
    setToast(`${Object.keys(scores).length}명의 점수를 적용했습니다.`)
  }

  const applyMapping = (component: GradeComponent) => {
    const matrices = pendingMatrices[component.id]
    if (!matrices?.length) { setToast('먼저 엑셀 파일을 선택해 주세요.'); return }
    const draft = mappingDraft[component.id] ?? { startRow: '2', classCol: 'A', noCol: 'B', nameCol: 'C', scoreCol: 'D' }
    const cols = {
      classCol: columnIndex(draft.classCol), noCol: columnIndex(draft.noCol),
      nameCol: columnIndex(draft.nameCol), scoreCol: columnIndex(draft.scoreCol),
    }
    if (cols.classCol < 0 || cols.noCol < 0 || cols.scoreCol < 0) { setToast('반·번호·점수 열 문자를 확인해 주세요.'); return }
    const parsed = parseColumnGradeSheet(matrices[0].rows, { startRow: Math.max(1, Math.trunc(numberValue(draft.startRow) ?? 2)), cols })
    const scores = normalizeScoreRows(parsed)
    if (!Object.keys(scores).length) { setToast('지정한 열에서 점수를 찾지 못했습니다.'); return }
    setComponentScores(component.id, scores)
    setToast(`${Object.keys(scores).length}명의 점수를 읽었습니다.`)
  }

  const calculate = () => {
    if (errors.length) { setToast(errors[0]); return }
    const results = calculateGradePreview(preparedState)
    if (!results.length) { setToast('계산할 학생이 없습니다.'); return }
    setState(current => ({
      ...current,
      config: { ...current.config, thresholds: preparedState.config.thresholds },
      results,
      calculatedAt: new Date().toISOString(),
    }))
    setTab('students')
    requestAnimationFrame(() => document.getElementById('grade-preview-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    setToast(`${results.length}명의 성적을 계산했습니다.`)
  }

  const applyScenarioCuts = (componentId: string, cuts: SplitScores) => {
    setState(current => {
      const components = current.components.map(component => component.id === componentId
        ? { ...component, splitScores: { ...component.splitScores, ...cuts } }
        : component)
      const boundaries = activeSplitBoundaries(current.config.includeNonattainment, current.config.achievementScale)
      const config = { ...current.config, splitMethod: 'estimated' as const, thresholds: weightedFinalCuts(components, boundaries) }
      const prepared = { ...current, components, config, results: [], calculatedAt: null }
      const results = calculateGradePreview(prepared)
      return { ...prepared, results, calculatedAt: results.length ? new Date().toISOString() : null }
    })
    setTab('achievement')
    setToast('추천 분할점수를 적용해 성취도 분포를 다시 계산했습니다.')
  }

  const reset = () => {
    if (!window.confirm('현재 설정과 점수, 계산 결과를 모두 지울까요?')) return
    localStorage.removeItem(SPLIT_STORAGE_KEY)
    setState(defaultGradePreviewState())
    setPendingMatrices({})
    setManualText({})
    setToast('새 작업을 시작했습니다.')
  }

  const restore = async (file: File) => {
    try {
      const restored = await importRestoreWorkbook(file)
      setState(restored)
      setPendingMatrices({})
      setToast(`${file.name}의 설정과 점수를 복원했습니다.`)
    } catch (error) {
      console.error(error)
      setToast('복원용 정리 엑셀 형식이 아닙니다.')
    }
  }

  return (
    <div className="max-w-[1500px] mx-auto p-6 pb-20 space-y-5">
      <header className="card relative overflow-hidden !p-6">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-amber-400" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <p className="text-[10px] font-bold tracking-[.2em] text-amber-400 mb-2">ESTIMATED SPLIT SCORE LAB</p>
            <h1 className="page-title flex items-center gap-3"><Calculator className="text-amber-400" size={25} />추정분할점수 도우미</h1>
            <p className="page-subtitle">추정분할점수를 구성하고 성취도 분포를 예측하며, 원하는 분포에 맞는 분할점수와 정답률을 역산합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(state)); setToast('현재 작업을 이 PC에 저장했습니다.') }} className={smallButton}><Save size={13} />임시 저장</button>
            <button onClick={reset} className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs font-semibold inline-flex items-center gap-1.5"><RotateCcw size={13} />처음부터</button>
          </div>
        </div>
        <div className="mt-5 grid md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex gap-3">
            <ShieldCheck className="text-emerald-400 shrink-0" size={19} />
            <div><p className="text-xs font-bold text-emerald-300">점수는 이 PC 안에서만 처리됩니다.</p><p className="text-[11px] text-slate-400 mt-0.5">업로드 파일과 계산 데이터는 학교 공유 서버로 전송되지 않습니다.</p></div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex gap-3">
            <AlertTriangle className="text-amber-400 shrink-0" size={19} />
            <div><p className="text-xs font-bold text-amber-300">공식 성적 처리 프로그램이 아닌 미리보기입니다.</p><p className="text-[11px] text-slate-400 mt-0.5">최종 산출 전 학교 학업성적관리규정을 반드시 확인하세요.</p></div>
          </div>
        </div>
      </header>
      <ReferenceMetadataView metadata={REFERENCE_CATALOG.estimatedSplitScore} />

      <StepCard number="01" title="시험 전 1차 추정분할점수 설계" description="희망 분할점수를 만들기 위한 난이도별 예상 정답률을 역산합니다.">
        <SplitPlannerPanel
          storageId="first-exam"
          boundaries={splitBoundaries.length ? splitBoundaries : ['A', 'B', 'C', 'D']}
          initialTargets={firstExamComponent?.splitScores ?? defaultSplitScores(state.config.includeNonattainment)}
          applyLabel="1차 시험 분할점수에 적용"
          onApply={cuts => {
            if (!firstExamComponent) return
            invalidate(current => ({
              ...current,
              config: { ...current.config, splitMethod: 'estimated' },
              components: current.components.map(component => component.id === firstExamComponent.id
                ? { ...component, splitScores: { ...component.splitScores, ...cuts } }
                : component),
            }))
            setToast('1차 시험 설계 결과를 평가 구성에 반영했습니다.')
          }}
        />
      </StepCard>

      <StepCard number="02" title="학년 및 산출 방식" description="석차등급, 성취도, 결시 처리 기준을 정합니다.">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Field label="계산 버전"><select className={inputClass} value={state.config.calculationMode} onChange={event => switchMode(event.target.value as CalculationMode)}><option value="term">학기말 버전</option><option value="firstExam">1차 시험 버전</option></select></Field>
          <Field label="학년"><select className={inputClass} value={state.config.gradeYear} onChange={event => { const gradeYear = event.target.value as GradePreviewConfig['gradeYear']; invalidate(current => ({ ...current, config: { ...current.config, gradeYear, gradeSystem: gradeYear === '3' ? '9' : '5', includeNonattainment: gradeYear === '1' } })) }}><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select></Field>
          <Field label="석차등급 방식"><select className={inputClass} value={state.config.gradeSystem} onChange={event => updateConfig('gradeSystem', event.target.value as GradePreviewConfig['gradeSystem'])}><option value="5">5등급제</option><option value="9">9등급제</option><option value="none">석차등급 미산출</option></select></Field>
          <Field label="성취도 유형"><select className={inputClass} value={state.config.achievementScale} onChange={event => updateConfig('achievementScale', event.target.value as GradePreviewConfig['achievementScale'])}><option value="ABCDE">A-B-C-D-E</option><option value="ABC">A-B-C</option><option value="none">P 또는 미산출</option></select></Field>
          {state.config.achievementScale === 'ABCDE' && <Field label="성취수준 방식"><select className={inputClass} value={state.config.includeNonattainment ? 'include' : 'exclude'} onChange={event => updateConfig('includeNonattainment', event.target.value === 'include')}><option value="include">5수준(A-E)+미도달</option><option value="exclude">5수준(A-E)</option></select></Field>}
          <Field label="결시·미입력 처리"><select className={inputClass} value={state.config.missingPolicy} onChange={event => updateConfig('missingPolicy', event.target.value as GradePreviewConfig['missingPolicy'])}><option value="zero">빈 점수를 0점 처리</option><option value="exclude">해당 학생 계산 제외</option></select></Field>
          <Field label="분할 방식"><select className={inputClass} value={state.config.splitMethod} onChange={event => updateConfig('splitMethod', event.target.value as GradePreviewConfig['splitMethod'])}><option value="fixed">고정분할</option><option value="estimated">추정분할</option></select></Field>
          {state.config.splitMethod === 'fixed' && state.config.achievementScale === 'ABCDE' && <Field label="고정분할 기준"><select className={inputClass} value={state.config.fixedBasis} onChange={event => updateConfig('fixedBasis', event.target.value as GradePreviewConfig['fixedBasis'])}><option value="general">일반과목 (60점 미만 E)</option><option value="common">1·2학년 공통과목 (40점 미만 확인)</option></select></Field>}
        </div>
        <div className="mt-4 rounded-xl bg-white/3 border border-white/5 p-3 flex gap-2.5 text-xs text-slate-400"><Info size={16} className="text-sky-400 shrink-0" /><span><strong className="text-slate-200">{state.config.calculationMode === 'firstExam' ? '1차 시험 버전' : '학기말 버전'}</strong> · {state.config.calculationMode === 'firstExam' ? '1차 시험 점수 한 항목을 100% 기준으로 계산합니다.' : '여러 평가 항목의 반영비율을 합산하여 계산합니다.'}</span></div>
        {state.config.splitMethod === 'estimated' && splitBoundaries.length > 0 && <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-slate-400">각 평가의 분할점수를 아래 평가 구성에서 입력하면 최종 분할점수는 반영비율에 따라 자동 계산됩니다. 현재 예상 최종 분할점수: <strong className="text-emerald-300">{splitBoundaries.map(boundary => `${boundary} ${preparedState.config.thresholds[boundary] ?? '-'}점`).join(' · ')}</strong></div>}
        {errors.length > 0 && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{errors.join(' ')}</div>}
      </StepCard>

      <StepCard number="03" title="평가 구성" description="1·2차 지필과 수행평가의 반영비율·만점·분할점수를 입력합니다.">
        <div className="space-y-3">
          {state.components.map((component, index) => (
            <div key={component.id} className="rounded-xl bg-surface-900/60 border border-white/5 p-4">
              <div className="flex items-center gap-2 mb-3"><span className="badge-sky">{component.type === 'exam' ? '정기시험' : '수행평가'}</span><strong className="text-xs text-slate-300">항목 {index + 1}</strong></div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-end">
                <Field label="항목 이름"><input className={inputClass} value={component.name} maxLength={40} onChange={event => updateComponent(component.id, { name: event.target.value })} /></Field>
                <Field label="구분"><select className={inputClass} disabled={state.config.calculationMode === 'firstExam'} value={component.type} onChange={event => updateComponent(component.id, { type: event.target.value as GradeComponent['type'] })}><option value="exam">정기시험</option><option value="performance">수행평가</option></select></Field>
                <Field label="반영비율(%)"><input className={inputClass} disabled={state.config.calculationMode === 'firstExam'} type="number" min="0" max="100" step="0.01" value={component.weight} onChange={event => updateComponent(component.id, { weight: Number(event.target.value) })} /></Field>
                <Field label="만점"><input className={inputClass} type="number" min="0.01" step="0.01" value={component.maxScore} onChange={event => updateComponent(component.id, { maxScore: Number(event.target.value) })} /></Field>
                <button disabled={state.config.calculationMode === 'firstExam' || state.components.length === 1} onClick={() => removeComponent(component)} className="h-10 px-3 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
              {state.config.splitMethod === 'estimated' && splitBoundaries.length > 0 && <div className="mt-4 pt-4 border-t border-white/5"><div className="flex items-center justify-between gap-3 mb-2"><p className="text-xs font-bold text-slate-300">영역별 추정분할점수</p><div className="flex flex-wrap gap-1.5">{component.id === secondExamComponent?.id && <button onClick={() => copyFirstExamTo(component, true)} className={smallButton}><Copy size={12} />1차 점수·분할점수 복사</button>}{component.type === 'performance' && <button onClick={() => fillExpectedScores(component, component.maxScore)} className={smallButton}>전원 만점으로 예상</button>}</div></div><div className="grid grid-cols-2 sm:grid-cols-5 gap-2">{splitBoundaries.map(boundary => <Field key={boundary} label={`${boundary} 기준`}><input className={inputClass} type="number" min="0" max={component.maxScore} step="0.1" value={component.splitScores?.[boundary] ?? ''} onChange={event => updateComponentSplit(component.id, boundary, numberValue(event.target.value))} /></Field>)}</div></div>}
            </div>
          ))}
        </div>
        {state.config.calculationMode !== 'firstExam' && <button onClick={() => invalidate(current => ({ ...current, components: [...current.components, { id: uid(), name: `수행평가${current.components.filter(component => component.type === 'performance').length + 1}`, type: 'performance', weight: 0, maxScore: 100, splitScores: emptySplitScores({ A: 100, B: 90, C: 80, D: 70, E: 60 }), scores: {} }] }))} className={`${smallButton} mt-3`}><Plus size={13} />수행평가 추가</button>}
        <div className="mt-4 rounded-xl bg-white/3 border border-white/5 p-3 flex justify-between text-xs"><span className="text-slate-400">{state.config.calculationMode === 'firstExam' ? '1차 시험 점수만 100% 기준으로 계산합니다.' : '반영비율 합계는 정확히 100%여야 합니다.'}</span><strong className={Math.abs(weightTotal - 100) < .0001 ? 'text-emerald-400' : 'text-rose-400'}>{weightTotal}%</strong></div>
      </StepCard>

      <StepCard number="04" title="점수 엑셀 업로드와 가상점수" description="1차 성적을 올리면 2차 예상점수에 자동 복사되며, 수행평가는 실제 또는 예상점수를 넣습니다.">
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 flex gap-2.5 text-xs text-slate-400 mb-4"><ShieldCheck size={17} className="text-sky-400 shrink-0" /><span>‘반번호’ 행렬형 성적표와 반·번호·점수 열이 있는 목록형 표를 자동 인식합니다. 어려우면 열 위치를 직접 지정할 수 있습니다.</span></div>
        <div className="grid lg:grid-cols-2 gap-4">
          {state.components.map(component => {
            const entries = Object.values(component.scores)
            const absentCount = entries.filter(entry => entry.rawScore === null && entry.status).length
            const draft = mappingDraft[component.id] ?? { startRow: '2', classCol: 'A', noCol: 'B', nameCol: 'C', scoreCol: 'D' }
            return (
              <article key={component.id} className={clsx('rounded-2xl border p-4', entries.length ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-white/10 bg-surface-900/50')}>
                <div className="flex justify-between gap-3"><h3 className="font-bold text-sm text-white">{component.name}</h3><span className="text-[10px] text-slate-500">{entries.length ? `${entries.length}명 입력${absentCount ? ` · 결시 ${absentCount}명` : ''}` : '점수 없음'}</span></div>
                <label className="mt-3 min-h-24 rounded-xl border border-dashed border-white/15 hover:border-amber-400/40 bg-surface-950/60 flex flex-col items-center justify-center cursor-pointer text-center transition-colors">
                  <Upload size={20} className="text-amber-400 mb-1" /><strong className="text-xs text-amber-300">엑셀 파일 선택</strong><span className="text-[10px] text-slate-500">.xlsx 또는 .xls · 자동 형식 인식</span>
                  <input className="hidden" type="file" accept=".xlsx,.xls" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadScores(file, component); event.target.value = '' }} />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setManualOpen(current => ({ ...current, [component.id]: !current[component.id] }))} className={smallButton}>직접 붙여넣기</button>
                  <button disabled={!pendingMatrices[component.id]} onClick={() => setMappingOpen(current => ({ ...current, [component.id]: !current[component.id] }))} className={smallButton}>열 위치 지정</button>
                  {entries.length > 0 && <button onClick={() => { updateComponent(component.id, { scores: {} }); setToast(`${component.name} 점수를 지웠습니다.`) }} className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs">점수 지우기</button>}
                </div>
                {manualOpen[component.id] && <div className="mt-3 pt-3 border-t border-white/5"><Field label="한 줄에 반, 번호, 이름(선택), 점수"><textarea className={`${inputClass} !h-28 resize-y font-mono`} placeholder={'2, 1, 홍길동, 95\n2, 2, 김웅천, 87'} value={manualText[component.id] ?? ''} onChange={event => setManualText(current => ({ ...current, [component.id]: event.target.value }))} /></Field><button onClick={() => applyManual(component)} className="btn-primary !px-3 !py-1.5 !text-xs mt-2">붙여넣은 점수 적용</button></div>}
                {mappingOpen[component.id] && <div className="mt-3 pt-3 border-t border-white/5"><p className="text-[11px] text-slate-500 mb-2">엑셀 열 문자와 데이터 시작 행을 지정하세요.</p><div className="grid grid-cols-2 sm:grid-cols-5 gap-2">{([['startRow', '시작 행'], ['classCol', '반 열'], ['noCol', '번호 열'], ['nameCol', '이름 열'], ['scoreCol', '점수 열']] as const).map(([key, label]) => <Field key={key} label={label}><input className={`${inputClass} !px-2`} value={draft[key]} onChange={event => setMappingDraft(current => ({ ...current, [component.id]: { ...draft, [key]: event.target.value } }))} /></Field>)}</div><button onClick={() => applyMapping(component)} className="btn-primary !px-3 !py-1.5 !text-xs mt-2">지정한 열로 읽기</button></div>}
              </article>
            )
          })}
        </div>
        <div className="sticky bottom-3 z-10 mt-5 rounded-2xl border border-amber-400/25 bg-surface-950/95 backdrop-blur p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl">
          <div><strong className="block text-sm text-white">{errors.length ? errors[0] : studentKeys.size ? `${studentKeys.size}명의 점수를 계산할 준비가 되었습니다.` : '평가 항목별 점수를 입력해 주세요.'}</strong><span className="text-[11px] text-slate-500">계산 전 입력값과 업로드 인원을 검사합니다.</span></div>
          <button disabled={errors.length > 0 || studentKeys.size === 0} onClick={calculate} className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap"><Calculator size={15} />성적 미리 계산하기</button>
        </div>
      </StepCard>

      <StepCard id="grade-preview-results" number="05" title="현재 예상 결과" description="1차 점수와 2차·수행평가 가정값으로 학생별 결과와 성취도 분포를 확인합니다.">
        {!state.results.length ? <EmptyResults /> : <Results state={state} tab={tab} setTab={setTab} filters={{ classFilter, gradeFilter, achievementFilter, query, sortMode }} setters={{ setClassFilter, setGradeFilter, setAchievementFilter, setQuery, setSortMode }} />}
      </StepCard>

      <StepCard number="06" title="희망 분포와 2차 추정분할점수 역산" description="원하는 성취도 인원 비율에 가장 가까운 2차 시험 분할점수와 난이도별 정답률을 계산합니다.">
        {state.config.calculationMode !== 'term'
          ? <EmptyMessage title="학기말 버전에서 사용하는 기능입니다." detail="계산 버전을 학기말 버전으로 바꾸면 2차 시험과 수행평가를 포함한 역산을 할 수 있습니다." />
          : state.config.splitMethod !== 'estimated'
            ? <EmptyMessage title="추정분할 방식을 선택해 주세요." detail="2차 시험 분할점수 역산은 평가별 추정분할점수를 이용합니다." />
          : !state.results.length || !secondExamComponent
            ? <EmptyMessage title="현재 예상 결과를 먼저 계산해 주세요." detail="1차 점수와 2차·수행평가 가정값이 있어야 희망 분포를 역산할 수 있습니다." />
            : <ScenarioTargetPanel
                state={state}
                boundaries={splitBoundaries}
                secondExam={secondExamComponent}
                onApply={cuts => applyScenarioCuts(secondExamComponent.id, cuts)}
              />}
      </StepCard>

      <StepCard number="07" title="저장·복원" description="작업을 이 PC에 저장하거나 다른 PC로 옮길 복원 파일을 만듭니다.">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(state)); setToast('현재 작업을 이 PC에 저장했습니다.') }} className={smallButton}><Save size={13} />이 PC에 임시 저장</button>
          <button onClick={() => { exportRestoreWorkbook(state); setToast('복원용 정리 엑셀을 만들었습니다.') }} className={smallButton}><Download size={13} />복원용 정리 엑셀 저장</button>
          <button onClick={() => restoreInput.current?.click()} className={smallButton}><FolderOpen size={13} />정리 엑셀에서 복원</button>
          <input ref={restoreInput} className="hidden" type="file" accept=".xlsx" onChange={event => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = '' }} />
        </div>
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200/80">복원용 엑셀에는 학생 개인정보와 점수가 포함될 수 있습니다. 공용 PC나 공개 폴더에 보관하지 마세요.</div>
      </StepCard>

      {toast && <div role="status" className="fixed right-6 bottom-6 z-50 max-w-sm rounded-xl bg-slate-950 border border-amber-400/30 px-4 py-3 text-xs text-slate-200 shadow-2xl animate-slide-up">{toast}</div>}
    </div>
  )
}

function SplitPlannerPanel({ storageId, boundaries, initialTargets, applyLabel, onApply }: {
  storageId: string
  boundaries: SplitBoundary[]
  initialTargets: SplitScores
  applyLabel?: string
  onApply?: (cuts: SplitScores) => void
}) {
  const storageKey = `ungcheon-split-planner-${storageId}`
  const [teacherCount, setTeacherCount] = useState(1)
  const [tolerance, setTolerance] = useState(2)
  const [weights, setWeights] = useState<DifficultyWeights>({ ...DEFAULT_DIFFICULTY_WEIGHTS })
  const [targets, setTargets] = useState<SplitScores>({ ...initialTargets })
  const [result, setResult] = useState<SplitPlannerResult | null>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as { teacherCount?: number; tolerance?: number; weights?: DifficultyWeights; targets?: SplitScores } | null
      if (saved) {
        setTeacherCount(saved.teacherCount ?? 1)
        setTolerance(saved.tolerance ?? 2)
        setWeights({ ...DEFAULT_DIFFICULTY_WEIGHTS, ...saved.weights })
        setTargets({ ...initialTargets, ...saved.targets })
      }
    } catch { /* 손상된 설계 저장값은 기본값 사용 */ }
  }, [storageKey])

  useEffect(() => {
    setTargets(current => ({ ...current, ...Object.fromEntries(boundaries.map(boundary => [boundary, initialTargets[boundary]])) }))
    setResult(null)
  }, [boundaries.join('|'), ...boundaries.map(boundary => initialTargets[boundary])])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ teacherCount, tolerance, weights, targets }))
  }, [storageKey, teacherCount, tolerance, weights, targets])

  const total = round2(Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0))
  const mcTotal = round2(weights.mcEasy + weights.mcMedium + weights.mcHard)
  const writtenTotal = round2(weights.writtenEasy + weights.writtenMedium + weights.writtenHard)
  const calculate = () => setResult(optimizeCorrectRates({ teacherCount, tolerance, weights, targets, boundaries }))
  const copyResult = async () => {
    if (!result?.assignments.length) return
    const header = ['교사', '문항 유형·난이도', ...boundaries]
    const rows = result.assignments.flatMap((teacher, teacherIndex) => result.activeCategories.map(category => [
      `교사${teacherIndex + 1}`, category.label, ...boundaries.map(boundary => teacher[category.key][boundary]),
    ]))
    await navigator.clipboard.writeText([header, ...rows].map(row => row.join('\t')).join('\n'))
  }

  return <div className="space-y-4">
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-slate-400 flex gap-2.5"><Info size={16} className="text-sky-400 shrink-0" /><span>배점이 0점인 문항 유형은 계산에서 완전히 제외합니다. 따라서 <strong className="text-slate-200">선택형 합계가 0점이면 선택형 정답률과 ‘선택형 &gt; 서술형’ 제약을 사용하지 않습니다.</strong></span></div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Field label="공동출제 교사 수"><select className={inputClass} value={teacherCount} onChange={event => { setTeacherCount(Number(event.target.value)); setResult(null) }}>{Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}명</option>)}</select></Field>
      <Field label="허용 오차"><select className={inputClass} value={tolerance} onChange={event => { setTolerance(Number(event.target.value)); setResult(null) }}><option value={0}>정확히</option><option value={0.5}>±0.5점</option><option value={1}>±1점</option><option value={2}>±2점</option></select></Field>
      <div className="rounded-xl border border-white/5 bg-surface-900/60 p-3"><span className="text-[10px] font-bold text-slate-500">문항 유형</span><strong className="block text-sm text-white mt-1">선택형 {mcTotal}점 · 서술형 {writtenTotal}점</strong></div>
      <div className={clsx('rounded-xl border p-3', Math.abs(total - 100) < .05 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/25 bg-rose-500/5')}><span className="text-[10px] font-bold text-slate-500">배점 합계</span><strong className={clsx('block text-xl mt-1', Math.abs(total - 100) < .05 ? 'text-emerald-300' : 'text-rose-300')}>{total}점</strong></div>
    </div>
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-white/5 bg-surface-900/50 p-4"><h3 className="text-sm font-bold text-white mb-3">난이도별 배점</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{DIFFICULTY_CATEGORIES.map(category => <Field key={category.key} label={category.label}><input className={inputClass} type="number" min="0" max="100" step="0.1" value={weights[category.key]} onChange={event => { setWeights(current => ({ ...current, [category.key]: Number(event.target.value) })); setResult(null) }} /></Field>)}</div>{mcTotal === 0 && <p className="mt-3 text-[11px] text-emerald-300">선택형 문항 없음: 결과에는 서술형 정답률만 표시됩니다.</p>}{writtenTotal === 0 && <p className="mt-3 text-[11px] text-emerald-300">서술형 문항 없음: 결과에는 선택형 정답률만 표시됩니다.</p>}</div>
      <div className="rounded-xl border border-white/5 bg-surface-900/50 p-4"><h3 className="text-sm font-bold text-white mb-3">희망 추정분할점수</h3><div className="grid grid-cols-2 sm:grid-cols-5 gap-2">{boundaries.map(boundary => <Field key={boundary} label={`${boundary} 기준`}><input className={inputClass} type="number" min="0" max="100" step="0.1" value={targets[boundary] ?? ''} onChange={event => { setTargets(current => ({ ...current, [boundary]: numberValue(event.target.value) })); setResult(null) }} /></Field>)}</div><p className="mt-3 text-[11px] text-slate-500">A부터 내림차순으로 입력하세요. 5수준+미도달 방식에서는 E 기준까지 계산합니다.</p></div>
    </div>
    <div className="flex justify-end"><button onClick={calculate} className="btn-primary inline-flex items-center gap-2"><Calculator size={15} />권장 정답률 계산</button></div>
    {result && <div className={clsx('rounded-2xl border p-4', result.assignments.length ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/25 bg-rose-500/5')}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4"><div><h3 className="text-sm font-bold text-white">난이도별 권장 예상 정답률</h3><p className="text-[11px] text-slate-400 mt-1">{result.message}{Number.isFinite(result.maxError) && ` 최대 오차 ${result.maxError}점.`}</p></div>{result.assignments.length > 0 && <div className="flex gap-2"><button onClick={() => void copyResult()} className={smallButton}><Copy size={12} />엑셀용 복사</button>{onApply && <button onClick={() => onApply(result.computed)} className="btn-primary !px-3 !py-1.5 !text-xs">{applyLabel ?? '분할점수 적용'}</button>}</div>}</div>
      {result.assignments.length > 0 && <><div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">{boundaries.map(boundary => <div key={boundary} className="rounded-lg border border-white/5 bg-surface-950/50 p-2.5"><span className="text-[10px] text-slate-500">{boundary} 계산값</span><strong className="block text-lg text-emerald-300">{result.computed[boundary]}</strong><span className="text-[10px] text-slate-600">목표 {targets[boundary]}</span></div>)}</div><div className="overflow-auto rounded-xl border border-white/10"><table className="w-full whitespace-nowrap text-xs"><thead className="bg-surface-950 text-slate-400"><tr><th className="px-3 py-2">교사</th><th className="px-3 py-2 text-left">유형·난이도</th>{boundaries.map(boundary => <th key={boundary} className="px-3 py-2">{boundary}</th>)}</tr></thead><tbody>{result.assignments.flatMap((teacher, teacherIndex) => result.activeCategories.map(category => <tr key={`${teacherIndex}-${category.key}`} className="border-t border-white/5 text-slate-300"><td className="px-3 py-2 text-center">교사{teacherIndex + 1}</td><td className="px-3 py-2 font-semibold text-white">{category.label}</td>{boundaries.map(boundary => <td key={boundary} className="px-3 py-2 text-center">{teacher[category.key][boundary]}%</td>)}</tr>))}</tbody></table></div></>}
    </div>}
  </div>
}

function ScenarioTargetPanel({ state, boundaries, secondExam, onApply }: {
  state: GradePreviewState
  boundaries: SplitBoundary[]
  secondExam: GradeComponent
  onApply: (cuts: SplitScores) => void
}) {
  const labels = outcomeLabels(boundaries)
  const currentCounts = useMemo(() => distributionCounts(state.results, state.config.thresholds, boundaries), [state.results, state.config.thresholds, boundaries.join('|')])
  const [percentages, setPercentages] = useState<Partial<Record<OutcomeLabel, number>>>(() => Object.fromEntries(labels.map(label => [label, round2((currentCounts[label] ?? 0) / state.results.length * 100)])))
  const [result, setResult] = useState<TargetDistributionResult | null>(null)

  useEffect(() => {
    setPercentages(Object.fromEntries(labels.map(label => [label, round2((currentCounts[label] ?? 0) / state.results.length * 100)])))
    setResult(null)
  }, [labels.join('|'), state.results.length])

  const total = round2(labels.reduce((sum, label) => sum + Number(percentages[label] ?? 0), 0))
  const calculate = () => setResult(solveTargetDistribution(state.results, state.components, secondExam.id, boundaries, percentages))
  return <div className="space-y-4">
    <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-end"><div><h3 className="text-sm font-bold text-white mb-3">희망 성취도 분포</h3><div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">{labels.map(label => <Field key={label} label={`${label} 비율(%)`}><input className={inputClass} type="number" min="0" max="100" step="0.1" value={percentages[label] ?? 0} onChange={event => { setPercentages(current => ({ ...current, [label]: Number(event.target.value) })); setResult(null) }} /></Field>)}</div><p className={clsx('mt-2 text-[11px]', Math.abs(total - 100) < .05 ? 'text-emerald-300' : 'text-rose-300')}>합계 {total}% · 현재 분포를 시작값으로 불러왔습니다.</p></div><button onClick={calculate} className="btn-primary inline-flex items-center justify-center gap-2"><Calculator size={15} />2차 분할점수 역산</button></div>
    {result && <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"><h3 className="text-sm font-bold text-white">2차 시험 권장 추정분할점수</h3><div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">{boundaries.map(boundary => <div key={boundary} className="rounded-lg bg-surface-950/60 border border-white/5 p-3"><span className="text-[10px] text-slate-500">{boundary} 기준</span><strong className="block text-xl text-amber-300">{result.recommendedComponentCuts[boundary] ?? '-'}점</strong><span className="text-[10px] text-slate-600">최종 {result.finalCuts[boundary] ?? '-'}점</span></div>)}</div><div className="overflow-auto rounded-xl border border-white/10 mt-4"><table className="w-full text-xs"><thead className="bg-surface-950 text-slate-400"><tr><th className="px-3 py-2">성취도</th><th className="px-3 py-2">희망 인원</th><th className="px-3 py-2">예상 인원</th></tr></thead><tbody>{labels.map(label => <tr key={label} className="border-t border-white/5 text-slate-300"><td className="px-3 py-2 text-center font-bold">{label}</td><td className="px-3 py-2 text-center">{result.targetCounts[label]}명</td><td className="px-3 py-2 text-center">{result.actualCounts[label]}명</td></tr>)}</tbody></table></div><div className="mt-3 space-y-1">{result.messages.map((message, index) => <p key={index} className={clsx('text-[11px]', result.feasible ? 'text-emerald-300' : 'text-amber-200')}>• {message}</p>)}</div><div className="flex justify-end mt-4"><button onClick={() => onApply(result.recommendedComponentCuts)} className="btn-primary">2차 시험에 적용하고 재계산</button></div></div>}
    {result?.recommendedComponentCuts && <div className="pt-2"><h3 className="text-sm font-bold text-white mb-3">권장 2차 분할점수를 만들기 위한 정답률</h3><SplitPlannerPanel storageId="second-exam" boundaries={boundaries} initialTargets={result.recommendedComponentCuts} /></div>}
  </div>
}

function StepCard({ id, number, title, description, children }: { id?: string; number: string; title: string; description: string; children: React.ReactNode }) {
  return <details id={id} open className="card group !p-0 overflow-hidden"><summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3 select-none"><span className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 grid place-items-center text-xs font-black shrink-0">{number}</span><div className="flex-1"><h2 className="text-base font-bold text-white">{title}</h2><p className="text-[11px] text-slate-500 mt-0.5">{description}</p></div><ChevronDown size={17} className="text-slate-500 group-open:rotate-180 transition-transform" /></summary><div className="border-t border-white/5 px-5 py-5">{children}</div></details>
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={clsx('block min-w-0', className)}><span className="field-label">{label}</span>{children}</label>
}

function EmptyResults() {
  return <div className="rounded-xl border border-dashed border-white/10 bg-surface-900/40 py-12 text-center"><BarChart3 size={28} className="mx-auto text-slate-600 mb-2" /><strong className="block text-sm text-slate-400">아직 계산 결과가 없습니다.</strong><span className="text-xs text-slate-600">평가 구성과 점수를 입력한 뒤 성적 미리 계산하기를 눌러 주세요.</span></div>
}

function Results({ state, tab, setTab, filters, setters }: {
  state: GradePreviewState; tab: ResultTab; setTab: (tab: ResultTab) => void
  filters: { classFilter: string; gradeFilter: string; achievementFilter: string; query: string; sortMode: SortMode }
  setters: { setClassFilter: (value: string) => void; setGradeFilter: (value: string) => void; setAchievementFilter: (value: string) => void; setQuery: (value: string) => void; setSortMode: (value: SortMode) => void }
}) {
  const rows = state.results
  const average = rows.reduce((sum, row) => sum + row.total, 0) / rows.length
  const deviation = Math.sqrt(rows.reduce((sum, row) => sum + (row.total - average) ** 2, 0) / rows.length)
  const metrics = [
    ['수강 인원', `${rows.length}명`], ['평균', round2(average)], ['표준편차', round2(deviation)],
    ['최고점', round2(Math.max(...rows.map(row => row.total)))], ['최저점', round2(Math.min(...rows.map(row => row.total)))],
    [state.config.gradeSystem === 'none' ? '성취도 A' : '1등급', `${rows.filter(row => state.config.gradeSystem === 'none' ? row.achievement === 'A' : row.grade === 1).length}명`],
  ]
  return <>
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-5">{metrics.map(([label, value]) => <div key={label} className="rounded-xl border border-white/5 bg-surface-900/60 p-3"><span className="text-[10px] font-bold text-slate-500">{label}</span><strong className="block text-xl text-white mt-1">{value}</strong></div>)}</div>
    <div className="flex gap-1 border-b border-white/10 mb-4">{([['students', '학생별 결과'], ['grades', '등급 컷'], ['achievement', '성취도 분포']] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={clsx('px-4 py-2.5 text-xs font-bold border-b-2 transition-colors', tab === id ? 'border-amber-400 text-amber-300' : 'border-transparent text-slate-500 hover:text-slate-300')}>{label}</button>)}</div>
    {tab === 'students' && <StudentResults state={state} filters={filters} setters={setters} />}
    {tab === 'grades' && <GradeCuts state={state} />}
    {tab === 'achievement' && <AchievementDistribution state={state} />}
  </>
}

function StudentResults({ state, filters, setters }: {
  state: GradePreviewState
  filters: { classFilter: string; gradeFilter: string; achievementFilter: string; query: string; sortMode: SortMode }
  setters: { setClassFilter: (value: string) => void; setGradeFilter: (value: string) => void; setAchievementFilter: (value: string) => void; setQuery: (value: string) => void; setSortMode: (value: SortMode) => void }
}) {
  const classes = [...new Set(state.results.map(row => row.classNo))].sort((a, b) => a - b)
  const grades = [...new Set(state.results.map(row => row.grade).filter((value): value is number => value !== null))].sort((a, b) => a - b)
  const achievements = [...new Set(state.results.map(row => row.achievement).filter((value): value is string => Boolean(value)))].sort()
  const visible = [...state.results].filter(row =>
    (!filters.classFilter || String(row.classNo) === filters.classFilter) &&
    (!filters.gradeFilter || String(row.grade) === filters.gradeFilter) &&
    (!filters.achievementFilter || row.achievement === filters.achievementFilter) &&
    (!filters.query.trim() || `${row.studentName} ${row.classNo}-${row.studentNo}`.toLowerCase().includes(filters.query.trim().toLowerCase())),
  ).sort(filters.sortMode === 'score' ? (a, b) => b.total - a.total || a.classNo - b.classNo || a.studentNo - b.studentNo : (a, b) => a.classNo - b.classNo || a.studentNo - b.studentNo)
  return <>
    <div className="grid sm:grid-cols-2 xl:grid-cols-[120px_120px_120px_1fr_150px] gap-2 mb-3">
      <select className={inputClass} value={filters.classFilter} onChange={event => setters.setClassFilter(event.target.value)}><option value="">전체 반</option>{classes.map(value => <option key={value}>{value}</option>)}</select>
      <select className={inputClass} value={filters.gradeFilter} onChange={event => setters.setGradeFilter(event.target.value)}><option value="">전체 등급</option>{grades.map(value => <option key={value}>{value}</option>)}</select>
      <select className={inputClass} value={filters.achievementFilter} onChange={event => setters.setAchievementFilter(event.target.value)}><option value="">전체 성취도</option>{achievements.map(value => <option key={value}>{value}</option>)}</select>
      <input className={inputClass} value={filters.query} onChange={event => setters.setQuery(event.target.value)} placeholder="이름 또는 반-번호 검색" />
      <select className={inputClass} value={filters.sortMode} onChange={event => setters.setSortMode(event.target.value as SortMode)}><option value="class">반·번호순</option><option value="score">총점 높은순</option></select>
    </div>
    <ResultTable rows={visible} components={state.components} />
  </>
}

function ResultTable({ rows, components }: { rows: GradeResult[]; components: GradeComponent[] }) {
  return <div className="overflow-auto rounded-xl border border-white/10 max-h-[560px]"><table className="w-full whitespace-nowrap text-[11px]"><thead className="sticky top-0 z-10 bg-surface-950 text-slate-400"><tr>{['반', '번호', '학생명'].map(label => <th key={label} className="px-3 py-2.5 text-center">{label}</th>)}{components.flatMap(component => [<th key={`${component.id}-raw`} className="px-3 py-2.5 text-center">{component.name} 원점수</th>, <th key={`${component.id}-converted`} className="px-3 py-2.5 text-center">{component.name} 환산</th>])}{['총점', '원점수', '석차', '동석차', '중간석차', '중간석차백분율', '등급', '성취도', '비고'].map(label => <th key={label} className="px-3 py-2.5 text-center">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.key} className="border-t border-white/5 hover:bg-white/3 text-slate-300"><td className="px-3 py-2 text-center">{row.classNo}</td><td className="px-3 py-2 text-center">{row.studentNo}</td><td className="px-3 py-2 text-left font-semibold text-white">{row.studentName}</td>{components.flatMap(component => [<td key={`${component.id}-raw`} className="px-3 py-2 text-center">{row.raw[component.id] === null ? <span className="text-slate-600">{row.rawStatus[component.id] || '빈칸'}</span> : round2(row.raw[component.id]!)}</td>, <td key={`${component.id}-converted`} className="px-3 py-2 text-center">{round2(row.converted[component.id])}</td>])}<td className="px-3 py-2 text-center font-bold text-amber-300">{row.total.toFixed(2)}</td><td className="px-3 py-2 text-center">{row.integerScore}</td><td className="px-3 py-2 text-center">{row.rank}</td><td className="px-3 py-2 text-center">{row.tieCount}</td><td className="px-3 py-2 text-center">{round2(row.midRank)}</td><td className="px-3 py-2 text-center">{round2(row.midPct)}%</td><td className="px-3 py-2 text-center">{row.grade ? <span className="badge-sky">{row.grade}</span> : <span className="text-slate-600">미산출</span>}</td><td className="px-3 py-2 text-center">{row.achievement ? <span className="badge-emerald">{row.achievement}</span> : <span className="text-slate-600">미산출</span>}</td><td className="px-3 py-2 text-left text-slate-500">{row.notes.join(', ')}</td></tr>)}</tbody></table></div>
}

function GradeCuts({ state }: { state: GradePreviewState }) {
  if (state.config.gradeSystem === 'none') return <EmptyMessage title="석차등급 미산출 과목입니다." detail="기본 설정에서 5등급제 또는 9등급제를 선택하면 등급 컷을 볼 수 있습니다." />
  const summary = buildGradeCutSummary(state.results, state.config.gradeSystem)
  const previous = [0, ...(state.config.gradeSystem === '5' ? [10, 34, 66, 90, 100] : [4, 11, 23, 40, 60, 77, 89, 96, 100])]
  return <><div className="overflow-auto rounded-xl border border-white/10"><table className="w-full whitespace-nowrap text-xs"><thead className="bg-surface-950 text-slate-400"><tr>{['등급', '누적 비율 구간', '반올림 등급 인원', '실제 인원', '최고 총점', '최저 총점', '동점 경계 처리'].map(label => <th key={label} className="px-3 py-2.5 text-center">{label}</th>)}</tr></thead><tbody>{summary.map((item, index) => <tr key={item.grade} className="border-t border-white/5 text-slate-300"><td className="px-3 py-2 text-center"><span className="badge-sky">{item.grade}</span></td><td className="px-3 py-2 text-center">{previous[index]}% 초과 ~ {item.rate}% 이하</td><td className="px-3 py-2 text-center">{item.expected}명</td><td className="px-3 py-2 text-center">{item.actual}명</td><td className="px-3 py-2 text-center">{item.max === null ? '-' : item.max.toFixed(2)}</td><td className="px-3 py-2 text-center">{item.min === null ? '-' : item.min.toFixed(2)}</td><td className="px-3 py-2 text-center">{item.boundaryTie ? '중간석차백분율 적용' : '-'}</td></tr>)}</tbody></table></div><p className="text-[11px] text-slate-500 mt-3">누적 인원은 수강 인원 × 누적비율을 반올림합니다. 등급 경계를 가로지르는 동점자 그룹은 중간석차백분율로 같은 등급을 부여합니다.</p></>
}

function AchievementDistribution({ state }: { state: GradePreviewState }) {
  const boundaries = activeSplitBoundaries(state.config.includeNonattainment, state.config.achievementScale)
  const labels = outcomeLabels(boundaries)
  if (!labels.length) return <EmptyMessage title="성취도 미산출 과목입니다." detail="기본 설정에서 성취도 유형을 선택하면 분포를 볼 수 있습니다." />
  const thresholdText = state.config.splitMethod === 'estimated'
    ? boundaries.map(key => `${key} ${state.config.thresholds[key]}점 이상`).join(' · ') || '분할점수 미입력'
    : state.config.achievementScale === 'ABC' ? 'A 80점 이상 · B 60점 이상 · C 60점 미만' : 'A 90 · B 80 · C 70 · D 60 · E 60점 미만'
  return <div className="grid lg:grid-cols-2 gap-4"><div className="rounded-xl border border-white/5 bg-surface-900/50 p-4"><h3 className="text-sm font-bold text-white mb-4">성취도별 인원</h3><div className="space-y-3">{labels.map(label => { const count = state.results.filter(row => row.achievement === label).length; const percent = count / state.results.length * 100; return <div key={label} className="grid grid-cols-[28px_1fr_90px] items-center gap-3 text-xs"><strong className="text-emerald-300">{label}</strong><div className="h-2.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full" style={{ width: `${percent}%` }} /></div><span className="text-right text-slate-400">{count}명 · {round2(percent)}%</span></div> })}</div></div><div className="rounded-xl border border-white/5 bg-surface-900/50 p-4"><h3 className="text-sm font-bold text-white mb-3">산출 기준</h3><p className="text-xs text-slate-500">{state.config.splitMethod === 'estimated' ? '추정분할' : '고정분할'} · 원점수(총점 반올림) 기준</p><p className="text-sm text-slate-300 mt-3">{thresholdText}</p></div></div>
}

function EmptyMessage({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 py-10 text-center"><CheckCircle2 size={24} className="mx-auto text-slate-600 mb-2" /><strong className="block text-sm text-slate-400">{title}</strong><span className="text-xs text-slate-600">{detail}</span></div>
}
