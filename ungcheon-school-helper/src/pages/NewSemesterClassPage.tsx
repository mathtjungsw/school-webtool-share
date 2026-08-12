import { useState, useCallback, useRef } from 'react'
import {
  Upload, Download, RotateCcw, ArrowLeftRight, History,
  Star, X, ChevronDown, ChevronUp, AlertCircle, Users, RefreshCw,
  Trash2, Plus
} from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { binaryToNumberArray } from '../utils/binaryBytes'

// ─── Types ───────────────────────────────────────────────────────────
interface Student {
  no: string
  name: string
  gender: '남' | '여' | string
  score: string
  prevClass: string
  noSort: number
}

interface ClassData {
  grade: string
  class: string
  students: Student[]
}

interface SwapHistoryEntry {
  time: string
  student1: { name: string; no: string; class: string }
  student2: { name: string; no: string; class: string }
  originalData: {
    student1: Student
    classKey1: string
    student2: Student
    classKey2: string
  }
  undone: boolean
}

interface GradeData {
  classData: Record<string, ClassData>
  history: SwapHistoryEntry[]
  markedStudents: string[]  // `${classKey}:${no}`
}

interface AppData {
  grade1: GradeData
  grade2: GradeData
}

const EMPTY_GRADE: GradeData = { classData: {}, history: [], markedStudents: [] }
const EMPTY_DATA: AppData = { grade1: EMPTY_GRADE, grade2: EMPTY_GRADE }

function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

function scoreNum(s: string) { return parseFloat(s) || 0 }

function avgScore(students: Student[]) {
  if (!students.length) return 0
  return students.reduce((a, s) => a + scoreNum(s.score), 0) / students.length
}

// ─── Main ─────────────────────────────────────────────────────────────
export default function NewSemesterClassPage() {
  const [data, setData] = useState<AppData>(EMPTY_DATA)
  const [gradeKey, setGradeKey] = useState<'grade1' | 'grade2'>('grade1')
  const [selected, setSelected] = useState<{ classKey: string; no: string } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showAddClass, setShowAddClass] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const dataFileRef = useRef<HTMLInputElement>(null)

  const grade = data[gradeKey]
  const classKeys = Object.keys(grade.classData).sort()

  // ── Save to store ─────────────────────────────────────────────────
  const persist = useCallback(async (next: AppData) => {
    await window.electron.configSet('newSemClass:data', next)
  }, [])

  const update = useCallback((next: AppData) => {
    setData(next)
    persist(next)
  }, [persist])

  // ── Load JSON (data.json format) ──────────────────────────────────
  const loadJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const parsed = JSON.parse(text) as AppData
      update(parsed)
    } catch {
      alert('JSON 파일 형식이 올바르지 않습니다.')
    }
    e.target.value = ''
  }

  // ── Import Excel ──────────────────────────────────────────────────
  const importExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true })

    const classMap: Record<string, ClassData> = {}
    let sortIdx = 0
    for (const row of rows) {
      const name = String(row['이름'] ?? row['성명'] ?? '').trim()
      if (!name) continue
      const no = String(row['번호'] ?? row['학번'] ?? ++sortIdx)
      const gender = String(row['성별'] ?? '')
      const score = String(row['성적'] ?? row['기준성적'] ?? row['점수'] ?? '0')
      const prevClass = String(row['이전반'] ?? row['前반'] ?? row['prevClass'] ?? '')
      const classNum = String(row['반'] ?? row['학급'] ?? '1')
      const gradeNum = String(row['학년'] ?? '1')
      const classKey = `${gradeNum}-${classNum}`
      const gradeLabel = `${gradeNum}학년`

      if (!classMap[classKey]) {
        classMap[classKey] = { grade: gradeLabel, class: classNum, students: [] }
      }
      classMap[classKey].students.push({ no, name, gender, score, prevClass, noSort: parseInt(no) || ++sortIdx })
    }

    const next = { ...data }
    next[gradeKey] = { classData: classMap, history: [], markedStudents: [] }
    update(next)
    e.target.value = ''
  }

  // ── Export JSON ───────────────────────────────────────────────────
  const exportJson = () => {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `반배정_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Export Excel ──────────────────────────────────────────────────
  const exportExcel = () => {
    const rows: Record<string, unknown>[] = []
    classKeys.forEach(ck => {
      const cls = grade.classData[ck]
      cls.students.sort((a,b) => a.noSort - b.noSort).forEach(s => {
        rows.push({ 학년: cls.grade, 반: cls.class, 번호: s.no, 이름: s.name, 성별: s.gender, 성적: s.score, 이전반: s.prevClass })
      })
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '반배정')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    window.electron.saveFileDialog(`반배정_${new Date().toISOString().slice(0,10)}.xlsx`, binaryToNumberArray(buf))
  }

  // ── Select / Swap ─────────────────────────────────────────────────
  const clickStudent = (classKey: string, no: string) => {
    if (!selected) {
      setSelected({ classKey, no })
      return
    }
    if (selected.classKey === classKey && selected.no === no) {
      setSelected(null)
      return
    }
    // perform swap
    const next = JSON.parse(JSON.stringify(data)) as AppData
    const g = next[gradeKey]
    const cls1 = g.classData[selected.classKey]
    const cls2 = g.classData[classKey]
    if (!cls1 || !cls2) { setSelected(null); return }

    const idx1 = cls1.students.findIndex(s => s.no === selected.no)
    const idx2 = cls2.students.findIndex(s => s.no === no)
    if (idx1 === -1 || idx2 === -1) { setSelected(null); return }

    const s1 = cls1.students[idx1]
    const s2 = cls2.students[idx2]

    const entry: SwapHistoryEntry = {
      time: nowTime(),
      student1: { name: s1.name, no: s1.no, class: `${cls1.grade} ${cls1.class}반` },
      student2: { name: s2.name, no: s2.no, class: `${cls2.grade} ${cls2.class}반` },
      originalData: {
        student1: { ...s1 },
        classKey1: selected.classKey,
        student2: { ...s2 },
        classKey2: classKey,
      },
      undone: false,
    }

    // Swap
    cls1.students[idx1] = { ...s2, no: s1.no, noSort: s1.noSort }
    cls2.students[idx2] = { ...s1, no: s2.no, noSort: s2.noSort }

    g.history = [entry, ...g.history]
    update(next)
    setSelected(null)
  }

  // ── Undo swap ─────────────────────────────────────────────────────
  const undoSwap = (histIdx: number) => {
    const next = JSON.parse(JSON.stringify(data)) as AppData
    const g = next[gradeKey]
    const entry = g.history[histIdx]
    if (!entry || entry.undone) return

    const { student1, classKey1, student2, classKey2 } = entry.originalData
    const cls1 = g.classData[classKey1]
    const cls2 = g.classData[classKey2]
    if (!cls1 || !cls2) return

    const idx1 = cls1.students.findIndex(s => s.no === entry.student1.no)
    const idx2 = cls2.students.findIndex(s => s.no === entry.student2.no)
    if (idx1 !== -1) cls1.students[idx1] = { ...student1, no: cls1.students[idx1].no, noSort: cls1.students[idx1].noSort }
    if (idx2 !== -1) cls2.students[idx2] = { ...student2, no: cls2.students[idx2].no, noSort: cls2.students[idx2].noSort }

    g.history[histIdx] = { ...entry, undone: true }
    update(next)
  }

  // ── Mark student ──────────────────────────────────────────────────
  const toggleMark = (classKey: string, no: string) => {
    const key = `${classKey}:${no}`
    const next = JSON.parse(JSON.stringify(data)) as AppData
    const g = next[gradeKey]
    const idx = g.markedStudents.indexOf(key)
    if (idx === -1) g.markedStudents.push(key)
    else g.markedStudents.splice(idx, 1)
    update(next)
  }

  const isMarked = (classKey: string, no: string) => grade.markedStudents.includes(`${classKey}:${no}`)

  // ── Add class ─────────────────────────────────────────────────────
  const addClass = () => {
    const name = newClassName.trim()
    if (!name) return
    const match = name.match(/(\d+)\s*학년\s*(\d+)\s*반/) ?? name.match(/^(\d+)-(\d+)$/)
    const gradeLabel = match ? `${match[1]}학년` : '1학년'
    const classNum = match ? match[2] : name
    const classKey = match ? `${match[1]}-${match[2]}` : `1-${name}`
    const next = JSON.parse(JSON.stringify(data)) as AppData
    if (!next[gradeKey].classData[classKey]) {
      next[gradeKey].classData[classKey] = { grade: gradeLabel, class: classNum, students: [] }
    }
    update(next)
    setNewClassName('')
    setShowAddClass(false)
  }

  // ── Delete class ──────────────────────────────────────────────────
  const deleteClass = (ck: string) => {
    if (!confirm(`${ck} 반을 삭제하시겠습니까? 학생 데이터도 모두 사라집니다.`)) return
    const next = JSON.parse(JSON.stringify(data)) as AppData
    delete next[gradeKey].classData[ck]
    update(next)
  }

  const hasData = classKeys.length > 0
  const activeHistory = grade.history.filter(h => !h.undone)

  return (
    <div className="flex flex-col h-full">
      {/* ── 헤더 ── */}
      <div className="px-5 py-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Users size={20} className="text-sky-400" /> 새학기 반배정
            </h1>
            <p className="page-subtitle">
              반별 학생 배치를 조정하고 교환 이력을 관리합니다.
              <span className="text-slate-600 ml-2">— 제작: 김재현 선생님</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 학년 선택 */}
            <div className="flex gap-1 bg-surface-800 border border-white/10 rounded-xl p-1">
              {(['grade1', 'grade2'] as const).map((gk, i) => (
                <button key={gk} onClick={() => { setGradeKey(gk); setSelected(null) }}
                  className={clsx('px-4 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    gradeKey === gk ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200')}>
                  {i + 1}그룹
                </button>
              ))}
            </div>

            {/* JSON 불러오기 */}
            <input ref={dataFileRef} type="file" accept=".json" className="hidden" onChange={loadJson} />
            <button onClick={() => dataFileRef.current?.click()} className="btn-ghost flex items-center gap-1.5 text-xs">
              <Upload size={13} /> JSON 불러오기
            </button>

            {/* Excel 불러오기 */}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />
            <button onClick={() => fileRef.current?.click()} className="btn-ghost flex items-center gap-1.5 text-xs">
              <Upload size={13} /> Excel 불러오기
            </button>

            {/* 저장 */}
            <button onClick={exportJson} disabled={!hasData} className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40">
              <Download size={13} /> JSON 저장
            </button>
            <button onClick={exportExcel} disabled={!hasData} className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40">
              <Download size={13} /> Excel 내보내기
            </button>

            {/* 이력 */}
            <button onClick={() => setShowHistory(v => !v)}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                showHistory ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200')}>
              <History size={13} />
              교환 이력 {activeHistory.length > 0 && <span className="bg-violet-500 text-white text-[9px] rounded-full px-1.5">{activeHistory.length}</span>}
            </button>
          </div>
        </div>

        {/* 선택 안내 */}
        {selected && (
          <div className="mt-3 flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2">
            <ArrowLeftRight size={13} className="text-amber-400" />
            <span className="text-amber-300 font-medium">
              [{grade.classData[selected.classKey]?.grade} {grade.classData[selected.classKey]?.class}반]&nbsp;
              {grade.classData[selected.classKey]?.students.find(s => s.no === selected.no)?.name} 선택됨
            </span>
            <span className="text-amber-500">— 다른 학생을 클릭하면 교환됩니다</span>
            <button onClick={() => setSelected(null)} className="ml-auto p-0.5 text-amber-600 hover:text-amber-300">
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── 이력 패널 ── */}
        {showHistory && (
          <div className="w-72 border-r border-white/5 flex flex-col bg-surface-900 flex-shrink-0">
            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">교환 이력</span>
              <span className="text-[10px] text-slate-600">{grade.history.length}건</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {grade.history.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-8">교환 이력이 없습니다.</p>
              ) : (
                grade.history.map((h, i) => (
                  <div key={i} className={clsx('px-3 py-2.5 border-b border-white/5 text-xs', h.undone && 'opacity-40')}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-600 font-mono text-[10px]">{h.time}</span>
                      {h.undone
                        ? <span className="text-[10px] text-slate-600 px-1.5 py-0.5 rounded bg-white/5">취소됨</span>
                        : <button onClick={() => undoSwap(i)} title="되돌리기"
                            className="text-[10px] text-amber-400 hover:text-amber-300 px-1.5 py-0.5 rounded hover:bg-amber-500/10 flex items-center gap-1">
                            <RotateCcw size={10} /> 되돌리기
                          </button>
                      }
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-slate-400">{h.student1.name}</span>
                      <span className="text-slate-600 text-[10px]">({h.student1.class})</span>
                      <ArrowLeftRight size={10} className="text-sky-500" />
                      <span className="text-slate-400">{h.student2.name}</span>
                      <span className="text-slate-600 text-[10px]">({h.student2.class})</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── 반 목록 ── */}
        <div className="flex-1 overflow-y-auto p-4">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Users size={40} className="text-slate-600 mb-4" />
              <h3 className="text-white font-semibold mb-2">데이터가 없습니다</h3>
              <p className="text-slate-400 text-sm mb-6">
                JSON 파일(data.json 형식) 또는 Excel 파일을 불러오세요.<br/>
                Excel 형식: 번호, 이름, 성별, 성적, 이전반, 반, 학년
              </p>
              <div className="flex gap-3">
                <button onClick={() => dataFileRef.current?.click()} className="btn-primary flex items-center gap-2">
                  <Upload size={14} /> JSON 불러오기
                </button>
                <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2">
                  <Upload size={14} /> Excel 불러오기
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 통계 요약 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {classKeys.map(ck => {
                  const cls = grade.classData[ck]
                  const avg = avgScore(cls.students)
                  const males = cls.students.filter(s => s.gender === '남').length
                  const females = cls.students.filter(s => s.gender === '여').length
                  return (
                    <div key={ck} className="card py-3 text-center">
                      <div className="text-xs font-bold text-sky-300 mb-1">{cls.grade} {cls.class}반</div>
                      <div className="text-lg font-bold text-white">{cls.students.length}<span className="text-xs text-slate-500">명</span></div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        남{males} / 여{females} · 평균 {avg.toFixed(1)}
                      </div>
                    </div>
                  )
                })}
                {/* 반 추가 */}
                {showAddClass ? (
                  <div className="card py-3 flex flex-col gap-2">
                    <input autoFocus type="text" placeholder="예: 1학년 1반 또는 1-1"
                      value={newClassName} onChange={e => setNewClassName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addClass()}
                      className="input text-xs py-1.5" />
                    <div className="flex gap-1">
                      <button onClick={addClass} className="btn-primary text-xs py-1 flex-1">추가</button>
                      <button onClick={() => setShowAddClass(false)} className="btn-ghost text-xs py-1"><X size={12} /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddClass(true)}
                    className="card py-3 border-dashed border-white/10 text-slate-600 hover:text-slate-400 hover:border-white/20 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer">
                    <Plus size={18} />
                    <span className="text-xs">반 추가</span>
                  </button>
                )}
              </div>

              {/* 반별 학생 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {classKeys.map(ck => (
                  <ClassCard
                    key={ck}
                    classKey={ck}
                    cls={grade.classData[ck]}
                    selected={selected}
                    onClickStudent={clickStudent}
                    onToggleMark={toggleMark}
                    isMarked={isMarked}
                    onDeleteClass={deleteClass}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ClassCard ────────────────────────────────────────────────────────
function ClassCard({
  classKey, cls, selected, onClickStudent, onToggleMark, isMarked, onDeleteClass
}: {
  classKey: string
  cls: ClassData
  selected: { classKey: string; no: string } | null
  onClickStudent: (classKey: string, no: string) => void
  onToggleMark: (classKey: string, no: string) => void
  isMarked: (classKey: string, no: string) => boolean
  onDeleteClass: (classKey: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const avg = avgScore(cls.students)
  const males = cls.students.filter(s => s.gender === '남').length
  const females = cls.students.filter(s => s.gender === '여').length

  const sorted = [...cls.students].sort((a,b) => a.noSort - b.noSort)

  return (
    <div className="card flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sky-300 font-bold text-xs">{cls.class}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-sm">{cls.grade} {cls.class}반</div>
          <div className="text-[10px] text-slate-500">
            {cls.students.length}명 · 남{males}/여{females} · 평균 {avg.toFixed(1)}
          </div>
        </div>
        <button onClick={() => setCollapsed(v => !v)} className="p-1 text-slate-600 hover:text-slate-300 transition-colors">
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button onClick={() => onDeleteClass(classKey)} title="반 삭제"
          className="p-1 text-slate-700 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
          <Trash2 size={12} />
        </button>
      </div>

      {!collapsed && (
        <div className="grid grid-cols-2 gap-1 max-h-80 overflow-y-auto pr-0.5">
          {sorted.map(s => {
            const isSelected = selected?.classKey === classKey && selected?.no === s.no
            const marked = isMarked(classKey, s.no)
            return (
              <div
                key={s.no}
                onClick={() => onClickStudent(classKey, s.no)}
                className={clsx(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs border',
                  isSelected
                    ? 'bg-amber-500/25 border-amber-500/50 text-amber-200'
                    : marked
                    ? 'bg-sky-500/15 border-sky-500/30 text-sky-200 hover:bg-sky-500/25'
                    : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10 text-slate-300'
                )}
              >
                <span className="text-slate-600 text-[10px] w-4 text-right flex-shrink-0">{s.no}</span>
                <span className={clsx('font-medium truncate flex-1', s.gender === '여' ? 'text-rose-300' : '', isSelected ? 'text-amber-200' : marked ? 'text-sky-200' : '')}>{s.name}</span>
                <span className="text-[9px] text-slate-600 flex-shrink-0">{parseFloat(s.score).toFixed(0)}</span>
                <button
                  onClick={e => { e.stopPropagation(); onToggleMark(classKey, s.no) }}
                  title={marked ? '표시 해제' : '특별 표시'}
                  className={clsx('flex-shrink-0 transition-colors', marked ? 'text-amber-400' : 'text-slate-700 hover:text-amber-400')}
                >
                  <Star size={10} fill={marked ? 'currentColor' : 'none'} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!collapsed && cls.students.length === 0 && (
        <p className="text-xs text-slate-600 text-center py-4">학생이 없습니다.</p>
      )}
    </div>
  )
}
