import React, { useState, useEffect, useMemo, useRef } from 'react'
import './ExamSupervisorPage.css'
import type { ExamState, Teacher, PreflightSlot, RunAssignmentResult, Config } from '../services/examSupervisor/types'
import { makeDefaultState, genUnits, TEACHER_CATEGORIES, nextPeriodTime, uid } from '../services/examSupervisor/defaults'
import { runAssignment, preflight } from '../services/examSupervisor/assign'
import {
  pickAndImportTeachers,
  downloadTeacherTemplate,
  exportResultExcel,
  printResult,
  saveProject,
  pickAndLoadProject,
  buildResultTables,
  buildClassGrid,
  buildTeacherGrid,
  exportClassExcel,
  exportClassHwp,
  exportTeacherExcel,
  exportTeacherHwp,
} from '../services/examSupervisor/io'

const STORE_KEY = 'exam_supervisor:data'

function useExamStore() {
  const [state, setState] = useState<ExamState>(makeDefaultState)
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    window.electron
      ?.configGet(STORE_KEY)
      .then((v) => {
        if (v) setState({ ...makeDefaultState(), ...(v as Partial<ExamState>) })
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!loaded) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { window.electron?.configSet(STORE_KEY, state) }, 500)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [state, loaded])
  return { state, setState, loaded }
}

function ExamBadge({ examName }: { examName: string }) {
  if (examName) return null
  return <span className="exam-badge">✏ 새 고사명 입력 필요</span>
}

const RULES_META: { key: keyof Config['rules']; label: string; options: string[]; desc: string }[] = [
  { key: 'selfStudyRole', label: '자율학습 감독 방식', options: ['정감독', '부감독'], desc: "교과명이 '자율학습'인 경우 감독자 1명만 배정합니다." },
  { key: 'mainSubPriority', label: '정/부감독 배정 방법', options: ['균등', '무관'], desc: '[균등] 교사 1인당 정·부감독수가 같아지도록 배정. [무관] 전체 배정 횟수만 기준.' },
  { key: 'maxDiffPerDay', label: '1일 최대 감독 차이', options: ['0', '1', '2', '제한없음'], desc: '교사 간 하루 최대 감독 횟수 편차.' },
  { key: 'excludeConsecutive', label: '최대 연속 감독 시간', options: ['1', '2', '3', '제한없음'], desc: '한 교사가 연속으로 감독할 수 있는 최대 교시 수.' },
  { key: 'excludeSubInTwo', label: '부감독 2연속 배제', options: ['적용', '미적용'], desc: '직전 교시 부감독은 다음 교시 부감독에서 제외.' },
  { key: 'excludeSameClass', label: '같은 반 연속 감독 배제', options: ['적용', '미적용'], desc: '같은 학급에 연속 감독 방지.' },
  { key: 'excludeSubjectConsec', label: '동일교과 연속 배제', options: ['적용', '미적용'], desc: '동일 교과목 시험에 연속 감독 방지.' },
  { key: 'excludeHallwayConsecutive', label: '복도감독 연속 배제', options: ['적용', '미적용'], desc: '복도 감독 연속 배정 방지.' },
  { key: 'excludeSubject', label: '담당교과 시간 배제', options: ['해당시간', '미적용'], desc: '본인 담당 교과 시험 시간 감독 제외 (Fallback에도 준수).' },
  { key: 'excludeHomeroom', label: '담임학급 시간 배제', options: ['해당시간', '미적용'], desc: '본인 담임 학급 시험 시간 감독 제외 (Fallback에도 준수).' },
  { key: 'assignPriority', label: '복도감독 배정 방식', options: ['복도감독(일반)', '복도감독(동일교과)', '무관'], desc: '[일반] 복도 체크 교사 우선. [동일교과] 해당 교시 시험 과목 담당 교사 우선.' },
  { key: 'mixGender', label: '성별 혼합 배정', options: ['적용', '미적용'], desc: '한 시험실에 남녀 교사 혼합 배정.' },
]

type SetState = React.Dispatch<React.SetStateAction<ExamState>>
type Patch = (fn: (s: ExamState) => ExamState) => void
type SetConfig = (fn: (cf: Config) => void) => void

export default function ExamSupervisorPage() {
  const { state, setState, loaded } = useExamStore()
  const [tab, setTab] = useState('settings')
  const [result, setResult] = useState<RunAssignmentResult | null>(null)
  const [shortageModal, setShortageModal] = useState<PreflightSlot[] | null>(null)
  const [resetConfirm, setResetConfirm] = useState(false)

  const patch: Patch = (fn) => setState((s) => fn(structuredClone(s)))
  const setConfig: SetConfig = (fn) => patch((s) => { fn(s.config); return s })

  const runAssign = () => {
    if (!state.periods.length) { alert('기초시간표를 먼저 생성하세요.'); return }
    if (!state.teachers.length) { alert('교사를 등록하세요.'); return }
    const pf = preflight(state)
    if (pf.hasShortage) { setShortageModal(pf.slots.filter((s) => s.shortMain > 0 || s.shortSub > 0)); return }
    doAssign()
  }

  const doAssign = () => {
    setShortageModal(null)
    const r = runAssignment(structuredClone(state))
    setState((s) => ({ ...s, assignments: r.assignments }))
    setResult(r)
    setTab('result-class')
  }

  if (!loaded) {
    return <div className="exam-supervisor-root"><div className="muted" style={{ margin: 'auto' }}>불러오는 중…</div></div>
  }

  return (
    <div className="exam-supervisor-root">
      <aside className="sidebar">
        <div className="brand">시험감독 시간표 도우미<br /><small>자동 배정</small></div>
        <nav className="nav">
          {([
            ['settings', '1', '기본 설정'],
            ['timetable', '2', '기초 시간표'],
            ['teachers', '3', '교사 관리'],
            ['absence', '4', '감독 결시/시간'],
            ['rules', '5', '배정 작업'],
            ['result-class', '6', '학급별 시간표'],
            ['result-teacher', '7', '교사별 시간표'],
          ] as const).map(([id, step, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <span className="step">{step}.</span>{label}
            </button>
          ))}
        </nav>
        <div className="tools">
          <button className="btn ghost sm" onClick={() => saveProject(state)}>💾 프로젝트 저장</button>
          <LoadButton onLoad={(data) => { setState({ ...makeDefaultState(), ...data }); setResult(null) }} />
          <button className="btn rose sm" onClick={() => setResetConfirm(true)}>⟲ 전체 초기화</button>
        </div>
      </aside>

      <main className="main">
        {tab === 'settings' && <SettingsTab state={state} setConfig={setConfig} />}
        {tab === 'timetable' && <TimetableTab state={state} setState={setState} patch={patch} setConfig={setConfig} />}
        {tab === 'teachers' && <TeachersTab state={state} patch={patch} />}
        {tab === 'absence' && <AbsenceTab state={state} patch={patch} />}
        {tab === 'rules' && <RulesTab state={state} setConfig={setConfig} onRun={runAssign} />}
        {tab === 'result-class' && <ClassResultTab state={state} patch={patch} result={result} />}
        {tab === 'result-teacher' && <TeacherResultTab state={state} result={result} />}
      </main>

      {shortageModal && (
        <div className="modal-bg" onClick={() => setShortageModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>⚠ 감독 인원 부족 경고</h3>
            <p className="muted">아래 교시는 가용 교사보다 필요 감독 인원이 많습니다. 그대로 진행하면 일부 칸이 미배정되거나 완화 배정됩니다.</p>
            <table className="grid">
              <thead><tr><th>날짜</th><th>교시</th><th>정감독 부족</th><th>부감독 부족</th></tr></thead>
              <tbody>
                {shortageModal.map((s, i) => (
                  <tr key={i}>
                    <td>{s.date}</td><td>{s.name}</td>
                    <td className={s.shortMain > 0 ? 'relaxed' : ''}>{s.shortMain || '-'}</td>
                    <td className={s.shortSub > 0 ? 'relaxed' : ''}>{s.shortSub || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setShortageModal(null)}>취소</button>
              <button className="btn amber" onClick={doAssign}>그래도 배정 실행</button>
            </div>
          </div>
        </div>
      )}

      {resetConfirm && (
        <div className="modal-bg" onClick={() => setResetConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>⚠ 전체 초기화</h3>
            <p className="muted">모든 설정·교사·배정 데이터를 초기화합니다. 이 작업은 되돌릴 수 없습니다.</p>
            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setResetConfirm(false)}>취소</button>
              <button className="btn rose" onClick={() => { setState(makeDefaultState()); setResult(null); setResetConfirm(false) }}>초기화</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadButton({ onLoad }: { onLoad: (data: Partial<ExamState>) => void }) {
  return (
    <button className="btn ghost sm" onClick={async () => { const data = await pickAndLoadProject(); if (data) onLoad(data) }}>📂 불러오기</button>
  )
}

/* ─── 1. 기본 설정 ─── */
function SettingsTab({ state, setConfig }: { state: ExamState; setConfig: SetConfig }) {
  const c = state.config
  const [subjInput, setSubjInput] = useState('')
  return (
    <>
      <h2 className="title">기본 설정</h2>
      <p className="sub">학교·시험명·학년/학급수·과목·특별실/복도를 설정합니다.</p>
      <div className="card">
        <h3>시험 정보</h3>
        <div className="field" style={{ maxWidth: 360 }}>
          <label>시험명</label>
          <input value={c.examName} placeholder="예: 2026학년도 1학기 중간고사" onChange={(e) => setConfig((cf) => { cf.examName = e.target.value })} />
        </div>
      </div>
      <div className="card">
        <h3>학년 / 학급수</h3>
        <div className="row">
          {[1, 2, 3].map((g) => (
            <label key={g} className="chip">
              <input type="checkbox" checked={c.grades.includes(g)} onChange={(e) => setConfig((cf) => { cf.grades = e.target.checked ? [...cf.grades, g].sort() : cf.grades.filter((x) => x !== g) })} />
              {g}학년
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {c.grades.map((g) => (
            <div className="field" key={g} style={{ width: 120 }}>
              <label>{g}학년 학급수</label>
              <input type="number" min="0" value={c.classes[g] ?? 0} onChange={(e) => setConfig((cf) => { cf.classes[g] = Number(e.target.value) })} />
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>과목 목록</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          {c.subjects.map((s) => (
            <span className="chip" key={s}>{s}<button onClick={() => setConfig((cf) => { cf.subjects = cf.subjects.filter((x) => x !== s) })}>×</button></span>
          ))}
        </div>
        <div className="row">
          <input value={subjInput} placeholder="과목 추가" onChange={(e) => setSubjInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && subjInput.trim()) { setConfig((cf) => { if (!cf.subjects.includes(subjInput.trim())) cf.subjects.push(subjInput.trim()) }); setSubjInput('') } }} />
          <button className="btn sm" onClick={() => { if (subjInput.trim()) { setConfig((cf) => { if (!cf.subjects.includes(subjInput.trim())) cf.subjects.push(subjInput.trim()) }); setSubjInput('') } }}>추가</button>
        </div>
      </div>
      <RoomConfig title="특별실" mode={c.specialRoomMode} modeKey="specialRoomMode" data={c.specialRooms} dataKey="specialRooms" grades={c.grades} setConfig={setConfig} />
      <RoomConfig title="복도" mode={c.hallwayMode} modeKey="hallwayMode" data={c.hallways} dataKey="hallways" grades={c.grades} setConfig={setConfig} />
    </>
  )
}

function RoomConfig({ title, mode, modeKey, data, dataKey, grades, setConfig }: {
  title: string; mode: string; modeKey: 'specialRoomMode' | 'hallwayMode'
  data: { integrated: number; perGrade: Record<number, number> }; dataKey: 'specialRooms' | 'hallways'
  grades: number[]; setConfig: SetConfig
}) {
  return (
    <div className="card">
      <h3>{title} 설정</h3>
      <div className="opts" style={{ marginBottom: 12 }}>
        {([['integrated', '통합 운영'], ['perGrade', '학년별 운영']] as const).map(([v, l]) => (
          <button key={v} className={mode === v ? 'on' : ''} onClick={() => setConfig((cf) => { cf[modeKey] = v })}>{l}</button>
        ))}
      </div>
      {mode === 'integrated' ? (
        <div className="field" style={{ width: 160 }}>
          <label>통합 {title} 개수</label>
          <input type="number" min="0" value={data.integrated || 0} onChange={(e) => setConfig((cf) => { cf[dataKey].integrated = Number(e.target.value) })} />
        </div>
      ) : (
        <div className="row">
          {grades.map((g) => (
            <div className="field" key={g} style={{ width: 120 }}>
              <label>{g}학년 {title}</label>
              <input type="number" min="0" value={(data.perGrade || {})[g] || 0}
                onChange={(e) => setConfig((cf) => { cf[dataKey].perGrade = cf[dataKey].perGrade || {}; cf[dataKey].perGrade[g] = Number(e.target.value) })} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── 2. 기초 시간표 ─── */
function TimetableTab({ state, setState: _setState, patch, setConfig }: { state: ExamState; setState: SetState; patch: Patch; setConfig: SetConfig }) {
  const c = state.config
  const [newDate, setNewDate] = useState('')
  const addDate = () => {
    if (!newDate) return
    setConfig((cf) => { if (!cf.examDates.includes(newDate)) cf.examDates = [...cf.examDates, newDate].sort() })
    setNewDate('')
  }
  const generatePeriods = () => {
    if (!c.examDates.length) { alert('시험 날짜를 먼저 추가하세요.'); return }
    patch((s) => {
      const periods = s.config.examDates.flatMap((date) =>
        s.config.grades.flatMap((g) =>
          (s.config.periodTimes[g] || []).map((pt) => ({ id: `p-${date}-${g}-${pt.name}`, date, name: pt.name, time: pt.time, grade: g.toString() })),
        ),
      )
      s.periods = periods
      const ids = new Set(periods.map((p) => p.id))
      Object.keys(s.classSubjects).forEach((pid) => { if (!ids.has(pid)) delete s.classSubjects[pid] })
      s.assignments = {}
      return s
    })
  }
  return (
    <>
      <h2 className="title">기초 시간표</h2>
      <p className="sub">시험 날짜와 학년별 교시·시간을 정한 뒤 [기초시간표 생성]을 누르고, 각 시험실에 과목을 입력하세요.</p>
      <div className="card">
        <h3>시험 날짜</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          {c.examDates.map((d) => (
            <span className="chip" key={d}>{d}<button onClick={() => setConfig((cf) => { cf.examDates = cf.examDates.filter((x) => x !== d) })}>×</button></span>
          ))}
          {!c.examDates.length && <span className="muted">아직 날짜가 없습니다.</span>}
        </div>
        <div className="row">
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button className="btn sm" onClick={addDate}>날짜 추가</button>
        </div>
      </div>
      <div className="card">
        <h3>학년별 교시·시간</h3>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {c.grades.map((g) => (
            <div key={g} style={{ flex: '1 1 280px' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{g}학년</div>
              {(c.periodTimes[g] || []).map((pt, i) => (
                <div className="row" key={pt.id} style={{ marginBottom: 6 }}>
                  <input style={{ width: 70 }} value={pt.name} onChange={(e) => setConfig((cf) => { cf.periodTimes[g][i].name = e.target.value })} />
                  <input style={{ width: 130 }} value={pt.time} onChange={(e) => setConfig((cf) => { cf.periodTimes[g][i].time = e.target.value })} />
                  <button className="btn rose sm" onClick={() => setConfig((cf) => { cf.periodTimes[g] = cf.periodTimes[g].filter((_, x) => x !== i) })}>×</button>
                </div>
              ))}
              <button className="btn ghost sm" onClick={() => setConfig((cf) => {
                const arr = cf.periodTimes[g] || (cf.periodTimes[g] = [])
                const last = arr[arr.length - 1]
                arr.push({ id: uid('pt'), name: `${arr.length + 1}교시`, time: last ? nextPeriodTime(last.time) : '09:00~09:50' })
              })}>+ 교시 추가</button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn green" onClick={generatePeriods}>⚙ 기초시간표 생성</button>
          <span className="muted">생성 시 기존 과목 입력 및 배정 데이터가 초기화됩니다.</span>
        </div>
      </div>
      {state.periods.length > 0 && <SubjectGrid state={state} patch={patch} />}
    </>
  )
}

function SubjectGrid({ state, patch }: { state: ExamState; patch: Patch }) {
  const c = state.config
  const units = useMemo(() => genUnits(c), [c])
  const setCell = (pid: string, uid_: string, val: string) =>
    patch((s) => {
      s.classSubjects[pid] || (s.classSubjects[pid] = {})
      if (val) s.classSubjects[pid][uid_] = val
      else delete s.classSubjects[pid][uid_]
      return s
    })
  return (
    <div className="card">
      <h3>과목 배치표</h3>
      <p className="help">교실 칸은 시험 과목을 선택(빈칸=시험 없음), 복도 칸은 [배정] 체크 시 복도 감독을 운영합니다. 특별실은 해당 학년에 시험이 있으면 자동 운영됩니다.</p>
      {c.grades.map((g) => {
        const gradePeriods = state.periods.filter((p) => p.grade === g.toString())
        const gradeUnits = units.filter((u) => u.grade === g.toString() || u.grade === '전체')
        if (!gradePeriods.length) return null
        return (
          <div key={g} style={{ overflowX: 'auto', marginBottom: 18 }}>
            <div style={{ fontWeight: 700, margin: '6px 0' }}>{g}학년</div>
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>시험실</th>
                  {gradePeriods.map((p) => <th key={p.id}>{p.date.slice(5)}<br />{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {gradeUnits.map((u) => (
                  <tr key={u.id}>
                    <td className="left">
                      <span className={`tag ${u.type}`}>{u.type === 'class' ? '교실' : u.type === 'special' ? '특별실' : '복도'}</span> {u.fullLabel || u.label}
                    </td>
                    {gradePeriods.map((p) => {
                      const val = (state.classSubjects[p.id] || {})[u.id] || ''
                      if (u.type === 'class')
                        return (<td key={p.id}><select value={val} onChange={(e) => setCell(p.id, u.id, e.target.value)} style={{ width: '100%' }}><option value="">-</option>{c.subjects.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>)
                      if (u.type === 'hallway')
                        return (<td key={p.id}><input type="checkbox" checked={val === '배정'} onChange={(e) => setCell(p.id, u.id, e.target.checked ? '배정' : '')} /></td>)
                      return <td key={p.id} className="muted">자동</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

/* ─── 3. 교사 관리 ─── */
function TeachersTab({ state, patch }: { state: ExamState; patch: Patch }) {
  const c = state.config
  const units = useMemo(() => genUnits(c), [c])
  const homeroomOptions = units.filter((u) => u.type === 'class').map((u) => u.id)
  const add = () => patch((s) => {
    s.teachers.push({ id: uid('t'), name: '', category: '교사', isMain: true, isSub: true, isSpecial: true, isHallway: true, homeroom: '', subjects: [], avoidance: [], exclusions: [], absences: [], isAbsentAll: false, maxPeriods: '', gender: '', note: '', absenceNotes: '' })
    return s
  })
  const upd = <K extends keyof Teacher>(id: string, key: K, val: Teacher[K]) =>
    patch((s) => { const t = s.teachers.find((x) => x.id === id); if (t) t[key] = val; return s })
  const del = (id: string) => patch((s) => { s.teachers = s.teachers.filter((x) => x.id !== id); return s })
  const importExcel = async () => {
    const ts = await pickAndImportTeachers()
    if (ts.length) patch((s) => { s.teachers = [...s.teachers, ...ts]; return s })
  }
  return (
    <>
      <h2 className="title">교사 관리</h2>
      <p className="sub">감독 교사를 등록합니다. 정/부감독·특별실·복도 가능 여부, 담임 학급, 담당 과목을 지정하세요.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={add}>+ 교사 추가</button>
        <button className="btn ghost" onClick={importExcel}>📥 엑셀 가져오기</button>
        <button className="btn ghost" onClick={downloadTeacherTemplate}>📄 양식 다운로드</button>
        <span className="muted">등록 {state.teachers.length}명</span>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="grid">
          <thead>
            <tr><th>이름</th><th>구분</th><th>정감독</th><th>부감독</th><th>특별실</th><th>복도</th><th>담임학급</th><th>담당과목</th><th>최대시수</th><th>종일결</th><th>기피학급1</th><th>기피학급2</th><th>참고사항</th><th></th></tr>
          </thead>
          <tbody>
            {state.teachers.map((t) => (
              <tr key={t.id}>
                <td><input style={{ width: 90 }} value={t.name} onChange={(e) => upd(t.id, 'name', e.target.value)} /></td>
                <td><select value={t.category} onChange={(e) => upd(t.id, 'category', e.target.value as Teacher['category'])}>{TEACHER_CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}</select></td>
                <td><input type="checkbox" checked={!!t.isMain} onChange={(e) => upd(t.id, 'isMain', e.target.checked)} /></td>
                <td><input type="checkbox" checked={!!t.isSub} onChange={(e) => upd(t.id, 'isSub', e.target.checked)} /></td>
                <td><input type="checkbox" checked={t.isSpecial !== false} onChange={(e) => upd(t.id, 'isSpecial', e.target.checked)} /></td>
                <td><input type="checkbox" checked={t.isHallway !== false} onChange={(e) => upd(t.id, 'isHallway', e.target.checked)} /></td>
                <td><select value={t.homeroom || ''} onChange={(e) => upd(t.id, 'homeroom', e.target.value)}><option value="">-</option>{homeroomOptions.map((h) => <option key={h} value={h}>{h}</option>)}</select></td>
                <td><input style={{ width: 130 }} value={(t.subjects || []).join(',')} placeholder="국어,문학" onChange={(e) => upd(t.id, 'subjects', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></td>
                <td><input type="number" style={{ width: 60 }} value={t.maxPeriods ?? ''} onChange={(e) => upd(t.id, 'maxPeriods', e.target.value === '' ? '' : Number(e.target.value))} /></td>
                <td><input type="checkbox" checked={!!t.isAbsentAll} onChange={(e) => upd(t.id, 'isAbsentAll', e.target.checked)} /></td>
                <td><select value={(t.avoidance || [])[0] || ''} onChange={(e) => { const a = [...(t.avoidance || [])]; a[0] = e.target.value; upd(t.id, 'avoidance', a.filter(Boolean)) }}><option value="">-</option>{homeroomOptions.map((h) => <option key={h} value={h}>{h}</option>)}</select></td>
                <td><select value={(t.avoidance || [])[1] || ''} onChange={(e) => { const a = [...(t.avoidance || [])]; a[1] = e.target.value; upd(t.id, 'avoidance', a.filter(Boolean)) }}><option value="">-</option>{homeroomOptions.map((h) => <option key={h} value={h}>{h}</option>)}</select></td>
                <td><input style={{ width: 100 }} value={t.note || ''} onChange={(e) => upd(t.id, 'note', e.target.value)} placeholder="비고" /></td>
                <td><button className="btn rose sm" onClick={() => del(t.id)}>×</button></td>
              </tr>
            ))}
            {!state.teachers.length && <tr><td colSpan={14} className="muted">교사를 추가하거나 엑셀로 가져오세요.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ─── 4. 감독 결시/시간 ─── */
function AbsenceTab({ state, patch }: { state: ExamState; patch: Patch }) {
  const [filterCat, setFilterCat] = useState<Teacher['category']>('교사')
  const [search, setSearch] = useState('')
  const [popup, setPopup] = useState<{ teacherId: string; date: string; periodName: string } | null>(null)
  const [popScope, setPopScope] = useState('전체')
  const [popTarget, setPopTarget] = useState('')

  const periods = state.periods || []
  const teachers = state.teachers || []
  const seen = new Set<string>()
  const cols: { date: string; periodName: string }[] = []
  for (const p of periods) {
    const key = `${p.date}|${p.name}`
    if (!seen.has(key)) { seen.add(key); cols.push({ date: p.date, periodName: p.name }) }
  }
  const filtered = teachers.filter((t) => t.category === filterCat).filter((t) => !search || t.name.includes(search))
  const c = state.config
  const homeroomOptions: string[] = []
  ;(c.grades || []).forEach((g) => { for (let v = 1; v <= ((c.classes || {})[g] || 0); v++) homeroomOptions.push(`${g}학년 ${v}반`) })
  const gradeOptions = (c.grades || []).map((g) => `${g}학년`)

  const getAbsence = (teacher: Teacher, date: string, periodName: string) =>
    (teacher.absences || []).find((a) => a.date === date && a.periodName === periodName)
  const cellLabel = (ab: ReturnType<typeof getAbsence>) => { if (!ab) return '+'; if (ab.scope === 'ALL') return '전체'; if (ab.scope === 'GRADE') return ab.target || '학년'; return ab.target || '학급' }
  const cellColor = (ab: ReturnType<typeof getAbsence>) => { if (!ab) return undefined; if (ab.scope === 'ALL') return 'var(--rose)'; return 'var(--amber, #f59e0b)' }

  const openPopup = (teacherId: string, date: string, periodName: string) => {
    const t = teachers.find((x) => x.id === teacherId)
    const ab = t ? getAbsence(t, date, periodName) : null
    if (ab) { setPopScope(ab.scope === 'ALL' ? '전체' : ab.scope === 'GRADE' ? '특정학년' : '특정학급'); setPopTarget(ab.target || '') }
    else { setPopScope('전체'); setPopTarget('') }
    setPopup({ teacherId, date, periodName })
  }
  const saveAbsence = () => {
    if (!popup) return
    const scope = popScope === '전체' ? 'ALL' : popScope === '특정학년' ? 'GRADE' : 'CLASS' as const
    const newAb = { id: Date.now().toString(), date: popup.date, periodName: popup.periodName, scope, target: scope === 'ALL' ? '' : popTarget }
    patch((s) => {
      const t = s.teachers.find((x) => x.id === popup.teacherId); if (!t) return s
      t.absences = (t.absences || []).filter((a) => !(a.date === popup.date && a.periodName === popup.periodName))
      t.absences.push(newAb); return s
    })
    setPopup(null)
  }
  const deleteAbsence = () => {
    if (!popup) return
    patch((s) => { const t = s.teachers.find((x) => x.id === popup.teacherId); if (t) t.absences = (t.absences || []).filter((a) => !(a.date === popup.date && a.periodName === popup.periodName)); return s })
    setPopup(null)
  }
  const updTeacher = <K extends keyof Teacher>(id: string, key: K, val: Teacher[K]) =>
    patch((s) => { const t = s.teachers.find((x) => x.id === id); if (t) t[key] = val; return s })

  const dateGroups: { date: string; count: number }[] = []
  for (const col of cols) {
    const last = dateGroups[dateGroups.length - 1]
    if (last && last.date === col.date) last.count++
    else dateGroups.push({ date: col.date, count: 1 })
  }

  if (!periods.length) return (<><h2 className="title">감독 결시/시간 등록</h2><p className="sub muted">기초시간표를 먼저 생성하세요. (2단계)</p></>)

  return (
    <>
      <h2 className="title">감독 결시/시간 등록</h2>
      <p className="sub">교사별로 결시할 교시를 등록합니다. 배정 시 해당 교시에서 제외됩니다.</p>
      <div className="card" style={{ padding: '10px 12px', marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 6 }}>
          {TEACHER_CATEGORIES.map((cat) => <button key={cat} className={`btn sm ${filterCat === cat ? '' : 'ghost'}`} onClick={() => setFilterCat(cat)}>{cat}</button>)}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 검색…" style={{ width: 130 }} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="grid" style={{ minWidth: 600, whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ minWidth: 28 }}>#</th>
              <th rowSpan={2} style={{ minWidth: 80 }}>성명</th>
              <th rowSpan={2} style={{ minWidth: 60 }}>제한시수</th>
              <th rowSpan={2} style={{ minWidth: 56 }}>종일결시</th>
              {dateGroups.map((dg) => <th key={dg.date} colSpan={dg.count} style={{ textAlign: 'center', background: 'var(--panel2)' }}>{dg.date}</th>)}
              <th rowSpan={2} style={{ minWidth: 100 }}>참고사항</th>
            </tr>
            <tr>{cols.map((col, i) => <th key={i} style={{ minWidth: 52, fontWeight: 400, fontSize: 11 }}>{col.periodName}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((t, idx) => (
              <tr key={t.id}>
                <td style={{ color: 'var(--muted)', fontSize: 11 }}>{idx + 1}</td>
                <td>{t.name || <span className="muted">-</span>}</td>
                <td><input type="number" style={{ width: 52 }} value={t.maxPeriods ?? ''} onChange={(e) => updTeacher(t.id, 'maxPeriods', e.target.value === '' ? '' : Number(e.target.value))} /></td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!t.isAbsentAll} onChange={(e) => updTeacher(t.id, 'isAbsentAll', e.target.checked)} /></td>
                {cols.map((col, i) => {
                  const ab = getAbsence(t, col.date, col.periodName)
                  return (
                    <td key={i} style={{ textAlign: 'center' }}>
                      <button className="btn sm ghost" style={{ minWidth: 44, color: cellColor(ab), borderColor: ab ? cellColor(ab) : undefined, fontWeight: ab ? 700 : 400 }} onClick={() => openPopup(t.id, col.date, col.periodName)}>{cellLabel(ab)}</button>
                    </td>
                  )
                })}
                <td><input style={{ width: 96 }} value={t.absenceNotes || ''} onChange={(e) => updTeacher(t.id, 'absenceNotes', e.target.value)} placeholder="비고" /></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={4 + cols.length + 1} className="muted">{filterCat} 구분의 교사가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      {popup && (
        <div className="modal-bg" onClick={() => setPopup(null)}>
          <div className="modal" style={{ minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>{teachers.find((x) => x.id === popup.teacherId)?.name || '?'} — {popup.date} {popup.periodName}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="lab">결시 범위</label>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  {['전체', '특정학년', '특정학급'].map((s) => <button key={s} className={`btn sm ${popScope === s ? '' : 'ghost'}`} onClick={() => setPopScope(s)}>{s}</button>)}
                </div>
              </div>
              {popScope === '특정학년' && (<div><label className="lab">학년 선택</label><select value={popTarget} onChange={(e) => setPopTarget(e.target.value)} style={{ marginTop: 4, width: '100%' }}><option value="">-</option>{gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>)}
              {popScope === '특정학급' && (<div><label className="lab">학급 선택</label><select value={popTarget} onChange={(e) => setPopTarget(e.target.value)} style={{ marginTop: 4, width: '100%' }}><option value="">-</option>{homeroomOptions.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>)}
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button className="btn rose sm" onClick={deleteAbsence}>삭제</button>
                <button className="btn ghost sm" onClick={() => setPopup(null)}>취소</button>
                <button className="btn sm" onClick={saveAbsence}>확인</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ─── 5. 배정 원칙 ─── */
function RulesTab({ state, setConfig, onRun }: { state: ExamState; setConfig: SetConfig; onRun: () => void }) {
  const c = state.config
  const rules = c.rules
  const methodKeys = useMemo(() => {
    const keys: { key: string; label: string }[] = []
    c.grades.forEach((g) => keys.push({ key: g.toString(), label: `${g}학년 교실` }))
    if (c.specialRoomMode === 'integrated') keys.push({ key: 'special_integrated', label: '통합 특별실' })
    else c.grades.forEach((g) => keys.push({ key: `special_${g}`, label: `${g}학년 특별실` }))
    if (c.hallwayMode === 'integrated') keys.push({ key: 'hallway_integrated', label: '통합 복도' })
    else c.grades.forEach((g) => keys.push({ key: `hallway_${g}`, label: `${g}학년 복도` }))
    return keys
  }, [c.grades, c.specialRoomMode, c.hallwayMode])

  const setMethod = (k: string, field: string, val: string) =>
    setConfig((cf) => {
      cf.assignmentMethods[k] || (cf.assignmentMethods[k] = { type: '1인 감독', detail: '' })
      ;(cf.assignmentMethods[k] as Record<string, string>)[field] = val
      if (field === 'type') {
        if (val === '2인 감독') cf.assignmentMethods[k].detail = '교사-교사'
        else if (val === '3인 감독') cf.assignmentMethods[k].detail = '교사-명예교사-교육봉사자'
      }
    })

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h2 className="title">감독 배정 원칙</h2><p className="sub">배정 방법과 제약 규칙을 정한 뒤 [자동 배정 실행]을 누르세요.</p></div>
        <button className="btn green" style={{ fontSize: 15, padding: '12px 22px' }} onClick={onRun}>▶ 자동 배정 실행</button>
      </div>
      <div className="card">
        <h3>Ⅰ. 배정 방법 (단위별 감독 인원)</h3>
        <div className="row">
          {methodKeys.map(({ key, label }) => {
            const m = c.assignmentMethods[key] || { type: '1인 감독', detail: '' }
            return (
              <div key={key} className="card" style={{ width: 250, margin: 0, background: 'var(--panel2)' }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
                <select value={m.type} onChange={(e) => setMethod(key, 'type', e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
                  <option>1인 감독</option><option>2인 감독</option><option>3인 감독</option>
                </select>
                {m.type === '2인 감독' && <select value={m.detail} onChange={(e) => setMethod(key, 'detail', e.target.value)} style={{ width: '100%' }}><option>교사-교사</option><option>교사-명예교사</option><option>교사-교육봉사자</option></select>}
                {m.type === '3인 감독' && <div className="help">교사 + 명예교사 + 교육봉사자</div>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="card">
        <h3>Ⅱ. 제약 규칙</h3>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {RULES_META.map((r) => (
            <div key={r.key} style={{ width: 320, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.label}</div>
              <div className="opts" style={{ margin: '6px 0' }}>
                {r.options.map((o) => <button key={o} className={rules[r.key] === o ? 'on' : ''} onClick={() => setConfig((cf) => { (cf.rules as Record<string, string>)[r.key] = o })}>{o}</button>)}
              </div>
              <div className="help">{r.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* ─── 6. 학급별 시간표 ─── */
interface CtxMenu { x: number; y: number; periodId: string; unitId: string; role: string; currentId: string }
interface DragSrc { periodId: string; unitId: string; role: string; teacherId: string }

function ClassResultTab({ state, patch, result }: { state: ExamState; patch: Patch; result: RunAssignmentResult | null }) {
  const [zoom, setZoom] = useState(100)
  const [gradeFilter, setGradeFilter] = useState('전체')
  const [showSubject, setShowSubject] = useState(true)
  const [showCode, setShowCode] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const dragSrc = useRef<DragSrc | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const assignments = state.assignments || {}
  const { cols, units, cells, periodMap } = useMemo(() => buildClassGrid(state, assignments), [state])
  const gradeOptions = ['전체', ...(state.config.grades || []).map((g) => `${g}학년`)]
  const filteredUnits = useMemo(() => units.filter((u) => {
    if (gradeFilter === '전체') return true
    const g = gradeFilter.replace('학년', '')
    return u.grade === g || u.grade === '전체'
  }), [units, gradeFilter])

  useEffect(() => {
    if (!ctxMenu) return
    const h = (e: MouseEvent) => { if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ctxMenu])

  const checkViolation = (teacherId: string, periodId: string, unitId: string) => {
    const teacher = state.teachers.find((t) => t.id === teacherId); if (!teacher) return null
    const period = (state.periods || []).find((p) => p.id === periodId); if (!period) return null
    const c = state.config; const msgs: string[] = []
    if (teacher.isAbsentAll) msgs.push('종일 결시')
    const ab = (teacher.absences || []).find((a) => a.date === period.date && a.periodName === period.name)
    if (ab) msgs.push(`결시(${ab.scope === 'ALL' ? '전체' : ab.target})`)
    if (c.rules?.excludeHomeroom === '해당시간' && teacher.homeroom) {
      const u = genUnits(c).find((u) => u.id === unitId)
      if (u && (u.fullLabel === teacher.homeroom || u.id === teacher.homeroom)) msgs.push('담임학급 배제 위반')
    }
    if (c.rules?.excludeSubject === '해당시간' && teacher.subjects?.length) {
      const subject = (state.classSubjects?.[periodId] || {})[unitId]
      if (subject && teacher.subjects.includes(subject)) msgs.push(`담당교과(${subject}) 배제 위반`)
    }
    if (teacher.avoidance?.length) {
      const u = genUnits(c).find((u) => u.id === unitId)
      if (u && teacher.avoidance.some((av) => av === u.fullLabel || av === u.id)) msgs.push('기피학급 위반')
    }
    return msgs.length ? `⚠ ${teacher.name}: ${msgs.join(', ')}` : null
  }

  const showWarn = (msg: string) => {
    setWarning(msg); if (warnTimer.current) clearTimeout(warnTimer.current)
    warnTimer.current = setTimeout(() => setWarning(null), 5000)
  }

  const execSwap = (src: DragSrc, dst: { periodId: string; unitId: string; role: string; teacherId: string }) => {
    if (!dst.periodId) return
    const roleKey: Record<string, 'main' | 'sub' | 'sub2'> = { '정': 'main', '부': 'sub', '2부': 'sub2' }
    patch((s) => {
      const get = (pid: string, uid_: string) => {
        s.assignments[pid] = s.assignments[pid] || {}; s.assignments[pid][uid_] = s.assignments[pid][uid_] || { main: null, sub: null, sub2: null }
        return s.assignments[pid][uid_]
      }
      const sc = get(src.periodId, src.unitId); const dc = get(dst.periodId, dst.unitId)
      const sk = roleKey[src.role] || 'main'; const dk = roleKey[dst.role] || 'main'
      const tmp = sc[sk]; sc[sk] = dc[dk]; dc[dk] = tmp; return s
    })
    if (src.teacherId) { const v = checkViolation(src.teacherId, dst.periodId, dst.unitId); if (v) showWarn(v) }
    else if (dst.teacherId) { const v = checkViolation(dst.teacherId, src.periodId, src.unitId); if (v) showWarn(v) }
    dragSrc.current = null
  }

  const replaceTeacher = (periodId: string, unitId: string, role: string, newId: string | null) => {
    const roleKey: Record<string, 'main' | 'sub' | 'sub2'> = { '정': 'main', '부': 'sub', '2부': 'sub2' }
    patch((s) => {
      s.assignments[periodId] = s.assignments[periodId] || {}
      s.assignments[periodId][unitId] = s.assignments[periodId][unitId] || { main: null, sub: null, sub2: null }
      s.assignments[periodId][unitId][roleKey[role] || 'main'] = newId; return s
    })
    if (newId) { const v = checkViolation(newId, periodId, unitId); if (v) showWarn(v) }
    setCtxMenu(null)
  }

  const dateGroups: { date: string; count: number }[] = []
  for (const col of cols) {
    const last = dateGroups[dateGroups.length - 1]
    if (last && last.date === col.date) last.count++
    else dateGroups.push({ date: col.date, count: 1 })
  }

  if (!state.periods.length || !Object.keys(assignments).length) {
    return (<><h2 className="title">학급별 감독시간표 <ExamBadge examName={state.config.examName} /></h2><p className="sub muted">5단계 [배정 작업]에서 자동 배정을 실행하면 여기서 결과를 확인할 수 있습니다.</p></>)
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div><h2 className="title" style={{ margin: 0 }}>학급별 감독시간표 <ExamBadge examName={state.config.examName} /></h2><p className="sub" style={{ marginBottom: 0, marginTop: 2 }}>Tip: 드래그 교환 / 우클릭 교체</p></div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" onClick={() => exportClassExcel(state, assignments, gradeFilter)}>📊 엑셀</button>
          <button className="btn ghost sm" onClick={() => exportClassHwp(state, assignments, gradeFilter)}>📄 한글</button>
          <button className="btn ghost sm" onClick={() => printResult(state, assignments)}>🖨 인쇄</button>
        </div>
      </div>
      {result && (
        <div className={`banner ${result.emptyRemain > 0 ? 'warn' : 'ok'}`} style={{ marginBottom: 10 }}>
          {result.emptyRemain > 0
            ? `배정 완료 — 정상 ${result.totalAssigned}칸, 완화 ${result.emptyFixed}칸, 미배정 ${result.emptyRemain}칸`
            : `✓ 배정 완료 — 총 ${result.totalAssigned}칸${result.emptyFixed > 0 ? ` (완화 ${result.emptyFixed}칸 포함)` : ''}`}
        </div>
      )}
      <div className="rg-toolbar">
        <div className="row" style={{ gap: 4 }}>
          <button className="btn ghost sm" onClick={() => setZoom((z) => Math.max(50, z - 10))}>⊖</button>
          <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center' }}>{zoom}%</span>
          <button className="btn ghost sm" onClick={() => setZoom((z) => Math.min(150, z + 10))}>⊕</button>
        </div>
        <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} style={{ width: 90 }}>{gradeOptions.map((g) => <option key={g}>{g}</option>)}</select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={showSubject} onChange={(e) => setShowSubject(e.target.checked)} /> 과목명</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={showCode} onChange={(e) => setShowCode(e.target.checked)} /> 코드</label>
      </div>
      <div className="rg-wrap">
        <div className="rg-scale" style={{ transform: `scale(${zoom / 100})`, width: zoom < 100 ? `${10000 / zoom}%` : '100%' }}>
          <table className="rg">
            <thead>
              <tr>
                <th rowSpan={2} className="rg-room">시험실</th>
                {dateGroups.map((dg) => <th key={dg.date} colSpan={dg.count} className="rg-date">{dg.date}</th>)}
              </tr>
              <tr>{cols.map((col) => <th key={col.key}>{col.periodName}</th>)}</tr>
            </thead>
            <tbody>
              {filteredUnits.map((u) => (
                <tr key={u.id}>
                  <td className="rg-room left">
                    <span className={`tag ${u.type}`}>{u.type === 'class' ? '교실' : u.type === 'special' ? '특별실' : '복도'}</span>{' '}
                    {showCode ? u.id : (u.fullLabel || u.label)}
                  </td>
                  {cols.map((col) => {
                    const cell = cells[u.id]?.[col.key]
                    const emptyPid = periodMap?.[u.id]?.[col.key]
                    if (!cell) {
                      return (
                        <td key={col.key}
                          onDragOver={(e) => { if (emptyPid) { e.preventDefault(); e.currentTarget.classList.add('rg-drop-over') } }}
                          onDragLeave={(e) => e.currentTarget.classList.remove('rg-drop-over')}
                          onDrop={(e) => {
                            e.currentTarget.classList.remove('rg-drop-over')
                            const src = dragSrc.current
                            if (!src || !emptyPid) { dragSrc.current = null; return }
                            execSwap(src, { periodId: emptyPid, unitId: u.id, role: src.role, teacherId: '' })
                          }}
                        />
                      )
                    }
                    const { periodId, mainId, main, subId, sub, sub2Id, sub2, subject, _relaxed } = cell
                    return (
                      <td key={col.key} className={_relaxed ? 'rg-relax' : ''}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('rg-drop-over') }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('rg-drop-over')}
                        onDrop={(e) => {
                          e.currentTarget.classList.remove('rg-drop-over')
                          const src = dragSrc.current
                          if (!src || (src.periodId === periodId && src.unitId === u.id)) { dragSrc.current = null; return }
                          const dstTid = src.role === '정' ? mainId : src.role === '부' ? subId : sub2Id
                          execSwap(src, { periodId, unitId: u.id, role: src.role, teacherId: dstTid })
                        }}
                      >
                        {showSubject && subject && <div className="rg-subj">{subject}</div>}
                        {mainId && <span className="rg-t" draggable onDragStart={(e) => { dragSrc.current = { periodId, unitId: u.id, role: '정', teacherId: mainId }; e.dataTransfer.effectAllowed = 'move'; e.stopPropagation() }} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: Math.min(e.clientX, window.innerWidth - 190), y: Math.min(e.clientY, window.innerHeight - 310), periodId, unitId: u.id, role: '정', currentId: mainId }) }}>{main}</span>}
                        {subId && <span className="rg-t sub" draggable onDragStart={(e) => { dragSrc.current = { periodId, unitId: u.id, role: '부', teacherId: subId }; e.dataTransfer.effectAllowed = 'move'; e.stopPropagation() }} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: Math.min(e.clientX, window.innerWidth - 190), y: Math.min(e.clientY, window.innerHeight - 310), periodId, unitId: u.id, role: '부', currentId: subId }) }}>{sub}</span>}
                        {sub2Id && <span className="rg-t sub2" draggable onDragStart={(e) => { dragSrc.current = { periodId, unitId: u.id, role: '2부', teacherId: sub2Id }; e.dataTransfer.effectAllowed = 'move'; e.stopPropagation() }} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: Math.min(e.clientX, window.innerWidth - 190), y: Math.min(e.clientY, window.innerHeight - 310), periodId, unitId: u.id, role: '2부', currentId: sub2Id }) }}>{sub2}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {ctxMenu && (
        <div ref={ctxRef} className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <div className="ctx-menu-title">{ctxMenu.role}감독 교체</div>
          <button className="ctx-item del" onClick={() => replaceTeacher(ctxMenu.periodId, ctxMenu.unitId, ctxMenu.role, null)}>× 제거</button>
          {state.teachers.map((t) => <button key={t.id} className={`ctx-item${t.id === ctxMenu.currentId ? ' current' : ''}`} onClick={() => replaceTeacher(ctxMenu.periodId, ctxMenu.unitId, ctxMenu.role, t.id)}>{t.name} <span style={{ fontSize: 10, color: 'var(--muted)' }}>({t.category})</span></button>)}
        </div>
      )}
      {warning && <div className="ctx-warn" onClick={() => setWarning(null)}>{warning}</div>}
    </>
  )
}

/* ─── 7. 교사별 시간표 ─── */
function TeacherResultTab({ state, result }: { state: ExamState; result: RunAssignmentResult | null }) {
  const [zoom, setZoom] = useState(100)
  const assignments = state.assignments || {}
  const { cols, teachers, tcells } = useMemo(() => buildTeacherGrid(state, assignments), [state])
  const counts = result?.counts

  const dateGroups: { date: string; count: number }[] = []
  for (const col of cols) {
    const last = dateGroups[dateGroups.length - 1]
    if (last && last.date === col.date) last.count++
    else dateGroups.push({ date: col.date, count: 1 })
  }

  if (!state.periods.length || !Object.keys(assignments).length) {
    return (<><h2 className="title">교사별 감독시간표 <ExamBadge examName={state.config.examName} /></h2><p className="sub muted">5단계 [배정 작업]에서 자동 배정을 실행하면 여기서 결과를 확인할 수 있습니다.</p></>)
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 className="title" style={{ margin: 0 }}>교사별 감독시간표 <ExamBadge examName={state.config.examName} /></h2>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" onClick={() => exportTeacherExcel(state, assignments)}>📊 엑셀</button>
          <button className="btn ghost sm" onClick={() => exportTeacherHwp(state, assignments)}>📄 한글</button>
        </div>
      </div>
      <div className="rg-toolbar">
        <div className="row" style={{ gap: 4 }}>
          <button className="btn ghost sm" onClick={() => setZoom((z) => Math.max(50, z - 10))}>⊖</button>
          <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center' }}>{zoom}%</span>
          <button className="btn ghost sm" onClick={() => setZoom((z) => Math.min(150, z + 10))}>⊕</button>
        </div>
      </div>
      <div className="rg-wrap">
        <div className="rg-scale" style={{ transform: `scale(${zoom / 100})`, width: zoom < 100 ? `${10000 / zoom}%` : '100%' }}>
          <table className="rg">
            <thead>
              <tr>
                <th rowSpan={2} className="rg-room">성명</th>
                <th rowSpan={2} style={{ minWidth: 32 }}>정</th>
                <th rowSpan={2} style={{ minWidth: 32 }}>부</th>
                <th rowSpan={2} style={{ minWidth: 32 }}>계</th>
                {dateGroups.map((dg) => <th key={dg.date} colSpan={dg.count} className="rg-date">{dg.date}</th>)}
              </tr>
              <tr>{cols.map((col) => <th key={col.key}>{col.periodName}</th>)}</tr>
            </thead>
            <tbody>
              {teachers.map((t) => {
                const row = tcells[t.id] || {}
                const mainCnt = counts?.mainCnt?.[t.id] || 0
                const subCnt = counts?.subCnt?.[t.id] || 0
                return (
                  <tr key={t.id}>
                    <td className="rg-room left">{t.name}</td>
                    <td style={{ fontSize: 11 }}>{mainCnt || ''}</td>
                    <td style={{ fontSize: 11 }}>{subCnt || ''}</td>
                    <td style={{ fontWeight: 700, fontSize: 11 }}>{(mainCnt + subCnt) || ''}</td>
                    {cols.map((col) => {
                      const cell = row[col.key]; if (!cell) return <td key={col.key} />
                      const bg = cell.role === '정' ? 'rgba(59,130,246,.12)' : cell.role === '부' ? 'rgba(34,197,94,.1)' : 'rgba(245,158,11,.1)'
                      return (<td key={col.key} style={{ background: bg, minWidth: 72 }}><div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.3 }}>{cell.room}</div><div style={{ fontSize: 11, fontWeight: 700 }}>{cell.role}감독</div></td>)
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {counts && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>배정 횟수 집계</h3>
          <table className="grid">
            <thead><tr><th>교사</th><th>구분</th><th>정감독</th><th>부감독</th><th>합계</th></tr></thead>
            <tbody>
              {state.teachers.map((t) => (
                <tr key={t.id}><td className="left">{t.name}</td><td>{t.category}</td><td>{counts.mainCnt[t.id] || 0}</td><td>{counts.subCnt[t.id] || 0}</td><td style={{ fontWeight: 700 }}>{counts.total[t.id] || 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
