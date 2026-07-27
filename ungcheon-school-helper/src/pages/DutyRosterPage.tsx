import { useState } from 'react'
import { Plus, Trash2, Download, RefreshCw, GripVertical } from 'lucide-react'
import clsx from 'clsx'

interface Task {
  id: string
  name: string       // 업무명
  dept: string       // 부서
  person: string     // 담당자
  sub: string        // 보조
  note: string       // 비고
}

interface Teacher {
  id: string
  name: string
  rank: string       // 직위
}

const DEPTS = ['교무', '연구', '학생', '진로', '체육', '보건', '상담', '행정', '정보', '환경', '방과후', '돌봄']
const RANKS = ['교장', '교감', '수석교사', '부장교사', '교사', '기간제교사', '행정실장', '행정직원', '교육공무직']

function makeTask(name: string, dept: string): Task {
  return { id: crypto.randomUUID(), name, dept, person: '', sub: '', note: '' }
}

function makeTeacher(name: string, rank: string): Teacher {
  return { id: crypto.randomUUID(), name, rank }
}

const DEFAULT_TASKS: Task[] = [
  makeTask('교육과정 편성·운영', '교무'),
  makeTask('학사일정 관리', '교무'),
  makeTask('장학 및 수업 장학', '연구'),
  makeTask('학교생활기록부 관리', '교무'),
  makeTask('학생생활지도', '학생'),
  makeTask('학교폭력 예방 및 대책', '학생'),
  makeTask('체험학습 운영', '교무'),
  makeTask('진로교육', '진로'),
  makeTask('방과후학교 운영', '방과후'),
  makeTask('학교폭력 전담기구', '학생'),
]

export default function DutyRosterPage() {
  const [tasks, setTasks] = useState<Task[]>(DEFAULT_TASKS)
  const [teachers, setTeachers] = useState<Teacher[]>([
    makeTeacher('김영희', '부장교사'),
    makeTeacher('이철수', '교사'),
    makeTeacher('박민준', '교사'),
  ])
  const [year, setYear] = useState(new Date().getFullYear())
  const [schoolName, setSchoolName] = useState('')
  const [activeTab, setActiveTab] = useState<'tasks' | 'teachers'>('tasks')

  // 업무
  const addTask = () => setTasks(t => [...t, makeTask('', '교무')])
  const removeTask = (id: string) => setTasks(t => t.filter(x => x.id !== id))
  const updateTask = (id: string, patch: Partial<Task>) => setTasks(t => t.map(x => x.id === id ? { ...x, ...patch } : x))

  // 교직원
  const addTeacher = () => setTeachers(t => [...t, makeTeacher('', '교사')])
  const removeTeacher = (id: string) => setTeachers(t => t.filter(x => x.id !== id))
  const updateTeacher = (id: string, patch: Partial<Teacher>) => setTeachers(t => t.map(x => x.id === id ? { ...x, ...patch } : x))

  const reset = () => { setTasks(DEFAULT_TASKS); setSchoolName('') }

  const handlePrint = () => window.print?.()

  const teacherNames = ['', ...teachers.filter(t => t.name).map(t => t.name)]

  // 부서별 그룹화
  const deptGroups = DEPTS.map(d => ({
    dept: d,
    tasks: tasks.filter(t => t.dept === d),
  })).filter(g => g.tasks.length > 0)

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="page-title">업무분장 관리</h1>
          <p className="page-subtitle">교직원 업무분장표를 작성하고 인쇄합니다</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-secondary flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} />초기화
          </button>
          <button onClick={handlePrint} className="btn-primary flex items-center gap-1.5 text-xs">
            <Download size={12} />인쇄/저장
          </button>
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="card mb-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">학교명</label>
            <input className="input" placeholder="○○초등학교" value={schoolName}
              onChange={e => setSchoolName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">학년도</label>
            <input type="number" className="input" value={year}
              onChange={e => setYear(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-surface-800 p-1 rounded-xl w-fit">
        {([['tasks', '업무 목록'], ['teachers', '교직원 명단']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setActiveTab(v)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm transition-all',
              activeTab === v ? 'bg-violet-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            )}>{l}</button>
        ))}
      </div>

      {activeTab === 'teachers' ? (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">교직원 명단 ({teachers.length}명)</h3>
            <button onClick={addTeacher} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12} />추가</button>
          </div>
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 pb-1">
              <span>이름</span><span>직위</span><span></span>
            </div>
            {teachers.map(t => (
              <div key={t.id} className="grid grid-cols-3 gap-2 items-center">
                <input className="input text-sm" placeholder="이름" value={t.name}
                  onChange={e => updateTeacher(t.id, { name: e.target.value })} />
                <select className="input text-sm" value={t.rank}
                  onChange={e => updateTeacher(t.id, { rank: e.target.value })}>
                  {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={() => removeTeacher(t.id)}
                  className="text-red-400 hover:text-red-300 justify-self-start p-1"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 업무 입력 테이블 */}
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">업무 목록 ({tasks.length}건)</h3>
              <button onClick={addTask} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12} />업무 추가</button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-white/10">
                  <th className="text-left py-2 pr-2 w-6"></th>
                  <th className="text-left py-2 pr-2">업무명</th>
                  <th className="text-left py-2 pr-2 w-24">부서</th>
                  <th className="text-left py-2 pr-2 w-28">담당자</th>
                  <th className="text-left py-2 pr-2 w-28">보조</th>
                  <th className="text-left py-2 pr-2">비고</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task.id} className="border-b border-white/5 group">
                    <td className="py-1.5 pr-2 text-slate-600">
                      <GripVertical size={12} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input className="input text-xs w-full" value={task.name}
                        onChange={e => updateTask(task.id, { name: e.target.value })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select className="input text-xs w-full" value={task.dept}
                        onChange={e => updateTask(task.id, { dept: e.target.value })}>
                        {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <select className="input text-xs w-full" value={task.person}
                        onChange={e => updateTask(task.id, { person: e.target.value })}>
                        {teacherNames.map(n => <option key={n} value={n}>{n || '미배정'}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <select className="input text-xs w-full" value={task.sub}
                        onChange={e => updateTask(task.id, { sub: e.target.value })}>
                        {teacherNames.map(n => <option key={n} value={n}>{n || '없음'}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input className="input text-xs w-full" placeholder="비고" value={task.note}
                        onChange={e => updateTask(task.id, { note: e.target.value })} />
                    </td>
                    <td className="py-1.5">
                      <button onClick={() => removeTask(task.id)}
                        className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 미리보기 */}
          <div className="card">
            <h3 className="font-semibold text-white text-sm mb-4">
              {year}학년도 {schoolName || '○○학교'} 업무분장표 (미리보기)
            </h3>
            {deptGroups.map(g => (
              <div key={g.dept} className="mb-4">
                <h4 className="text-xs font-semibold text-violet-300 mb-1.5 px-1">{g.dept}부</h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-900 text-slate-500">
                      <th className="text-left px-2 py-1.5 rounded-l">업무</th>
                      <th className="text-center px-2 py-1.5 w-20">담당</th>
                      <th className="text-center px-2 py-1.5 w-20">보조</th>
                      <th className="text-left px-2 py-1.5 rounded-r w-32">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.tasks.map(t => (
                      <tr key={t.id} className="border-b border-white/5">
                        <td className="px-2 py-1.5 text-slate-200">{t.name}</td>
                        <td className="px-2 py-1.5 text-center text-slate-300">{t.person || '-'}</td>
                        <td className="px-2 py-1.5 text-center text-slate-400">{t.sub || '-'}</td>
                        <td className="px-2 py-1.5 text-slate-500">{t.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {tasks.some(t => !t.person) && (
              <p className="text-xs text-amber-400 mt-2">⚠ 미배정 업무가 있습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
