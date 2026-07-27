import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Search, GraduationCap, X,
  Loader2, AlertCircle, ArrowUpDown, ChevronDown, Check, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'

/* ───── 데이터 타입 ───── */
interface RawData {
  univs: string[]
  depts: string[]
  regions: string[]
  types: string[]
  admnames: string[]
  factors: string[]
  rows: [number, number, number, number, number, number, number, number | null, number | null, number | null][]
}

interface Row {
  univ: string
  dept: string
  region: string
  type: string
  admname: string
  admMain: string
  admSub: string
  factor: string
  quota: number
  compRate: number | null
  cut50: number | null
  cut70: number | null
}

/* ───── 탭 정의 ───── */
const TABS = [
  { id: 'gen2027', label: '일반대학 (2027)', file: 'adiga2027.json' },
  { id: 'gen2026', label: '일반대학 (2026)', file: 'adiga_gen2026.json' },
  { id: 'jun2027', label: '전문대학 (2027)', file: 'adiga_jun2027.json' },
] as const
type TabId = typeof TABS[number]['id']

/* ───── 등급대 정의 ───── */
const GRADE_OPTIONS = ['1등급대', '2등급대', '3등급대', '4등급대', '5등급대', '6등급대이상'] as const
type GradeLabel = typeof GRADE_OPTIONS[number]

const gradeOf = (v: number | null): GradeLabel | null => {
  if (v == null) return null
  if (v < 2) return '1등급대'
  if (v < 3) return '2등급대'
  if (v < 4) return '3등급대'
  if (v < 5) return '4등급대'
  if (v < 6) return '5등급대'
  return '6등급대이상'
}

/* ───── 유틸 ───── */
const parseAdmName = (s: string) => {
  const idx = s.indexOf(' > ')
  return idx === -1 ? { main: s, sub: s } : { main: s.slice(0, idx).trim(), sub: s.slice(idx + 3).trim() }
}
const norm = (s: string) => s.replace(/\s+/g, '')
const fmt = (v: number | null) => v == null ? '-' : v.toFixed(2)

const PAGE_SIZE = 50

/* ───── 데이터 캐시 + 리소스 경로 (앱 생애 동안 상수) ───── */
const cache: Record<string, Row[] | 'loading' | 'error'> = {}
let cachedResourcesPath: string | null = null

/* ───── 다중선택 드롭다운 ───── */
function MultiSelect({
  label, options, selected, onChange,
}: {
  label: string
  options: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (v: string) => {
    const next = new Set(selected)
    next.has(v) ? next.delete(v) : next.add(v)
    onChange(next)
  }
  const clear = (e: React.MouseEvent) => { e.stopPropagation(); onChange(new Set()) }

  const count = selected.size
  const displayLabel = count === 0 ? label : count === 1 ? [...selected][0] : `${[...selected][0]} 외 ${count - 1}`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors min-w-[110px]',
          open || count > 0
            ? 'bg-sky-600/20 border-sky-500/50 text-sky-300'
            : 'bg-surface-800 border-white/10 text-slate-300 hover:border-white/20'
        )}
      >
        <span className="flex-1 text-left truncate max-w-[130px]">{displayLabel}</span>
        {count > 0 && (
          <span onClick={clear} className="text-slate-400 hover:text-white ml-1 flex-shrink-0">
            <X size={11} />
          </span>
        )}
        <ChevronDown size={11} className={clsx('flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface-900 border border-white/15
                        rounded-lg shadow-xl min-w-[200px] max-h-64 overflow-y-auto py-1">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left
                         hover:bg-white/5 transition-colors"
            >
              <span className={clsx(
                'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                selected.has(opt) ? 'bg-sky-600 border-sky-500' : 'border-white/20'
              )}>
                {selected.has(opt) && <Check size={9} />}
              </span>
              <span className={selected.has(opt) ? 'text-sky-300' : 'text-slate-300'}>{opt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ───── 메인 페이지 ───── */
export default function Adiga2027Page() {
  const [activeTab, setActiveTab] = useState<TabId>('gen2027')
  const [tabRows, setTabRows] = useState<Row[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const [query, setQuery] = useState('')
  const [selRegions, setSelRegions] = useState<Set<string>>(new Set())
  const [selTypes, setSelTypes] = useState<Set<string>>(new Set())
  const [selMains, setSelMains] = useState<Set<string>>(new Set())
  const [selGrades, setSelGrades] = useState<Set<string>>(new Set())

  const [sortKey, setSortKey] = useState<'cut50' | 'cut70' | 'compRate' | 'quota' | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(1)

  const inputRef = useRef<HTMLInputElement>(null)

  /* 탭 데이터 로드 — 레이스 방지: generation 카운터로 stale 응답 폐기 */
  const loadGenRef = useRef(0)

  const loadTab = useCallback(async (tabId: TabId) => {
    const gen = ++loadGenRef.current

    if (cache[tabId] === 'loading') return
    if (cache[tabId] && cache[tabId] !== 'error') {
      setTabRows(cache[tabId] as Row[])
      setStatus('ready')
      return
    }
    cache[tabId] = 'loading'
    setStatus('loading')
    try {
      const tab = TABS.find(t => t.id === tabId)!
      // resourcesPath는 앱 생애 동안 변하지 않으므로 한 번만 IPC 호출
      if (!cachedResourcesPath) {
        cachedResourcesPath = await window.electron.getResourcesPath()
      }
      // readFileBase64: 배열 대신 base64 문자열 전송 (~15MB → ~5MB)
      // M-4: Windows 백슬래시 혼용 방지 — 구분자를 '/'로 통일
      const resourceBase = cachedResourcesPath.replace(/\\/g, '/')
      const b64: string = await window.electron.readFileBase64(`${resourceBase}/${tab.file}`)
      if (gen !== loadGenRef.current) return  // 탭이 이미 바뀌었으면 폐기
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const text = new TextDecoder('utf-8').decode(bytes)
      const raw: RawData = JSON.parse(text)

      const parsed: Row[] = raw.rows.map(r => {
        const admname = raw.admnames[r[4]] ?? ''
        const { main: admMain, sub: admSub } = parseAdmName(admname)
        return {
          univ: raw.univs[r[0]] ?? '',
          dept: raw.depts[r[1]] ?? '',
          region: raw.regions[r[2]] ?? '',
          type: raw.types[r[3]] ?? '',
          admname, admMain, admSub,
          factor: r[5] >= 0 ? (raw.factors[r[5]] ?? '') : '',
          quota: r[6],
          compRate: r[7],
          cut50: r[8],
          cut70: r[9],
        }
      })
      if (gen !== loadGenRef.current) return  // 파싱 중 탭 전환 처리
      cache[tabId] = parsed
      setTabRows(parsed)
      setStatus('ready')
    } catch (e) {
      if (gen !== loadGenRef.current) return
      cache[tabId] = 'error'
      const msg = e instanceof Error
        ? e.message.replace(/^ENOENT[^:]*:\s*/, '데이터 파일을 찾을 수 없습니다: ').replace(/,\s*open.*$/, '')
        : String(e)
      setErrorMsg(msg)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    // 필터·페이지 리셋은 탭 전환 effect에서만 처리 (중복 setPage 제거)
    setQuery(''); setSelRegions(new Set()); setSelTypes(new Set()); setSelMains(new Set()); setSelGrades(new Set())
    setSortKey(null); setSortAsc(true); setPage(1)
    loadTab(activeTab)
  }, [activeTab, loadTab])

  /* 메타 */
  const regions  = useMemo(() => [...new Set(tabRows.map(r => r.region))].sort(), [tabRows])
  const types    = useMemo(() => [...new Set(tabRows.map(r => r.type))].sort(), [tabRows])
  const univCount = useMemo(() => new Set(tabRows.map(r => r.univ)).size, [tabRows])
  const admMains = useMemo(() => {
    const base = selTypes.size > 0
      ? tabRows.filter(r => selTypes.has(r.type))
      : tabRows
    return [...new Set(base.map(r => r.admMain))].sort()
  }, [tabRows, selTypes])

  /* 필터링 */
  const filtered = useMemo(() => {
    let result = tabRows
    if (selRegions.size > 0) result = result.filter(r => selRegions.has(r.region))
    if (selTypes.size > 0)   result = result.filter(r => selTypes.has(r.type))
    if (selMains.size > 0)   result = result.filter(r => selMains.has(r.admMain))
    if (selGrades.size > 0)  result = result.filter(r => {
      const g50 = gradeOf(r.cut50)
      const g70 = gradeOf(r.cut70)
      return (g50 != null && selGrades.has(g50)) || (g70 != null && selGrades.has(g70))
    })
    if (query.trim()) {
      const q = norm(query.trim())
      result = result.filter(r =>
        norm(r.univ).includes(q) || norm(r.dept).includes(q) || norm(r.admSub).includes(q)
      )
    }
    return result
  }, [tabRows, selRegions, selTypes, selMains, selGrades, query])

  /* 정렬 — I-4: slice()로 복사 후 sort (Strict Mode에서 메모이제이션 오염 방지) */
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return filtered.slice().sort((a, b) => {
      const av = a[sortKey] ?? (sortAsc ? Infinity : -Infinity)
      const bv = b[sortKey] ?? (sortAsc ? Infinity : -Infinity)
      return sortAsc ? av - bv : bv - av
    })
  }, [filtered, sortKey, sortAsc])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageRows   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = useCallback((key: typeof sortKey) => {
    setSortKey(prev => {
      if (prev === key) { setSortAsc(a => !a); return key }
      setSortAsc(true); return key
    })
    setPage(1)
  }, [])

  const resetFilters = () => {
    setQuery(''); setSelRegions(new Set()); setSelTypes(new Set()); setSelMains(new Set()); setSelGrades(new Set())
    setSortKey(null); setSortAsc(true); setPage(1)
    inputRef.current?.focus()
  }

  const hasFilters = query || selRegions.size > 0 || selTypes.size > 0 || selMains.size > 0 || selGrades.size > 0

  // 탭 전환 effect가 이미 setPage(1)을 처리하므로, 여기서는 필터 변경만 담당
  useEffect(() => { setPage(1) }, [query, selRegions, selTypes, selMains, selGrades])

  /* ── 렌더 ── */
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3 flex-shrink-0 border-b border-white/8">
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap size={20} className="text-sky-400" />
          <h1 className="text-xl font-bold text-white">대입상담프로그램(어디가)</h1>
          {status === 'ready' && (
            <span className="text-xs text-slate-500 ml-1">
              {tabRows.length.toLocaleString()}개 전형 · {univCount}개 대학
            </span>
          )}
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mb-3">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-4 py-1.5 text-sm rounded-md font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="대학명, 학과명, 전형명 검색…"
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-surface-800 border border-white/10
                       text-sm text-white placeholder:text-slate-600 focus:outline-none
                       focus:border-sky-500/60 transition-colors"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={14} />
            </button>
          )}
        </div>

        {/* 필터 행 */}
        <div className="flex gap-2 items-center flex-wrap">
          <MultiSelect label="지역" options={regions} selected={selRegions}
            onChange={v => { setSelRegions(v); setPage(1) }} />
          <MultiSelect label="전형구분" options={types} selected={selTypes}
            onChange={v => { setSelTypes(v); setSelMains(new Set()); setPage(1) }} />
          <MultiSelect label="전형유형" options={admMains} selected={selMains}
            onChange={v => { setSelMains(v); setPage(1) }} />
          <MultiSelect label="등급대 (50·70%컷)" options={[...GRADE_OPTIONS]} selected={selGrades}
            onChange={v => { setSelGrades(v); setPage(1) }} />
          {hasFilters && (
            <button onClick={resetFilters}
              className="text-xs text-slate-400 hover:text-sky-400 flex items-center gap-1 transition-colors">
              <X size={11} /> 초기화
            </button>
          )}
          {status === 'ready' && (
            <span className="ml-auto text-xs text-slate-500">
              {filtered.length.toLocaleString()}건
            </span>
          )}
        </div>
      </div>

      {/* 본문 */}
      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-400">
          <Loader2 size={32} className="animate-spin text-sky-400" />
          <p className="text-sm">데이터 로딩 중…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-400">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-sm text-red-300">{errorMsg}</p>
          {/* I-3: 에러 캐시 초기화 후 재시도 */}
          <button
            onClick={() => { delete cache[activeTab]; loadTab(activeTab) }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
          >
            <RefreshCw size={12} /> 다시 시도
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          {/* 테이블 */}
          <div className="flex-1 overflow-auto min-h-0">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-surface-900 z-10">
                <tr className="text-left text-slate-400 text-xs border-b border-white/10">
                  <Th>대학명</Th>
                  <Th>학과명</Th>
                  <Th>지역</Th>
                  <Th>전형구분</Th>
                  <Th>전형명</Th>
                  <SortTh label="모집인원" sk="quota"    sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortTh label="경쟁률(전년)" sk="compRate" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortTh label="50%컷" sk="cut50"    sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortTh label="70%컷" sk="cut70"    sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-600">
                      {hasFilters ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
                    </td>
                  </tr>
                ) : pageRows.map(r => (
                  <tr key={`${r.univ}|${r.dept}|${r.admname}`} className="border-t border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap max-w-[170px] truncate"
                        title={r.univ}>
                      <span className="text-white font-medium">
                        {r.univ.replace(/\[.*?\]/g, '').trim()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-200 max-w-[190px] truncate" title={r.dept}>
                      {r.dept}
                    </td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{r.region}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="px-3 py-2 max-w-[230px]">
                      <div className="text-xs text-slate-500 leading-tight">{r.admMain}</div>
                      <div className="text-slate-200 truncate leading-tight" title={r.admSub}>{r.admSub}</div>
                      {r.factor && (
                        <div className="text-xs text-slate-600 truncate" title={r.factor}>{r.factor}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-300 tabular-nums whitespace-nowrap">
                      {r.quota > 0 ? r.quota : '-'}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-300 tabular-nums whitespace-nowrap">
                      {fmt(r.compRate)}
                    </td>
                    <td className={clsx('px-3 py-2 text-center font-semibold tabular-nums whitespace-nowrap', gradeColor(r.cut50))}>
                      {fmt(r.cut50)}
                    </td>
                    <td className={clsx('px-3 py-2 text-center font-semibold tabular-nums whitespace-nowrap', gradeColor(r.cut70))}>
                      {fmt(r.cut70)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 py-2.5 flex-shrink-0 border-t border-white/8">
              <PagBtn onClick={() => setPage(1)} disabled={page === 1}>«</PagBtn>
              <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</PagBtn>
              {pagRange(page, totalPages).map((p, i) =>
                p === '…'
                  ? <span key={`e${i}`} className="px-1 text-slate-600 text-xs">…</span>
                  : <PagBtn key={p} onClick={() => setPage(Number(p))} active={page === p}>{p}</PagBtn>
              )}
              <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</PagBtn>
              <PagBtn onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</PagBtn>
              <span className="text-xs text-slate-500 ml-2">{page} / {totalPages}쪽</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ───── 서브 컴포넌트 ───── */
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 font-medium whitespace-nowrap">{children}</th>
}

function SortTh({ label, sk, sortKey, sortAsc, onSort }: {
  label: string; sk: 'cut50' | 'cut70' | 'compRate' | 'quota'
  sortKey: string | null; sortAsc: boolean
  onSort: (k: 'cut50' | 'cut70' | 'compRate' | 'quota') => void
}) {
  const active = sortKey === sk
  return (
    <th onClick={() => onSort(sk)}
      className={clsx(
        'px-3 py-2.5 font-medium whitespace-nowrap cursor-pointer select-none hover:text-sky-400 transition-colors',
        active && 'text-sky-400'
      )}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={active ? 'opacity-100' : 'opacity-25'} />
      </span>
    </th>
  )
}

function TypeBadge({ type }: { type: string }) {
  const color = type.startsWith('수시') ? 'text-emerald-400 bg-emerald-400/10'
    : type.startsWith('정시') ? 'text-amber-400 bg-amber-400/10'
    : 'text-slate-400 bg-white/5'
  return <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', color)}>{type}</span>
}

function gradeColor(v: number | null) {
  if (v == null) return 'text-slate-600'
  if (v <= 1.5)  return 'text-sky-300'
  if (v <= 2.5)  return 'text-emerald-400'
  if (v <= 3.5)  return 'text-yellow-400'
  if (v <= 5)    return 'text-orange-400'
  return 'text-red-400'
}

function PagBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode; onClick: () => void
  disabled?: boolean; active?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={clsx(
        'w-7 h-7 text-xs rounded transition-colors',
        active
          ? 'bg-sky-600 text-white'
          : 'text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed'
      )}>
      {children}
    </button>
  )
}

function pagRange(cur: number, total: number): (number | '…')[] {
  const nums = new Set<number>()
  nums.add(1); nums.add(total)
  for (let i = Math.max(2, cur - 2); i <= Math.min(total - 1, cur + 2); i++) nums.add(i)
  const arr = [...nums].sort((a, b) => a - b)
  const result: (number | '…')[] = []
  for (let i = 0; i < arr.length; i++) {
    if (i > 0 && arr[i] - arr[i - 1] > 1) result.push('…')
    result.push(arr[i])
  }
  return result
}
