import { useState, useMemo } from 'react'
import { Plus, Trash2, RefreshCw, GraduationCap, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { format } from 'date-fns'

const SCHOOL_TYPES = ['일반고', '자율고', '특목고', '특성화고', '마이스터고', '예술고', '체육고', '과학고', '외국어고', '국제고']
const REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']
const STATUS_OPTS = ['상담중', '지원예정', '지원완료', '합격', '불합격', '미정', '취소']
const STATUS_COLOR: Record<string, string> = {
  '합격':   'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  '불합격': 'bg-red-500/20 text-red-300 border-red-500/30',
  '지원완료': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  '지원예정': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  '상담중': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  '미정':   'bg-white/10 text-slate-400 border-white/10',
  '취소':   'bg-white/5 text-slate-600 border-white/5',
}

interface Student {
  id: string
  name: string
  grade: string
  clazz: string
  number: string
  targetSchool: string
  schoolType: string
  region: string
  status: string
  counselDate: string
  note: string
}

function makeStudent(): Student {
  return {
    id: crypto.randomUUID(), name: '', grade: '3', clazz: '1', number: '',
    targetSchool: '', schoolType: '일반고', region: '전북',
    status: '상담중', counselDate: format(new Date(), 'yyyy-MM-dd'), note: '',
  }
}

export default function AdmissionsPage() {
  const [students, setStudents] = useState<Student[]>([makeStudent()])
  const [tab, setTab] = useState<'list' | 'stats'>('list')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  const addStudent = () => setStudents(s => [...s, makeStudent()])
  const removeStudent = (id: string) => setStudents(s => s.filter(x => x.id !== id))
  const update = (id: string, patch: Partial<Student>) =>
    setStudents(s => s.map(x => x.id === id ? { ...x, ...patch } : x))

  const filtered = useMemo(() => students.filter(s => {
    if (filterStatus && s.status !== filterStatus) return false
    if (search && !s.name.includes(search) && !s.targetSchool.includes(search)) return false
    return true
  }), [students, filterStatus, search])

  const stats = useMemo(() => {
    const total = students.length
    const byStatus = STATUS_OPTS.reduce((acc, s) => {
      acc[s] = students.filter(st => st.status === s).length
      return acc
    }, {} as Record<string, number>)
    const byType = SCHOOL_TYPES.reduce((acc, t) => {
      acc[t] = students.filter(st => st.schoolType === t).length
      return acc
    }, {} as Record<string, number>)
    const byRegion = REGIONS.reduce((acc, r) => {
      acc[r] = students.filter(st => st.region === r).length
      return acc
    }, {} as Record<string, number>)
    const passRate = total > 0 ? Math.round((byStatus['합격'] ?? 0) / total * 100) : 0
    return { total, byStatus, byType, byRegion, passRate }
  }, [students])

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="page-title">고입 업무처리</h1>
          <p className="page-subtitle">학생별 고입 상담 기록부터 합격 현황 통계까지 관리합니다</p>
        </div>
        <button onClick={addStudent} className="btn-primary flex items-center gap-1.5 text-xs">
          <Plus size={13} />학생 추가
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-surface-800 p-1 rounded-xl w-fit">
        {([['list', '학생 목록'], ['stats', '통계 현황']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm transition-all',
              tab === v ? 'bg-violet-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            )}>{l}</button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          {/* 필터 */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <input className="input w-40 text-sm" placeholder="이름·학교 검색" value={search}
              onChange={e => setSearch(e.target.value)} />
            <select className="input w-32 text-sm" value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}>
              <option value="">전체 상태</option>
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs text-slate-500 self-center">{filtered.length}명 표시</span>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-white/10">
                  {['학년/반/번', '이름', '지원학교', '학교유형', '지역', '상태', '상담일', '비고', ''].map(h => (
                    <th key={h} className="text-left py-2 px-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-white/5 group">
                    <td className="py-1.5 px-2">
                      <div className="flex gap-0.5">
                        {['grade','clazz','number'].map(field => (
                          <input key={field} className="input w-9 text-xs text-center px-0.5"
                            value={(s as Record<string, string>)[field]}
                            onChange={e => update(s.id, { [field]: e.target.value } as Partial<Student>)} />
                        ))}
                      </div>
                    </td>
                    <td className="py-1.5 px-2">
                      <input className="input w-20 text-xs" placeholder="이름" value={s.name}
                        onChange={e => update(s.id, { name: e.target.value })} />
                    </td>
                    <td className="py-1.5 px-2">
                      <input className="input w-32 text-xs" placeholder="○○고등학교" value={s.targetSchool}
                        onChange={e => update(s.id, { targetSchool: e.target.value })} />
                    </td>
                    <td className="py-1.5 px-2">
                      <select className="input text-xs w-24" value={s.schoolType}
                        onChange={e => update(s.id, { schoolType: e.target.value })}>
                        {SCHOOL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <select className="input text-xs w-16" value={s.region}
                        onChange={e => update(s.id, { region: e.target.value })}>
                        {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <select className={clsx('input text-xs w-20 border rounded-lg', STATUS_COLOR[s.status])}
                        value={s.status} onChange={e => update(s.id, { status: e.target.value })}>
                        {STATUS_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <input type="date" className="input text-xs w-32" value={s.counselDate}
                        onChange={e => update(s.id, { counselDate: e.target.value })} />
                    </td>
                    <td className="py-1.5 px-2">
                      <input className="input text-xs w-28" placeholder="비고" value={s.note}
                        onChange={e => update(s.id, { note: e.target.value })} />
                    </td>
                    <td className="py-1.5 px-2">
                      <button onClick={() => removeStudent(s.id)}
                        className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'stats' && (
        <div className="space-y-4">
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '전체 학생', value: stats.total, color: 'text-white' },
              { label: '합격', value: stats.byStatus['합격'] ?? 0, color: 'text-emerald-300' },
              { label: '불합격', value: stats.byStatus['불합격'] ?? 0, color: 'text-red-300' },
              { label: '합격률', value: `${stats.passRate}%`, color: 'text-violet-300' },
            ].map(card => (
              <div key={card.label} className="card text-center">
                <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                <p className={clsx('text-3xl font-bold', card.color)}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* 상태별 현황 */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4 text-sm">상태별 현황</h3>
            <div className="space-y-2">
              {STATUS_OPTS.filter(s => stats.byStatus[s] > 0).map(s => (
                <div key={s} className="flex items-center gap-3">
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full border w-20 text-center', STATUS_COLOR[s])}>{s}</span>
                  <div className="flex-1 h-2 bg-surface-900 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500/60 rounded-full transition-all"
                      style={{ width: `${(stats.byStatus[s] / stats.total) * 100}%` }} />
                  </div>
                  <span className="text-sm text-white w-8 text-right">{stats.byStatus[s]}명</span>
                </div>
              ))}
            </div>
          </div>

          {/* 학교유형별 */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4 text-sm">학교유형별 지원 현황</h3>
            <div className="grid grid-cols-3 gap-2">
              {SCHOOL_TYPES.filter(t => stats.byType[t] > 0).map(t => (
                <div key={t} className="flex justify-between px-3 py-2 bg-surface-900 rounded-lg">
                  <span className="text-slate-400 text-xs">{t}</span>
                  <span className="text-white text-xs font-medium">{stats.byType[t]}명</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
