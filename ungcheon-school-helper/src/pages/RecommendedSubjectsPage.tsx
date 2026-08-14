import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import {
  Search, GraduationCap, ArrowLeftRight, ListFilter, Columns3,
  X, Plus, Check, Building2, Info, Compass, FileSpreadsheet, ShieldCheck, Trash2, ExternalLink, Save, Printer,
} from 'lucide-react'
import clsx from 'clsx'
import { RECOMMENDED_SUBJECTS, SUBJECT_META, type SubjectRow } from '../data/recommendedSubjects'
import { RECOMMENDED_SUBJECTS_2027, SUBJECT_META_2027 } from '../data/recommendedSubjects2027'
import {
  CANONICAL_SUBJECTS, AREA_COLOR, GENERIC_SUBJECTS, parseSubjects, isOpenRequirement, subjectArea,
} from '../utils/subjects'
import {
  loadStoredTranscripts, parseTranscriptFile, saveStoredTranscripts,
  type StoredTranscript, type TranscriptStudent,
} from '../services/studentTranscript'

type Tab = 'career' | 'forward' | 'reverse' | 'bySubject' | 'compare' | 'transcript'

interface Row extends SubjectRow { idx: number }
type DatasetKey = '2027' | '2028'
const ROWS_2028: Row[] = RECOMMENDED_SUBJECTS.map((r, idx) => ({ ...r, idx }))
const ROWS_2027: Row[] = RECOMMENDED_SUBJECTS_2027.map((r, idx) => ({ ...r, idx: 2_027_000 + idx }))
const DatasetContext = createContext<{ dataset: DatasetKey; rows: Row[] }>({ dataset: '2028', rows: ROWS_2028 })
const useDataset = () => useContext(DatasetContext)

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
const deptLabel = (r: SubjectRow) => r.dept ?? r.college
const getRegions = (rows: Row[]) => [...new Set(rows.map(r => r.region))]
const getPresentSubjects = (rows: Row[]): { area: string; subjects: string[] }[] => {
  const present = new Set<string>()
  for (const r of rows) {
    parseSubjects(r.core).forEach(s => present.add(s))
    parseSubjects(r.recommend).forEach(s => present.add(s))
  }
  return CANONICAL_SUBJECTS
    .map(g => ({ area: g.area, subjects: g.subjects.filter(s => present.has(s)) }))
    .filter(g => g.subjects.length > 0)
}

export default function RecommendedSubjectsPage() {
  const [tab, setTab] = useState<Tab>('career')
  const [dataset, setDataset] = useState<DatasetKey>('2028')
  const rows = dataset === '2027' ? ROWS_2027 : ROWS_2028
  const meta = dataset === '2027' ? SUBJECT_META_2027 : SUBJECT_META
  const [compareIds, setCompareIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('recommendedSubjects.compare.v1') ?? '[]') } catch { return [] }
  })

  useEffect(() => { localStorage.setItem('recommendedSubjects.compare.v1', JSON.stringify(compareIds)) }, [compareIds])

  const toggleCompare = useCallback((idx: number) => {
    setCompareIds(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx)
      if (prev.length >= 3) { window.alert('대학·학과 비교는 한 번에 3개까지 담을 수 있습니다.'); return prev }
      return [...prev, idx]
    })
  }, [])

  return (
    <DatasetContext.Provider value={{ dataset, rows }}><div className="recommended-subjects-page p-5 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap size={20} className="text-sky-400" />
        <h1 className="text-xl font-bold text-white">대학 권장과목</h1>
        <span className="text-xs text-slate-500 ml-1">
          {meta.year}학년도 · {meta.univCount}개 대학 · {meta.count.toLocaleString()}개 모집단위
        </span>
      </div>
      <p className="text-sm text-slate-400 mb-4">대학·학과별 권장 이수과목(핵심·권장)을 검색하고, 학생이 들은 과목으로 맞는 학과를 찾아보세요.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3">
        <span className="text-xs font-black text-sky-200">자료 기준</span>
        <button type="button" onClick={() => setDataset('2028')} className={clsx('rounded-xl border px-3 py-2 text-xs font-bold', dataset === '2028' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-white/10 text-slate-300')}>2028 대입 이후 · 2022 개정 · 1·2학년</button>
        <button type="button" onClick={() => setDataset('2027')} className={clsx('rounded-xl border px-3 py-2 text-xs font-bold', dataset === '2027' ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-white/10 text-slate-300')}>2027 대입 · 2015 개정 · 3학년</button>
        <span className="ml-auto text-[11px] font-semibold text-slate-400">3학년 학생부 파일은 2027 자료로 자동 분석합니다.</span>
      </div>

      {/* 탭 */}
      <div className="flex flex-wrap items-center gap-1 mb-5 border-b border-white/5">
        <TabBtn active={tab === 'career'} onClick={() => setTab('career')} icon={<Compass size={14} />} label="진로·학과 찾기" />
        <TabBtn active={tab === 'forward'} onClick={() => setTab('forward')} icon={<Search size={14} />} label="대학별 찾기" />
        <TabBtn active={tab === 'reverse'} onClick={() => setTab('reverse')} icon={<ArrowLeftRight size={14} />} label="역방향 매칭" />
        <TabBtn active={tab === 'bySubject'} onClick={() => setTab('bySubject')} icon={<ListFilter size={14} />} label="과목별 역검색" />
        <TabBtn active={tab === 'compare'} onClick={() => setTab('compare')} icon={<Columns3 size={14} />} label={`비교 ${compareIds.length ? `(${compareIds.length})` : ''}`} />
        <TabBtn active={tab === 'transcript'} onClick={() => setTab('transcript')} icon={<FileSpreadsheet size={14} />} label="내 학생부로 학과 찾기" />
      </div>

      {tab === 'career' && <CareerTab compareIds={compareIds} toggleCompare={toggleCompare} />}
      {tab === 'forward' && <ForwardTab compareIds={compareIds} toggleCompare={toggleCompare} />}
      {tab === 'reverse' && <ReverseTab />}
      {tab === 'bySubject' && <BySubjectTab compareIds={compareIds} toggleCompare={toggleCompare} />}
      {tab === 'compare' && <CompareTab compareIds={compareIds} toggleCompare={toggleCompare} />}
      {tab === 'transcript' && <TranscriptTab compareIds={compareIds} toggleCompare={toggleCompare} />}
    </div></DatasetContext.Provider>
  )
}

// ─── 공용 ─────────────────────────────────────────────────────────
function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx('flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        active ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-200')}
    >
      {icon}{label}
    </button>
  )
}

function SubjectChips({ text, tone }: { text: string | null; tone: 'core' | 'rec' }) {
  if (!text) return null
  const subs = parseSubjects(text)
  return (
    <div className="space-y-1.5">
      <p className={clsx('text-sm leading-relaxed', tone === 'core' ? 'text-slate-200' : 'text-slate-300')}>{text}</p>
      {subs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {subs.map(s => (
            <span key={s} className={clsx('text-[10px] px-1.5 py-0.5 rounded-md border', AREA_COLOR[subjectArea(s)] ?? 'bg-white/5 text-slate-300 border-white/10')}>{s}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function MajorCard({ row, inCompare, onToggleCompare }: { row: Row; inCompare?: boolean; onToggleCompare?: (idx: number) => void }) {
  return (
    <div className="card !p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white">{row.univ}</span>
            <span className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">{row.region} · {row.area}</span>
          </div>
          <p className="text-sm text-slate-300 mt-0.5">
            {row.dept ? <><span className="text-slate-500">{row.college}</span> ﹥ <span className="font-medium text-sky-200">{row.dept}</span></>
              : <span className="font-medium text-sky-200">{row.college}</span>}
          </p>
        </div>
        {onToggleCompare && (
          <button
            onClick={() => onToggleCompare(row.idx)}
            title={inCompare ? '비교함에서 제거' : '비교함에 추가'}
            className={clsx('flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border flex-shrink-0 transition-colors',
              inCompare ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' : 'text-slate-400 border-white/10 hover:bg-white/5')}
          >
            {inCompare ? <Check size={12} /> : <Plus size={12} />}비교
          </button>
        )}
      </div>
      <div className="space-y-3">
        <Field label="핵심과목" hint="필수적 이수 권장" tone="core">
          <SubjectChips text={row.core} tone="core" />
        </Field>
        {row.recommend && (
          <Field label="권장과목" hint="가급적 이수 권장" tone="rec">
            <SubjectChips text={row.recommend} tone="rec" />
          </Field>
        )}
        {row.note && (
          <Field label="비고" tone="note">
            <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">{row.note}</p>
          </Field>
        )}
        {row.sourceUrl && (
          <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-300 hover:text-sky-200">
            <ExternalLink size={10} />공식 출처 · {row.sourcePage ?? '원문'}
          </a>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, tone, children }: { label: string; hint?: string; tone: 'core' | 'rec' | 'note'; children: React.ReactNode }) {
  const dot = tone === 'core' ? 'bg-emerald-400' : tone === 'rec' ? 'bg-sky-400' : 'bg-slate-500'
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={clsx('w-1.5 h-1.5 rounded-full', dot)} />
        <span className="text-[11px] font-semibold text-slate-300">{label}</span>
        {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
      </div>
      <div className="pl-3">{children}</div>
    </div>
  )
}

function GroupedResults({ rows, compareIds, toggleCompare, cap = 200 }: {
  rows: Row[]; compareIds: number[]; toggleCompare?: (idx: number) => void; cap?: number
}) {
  const shown = rows.slice(0, cap)
  return (
    <>
      {rows.length > cap && (
        <p className="text-xs text-amber-400/80 mb-3 flex items-center gap-1.5">
          <Info size={12} /> 결과가 많습니다. {cap}개만 표시 — 검색어/필터로 좁혀 보세요. (총 {rows.length.toLocaleString()}개)
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shown.map(r => (
          <MajorCard key={r.idx} row={r} inCompare={compareIds.includes(r.idx)} onToggleCompare={toggleCompare} />
        ))}
      </div>
    </>
  )
}

// ─── 1. 정방향 검색 ───────────────────────────────────────────────
function ForwardTab({ compareIds, toggleCompare }: { compareIds: number[]; toggleCompare: (idx: number) => void }) {
  const { rows } = useDataset()
  const regions = useMemo(() => getRegions(rows), [rows])
  const [region, setRegion] = useState('')
  const [area, setArea] = useState('')
  const [univ, setUniv] = useState('')
  const [q, setQ] = useState('')

  const areas = useMemo(() => [...new Set(rows.filter(r => !region || r.region === region).map(r => r.area))], [rows, region])
  const univs = useMemo(() => [...new Set(rows.filter(r => (!region || r.region === region) && (!area || r.area === area)).map(r => r.univ))].sort(), [rows, region, area])

  const results = useMemo(() => {
    const nq = norm(q)
    if (!region && !area && !univ && !nq) return []
    return rows.filter(r => {
      if (region && r.region !== region) return false
      if (area && r.area !== area) return false
      if (univ && r.univ !== univ) return false
      if (nq) {
        const hay = norm(`${r.univ}${r.college}${r.dept ?? ''}${r.core}`)
        if (!hay.includes(nq)) return false
      }
      return true
    })
  }, [rows, region, area, univ, q])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={region} onChange={e => { setRegion(e.target.value); setArea(''); setUniv('') }} className="input !w-auto !py-2">
          <option value="">권역 전체</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={area} onChange={e => { setArea(e.target.value); setUniv('') }} className="input !w-auto !py-2">
          <option value="">지역 전체</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={univ} onChange={e => setUniv(e.target.value)} className="input !w-auto !py-2">
          <option value="">대학 전체</option>
          {univs.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="학과·대학·과목명 검색" className="input !pl-9 !py-2" />
        </div>
      </div>

      {results.length === 0 ? (
        <Hint icon={<Building2 size={28} />} text="권역·지역·대학을 선택하거나 학과명을 검색하면 권장과목이 표시됩니다." />
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">{results.length.toLocaleString()}개 모집단위</p>
          <GroupedResults rows={results} compareIds={compareIds} toggleCompare={toggleCompare} />
        </>
      )}
    </div>
  )
}

// ─── 2. 역방향 매칭 ───────────────────────────────────────────────
function ReverseTab() {
  const { rows } = useDataset()
  const regions = useMemo(() => getRegions(rows), [rows])
  const presentSubjects = useMemo(() => getPresentSubjects(rows), [rows])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [region, setRegion] = useState('')
  const [onlyFull, setOnlyFull] = useState(true)

  const toggle = (s: string) => setSelected(prev => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n
  })

  const selectedAreas = useMemo(() => new Set([...selected].map(subjectArea)), [selected])
  const satisfied = useCallback((req: string) =>
    selected.has(req) || (GENERIC_SUBJECTS.has(req) && selectedAreas.has(subjectArea(req))), [selected, selectedAreas])

  const results = useMemo(() => {
    if (selected.size === 0) return []
    const out = rows
      .filter(r => !region || r.region === region)
      .map(r => {
        const open = isOpenRequirement(r.core)
        const reqs = parseSubjects(r.core)
        const met = reqs.filter(satisfied)
        const missing = reqs.filter(x => !satisfied(x))
        const coverage = open ? 1 : (reqs.length === 0 ? 1 : met.length / reqs.length)
        return { r, open, reqs, met, missing, coverage }
      })
      .filter(m => (onlyFull ? m.coverage === 1 : m.coverage > 0))
    out.sort((a, b) => b.coverage - a.coverage || a.missing.length - b.missing.length)
    return out
  }, [rows, selected, region, onlyFull, satisfied])

  return (
    <div>
      <div className="card !p-4 mb-4">
        <p className="text-xs font-semibold text-slate-300 mb-2">학생이 이수(예정)한 선택과목을 고르세요</p>
        <div className="space-y-2">
          {presentSubjects.map(g => (
            <div key={g.area} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500 w-20 flex-shrink-0">{g.area}</span>
              {g.subjects.map(s => (
                <button key={s} onClick={() => toggle(s)}
                  className={clsx('text-[11px] px-2 py-1 rounded-lg border transition-colors',
                    selected.has(s) ? (AREA_COLOR[g.area] ?? 'bg-sky-500/20 text-sky-300 border-sky-500/30') : 'text-slate-400 border-white/10 hover:bg-white/5')}>
                  {s}
                </button>
              ))}
            </div>
          ))}
        </div>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} className="btn-ghost mt-2 !px-2 text-xs text-slate-500">선택 초기화 ({selected.size})</button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={region} onChange={e => setRegion(e.target.value)} className="input !w-auto !py-2">
          <option value="">권역 전체</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={onlyFull} onChange={e => setOnlyFull(e.target.checked)} className="accent-sky-500" />
          내 과목으로 핵심과목이 모두 충족되는 곳만
        </label>
      </div>

      {selected.size === 0 ? (
        <Hint icon={<ArrowLeftRight size={28} />} text="위에서 들은 과목을 선택하면, 그 과목을 핵심과목으로 요구하는 학과를 충족률 순으로 보여줍니다." />
      ) : results.length === 0 ? (
        <Hint icon={<Info size={28} />} text="조건에 맞는 학과가 없습니다. '모두 충족' 옵션을 해제해 부분 충족도 확인해 보세요." />
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">{results.length.toLocaleString()}개 학과</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.slice(0, 300).map(({ r, open, met, missing, coverage }) => (
              <div key={r.idx} className="card !p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-sm font-semibold text-white">{r.univ}</span>
                    <p className="text-sm text-sky-200 font-medium">{deptLabel(r)}</p>
                    <p className="text-[10px] text-slate-500">{r.region} · {r.area}{r.dept ? ` · ${r.college}` : ''}</p>
                  </div>
                  {open
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 flex-shrink-0">제한 없음</span>
                    : <span className={clsx('text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0',
                        coverage === 1 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30')}>
                        충족 {met.length}/{met.length + missing.length}
                      </span>}
                </div>
                {open ? (
                  <p className="text-xs text-slate-400">계열·적성 고려 — 특정 과목 지정 없음. 핵심: <span className="text-slate-300">{r.core}</span></p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {met.map(s => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">✓ {s}</span>)}
                    {missing.map(s => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-300/80 border border-rose-500/20">+ {s}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── 3. 과목별 역검색 ─────────────────────────────────────────────
function BySubjectTab({ compareIds, toggleCompare }: { compareIds: number[]; toggleCompare: (idx: number) => void }) {
  const { rows } = useDataset()
  const presentSubjects = useMemo(() => getPresentSubjects(rows), [rows])
  const [subject, setSubject] = useState('')

  const { core, rec } = useMemo(() => {
    if (!subject) return { core: [] as Row[], rec: [] as Row[] }
    const core: Row[] = [], rec: Row[] = []
    for (const r of rows) {
      if (parseSubjects(r.core).includes(subject)) core.push(r)
      else if (parseSubjects(r.recommend).includes(subject)) rec.push(r)
    }
    return { core, rec }
  }, [rows, subject])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {presentSubjects.map(g => g.subjects.map(s => (
          <button key={s} onClick={() => setSubject(s === subject ? '' : s)}
            className={clsx('text-[11px] px-2 py-1 rounded-lg border transition-colors',
              subject === s ? (AREA_COLOR[g.area] ?? 'bg-sky-500/20 text-sky-300 border-sky-500/30') : 'text-slate-400 border-white/10 hover:bg-white/5')}>
            {s}
          </button>
        )))}
      </div>

      {!subject ? (
        <Hint icon={<ListFilter size={28} />} text="과목을 하나 선택하면, 그 과목을 핵심·권장과목으로 요구하는 대학·학과를 모아서 보여줍니다." />
      ) : (
        <>
          <p className="text-sm text-slate-300 mb-3">
            <span className="font-semibold text-sky-300">{subject}</span> — 핵심 {core.length}개 · 권장 {rec.length}개 모집단위
          </p>
          {core.length > 0 && (
            <Section title="핵심과목으로 요구" color="emerald">
              <GroupedResults rows={core} compareIds={compareIds} toggleCompare={toggleCompare} cap={300} />
            </Section>
          )}
          {rec.length > 0 && (
            <Section title="권장과목으로 제시" color="sky">
              <GroupedResults rows={rec} compareIds={compareIds} toggleCompare={toggleCompare} cap={300} />
            </Section>
          )}
          {core.length === 0 && rec.length === 0 && <Hint icon={<Info size={28} />} text="해당 과목을 요구하는 모집단위가 없습니다." />}
        </>
      )}
    </div>
  )
}

function Section({ title, color, children }: { title: string; color: 'emerald' | 'sky'; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={clsx('w-1.5 h-1.5 rounded-full', color === 'emerald' ? 'bg-emerald-400' : 'bg-sky-400')} />
        <h3 className="text-xs font-semibold text-slate-300">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ─── 4. 대학·학과 비교 ────────────────────────────────────────────
function CompareTab({ compareIds, toggleCompare }: { compareIds: number[]; toggleCompare: (idx: number) => void }) {
  const { rows } = useDataset()
  const items = compareIds.map(i => rows.find(row => row.idx === i)).filter((row): row is Row => Boolean(row))
  if (items.length === 0) {
    return <Hint icon={<Columns3 size={28} />} text="‘정방향 검색’이나 ‘과목별 역검색’에서 학과 카드의 [+비교]를 눌러 담으면, 여기서 핵심·권장과목을 나란히 비교합니다." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth: items.length * 240 }}>
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface-900 z-10 p-2 text-left text-xs text-slate-500 font-medium border-b border-white/10 w-24">항목</th>
            {items.map(r => (
              <th key={r.idx} className="p-2 text-left align-top border-b border-white/10 min-w-[220px]">
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className="text-sm font-semibold text-white">{r.univ}</div>
                    <div className="text-xs text-sky-200 font-medium">{deptLabel(r)}</div>
                    <div className="text-[10px] text-slate-500">{r.region} · {r.area}</div>
                  </div>
                  <button onClick={() => toggleCompare(r.idx)} className="text-slate-500 hover:text-rose-400 flex-shrink-0" title="제거"><X size={14} /></button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <CompareRow label="핵심과목" items={items} pick={r => r.core} />
          <CompareRow label="권장과목" items={items} pick={r => r.recommend} />
          <CompareRow label="비고" items={items} pick={r => r.note} />
        </tbody>
      </table>
    </div>
  )
}

function CompareRow({ label, items, pick }: { label: string; items: Row[]; pick: (r: Row) => string | null }) {
  return (
    <tr>
      <td className="sticky left-0 bg-surface-900 z-10 p-2 align-top text-xs font-semibold text-slate-300 border-b border-white/5">{label}</td>
      {items.map(r => (
        <td key={r.idx} className="p-2 align-top border-b border-white/5">
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{pick(r) ?? '—'}</p>
        </td>
      ))}
    </tr>
  )
}

// ─── 진로·학과 찾기 ──────────────────────────────────────────────
const CAREER_HINTS: Record<string, string[]> = {
  의사: ['의예', '의학', '생명', '화학'], 간호사: ['간호'], 교사: ['교육', '사범'],
  개발자: ['컴퓨터', '소프트웨어', '인공지능', '정보'], 변호사: ['법학'],
  경찰: ['경찰', '행정'], 공무원: ['행정', '정치'], 건축가: ['건축'],
  심리상담: ['심리'], 경영: ['경영', '회계', '경제'], 환경: ['환경', '생태', '에너지'],
}

function CareerTab({ compareIds, toggleCompare }: { compareIds: number[]; toggleCompare: (idx: number) => void }) {
  const { rows } = useDataset()
  const regions = useMemo(() => getRegions(rows), [rows])
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const words = useMemo(() => {
    const q = query.trim()
    return q ? [...new Set([q, ...(CAREER_HINTS[q] ?? [])])] : []
  }, [query])
  const results = useMemo(() => words.length ? rows.filter(row => {
    if (region && row.region !== region) return false
    const hay = norm(`${row.univ} ${row.college} ${row.dept ?? ''} ${row.core} ${row.recommend ?? ''}`)
    return words.some(word => hay.includes(norm(word)))
  }) : [], [rows, region, words])
  const departmentCount = new Set(results.map(deptLabel)).size
  const universityCount = new Set(results.map(row => row.univ)).size
  return <div>
    <div className="card mb-4 p-4">
      <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]"><select value={region} onChange={event => setRegion(event.target.value)}><option value="">권역 전체</option>{regions.map(item => <option key={item}>{item}</option>)}</select><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input className="!pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="희망 직업·전공·학과를 입력하세요 (예: 개발자, 간호, 심리)" /></div></div>
      <p className="mt-3 text-[11px] text-slate-500">직업명은 관련 학과 검색어로 넓혀 찾습니다. 결과는 진로 탐색 참고자료이며 지원 자격이나 합격 가능성을 뜻하지 않습니다.</p>
    </div>
    {!query.trim() ? <Hint icon={<Compass size={28} />} text="희망 직업이나 관심 학과를 입력하면 관련 대학·학과와 권장과목을 함께 보여드립니다." /> : <><p className="mb-3 text-xs font-semibold text-slate-400">관련 학과 {departmentCount}종 · 대학 {universityCount}개 · 모집단위 {results.length}개</p><GroupedResults rows={results} compareIds={compareIds} toggleCompare={toggleCompare} cap={120} /></>}
  </div>
}

function rowFit(row: Row, student: TranscriptStudent) {
  const completed = student.courses.map(course => course.subject)
  const completedNorm = completed.map(norm)
  const reqs = parseSubjects(row.core)
  const met = reqs.filter(req => completedNorm.some(subject => subject.includes(norm(req)) || norm(req).includes(subject)))
  const missing = reqs.filter(req => !met.includes(req))
  const open = isOpenRequirement(row.core)
  const score = open ? 0.45 : reqs.length ? met.length / reqs.length : 0
  return { row, met, missing, open, score }
}

// ─── 내 학생부로 학과 찾기 ──────────────────────────────────────
function TranscriptTab({ compareIds, toggleCompare }: { compareIds: number[]; toggleCompare: (idx: number) => void }) {
  const [files, setFiles] = useState<StoredTranscript[]>([])
  const [fileId, setFileId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [targetQuery, setTargetQuery] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [counselMemo, setCounselMemo] = useState('')

  useEffect(() => { void loadStoredTranscripts().then(value => { setFiles(value); setFileId(value[0]?.id ?? '') }) }, [])
  const selectedFile = files.find(file => file.id === fileId) ?? files[0]
  const selectedStudent = selectedFile?.students.find(student => student.studentId === studentId) ?? selectedFile?.students[0]
  const transcriptRows = selectedFile?.grade === 3 ? ROWS_2027 : ROWS_2028
  useEffect(() => { if (selectedFile && !selectedFile.students.some(student => student.studentId === studentId)) setStudentId(selectedFile.students[0]?.studentId ?? '') }, [selectedFile, studentId])

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setMessage('')
    try {
      const parsed = await parseTranscriptFile(file)
      const duplicate = files.find(item => item.fingerprint === parsed.fingerprint)
      if (duplicate && !window.confirm('같은 파일이 이미 등록되어 있습니다. 그래도 다시 등록할까요?')) { setFileId(duplicate.id); return }
      const next = [...files, parsed]
      await saveStoredTranscripts(next); setFiles(next); setFileId(parsed.id); setStudentId(parsed.students[0]?.studentId ?? '')
      setMessage(`${parsed.grade}-${parsed.classNo}반 학생 ${parsed.students.length}명의 교과 기록을 이 PC에 저장했습니다.`)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const removeFile = async (file: StoredTranscript) => {
    if (!window.confirm(`${file.fileName}의 로컬 분석 자료를 삭제할까요?`)) return
    const next = files.filter(item => item.id !== file.id); await saveStoredTranscripts(next); setFiles(next); setFileId(next[0]?.id ?? '')
  }
  const fitResults = useMemo(() => selectedStudent ? transcriptRows.map(row => rowFit(row, selectedStudent)).filter(result => {
    if (!targetQuery.trim()) return !result.open && result.score > 0
    return norm(`${result.row.univ}${deptLabel(result.row)}`).includes(norm(targetQuery))
  }).sort((a, b) => b.score - a.score || b.met.length - a.met.length).slice(0, 40) : [], [selectedStudent, targetQuery, transcriptRows])
  const saveCounseling = async () => {
    if (!selectedFile || !selectedStudent) return
    const key = 'recommendedSubjects.counseling.v1'
    const previous = await window.electron.configGet(key)
    const records = Array.isArray(previous) ? previous : []
    await window.electron.configSet(key, [...records, {
      id: crypto.randomUUID(), savedAt: new Date().toISOString(), studentId: selectedStudent.studentId,
      studentName: selectedStudent.name, curriculum: selectedFile.curriculum, targetQuery: targetQuery.trim(),
      memo: counselMemo.trim(), completedSubjects: selectedStudent.courses.map(course => course.subject),
    }])
    setMessage(`${selectedStudent.name} 학생의 상담 결과를 이 PC에 저장했습니다.`)
  }

  return <div className="space-y-4">
    <div className="rounded-2xl border-2 border-emerald-400/30 bg-emerald-500/10 p-4">
      <p className="flex items-center gap-2 text-sm font-black text-emerald-200"><ShieldCheck size={17} />학생 이름·성적·파일은 학교 공유 서버나 구글시트로 전송하지 않습니다.</p>
      <p className="mt-1 text-xs text-emerald-300/90">나이스 → 학교생활기록부 → 학생부 조회 및 출력 → 교과학습발달상황(개인별출력)에서 <b>XLSX data</b>로 내려받은 학급 파일을 사용하세요. 분석 결과는 이 PC에만 보관됩니다.</p>
    </div>
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-white">1. 학급 파일 불러오기</h3><p className="mt-1 text-[11px] text-slate-500">반복 머리글·합계·페이지 번호는 제외하고 같은 학생의 여러 학기 기록을 자동으로 합칩니다.</p></div><label className="btn-primary cursor-pointer"><FileSpreadsheet size={14} />{busy ? '분석 중...' : 'XLSX data 추가'}<input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy} onChange={event => void importFile(event)} /></label></div>
      {message && <p className="mt-3 rounded-xl bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200">{message}</p>}
      <div className="mt-3 space-y-2">{files.map(file => <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2"><button onClick={() => setFileId(file.id)} className="min-w-0 text-left"><p className="truncate text-xs font-bold text-slate-200">{file.fileName}</p><p className="mt-0.5 text-[10px] text-slate-500">{file.grade}-{file.classNo}반 · {file.students.length}명 · {file.curriculum} 개정교육과정</p></button><button onClick={() => void removeFile(file)} className="text-slate-500 hover:text-rose-400" title="이 PC에서 삭제"><Trash2 size={14} /></button></div>)}</div>
    </div>
    {selectedFile && selectedStudent && <>
      <div className="card p-4"><h3 className="mb-3 font-black text-white">2. 학생 선택과 이수과목 확인</h3><div className="grid gap-2 md:grid-cols-2"><select value={fileId} onChange={event => setFileId(event.target.value)}>{files.map(file => <option key={file.id} value={file.id}>{file.grade}-{file.classNo}반 · {file.fileName}</option>)}</select><select value={selectedStudent.studentId} onChange={event => setStudentId(event.target.value)}>{selectedFile.students.map(student => <option key={student.studentId} value={student.studentId}>{student.studentId} · {student.name}</option>)}</select></div>
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-100">2026학년도 기준 {selectedFile.grade <= 2 ? '1·2학년은 2022 개정교육과정·2028 대입 이후 자료' : '3학년은 2015 개정교육과정·2027 대입 자료'}로 자동 분석합니다. 3학년 자료는 서울대·연세대·부산대 공식 안내서에서 확인한 모집단위만 제공하며, 미확인 대학은 추정하지 않습니다.</div>
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-white/10"><table className="w-full min-w-[760px] text-[11px]"><thead className="sticky top-0 bg-surface-900"><tr>{['학년','학기','교과','과목','학점·단위','원점수/평균','성취도','분포','석차등급','수강자'].map(label => <th key={label} className="px-2 py-2 text-left text-slate-400">{label}</th>)}</tr></thead><tbody>{selectedStudent.courses.map((course, index) => <tr key={`${course.grade}-${course.semester}-${course.subject}-${index}`} className="border-t border-white/5"><td className="px-2 py-2">{course.grade}</td><td>{course.semester}</td><td>{course.subjectGroup}</td><td className="font-bold text-slate-200">{course.subject}</td><td>{course.credit}</td><td>{[course.rawScore, course.average].filter(Boolean).join(' / ')}</td><td>{course.achievement}</td><td>{course.distribution}</td><td>{course.rankGrade}</td><td>{course.enrollment}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-black text-white">3. 희망 대학·학과와 과목 구성 비교</h3><p className="mt-1 text-[11px] text-slate-500">현재 이수과목과 권장과목 문구의 일치 정도를 보여주는 상담 참고자료입니다.</p></div><div className="flex gap-2"><a className="btn-ghost" href="https://mathtjungsw.github.io/ungcheon-high-school-work-tools/course-selection-grade1.html" target="_blank" rel="noreferrer">1학년 과목선택 <ExternalLink size={12} /></a><a className="btn-ghost" href="https://mathtjungsw.github.io/ungcheon-high-school-work-tools/course-selection-grade2.html" target="_blank" rel="noreferrer">2학년 과목선택 <ExternalLink size={12} /></a></div></div><div className="relative mt-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={targetQuery} onChange={event => setTargetQuery(event.target.value)} className="!pl-9" placeholder="희망 대학 또는 학과 검색 (비우면 일치도가 높은 학과 표시)" /></div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">{fitResults.map(({ row, met, missing, open, score }) => <div key={row.idx} className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-black text-white">{row.univ} · {deptLabel(row)}</p><p className="mt-1 text-[10px] text-slate-500">{row.region} · {row.area}</p></div><button onClick={() => toggleCompare(row.idx)} className="btn-ghost p-1.5">{compareIds.includes(row.idx) ? <Check size={12} /> : <Plus size={12} />}</button></div><p className="mt-2 text-[11px] font-bold text-emerald-300">{open ? '과목 지정 없음 · 대학 안내문 확인' : `권장과목 문구 일치 ${Math.round(score * 100)}%`}</p>{met.length > 0 && <p className="mt-1 text-[10px] text-slate-300">확인됨: {met.join(', ')}</p>}{missing.length > 0 && <p className="mt-1 text-[10px] text-amber-300">추가 확인: {missing.join(', ')}</p>}{row.sourceUrl && <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-sky-300"><ExternalLink size={10} />공식 출처 · {row.sourcePage}</a>}</div>)}</div>
        <div className="mt-4 rounded-xl border border-white/10 p-3"><label className="block"><span className="mb-1 block text-[10px] font-bold text-slate-400">상담 메모</span><textarea rows={3} value={counselMemo} onChange={event => setCounselMemo(event.target.value)} placeholder="학생과 확인한 희망 학과·추가로 살펴볼 과목을 적어두세요." /></label><div className="mt-2 flex flex-wrap justify-end gap-2"><button onClick={() => window.print()} className="btn-ghost"><Printer size={13} />인쇄·PDF 저장</button><button onClick={() => void saveCounseling()} className="btn-primary"><Save size={13} />상담 결과 로컬 저장</button></div></div>
        <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">이 결과는 합격 가능성·지원 자격을 판정하지 않습니다. 대학별 최신 모집요강과 평가 안내를 반드시 함께 확인하세요. 웅천고 개설 여부는 과목선택 도우미와 최신 교육과정 편제표에서 최종 확인하세요.</p>
      </div>
    </>}
  </div>
}

// ─── 빈 상태 ──────────────────────────────────────────────────────
function Hint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 text-slate-500">
      <div className="mb-3 opacity-50">{icon}</div>
      <p className="text-sm max-w-md">{text}</p>
    </div>
  )
}
