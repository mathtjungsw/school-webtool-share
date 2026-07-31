import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, BarChart3, Calculator, CheckCircle2, ChevronDown, Download,
  FileSpreadsheet, FolderOpen, Info, Plus, RotateCcw, Save, ShieldCheck, Trash2, Upload,
} from 'lucide-react'
import clsx from 'clsx'
import {
  STORAGE_KEY, buildGradeCutSummary, calculateGradePreview, columnIndex,
  defaultComponents, defaultGradePreviewState, exportRestoreWorkbook, importRestoreWorkbook,
  normalizeScoreRows, numberValue, parseColumnGradeSheet, readScoreWorkbook, round2,
  uid, validateGradePreviewState,
  type CalculationMode, type GradeComponent, type GradePreviewConfig, type GradePreviewState,
  type GradeResult, type Matrix,
} from '../services/gradePreview'

type ResultTab = 'students' | 'grades' | 'achievement'
type SortMode = 'class' | 'score'
type MappingDraft = { startRow: string; classCol: string; noCol: string; nameCol: string; scoreCol: string }

const inputClass = 'input h-10 text-xs'
const smallButton = 'btn-secondary !px-3 !py-1.5 !text-xs inline-flex items-center gap-1.5'

function loadState(): GradePreviewState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as GradePreviewState | null
    if (saved?.config && Array.isArray(saved.components)) {
      return {
        ...saved,
        config: { ...defaultGradePreviewState().config, ...saved.config, thresholds: { ...defaultGradePreviewState().config.thresholds, ...saved.config.thresholds } },
        componentCache: saved.componentCache ?? {}, results: saved.results ?? [],
      }
    }
  } catch { /* 손상된 임시 저장은 기본값으로 시작 */ }
  return defaultGradePreviewState()
}

export default function GradePreviewPage() {
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
    const timer = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), 250)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const errors = useMemo(() => validateGradePreviewState(state), [state])
  const studentKeys = useMemo(() => {
    const keys = new Set<string>()
    state.components.forEach(component => Object.keys(component.scores).forEach(key => keys.add(key)))
    return keys
  }, [state.components])
  const weightTotal = round2(state.components.reduce((sum, component) => sum + (numberValue(component.weight) ?? 0), 0))

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
      const restored = cache[mode] ? structuredClone(cache[mode]!) : defaultComponents(mode)
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
      updateComponent(component.id, { scores, ...(detectedMax !== null ? { maxScore: detectedMax } : {}) })
      setToast(`${file.name}에서 ${Object.keys(scores).length}명의 정보를 읽었습니다.${detectedMax !== null ? ` 만점 ${detectedMax}점을 반영했습니다.` : ''}`)
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
    updateComponent(component.id, { scores })
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
    updateComponent(component.id, { scores })
    setToast(`${Object.keys(scores).length}명의 점수를 읽었습니다.`)
  }

  const calculate = () => {
    if (errors.length) { setToast(errors[0]); return }
    const results = calculateGradePreview(state)
    if (!results.length) { setToast('계산할 학생이 없습니다.'); return }
    setState(current => ({ ...current, results, calculatedAt: new Date().toISOString() }))
    setTab('students')
    requestAnimationFrame(() => document.getElementById('grade-preview-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    setToast(`${results.length}명의 성적을 계산했습니다.`)
  }

  const reset = () => {
    if (!window.confirm('현재 설정과 점수, 계산 결과를 모두 지울까요?')) return
    localStorage.removeItem(STORAGE_KEY)
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
            <p className="text-[10px] font-bold tracking-[.2em] text-amber-400 mb-2">SCHOOL GRADE PREVIEW</p>
            <h1 className="page-title flex items-center gap-3"><Calculator className="text-amber-400" size={25} />성적 산출 미리 해보기</h1>
            <p className="page-subtitle">정기시험·수행평가 점수로 환산점수, 석차등급과 성취도를 미리 확인합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setToast('현재 작업을 이 PC에 저장했습니다.') }} className={smallButton}><Save size={13} />임시 저장</button>
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

      <StepCard number="01" title="학년 및 산출 방식" description="석차등급, 성취도, 결시 처리 기준을 정합니다.">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Field label="계산 버전"><select className={inputClass} value={state.config.calculationMode} onChange={event => switchMode(event.target.value as CalculationMode)}><option value="term">학기말 버전</option><option value="firstExam">1차 시험 버전</option></select></Field>
          <Field label="학년"><select className={inputClass} value={state.config.gradeYear} onChange={event => { const gradeYear = event.target.value as GradePreviewConfig['gradeYear']; invalidate(current => ({ ...current, config: { ...current.config, gradeYear, gradeSystem: gradeYear === '3' ? '9' : '5' } })) }}><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select></Field>
          <Field label="석차등급 방식"><select className={inputClass} value={state.config.gradeSystem} onChange={event => updateConfig('gradeSystem', event.target.value as GradePreviewConfig['gradeSystem'])}><option value="5">5등급제</option><option value="9">9등급제</option><option value="none">석차등급 미산출</option></select></Field>
          <Field label="성취도 유형"><select className={inputClass} value={state.config.achievementScale} onChange={event => updateConfig('achievementScale', event.target.value as GradePreviewConfig['achievementScale'])}><option value="ABCDE">A-B-C-D-E</option><option value="ABC">A-B-C</option><option value="none">P 또는 미산출</option></select></Field>
          <Field label="결시·미입력 처리"><select className={inputClass} value={state.config.missingPolicy} onChange={event => updateConfig('missingPolicy', event.target.value as GradePreviewConfig['missingPolicy'])}><option value="zero">빈 점수를 0점 처리</option><option value="exclude">해당 학생 계산 제외</option></select></Field>
          <Field label="분할 방식"><select className={inputClass} value={state.config.splitMethod} onChange={event => updateConfig('splitMethod', event.target.value as GradePreviewConfig['splitMethod'])}><option value="fixed">고정분할</option><option value="estimated">추정분할</option></select></Field>
          {state.config.splitMethod === 'fixed' && state.config.achievementScale === 'ABCDE' && <Field label="고정분할 기준"><select className={inputClass} value={state.config.fixedBasis} onChange={event => updateConfig('fixedBasis', event.target.value as GradePreviewConfig['fixedBasis'])}><option value="general">일반과목 (60점 미만 E)</option><option value="common">1·2학년 공통과목 (40점 미만 확인)</option></select></Field>}
        </div>
        <div className="mt-4 rounded-xl bg-white/3 border border-white/5 p-3 flex gap-2.5 text-xs text-slate-400"><Info size={16} className="text-sky-400 shrink-0" /><span><strong className="text-slate-200">{state.config.calculationMode === 'firstExam' ? '1차 시험 버전' : '학기말 버전'}</strong> · {state.config.calculationMode === 'firstExam' ? '1차 시험 점수 한 항목을 100% 기준으로 계산합니다.' : '여러 평가 항목의 반영비율을 합산하여 계산합니다.'}</span></div>
        {state.config.splitMethod === 'estimated' && state.config.achievementScale !== 'none' && (
          <div className="mt-4"><p className="text-xs font-bold text-slate-300 mb-2">추정분할 점수 <span className="font-normal text-slate-500">(선택 입력)</span></p><div className="flex flex-wrap gap-3">{(state.config.achievementScale === 'ABCDE' ? ['A', 'B', 'C', 'D'] : ['A', 'B']).map(key => <Field key={key} label={`${key} 이상 기준`} className="w-32"><input className={inputClass} type="number" min="0" max="100" step="0.01" value={state.config.thresholds[key as keyof typeof state.config.thresholds] ?? ''} onChange={event => invalidate(current => ({ ...current, config: { ...current.config, thresholds: { ...current.config.thresholds, [key]: numberValue(event.target.value) } } }))} /></Field>)}</div><p className="text-[11px] text-slate-500 mt-2">기준을 비우면 성취도는 미산출됩니다. A부터 내림차순으로 모두 입력하세요.</p></div>
        )}
        {errors.length > 0 && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{errors.join(' ')}</div>}
      </StepCard>

      <StepCard number="02" title="평가 구성" description="항목별 이름, 유형, 반영비율과 만점을 입력합니다.">
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
            </div>
          ))}
        </div>
        {state.config.calculationMode !== 'firstExam' && <button onClick={() => invalidate(current => ({ ...current, components: [...current.components, { id: uid(), name: `평가 항목 ${current.components.length + 1}`, type: 'performance', weight: 0, maxScore: 100, scores: {} }] }))} className={`${smallButton} mt-3`}><Plus size={13} />평가 항목 추가</button>}
        <div className="mt-4 rounded-xl bg-white/3 border border-white/5 p-3 flex justify-between text-xs"><span className="text-slate-400">{state.config.calculationMode === 'firstExam' ? '1차 시험 점수만 100% 기준으로 계산합니다.' : '반영비율 합계는 정확히 100%여야 합니다.'}</span><strong className={Math.abs(weightTotal - 100) < .0001 ? 'text-emerald-400' : 'text-rose-400'}>{weightTotal}%</strong></div>
      </StepCard>

      <StepCard number="03" title="점수 엑셀 업로드" description="항목별 엑셀을 올리거나 반·번호·이름·점수를 붙여넣습니다.">
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

      <StepCard id="grade-preview-results" number="04" title="계산 결과" description="학생별 결과, 석차등급 컷과 성취도 분포를 확인합니다.">
        {!state.results.length ? <EmptyResults /> : <Results state={state} tab={tab} setTab={setTab} filters={{ classFilter, gradeFilter, achievementFilter, query, sortMode }} setters={{ setClassFilter, setGradeFilter, setAchievementFilter, setQuery, setSortMode }} />}
      </StepCard>

      <StepCard number="05" title="저장·복원" description="작업을 이 PC에 저장하거나 다른 PC로 옮길 복원 파일을 만듭니다.">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setToast('현재 작업을 이 PC에 저장했습니다.') }} className={smallButton}><Save size={13} />이 PC에 임시 저장</button>
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
  const labels = state.config.achievementScale === 'ABC' ? ['A', 'B', 'C'] : state.config.achievementScale === 'ABCDE' ? ['A', 'B', 'C', 'D', 'E'] : []
  if (!labels.length) return <EmptyMessage title="성취도 미산출 과목입니다." detail="기본 설정에서 성취도 유형을 선택하면 분포를 볼 수 있습니다." />
  const thresholdText = state.config.splitMethod === 'estimated'
    ? Object.entries(state.config.thresholds).filter(([key]) => (state.config.achievementScale === 'ABCDE' ? ['A', 'B', 'C', 'D'] : ['A', 'B']).includes(key)).map(([key, value]) => `${key} ${value}점 이상`).join(' · ') || '분할점수 미입력'
    : state.config.achievementScale === 'ABC' ? 'A 80점 이상 · B 60점 이상 · C 60점 미만' : 'A 90 · B 80 · C 70 · D 60 · E 60점 미만'
  return <div className="grid lg:grid-cols-2 gap-4"><div className="rounded-xl border border-white/5 bg-surface-900/50 p-4"><h3 className="text-sm font-bold text-white mb-4">성취도별 인원</h3><div className="space-y-3">{labels.map(label => { const count = state.results.filter(row => row.achievement === label).length; const percent = count / state.results.length * 100; return <div key={label} className="grid grid-cols-[28px_1fr_90px] items-center gap-3 text-xs"><strong className="text-emerald-300">{label}</strong><div className="h-2.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full" style={{ width: `${percent}%` }} /></div><span className="text-right text-slate-400">{count}명 · {round2(percent)}%</span></div> })}</div></div><div className="rounded-xl border border-white/5 bg-surface-900/50 p-4"><h3 className="text-sm font-bold text-white mb-3">산출 기준</h3><p className="text-xs text-slate-500">{state.config.splitMethod === 'estimated' ? '추정분할' : '고정분할'} · 원점수(총점 반올림) 기준</p><p className="text-sm text-slate-300 mt-3">{thresholdText}</p></div></div>
}

function EmptyMessage({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 py-10 text-center"><CheckCircle2 size={24} className="mx-auto text-slate-600 mb-2" /><strong className="block text-sm text-slate-400">{title}</strong><span className="text-xs text-slate-600">{detail}</span></div>
}
