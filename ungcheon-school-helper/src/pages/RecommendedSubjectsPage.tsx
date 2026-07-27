import { useMemo, useState, useCallback } from 'react'
import {
  Search, GraduationCap, ArrowLeftRight, ListFilter, Columns3,
  X, Plus, Check, Building2, Info,
} from 'lucide-react'
import clsx from 'clsx'
import { RECOMMENDED_SUBJECTS, SUBJECT_META, type SubjectRow } from '../data/recommendedSubjects'
import {
  CANONICAL_SUBJECTS, AREA_COLOR, GENERIC_SUBJECTS, parseSubjects, isOpenRequirement, subjectArea,
} from '../utils/subjects'

type Tab = 'forward' | 'reverse' | 'bySubject' | 'compare'

interface Row extends SubjectRow { idx: number }
const ROWS: Row[] = RECOMMENDED_SUBJECTS.map((r, idx) => ({ ...r, idx }))

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
const deptLabel = (r: SubjectRow) => r.dept ?? r.college
// 대학 표시명(병합 줄바꿈 제거 후 표기)
const REGIONS = [...new Set(ROWS.map(r => r.region))]

// 데이터에 실제 등장하는 과목만 picker에 노출
const PRESENT_SUBJECTS: { area: string; subjects: string[] }[] = (() => {
  const present = new Set<string>()
  for (const r of ROWS) {
    parseSubjects(r.core).forEach(s => present.add(s))
    parseSubjects(r.recommend).forEach(s => present.add(s))
  }
  return CANONICAL_SUBJECTS
    .map(g => ({ area: g.area, subjects: g.subjects.filter(s => present.has(s)) }))
    .filter(g => g.subjects.length > 0)
})()

export default function RecommendedSubjectsPage() {
  const [tab, setTab] = useState<Tab>('forward')
  const [compareIds, setCompareIds] = useState<number[]>([])

  const toggleCompare = useCallback((idx: number) => {
    setCompareIds(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])
  }, [])

  return (
    <div className="p-5 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap size={20} className="text-sky-400" />
        <h1 className="text-xl font-bold text-white">대학 권장과목</h1>
        <span className="text-xs text-slate-500 ml-1">
          {SUBJECT_META.year}학년도 · {SUBJECT_META.univCount}개 대학 · {SUBJECT_META.count.toLocaleString()}개 모집단위
        </span>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        대학·학과별 권장 이수과목(핵심·권장)을 검색하고, 학생이 들은 과목으로 맞는 학과를 찾아보세요.
      </p>

      {/* 탭 */}
      <div className="flex items-center gap-1 mb-5 border-b border-white/5">
        <TabBtn active={tab === 'forward'} onClick={() => setTab('forward')} icon={<Search size={14} />} label="정방향 검색" />
        <TabBtn active={tab === 'reverse'} onClick={() => setTab('reverse')} icon={<ArrowLeftRight size={14} />} label="역방향 매칭" />
        <TabBtn active={tab === 'bySubject'} onClick={() => setTab('bySubject')} icon={<ListFilter size={14} />} label="과목별 역검색" />
        <TabBtn active={tab === 'compare'} onClick={() => setTab('compare')} icon={<Columns3 size={14} />} label={`비교 ${compareIds.length ? `(${compareIds.length})` : ''}`} />
      </div>

      {tab === 'forward' && <ForwardTab compareIds={compareIds} toggleCompare={toggleCompare} />}
      {tab === 'reverse' && <ReverseTab />}
      {tab === 'bySubject' && <BySubjectTab compareIds={compareIds} toggleCompare={toggleCompare} />}
      {tab === 'compare' && <CompareTab compareIds={compareIds} toggleCompare={toggleCompare} />}
    </div>
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
  const [region, setRegion] = useState('')
  const [area, setArea] = useState('')
  const [univ, setUniv] = useState('')
  const [q, setQ] = useState('')

  const areas = useMemo(() => [...new Set(ROWS.filter(r => !region || r.region === region).map(r => r.area))], [region])
  const univs = useMemo(() => [...new Set(ROWS.filter(r => (!region || r.region === region) && (!area || r.area === area)).map(r => r.univ))].sort(), [region, area])

  const results = useMemo(() => {
    const nq = norm(q)
    if (!region && !area && !univ && !nq) return []
    return ROWS.filter(r => {
      if (region && r.region !== region) return false
      if (area && r.area !== area) return false
      if (univ && r.univ !== univ) return false
      if (nq) {
        const hay = norm(`${r.univ}${r.college}${r.dept ?? ''}${r.core}`)
        if (!hay.includes(nq)) return false
      }
      return true
    })
  }, [region, area, univ, q])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={region} onChange={e => { setRegion(e.target.value); setArea(''); setUniv('') }} className="input !w-auto !py-2">
          <option value="">권역 전체</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
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
    const out = ROWS
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
  }, [selected, region, onlyFull, satisfied])

  return (
    <div>
      <div className="card !p-4 mb-4">
        <p className="text-xs font-semibold text-slate-300 mb-2">학생이 이수(예정)한 선택과목을 고르세요</p>
        <div className="space-y-2">
          {PRESENT_SUBJECTS.map(g => (
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
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
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
  const [subject, setSubject] = useState('')

  const { core, rec } = useMemo(() => {
    if (!subject) return { core: [] as Row[], rec: [] as Row[] }
    const core: Row[] = [], rec: Row[] = []
    for (const r of ROWS) {
      if (parseSubjects(r.core).includes(subject)) core.push(r)
      else if (parseSubjects(r.recommend).includes(subject)) rec.push(r)
    }
    return { core, rec }
  }, [subject])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {PRESENT_SUBJECTS.map(g => g.subjects.map(s => (
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
  const items = compareIds.map(i => ROWS[i]).filter(Boolean)
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

// ─── 빈 상태 ──────────────────────────────────────────────────────
function Hint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 text-slate-500">
      <div className="mb-3 opacity-50">{icon}</div>
      <p className="text-sm max-w-md">{text}</p>
    </div>
  )
}
