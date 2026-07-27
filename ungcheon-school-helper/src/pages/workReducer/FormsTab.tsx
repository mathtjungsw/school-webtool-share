// 업무경감 도우미 — 공식 양식 탭
import { useState } from 'react'
import { Printer } from 'lucide-react'
import clsx from 'clsx'
import type { WRData, Student } from '../../services/workReducer/types'
import { EmptyHint, Selector } from './shared'

const fieldCls = 'bg-surface-900 border border-white/10 rounded px-2 py-1 text-sm text-white print-field'

const gradesOf = (s: Student[]) => [...new Set(s.map((x) => x.grade))].sort((a, b) => a - b)
const classesOf = (s: Student[], g: number) => [...new Set(s.filter((x) => x.grade === g).map((x) => x.classNo))].sort((a, b) => a - b)

const MOCK_AREAS = ['국어', '수학', '영어', '한국사', '탐구1', '탐구2']

export default function FormsTab({ data }: { data: WRData }) {
  const [form, setForm] = useState<'volunteer' | 'mockexam'>('volunteer')
  if (data.students.length === 0) return <EmptyHint msg="먼저 [데이터] 탭에서 명렬표를 가져오세요." />
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['volunteer', '봉사활동실시확인서'], ['mockexam', '학력평가 응시현황표']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setForm(id)}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border', form === id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/3 border-white/10 text-slate-400')}>
            {label}
          </button>
        ))}
      </div>
      {form === 'volunteer' ? <VolunteerForm data={data} /> : <MockExamForm data={data} />}
    </div>
  )
}

function VolunteerForm({ data }: { data: WRData }) {
  const [f, setF] = useState({
    no: '', regular: '내', count: '', date: '', period: '', org: data.school || '', orgTel: '',
    area: '이웃돕기활동', place: '교내', content: '',
  })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <tr>
      <td className="border border-white/15 bg-white/5 px-2 py-2 text-xs font-semibold w-28 align-middle">{label}</td>
      <td className="border border-white/15 px-2 py-1.5">{children}</td>
    </tr>
  )
  return (
    <div className="card">
      <div className="flex justify-end mb-2 no-print">
        <button onClick={() => window.print()} className="btn-ghost text-xs flex items-center gap-1"><Printer size={12} />인쇄</button>
      </div>
      <div className="print-area">
        <p className="text-right text-xs text-slate-400 mb-1">(발급번호 : {new Date().getFullYear()} - <input className={clsx(fieldCls, 'w-16 inline')} value={f.no} onChange={(e) => set('no', e.target.value)} placeholder="번호" />)</p>
        <h3 className="text-center font-bold text-white text-lg mb-4">학교교육계획에 의한 단체봉사활동 실시 확인서</h3>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <Row label="단체봉사 구분">
              <select className={fieldCls} value={f.regular} onChange={(e) => set('regular', e.target.value)}>
                <option value="내">정규교육과정 내 봉사활동</option>
                <option value="외">정규교육과정 외의 봉사활동</option>
              </select>
            </Row>
            <Row label="인적 사항">
              {data.school || '○○고등학교'} 재학생 <input className={clsx(fieldCls, 'w-20 inline')} value={f.count} onChange={(e) => set('count', e.target.value)} placeholder="인원" /> 명
            </Row>
            <Row label="봉사활동 일시">
              <input type="date" className={fieldCls} value={f.date} onChange={(e) => set('date', e.target.value)} />
              <input className={clsx(fieldCls, 'w-24 inline ml-2')} value={f.period} onChange={(e) => set('period', e.target.value)} placeholder="( 교시 )" />
            </Row>
            <Row label="봉사활동 기관">
              <input className={clsx(fieldCls, 'w-48 inline')} value={f.org} onChange={(e) => set('org', e.target.value)} />
              <span className="text-xs text-slate-400 ml-2">연락처</span>
              <input className={clsx(fieldCls, 'w-40 inline ml-1')} value={f.orgTel} onChange={(e) => set('orgTel', e.target.value)} />
            </Row>
            <Row label="봉사 영역">
              <select className={fieldCls} value={f.area} onChange={(e) => set('area', e.target.value)}>
                {['이웃돕기활동', '환경보호활동', '캠페인활동', '기타'].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Row>
            <Row label="활동 장소">
              <select className={fieldCls} value={f.place} onChange={(e) => set('place', e.target.value)}>
                <option value="교내">교내</option><option value="교외">교외</option>
              </select>
            </Row>
            <Row label="활동 내용">
              <textarea className={clsx(fieldCls, 'w-full h-20 resize-none')} value={f.content} onChange={(e) => set('content', e.target.value)} />
            </Row>
          </tbody>
        </table>
        <p className="text-center text-sm text-slate-300 mt-6">위와 같이 단체봉사활동을 실시하였음을 확인합니다.</p>
        <p className="text-center text-base font-bold text-white mt-4">{data.school || '○○고등학교'}장 (직인)</p>
      </div>
    </div>
  )
}

function MockExamForm({ data }: { data: WRData }) {
  const grades = gradesOf(data.students)
  const [grade, setGrade] = useState(grades[0] ?? 1)
  const classes = classesOf(data.students, grade)
  const [cls, setCls] = useState(classes[0] ?? 1)
  const [round, setRound] = useState('6월')
  const [absent, setAbsent] = useState<Set<string>>(new Set())
  const list = data.students.filter((s) => s.grade === grade && s.classNo === cls).sort((a, b) => a.num - b.num)
  const pickGrade = (g: number) => { setGrade(g); setCls(classesOf(data.students, g)[0] ?? 1) }
  const toggle = (key: string) => setAbsent((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center gap-2 mb-3 no-print flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-slate-400">회차
          <input value={round} onChange={(e) => setRound(e.target.value)} className="bg-surface-900 border border-white/10 rounded px-2 py-1 text-sm text-white w-20" />
        </label>
        <Selector label="학년" value={grade} options={grades} onChange={pickGrade} suffix="학년" />
        <Selector label="반" value={cls} options={classes} onChange={setCls} suffix="반" />
        <button onClick={() => window.print()} className="btn-ghost text-xs flex items-center gap-1 ml-auto"><Printer size={12} />인쇄</button>
      </div>
      <div className="print-area">
        <h3 className="text-center font-bold text-white text-base mb-1">{new Date().getFullYear()}학년도 {round} 전국연합학력평가 응시현황표</h3>
        <p className="text-center text-xs text-slate-400 mb-2">{data.school || '학교'} · {grade}학년 {cls}반</p>
        <p className="text-[11px] text-slate-500 mb-1 no-print">결시(미선택 포함) 영역을 클릭하면 X가 표시됩니다.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-white/15 bg-white/5 py-1 w-10">번호</th>
              <th className="border border-white/15 bg-white/5 py-1 w-24">성명</th>
              {MOCK_AREAS.map((a) => <th key={a} className="border border-white/15 bg-white/5 py-1">{a}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.sid || `${s.num}`}>
                <td className="border border-white/15 text-center py-1">{s.num}</td>
                <td className="border border-white/15 text-center py-1">{s.name}</td>
                {MOCK_AREAS.map((a) => {
                  const key = `${s.num}-${a}`
                  return (
                    <td key={a} onClick={() => toggle(key)}
                      className={clsx('border border-white/15 text-center py-1 cursor-pointer select-none', absent.has(key) ? 'text-red-400 font-bold' : 'text-slate-600 hover:bg-white/5')}>
                      {absent.has(key) ? 'X' : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
