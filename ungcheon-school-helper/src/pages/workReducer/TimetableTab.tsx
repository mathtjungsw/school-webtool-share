// 업무경감 도우미 — 시간표 도구 탭
import { useMemo, useState } from 'react'
import { User, Grid3x3, ArrowLeftRight, Layers, Printer } from 'lucide-react'
import clsx from 'clsx'
import { DAYS, type Day, type WRData, type Lesson } from '../../services/workReducer/types'
import { maxPeriod, teacherNames, personalGrid, commonFree, slotCandidates, homeroomCounts } from '../../services/workReducer/timetable'
import { movingGroup, findTargets, applyTarget, changeSummary, type Target } from '../../services/workReducer/swap'
import { saveTimetable, saveSets } from '../../services/workReducer/store'
import { EmptyHint } from './shared'

type TTool = 'personal' | 'free' | 'swap' | 'sets'

export default function TimetableTab({ data, update }: { data: WRData; update: (p: Partial<WRData>) => void }) {
  const [tool, setTool] = useState<TTool>('personal')
  if (data.timetable.length === 0) {
    return <EmptyHint msg="먼저 [데이터] 탭에서 시간표를 가져오세요." />
  }
  const tools: { id: TTool; label: string; icon: React.ElementType }[] = [
    { id: 'personal', label: '개인시간표', icon: User },
    { id: 'free', label: '빈 시간 찾기', icon: Grid3x3 },
    { id: 'swap', label: '수업변경', icon: ArrowLeftRight },
    { id: 'sets', label: '세트수업 관리', icon: Layers },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {tools.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTool(t.id)}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                tool === t.id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/5')}>
              <Icon size={13} />{t.label}
            </button>
          )
        })}
      </div>
      {tool === 'personal' && <PersonalTimetable data={data} />}
      {tool === 'free' && <FreeFinder data={data} />}
      {tool === 'swap' && <SwapTool data={data} update={update} />}
      {tool === 'sets' && <SetsManager data={data} update={update} />}
    </div>
  )
}

function PersonalTimetable({ data }: { data: WRData }) {
  const names = useMemo(() => teacherNames(data.timetable), [data.timetable])
  const [name, setName] = useState(names[0] ?? '')
  const periods = useMemo(() => maxPeriod(data.timetable), [data.timetable])
  const grid = useMemo(() => personalGrid(data.timetable, name, periods), [data.timetable, name, periods])

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3 no-print">
        <span className="text-xs text-slate-400">교사</span>
        <select value={name} onChange={(e) => setName(e.target.value)} className="bg-surface-900 border border-white/10 rounded-lg px-2 py-1 text-sm text-white">
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={() => window.print()} className="btn-ghost text-xs flex items-center gap-1 ml-auto"><Printer size={12} />인쇄</button>
      </div>
      <div className="print-area">
        <h3 className="text-center font-bold text-white mb-2">{name} 선생님 시간표</h3>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-white/15 bg-white/5 py-1.5 w-12">교시</th>
              {DAYS.map((d) => <th key={d} className="border border-white/15 bg-white/5 py-1.5">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: periods }, (_, i) => (
              <tr key={i}>
                <td className="border border-white/15 bg-white/5 text-center font-semibold py-2">{i + 1}</td>
                {DAYS.map((d, di) => {
                  const cell = grid[di][i]
                  return (
                    <td key={d} className="border border-white/15 text-center py-2 align-middle">
                      {cell.lessons.map((l) => (
                        <div key={l.id} className="leading-tight">
                          <div className="text-white font-medium">{l.grade}-{l.classNo}</div>
                          <div className="text-slate-400 text-[11px]">{l.subject}</div>
                        </div>
                      ))}
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

function FreeFinder({ data }: { data: WRData }) {
  const names = useMemo(() => teacherNames(data.timetable), [data.timetable])
  const [sel, setSel] = useState<string[]>([])
  const periods = useMemo(() => maxPeriod(data.timetable), [data.timetable])
  const matrix = useMemo(() => commonFree(data.timetable, sel, periods), [data.timetable, sel, periods])
  const toggle = (n: string) => setSel((s) => s.includes(n) ? s.filter((x) => x !== n) : [...s, n])

  return (
    <div className="space-y-3">
      <div className="card no-print">
        <p className="text-xs text-slate-400 mb-2">교사를 선택하면 모두가 동시에 비어있는 시간을 찾아줍니다 (회의시간 잡기).</p>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {names.map((n) => (
            <button key={n} onClick={() => toggle(n)}
              className={clsx('px-2 py-1 rounded-md text-xs border', sel.includes(n) ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-white/3 border-white/10 text-slate-400')}>
              {n}
            </button>
          ))}
        </div>
        {sel.length > 0 && <button onClick={() => setSel([])} className="text-[11px] text-slate-500 mt-2">선택 해제</button>}
      </div>
      {sel.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-white/15 bg-white/5 p-1 sticky left-0">교시</th>
                {DAYS.map((d) => <th key={d} colSpan={periods} className="border border-white/15 bg-white/5 p-1">{d}</th>)}
              </tr>
              <tr>
                <th className="border border-white/15 bg-white/5 p-1 sticky left-0">　</th>
                {DAYS.flatMap((d) => Array.from({ length: periods }, (_, i) => (
                  <th key={`${d}${i}`} className="border border-white/15 bg-white/5 px-1.5 py-1">{i + 1}</th>
                )))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-white/15 bg-white/5 p-1 font-semibold sticky left-0">공강</td>
                {DAYS.flatMap((d, di) => matrix[di].map((slot) => (
                  <td key={`${d}${slot.period}`}
                    className={clsx('border border-white/15 text-center px-1.5 py-1.5',
                      slot.allFree ? 'bg-emerald-500/30 text-emerald-200 font-bold' : 'text-slate-500')}
                    title={Object.entries(slot.busy).filter(([, ls]) => ls.length).map(([t]) => t).join(', ')}>
                    {slot.allFree ? '○' : slot.freeCount}
                  </td>
                )))}
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">○ = 선택 교사 전원 공강 · 숫자 = 공강 교사 수</p>
        </div>
      )}
    </div>
  )
}

function SwapTool({ data, update }: { data: WRData; update: (p: Partial<WRData>) => void }) {
  const names = useMemo(() => teacherNames(data.timetable), [data.timetable])
  const [teacher, setTeacher] = useState(names[0] ?? '')
  const [lessonId, setLessonId] = useState('')
  const periods = useMemo(() => maxPeriod(data.timetable), [data.timetable])

  const teacherLessons = useMemo(
    () => data.timetable.filter((l) => l.teacher === teacher).sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.period - b.period),
    [data.timetable, teacher],
  )
  const lesson = data.timetable.find((l) => l.id === lessonId)
  const group = useMemo(() => lesson ? movingGroup(lesson, data.timetable, data.sets) : [], [lesson, data.timetable, data.sets])
  const targets = useMemo(() => group.length ? findTargets(data.timetable, group, periods) : [], [group, data.timetable, periods])
  const isSet = group.length > 1

  const doApply = (t: Target) => {
    const next = applyTarget(data.timetable, group, t)
    update({ timetable: next })
    saveTimetable(next)
    setLessonId('')
  }

  return (
    <div className="space-y-3">
      <div className="card no-print space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-12">교사</span>
          <select value={teacher} onChange={(e) => { setTeacher(e.target.value); setLessonId('') }} className="bg-surface-900 border border-white/10 rounded-lg px-2 py-1 text-sm text-white">
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1.5">옮길 수업 선택</p>
          <div className="flex flex-wrap gap-1.5">
            {teacherLessons.map((l) => (
              <button key={l.id} onClick={() => setLessonId(l.id)}
                className={clsx('px-2 py-1 rounded-md text-xs border', lessonId === l.id ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-white/3 border-white/10 text-slate-400')}>
                {l.day}{l.period} · {l.grade}-{l.classNo} {l.subject}
              </button>
            ))}
          </div>
        </div>
      </div>

      {lesson && (
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-white font-semibold">{lesson.day}{lesson.period}교시 수업 이동</span>
            {isSet && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 flex items-center gap-1"><Layers size={10} />세트수업 {group.length}개 동시이동</span>}
          </div>
          {isSet && (
            <div className="text-[11px] text-amber-300/80 mb-2">
              {group.map((l: Lesson) => `${l.teacher}(${l.grade}-${l.classNo} ${l.subject})`).join(' · ')}
            </div>
          )}
          {targets.length === 0
            ? <p className="text-xs text-slate-500">옮길 수 있는 빈 시간/맞교환 슬롯이 없습니다.</p>
            : (
              <div className="flex flex-wrap gap-1.5">
                {targets.map((t, i) => (
                  <button key={i} onClick={() => doApply(t)}
                    className={clsx('px-2 py-1 rounded-md text-xs border flex items-center gap-1',
                      t.type === 'move' ? 'bg-sky-500/15 border-sky-500/30 text-sky-300' : 'bg-violet-500/15 border-violet-500/30 text-violet-300')}
                    title={changeSummary(group, t)}>
                    {t.day}{t.period} {t.type === 'move' ? '(이동)' : `(↔ ${t.counterpart.length}개 교환)`}
                  </button>
                ))}
              </div>
            )}
          <p className="text-[11px] text-slate-500 mt-2">파란색=빈 시간 이동 · 보라색=맞교환. 클릭하면 즉시 적용·저장됩니다.</p>
        </div>
      )}
    </div>
  )
}

function SetsManager({ data, update }: { data: WRData; update: (p: Partial<WRData>) => void }) {
  const [gradeFilter, setGradeFilter] = useState(0)
  const cands = useMemo(() => slotCandidates(data.timetable, homeroomCounts(data.students)), [data.timetable, data.students])
  const enabled = useMemo(() => new Set(data.sets), [data.sets])
  const grades = useMemo(() => [...new Set(cands.map((c) => c.grade))].sort((a, b) => a - b), [cands])
  const shown = gradeFilter ? cands.filter((c) => c.grade === gradeFilter) : cands

  const toggle = (key: string) => {
    const next = enabled.has(key) ? data.sets.filter((k) => k !== key) : [...data.sets, key]
    update({ sets: next }); saveSets(next)
  }
  const enableSuggested = () => {
    const next = [...new Set([...data.sets, ...cands.filter((c) => c.suggested).map((c) => c.key)])]
    update({ sets: next }); saveSets(next)
  }
  const clearAll = () => { update({ sets: [] }); saveSets([]) }

  return (
    <div className="card">
      <p className="text-xs text-slate-400 mb-3">
        <b className="text-amber-300">세트수업(동시 진행 선택과목)</b>으로 지정한 (학년·요일·교시) 블록은 수업변경 시 그 안의 수업들이 <b>항상 함께 이동</b>합니다.
        <span className="text-amber-300/80"> 추천</span> 배지는 수업수가 반 수보다 많은 선택과목 블록 추정입니다 — 직접 확인 후 지정하세요.
      </p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] text-slate-500">학년</span>
        {[0, ...grades].map((g) => (
          <button key={g} onClick={() => setGradeFilter(g)}
            className={clsx('px-2 py-0.5 rounded text-xs border', gradeFilter === g ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-white/3 border-white/10 text-slate-400')}>
            {g === 0 ? '전체' : `${g}학년`}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button onClick={enableSuggested} className="btn-ghost text-[11px] text-amber-400">추천 전체 지정</button>
          {data.sets.length > 0 && <button onClick={clearAll} className="btn-ghost text-[11px] text-slate-500">전체 해제 ({data.sets.length})</button>}
        </div>
      </div>
      {shown.length === 0 ? <p className="text-xs text-slate-500">평행 수업이 있는 슬롯이 없습니다.</p> : (
        <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
          {shown.map((c) => (
            <label key={c.key} className={clsx('flex items-start gap-2 p-2 rounded-lg border cursor-pointer', enabled.has(c.key) ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/3 border-white/10')}>
              <input type="checkbox" checked={enabled.has(c.key)} onChange={() => toggle(c.key)} className="mt-0.5 accent-amber-500" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">{c.grade}학년 {c.day}{c.period}교시</span>
                  <span className="text-[10px] text-slate-500">수업 {c.lessons.length}개</span>
                  {c.suggested && <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300">추천</span>}
                </div>
                <span className="text-[11px] text-slate-400">{c.lessons.map((l) => `${l.subject}(${l.teacher})`).join(' · ')}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
