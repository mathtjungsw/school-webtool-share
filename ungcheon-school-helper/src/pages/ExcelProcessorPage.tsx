import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Upload, FileSpreadsheet, Loader2, Download, CheckCircle2, AlertCircle, Settings2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import clsx from 'clsx'
import { binaryToNumberArray } from '../utils/binaryBytes'

interface Stats {
  totalRows: number
  totalCells: number
  trimmedCells: number
  normalizedDates: number
  filledBlanks: number
  removedDuplicates: number
}

interface Option {
  id: keyof typeof DEFAULT_OPTIONS
  label: string
  desc: string
}

const DEFAULT_OPTIONS = {
  trimSpaces: true,
  normalizeDates: true,
  fillBlanks: true,
  removeDuplicates: true,
}

const OPTIONS: Option[] = [
  { id: 'trimSpaces', label: '공백 제거', desc: '셀 앞뒤 불필요한 공백 및 개행 제거' },
  { id: 'normalizeDates', label: '날짜 형식 통일', desc: 'YYYYMMDD → YYYY-MM-DD 형식으로 통일' },
  { id: 'fillBlanks', label: '결측치 처리', desc: '빈 셀을 N/A로 채우기' },
  { id: 'removeDuplicates', label: '중복 행 제거', desc: '완전히 동일한 행 삭제' },
]

function normalizedDate(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value) || /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(value)
  if (!match) return value
  const [year,month,day] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day)
  if (year < 1900 || year > 2199 || date.getMonth()+1 !== month || date.getDate() !== day) return value
  return [year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-')
}

function processSheet(sheet: XLSX.WorkSheet, opts: typeof DEFAULT_OPTIONS, stats: Stats): XLSX.WorkSheet {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  const merges = sheet['!merges'] || []
  const output: XLSX.WorkSheet = { ...sheet }
  const seen = new Set<string>()
  let dest = range.s.r
  for (let r=range.s.r; r<=range.e.r; r++) {
    stats.totalRows++
    const cells: (XLSX.CellObject | undefined)[] = []
    for (let c=range.s.c; c<=range.e.c; c++) {
      const address = XLSX.utils.encode_cell({r,c})
      const cell = sheet[address]
      delete output[address]
      stats.totalCells++
      if (cell?.f || merges.some(m => r>=m.s.r && r<=m.e.r && c>=m.s.c && c<=m.e.c && (r!==m.s.r || c!==m.s.c))) { cells.push(cell); continue }
      let value = cell?.v
      if ((value == null || value === '') && opts.fillBlanks) {value='N/A';stats.filledBlanks++}
      if (typeof value === 'string' && opts.trimSpaces) {const next=value.trim().replace(/\s+/g,' ');if (next!==value) stats.trimmedCells++;value=next}
      if (opts.normalizeDates && (typeof value === 'string'||typeof value === 'number')) {
        const next=normalizedDate(String(value));if(next!==String(value)){stats.normalizedDates++;value=next}
      }
      cells.push(value === cell?.v ? cell : {...cell,t:'s',v:value,w:undefined})
    }
    const key=JSON.stringify(cells.map(x=>[x?.t,x?.v,x?.f]))
    if (opts.removeDuplicates && r>range.s.r && seen.has(key)) {stats.removedDuplicates++; continue}
    if (r>range.s.r) seen.add(key)
    cells.forEach((cell,index)=>{if(cell)output[XLSX.utils.encode_cell({r:dest,c:index+range.s.c})]=cell})
    dest++
  }
  output['!ref']=XLSX.utils.encode_range(range.s,{r:dest-1,c:range.e.c})
  return output
}

export default function ExcelProcessorPage() {
  const [fileName, setFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [resultBuffer, setResultBuffer] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const inputRef = useRef<HTMLInputElement>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)

  const handleFileSelect = (f: File) => {
    if (!f.name.match(/\.xlsx?$/i)) {
      setError('Excel 파일(.xlsx, .xls)만 지원합니다.')
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellStyles: true, cellNF: true })
        setWorkbook(wb)
        setFileName(f.name)
        setStats(null)
        setResultBuffer(null)
      } catch {
        setError('파일을 읽을 수 없습니다.')
      }
    }
    reader.readAsArrayBuffer(f)
  }

  const handleProcess = async () => {
    if (!workbook) return
    setProcessing(true)
    setError('')

    try {
      await new Promise(r => setTimeout(r, 50))
      const newStats: Stats = { totalRows: 0, totalCells: 0, trimmedCells: 0, normalizedDates: 0, filledBlanks: 0, removedDuplicates: 0 }

      if (options.removeDuplicates && workbook.SheetNames.some(name => {
        const sheet = workbook.Sheets[name]
        return Boolean(sheet['!merges']?.length) || Object.keys(sheet).some(key => sheet[key]?.f)
      })) throw Error('수식·병합이 있는 파일입니다. 중복 행 제거를 끄면 원래 행 위치를 보존해 저장할 수 있습니다.')
      const resultBook={...workbook,Sheets:{...workbook.Sheets}}
      for (const name of workbook.SheetNames) {
        resultBook.Sheets[name] = processSheet(workbook.Sheets[name], options, newStats)
      }

      const out = XLSX.write(resultBook, { type: 'array', bookType: 'xlsx' }) as Uint8Array
      setResultBuffer(out)
      setStats(newStats)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  const handleDownload = async () => {
    if (!resultBuffer || !window.electron) return
    const outName = fileName.replace(/\.xlsx?$/i, '') + '_처리완료.xlsx'
    await window.electron.saveFileDialog(outName, binaryToNumberArray(resultBuffer))
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="page-title">Excel 데이터 전처리</h1>
        <p className="page-subtitle">엑셀 파일의 공백 제거, 날짜 통일, 결측치 처리, 중복 제거를 자동으로 수행합니다.</p>
      </div>

      {/* Upload area */}
      <div
        className={clsx(
          'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-4',
          dragging ? 'border-violet-400 bg-violet-500/10' :
          workbook ? 'border-violet-500/40 bg-violet-500/5' :
          'border-white/10 hover:border-white/20 hover:bg-white/3'
        )}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f) }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
        {workbook ? (
          <div className="flex flex-col items-center gap-2">
            <FileSpreadsheet size={32} className="text-emerald-400" />
            <p className="text-white font-medium">{fileName}</p>
            <p className="text-xs text-slate-500">시트 {workbook.SheetNames.length}개 · 클릭하여 다른 파일 선택</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Upload size={32} />
            <p className="font-medium">Excel 파일을 드래그하거나 클릭하여 업로드</p>
            <p className="text-xs">.xlsx, .xls 형식 지원</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Options */}
      {workbook && !stats && (
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
            <Settings2 size={15} className="text-violet-400" />
            <h3 className="font-semibold text-white">전처리 옵션</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {OPTIONS.map(opt => (
              <label key={opt.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/3 cursor-pointer hover:bg-white/5 transition-colors">
                <input
                  type="checkbox"
                  checked={options[opt.id]}
                  onChange={e => setOptions(v => ({ ...v, [opt.id]: e.target.checked }))}
                  className="mt-0.5 accent-violet-500"
                />
                <div>
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  <p className="text-xs text-slate-500">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {workbook && !stats && (
        <button
          onClick={handleProcess}
          disabled={processing}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-40 mb-4"
        >
          {processing ? <><Loader2 size={16} className="animate-spin" /> 처리 중...</> : <><FileSpreadsheet size={16} /> 전처리 실행</>}
        </button>
      )}

      {/* Stats */}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="card mb-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
              <CheckCircle2 size={15} className="text-emerald-400" />
              <h3 className="font-semibold text-white">처리 결과</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '총 행 수', value: stats.totalRows, color: 'text-slate-300' },
                { label: '공백 제거', value: stats.trimmedCells, color: 'text-sky-400' },
                { label: '날짜 통일', value: stats.normalizedDates, color: 'text-violet-400' },
                { label: '결측치 처리', value: stats.filledBlanks, color: 'text-amber-400' },
                { label: '중복 제거', value: stats.removedDuplicates, color: 'text-red-400' },
                { label: '총 처리 셀', value: stats.trimmedCells + stats.normalizedDates + stats.filledBlanks, color: 'text-emerald-400' },
              ].map((item, i) => (
                <div key={i} className="p-3 bg-white/3 rounded-xl text-center">
                  <p className={clsx('text-xl font-bold', item.color)}>{item.value.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleDownload}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            <Download size={16} /> 처리된 파일 저장
          </button>
        </motion.div>
      )}
    </div>
  )
}
