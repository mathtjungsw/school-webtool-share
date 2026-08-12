import { useEffect, useState, useCallback } from 'react'
import {
  ClipboardCheck, Users, BarChart2, Settings,
  Plus, Trash2, ChevronLeft, ChevronRight,
  Check, Clock, X, AlertCircle, Download,
  Lock, UserPlus, RefreshCw, CheckSquare,
} from 'lucide-react'
import clsx from 'clsx'
import { format, addDays, subDays, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import { binaryToNumberArray } from '../utils/binaryBytes'

// ─── Types ───────────────────────────────────────────────────────────
interface Student { id: string; name: string; number: number }
interface AttRecord { status: 'present' | 'late' | 'absent'; time: string }
type DayRecords = Record<string, AttRecord>   // studentId → record
type AllRecords = Record<string, DayRecords>  // dateStr   → DayRecords
interface AttSettings {
  adminPin: string
  className: string
  deadlineTime: string
}

const DEFAULT_SETTINGS: AttSettings = {
  adminPin: '0000',
  className: '',
  deadlineTime: '09:00',
}

const STATUS_LABEL: Record<string, string> = { present: '출석', late: '지각', absent: '결석' }
const STATUS_SHORT: Record<string, string> = { present: '출', late: '지', absent: '결' }
const STATUS_COLOR: Record<string, string> = {
  present: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  late:    'bg-amber-500/20  text-amber-300  border-amber-500/30',
  absent:  'bg-red-500/20    text-red-300    border-red-500/30',
}
const STATUS_BTN: Record<string, string> = {
  present: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25',
  late:    'bg-amber-500/15  border-amber-500/30  text-amber-300  hover:bg-amber-500/25',
  absent:  'bg-red-500/15    border-red-500/30    text-red-300    hover:bg-red-500/25',
}

function todayStr() { return format(new Date(), 'yyyy-MM-dd') }
function nowTimeStr() { return format(new Date(), 'HH:mm') }
function genId() { return Math.random().toString(36).slice(2, 10) }

// ─── Main Component ──────────────────────────────────────────────────
export default function AttendancePage() {
  type Tab = 'check' | 'records' | 'stats' | 'settings'
  const [tab, setTab] = useState<Tab>('check')
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [records, setRecords] = useState<AllRecords>({})
  const [settings, setSettings] = useState<AttSettings>(DEFAULT_SETTINGS)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [loading, setLoading] = useState(true)

  // ── Load ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const el = window.electron
    const [s, stu, rec] = await Promise.all([
      el.configGet('att:settings'),
      el.configGet('att:students'),
      el.configGet('att:records'),
    ])
    setSettings((s as AttSettings) ?? DEFAULT_SETTINGS)
    setStudents((stu as Student[]) ?? [])
    setRecords((rec as AllRecords) ?? {})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Persist helpers ────────────────────────────────────────────────
  const saveStudents = async (next: Student[]) => {
    setStudents(next)
    await window.electron.configSet('att:students', next)
  }
  const saveRecords = async (next: AllRecords) => {
    setRecords(next)
    await window.electron.configSet('att:records', next)
  }
  const saveSettings = async (next: AttSettings) => {
    setSettings(next)
    await window.electron.configSet('att:settings', next)
  }

  // ── Mark attendance ────────────────────────────────────────────────
  const mark = async (dateStr: string, studentId: string, status: 'present' | 'late' | 'absent') => {
    const next = { ...records }
    if (!next[dateStr]) next[dateStr] = {}
    const existing = next[dateStr][studentId]
    if (existing?.status === status) {
      // toggle off
      const day = { ...next[dateStr] }
      delete day[studentId]
      next[dateStr] = day
    } else {
      next[dateStr] = { ...next[dateStr], [studentId]: { status, time: nowTimeStr() } }
    }
    await saveRecords(next)
  }

  // ── Export Excel ──────────────────────────────────────────────────
  const exportExcel = () => {
    if (students.length === 0) return
    const dates = Object.keys(records).sort()
    const rows = students
      .sort((a, b) => a.number - b.number)
      .map(s => {
        const row: Record<string, string | number> = { 번호: s.number, 이름: s.name }
        dates.forEach(d => {
          const r = records[d]?.[s.id]
          row[d] = r ? STATUS_LABEL[r.status] : ''
        })
        return row
      })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '출석부')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const name = `출석부_${settings.className || '반'}_${format(new Date(), 'yyyyMMdd')}.xlsx`
    window.electron.saveFileDialog(name, binaryToNumberArray(buf))
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'check',    label: '출석 체크',  icon: <CheckSquare size={14} /> },
    { id: 'records',  label: '출석 현황',  icon: <ClipboardCheck size={14} /> },
    { id: 'stats',    label: '통계',       icon: <BarChart2 size={14} /> },
    { id: 'settings', label: '설정',       icon: <Settings size={14} /> },
  ]

  const sorted = [...students].sort((a, b) => a.number - b.number)

  return (
    <div className="p-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users size={20} className="text-emerald-400" />
            출석체크(연수자명부)
            {settings.className && (
              <span className="text-sm font-normal text-slate-400 ml-1">— {settings.className}</span>
            )}
          </h1>
          <p className="page-subtitle">출석 현황을 날짜별로 기록하고 관리합니다.</p>
        </div>
        <button
          onClick={exportExcel}
          disabled={students.length === 0}
          title="엑셀로 내보내기"
          className="btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-40"
        >
          <Download size={13} /> 엑셀 내보내기
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-surface-800 rounded-xl p-1 border border-white/5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors',
              tab === t.id
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <RefreshCw size={18} className="animate-spin mr-2" /> 불러오는 중…
        </div>
      ) : (
        <>
          {tab === 'check'    && <TabCheck    sorted={sorted} records={records} selectedDate={selectedDate} setSelectedDate={setSelectedDate} settings={settings} mark={mark} />}
          {tab === 'records'  && <TabRecords  sorted={sorted} records={records} selectedDate={selectedDate} setSelectedDate={setSelectedDate} mark={mark} />}
          {tab === 'stats'    && <TabStats    sorted={sorted} records={records} />}
          {tab === 'settings' && <TabSettings students={students} settings={settings} adminUnlocked={adminUnlocked} setAdminUnlocked={setAdminUnlocked} saveStudents={saveStudents} saveSettings={saveSettings} />}
        </>
      )}
    </div>
  )
}

// ─── TabCheck ────────────────────────────────────────────────────────
function TabCheck({
  sorted, records, selectedDate, setSelectedDate, settings, mark
}: {
  sorted: Student[]
  records: AllRecords
  selectedDate: string
  setSelectedDate: (d: string) => void
  settings: AttSettings
  mark: (date: string, studentId: string, status: 'present' | 'late' | 'absent') => void
}) {
  const today = todayStr()
  const dayRec = records[selectedDate] ?? {}

  const counts = { present: 0, late: 0, absent: 0, none: 0 }
  sorted.forEach(s => {
    const r = dayRec[s.id]
    if (r) counts[r.status]++
    else counts.none++
  })

  const markAll = (status: 'present' | 'late' | 'absent') => {
    sorted.forEach(s => mark(selectedDate, s.id, status))
  }

  return (
    <div>
      {/* Date nav */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), -1), 'yyyy-MM-dd'))} className="btn-ghost p-1.5">
            <ChevronLeft size={15} />
          </button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="bg-surface-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          <button onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 1), 'yyyy-MM-dd'))} className="btn-ghost p-1.5">
            <ChevronRight size={15} />
          </button>
          {selectedDate !== today && (
            <button onClick={() => setSelectedDate(today)} className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors">
              오늘로
            </button>
          )}
        </div>
        <div className="text-sm text-slate-400">
          {format(new Date(selectedDate), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
          {selectedDate === today && <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">오늘</span>}
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: '출석', count: counts.present, color: 'emerald', status: 'present' as const },
          { label: '지각', count: counts.late,    color: 'amber',   status: 'late' as const },
          { label: '결석', count: counts.absent,  color: 'red',     status: 'absent' as const },
          { label: '미처리', count: counts.none,  color: 'slate',   status: null },
        ].map(({ label, count, color, status }) => (
          <button key={label} onClick={status ? () => markAll(status) : undefined}
            title={status ? `전체 ${label} 처리` : undefined}
            className={clsx('card text-center py-3 transition-all', status && 'hover:border-emerald-500/30 cursor-pointer', !status && 'cursor-default')}>
            <div className={clsx(
              'text-2xl font-bold',
              color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : color === 'red' ? 'text-red-400' : 'text-slate-500'
            )}>{count}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {label}{status && <span className="text-slate-600 ml-1">(클릭: 전체)</span>}
            </div>
          </button>
        ))}
      </div>

      {/* No students */}
      {sorted.length === 0 && (
        <div className="card border-dashed border-white/10 p-10 text-center">
          <Users size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">등록된 학생이 없습니다.</p>
          <p className="text-sm text-slate-600 mt-1">설정 탭에서 학생을 추가하세요.</p>
        </div>
      )}

      {/* Student list */}
      <div className="space-y-2">
        {sorted.map(s => {
          const rec = dayRec[s.id]
          return (
            <div key={s.id} className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
              rec ? STATUS_COLOR[rec.status].split(' ').map(c => c.startsWith('bg-') ? c : '').join(' ').trim() || 'border-white/5 bg-surface-800'
                : 'border-white/5 bg-surface-800 hover:border-white/10'
            )}>
              <span className="text-xs text-slate-500 w-6 text-right flex-shrink-0">{s.number}</span>
              <span className="flex-1 text-sm font-medium text-slate-200">{s.name}</span>
              {rec && (
                <span className="text-xs text-slate-400">{rec.time}</span>
              )}
              {/* Status buttons */}
              <div className="flex gap-1.5">
                {(['present', 'late', 'absent'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => mark(selectedDate, s.id, st)}
                    className={clsx(
                      'w-14 py-1 rounded-lg text-xs font-medium border transition-all',
                      rec?.status === st
                        ? STATUS_COLOR[st]
                        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    )}
                  >
                    {STATUS_LABEL[st]}
                  </button>
                ))}
                {rec && (
                  <button
                    onClick={() => mark(selectedDate, s.id, rec.status)}
                    title="취소"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── TabRecords ──────────────────────────────────────────────────────
function TabRecords({
  sorted, records, selectedDate, setSelectedDate, mark
}: {
  sorted: Student[]
  records: AllRecords
  selectedDate: string
  setSelectedDate: (d: string) => void
  mark: (date: string, studentId: string, status: 'present' | 'late' | 'absent') => void
}) {
  // Show 14 days ending at selectedDate
  const end = new Date(selectedDate)
  const start = subDays(end, 13)
  const dates = eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'))

  return (
    <div>
      {/* Nav */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 14), 'yyyy-MM-dd'))} className="btn-ghost flex items-center gap-1 text-xs">
          <ChevronLeft size={13} /> 이전 2주
        </button>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          className="bg-surface-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none" />
        <button onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 14), 'yyyy-MM-dd'))} className="btn-ghost flex items-center gap-1 text-xs">
          다음 2주 <ChevronRight size={13} />
        </button>
        <button onClick={() => setSelectedDate(todayStr())} className="btn-ghost text-xs">오늘</button>
      </div>

      {sorted.length === 0 ? (
        <div className="card border-dashed border-white/10 p-10 text-center">
          <p className="text-slate-500">학생을 먼저 등록하세요.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-slate-500 font-medium border-b border-white/10 w-8">번</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium border-b border-white/10 w-20">이름</th>
                {dates.map(d => {
                  const today = d === todayStr()
                  return (
                    <th key={d} className={clsx('text-center px-1 py-2 border-b border-white/10 w-12 cursor-pointer hover:bg-white/5', today && 'text-emerald-400')}>
                      <div className="font-medium">{d.slice(5).replace('-', '/')}</div>
                      <div className="text-slate-600 text-[9px]">
                        {format(new Date(d), 'E', { locale: ko })}
                      </div>
                    </th>
                  )
                })}
                <th className="text-center px-2 py-2 text-slate-500 font-medium border-b border-white/10">출결</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                let p = 0, l = 0, a = 0
                return (
                  <tr key={s.id} className="hover:bg-white/3 border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 text-slate-500">{s.number}</td>
                    <td className="px-3 py-2 text-slate-200 font-medium">{s.name}</td>
                    {dates.map(d => {
                      const rec = records[d]?.[s.id]
                      if (rec?.status === 'present') p++
                      else if (rec?.status === 'late') l++
                      else if (rec?.status === 'absent') a++
                      return (
                        <td key={d} className="px-1 py-2 text-center">
                          {rec ? (
                            <span className={clsx('inline-block w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center border cursor-pointer hover:opacity-80', STATUS_COLOR[rec.status])}
                              onClick={() => mark(d, s.id, rec.status)}
                              title={`${rec.time} (클릭: 취소)`}>
                              {STATUS_SHORT[rec.status]}
                            </span>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {p > 0 && <span className="text-emerald-400 text-[10px]">출{p}</span>}
                        {l > 0 && <span className="text-amber-400  text-[10px]">지{l}</span>}
                        {a > 0 && <span className="text-red-400    text-[10px]">결{a}</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── TabStats ────────────────────────────────────────────────────────
function TabStats({ sorted, records }: { sorted: Student[]; records: AllRecords }) {
  const allDates = Object.keys(records).sort()

  if (sorted.length === 0) {
    return (
      <div className="card border-dashed border-white/10 p-10 text-center">
        <p className="text-slate-500">학생을 먼저 등록하세요.</p>
      </div>
    )
  }

  if (allDates.length === 0) {
    return (
      <div className="card border-dashed border-white/10 p-10 text-center">
        <p className="text-slate-500">출석 기록이 없습니다.</p>
      </div>
    )
  }

  const stats = sorted.map(s => {
    let present = 0, late = 0, absent = 0, total = 0
    allDates.forEach(d => {
      const r = records[d][s.id]
      if (!r) return
      total++
      if (r.status === 'present') present++
      else if (r.status === 'late') late++
      else absent++
    })
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : null
    return { s, present, late, absent, total, rate }
  })

  const totalDays = allDates.length
  const overallPresent = stats.reduce((acc, s) => acc + s.present, 0)
  const overallLate    = stats.reduce((acc, s) => acc + s.late, 0)
  const overallAbsent  = stats.reduce((acc, s) => acc + s.absent, 0)
  const overallTotal   = sorted.length * totalDays

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">전체 통계 ({totalDays}일 기준)</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: '출석', count: overallPresent, color: 'text-emerald-400' },
            { label: '지각', count: overallLate,    color: 'text-amber-400'  },
            { label: '결석', count: overallAbsent,  color: 'text-red-400'    },
          ].map(({ label, count, color }) => (
            <div key={label} className="text-center">
              <div className={clsx('text-2xl font-bold', color)}>{count}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        <BarRow
          label="전체 출석률"
          present={overallPresent}
          late={overallLate}
          absent={overallAbsent}
          total={overallTotal}
        />
      </div>

      {/* Per-student */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">학생별 출석률</h3>
        <div className="space-y-3">
          {stats.map(({ s, present, late, absent, total, rate }) => (
            <div key={s.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-200">
                  <span className="text-slate-500 text-xs mr-2">{s.number}번</span>
                  {s.name}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-400">출{present}</span>
                  <span className="text-amber-400">지{late}</span>
                  <span className="text-red-400">결{absent}</span>
                  <span className={clsx('font-bold w-12 text-right', rate !== null && rate >= 90 ? 'text-emerald-400' : rate !== null && rate >= 80 ? 'text-amber-400' : 'text-red-400')}>
                    {rate !== null ? `${rate}%` : '—'}
                  </span>
                </div>
              </div>
              {total > 0 && (
                <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
                  <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(present / total) * 100}%` }} />
                  <div className="bg-amber-500  h-full transition-all" style={{ width: `${(late    / total) * 100}%` }} />
                  <div className="bg-red-500    h-full transition-all" style={{ width: `${(absent  / total) * 100}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BarRow({ label, present, late, absent, total }: { label: string; present: number; late: number; absent: number; total: number }) {
  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={clsx('font-bold', rate >= 90 ? 'text-emerald-400' : rate >= 80 ? 'text-amber-400' : 'text-red-400')}>{rate}%</span>
      </div>
      <div className="h-3 rounded-full bg-white/5 overflow-hidden flex">
        <div className="bg-emerald-500 h-full" style={{ width: `${(present / total) * 100}%` }} />
        <div className="bg-amber-500  h-full" style={{ width: `${(late    / total) * 100}%` }} />
        <div className="bg-red-500    h-full" style={{ width: `${(absent  / total) * 100}%` }} />
      </div>
      <div className="flex gap-3 text-[10px] mt-1">
        <span className="text-emerald-400">■ 출석 {present}</span>
        <span className="text-amber-400">■ 지각 {late}</span>
        <span className="text-red-400">■ 결석 {absent}</span>
      </div>
    </div>
  )
}

// ─── TabSettings ─────────────────────────────────────────────────────
function TabSettings({
  students, settings, adminUnlocked, setAdminUnlocked, saveStudents, saveSettings
}: {
  students: Student[]
  settings: AttSettings
  adminUnlocked: boolean
  setAdminUnlocked: (v: boolean) => void
  saveStudents: (s: Student[]) => void
  saveSettings: (s: AttSettings) => void
}) {
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [newName, setNewName] = useState('')
  const [newNum, setNewNum] = useState('')
  const [bulkInput, setBulkInput] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [pinMsg, setPinMsg] = useState('')

  const tryUnlock = () => {
    if (pinInput === settings.adminPin) {
      setAdminUnlocked(true)
      setPinInput('')
      setPinError('')
    } else {
      setPinError('PIN이 올바르지 않습니다.')
    }
  }

  const addStudent = () => {
    const name = newName.trim()
    const num = parseInt(newNum)
    if (!name || isNaN(num)) return
    const updated = [...students, { id: genId(), name, number: num }]
    saveStudents(updated)
    setNewName('')
    setNewNum('')
  }

  const deleteStudent = (id: string) => {
    saveStudents(students.filter(s => s.id !== id))
  }

  const addBulk = () => {
    const lines = bulkInput.trim().split('\n').map(l => l.trim()).filter(Boolean)
    const added: Student[] = []
    lines.forEach(line => {
      const parts = line.split(/\s+|,/)
      if (parts.length >= 2) {
        const num = parseInt(parts[0])
        const name = parts.slice(1).join('')
        if (!isNaN(num) && name) {
          added.push({ id: genId(), name, number: num })
        }
      } else if (parts.length === 1 && parts[0]) {
        added.push({ id: genId(), name: parts[0], number: students.length + added.length + 1 })
      }
    })
    saveStudents([...students, ...added])
    setBulkInput('')
    setBulkMode(false)
  }

  const changePin = () => {
    if (newPin.length < 4) { setPinMsg('PIN은 4자리 이상이어야 합니다.'); return }
    if (newPin !== newPin2) { setPinMsg('PIN이 일치하지 않습니다.'); return }
    saveSettings({ ...settings, adminPin: newPin })
    setNewPin('')
    setNewPin2('')
    setPinMsg('PIN이 변경되었습니다.')
    setTimeout(() => setPinMsg(''), 2000)
  }

  const sorted = [...students].sort((a, b) => a.number - b.number)

  if (!adminUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="card w-full max-w-sm text-center">
          <Lock size={32} className="text-slate-500 mx-auto mb-4" />
          <h3 className="text-white font-semibold mb-1">관리자 확인</h3>
          <p className="text-sm text-slate-400 mb-5">설정을 변경하려면 PIN을 입력하세요.</p>
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN 입력"
            value={pinInput}
            onChange={e => { setPinInput(e.target.value); setPinError('') }}
            onKeyDown={e => e.key === 'Enter' && tryUnlock()}
            className="input mb-3 text-center tracking-widest text-lg"
          />
          {pinError && <p className="text-red-400 text-xs mb-3">{pinError}</p>}
          <button onClick={tryUnlock} className="btn-primary w-full">확인</button>
          <p className="text-xs text-slate-600 mt-3">기본 PIN: 0000</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Class name + deadline */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Settings size={14} /> 기본 설정
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">반 이름</label>
            <input
              type="text"
              placeholder="예) 1학년 2반"
              value={settings.className}
              onChange={e => saveSettings({ ...settings, className: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="field-label">지각 기준 시간</label>
            <input
              type="time"
              value={settings.deadlineTime}
              onChange={e => saveSettings({ ...settings, deadlineTime: e.target.value })}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* PIN change */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Lock size={14} /> PIN 변경
        </h3>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="field-label">새 PIN</label>
            <input type="password" inputMode="numeric" placeholder="새 PIN" value={newPin} onChange={e => setNewPin(e.target.value)} className="input" />
          </div>
          <div>
            <label className="field-label">새 PIN 확인</label>
            <input type="password" inputMode="numeric" placeholder="확인" value={newPin2} onChange={e => setNewPin2(e.target.value)} className="input" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={changePin} className="btn-secondary text-sm">PIN 변경</button>
          {pinMsg && <span className={clsx('text-xs', pinMsg.includes('변경') ? 'text-emerald-400' : 'text-red-400')}>{pinMsg}</span>}
        </div>
      </div>

      {/* Student management */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <UserPlus size={14} /> 학생 관리
            <span className="text-slate-500 font-normal">({students.length}명)</span>
          </h3>
          <button
            onClick={() => setBulkMode(v => !v)}
            className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
          >
            {bulkMode ? '개별 입력' : '일괄 입력'}
          </button>
        </div>

        {bulkMode ? (
          <div className="mb-4">
            <label className="field-label">한 줄에 "번호 이름" 형식으로 입력 (예: 1 홍길동)</label>
            <textarea
              rows={6}
              placeholder={'1 홍길동\n2 김철수\n3 이영희'}
              value={bulkInput}
              onChange={e => setBulkInput(e.target.value)}
              className="input font-mono text-sm resize-none"
            />
            <button onClick={addBulk} className="btn-primary mt-2 text-sm">일괄 추가</button>
          </div>
        ) : (
          <div className="flex gap-2 mb-4">
            <input
              type="number"
              placeholder="번호"
              value={newNum}
              onChange={e => setNewNum(e.target.value)}
              className="input w-24"
            />
            <input
              type="text"
              placeholder="이름"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addStudent()}
              className="input flex-1"
            />
            <button onClick={addStudent} className="btn-primary flex items-center gap-1.5">
              <Plus size={14} /> 추가
            </button>
          </div>
        )}

        {/* Student list */}
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-4">등록된 학생이 없습니다.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {sorted.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg border border-white/5">
                <span className="text-xs text-slate-500 w-6 text-right">{s.number}</span>
                <span className="flex-1 text-sm text-slate-200">{s.name}</span>
                <button onClick={() => deleteStudent(s.id)} className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setAdminUnlocked(false)}
          className="btn-ghost flex items-center gap-1.5 text-sm text-slate-500"
        >
          <Lock size={13} /> 잠금
        </button>
      </div>
    </div>
  )
}
