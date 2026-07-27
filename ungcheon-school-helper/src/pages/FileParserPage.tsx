import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileCode2, Upload, Loader2, AlertCircle, Download, FileSpreadsheet, FileText,
  Hash, ToggleLeft, Calendar, List, Type, CircleSlash, Copy, Check,
} from 'lucide-react'
import clsx from 'clsx'
import { parseFile, parseBytes, sheetToJson, sheetToCsv, sheetToMarkdown } from '../services/fileParser'
import type { ParseResult, ParsedSheet, CellKind } from '../services/fileParser/types'

const KIND_META: Record<CellKind, { label: string; icon: React.ElementType; cls: string }> = {
  number:  { label: '숫자',   icon: Hash,        cls: 'text-sky-300 bg-sky-500/15' },
  boolean: { label: '참/거짓', icon: ToggleLeft,  cls: 'text-violet-300 bg-violet-500/15' },
  date:    { label: '날짜',   icon: Calendar,    cls: 'text-amber-300 bg-amber-500/15' },
  array:   { label: '배열',   icon: List,        cls: 'text-emerald-300 bg-emerald-500/15' },
  string:  { label: '문자',   icon: Type,        cls: 'text-slate-300 bg-white/10' },
  empty:   { label: '빈값',   icon: CircleSlash, cls: 'text-slate-500 bg-white/5' },
}

function saveText(name: string, content: string) {
  const bytes = Array.from(new TextEncoder().encode(content))
  window.electron?.saveFileDialog(name, bytes)
}

export default function FileParserPage() {
  const [drag, setDrag] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)

  const load = async (path: string, name: string) => {
    setLoading(true); setError(''); setResult(null); setFileName(name)
    try {
      setResult(await parseFile(path, name))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const pick = async () => {
    const paths = await window.electron?.openFilesDialog([
      { name: '모든 지원 파일', extensions: ['xlsx', 'xls', 'xlsb', 'xlsm', 'csv', 'ods', 'hwp', 'hwpx', 'pdf', 'txt', 'tsv', 'md', 'json'] },
      { name: '모든 파일', extensions: ['*'] },
    ])
    if (paths?.[0]) await load(paths[0], paths[0].split(/[/\\]/).pop() ?? paths[0])
  }
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0] as (File & { path?: string }) | undefined
    if (!f) return
    if (f.path) { load(f.path, f.name); return }
    // 경로가 없으면(샌드박스) 바이트로 직접 파싱 — 엑셀/텍스트만 가능
    setLoading(true); setError(''); setResult(null); setFileName(f.name)
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const r = parseBytes(bytes, f.name)
      if (!r) { setError('이 형식(한글/PDF)은 드롭 대신 아래 버튼으로 선택해주세요.'); return }
      setResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="page-title flex items-center gap-2"><FileCode2 size={20} className="text-violet-400" />만능 파일 파서</h1>
        <p className="page-subtitle">엑셀·한글(HWP/HWPX)·PDF·CSV 등 다양한 파일을 구조적으로 파싱합니다 · 엑셀은 타입·병합셀까지 분석</p>
      </div>

      {/* 드롭/선택 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={pick}
        className={clsx('border-2 border-dashed rounded-xl p-6 cursor-pointer text-center transition-colors mb-4',
          drag ? 'border-violet-400 bg-violet-500/10' : 'border-white/15 hover:border-white/30 hover:bg-white/5')}
      >
        <Upload size={24} className="mx-auto mb-2 text-violet-400" />
        <p className="text-sm text-white">파일을 드래그하거나 클릭하여 선택</p>
        <p className="text-[11px] text-slate-500 mt-1">xlsx · xls · xlsb · csv · hwp · hwpx · pdf · txt · json</p>
      </div>

      <AnimatePresence mode="wait">
        {loading && (
          <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 py-12 text-slate-400">
            <Loader2 size={20} className="animate-spin text-violet-400" /><span className="text-sm">{fileName} 파싱 중…</span>
          </motion.div>
        )}
        {!loading && error && (
          <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex gap-3">
            <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div><p className="text-red-300 font-medium text-sm mb-1">파싱 실패</p><p className="text-red-400/80 text-xs">{error}</p></div>
          </motion.div>
        )}
        {!loading && !error && result && (
          <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {result.kind === 'excel' ? <ExcelView result={result} fileName={fileName} />
              : result.kind === 'doc' ? <TextView title={`${fileName} · ${result.format.toUpperCase()} → 마크다운`} content={result.markdown} fileName={fileName.replace(/\.\w+$/, '.md')} />
              : <TextView title={fileName} content={result.text} fileName={fileName} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ExcelView({ result, fileName }: { result: Extract<ParseResult, { kind: 'excel' }>; fileName: string }) {
  const [active, setActive] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const sheet = result.sheets[active]
  const base = fileName.replace(/\.\w+$/, '')

  if (result.sheets.length === 0) return <div className="card text-sm text-slate-500">시트가 비어 있습니다.</div>

  return (
    <div className="space-y-3">
      {/* 시트 탭 */}
      {result.sheets.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {result.sheets.map((s, i) => (
            <button key={s.name} onClick={() => { setActive(i); setShowAll(false) }}
              className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border',
                i === active ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'bg-white/3 border-white/10 text-slate-400')}>
              <FileSpreadsheet size={11} />{s.name}
            </button>
          ))}
        </div>
      )}
      <SheetTable sheet={sheet} showAll={showAll} setShowAll={setShowAll} base={base} />
    </div>
  )
}

function SheetTable({ sheet, showAll, setShowAll, base }: {
  sheet: ParsedSheet; showAll: boolean; setShowAll: (v: boolean) => void; base: string
}) {
  const LIMIT = 100
  const rows = showAll ? sheet.rows : sheet.rows.slice(0, LIMIT)
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-xs text-slate-400">
          <span className="text-white font-semibold">{sheet.name}</span>
          <span className="ml-2">{sheet.rowCount}행 · {sheet.colCount}열{sheet.mergeCount > 0 && ` · 병합 ${sheet.mergeCount}`}</span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => saveText(`${base}_${sheet.name}.json`, sheetToJson(sheet))} className="btn-ghost text-xs flex items-center gap-1"><Download size={11} />JSON</button>
          <button onClick={() => saveText(`${base}_${sheet.name}.csv`, sheetToCsv(sheet))} className="btn-ghost text-xs flex items-center gap-1"><Download size={11} />CSV</button>
          <button onClick={() => saveText(`${base}_${sheet.name}.md`, sheetToMarkdown(sheet))} className="btn-ghost text-xs flex items-center gap-1"><Download size={11} />MD</button>
        </div>
      </div>
      <div className="overflow-auto max-h-[60vh] border border-white/10 rounded-lg">
        <table className="border-collapse text-xs w-full">
          <thead className="sticky top-0">
            <tr>
              <th className="border border-white/10 bg-surface-800 px-2 py-1 text-slate-500 w-10">#</th>
              {sheet.headers.map((h, i) => {
                const meta = KIND_META[sheet.colKinds[i] ?? 'string']
                const Icon = meta.icon
                return (
                  <th key={i} className="border border-white/10 bg-surface-800 px-2 py-1 text-left whitespace-nowrap">
                    <div className="text-white font-semibold">{h}</div>
                    <span className={clsx('inline-flex items-center gap-0.5 px-1 rounded text-[10px] mt-0.5', meta.cls)}><Icon size={9} />{meta.label}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="hover:bg-white/3">
                <td className="border border-white/10 px-2 py-1 text-center text-slate-600">{r + 1}</td>
                {sheet.headers.map((_, c) => {
                  const cell = row[c]
                  return (
                    <td key={c} className={clsx('border border-white/10 px-2 py-1 whitespace-nowrap',
                      cell?.merged && 'text-slate-500 italic', cell?.formula && 'text-sky-300')}
                      title={cell?.formula ?? (cell?.kind === 'array' ? JSON.stringify(cell.value) : undefined)}>
                      {cell?.raw ?? ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.rows.length > LIMIT && (
        <button onClick={() => setShowAll(!showAll)} className="mt-2 w-full text-xs text-slate-400 hover:text-white">
          {showAll ? '접기' : `전체 보기 (${sheet.rowCount}행)`}
        </button>
      )}
    </div>
  )
}

function TextView({ title, content, fileName }: { title: string; content: string; fileName: string }) {
  const [copied, setCopied] = useState(false)
  const lines = useMemo(() => content.split('\n').length, [content])
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-xs text-slate-400"><span className="text-white font-semibold flex items-center gap-1"><FileText size={12} />{title}</span></span>
        <div className="flex gap-1.5">
          <button onClick={() => { navigator.clipboard.writeText(content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
            className="btn-ghost text-xs flex items-center gap-1">{copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}복사</button>
          <button onClick={() => saveText(fileName, content)} className="btn-ghost text-xs flex items-center gap-1"><Download size={11} />저장</button>
        </div>
      </div>
      <pre className="text-xs text-slate-200 whitespace-pre-wrap break-words max-h-[65vh] overflow-auto bg-surface-900 rounded-lg p-3 leading-relaxed">{content || '(내용 없음)'}</pre>
      <p className="text-[11px] text-slate-600 mt-1">{content.length.toLocaleString()}자 · {lines.toLocaleString()}줄</p>
    </div>
  )
}
