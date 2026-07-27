import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  FileSpreadsheet, Upload, RotateCcw, ChevronLeft, ChevronRight,
  Search, Inbox, AlertCircle, Loader2,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import clsx from 'clsx'

// ─── Types ───────────────────────────────────────────────────────────
interface ScoreStudent {
  id: string
  name: string
  classInfo: string
  answers: string[]
  sel: number
  ess: number
  oth: number
  tot: number
  grade: string
  cls: string
  exam: string
  subj: string
  correct: string[]
  pts: number[]
  maxSel: number
  maxEss: number
  maxOth: number
  maxTot: number
}

// ─── NEIS 정오표 파싱 (지필평가_성적확인 원본 로직 이식) ──────────────────
function parseFile(data: Uint8Array): ScoreStudent[] {
  const wb = XLSX.read(data, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws['!ref']) throw new Error('시트가 비어 있습니다')
  const rng = XLSX.utils.decode_range(ws['!ref'])
  const cv = (r: number, c: number): unknown => {
    const cell = ws[XLSX.utils.encode_cell({ r, c })]
    return cell ? cell.v : null
  }
  const cs = (r: number, c: number) => String(cv(r, c) ?? '').trim()
  const num = (r: number, c: number) => parseFloat(String(cv(r, c) ?? 0)) || 0

  // 시험 정보 (학년도/학기/강의실/차수/과목)
  let infoStr = ''
  outer1:
  for (let r = rng.s.r; r <= Math.min(rng.e.r, 15); r++)
    for (let c = rng.s.c; c <= rng.e.c; c++) {
      const v = cs(r, c)
      if (v.includes('학년도') && v.includes('학기')) { infoStr = v; break outer1 }
    }
  const grade = (infoStr.match(/(\d)\s*학년/) || [])[1] || ''
  const cls = (infoStr.match(/(\d+)\s*강의실/) || [])[1] || ''
  const examN = (infoStr.match(/(\d+)\s*차\s*정기시험/) || [])[1] || ''
  const exam = examN ? examN + '차 정기시험' : '정기시험'
  const subjM = infoStr.match(/정기시험\s+(.+)/)
  const subj = subjM ? subjM[1].trim() : ''

  // "정답" 셀 위치
  let corrRowIdx = -1, corrLabelCol = -1
  outer2:
  for (let r = rng.s.r; r <= Math.min(rng.e.r, 25); r++)
    for (let c = rng.s.c; c <= rng.e.c; c++)
      if (cs(r, c) === '정답') { corrRowIdx = r; corrLabelCol = c; break outer2 }
  if (corrRowIdx < 0) throw new Error('"정답" 셀을 찾지 못했습니다')

  const ptRowIdx = corrRowIdx + 1
  const headerRowIdx = corrRowIdx - 1
  const dataStartRow = ptRowIdx + 1

  // 문항 번호 컬럼
  const qCols: number[] = []
  for (let dr = -2; dr <= 2 && qCols.length === 0; dr++) {
    const hr = headerRowIdx + dr
    if (hr < rng.s.r) continue
    for (let c = corrLabelCol + 1; c <= rng.e.c; c++) {
      const v = cv(hr, c)
      if (typeof v === 'number' && v >= 1 && v <= 50) qCols.push(c)
    }
  }

  // 선택형/서답형/기타/총점 컬럼
  let selCol = -1, essCol = -1, othCol = -1, totCol = -1
  for (let dr = -2; dr <= 2; dr++) {
    const hr = headerRowIdx + dr
    if (hr < rng.s.r) continue
    for (let c = rng.s.c; c <= rng.e.c; c++) {
      const v = cs(hr, c)
      if (v.includes('선택형')) selCol = c
      if (v.includes('서답형')) essCol = c
      if (v.includes('기타')) othCol = c
      if (v.includes('총점')) totCol = c
    }
    if (selCol >= 0) break
  }

  const correct = qCols.map(c => String(cv(corrRowIdx, c) ?? '').trim())
  const pts = qCols.map(c => num(ptRowIdx, c))
  const maxSel = selCol >= 0 ? num(ptRowIdx, selCol) : 0
  const maxEss = essCol >= 0 ? num(ptRowIdx, essCol) : 0
  const maxOth = othCol >= 0 ? num(ptRowIdx, othCol) : 0
  const maxTot = totCol >= 0 ? num(ptRowIdx, totCol) : 0

  const students: ScoreStudent[] = []
  for (let r = dataStartRow; r <= rng.e.r; r++) {
    let sid: string | null = null, sidC = -1
    for (let c = rng.s.c; c <= Math.min(rng.e.c, rng.s.c + 5); c++) {
      const v = cv(r, c)
      if (typeof v === 'number' && !isNaN(v) && v > 100000) { sid = String(Math.round(v)); sidC = c; break }
      if (typeof v === 'string' && /^\d{5,}$/.test(v.trim())) { sid = v.trim(); sidC = c; break }
    }
    if (!sid || sidC < 0) continue
    const name = String(cv(r, sidC + 2) ?? '').trim()
    if (!name || name === '정답' || name === '배점' || /^\d+$/.test(name)) continue
    const classInfo = String(cv(r, sidC + 1) ?? '').trim()
    const answers = qCols.map(c => String(cv(r, c) ?? '').trim())
    students.push({
      id: sid, name, classInfo, answers,
      sel: selCol >= 0 ? num(r, selCol) : 0,
      ess: essCol >= 0 ? num(r, essCol) : 0,
      oth: othCol >= 0 ? num(r, othCol) : 0,
      tot: totCol >= 0 ? num(r, totCol) : 0,
      grade, cls, exam, subj, correct, pts, maxSel, maxEss, maxOth, maxTot,
    })
  }
  return students
}

function groupKey(s: ScoreStudent) {
  return s.exam + ' · ' + s.subj + (s.grade ? ' — ' + s.grade + '학년 ' + s.cls + '반' : '')
}

// ─── Main Component ──────────────────────────────────────────────────
export default function ExamScorePage() {
  const [students, setStudents] = useState<ScoreStudent[]>([])
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return
    setError('')
    setLoading(true)
    const all: ScoreStudent[] = []
    const errors: string[] = []
    for (const f of Array.from(files)) {
      if (!f.name.toLowerCase().endsWith('.xlsx')) continue
      try {
        const buf = await f.arrayBuffer()
        all.push(...parseFile(new Uint8Array(buf)))
      } catch (e) {
        errors.push(`"${f.name}": ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setLoading(false)
    if (all.length === 0) {
      setError(errors.length ? errors.join(' / ') : '학생 데이터를 찾지 못했습니다. 정오표 형식을 확인하세요.')
      return
    }
    all.sort((a, b) => {
      const gd = a.grade.localeCompare(b.grade); if (gd) return gd
      const cd = a.cls.localeCompare(b.cls); if (cd) return cd
      const [aH = 0, aN = 0] = a.classInfo.split('/').map(Number)
      const [bH = 0, bN = 0] = b.classInfo.split('/').map(Number)
      return (aH - bH) || (aN - bN)
    })
    setStudents(all)
    setCurrentIdx(-1)
    setQuery('')
  }, [])

  const reset = () => {
    setStudents([])
    setCurrentIdx(-1)
    setQuery('')
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const navigate = useCallback((dir: number) => {
    setCurrentIdx(idx => {
      const next = idx + dir
      if (next < 0 || next >= students.length) return idx
      return next
    })
  }, [students.length])

  // 방향키 이동
  useEffect(() => {
    if (currentIdx < 0) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') navigate(-1)
      if (e.key === 'ArrowRight') navigate(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentIdx, navigate])

  const viewList = useMemo(() => {
    const q = query.trim()
    if (!q) return students
    return students.filter(s => s.name.includes(q) || s.id.includes(q) || s.classInfo.includes(q))
  }, [students, query])

  const grouped = useMemo(() => {
    const map = new Map<string, ScoreStudent[]>()
    for (const s of viewList) {
      const k = groupKey(s)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(s)
    }
    return Array.from(map.entries())
  }, [viewList])

  const current = currentIdx >= 0 ? students[currentIdx] : null

  return (
    <div className="h-full flex flex-col p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-emerald-400" />
            지필평가 성적확인
          </h1>
          <p className="page-subtitle">
            {students.length > 0
              ? `총 ${students.length}명 · 학생 선택 후 ◀ ▶ 방향키로 이동`
              : 'NEIS 정오표 파일을 업로드하여 학생별 성적을 확인합니다.'}
          </p>
        </div>
        {students.length > 0 && (
          <button onClick={reset} className="btn-secondary flex items-center gap-1.5 text-xs">
            <RotateCcw size={13} /> 다시 업로드
          </button>
        )}
      </div>

      {students.length === 0 ? (
        // ── 업로드 화면 ──
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto pt-6">
            {error && (
              <div className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 text-sm">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
              className={clsx(
                'rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all mb-4',
                dragOver
                  ? 'border-violet-500/60 bg-violet-500/10'
                  : 'border-white/15 bg-surface-800 hover:border-violet-500/40 hover:bg-surface-800/70'
              )}
            >
              {loading ? (
                <Loader2 size={36} className="mx-auto mb-3 text-violet-400 animate-spin" />
              ) : (
                <Upload size={36} className="mx-auto mb-3 text-slate-500" />
              )}
              <p className="text-base font-semibold text-white mb-1">
                {loading ? '파일 처리 중…' : '정오표 파일 업로드'}
              </p>
              <p className="text-sm text-slate-400">클릭하거나 파일을 여기에 끌어다 놓으세요</p>
              <p className="text-xs text-slate-600 mt-1">xlsx 파일 · 여러 반 동시 업로드 가능</p>
            </div>
            <div className="card">
              <p className="text-xs font-semibold text-slate-300 mb-2">사용 방법</p>
              <ol className="space-y-1.5 text-xs text-slate-400">
                <li className="flex gap-2"><span className="text-violet-400 font-bold flex-shrink-0">①</span>NEIS → 지필평가 → 교과목별 학생답 정오표 다운로드</li>
                <li className="flex gap-2"><span className="text-violet-400 font-bold flex-shrink-0">②</span>위 영역에 xlsx 파일 업로드 (여러 반 동시 가능)</li>
                <li className="flex gap-2"><span className="text-violet-400 font-bold flex-shrink-0">③</span>학생 이름 클릭 → 방향키 ◀ ▶ 로 이전/다음 학생 이동</li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        // ── 결과 화면 (좌: 목록 / 우: 카드) ──
        <div className="flex-1 flex gap-4 min-h-0">
          {/* 좌측 목록 */}
          <div className="w-64 flex-shrink-0 card p-0 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-white/5">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="이름 / 학번 검색…"
                  className="input pl-8 py-2 text-xs"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {viewList.length === 0 ? (
                <p className="text-center text-slate-600 text-xs py-6">검색 결과가 없습니다.</p>
              ) : (
                grouped.map(([key, studs]) => (
                  <div key={key} className="mb-2">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1.5">{key}</div>
                    {studs.map(s => {
                      const idx = students.indexOf(s)
                      const active = idx === currentIdx
                      return (
                        <button
                          key={idx}
                          onClick={() => setCurrentIdx(idx)}
                          className={clsx(
                            'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors',
                            active ? 'bg-violet-500/20' : 'hover:bg-white/5'
                          )}
                        >
                          <span className={clsx(
                            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
                            active ? 'bg-violet-500/30 text-violet-200' : 'bg-white/5 text-slate-400'
                          )}>
                            {s.name.charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <div className={clsx('text-xs font-medium truncate', active ? 'text-violet-200' : 'text-slate-200')}>{s.name}</div>
                            <div className="text-[10px] text-slate-500 truncate">{s.classInfo}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 우측 상세 카드 */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {!current ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <Inbox size={36} className="mb-3 opacity-40" />
                <p className="text-sm">왼쪽 목록에서 학생을 선택하세요.</p>
                <p className="text-xs text-slate-600 mt-1">방향키 ◀ ▶ 로도 이동할 수 있습니다.</p>
              </div>
            ) : (
              <StudentCard
                s={current}
                idx={currentIdx}
                total={students.length}
                onPrev={() => navigate(-1)}
                onNext={() => navigate(1)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 학생 카드 ────────────────────────────────────────────────────────
function StudentCard({
  s, idx, total, onPrev, onNext,
}: {
  s: ScoreStudent
  idx: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  const okCnt = s.answers.filter(a => a === '.').length
  const ngCnt = s.answers.length - okCnt
  const meta = [s.classInfo ? s.classInfo + '번' : '', s.id ? '학번 ' + s.id : ''].filter(Boolean).join(' · ')

  return (
    <div>
      {/* nav bar */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm text-slate-400"><strong className="text-slate-200">{idx + 1}</strong> / {total}명</span>
        <span className="text-[11px] text-slate-600">◀ ▶ 방향키로 이동</span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={onPrev} disabled={idx === 0}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={onNext} disabled={idx === total - 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* info card */}
      <div className="card mb-2.5 py-3.5">
        <div className="text-[11px] text-slate-500 mb-1">
          {s.grade}학년 {s.cls}반 · {s.exam}{s.subj ? ' · ' + s.subj : ''}
        </div>
        <div className="text-xl font-bold text-white">{s.name}</div>
        {meta && <div className="text-xs text-slate-500 mt-0.5">{meta}</div>}
      </div>

      {/* score tiles */}
      <div className="grid grid-cols-4 gap-2.5 mb-2.5">
        <ScoreTile label="선택형" val={s.sel} max={s.maxSel} />
        <ScoreTile label="서답형" val={s.ess} max={s.maxEss} />
        <ScoreTile label="기타" val={s.oth} max={s.maxOth} />
        <ScoreTile label="총점" val={s.tot} max={s.maxTot} accent />
      </div>

      {/* stat bar */}
      <div className="flex gap-5 bg-surface-800 border border-white/5 rounded-xl px-4 py-2.5 mb-2.5 text-xs">
        <span className="text-emerald-400 font-semibold">○ 정답 {okCnt}문항</span>
        <span className="text-red-400 font-semibold">✗ 오답/무표기 {ngCnt}문항</span>
      </div>

      {/* 문항별 정오 현황 */}
      <div className="card p-0 overflow-hidden">
        <div className="text-xs font-semibold text-white px-4 py-3 border-b border-white/5">문항별 정오 현황 (선택형)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[420px]">
            <thead>
              <tr className="bg-surface-900">
                <th className="px-3 py-2 font-medium text-slate-500 text-center">문항</th>
                <th className="px-3 py-2 font-medium text-slate-500 text-center">정답</th>
                <th className="px-3 py-2 font-medium text-slate-500 text-center">내 답안</th>
                <th className="px-3 py-2 font-medium text-slate-500 text-center">배점</th>
                <th className="px-3 py-2 font-medium text-slate-500 text-center">결과</th>
              </tr>
            </thead>
            <tbody>
              {s.correct.map((corr, i) => {
                const ans = s.answers[i] || ''
                const ok = ans === '.'
                const blank = ans === '-' || ans === ''
                return (
                  <tr key={i} className={clsx(
                    'border-b border-white/5 last:border-0',
                    ok ? 'bg-emerald-500/5' : !blank ? 'bg-red-500/5' : ''
                  )}>
                    <td className="px-3 py-2 text-center font-semibold text-slate-300">{i + 1}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-200">{corr}</td>
                    <td className="px-3 py-2 text-center">
                      {ok
                        ? <span className="text-emerald-400 font-bold text-sm">○</span>
                        : blank
                          ? <span className="text-slate-600">—</span>
                          : <span className="text-red-400 font-bold">{ans}</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{s.pts[i]}점</td>
                    <td className="px-3 py-2 text-center">
                      {ok
                        ? <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-semibold text-[11px]">정답</span>
                        : blank
                          ? <span className="text-slate-600 text-[11px]">무표기</span>
                          : <span className="inline-block px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 font-semibold text-[11px]">오답 (-{s.pts[i]}점)</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11px] text-slate-600 border-t border-white/5">
          ※ ○은 정답, 숫자는 선택한 보기 번호, —는 무표기 &nbsp;|&nbsp; 서답형 점수는 별도 채점 결과가 총점에 반영됩니다.
        </div>
      </div>
    </div>
  )
}

function ScoreTile({ label, val, max, accent }: { label: string; val: number; max: number; accent?: boolean }) {
  return (
    <div className={clsx(
      'rounded-xl px-3 py-2.5 text-center',
      accent ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-surface-800 border border-white/5'
    )}>
      <div className={clsx('text-[11px] mb-1', accent ? 'text-violet-400' : 'text-slate-500')}>{label}</div>
      <div className={clsx('text-lg font-bold', accent ? 'text-violet-300' : 'text-white')}>{val}</div>
      <div className="text-[10px] text-slate-600 mt-0.5">/ {max}점</div>
    </div>
  )
}
