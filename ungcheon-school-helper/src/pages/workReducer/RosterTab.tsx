// 업무경감 도우미 — 명렬표 출력 탭
import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import type { WRData, Student, Teacher } from '../../services/workReducer/types'
import { EmptyHint, Selector } from './shared'

const gradesOf = (s: Student[]) => [...new Set(s.map((x) => x.grade))].sort((a, b) => a - b)
const classesOf = (s: Student[], g: number) => [...new Set(s.filter((x) => x.grade === g).map((x) => x.classNo))].sort((a, b) => a - b)
const homeroomTeacher = (ts: Teacher[], g: number, c: number) => ts.find((t) => t.homeroomGrade === g && t.homeroomClass === c)?.name ?? ''

function exportXlsx(aoa: (string | number)[][], sheet: string, file: string) {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  window.electron?.saveFileDialog(file, Array.from(new Uint8Array(out)))
}

export default function RosterTab({ data }: { data: WRData }) {
  const [tool, setTool] = useState<'single' | 'grade'>('single')
  if (data.students.length === 0) return <EmptyHint msg="먼저 [데이터] 탭에서 명렬표를 가져오세요." />
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['single', '학급 명렬표'], ['grade', '학년 단표']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTool(id)}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border', tool === id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/3 border-white/10 text-slate-400')}>
            {label}
          </button>
        ))}
      </div>
      {tool === 'single' ? <RosterSingle data={data} /> : <RosterGrade data={data} />}
    </div>
  )
}

function RosterSingle({ data }: { data: WRData }) {
  const grades = gradesOf(data.students)
  const [grade, setGrade] = useState(grades[0] ?? 1)
  const classes = classesOf(data.students, grade)
  const [cls, setCls] = useState(classes[0] ?? 1)
  const list = useMemo(
    () => data.students.filter((s) => s.grade === grade && s.classNo === cls).sort((a, b) => a.num - b.num),
    [data.students, grade, cls],
  )
  const teacher = homeroomTeacher(data.teachers, grade, cls)
  const pickGrade = (g: number) => { setGrade(g); setCls(classesOf(data.students, g)[0] ?? 1) }
  const doExport = () => exportXlsx(
    [['번호', '성명', '학번'], ...list.map((s) => [s.num, s.name, s.sid])],
    `${grade}-${cls}`, `명렬표_${grade}학년${cls}반.xlsx`,
  )

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3 no-print flex-wrap">
        <Selector label="학년" value={grade} options={grades} onChange={pickGrade} suffix="학년" />
        <Selector label="반" value={cls} options={classes} onChange={setCls} suffix="반" />
        <div className="ml-auto flex gap-1.5">
          <button onClick={doExport} className="btn-ghost text-xs flex items-center gap-1"><Download size={12} />엑셀</button>
          <button onClick={() => window.print()} className="btn-ghost text-xs flex items-center gap-1"><Printer size={12} />인쇄</button>
        </div>
      </div>
      <div className="print-area">
        <h3 className="text-center font-bold text-white text-base mb-0.5">{data.school || '학교'} {grade}학년 {cls}반 명렬표</h3>
        <p className="text-center text-xs text-slate-400 mb-2">담임: {teacher || '—'} · 총 {list.length}명</p>
        <table className="w-full border-collapse text-sm mx-auto" style={{ maxWidth: 380 }}>
          <thead><tr><th className="border border-white/15 bg-white/5 py-1 w-16">번호</th><th className="border border-white/15 bg-white/5 py-1">성명</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.sid || `${s.num}`}>
                <td className="border border-white/15 text-center py-1">{s.num}</td>
                <td className="border border-white/15 text-center py-1">{s.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RosterGrade({ data }: { data: WRData }) {
  const grades = gradesOf(data.students)
  const [grade, setGrade] = useState(grades[0] ?? 1)
  const classes = classesOf(data.students, grade)
  const maxNum = useMemo(
    () => data.students.filter((s) => s.grade === grade).reduce((m, s) => Math.max(m, s.num), 0),
    [data.students, grade],
  )
  const cell = (c: number, num: number) => data.students.find((s) => s.grade === grade && s.classNo === c && s.num === num)?.name ?? ''
  const doExport = () => {
    const header = ['번호', ...classes.map((c) => `${grade}-${c}`)]
    const damim = ['담임', ...classes.map((c) => homeroomTeacher(data.teachers, grade, c))]
    const body = Array.from({ length: maxNum }, (_, i) => [i + 1, ...classes.map((c) => cell(c, i + 1))])
    exportXlsx([header, damim, ...body], `${grade}학년`, `단표_${grade}학년.xlsx`)
  }

  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center gap-2 mb-3 no-print flex-wrap">
        <Selector label="학년" value={grade} options={grades} onChange={setGrade} suffix="학년" />
        <div className="ml-auto flex gap-1.5">
          <button onClick={doExport} className="btn-ghost text-xs flex items-center gap-1"><Download size={12} />엑셀</button>
          <button onClick={() => window.print()} className="btn-ghost text-xs flex items-center gap-1"><Printer size={12} />인쇄</button>
        </div>
      </div>
      <div className="print-area">
        <h3 className="text-center font-bold text-white text-base mb-2">{data.school || '학교'} {grade}학년 학생명렬표(단표)</h3>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-white/15 bg-white/5 py-1 w-10">번호</th>
              {classes.map((c) => <th key={c} className="border border-white/15 bg-white/5 py-1">{grade}-{c}</th>)}
            </tr>
            <tr>
              <td className="border border-white/15 bg-white/5 text-center py-0.5 text-[10px] text-slate-400">담임</td>
              {classes.map((c) => <td key={c} className="border border-white/15 text-center py-0.5 text-[10px] text-slate-400">{homeroomTeacher(data.teachers, grade, c) || '—'}</td>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxNum }, (_, i) => (
              <tr key={i}>
                <td className="border border-white/15 bg-white/5 text-center py-1 font-semibold">{i + 1}</td>
                {classes.map((c) => <td key={c} className="border border-white/15 text-center py-1">{cell(c, i + 1)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
