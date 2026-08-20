import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Building2, Check, ExternalLink, FileSearch,
  Filter, Loader2, Play, RefreshCw, Search, ShieldCheck, StopCircle, Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import {
  UNGCHEON_CURRICULUM_SOURCE,
  getUngcheonSubjects,
  type UngcheonCurriculumSubject,
} from '../data/ungcheonCurriculumSubjects'
import { SCHOOL_INFO_REGIONS, SCHOOL_INFO_SIDOS } from '../data/schoolInfoRegions'
import {
  SCHOOL_INFO_SEARCH_PERIODS,
  SCHOOL_INFO_SEARCH_RANGE_LABEL,
  SCHOOL_INFO_SEARCH_RANGE_SHORT_LABEL,
} from '../data/schoolInfoSearchPeriods'
import {
  cleanEvaluationPlanText,
  clearSchoolInfoCache,
  getSchoolInfoEvaluationPlan,
  searchSchoolInfoSchools,
  searchSchoolInfoSchoolsByRegion,
  type SchoolInfoEvaluationResponse,
  type SchoolInfoSchool,
} from '../services/schoolInfo'
import { sampleSchoolInfoCandidates } from '../services/schoolInfoCandidates'

type ResultState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; data: SchoolInfoEvaluationResponse }

interface SearchProgress {
  completed: number
  total: number
  confirmedSchools: number
  confirmedRecords: number
  currentLabel: string
  startedAt: number
}

const ALL_SGG = '전체 시·군·구'

const schoolKey = (school: SchoolInfoSchool) => school.schoolCode || school.shlIdfCd
const periodKey = (school: SchoolInfoSchool, year: number, semester: 1 | 2) => `${schoolKey(school)}:${year}:${semester}`

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function uniqueSchools(schools: SchoolInfoSchool[]) {
  const map = new Map<string, SchoolInfoSchool>()
  schools.forEach((school) => map.set(schoolKey(school), school))
  return [...map.values()]
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>, shouldContinue: () => boolean = () => true) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length && shouldContinue()) {
      const index = cursor
      cursor += 1
      await worker(items[index])
    }
  })
  await Promise.all(runners)
}

function HighlightedPlan({ text, subject }: { text: string; subject: string }) {
  const cleaned = cleanEvaluationPlanText(text)
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = escaped ? cleaned.split(new RegExp(`(${escaped})`, 'gi')) : [cleaned]
  return (
    <pre className="schoolinfo-plan-text whitespace-pre-wrap break-words font-sans text-[12px] font-semibold leading-6">
      {parts.map((part, index) => part.localeCompare(subject, 'ko', { sensitivity: 'base' }) === 0
        ? <mark key={`${part}-${index}`} className="rounded bg-amber-300 px-0.5 font-black text-slate-950">{part}</mark>
        : <span key={`${part}-${index}`}>{part}</span>)}
    </pre>
  )
}

export default function SchoolInfoEvaluationTab() {
  const [grade, setGrade] = useState<1 | 2 | 3>(2)
  const subjects = useMemo(() => getUngcheonSubjects(grade, 2), [grade])
  const [subjectName, setSubjectName] = useState('')
  const selectedSubject = subjects.find((subject) => subject.name === subjectName) ?? subjects[0]

  const [schoolQuery, setSchoolQuery] = useState('')
  const [schoolSearchBusy, setSchoolSearchBusy] = useState(false)
  const [schoolSearchError, setSchoolSearchError] = useState('')
  const [recommendationPool, setRecommendationPool] = useState<SchoolInfoSchool[]>([])
  const [candidateMode, setCandidateMode] = useState<'region' | 'search'>('region')
  const [recommendationBusy, setRecommendationBusy] = useState(false)
  const [sido, setSido] = useState('경상남도')
  const [sgg, setSgg] = useState('창원시 진해구')
  const [foundation, setFoundation] = useState('전체')
  const [selectedSchools, setSelectedSchools] = useState<SchoolInfoSchool[]>([])
  const [matchedSchools, setMatchedSchools] = useState<SchoolInfoSchool[]>([])
  const [candidateShuffleSeed, setCandidateShuffleSeed] = useState(() => Date.now())

  const [results, setResults] = useState<Record<string, ResultState>>({})
  const [evaluationBusy, setEvaluationBusy] = useState(false)
  const [searchProgress, setSearchProgress] = useState<SearchProgress>({ completed: 0, total: 0, confirmedSchools: 0, confirmedRecords: 0, currentLabel: '', startedAt: 0 })
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [previewKey, setPreviewKey] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [cacheMessage, setCacheMessage] = useState('')
  const [searchStopped, setSearchStopped] = useState(false)
  const searchRunRef = useRef(0)
  const searchOutcomesRef = useRef<Record<string, ResultState>>({})
  const searchSuccessfulRef = useRef<string[]>([])

  useEffect(() => {
    if (!subjects.some((subject) => subject.name === subjectName)) setSubjectName(subjects[0]?.name ?? '')
  }, [subjectName, subjects])

  const candidateSchools = useMemo(() => {
    const filtered = recommendationPool.filter((school) => {
      if (candidateMode === 'region' && sido && school.sido !== sido) return false
      if (candidateMode === 'region' && sgg !== ALL_SGG && school.sgg !== sgg) return false
      if (foundation !== '전체' && school.foundation !== foundation) return false
      return true
    })
    if (candidateMode !== 'region') return filtered.slice(0, 12)
    return sampleSchoolInfoCandidates(filtered, candidateShuffleSeed)
  }, [candidateMode, candidateShuffleSeed, foundation, recommendationPool, sgg, sido])

  const loadRecommendations = async (force = false) => {
    const regions = sgg === ALL_SGG ? (SCHOOL_INFO_REGIONS[sido] ?? []) : [sgg]
    setRecommendationBusy(true)
    setSchoolSearchError('')
    try {
      const schools: SchoolInfoSchool[] = []
      let failedRegions = 0
      await runWithConcurrency(regions, 5, async (region) => {
        try {
          const response = await searchSchoolInfoSchoolsByRegion(sido, region, force)
          schools.push(...response.schools)
        } catch {
          failedRegions += 1
        }
      })
      if (!schools.length && failedRegions) throw new Error('선택한 지역의 학교 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setRecommendationPool(uniqueSchools(schools))
      setCandidateShuffleSeed(Date.now())
      setCandidateMode('region')
      setMatchedSchools([])
      setSelectedSchools([])
      if (!schools.length) setSchoolSearchError('선택한 지역에서 고등학교를 불러오지 못했습니다. 학교 이름을 직접 검색해 주세요.')
    } catch (error) {
      setSchoolSearchError(errorMessage(error))
    } finally {
      setRecommendationBusy(false)
    }
  }

  useEffect(() => { void loadRecommendations(false) }, [])

  useEffect(() => {
    if (!evaluationBusy || !searchProgress.startedAt) return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - searchProgress.startedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [evaluationBusy, searchProgress.startedAt])

  const doSchoolSearch = async (force = false) => {
    if (schoolQuery.trim().length < 2) {
      setSchoolSearchError('학교 이름을 두 글자 이상 입력해 주세요.')
      return
    }
    setSchoolSearchBusy(true)
    setSchoolSearchError('')
    try {
      const response = await searchSchoolInfoSchools(schoolQuery.trim(), force)
      setRecommendationPool(response.schools)
      setCandidateMode('search')
      setMatchedSchools([])
      setSelectedSchools([])
      if (!response.schools.length) setSchoolSearchError('검색된 고등학교가 없습니다. 학교 이름을 다시 확인해 주세요.')
    } catch (error) {
      setSchoolSearchError(errorMessage(error))
    } finally {
      setSchoolSearchBusy(false)
    }
  }

  const toggleSchool = (school: SchoolInfoSchool) => {
    const key = schoolKey(school)
    setSelectedSchools((current) => {
      if (current.some((item) => schoolKey(item) === key)) return current.filter((item) => schoolKey(item) !== key)
      if (current.length >= 4) {
        window.alert('한 번에 최대 4개 학교까지 조회할 수 있습니다.')
        return current
      }
      return [...current, school]
    })
  }

  const findSchoolsWithEvaluation = async (force = false) => {
    if (!selectedSubject || !candidateSchools.length) return
    const tasks = candidateSchools.flatMap((school) => SCHOOL_INFO_SEARCH_PERIODS.map(({ year, semester }) => ({ school, year, semester })))
    const runId = searchRunRef.current + 1
    searchRunRef.current = runId
    setEvaluationBusy(true)
    setSearchStopped(false)
    setExpanded(false)
    const startedAt = Date.now()
    setElapsedSeconds(0)
    setSearchProgress({ completed: 0, total: tasks.length, confirmedSchools: 0, confirmedRecords: 0, currentLabel: '검사 순서를 준비하고 있습니다.', startedAt })
    const loading = Object.fromEntries(tasks.map(({ school, year, semester }) => [periodKey(school, year, semester), { status: 'loading' } satisfies ResultState]))
    setResults(loading)
    const successful: string[] = []
    const outcomes: Record<string, ResultState> = { ...loading }
    searchOutcomesRef.current = outcomes
    searchSuccessfulRef.current = successful
    const confirmedSchoolKeys = new Set<string>()
    await runWithConcurrency(tasks, 3, async ({ school, year, semester }) => {
      if (searchRunRef.current !== runId) return
      const key = periodKey(school, year, semester)
      setSearchProgress((current) => ({ ...current, currentLabel: `${school.name} · ${year}학년도 ${semester}학기 확인 중` }))
      try {
        const data = await getSchoolInfoEvaluationPlan({ school, year, semester, grade, subject: selectedSubject.name, force })
        if (searchRunRef.current !== runId) return
        outcomes[key] = { status: 'done', data }
        setResults((current) => ({ ...current, [key]: outcomes[key] }))
        if (data.matchStatus === 'exact') {
          successful.push(key)
          confirmedSchoolKeys.add(schoolKey(school))
        }
      } catch (error) {
        if (searchRunRef.current !== runId) return
        outcomes[key] = { status: 'error', message: errorMessage(error) }
        setResults((current) => ({ ...current, [key]: outcomes[key] }))
      } finally {
        if (searchRunRef.current !== runId) return
        setSearchProgress((current) => ({
          ...current,
          completed: Math.min(current.total, current.completed + 1),
          confirmedSchools: confirmedSchoolKeys.size,
          confirmedRecords: successful.length,
        }))
      }
    }, () => searchRunRef.current === runId)
    if (searchRunRef.current !== runId) return
    const found = candidateSchools.filter((school) => SCHOOL_INFO_SEARCH_PERIODS.some(({ year, semester }) => {
      const state = outcomes[periodKey(school, year, semester)]
      return state?.status === 'done' && state.data.matchStatus === 'exact'
    }))
    setMatchedSchools(found)
    setSelectedSchools(found.slice(0, 1))
    setPreviewKey(successful[0] ?? '')
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    setEvaluationBusy(false)
  }

  const stopEvaluationSearch = () => {
    if (!evaluationBusy) return
    searchRunRef.current += 1
    const completedOutcomes = Object.fromEntries(Object.entries(searchOutcomesRef.current).filter(([, state]) => state.status !== 'loading'))
    const successful = searchSuccessfulRef.current
    const found = candidateSchools.filter((school) => SCHOOL_INFO_SEARCH_PERIODS.some(({ year, semester }) => {
      const state = completedOutcomes[periodKey(school, year, semester)]
      return state?.status === 'done' && state.data.matchStatus === 'exact'
    }))
    setResults(completedOutcomes)
    setMatchedSchools(found)
    setSelectedSchools(found.slice(0, 1))
    setPreviewKey(successful[0] ?? '')
    setEvaluationBusy(false)
    setSearchStopped(true)
    setSearchProgress((current) => ({ ...current, currentLabel: '사용자가 검색을 중지했습니다.' }))
  }

  const previewState = previewKey ? results[previewKey] : undefined
  const totalDone = Object.values(results).filter((state) => state.status === 'done' && state.data.matchStatus === 'exact').length

  return (
    <section className="space-y-4">
      <div className="schoolinfo-privacy rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
        <p className="flex items-center gap-2 text-sm font-black"><ShieldCheck size={17} />학생·교직원 개인정보는 전송하지 않습니다.</p>
        <p className="mt-1 text-xs font-semibold">학교명·학년도·학기·학년·과목명만 공개 평가계획 조회에 사용합니다. 결과는 학교알리미 공개 자료이며 최근 조회 내용은 이 PC에만 캐시됩니다.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-black">1. 웅천고 2학기 정식 과목 선택</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{UNGCHEON_CURRICULUM_SOURCE.title}</p></div>
            <span className="rounded-lg border border-amber-300/30 bg-amber-400/15 px-2 py-1 text-[10px] font-black text-amber-700 dark:text-amber-200">2학기 고정</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label><span className="mb-1 block text-[10px] font-black">학년·교육과정</span><select value={grade} onChange={(event) => setGrade(Number(event.target.value) as 1 | 2 | 3)}>{[1, 2, 3].map((value) => <option key={value} value={value}>{value}학년 · {value <= 2 ? '2022 개정' : '2015 개정'}</option>)}</select></label>
            <label><span className="mb-1 block text-[10px] font-black">2학기 과목</span><select value={selectedSubject?.name ?? ''} onChange={(event) => setSubjectName(event.target.value)}>{subjects.map((subject) => <option key={`${subject.selectionGroup}-${subject.name}`} value={subject.name}>{subject.name}</option>)}</select></label>
          </div>
          {selectedSubject && <SubjectSummary subject={selectedSubject} />}
          <p className="mt-3 rounded-xl bg-sky-500/10 px-3 py-2 text-[10px] font-bold text-sky-800 dark:text-sky-200">타학교 자료는 {SCHOOL_INFO_SEARCH_RANGE_LABEL}, 총 3개 학기만 조회합니다.</p>
        </div>

        <div className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-black">2. 비교할 고등학교 선택</p><p className="mt-1 text-[11px] font-semibold text-slate-500">학교 검색 또는 지역·설립 조건 추천에서 최대 4곳을 고르세요.</p></div><button type="button" onClick={async () => { await clearSchoolInfoCache(); setCacheMessage('이 PC의 평가계획 캐시를 비웠습니다.'); setTimeout(() => setCacheMessage(''), 2500) }} className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold"><Trash2 size={12} />조회 캐시 비우기</button></div>
          <div className="mt-3 flex gap-2"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={schoolQuery} onChange={(event) => setSchoolQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void doSchoolSearch(false) }} className="!pl-9" placeholder="예: 진해고등학교, 김해고" /></div><button type="button" onClick={() => void doSchoolSearch(false)} disabled={schoolSearchBusy} className="btn-primary min-w-20 justify-center">{schoolSearchBusy ? <Loader2 size={14} className="animate-spin" /> : '검색'}</button></div>

          <div className="mt-3 rounded-xl border border-white/10 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black"><Filter size={13} />과목 보유 학교를 찾을 지역·설립 조건</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <select value={sido} onChange={(event) => { setSido(event.target.value); setSgg(ALL_SGG); setRecommendationPool([]); setMatchedSchools([]); setSelectedSchools([]) }}>{SCHOOL_INFO_SIDOS.map((region) => <option key={region} value={region}>{region}</option>)}</select>
              <select value={sgg} onChange={(event) => { setSgg(event.target.value); setRecommendationPool([]); setMatchedSchools([]); setSelectedSchools([]) }}><option value={ALL_SGG}>{sido} 전체 시·군·구</option>{(SCHOOL_INFO_REGIONS[sido] ?? []).map((region) => <option key={region} value={region}>{region}</option>)}</select>
              <select value={foundation} onChange={(event) => setFoundation(event.target.value)}><option>전체</option><option>공립</option><option>사립</option></select>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" onClick={() => void loadRecommendations(false)} disabled={recommendationBusy} className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs font-bold">{recommendationBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}지역 후보 불러오기</button><button type="button" onClick={() => { setCandidateShuffleSeed(Date.now()); setMatchedSchools([]); setSelectedSchools([]) }} disabled={recommendationBusy || candidateMode !== 'region' || recommendationPool.length < 2} className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold"><RefreshCw size={11} />후보 다시 섞기</button><span className="text-[9px] font-semibold text-slate-500">지역·설립 조건에 맞춰 먼저 들어온 최대 50곳 중 12곳을 무작위로 검사합니다. 12곳보다 적으면 모두 검사합니다.</span></div>
          </div>

          {(schoolSearchError || cacheMessage) && <p className={clsx('mt-2 rounded-lg px-3 py-2 text-[11px] font-bold', schoolSearchError ? 'bg-rose-500/10 text-rose-700 dark:text-rose-200' : 'bg-sky-500/10 text-sky-800 dark:text-sky-200')}>{schoolSearchError || cacheMessage}</p>}
          <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-[11px] font-bold">현재 검사 후보: {candidateSchools.length}개 고등학교 · 선택 과목: {selectedSubject?.name ?? '-'} · 범위: {SCHOOL_INFO_SEARCH_RANGE_SHORT_LABEL} ({SCHOOL_INFO_SEARCH_RANGE_LABEL})</div>
          <button type="button" onClick={() => void findSchoolsWithEvaluation(false)} disabled={!candidateSchools.length || !selectedSubject || evaluationBusy} className="btn-primary mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40"><FileSearch size={16} />{evaluationBusy ? '과목 평가계획이 있는 학교 찾는 중…' : `“${selectedSubject?.name ?? ''}” 평가계획이 있는 학교 찾기`}</button>
          {evaluationBusy && <EvaluationSearchProgress progress={searchProgress} elapsedSeconds={elapsedSeconds} subject={selectedSubject?.name ?? ''} onStop={stopEvaluationSearch} />}
          {searchStopped && !evaluationBusy && <div className="mt-3 rounded-2xl border-2 border-amber-400/40 bg-amber-500/10 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-base font-black text-amber-900 dark:text-amber-100"><StopCircle size={18} />검색이 중지되었습니다</p><p className="mt-1 text-[11px] font-bold text-amber-800 dark:text-amber-200">중지 전까지 검사한 {searchProgress.completed}/{searchProgress.total}건과 찾은 학교 {searchProgress.confirmedSchools}곳은 그대로 유지됩니다.</p></div><button type="button" onClick={() => void findSchoolsWithEvaluation(false)} className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-black"><Play size={14} />같은 조건으로 다시 시작</button></div></div>}
          {matchedSchools.length > 0 && <SchoolPickerList title={`해당 과목 평가계획이 확인된 학교 ${matchedSchools.length}곳`} schools={matchedSchools} selectedSchools={selectedSchools} onToggle={toggleSchool} />}
          {!evaluationBusy && Object.keys(results).length > 0 && matchedSchools.length === 0 && <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-3 text-[11px] font-bold text-amber-800 dark:text-amber-200">현재 후보 학교의 최근 3학기 자료에서는 이 과목 평가계획을 확인하지 못했습니다. 지역을 바꾸거나 학교명을 직접 검색해 다시 찾아보세요.</p>}
        </div>
      </div>

      {Object.keys(results).length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-black">3. 평가계획 미리보기</p><p className="mt-1 text-[11px] font-semibold text-slate-500">위 목록에는 선택 과목 평가계획이 실제로 확인된 학교만 표시됩니다. 학교와 연도·학기를 눌러 미리보세요. 현재 찾은 자료 {totalDone}건</p></div><button type="button" onClick={() => void findSchoolsWithEvaluation(true)} disabled={evaluationBusy} className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs font-bold"><RefreshCw size={13} className={evaluationBusy ? 'animate-spin' : ''} />서버에서 다시 조회</button></div>
          <div className="mt-4 space-y-3">{selectedSchools.map((school) => <SchoolPeriodRow key={schoolKey(school)} school={school} results={results} previewKey={previewKey} onPreview={setPreviewKey} />)}</div>
          <div className="mt-4">
            {previewState?.status === 'done' ? <EvaluationPreview data={previewState.data} subject={selectedSubject?.name ?? ''} expanded={expanded} onToggleExpanded={() => setExpanded((value) => !value)} />
              : previewState?.status === 'error' ? <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-4 text-xs font-bold text-rose-700 dark:text-rose-200">{previewState.message}</div>
                : <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-xs font-semibold text-slate-500">자료가 있는 연도·학기를 선택하면 이곳에 평가계획이 표시됩니다.</div>}
          </div>
        </div>
      )}
    </section>
  )
}

function SubjectSummary({ subject }: { subject: UngcheonCurriculumSubject }) {
  return <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-lg bg-sky-500/15 px-2 py-1 text-[11px] font-black">{subject.name}</span><span className="rounded-lg bg-black/5 px-2 py-1 text-[11px] font-bold dark:bg-white/5">{subject.subjectGroup}</span><span className="rounded-lg bg-black/5 px-2 py-1 text-[11px] font-bold dark:bg-white/5">{subject.subjectType}</span><span className="rounded-lg bg-black/5 px-2 py-1 text-[11px] font-bold dark:bg-white/5">{subject.selectionGroup}</span></div>
}

function EvaluationSearchProgress({ progress, elapsedSeconds, subject, onStop }: { progress: SearchProgress; elapsedSeconds: number; subject: string; onStop: () => void }) {
  const percent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border-2 border-sky-400/40 bg-gradient-to-br from-sky-500/15 via-cyan-500/10 to-emerald-500/10 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-black"><Loader2 size={21} className="animate-spin text-sky-500" />평가계획을 찾는 중입니다</p>
          <p className="mt-1 truncate text-sm font-bold text-slate-600 dark:text-slate-200">{progress.currentLabel}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">선택 과목: {subject} · 검색 중에도 아래 버튼으로 안전하게 중지할 수 있습니다.</p>
        </div>
        <div className="grid min-w-[430px] grid-cols-4 gap-2 max-lg:min-w-0 max-sm:grid-cols-2">
          <ProgressStat label="진행 시간" value={`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`} />
          <ProgressStat label="검사 완료" value={`${progress.completed}/${progress.total}`} />
          <ProgressStat label="찾은 학교" value={`${progress.confirmedSchools}곳`} emphasis />
          <ProgressStat label="찾은 자료" value={`${progress.confirmedRecords}건`} emphasis />
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-black"><span>전체 진행률</span><span>{percent}%</span></div>
        <div className="h-4 overflow-hidden rounded-full border border-sky-400/20 bg-black/10 dark:bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400 transition-[width] duration-500" style={{ width: `${percent}%` }} /></div>
      </div>
      <button type="button" onClick={onStop} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm font-black text-rose-800 transition-colors hover:bg-rose-500/25 dark:text-rose-100"><StopCircle size={18} />검색 중지</button>
    </div>
  )
}

function ProgressStat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={clsx('rounded-xl border px-3 py-3 text-center', emphasis ? 'border-emerald-400/30 bg-emerald-500/15' : 'border-white/20 bg-white/40 dark:bg-white/5')}><p className="text-[10px] font-black text-slate-500">{label}</p><p className={clsx('mt-1 text-xl font-black tabular-nums', emphasis ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-900 dark:text-white')}>{value}</p></div>
}

function SchoolPickerList({ title, schools, selectedSchools, onToggle, compact = false }: { title: string; schools: SchoolInfoSchool[]; selectedSchools: SchoolInfoSchool[]; onToggle: (school: SchoolInfoSchool) => void; compact?: boolean }) {
  return <div className={clsx('mt-2 overflow-auto rounded-xl border border-white/10', compact ? 'max-h-44' : 'max-h-52')}><p className="sticky top-0 z-10 border-b border-white/10 bg-surface-900 px-3 py-2 text-[10px] font-black">{title}</p>{schools.map((school) => { const selected = selectedSchools.some((item) => schoolKey(item) === schoolKey(school)); return <button key={schoolKey(school)} type="button" onClick={() => onToggle(school)} className={clsx('flex w-full items-center gap-2 border-b border-white/5 px-3 py-2 text-left last:border-0 hover:bg-sky-500/10', selected && 'bg-sky-500/15')}><span className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded-md border', selected ? 'border-sky-400 bg-sky-400 text-slate-950' : 'border-white/15')}>{selected && <Check size={12} />}</span><span className="min-w-0"><span className="block truncate text-[11px] font-black">{school.name}</span><span className="block truncate text-[9px] font-semibold text-slate-500">{school.sido} {school.sgg} · {school.foundation} · {school.address}</span></span></button>})}</div>
}

function SchoolPeriodRow({ school, results, previewKey, onPreview }: { school: SchoolInfoSchool; results: Record<string, ResultState>; previewKey: string; onPreview: (key: string) => void }) {
  return <div className="rounded-xl border border-white/10 p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black">{school.name}</p><span className="text-[9px] font-bold text-slate-500">{school.sido} {school.sgg} · {school.foundation}</span></div><div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">{SCHOOL_INFO_SEARCH_PERIODS.map(({ year, semester }) => { const key = periodKey(school, year, semester); const state = results[key]; const confirmed = state?.status === 'done' && state.data.matchStatus === 'exact'; const review = state?.status === 'done' && state.data.matchStatus === 'review'; const loading = state?.status === 'loading'; return <button key={key} type="button" onClick={() => onPreview(key)} disabled={loading} title={state?.status === 'error' ? state.message : undefined} className={clsx('rounded-lg border px-2 py-2 text-left text-[10px] font-black transition-colors', previewKey === key ? 'border-sky-400 bg-sky-400/20' : confirmed ? 'border-emerald-400/25 bg-emerald-500/10 hover:bg-emerald-500/20' : review ? 'border-amber-400/25 bg-amber-500/10 hover:bg-amber-500/20' : state?.status === 'error' || state?.status === 'done' ? 'border-slate-300/20 bg-slate-500/10 text-slate-500' : 'border-white/10')}><span className="block">{year} · {semester}학기</span><span className="mt-0.5 block text-[9px]">{loading ? '조회 중…' : confirmed ? '자료 있음' : review ? '원문 확인 필요' : '자료 없음'}</span></button> })}</div></div>
}

function EvaluationPreview({ data, subject, expanded, onToggleExpanded }: { data: SchoolInfoEvaluationResponse; subject: string; expanded: boolean; onToggleExpanded: () => void }) {
  const shownText = expanded ? data.markdown : data.markdown.slice(0, 7000)
  const truncated = data.markdown.length > shownText.length
  const status = data.matchStatus === 'exact'
    ? { label: `성취기준 코드 일치 · [${data.matchedAchievementCodes[0] ?? data.achievementCodePrefix ?? ''}]`, tone: 'emerald' }
    : data.matchStatus === 'not-found'
      ? { label: '해당 과목 없음', tone: 'rose' }
      : { label: data.achievementCodePrefix ? `코드 미확인 · ${data.achievementCodePrefix}` : '성취기준 코드 없음 · 원문 확인', tone: 'amber' }
  return <article className="rounded-2xl border border-white/10 bg-black/[0.02] p-4 dark:bg-white/[0.025]"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-base font-black">{data.school.name}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{data.school.sido} {data.school.sgg} · {data.school.foundation} · {data.year}학년도 {data.semester}학기 · {data.grade}학년 · {data.subject}</p></div><div className="flex gap-1.5"><span className={clsx('rounded-lg border px-2 py-1 text-[10px] font-black', status.tone === 'emerald' ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : status.tone === 'rose' ? 'border-rose-400/30 bg-rose-500/15 text-rose-800 dark:text-rose-200' : 'border-amber-400/30 bg-amber-500/15 text-amber-800 dark:text-amber-200')}>{status.label}</span>{data.cached && <span className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-[10px] font-black text-sky-800 dark:text-sky-200">로컬 캐시</span>}</div></div>{data.fileIndexWarning && <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-400/25 bg-sky-500/10 p-2.5 text-[10px] font-bold leading-4 text-sky-900 dark:text-sky-100"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{data.fileIndexWarning}</div>}{data.scope === 'document' && data.matchStatus !== 'not-found' && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-2.5 text-[10px] font-bold leading-4 text-amber-800 dark:text-amber-200"><AlertTriangle size={13} className="mt-0.5 shrink-0" />이 학교 자료는 과목별 표가 분리되지 않아 학년 전체 문서가 표시됩니다. 과목명과 원본을 함께 확인해 주세요.</div>}<div className="schoolinfo-plan-surface mt-3 max-h-[36rem] overflow-auto rounded-xl border border-white/10 p-3"><HighlightedPlan text={shownText} subject={subject} />{truncated && <p className="mt-3 text-center text-[10px] font-bold text-slate-500">아래 내용이 더 있습니다.</p>}</div><div className="mt-3 flex flex-wrap items-center gap-2">{(truncated || expanded) && <button type="button" onClick={onToggleExpanded} className="btn-ghost px-2 py-1.5 text-[11px] font-bold">{expanded ? '내용 접기' : '전체 내용 보기'}</button>}{data.primaryFile && <button type="button" onClick={() => window.electron.openExternal(data.primaryFile!.downloadUrl)} className="btn-secondary flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold"><ExternalLink size={12} />원본 평가계획 열기</button>}<span className="ml-auto text-[9px] font-semibold text-slate-500">조회 {new Date(data.fetchedAt).toLocaleString('ko-KR')}</span></div></article>
}
