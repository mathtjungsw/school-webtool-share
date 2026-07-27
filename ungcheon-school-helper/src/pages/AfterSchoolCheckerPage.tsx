import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Clock, Upload, FileSpreadsheet, AlertCircle,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'

// ── 타입 ──────────────────────────────────────────────────────────────
interface AfterSchoolRecord {
  teacherName: string
  date: string       // YYYY-MM-DD
  startTime: string  // HH:mm
  endTime: string    // HH:mm
  programName: string
}

type WorkCategory = '연가'|'병가'|'조퇴'|'외출'|'출장'|'공가'|'특별휴가'|'기타'

interface WorkStatusRecord {
  teacherName: string
  date: string
  category: WorkCategory
  startTime?: string
  endTime?: string
  isFullDay: boolean
}

interface OvertimeRecord {
  teacherName: string
  date: string
  startTime: string
  endTime: string
}

type CollisionRuleType =
  | 'afterschool-vs-leave'
  | 'afterschool-vs-early'
  | 'afterschool-vs-trip'
  | 'afterschool-vs-overtime'

interface CollisionResult {
  id: string
  severity: 'error' | 'warning'
  teacherName: string
  date: string
  message: string
  sourceA: string
  sourceB: string
  ruleType: CollisionRuleType
}

interface UploadState {
  file: File | null
  status: 'idle' | 'parsing' | 'success' | 'error'
  recordCount: number
  errorMessage?: string
}

// ── Excel 파서 ────────────────────────────────────────────────────────
function normalizeTime(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const str = String(value).trim()
  if (/^\d{1,2}:\d{2}$/.test(str)) { const [h, m] = str.split(':'); return `${h.padStart(2,'0')}:${m}` }
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) { const [h, m] = str.split(':'); return `${h.padStart(2,'0')}:${m}` }
  const num = Number(str)
  if (!isNaN(num) && num >= 0 && num < 1) {
    const mins = Math.round(num * 24 * 60)
    return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`
  }
  if (/^\d{3,4}$/.test(str)) { const p = str.padStart(4,'0'); return `${p.slice(0,2)}:${p.slice(2,4)}` }
  return undefined
}

function normalizeDate(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  const str = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const m1 = str.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/)
  if (m1) return `${m1[1]}-${m1[2].padStart(2,'0')}-${m1[3].padStart(2,'0')}`
  return undefined
}

function normHeader(h: string) { return String(h).replace(/[\s\n\r]/g,'').toLowerCase() }

function findCol(headers: string[], ...kws: string[]): number {
  const nh = headers.map(normHeader)
  for (const kw of kws) { const i = nh.findIndex(h => h.includes(kw)); if (i !== -1) return i }
  return -1
}

function parseAfterSchool(buf: ArrayBuffer): AfterSchoolRecord[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header:1, raw:true })
  if (rows.length < 2) return []
  const headers = (rows[0] as string[]).map(String)
  const tIdx = findCol(headers,'교사','성명','이름','교사명')
  const dIdx = findCol(headers,'일자','날짜','일시','date')
  const sIdx = findCol(headers,'시작시간','시작','시작시각','start')
  const eIdx = findCol(headers,'종료시간','종료','종료시각','end')
  const pIdx = findCol(headers,'프로그램','과목','프로그램명','program')
  if (dIdx===-1||sIdx===-1||eIdx===-1) throw new Error('필수 열(일자, 시작시간, 종료시간)을 찾을 수 없습니다.')
  return (rows.slice(1) as unknown[][]).flatMap(row => {
    const date = normalizeDate(row[dIdx])
    const startTime = normalizeTime(row[sIdx])
    const endTime = normalizeTime(row[eIdx])
    if (!date||!startTime||!endTime) return []
    return [{ teacherName: tIdx!==-1?String(row[tIdx]||'미지정'):'미지정', date, startTime, endTime, programName: pIdx!==-1?String(row[pIdx]||'미지정'):'미지정' }]
  })
}

const FULL_DAY: WorkCategory[] = ['연가','병가','공가','특별휴가']
function categorize(raw: string): WorkCategory {
  const s = raw.trim()
  if (s.includes('연가')) return '연가'; if (s.includes('병가')) return '병가'
  if (s.includes('조퇴')) return '조퇴'; if (s.includes('외출')) return '외출'
  if (s.includes('출장')) return '출장'; if (s.includes('공가')) return '공가'
  if (s.includes('특별')) return '특별휴가'; return '기타'
}

function parseWorkStatus(buf: ArrayBuffer): WorkStatusRecord[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header:1, raw:true })
  if (rows.length < 2) return []
  const headers = (rows[0] as string[]).map(String)
  const tIdx = findCol(headers,'교사','성명','이름','교사명','대상자')
  const dIdx = findCol(headers,'일자','날짜','시작일','복무일','date')
  const cIdx = findCol(headers,'구분','유형','종류','복무구분','근무상황','category')
  const sIdx = findCol(headers,'시작시간','시작','시작시각','start')
  const eIdx = findCol(headers,'종료시간','종료','종료시각','end')
  if (dIdx===-1||cIdx===-1) throw new Error('필수 열(일자, 구분)을 찾을 수 없습니다.')
  return (rows.slice(1) as unknown[][]).flatMap(row => {
    const date = normalizeDate(row[dIdx])
    const rawCat = row[cIdx]
    if (!date||!rawCat) return []
    const category = categorize(String(rawCat))
    const startTime = sIdx!==-1 ? normalizeTime(row[sIdx]) : undefined
    const endTime = eIdx!==-1 ? normalizeTime(row[eIdx]) : undefined
    return [{ teacherName: tIdx!==-1?String(row[tIdx]||'미지정'):'미지정', date, category, startTime, endTime, isFullDay: FULL_DAY.includes(category)||(!startTime&&!endTime) }]
  })
}

function parseOvertime(buf: ArrayBuffer): OvertimeRecord[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header:1, raw:true })
  if (rows.length < 2) return []
  const headers = (rows[0] as string[]).map(String)
  const tIdx = findCol(headers,'교사','성명','이름','교사명','대상자')
  const dIdx = findCol(headers,'일자','날짜','근무일','date')
  const sIdx = findCol(headers,'시작시간','시작','시작시각','start')
  const eIdx = findCol(headers,'종료시간','종료','종료시각','end')
  if (dIdx===-1||sIdx===-1||eIdx===-1) throw new Error('필수 열(일자, 시작시간, 종료시간)을 찾을 수 없습니다.')
  return (rows.slice(1) as unknown[][]).flatMap(row => {
    const date = normalizeDate(row[dIdx]); const startTime = normalizeTime(row[sIdx]); const endTime = normalizeTime(row[eIdx])
    if (!date||!startTime||!endTime) return []
    return [{ teacherName: tIdx!==-1?String(row[tIdx]||'미지정'):'미지정', date, startTime, endTime }]
  })
}

// ── 충돌 감지 엔진 ────────────────────────────────────────────────────
function toMin(t: string) { const [h,m] = t.split(':').map(Number); return h*60+m }
function overlap(sA:string,eA:string,sB:string,eB:string) { return toMin(sA)<toMin(eB)&&toMin(sB)<toMin(eA) }

let colId = 0
function col(sev:'error'|'warning',teacher:string,date:string,msg:string,srcA:string,srcB:string,rule:CollisionRuleType): CollisionResult {
  return { id:`c-${++colId}`, severity:sev, teacherName:teacher, date, message:msg, sourceA:srcA, sourceB:srcB, ruleType:rule }
}

function detectCollisions(afterSchool:AfterSchoolRecord[], workStatus:WorkStatusRecord[], overtime:OvertimeRecord[]): CollisionResult[] {
  colId = 0
  const results: CollisionResult[] = []
  for (const as of afterSchool) {
    const asStr = `${as.startTime}~${as.endTime}`
    for (const ws of workStatus) {
      if (as.teacherName!==ws.teacherName||as.date!==ws.date) continue
      if (['연가','병가','공가','특별휴가'].includes(ws.category)) {
        results.push(col('error',as.teacherName,as.date,`${ws.category} 당일은 방과후 지도가 불가합니다.`,`방과후 지도 ${asStr} (${as.programName})`,`${ws.category} (종일)`,'afterschool-vs-leave'))
      } else if (ws.category==='출장') {
        if (ws.startTime&&ws.endTime&&overlap(as.startTime,as.endTime,ws.startTime,ws.endTime))
          results.push(col('error',as.teacherName,as.date,'출장 시간과 방과후 지도 시간이 겹칩니다.',`방과후 지도 ${asStr} (${as.programName})`,`출장 ${ws.startTime}~${ws.endTime}`,'afterschool-vs-trip'))
        else if (ws.isFullDay)
          results.push(col('error',as.teacherName,as.date,'출장 당일은 방과후 지도가 불가합니다.',`방과후 지도 ${asStr} (${as.programName})`,'출장 (종일)','afterschool-vs-trip'))
      } else if (ws.category==='조퇴'||ws.category==='외출') {
        const wsEnd = ws.endTime ?? '23:59'
        if (ws.startTime&&overlap(as.startTime,as.endTime,ws.startTime,wsEnd))
          results.push(col('error',as.teacherName,as.date,`${ws.category} 시간과 방과후 지도 시간이 겹칩니다.`,`방과후 지도 ${asStr} (${as.programName})`,`${ws.category} ${ws.startTime}~${ws.endTime??''}`,'afterschool-vs-early'))
      }
    }
    for (const ot of overtime) {
      if (as.teacherName!==ot.teacherName||as.date!==ot.date) continue
      if (overlap(as.startTime,as.endTime,ot.startTime,ot.endTime))
        results.push(col('error',as.teacherName,as.date,'초과근무 시간과 방과후 지도 시간이 겹칩니다.',`방과후 지도 ${asStr} (${as.programName})`,`초과근무 ${ot.startTime}~${ot.endTime}`,'afterschool-vs-overtime'))
    }
  }
  results.sort((a,b) => a.date.localeCompare(b.date)||a.teacherName.localeCompare(b.teacherName))
  return results
}

// ── 파일 업로드 카드 ──────────────────────────────────────────────────
interface UploadCardProps {
  title: string
  description: string
  color: string
  state: UploadState
  onFile: (file: File) => void
  onClear: () => void
}

function UploadCard({ title, description, color, state, onFile, onClear }: UploadCardProps) {
  const ref = useRef<HTMLInputElement>(null)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }
  return (
    <div
      onDrop={onDrop}
      onDragOver={e => e.preventDefault()}
      className={clsx(
        'border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[130px] transition-colors cursor-pointer',
        state.status === 'success' ? 'border-emerald-500/40 bg-emerald-500/5' :
        state.status === 'error'   ? 'border-rose-500/40 bg-rose-500/5' :
        'border-white/10 hover:border-white/20 bg-white/2'
      )}
      onClick={() => ref.current?.click()}
    >
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />

      {state.status === 'idle' && (
        <>
          <FileSpreadsheet size={24} className="text-slate-600" />
          <p className="text-sm font-medium text-slate-300">{title}</p>
          <p className="text-xs text-slate-600 text-center">{description}</p>
          <p className="text-[10px] text-slate-700">클릭하거나 파일을 끌어다 놓으세요</p>
        </>
      )}
      {state.status === 'parsing' && (
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">분석 중...</p>
        </div>
      )}
      {state.status === 'success' && (
        <div className="flex flex-col items-center gap-1.5 w-full">
          <CheckCircle2 size={20} className="text-emerald-400" />
          <p className="text-sm font-medium text-white truncate max-w-full">{state.file?.name}</p>
          <p className="text-xs text-emerald-400">{state.recordCount}건 로드됨</p>
          <button onClick={e => { e.stopPropagation(); onClear() }}
            className="mt-1 text-[10px] text-slate-500 hover:text-rose-400 transition-colors">
            × 초기화
          </button>
        </div>
      )}
      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-1.5">
          <XCircle size={20} className="text-rose-400" />
          <p className="text-xs text-rose-400 text-center">{state.errorMessage}</p>
          <button onClick={e => { e.stopPropagation(); onClear() }}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">다시 시도</button>
        </div>
      )}
    </div>
  )
}

const IDLE: UploadState = { file: null, status: 'idle', recordCount: 0 }

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────
export default function AfterSchoolCheckerPage() {
  const [asState, setAsState] = useState<UploadState>(IDLE)
  const [wsState, setWsState] = useState<UploadState>(IDLE)
  const [otState, setOtState] = useState<UploadState>(IDLE)

  const [afterSchool, setAfterSchool]   = useState<AfterSchoolRecord[]>([])
  const [workStatus, setWorkStatus]     = useState<WorkStatusRecord[]>([])
  const [overtime, setOvertime]         = useState<OvertimeRecord[]>([])
  const [collisions, setCollisions]     = useState<CollisionResult[]>([])
  const [checked, setChecked]           = useState(false)
  const [expandedId, setExpandedId]     = useState<string|null>(null)

  const readFile = useCallback((file: File): Promise<ArrayBuffer> =>
    new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = e => res(e.target?.result as ArrayBuffer)
      r.onerror = () => rej(new Error('파일 읽기 실패'))
      r.readAsArrayBuffer(file)
    }), [])

  const handleAfterSchool = async (file: File) => {
    setAsState({ file, status: 'parsing', recordCount: 0 })
    try {
      const buf = await readFile(file)
      const records = parseAfterSchool(buf)
      setAfterSchool(records)
      setAsState({ file, status: 'success', recordCount: records.length })
    } catch (e) {
      setAsState({ file, status: 'error', recordCount: 0, errorMessage: (e as Error).message })
    }
    setChecked(false)
  }

  const handleWorkStatus = async (file: File) => {
    setWsState({ file, status: 'parsing', recordCount: 0 })
    try {
      const buf = await readFile(file)
      const records = parseWorkStatus(buf)
      setWorkStatus(records)
      setWsState({ file, status: 'success', recordCount: records.length })
    } catch (e) {
      setWsState({ file, status: 'error', recordCount: 0, errorMessage: (e as Error).message })
    }
    setChecked(false)
  }

  const handleOvertime = async (file: File) => {
    setOtState({ file, status: 'parsing', recordCount: 0 })
    try {
      const buf = await readFile(file)
      const records = parseOvertime(buf)
      setOvertime(records)
      setOtState({ file, status: 'success', recordCount: records.length })
    } catch (e) {
      setOtState({ file, status: 'error', recordCount: 0, errorMessage: (e as Error).message })
    }
    setChecked(false)
  }

  const runCheck = () => {
    if (afterSchool.length === 0) return
    const results = detectCollisions(afterSchool, workStatus, overtime)
    setCollisions(results)
    setChecked(true)
  }

  const reset = () => {
    setAsState(IDLE); setWsState(IDLE); setOtState(IDLE)
    setAfterSchool([]); setWorkStatus([]); setOvertime([])
    setCollisions([]); setChecked(false)
  }

  const errors   = collisions.filter(c => c.severity === 'error')
  const warnings = collisions.filter(c => c.severity === 'warning')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 pt-5 pb-4 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Clock size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">방과후 점검</h1>
            <p className="text-xs text-slate-500 mt-0.5">방과후 지도·근무상황·초과근무 간 시간 충돌을 자동으로 감지합니다</p>
          </div>
          <button onClick={reset} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors">
            <RefreshCw size={12} /> 초기화
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* 파일 업로드 */}
          <div className="grid grid-cols-3 gap-4">
            <UploadCard
              title="방과후 지도" color="violet"
              description="교사명, 일자, 시작시간, 종료시간, 프로그램명"
              state={asState}
              onFile={handleAfterSchool}
              onClear={() => { setAsState(IDLE); setAfterSchool([]); setChecked(false) }}
            />
            <UploadCard
              title="근무상황 목록" color="sky"
              description="교사명, 일자, 구분(연가/병가/조퇴 등), 시작·종료시간"
              state={wsState}
              onFile={handleWorkStatus}
              onClear={() => { setWsState(IDLE); setWorkStatus([]); setChecked(false) }}
            />
            <UploadCard
              title="초과근무 내역" color="emerald"
              description="교사명, 일자, 시작시간, 종료시간"
              state={otState}
              onFile={handleOvertime}
              onClear={() => { setOtState(IDLE); setOvertime([]); setChecked(false) }}
            />
          </div>

          {/* 점검 버튼 */}
          <div className="flex justify-center">
            <button
              onClick={runCheck}
              disabled={asState.status !== 'success'}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-amber-600/20"
            >
              <AlertCircle size={15} />
              충돌 점검 실행
            </button>
          </div>

          {/* 결과 */}
          {checked && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              {/* 요약 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-800/60 rounded-xl p-4 border border-white/5 text-center">
                  <p className="text-2xl font-bold text-white">{afterSchool.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">방과후 지도 건수</p>
                </div>
                <div className={clsx('rounded-xl p-4 border text-center', errors.length > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-surface-800/60 border-white/5')}>
                  <p className={clsx('text-2xl font-bold', errors.length > 0 ? 'text-rose-400' : 'text-white')}>{errors.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">오류 (충돌)</p>
                </div>
                <div className={clsx('rounded-xl p-4 border text-center', collisions.length === 0 && checked ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-surface-800/60 border-white/5')}>
                  {collisions.length === 0 ? (
                    <>
                      <CheckCircle2 size={24} className="text-emerald-400 mx-auto" />
                      <p className="text-xs text-emerald-400 mt-1 font-semibold">충돌 없음</p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-amber-400">{warnings.length}</p>
                      <p className="text-xs text-slate-500 mt-0.5">경고</p>
                    </>
                  )}
                </div>
              </div>

              {/* 충돌 목록 */}
              {collisions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-300">충돌 상세 내역</h3>
                  {collisions.map(c => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={clsx(
                        'rounded-xl border p-3 cursor-pointer',
                        c.severity === 'error'
                          ? 'bg-rose-500/8 border-rose-500/20'
                          : 'bg-amber-500/8 border-amber-500/20'
                      )}
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          {c.severity === 'error'
                            ? <XCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                            : <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                          }
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-white">{c.teacherName}</span>
                              <span className="text-xs text-slate-500">{c.date}</span>
                            </div>
                            <p className="text-xs text-slate-300 mt-0.5">{c.message}</p>
                          </div>
                        </div>
                        {expandedId === c.id
                          ? <ChevronUp size={14} className="text-slate-500 flex-shrink-0" />
                          : <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
                        }
                      </div>
                      {expandedId === c.id && (
                        <div className="mt-2 pl-5 space-y-1 text-xs text-slate-400">
                          <p><span className="text-slate-600">A:</span> {c.sourceA}</p>
                          <p><span className="text-slate-600">B:</span> {c.sourceB}</p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
