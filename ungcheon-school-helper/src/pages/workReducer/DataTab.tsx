// 업무경감 도우미 — 데이터 탭 (명렬표·교직원부·시간표 가져오기)
import { useState } from 'react'
import { Upload, ClipboardPaste, Trash2, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import type { WRData } from '../../services/workReducer/types'
import { parseClipboard, parseXlsx, parseStudents, parseTeachers, parseTimetable } from '../../services/workReducer/parse'
import { saveStudents, saveTeachers, saveTimetable, saveSets } from '../../services/workReducer/store'

export default function DataTab({ data, update }: { data: WRData; update: (p: Partial<WRData>) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <ImportCard
        title="명렬표" desc="학년·반·번호·학번·이름" count={data.students.length} unit="명"
        onImport={(rows) => {
          const students = parseStudents(rows)
          update({ students })
          saveStudents(students)
        }}
        onClear={() => { update({ students: [] }); saveStudents([]) }}
        sample="1	1	1	1101	김학례"
      />
      <ImportCard
        title="교직원부" desc="성명·담임(학년/반)" count={data.teachers.length} unit="명"
        onImport={(rows) => {
          const teachers = parseTeachers(rows)
          update({ teachers })
          saveTeachers(teachers)
        }}
        onClear={() => { update({ teachers: [] }); saveTeachers([]) }}
        sample="4	웅천고	김교사	3	5"
      />
      <ImportCard
        title="시간표" desc="교사·요일·교시·학년·반·과목" count={data.timetable.length} unit="행"
        onImport={(rows) => {
          const timetable = parseTimetable(rows)
          update({ timetable })
          saveTimetable(timetable)
        }}
        onClear={() => { update({ timetable: [], sets: [] }); saveTimetable([]); saveSets([]) }}
        sample="1	김학례	월1	..	월	1	3	4	확률과 통계"
      />
    </div>
  )
}

function ImportCard({ title, desc, count, unit, onImport, onClear, sample }: {
  title: string; desc: string; count: number; unit: string
  onImport: (rows: string[][]) => void; onClear: () => void; sample: string
}) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')

  const importText = () => {
    const rows = parseClipboard(text)
    if (rows.length === 0) { setMsg('붙여넣은 데이터가 없습니다.'); return }
    onImport(rows)
    setText('')
    setMsg(`가져오기 완료 (${rows.length}행 처리)`)
  }

  const importFile = async () => {
    const path = await window.electron?.openFileDialog([{ name: '엑셀', extensions: ['xlsx', 'xls'] }])
    if (!path || !window.electron) return
    const bytes = await window.electron.readFile(path)
    const rows = parseXlsx(new Uint8Array(bytes))
    onImport(rows)
    setMsg(`엑셀 가져오기 완료 (${rows.length}행)`)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-white text-sm">{title}</h3>
        <span className={clsx('text-xs', count > 0 ? 'text-emerald-400' : 'text-slate-600')}>{count}{unit}</span>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">{desc}</p>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)}
        placeholder={`엑셀에서 복사해 붙여넣기\n예) ${sample}`}
        className="w-full h-24 bg-surface-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200 resize-none focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
      />
      <div className="flex gap-2 mt-2">
        <button onClick={importText} disabled={!text.trim()} className="btn-primary flex-1 text-xs py-1.5 flex items-center justify-center gap-1 disabled:opacity-40">
          <ClipboardPaste size={12} />붙여넣기 적용
        </button>
        <button onClick={importFile} className="btn-ghost text-xs py-1.5 px-2 flex items-center gap-1" title="엑셀 파일 선택">
          <Upload size={12} />엑셀
        </button>
        {count > 0 && (
          <button onClick={onClear} className="btn-ghost text-xs py-1.5 px-2 text-slate-500" title="비우기"><Trash2 size={12} /></button>
        )}
      </div>
      {msg && <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1"><CheckCircle2 size={11} />{msg}</p>}
    </div>
  )
}
