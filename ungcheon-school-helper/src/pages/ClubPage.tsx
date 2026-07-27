import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, Users, ClipboardList, Zap, BarChart3,
  Plus, Trash2, Edit2, Check, X, Upload, Download,
  Info, RefreshCw, FileSpreadsheet, Settings, Printer,
  FileText, Save, FolderOpen,
} from 'lucide-react'
import clsx from 'clsx'
import type { Club, ClubStudent, ClubStore, AssignMethod } from '../types/club'
import { DEFAULT_CLUB_STORE, ASSIGN_METHODS } from '../types/club'
import { runAssignment, calcStats } from '../services/clubAssign'
import {
  importStudentsXlsx, exportResultXlsx,
  exportClubTemplate, importClubsXlsx, exportStudentTemplate,
  exportRosterXlsx, exportByClubXlsx, exportByClassXlsx,
} from '../services/clubExcel'
import { buildHwpBytes, printResult } from '../services/clubHwp'

const STORE_KEY = 'club:data'

function makeId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

function useClubStore() {
  const [store, setStoreRaw] = useState<ClubStore>(DEFAULT_CLUB_STORE)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.electron?.configGet(STORE_KEY).then(v => {
      if (v) {
        const data = v as ClubStore
        setStoreRaw({ ...DEFAULT_CLUB_STORE, ...data, settings: { ...DEFAULT_CLUB_STORE.settings, ...data.settings } })
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const setStore = useCallback((updater: (prev: ClubStore) => ClubStore) => {
    setStoreRaw(prev => {
      const next = updater(prev)
      window.electron?.configSet(STORE_KEY, next)
      return next
    })
  }, [])

  return { store, setStore, loaded }
}

type Tab = 'settings' | 'clubs' | 'students' | 'prefs' | 'assign' | 'results' | 'export'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'settings', label: '설정',        icon: Settings },
  { id: 'clubs',    label: '동아리 관리', icon: Trophy },
  { id: 'students', label: '학생 명렬',   icon: Users },
  { id: 'prefs',    label: '희망 입력',   icon: ClipboardList },
  { id: 'assign',   label: '자동 배정',   icon: Zap },
  { id: 'results',  label: '결과/변경',   icon: BarChart3 },
  { id: 'export',   label: '출력/저장',   icon: Download },
]

export default function ClubPage() {
  const { store, setStore, loaded } = useClubStore()
  const [tab, setTab] = useState<Tab>('settings')
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  if (!loaded) return (
    <div className="flex items-center justify-center h-full text-slate-500 text-sm">불러오는 중…</div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 pt-5 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="page-title">동아리 자동 배정</h1>
            <p className="page-subtitle">
              희망 취합 → 자동 배정 → 결과 출력 · 전체 {store.students.filter(s => s.name !== '__placeholder__').length}명 / 동아리 {store.clubs.length}개
            </p>
          </div>
          <button
            onClick={async () => {
              if (!confirm('모든 데이터(동아리·학생·배정결과)를 초기화하시겠습니까?')) return
              setStore(() => ({ ...DEFAULT_CLUB_STORE }))
              showToast('초기화되었습니다.')
            }}
            className="btn-ghost text-xs flex items-center gap-1.5 text-red-400 hover:text-red-300"
          >
            <RefreshCw size={12} />전체 초기화
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 border-b border-white/5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                tab === t.id
                  ? 'border-violet-400 text-violet-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              )}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="p-6"
          >
            {tab === 'settings' && <SettingsTab  store={store} setStore={setStore} showToast={showToast} />}
            {tab === 'clubs'    && <ClubsTab    store={store} setStore={setStore} showToast={showToast} />}
            {tab === 'students' && <StudentsTab  store={store} setStore={setStore} showToast={showToast} />}
            {tab === 'prefs'    && <PrefsTab     store={store} setStore={setStore} showToast={showToast} />}
            {tab === 'assign'   && <AssignTab    store={store} setStore={setStore} showToast={showToast} />}
            {tab === 'results'  && <ResultsTab   store={store} setStore={setStore} showToast={showToast} />}
            {tab === 'export'   && <ExportTab    store={store} setStore={setStore} showToast={showToast} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 토스트 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold shadow-2xl z-50 pointer-events-none"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── 동아리 관리 탭 ────────────────────────────────────────────────────────────

function ClubsTab({ store, setStore, showToast }: TabProps) {
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Club, 'id'>>({ name: '', instructor: '', location: '', capacity: 20, targetGrades: [1, 2, 3] })

  const openNew = () => {
    setEditId('__new__')
    setForm({ name: '', instructor: '', location: '', capacity: 20, targetGrades: [1, 2, 3] })
  }

  const openEdit = (c: Club) => {
    setEditId(c.id)
    setForm({ name: c.name, instructor: c.instructor, location: c.location, capacity: c.capacity, targetGrades: [...c.targetGrades] })
  }

  const save = () => {
    if (!form.name.trim()) { showToast('동아리명을 입력하세요.'); return }
    setStore(prev => {
      if (editId === '__new__') {
        return { ...prev, clubs: [...prev.clubs, { ...form, id: makeId() }] }
      }
      return { ...prev, clubs: prev.clubs.map(c => c.id === editId ? { ...c, ...form } : c) }
    })
    setEditId(null)
  }

  const remove = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    setStore(prev => ({
      ...prev,
      clubs: prev.clubs.filter(c => c.id !== id),
      students: prev.students.map(s => s.assignedClub === id ? { ...s, assignedClub: null } : s),
    }))
  }

  const handleImportExcel = async () => {
    const path = await window.electron?.openFileDialog([{ name: 'Excel', extensions: ['xlsx', 'xls'] }])
    if (!path) return
    const bytes = await window.electron?.readFile(path)
    if (!bytes) return
    const clubs = importClubsXlsx(new Uint8Array(bytes).buffer)
    if (!clubs.length) { showToast('데이터를 찾을 수 없습니다.'); return }
    setStore(prev => ({ ...prev, clubs: [...prev.clubs, ...clubs.map(c => ({ ...c, id: makeId() }))] }))
    showToast(`✅ ${clubs.length}개 동아리를 추가했습니다.`)
  }

  const handleTemplate = async () => {
    const buf = exportClubTemplate()
    await window.electron?.saveFileDialog('동아리목록_양식.xlsx', buf)
  }

  const toggleGrade = (g: number) => {
    setForm(prev => ({
      ...prev,
      targetGrades: prev.targetGrades.includes(g)
        ? prev.targetGrades.filter(x => x !== g)
        : [...prev.targetGrades, g].sort(),
    }))
  }

  const totalCap = store.clubs.reduce((s, c) => s + (Number(c.capacity) || 0), 0)

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {store.clubs.length}개 동아리 · 총 정원 {totalCap}명
        </p>
        <div className="flex gap-2">
          <button onClick={handleTemplate} className="btn-ghost text-xs flex items-center gap-1.5">
            <Download size={12} />양식 다운로드
          </button>
          <button onClick={handleImportExcel} className="btn-ghost text-xs flex items-center gap-1.5">
            <Upload size={12} />일괄 입력
          </button>
          <button onClick={openNew} className="btn-primary text-xs flex items-center gap-1.5">
            <Plus size={12} />동아리 추가
          </button>
        </div>
      </div>

      {/* 동아리 목록 */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs text-slate-500">
              <th className="px-4 py-3 text-left w-8">#</th>
              <th className="px-4 py-3 text-left">동아리명</th>
              <th className="px-4 py-3 text-left">지도교사</th>
              <th className="px-4 py-3 text-left">장소</th>
              <th className="px-4 py-3 text-center">정원</th>
              <th className="px-4 py-3 text-center">배정</th>
              <th className="px-4 py-3 text-center">대상학년</th>
              <th className="px-4 py-3 text-center w-20">관리</th>
            </tr>
          </thead>
          <tbody>
            {store.clubs.map((c, i) => {
              const cnt = store.students.filter(s => s.assignedClub === c.id).length
              return (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-4 py-3 text-slate-400">{c.instructor || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{c.location || '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{c.capacity}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={clsx('text-xs font-semibold', cnt >= c.capacity ? 'text-amber-400' : 'text-emerald-400')}>
                      {cnt}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-400">
                    {c.targetGrades.map(g => `${g}학년`).join(' ')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => openEdit(c)} className="btn-ghost p-1 text-slate-400 hover:text-white"><Edit2 size={12} /></button>
                      <button onClick={() => remove(c.id)} className="btn-ghost p-1 text-red-500 hover:text-red-300"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {store.clubs.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-600 text-sm">동아리가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 동아리 편집 모달 */}
      <AnimatePresence>
        {editId && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-md space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{editId === '__new__' ? '동아리 추가' : '동아리 수정'}</h3>
                <button onClick={() => setEditId(null)} className="btn-ghost p-1"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <Field label="동아리명 *">
                  <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="밴드부" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="지도교사">
                    <input className="input" value={form.instructor} onChange={e => setForm(p => ({ ...p, instructor: e.target.value }))} placeholder="김선생" />
                  </Field>
                  <Field label="장소">
                    <input className="input" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="음악실" />
                  </Field>
                </div>
                <Field label="정원">
                  <input type="number" min={1} max={999} className="input" value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: Number(e.target.value) }))} />
                </Field>
                <Field label="대상 학년">
                  <div className="flex gap-2">
                    {[1, 2, 3].map(g => (
                      <button
                        key={g}
                        onClick={() => toggleGrade(g)}
                        className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors', form.targetGrades.includes(g) ? 'bg-violet-600 border-violet-500 text-white' : 'border-white/10 text-slate-400 hover:text-white')}
                      >
                        {g}학년
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditId(null)} className="btn-secondary text-sm">취소</button>
                <button onClick={save} className="btn-primary text-sm flex items-center gap-1.5"><Check size={13} />저장</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── 학생 명렬 탭 ──────────────────────────────────────────────────────────────

function StudentsTab({ store, setStore, showToast }: TabProps) {
  const [filterGrade, setFilterGrade] = useState(1)
  const [filterClass, setFilterClass] = useState('1')
  const [addName, setAddName] = useState('')
  const [addNumber, setAddNumber] = useState('')

  const grades = Array.from({ length: store.settings.grades }, (_, i) => i + 1)
  const classList = store.students
    .filter(s => s.grade === filterGrade)
    .reduce<Set<string>>((acc, s) => { acc.add(s.classNum); return acc }, new Set())
  const sortedClasses = [...classList].sort((a, b) => Number(a) - Number(b))
  const classStudents = store.students
    .filter(s => s.grade === filterGrade && s.classNum === filterClass && s.name !== '__placeholder__')
    .sort((a, b) => a.number - b.number)

  const totalByGrade = (g: number) => store.students.filter(s => s.grade === g && s.name !== '__placeholder__').length

  const handleAdd = () => {
    const name = addName.trim()
    if (!name) return
    const num = Number(addNumber) || (classStudents.length + 1)
    setStore(prev => ({
      ...prev,
      students: [...prev.students, {
        id: makeId(), grade: filterGrade, classNum: filterClass,
        number: num, name, prefs: [], ts: null, assignedClub: null, isExtra: false,
      }],
    }))
    setAddName('')
    setAddNumber('')
  }

  const handleRemove = (id: string) => {
    setStore(prev => ({ ...prev, students: prev.students.filter(s => s.id !== id) }))
  }

  const handleImport = async () => {
    const path = await window.electron?.openFileDialog([{ name: 'Excel', extensions: ['xlsx', 'xls'] }])
    if (!path) return
    const bytes = await window.electron?.readFile(path)
    if (!bytes) return
    const imported = importStudentsXlsx(new Uint8Array(bytes).buffer)
    if (!imported.length) { showToast('데이터를 찾을 수 없습니다.'); return }
    setStore(prev => {
      const newStudents = imported.filter(s =>
        !prev.students.some(e => e.grade === s.grade && e.classNum === s.classNum && e.name === s.name)
      )
      return { ...prev, students: [...prev.students, ...newStudents] }
    })
    showToast(`✅ ${imported.length}명을 추가했습니다.`)
  }

  const handleTemplate = async () => {
    const buf = exportStudentTemplate()
    await window.electron?.saveFileDialog('학생명렬_양식.xlsx', buf)
  }

  const clearGradeStudents = () => {
    if (!confirm(`${filterGrade}학년 ${filterClass}반 학생을 모두 삭제하시겠습니까?`)) return
    setStore(prev => ({
      ...prev,
      students: prev.students.filter(s => !(s.grade === filterGrade && s.classNum === filterClass)),
    }))
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* 학년 탭 */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1">
          {grades.map(g => (
            <button
              key={g}
              onClick={() => { setFilterGrade(g); setFilterClass('1') }}
              className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', filterGrade === g ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white')}
            >
              {g}학년 <span className="text-xs opacity-70">{totalByGrade(g)}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={handleTemplate} className="btn-ghost text-xs flex items-center gap-1.5"><Download size={12} />양식</button>
          <button onClick={handleImport} className="btn-ghost text-xs flex items-center gap-1.5"><Upload size={12} />엑셀 일괄 입력</button>
        </div>
      </div>

      {/* 반 탭 */}
      <div className="flex gap-1 flex-wrap">
        {sortedClasses.map(c => (
          <button
            key={c}
            onClick={() => setFilterClass(c)}
            className={clsx('px-3 py-1 rounded-lg text-sm transition-colors', filterClass === c ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white bg-white/5')}
          >
            {c}반 ({store.students.filter(s => s.grade === filterGrade && s.classNum === c && s.name !== '__placeholder__').length})
          </button>
        ))}
        {/* 새 반 추가 */}
        <NewClassButton filterGrade={filterGrade} store={store} setStore={setStore} onAdded={c => setFilterClass(c)} />
      </div>

      {/* 학생 테이블 */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-sm font-medium text-white">{filterGrade}학년 {filterClass}반 · {classStudents.length}명</span>
          {classStudents.length > 0 && (
            <button onClick={clearGradeStudents} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"><Trash2 size={11} />전체삭제</button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs text-slate-500">
              <th className="px-4 py-2.5 text-left w-10">번호</th>
              <th className="px-4 py-2.5 text-left">이름</th>
              <th className="px-4 py-2.5 text-left">희망입력</th>
              <th className="px-4 py-2.5 text-left">배정 동아리</th>
              <th className="px-4 py-2.5 text-center w-12">삭제</th>
            </tr>
          </thead>
          <tbody>
            {classStudents.map(s => {
              const club = s.assignedClub ? store.clubs.find(c => c.id === s.assignedClub) : null
              return (
                <tr key={s.id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="px-4 py-2.5 text-slate-500">{s.number}</td>
                  <td className="px-4 py-2.5 text-white">{s.name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {s.prefs.length > 0 ? `${s.prefs.length}개 입력` : <span className="text-slate-600">미입력</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {club
                      ? <span className={clsx('text-xs px-2 py-0.5 rounded-full', s.isExtra ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300')}>{club.name}{s.isExtra ? ' (추가)' : ''}</span>
                      : <span className="text-slate-600 text-xs">미배정</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => handleRemove(s.id)} className="btn-ghost p-1 text-red-500 hover:text-red-300"><Trash2 size={12} /></button>
                  </td>
                </tr>
              )
            })}
            {/* 추가 행 */}
            <tr className="border-b border-white/5">
              <td className="px-4 py-2">
                <input type="number" min={1} className="input text-sm w-16 text-center" placeholder="번호" value={addNumber} onChange={e => setAddNumber(e.target.value)} />
              </td>
              <td className="px-4 py-2" colSpan={3}>
                <input
                  className="input text-sm w-full max-w-xs"
                  placeholder="이름 입력 후 Enter"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </td>
              <td className="px-4 py-2 text-center">
                <button onClick={handleAdd} className="btn-primary p-1.5 rounded-lg"><Plus size={12} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NewClassButton({ filterGrade, store, setStore, onAdded }: { filterGrade: number; store: ClubStore; setStore: (u: (p: ClubStore) => ClubStore) => void; onAdded: (c: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [val, setVal] = useState('')

  const submit = () => {
    const cls = val.trim()
    if (!cls) return
    setStore(prev => {
      const exists = prev.students.some(s => s.grade === filterGrade && s.classNum === cls)
      if (exists) return prev
      return { ...prev, students: [...prev.students, { id: makeId(), grade: filterGrade, classNum: cls, number: 0, name: '__placeholder__', prefs: [], ts: null, assignedClub: null, isExtra: false }] }
    })
    onAdded(cls)
    setAdding(false)
    setVal('')
  }

  if (!adding) return (
    <button onClick={() => setAdding(true)} className="px-3 py-1 rounded-lg text-xs text-slate-500 hover:text-white border border-dashed border-white/10 hover:border-white/30 transition-colors flex items-center gap-1">
      <Plus size={10} />반 추가
    </button>
  )
  return (
    <div className="flex items-center gap-1">
      <input autoFocus className="input w-16 text-sm py-0.5" placeholder="반" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      <button onClick={submit} className="btn-primary p-1 rounded-md"><Check size={12} /></button>
      <button onClick={() => setAdding(false)} className="btn-ghost p-1"><X size={12} /></button>
    </div>
  )
}

// ─── 희망 입력 탭 ──────────────────────────────────────────────────────────────

function PrefsTab({ store, setStore, showToast }: TabProps) {
  const [grade, setGrade] = useState(1)
  const [classNum, setClassNum] = useState('1')
  const [gradeOnly, setGradeOnly] = useState(false)

  const grades = Array.from({ length: store.settings.grades }, (_, i) => i + 1)
  const classes = [...new Set(store.students.filter(s => s.grade === grade).map(s => s.classNum))].sort((a, b) => Number(a) - Number(b))
  const students = store.students
    .filter(s => s.grade === grade && s.classNum === classNum && s.name !== '__placeholder__')
    .sort((a, b) => a.number - b.number)

  const availableClubs = gradeOnly
    ? store.clubs.filter(c => c.targetGrades.includes(grade))
    : store.clubs

  const setPref = (studentId: string, rank: number, clubId: string) => {
    setStore(prev => ({
      ...prev,
      students: prev.students.map(s => {
        if (s.id !== studentId) return s
        const prefs = [...s.prefs]
        // 중복 제거
        const filtered = prefs.filter((p, i) => i !== rank && p !== clubId)
        filtered.splice(rank, 0, clubId)
        return { ...s, prefs: filtered.filter(Boolean), ts: s.ts ?? Date.now() }
      }),
    }))
  }

  const clearPref = (studentId: string) => {
    setStore(prev => ({
      ...prev,
      students: prev.students.map(s => s.id === studentId ? { ...s, prefs: [], ts: null } : s),
    }))
  }

  const doneCount = students.filter(s => s.prefs.length > 0).length
  const maxPrefs = store.settings.maxPrefs

  return (
    <div className="max-w-3xl space-y-4">
      {/* 컨트롤 */}
      <div className="flex items-center gap-3 flex-wrap">
        <select className="input text-sm w-28" value={grade} onChange={e => { setGrade(Number(e.target.value)); setClassNum('1') }}>
          {grades.map(g => <option key={g} value={g}>{g}학년</option>)}
        </select>
        <select className="input text-sm w-24" value={classNum} onChange={e => setClassNum(e.target.value)}>
          {classes.map(c => <option key={c} value={c}>{c}반</option>)}
        </select>
        <span className="text-xs text-slate-500">
          {grade}학년 {classNum}반 · {doneCount}/{students.length}명 입력 완료
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" className="accent-violet-500" checked={gradeOnly} onChange={e => setGradeOnly(e.target.checked)} />
          학년 동아리만 표시
        </label>
        <select
          className="input text-sm w-28"
          value={maxPrefs}
          onChange={e => setStore(prev => ({ ...prev, settings: { ...prev.settings, maxPrefs: Number(e.target.value) } }))}
        >
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>희망 {n}개</option>)}
        </select>
      </div>

      {store.clubs.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          <Info size={14} />동아리를 먼저 등록해주세요.
        </div>
      )}

      {/* 학생 희망 입력 테이블 */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs text-slate-500">
              <th className="px-4 py-3 text-left w-10">번호</th>
              <th className="px-4 py-3 text-left">이름</th>
              {Array.from({ length: maxPrefs }, (_, i) => (
                <th key={i} className="px-3 py-3 text-center">{i + 1}희망</th>
              ))}
              <th className="px-4 py-3 text-center w-12">초기화</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/3">
                <td className="px-4 py-2.5 text-slate-500">{s.number}</td>
                <td className="px-4 py-2.5 text-white whitespace-nowrap">{s.name}</td>
                {Array.from({ length: maxPrefs }, (_, rank) => (
                  <td key={rank} className="px-2 py-2">
                    <select
                      className="input text-xs py-1 w-full min-w-[110px]"
                      value={s.prefs[rank] ?? ''}
                      onChange={e => {
                        if (e.target.value) setPref(s.id, rank, e.target.value)
                        else {
                          setStore(prev => ({
                            ...prev,
                            students: prev.students.map(st => {
                              if (st.id !== s.id) return st
                              const p = [...st.prefs]
                              p.splice(rank, 1)
                              return { ...st, prefs: p.filter(Boolean) }
                            }),
                          }))
                        }
                      }}
                    >
                      <option value="">—</option>
                      {availableClubs.map(c => (
                        <option key={c.id} value={c.id} disabled={s.prefs.includes(c.id) && s.prefs[rank] !== c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
                <td className="px-4 py-2 text-center">
                  <button onClick={() => clearPref(s.id)} className="btn-ghost p-1 text-slate-600 hover:text-red-400"><X size={12} /></button>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr><td colSpan={maxPrefs + 3} className="px-4 py-10 text-center text-slate-600 text-sm">학생이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 전체 현황 */}
      <div className="text-xs text-slate-500 flex items-center gap-4">
        <span>전체 {store.students.filter(s => s.name !== '__placeholder__').length}명</span>
        <span>희망 입력 완료 {store.students.filter(s => s.prefs.length > 0).length}명</span>
        <span>미입력 {store.students.filter(s => s.name !== '__placeholder__' && s.prefs.length === 0).length}명</span>
      </div>
    </div>
  )
}

// ─── 자동 배정 탭 ──────────────────────────────────────────────────────────────

function AssignTab({ store, setStore, showToast }: TabProps) {
  const [running, setRunning] = useState(false)
  const method = store.settings.assignMethod
  const overAssign = store.settings.overAssign

  const realStudents = store.students.filter(s => s.name !== '__placeholder__')
  const stats = calcStats(store.clubs, realStudents)
  const totalCap = store.clubs.reduce((s, c) => s + c.capacity, 0)

  const handleRun = () => {
    if (!store.clubs.length) { showToast('동아리를 먼저 등록하세요.'); return }
    if (!realStudents.length) { showToast('학생을 먼저 등록하세요.'); return }
    if (!confirm('자동 배정을 실행하시겠습니까? 기존 배정 결과가 초기화됩니다.')) return
    setRunning(true)
    setTimeout(() => {
      const result = runAssignment(store.clubs, realStudents, method, overAssign)
      const assigned = result.filter(s => s.assignedClub).length
      setStore(prev => ({
        ...prev,
        students: prev.students.map(s => {
          const r = result.find(x => x.id === s.id)
          return r ? { ...s, assignedClub: r.assignedClub, isExtra: r.isExtra } : s
        }),
        assignedAt: Date.now(),
      }))
      setRunning(false)
      showToast(`✅ 배정 완료! ${assigned}명 배정 · ${realStudents.length - assigned}명 미배정`)
    }, 400)
  }

  const handleReset = () => {
    if (!confirm('배정 결과를 초기화하시겠습니까?')) return
    setStore(prev => ({
      ...prev,
      students: prev.students.map(s => ({ ...s, assignedClub: null, isExtra: false })),
      assignedAt: null,
    }))
    showToast('배정 결과가 초기화되었습니다.')
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* 현황 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="전체 학생" value={realStudents.length} color="text-slate-300" />
        <StatCard label="희망 입력 완료" value={stats.hasPrefs} color="text-sky-400" />
        <StatCard label="총 정원 합계" value={totalCap} color="text-violet-400" />
      </div>

      {realStudents.length > totalCap && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          <Info size={13} className="flex-shrink-0 mt-0.5" />
          전체 학생 수({realStudents.length}명)가 총 정원({totalCap}명)보다 많습니다. 정원 초과 시 비율 추가 배정을 활성화하면 초과 학생도 배정됩니다.
        </div>
      )}

      {/* 안내문 */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-200/90 leading-relaxed">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          <b>‘희망 순위(선착순)’</b> 방식은 희망을 먼저 입력한(제출 시각이 빠른) 학생이 경쟁에서 우선합니다.
          단, 학년·학급 배포 파일로 수합한 희망은 제출 시각을 반영하지 않습니다(제출 시각 없음으로 간주). 이 경우 동점은 <b>학번(학년·반·번호)</b> 순으로 배정됩니다.
        </span>
      </div>

      {/* 배정 방식 선택 */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-white text-sm">배정 방식</h3>
        <div className="space-y-2">
          {ASSIGN_METHODS.map(m => (
            <label key={m.value} className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-colors border border-transparent has-[:checked]:border-violet-500/40 has-[:checked]:bg-violet-500/10">
              <input
                type="radio"
                name="method"
                value={m.value}
                checked={method === m.value}
                onChange={() => setStore(prev => ({ ...prev, settings: { ...prev.settings, assignMethod: m.value as AssignMethod } }))}
                className="mt-0.5 accent-violet-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-200">{m.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 추가 옵션 */}
      <div className="card">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={overAssign}
            onChange={e => setStore(prev => ({ ...prev, settings: { ...prev.settings, overAssign: e.target.checked } }))}
            className="mt-0.5 w-4 h-4 accent-violet-500"
          />
          <div>
            <p className="text-sm font-semibold text-slate-200">정원 초과 시 비율 추가 배정</p>
            <p className="text-xs text-slate-500 mt-0.5">
              전체 학생 수가 동아리 총 정원보다 많을 때, 각 동아리 정원 비율에 맞게 초과 학생을 추가 배정합니다.
            </p>
          </div>
        </label>
      </div>

      {/* 실행 버튼 */}
      <div className="flex gap-3">
        <button
          onClick={handleRun}
          disabled={running}
          className="btn-primary flex-1 flex items-center justify-center gap-2 py-3"
        >
          {running ? <><RefreshCw size={15} className="animate-spin" />배정 중…</> : <><Zap size={15} />⚡ 자동 배정 실행</>}
        </button>
        {store.assignedAt && (
          <button onClick={handleReset} className="btn-secondary flex items-center gap-2">
            <X size={14} />초기화
          </button>
        )}
      </div>

      {store.assignedAt && (
        <p className="text-xs text-slate-500 text-center">
          마지막 배정: {new Date(store.assignedAt).toLocaleString('ko-KR')}
        </p>
      )}
    </div>
  )
}

// ─── 결과 확인 탭 ──────────────────────────────────────────────────────────────

function ResultsTab({ store, setStore, showToast }: TabProps) {
  const [filterGrade, setFilterGrade] = useState(0)
  const [filterClub, setFilterClub] = useState('')
  const [view, setView] = useState<'student' | 'club' | 'class'>('club')
  const [unassignedOnly, setUnassignedOnly] = useState(false)

  const realStudents = store.students.filter(s => s.name !== '__placeholder__')
  const stats = calcStats(store.clubs, realStudents)

  const filteredStudents = realStudents
    .filter(s => filterGrade === 0 || s.grade === filterGrade)
    .filter(s => !filterClub || s.assignedClub === filterClub)
    .filter(s => !unassignedOnly || !s.assignedClub)
    .sort((a, b) => a.grade - b.grade || Number(a.classNum) - Number(b.classNum) || a.number - b.number)

  const changeAssign = (studentId: string, clubId: string) => {
    setStore(prev => ({
      ...prev,
      students: prev.students.map(s => s.id === studentId ? { ...s, assignedClub: clubId || null, isExtra: false } : s),
    }))
  }

  const handleExport = async () => {
    if (!store.assignedAt) { showToast('배정을 먼저 실행해주세요.'); return }
    const buf = exportResultXlsx(store.clubs, realStudents)
    const year = store.settings.year
    await window.electron?.saveFileDialog(`동아리배정결과_${year}.xlsx`, buf)
    showToast('✅ 엑셀 저장 완료!')
  }

  const handleHwp = async () => {
    if (!store.assignedAt) { showToast('배정을 먼저 실행해주세요.'); return }
    const mode = view === 'class' ? 'byClass' : 'byClub'
    const buf = buildHwpBytes(store, mode)
    const sn = store.settings.schoolName || '학교'
    const ok = await window.electron?.saveFileDialog(`동아리배정_${mode === 'byClub' ? '동아리별' : '학급별'}_${sn}.hwp`, buf)
    if (ok) showToast('✅ 한글 파일 저장 완료!')
  }

  if (!store.assignedAt) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-3">
        <BarChart3 size={40} className="opacity-30" />
        <p className="text-sm">아직 배정 결과가 없습니다.</p>
        <p className="text-xs">자동 배정 탭에서 배정을 실행해주세요.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* 통계 요약 */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="전체 학생" value={stats.total} color="text-slate-300" />
        <StatCard label="배정 완료" value={stats.assigned} color="text-emerald-400" />
        <StatCard label="미배정" value={stats.unassigned} color={stats.unassigned > 0 ? 'text-red-400' : 'text-slate-500'} />
        <StatCard label="1희망 배정" value={stats.wish1} color="text-violet-400" sub={`${stats.total > 0 ? Math.round((stats.wish1 / stats.total) * 100) : 0}%`} />
      </div>

      {/* 필터 + 내보내기 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {[0, 1, 2, 3].slice(0, store.settings.grades + 1).map(g => (
            <button
              key={g}
              onClick={() => setFilterGrade(g)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm transition-colors', filterGrade === g ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white bg-white/5')}
            >
              {g === 0 ? '전체' : `${g}학년`}
            </button>
          ))}
        </div>
        <select className="input text-sm w-36" value={filterClub} onChange={e => setFilterClub(e.target.value)}>
          <option value="">전체 동아리</option>
          {store.clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" className="accent-violet-500" checked={unassignedOnly} onChange={e => setUnassignedOnly(e.target.checked)} />
          미배정만 보기
        </label>
        <div className="ml-auto flex gap-2">
          <div className="flex bg-white/5 rounded-lg p-0.5">
            {(['club', 'class', 'student'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors', view === v ? 'bg-violet-600 text-white' : 'text-slate-400')}>
                {v === 'student' ? '학생별' : v === 'club' ? '동아리별' : '학급별'}
              </button>
            ))}
          </div>
          <button onClick={() => printResult(store, view === 'class' ? 'byClass' : 'byClub')} className="btn-secondary text-xs flex items-center gap-1.5"><Printer size={12} />인쇄(PDF)</button>
          <button onClick={handleHwp} className="btn-secondary text-xs flex items-center gap-1.5"><FileText size={12} />한글(HWP)</button>
          <button onClick={handleExport} className="btn-primary text-xs flex items-center gap-1.5"><FileSpreadsheet size={12} />엑셀</button>
        </div>
      </div>

      {/* 학생별 뷰 */}
      {view === 'student' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs text-slate-500">
                <th className="px-4 py-3 text-left w-8">#</th>
                <th className="px-4 py-3 text-left">학년/반/번호</th>
                <th className="px-4 py-3 text-left">이름</th>
                <th className="px-4 py-3 text-left">1희망</th>
                <th className="px-4 py-3 text-left">배정 동아리</th>
                <th className="px-4 py-3 text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s, i) => {
                const club = s.assignedClub ? store.clubs.find(c => c.id === s.assignedClub) : null
                const wish1 = s.prefs[0] ? store.clubs.find(c => c.id === s.prefs[0]) : null
                const isWish1 = s.assignedClub && s.assignedClub === s.prefs[0]
                return (
                  <tr key={s.id} className="border-b border-white/5 hover:bg-white/3">
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{s.grade}-{s.classNum}-{s.number}</td>
                    <td className="px-4 py-2.5 text-white">{s.name}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{wish1?.name ?? '미입력'}</td>
                    <td className="px-4 py-2.5">
                      <select
                        className="input text-xs py-1 min-w-[130px]"
                        value={s.assignedClub ?? ''}
                        onChange={e => changeAssign(s.id, e.target.value)}
                      >
                        <option value="">미배정</option>
                        {store.clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {s.isExtra && <span className="text-amber-400">추가배정</span>}
                      {isWish1 && <span className="text-emerald-400">1희망</span>}
                      {!s.assignedClub && <span className="text-red-400">미배정</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 동아리별 뷰 */}
      {view === 'club' && (
        <div className="space-y-3">
          {/* 배정 현황 요약표 (충족률·잔여) */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/5 bg-white/3">
              <span className="text-sm font-medium text-white">동아리별 배정 현황</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-500">
                  <th className="px-4 py-2 text-left">동아리명</th>
                  <th className="px-4 py-2 text-left">지도교사</th>
                  <th className="px-4 py-2 text-center w-16">정원</th>
                  <th className="px-4 py-2 text-center w-20">배정</th>
                  <th className="px-4 py-2 text-center w-16">잔여</th>
                  <th className="px-4 py-2 text-center w-20">충족률</th>
                </tr>
              </thead>
              <tbody>
                {stats.clubStats
                  .filter(c => !filterClub || c.id === filterClub)
                  .map(c => {
                    const extra = realStudents.filter(s => s.assignedClub === c.id && s.isExtra).length
                    const regular = c.count - extra
                    const fillPct = c.capacity > 0 ? Math.round((regular / c.capacity) * 100) : 0
                    const remain = Math.max(0, c.capacity - regular)
                    return (
                      <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                        <td className="px-4 py-2 font-medium text-white">{c.name}</td>
                        <td className="px-4 py-2 text-slate-400 text-xs">{c.instructor || '—'}</td>
                        <td className="px-4 py-2 text-center text-slate-300">{c.capacity}</td>
                        <td className="px-4 py-2 text-center font-semibold text-emerald-400">
                          {regular}{extra > 0 && <span className="text-amber-400 text-xs ml-0.5">(+{extra})</span>}
                        </td>
                        <td className={clsx('px-4 py-2 text-center font-semibold', remain > 0 ? 'text-red-400' : 'text-slate-600')}>{remain}</td>
                        <td className={clsx('px-4 py-2 text-center font-semibold', fillPct >= 100 ? 'text-emerald-400' : 'text-slate-400')}>{fillPct}%</td>
                      </tr>
                    )
                  })}
                {stats.clubStats.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-600 text-sm">동아리가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {stats.clubStats
            .filter(c => !filterClub || c.id === filterClub)
            .map(c => {
              const members = realStudents
                .filter(s => s.assignedClub === c.id && (filterGrade === 0 || s.grade === filterGrade))
                .sort((a, b) => a.grade - b.grade || Number(a.classNum) - Number(b.classNum) || a.number - b.number)
              return (
                <div key={c.id} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-semibold text-white">{c.name}</span>
                      <span className="text-xs text-slate-500 ml-2">{c.instructor} · {c.location}</span>
                    </div>
                    <span className={clsx('text-sm font-bold', c.count >= c.capacity ? 'text-amber-400' : 'text-emerald-400')}>
                      {c.count} / {c.capacity}명
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map(s => (
                      <span key={s.id} className={clsx('text-xs px-2 py-0.5 rounded-full border', s.isExtra ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/10 text-slate-300')}>
                        {s.grade}-{s.classNum}-{s.number} {s.name}
                      </span>
                    ))}
                    {members.length === 0 && <span className="text-xs text-slate-600">배정 인원 없음</span>}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* 학급별 뷰 */}
      {view === 'class' && (
        <div className="space-y-3">
          {(() => {
            const grades = [...new Set(filteredStudents.map(s => s.grade))].sort((a, b) => a - b)
            const blocks: React.ReactNode[] = []
            for (const g of grades) {
              const classes = [...new Set(filteredStudents.filter(s => s.grade === g).map(s => s.classNum))]
                .sort((a, b) => Number(a) - Number(b))
              for (const cls of classes) {
                const members = filteredStudents
                  .filter(s => s.grade === g && s.classNum === cls)
                  .sort((a, b) => a.number - b.number)
                blocks.push(
                  <div key={`${g}-${cls}`} className="card p-0 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-white/5 bg-white/3">
                      <span className="font-semibold text-white text-sm">{g}학년 {cls}반 동아리 배정표 · {members.length}명</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5 text-xs text-slate-500">
                          <th className="px-4 py-2 text-left w-12">번호</th>
                          <th className="px-4 py-2 text-left">이름</th>
                          <th className="px-4 py-2 text-left">배정 동아리</th>
                          <th className="px-4 py-2 text-left">지도교사</th>
                          <th className="px-4 py-2 text-left w-16">비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map(s => {
                          const club = s.assignedClub ? store.clubs.find(c => c.id === s.assignedClub) : null
                          return (
                            <tr key={s.id} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                              <td className="px-4 py-2 text-slate-500">{s.number}</td>
                              <td className="px-4 py-2 text-white">{s.name}</td>
                              <td className="px-4 py-2 text-slate-300">{club?.name ?? <span className="text-red-400">미배정</span>}</td>
                              <td className="px-4 py-2 text-slate-400 text-xs">{club?.instructor ?? ''}</td>
                              <td className="px-4 py-2 text-xs">{s.isExtra && <span className="text-amber-400">추가</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              }
            }
            return blocks.length ? blocks : <p className="text-sm text-slate-600 text-center py-10">표시할 학급이 없습니다.</p>
          })()}
        </div>
      )}
    </div>
  )
}

// ─── 설정 탭 ──────────────────────────────────────────────────────────────────

function SettingsTab({ store, setStore, showToast }: TabProps) {
  const s = store.settings

  const update = (patch: Partial<typeof s>) => {
    setStore(prev => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }

  const setClassCount = (gradeIdx: number, val: number) => {
    setStore(prev => {
      const arr = [...prev.settings.classesPerGrade]
      while (arr.length < prev.settings.grades) arr.push(0)
      arr[gradeIdx] = Math.max(0, val)
      return { ...prev, settings: { ...prev.settings, classesPerGrade: arr } }
    })
  }

  const handleBackup = async () => {
    const json = JSON.stringify({ __type: 'club-backup', v: 1, data: store }, null, 2)
    const bytes = Array.from(new TextEncoder().encode(json))
    const name = `동아리배정_백업_${s.schoolName || '학교'}_${new Date().toISOString().slice(0, 10)}.rca`
    const ok = await window.electron?.saveFileDialog(name, bytes)
    if (ok) showToast('✅ 백업 파일을 저장했습니다.')
  }

  const handleRestore = async () => {
    const path = await window.electron?.openFileDialog([{ name: '백업 파일', extensions: ['rca', 'json'] }])
    if (!path) return
    const bytes = await window.electron?.readFile(path)
    if (!bytes) return
    try {
      const text = new TextDecoder().decode(new Uint8Array(bytes))
      const parsed = JSON.parse(text)
      const data: ClubStore = parsed.data ?? parsed
      if (!data.settings || !Array.isArray(data.clubs) || !Array.isArray(data.students)) {
        showToast('올바른 백업 파일이 아닙니다.'); return
      }
      if (!confirm('현재 데이터를 백업 파일 내용으로 덮어씁니다. 진행할까요?')) return
      setStore(() => ({
        ...DEFAULT_CLUB_STORE, ...data,
        settings: { ...DEFAULT_CLUB_STORE.settings, ...data.settings },
      }))
      showToast('✅ 데이터를 복원했습니다.')
    } catch {
      showToast('파일을 읽을 수 없습니다.')
    }
  }

  const gradeArr = Array.from({ length: s.grades }, (_, i) => i + 1)

  return (
    <div className="max-w-2xl space-y-4">
      {/* 학교 기본 정보 */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-white text-sm">학교 기본 정보</h3>
        <Field label="학교명">
          <input className="input" value={s.schoolName} onChange={e => update({ schoolName: e.target.value })} placeholder="○○중학교" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="학년도">
            <input type="number" className="input" value={s.year} onChange={e => update({ year: Number(e.target.value) })} />
          </Field>
          <Field label="학년 수">
            <select className="input" value={s.grades} onChange={e => update({ grades: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}개 학년</option>)}
            </select>
          </Field>
        </div>
        <Field label="학년별 반 수">
          <div className="flex flex-wrap items-center gap-2">
            {gradeArr.map(g => (
              <div key={g} className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">{g}학년</span>
                <input
                  type="number" min={0} max={30}
                  className="input w-16 text-center"
                  value={s.classesPerGrade[g - 1] ?? 0}
                  onChange={e => setClassCount(g - 1, Number(e.target.value))}
                />
                <span className="text-xs text-slate-500">반</span>
              </div>
            ))}
          </div>
        </Field>
        <Field label="희망 동아리 최대 개수">
          <select className="input w-32" value={s.maxPrefs} onChange={e => update({ maxPrefs: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}개</option>)}
          </select>
        </Field>
        <p className="text-xs text-slate-500">설정은 자동 저장됩니다. 반 수는 학생 명렬·결과 출력의 학급 순서를 정합니다.</p>
      </div>

      {/* 데이터 백업 / 복원 */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-white text-sm">데이터 백업 / 복원</h3>
        <p className="text-xs text-slate-500">다른 PC에서 작업하거나 협업 담당에게 전달할 때 사용하세요. 동아리·학생·희망·배정결과가 모두 포함됩니다.</p>
        <div className="flex gap-2">
          <button onClick={handleBackup} className="btn-secondary text-sm flex items-center gap-1.5"><Save size={13} />데이터 내보내기 (.rca)</button>
          <button onClick={handleRestore} className="btn-ghost text-sm flex items-center gap-1.5"><FolderOpen size={13} />데이터 가져오기</button>
        </div>
      </div>
    </div>
  )
}

// ─── 출력/저장 탭 ─────────────────────────────────────────────────────────────

function ExportTab({ store, showToast }: TabProps) {
  const realStudents = store.students.filter(s => s.name !== '__placeholder__')
  const ready = !!store.assignedAt
  const yr = store.settings.year
  const sn = store.settings.schoolName || '학교'

  const saveXlsx = async (bytes: number[], name: string) => {
    const ok = await window.electron?.saveFileDialog(name, bytes)
    if (ok) showToast('✅ 저장 완료!')
  }
  const saveHwp = async (mode: 'byClub' | 'byClass') => {
    const bytes = buildHwpBytes(store, mode)
    const ok = await window.electron?.saveFileDialog(`동아리배정_${mode === 'byClub' ? '동아리별' : '학급별'}_${sn}.hwp`, bytes)
    if (ok) showToast('✅ 한글 파일 저장 완료! 한글에서 열거나 인쇄하세요.')
  }

  const ExcelRow = ({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) => (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 last:border-0">
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
      <button onClick={onClick} className="btn-primary text-xs flex items-center gap-1.5 flex-shrink-0"><Download size={12} />다운로드</button>
    </div>
  )

  return (
    <div className="max-w-3xl space-y-4">
      {!ready && (
        <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <Info size={14} className="flex-shrink-0" />
          자동 배정이 아직 실행되지 않았습니다. [자동 배정] 탭에서 먼저 배정을 실행하세요.
        </div>
      )}

      {/* 엑셀 */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2"><FileSpreadsheet size={15} className="text-emerald-400" />엑셀 다운로드 (.xlsx)</h3>
        </div>
        <div className={clsx(!ready && 'opacity-40 pointer-events-none')}>
          <ExcelRow title="전체 통합" desc="학생별 결과 + 동아리별 명단 + 통계를 하나의 파일로 저장"
            onClick={() => saveXlsx(exportResultXlsx(store.clubs, realStudents), `동아리배정_전체통합_${yr}.xlsx`)} />
          <ExcelRow title="전체 배정 명렬" desc="학번순 전체 결과 — 1개 시트"
            onClick={() => saveXlsx(exportRosterXlsx(store.clubs, realStudents), `동아리배정_전체명렬_${yr}.xlsx`)} />
          <ExcelRow title="동아리별 명렬" desc="동아리 수만큼 시트 자동 생성"
            onClick={() => saveXlsx(exportByClubXlsx(store.clubs, realStudents), `동아리배정_동아리별_${yr}.xlsx`)} />
          <ExcelRow title="학급별 배정표" desc="학년·반별 시트 자동 생성"
            onClick={() => saveXlsx(exportByClassXlsx(store.clubs, realStudents), `동아리배정_학급별_${yr}.xlsx`)} />
        </div>
      </div>

      {/* 한글 */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2"><FileText size={15} className="text-sky-400" />한글(HWP) 출력용 다운로드</h3>
          <p className="text-xs text-slate-500 mt-1">.hwp 파일 다운로드 후 → 한글에서 바로 열거나, 인쇄하세요. (동아리/학급마다 별도 페이지)</p>
        </div>
        <div className={clsx(!ready && 'opacity-40 pointer-events-none')}>
          <ExcelRow title="동아리별 명렬 (한글)" desc="동아리마다 별도 페이지로 인쇄 가능" onClick={() => saveHwp('byClub')} />
          <ExcelRow title="학급별 배정표 (한글)" desc="학반마다 별도 페이지로 인쇄 가능" onClick={() => saveHwp('byClass')} />
        </div>
      </div>

      {/* 인쇄 */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2"><Printer size={15} className="text-violet-400" />바로 인쇄 / PDF</h3>
        </div>
        <div className={clsx(!ready && 'opacity-40 pointer-events-none')}>
          <ExcelRow title="동아리별 인쇄" desc="인쇄 대화상자에서 PDF로 저장 가능" onClick={() => printResult(store, 'byClub')} />
          <ExcelRow title="학급별 인쇄" desc="인쇄 대화상자에서 PDF로 저장 가능" onClick={() => printResult(store, 'byClass')} />
        </div>
      </div>
    </div>
  )
}

// ─── 공통 컴포넌트 ─────────────────────────────────────────────────────────────

interface TabProps {
  store: ClubStore
  setStore: (updater: (prev: ClubStore) => ClubStore) => void
  showToast: (msg: string) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}

function StatCard({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="card text-center">
      <p className={clsx('text-3xl font-bold', color)}>{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-slate-400 -mt-0.5">{sub}</p>}
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  )
}
