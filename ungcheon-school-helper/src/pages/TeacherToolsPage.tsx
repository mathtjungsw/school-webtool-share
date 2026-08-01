import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { differenceInCalendarDays, eachDayOfInterval, format, isWeekend, parseISO } from 'date-fns'
import {
  CalendarDays, CheckCircle2, ClipboardCopy, Download, FileSpreadsheet, History,
  ListChecks, Printer, RefreshCw, Shuffle, Sparkles, Upload, UsersRound,
} from 'lucide-react'
import { getSharedStaffRoster, getSharedStudentRoster } from '../services/schoolHub'
import { escapeHtml, printHtml } from '../utils/printHtml'

type ToolTab = 'compare' | 'date' | 'draw'
type CompareKey = 'name' | 'studentId' | 'nameBirth'
type CompareRow = { key: string; label: string }
type CompareResult = {
  common: CompareRow[]
  onlyA: CompareRow[]
  onlyB: CompareRow[]
  duplicateA: CompareRow[]
  duplicateB: CompareRow[]
}
type DrawMode = 'draw' | 'order' | 'groups'
type DrawRecord = { id: string; at: string; mode: DrawMode; seed: string; title: string; groups: string[][] }

const today = () => new Date().toISOString().slice(0, 10)
const loadJson = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
}
const unique = (items: string[]) => Array.from(new Set(items.map(item => item.trim()).filter(Boolean)))
const cleanKey = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s_\-./()]/g, '')

function parseCells(text: string): string[][] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line =>
    (line.includes('\t') ? line.split('\t') : line.split(',')).map(cell => cell.trim()),
  )
}

function rosterRows(text: string, keyType: CompareKey): CompareRow[] {
  const matrix = parseCells(text)
  if (!matrix.length) return []
  const header = matrix[0].map(cell => cleanKey(cell))
  const nameIndex = header.findIndex(cell => /^(이름|성명|학생명|교사명)$/.test(cell))
  const idIndex = header.findIndex(cell => /^(학번|사번|교번|번호|학생번호)$/.test(cell))
  const birthIndex = header.findIndex(cell => /^(생년월일|생일|출생일)$/.test(cell))
  const hasHeader = nameIndex >= 0 || idIndex >= 0 || birthIndex >= 0
  return matrix.slice(hasHeader ? 1 : 0).map(cells => {
    const fallbackNameIndex = cells.length > 1 && /^\d+$/.test(cells[0].replace(/-/g, '')) ? 1 : 0
    const name = cells[nameIndex >= 0 ? nameIndex : fallbackNameIndex] ?? ''
    const studentId = cells[idIndex >= 0 ? idIndex : 0] ?? ''
    const birth = cells[birthIndex >= 0 ? birthIndex : Math.min(2, cells.length - 1)] ?? ''
    const rawKey = keyType === 'name' ? name : keyType === 'studentId' ? studentId : `${name}|${birth}`
    return { key: cleanKey(rawKey), label: cells.filter(Boolean).join(' · ') }
  }).filter(row => row.key)
}

function compareRosters(a: CompareRow[], b: CompareRow[]): CompareResult {
  const aKeys = new Set(a.map(row => row.key))
  const bKeys = new Set(b.map(row => row.key))
  const duplicates = (rows: CompareRow[]) => {
    const count = new Map<string, number>()
    rows.forEach(row => count.set(row.key, (count.get(row.key) ?? 0) + 1))
    return rows.filter((row, index) => (count.get(row.key) ?? 0) > 1 && rows.findIndex(item => item.key === row.key) === index)
  }
  return {
    common: a.filter((row, index) => bKeys.has(row.key) && a.findIndex(item => item.key === row.key) === index),
    onlyA: a.filter((row, index) => !bKeys.has(row.key) && a.findIndex(item => item.key === row.key) === index),
    onlyB: b.filter((row, index) => !aKeys.has(row.key) && b.findIndex(item => item.key === row.key) === index),
    duplicateA: duplicates(a), duplicateB: duplicates(b),
  }
}

function seededRandom(seedText: string): () => number {
  let seed = 2166136261
  for (let i = 0; i < seedText.length; i += 1) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619)
  return () => {
    seed += 0x6d2b79f5
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: T[], seed: string): T[] {
  const out = [...items]
  const random = seededRandom(seed)
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function parsePairs(value: string): string[][] {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line =>
    line.split(/\s*[+,|]\s*/).map(name => name.trim()).filter(Boolean),
  ).filter(pair => pair.length >= 2)
}

function makeGroups(names: string[], count: number, seed: string, togetherText: string, apartText: string): string[][] {
  const together = parsePairs(togetherText)
  const apart = parsePairs(apartText)
  const parent = new Map(names.map(name => [name, name]))
  const find = (name: string): string => {
    const p = parent.get(name) ?? name
    if (p === name) return name
    const root = find(p); parent.set(name, root); return root
  }
  const join = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return
    const ra = find(a); const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  together.forEach(pair => pair.slice(1).forEach(name => join(pair[0], name)))
  const clusterMap = new Map<string, string[]>()
  names.forEach(name => {
    const root = find(name)
    clusterMap.set(root, [...(clusterMap.get(root) ?? []), name])
  })
  const groups = Array.from({ length: Math.max(1, Math.min(count, names.length)) }, () => [] as string[])
  const apartMap = new Map<string, Set<string>>()
  apart.forEach(pair => pair.forEach(name => {
    const set = apartMap.get(name) ?? new Set<string>()
    pair.filter(other => other !== name).forEach(other => set.add(other))
    apartMap.set(name, set)
  }))
  const clusters = shuffled(Array.from(clusterMap.values()), seed).sort((a, b) => b.length - a.length)
  clusters.forEach(cluster => {
    const candidates = groups.map((group, index) => ({
      index, size: group.length,
      conflict: cluster.some(name => group.some(member => apartMap.get(name)?.has(member))),
    })).sort((a, b) => Number(a.conflict) - Number(b.conflict) || a.size - b.size)
    groups[candidates[0].index].push(...cluster)
  })
  return groups.map((group, index) => shuffled(group, `${seed}-${index}`))
}

async function saveWorkbook(fileName: string, sheets: Array<{ name: string; rows: unknown[][] }>): Promise<void> {
  const workbook = XLSX.utils.book_new()
  sheets.forEach(sheet => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name.slice(0, 31)))
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  await window.electron.saveFileDialog(fileName, Array.from(new Uint8Array(bytes)))
}

export default function TeacherToolsPage() {
  const [tab, setTab] = useState<ToolTab>('compare')
  return <div className="p-6 max-w-7xl mx-auto space-y-5">
    <header><h1 className="page-title flex items-center gap-2"><Sparkles size={23} className="text-violet-400" />교사용 도구</h1><p className="page-subtitle">명단 정리, 날짜 계산, 추첨과 모둠 편성을 한 화면에서 처리합니다. 자료는 이 PC에서만 처리됩니다.</p></header>
    <div className="flex flex-wrap gap-2">
      {([
        ['compare', '명단 비교', ListChecks], ['date', '날짜 계산', CalendarDays], ['draw', '추첨·모둠', Shuffle],
      ] as Array<[ToolTab, string, typeof ListChecks]>).map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold ${tab === id ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}><Icon size={15} />{label}</button>)}
    </div>
    {tab === 'compare' && <RosterCompareTool />}
    {tab === 'date' && <DateCalculatorTool />}
    {tab === 'draw' && <DrawTool />}
  </div>
}

function RosterCompareTool() {
  const [textA, setTextA] = useState(() => localStorage.getItem('teacher-tools.rosterA.v1') ?? '')
  const [textB, setTextB] = useState(() => localStorage.getItem('teacher-tools.rosterB.v1') ?? '')
  const [keyType, setKeyType] = useState<CompareKey>('name')
  const rowsA = useMemo(() => rosterRows(textA, keyType), [textA, keyType])
  const rowsB = useMemo(() => rosterRows(textB, keyType), [textB, keyType])
  const result = useMemo(() => compareRosters(rowsA, rowsB), [rowsA, rowsB])
  useEffect(() => { localStorage.setItem('teacher-tools.rosterA.v1', textA) }, [textA])
  useEffect(() => { localStorage.setItem('teacher-tools.rosterB.v1', textB) }, [textB])

  const loadFile = async (side: 'A' | 'B') => {
    const path = await window.electron.openFileDialog([{ name: '명단 파일', extensions: ['xlsx', 'xls', 'csv'] }])
    if (!path) return
    const workbook = XLSX.read(new Uint8Array(await window.electron.readFile(path)), { type: 'array', cellDates: false })
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' })
    const value = matrix.map(row => row.map(cell => String(cell ?? '')).join('\t')).join('\n')
    if (side === 'A') setTextA(value); else setTextB(value)
  }
  const copyList = async (rows: CompareRow[]) => navigator.clipboard.writeText(rows.map(row => row.label).join('\n'))
  const exportResult = () => saveWorkbook(`명단비교_${today()}.xlsx`, [
    { name: '공통', rows: [['공통 명단'], ...result.common.map(row => [row.label])] },
    { name: 'A에만 있음', rows: [['A에만 있음'], ...result.onlyA.map(row => [row.label])] },
    { name: 'B에만 있음', rows: [['B에만 있음'], ...result.onlyB.map(row => [row.label])] },
    { name: '중복검사', rows: [['구분', '내용'], ...result.duplicateA.map(row => ['A 중복', row.label]), ...result.duplicateB.map(row => ['B 중복', row.label])] },
  ])
  return <div className="space-y-4">
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4"><div><h2 className="font-bold text-white">두 명단 비교</h2><p className="text-xs text-slate-500 mt-1">Excel을 불러오거나 표를 그대로 붙여넣으세요. 원본 파일은 서버로 전송되지 않습니다.</p></div>
        <label className="field-label ml-auto">비교 기준<select className="input-field mt-1 min-w-[150px]" value={keyType} onChange={e => setKeyType(e.target.value as CompareKey)}><option value="name">이름</option><option value="studentId">학번·사번</option><option value="nameBirth">이름+생년월일</option></select></label>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {([['A', textA, setTextA], ['B', textB, setTextB]] as const).map(([side, value, setter]) => <div key={side}>
          <div className="flex items-center justify-between mb-2"><label className="text-sm font-semibold text-slate-200">명단 {side} <span className="text-xs text-slate-500">({side === 'A' ? rowsA.length : rowsB.length}명)</span></label><button className="btn-ghost text-xs flex items-center gap-1" onClick={() => loadFile(side)}><Upload size={12} />Excel·CSV</button></div>
          <textarea className="input-field min-h-[220px] font-mono text-xs resize-y" value={value} onChange={e => setter(e.target.value)} placeholder={'이름을 한 줄에 한 명씩 입력하거나\nExcel 표를 그대로 붙여넣으세요.'} />
        </div>)}
      </div>
    </section>
    <div className="grid md:grid-cols-3 gap-3">
      <ResultList title="두 명단 공통" color="emerald" rows={result.common} onCopy={() => copyList(result.common)} />
      <ResultList title="A에만 있음" color="amber" rows={result.onlyA} onCopy={() => copyList(result.onlyA)} />
      <ResultList title="B에만 있음" color="sky" rows={result.onlyB} onCopy={() => copyList(result.onlyB)} />
    </div>
    <section className="card p-4 flex flex-wrap items-center gap-3"><span className="text-sm text-slate-300">중복 검사: A {result.duplicateA.length}건 · B {result.duplicateB.length}건</span><button className="btn-primary ml-auto flex items-center gap-1.5" onClick={exportResult}><Download size={14} />비교 결과 Excel 저장</button></section>
  </div>
}

function ResultList({ title, color, rows, onCopy }: { title: string; color: 'emerald' | 'amber' | 'sky'; rows: CompareRow[]; onCopy: () => void }) {
  const colors = { emerald: 'text-emerald-300 bg-emerald-500/10', amber: 'text-amber-300 bg-amber-500/10', sky: 'text-sky-300 bg-sky-500/10' }
  return <section className="card overflow-hidden"><div className="p-3 border-b border-white/5 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">{title} <span className={`ml-1 px-1.5 py-0.5 rounded ${colors[color]}`}>{rows.length}</span></h3><button className="text-slate-500 hover:text-white" onClick={onCopy} title="목록 복사"><ClipboardCopy size={14} /></button></div><div className="max-h-[260px] overflow-y-auto p-2">{rows.length ? rows.map(row => <p key={row.key} className="text-xs text-slate-400 px-2 py-1.5 border-b border-white/[0.03]">{row.label}</p>) : <p className="text-xs text-slate-600 text-center py-8">해당 항목이 없습니다.</p>}</div></section>
}

function DateCalculatorTool() {
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(today())
  const [includeEnd, setIncludeEnd] = useState(true)
  const [excludeWeekends, setExcludeWeekends] = useState(true)
  const [excludedDates, setExcludedDates] = useState(() => localStorage.getItem('teacher-tools.excludedDates.v1') ?? '')
  const [birthDate, setBirthDate] = useState('')
  const [termStart, setTermStart] = useState(`${new Date().getFullYear()}-03-02`)
  const [weekTarget, setWeekTarget] = useState(today())
  useEffect(() => { localStorage.setItem('teacher-tools.excludedDates.v1', excludedDates) }, [excludedDates])
  const result = useMemo(() => {
    try {
      const from = parseISO(start); const to = parseISO(end)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null
      let days = eachDayOfInterval({ start: from, end: to })
      if (!includeEnd) days = days.slice(0, -1)
      const excluded = new Set(excludedDates.split(/[\s,;]+/).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))
      const weekendCount = days.filter(day => isWeekend(day)).length
      const customCount = days.filter(day => excluded.has(format(day, 'yyyy-MM-dd')) && !(excludeWeekends && isWeekend(day))).length
      const working = days.filter(day => !(excludeWeekends && isWeekend(day)) && !excluded.has(format(day, 'yyyy-MM-dd')))
      return { total: days.length, weekendCount, customCount, working: working.length, calendarDiff: differenceInCalendarDays(to, from) }
    } catch { return null }
  }, [start, end, includeEnd, excludeWeekends, excludedDates])
  const dday = differenceInCalendarDays(parseISO(end), new Date())
  const age = useMemo(() => {
    if (!birthDate) return null
    const birth = parseISO(birthDate); const now = new Date()
    let value = now.getFullYear() - birth.getFullYear()
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) value -= 1
    return value
  }, [birthDate])
  const week = useMemo(() => {
    const diff = differenceInCalendarDays(parseISO(weekTarget), parseISO(termStart))
    return diff < 0 ? 0 : Math.floor(diff / 7) + 1
  }, [termStart, weekTarget])
  const printResult = () => printHtml(`<div class="sheet"><h1>날짜 계산 결과</h1><table><tr><th>기간</th><td>${escapeHtml(start)} ~ ${escapeHtml(end)}</td></tr><tr><th>전체 일수</th><td>${result?.total ?? '-'}일</td></tr><tr><th>근무·수업 가능일</th><td>${result?.working ?? '-'}일</td></tr><tr><th>주말 제외</th><td>${result?.weekendCount ?? '-'}일</td></tr><tr><th>사용자 제외일</th><td>${result?.customCount ?? '-'}일</td></tr><tr><th>D-day</th><td>${dday === 0 ? 'D-DAY' : dday > 0 ? `D-${dday}` : `D+${Math.abs(dday)}`}</td></tr></table></div>`, 'h1{text-align:center;margin-bottom:12mm}table{width:100%;border-collapse:collapse}th,td{border:1px solid #222;padding:4mm}th{background:#f1f5f9;width:35%}')
  return <div className="grid lg:grid-cols-2 gap-4 items-start">
    <section className="card p-5 space-y-4"><div><h2 className="font-bold text-white">기간·근무일수 계산</h2><p className="text-xs text-slate-500 mt-1">공휴일·재량휴업일은 날짜를 직접 추가하여 제외할 수 있습니다.</p></div>
      <div className="grid sm:grid-cols-2 gap-3"><label className="field-label">시작일<input type="date" className="input-field mt-1" value={start} onChange={e => setStart(e.target.value)} /></label><label className="field-label">종료일<input type="date" className="input-field mt-1" value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-300"><label className="flex items-center gap-2"><input type="checkbox" checked={includeEnd} onChange={e => setIncludeEnd(e.target.checked)} />종료일 포함</label><label className="flex items-center gap-2"><input type="checkbox" checked={excludeWeekends} onChange={e => setExcludeWeekends(e.target.checked)} />토·일 제외</label></div>
      <label className="field-label">추가 제외일<textarea className="input-field mt-1 min-h-[80px]" value={excludedDates} onChange={e => setExcludedDates(e.target.value)} placeholder="2026-09-24, 2026-09-25처럼 입력" /></label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2"><DateStat label="전체" value={`${result?.total ?? '-'}일`} /><DateStat label="가능일" value={`${result?.working ?? '-'}일`} highlight /><DateStat label="주말" value={`${result?.weekendCount ?? '-'}일`} /><DateStat label="추가 제외" value={`${result?.customCount ?? '-'}일`} /></div>
      <button className="btn-ghost flex items-center gap-1.5" onClick={printResult}><Printer size={14} />결과 인쇄·PDF</button>
    </section>
    <div className="space-y-4">
      <section className="card p-5"><h2 className="font-bold text-white mb-4">D-day</h2><label className="field-label">기준 종료일<input type="date" className="input-field mt-1" value={end} onChange={e => setEnd(e.target.value)} /></label><p className="mt-4 text-3xl font-black text-amber-300">{dday === 0 ? 'D-DAY' : dday > 0 ? `D-${dday}` : `D+${Math.abs(dday)}`}</p></section>
      <section className="card p-5 grid sm:grid-cols-2 gap-4"><div><h2 className="font-bold text-white mb-3">만 나이</h2><input type="date" className="input-field" value={birthDate} onChange={e => setBirthDate(e.target.value)} /><p className="mt-3 text-xl font-bold text-sky-300">{age === null ? '-' : `만 ${age}세`}</p></div><div><h2 className="font-bold text-white mb-3">학기 주차</h2><div className="grid grid-cols-2 gap-2"><input type="date" className="input-field" value={termStart} onChange={e => setTermStart(e.target.value)} /><input type="date" className="input-field" value={weekTarget} onChange={e => setWeekTarget(e.target.value)} /></div><p className="mt-3 text-xl font-bold text-violet-300">{week ? `${week}주차` : '학기 시작 전'}</p></div></section>
    </div>
  </div>
}

function DateStat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-xl p-3 ${highlight ? 'bg-emerald-500/15' : 'bg-white/[0.04]'}`}><p className="text-[11px] text-slate-500">{label}</p><p className={`text-lg font-bold mt-1 ${highlight ? 'text-emerald-300' : 'text-slate-200'}`}>{value}</p></div>
}

function DrawTool() {
  const [namesText, setNamesText] = useState(() => localStorage.getItem('teacher-tools.drawNames.v1') ?? '')
  const [excludeText, setExcludeText] = useState('')
  const [mode, setMode] = useState<DrawMode>('draw')
  const [drawCount, setDrawCount] = useState(1)
  const [groupCount, setGroupCount] = useState(6)
  const [together, setTogether] = useState('')
  const [apart, setApart] = useState('')
  const [seed, setSeed] = useState(() => String(Date.now()))
  const [groups, setGroups] = useState<string[][]>([])
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [history, setHistory] = useState<DrawRecord[]>(() => loadJson('teacher-tools.drawHistory.v1', []))
  useEffect(() => { localStorage.setItem('teacher-tools.drawNames.v1', namesText) }, [namesText])
  useEffect(() => { localStorage.setItem('teacher-tools.drawHistory.v1', JSON.stringify(history.slice(0, 20))) }, [history])
  const allNames = useMemo(() => unique(namesText.split(/\r?\n|,/)), [namesText])
  const activeNames = useMemo(() => {
    const excluded = new Set(unique(excludeText.split(/\r?\n|,/)))
    return allNames.filter(name => !excluded.has(name))
  }, [allNames, excludeText])

  const loadRoster = async (type: 'students' | 'staff') => {
    setLoadingRoster(true)
    try {
      if (type === 'students') {
        const roster = await getSharedStudentRoster()
        setNamesText((roster?.students ?? []).map(student => `${student.name} (${student.grade}-${student.className}-${student.number})`).join('\n'))
      } else {
        const roster = await getSharedStaffRoster()
        setNamesText((roster?.members ?? []).map(member => member.name).join('\n'))
      }
    } finally { setLoadingRoster(false) }
  }
  const run = () => {
    if (!activeNames.length) return
    const currentSeed = seed.trim() || String(Date.now())
    let next: string[][]
    if (mode === 'groups') next = makeGroups(activeNames, groupCount, currentSeed, together, apart)
    else {
      const ordered = shuffled(activeNames, currentSeed)
      next = [mode === 'draw' ? ordered.slice(0, Math.max(1, Math.min(drawCount, ordered.length))) : ordered]
    }
    setGroups(next)
    const record: DrawRecord = { id: crypto.randomUUID(), at: new Date().toISOString(), mode, seed: currentSeed, title: mode === 'draw' ? '학생 추첨' : mode === 'order' ? '발표 순서' : '모둠 편성', groups: next }
    setHistory(current => [record, ...current].slice(0, 20))
  }
  const resultRows = groups.flatMap((group, groupIndex) => group.map((name, index) => [mode === 'groups' ? `${groupIndex + 1}모둠` : mode === 'order' ? `${index + 1}번` : '당첨', name]))
  const exportResult = () => saveWorkbook(`추첨결과_${today()}.xlsx`, [{ name: '결과', rows: [['구분', '이름'], ...resultRows] }, { name: '추첨정보', rows: [['추첨시각', new Date().toLocaleString('ko-KR')], ['시드', seed], ['전체 인원', activeNames.length]] }])
  const printResult = () => printHtml(`<div class="sheet"><h1>${mode === 'draw' ? '추첨 결과' : mode === 'order' ? '발표 순서' : '모둠 편성 결과'}</h1><p class="meta">생성 시각 ${escapeHtml(new Date().toLocaleString('ko-KR'))} · 시드 ${escapeHtml(seed)}</p><div class="groups">${groups.map((group, index) => `<section><h2>${mode === 'groups' ? `${index + 1}모둠` : mode === 'order' ? '발표 순서' : '선정 결과'}</h2><ol>${group.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ol></section>`).join('')}</div></div>`, 'h1{text-align:center;margin-bottom:4mm}.meta{text-align:center;color:#555;margin-bottom:10mm}.groups{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}.groups section{border:1px solid #333;padding:5mm}.groups h2{font-size:13pt;margin-bottom:3mm}.groups li{margin:2mm 0 2mm 7mm}')
  const excludePrevious = () => {
    const previous = history.find(item => item.mode === 'draw')
    if (previous) setExcludeText(unique([...excludeText.split(/\r?\n|,/), ...previous.groups.flat()]).join('\n'))
  }
  return <div className="grid lg:grid-cols-[1fr_1fr] gap-4 items-start">
    <section className="card p-5 space-y-4">
      <div><h2 className="font-bold text-white">대상 명단</h2><p className="text-xs text-slate-500 mt-1">한 줄에 한 명씩 입력합니다. 괄호 안 학번까지 이름의 일부로 처리됩니다.</p></div>
      <div className="flex flex-wrap gap-2"><button className="btn-ghost text-xs flex items-center gap-1" disabled={loadingRoster} onClick={() => loadRoster('students')}><UsersRound size={12} />공유 학생 명렬</button><button className="btn-ghost text-xs flex items-center gap-1" disabled={loadingRoster} onClick={() => loadRoster('staff')}><UsersRound size={12} />공유 교원 명렬</button></div>
      <textarea className="input-field min-h-[220px] resize-y" value={namesText} onChange={e => setNamesText(e.target.value)} placeholder="홍길동\n김웅천\n이학교" />
      <div className="grid sm:grid-cols-2 gap-3"><label className="field-label">제외 대상<textarea className="input-field mt-1 min-h-[82px]" value={excludeText} onChange={e => setExcludeText(e.target.value)} /></label><div><label className="field-label">추첨 시드<input className="input-field mt-1" value={seed} onChange={e => setSeed(e.target.value)} /></label><button className="mt-2 text-xs text-sky-400 flex items-center gap-1" onClick={() => setSeed(String(Date.now()))}><RefreshCw size={11} />새 시드 만들기</button></div></div>
      <div className="rounded-xl bg-white/[0.03] p-3 text-xs text-slate-400">전체 {allNames.length}명 · 제외 {allNames.length - activeNames.length}명 · 참여 {activeNames.length}명</div>
    </section>
    <div className="space-y-4">
      <section className="card p-5 space-y-4">
        <div className="flex gap-2">{([['draw', '학생 추첨'], ['order', '발표 순서'], ['groups', '모둠 편성']] as Array<[DrawMode, string]>).map(([id, label]) => <button key={id} onClick={() => setMode(id)} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${mode === id ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-400'}`}>{label}</button>)}</div>
        {mode === 'draw' && <label className="field-label">추첨 인원<input type="number" min={1} className="input-field mt-1" value={drawCount} onChange={e => setDrawCount(Number(e.target.value))} /></label>}
        {mode === 'groups' && <><label className="field-label">모둠 수<input type="number" min={1} className="input-field mt-1" value={groupCount} onChange={e => setGroupCount(Number(e.target.value))} /></label><div className="grid sm:grid-cols-2 gap-3"><label className="field-label">같은 모둠 조건<textarea className="input-field mt-1 min-h-[70px]" value={together} onChange={e => setTogether(e.target.value)} placeholder="홍길동 + 김웅천" /></label><label className="field-label">분리 조건<textarea className="input-field mt-1 min-h-[70px]" value={apart} onChange={e => setApart(e.target.value)} placeholder="이학교 + 박학생" /></label></div></>}
        <button className="btn-primary w-full justify-center flex items-center gap-2" disabled={!activeNames.length} onClick={run}><Shuffle size={15} />{mode === 'draw' ? '공정하게 추첨하기' : mode === 'order' ? '발표 순서 만들기' : '모둠 편성하기'}</button>
      </section>
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-white flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" />결과</h2>{groups.length > 0 && <div className="flex gap-1"><button className="btn-ghost" onClick={printResult}><Printer size={13} /></button><button className="btn-ghost" onClick={exportResult}><FileSpreadsheet size={13} /></button></div>}</div>
        {groups.length ? <div className={`grid ${mode === 'groups' ? 'sm:grid-cols-2' : ''} gap-2`}>{groups.map((group, groupIndex) => <div key={groupIndex} className="rounded-xl bg-white/[0.035] p-3"><p className="text-xs font-semibold text-violet-300 mb-2">{mode === 'groups' ? `${groupIndex + 1}모둠 · ${group.length}명` : mode === 'order' ? '발표 순서' : '선정 결과'}</p>{group.map((name, index) => <p key={name} className="text-sm text-slate-200 py-1 border-b border-white/[0.03]"><span className="inline-block w-6 text-slate-600">{index + 1}</span>{name}</p>)}</div>)}</div> : <p className="text-sm text-slate-600 text-center py-10">명단과 방식을 설정한 뒤 실행하세요.</p>}
      </section>
      <section className="card p-4"><div className="flex items-center gap-2"><History size={14} className="text-slate-500" /><h3 className="text-sm font-semibold text-slate-200">최근 기록</h3><button className="ml-auto text-[11px] text-amber-400" onClick={excludePrevious}>직전 당첨자 제외</button></div><div className="mt-2 max-h-[140px] overflow-y-auto">{history.slice(0, 5).map(item => <button key={item.id} className="w-full text-left py-2 border-t border-white/[0.04]" onClick={() => { setMode(item.mode); setSeed(item.seed); setGroups(item.groups) }}><span className="text-xs text-slate-300">{item.title} · {item.groups.flat().length}명</span><span className="block text-[10px] text-slate-600">{new Date(item.at).toLocaleString('ko-KR')} · 시드 {item.seed}</span></button>)}</div></section>
    </div>
  </div>
}
