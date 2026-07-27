import { useState, useEffect, useRef } from 'react'
import './AssessmentPlanPage.css'
import {
  defaultState,
  mergeState,
  clearSectionValues,
  COUNCIL_TYPES,
  councilTitle,
  SECTION_KINDS,
  makeSection,
  BUILTIN_TEMPLATES,
  sectionNumber,
  SUBJECTS_MIDDLE,
  SUBJECTS_HIGH,
  saveDoc,
  pickAndLoadDoc,
  saveClassFile,
  saveAllClassFiles,
  pickAndLoadCollected,
  printDoc,
  type AssessmentState,
  type Section,
  type Template,
  type RsamClassFile,
} from '../services/assessmentPlan'

const STORE_KEY = 'assessment:data'

function usePlanStore() {
  const [st, setSt] = useState<AssessmentState>(defaultState)
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    window.electron
      ?.configGet(STORE_KEY)
      .then((v) => {
        if (v) setSt(mergeState(v as Partial<AssessmentState>))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!loaded) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      window.electron?.configSet(STORE_KEY, st)
    }, 500)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [st, loaded])

  return { st, setSt, loaded }
}

export default function AssessmentPlanPage() {
  const { st, setSt, loaded } = usePlanStore()
  const [showDist, setShowDist] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)

  const setMeta = (k: keyof AssessmentState['meta'], v: string) => setSt((s) => ({ ...s, meta: { ...s.meta, [k]: v } }))
  const setDoc = (k: keyof AssessmentState['doc'], v: unknown) => setSt((s) => ({ ...s, doc: { ...s.doc, [k]: v } }))
  const setSections = (fn: (secs: Section[]) => Section[]) => setSt((s) => ({ ...s, doc: { ...s.doc, sections: fn(s.doc.sections) } }))
  const updateSection = (id: string, patch: Partial<Section>) =>
    setSections((secs) => secs.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec)))

  const applyTemplate = (tpl: Template) => {
    if (!window.confirm(`'${tpl.name}' 템플릿을 적용합니다. 현재 섹션이 교체됩니다.`)) return
    setSt((s) => ({
      ...s,
      meta: { ...s.meta, level: tpl.level },
      doc: { ...s.doc, council: tpl.council, title: councilTitle(tpl.council), sections: tpl.make() },
    }))
  }

  const move = (id: string, dir: number) =>
    setSections((secs) => {
      const i = secs.findIndex((x) => x.id === id)
      const j = i + dir
      if (j < 0 || j >= secs.length) return secs
      const next = [...secs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const saveClick = () => saveDoc(st)
  const loadClick = async () => {
    try {
      const s = await pickAndLoadDoc()
      if (s) setSt(s)
    } catch {
      window.alert('불러오기 실패')
    }
  }
  const printClick = () => printDoc(docRef.current?.outerHTML ?? '')

  if (!loaded) {
    return (
      <div className="assessment-plan-root">
        <div className="muted" style={{ margin: 'auto' }}>불러오는 중…</div>
      </div>
    )
  }

  return (
    <div className="assessment-plan-root">
      <div className="topbar">
        <div className="brand">
          사정안 작성 도우미
          <small>사정회 문서 작성</small>
        </div>
        <div className="meta">
          <div className="f"><label className="lab">학교명</label><input value={st.meta.school} onChange={(e) => setMeta('school', e.target.value)} /></div>
          <div className="f"><label className="lab">학년도</label><input style={{ width: 70 }} value={st.meta.year} onChange={(e) => setMeta('year', e.target.value)} /></div>
          <div className="f"><label className="lab">학교급</label>
            <select value={st.meta.level} onChange={(e) => setMeta('level', e.target.value)}><option>중학교</option><option>고등학교</option></select>
          </div>
          <div className="f"><label className="lab">학년</label><input style={{ width: 50 }} value={st.meta.grade} onChange={(e) => setMeta('grade', e.target.value)} /></div>
          <div className="f"><label className="lab">반</label><input style={{ width: 60 }} value={st.meta.className} onChange={(e) => setMeta('className', e.target.value)} /></div>
          <div className="f"><label className="lab">사정 학생수</label><input style={{ width: 80 }} value={st.meta.targetCount} onChange={(e) => setMeta('targetCount', e.target.value)} /></div>
          <div className="f"><label className="lab">사정회 종류</label>
            <select value={st.doc.council} onChange={(e) => { setDoc('council', e.target.value); setDoc('title', councilTitle(e.target.value)) }}>
              {COUNCIL_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn ghost" onClick={saveClick}>저장</button>
          <button className="btn ghost" onClick={loadClick}>불러오기</button>
          <button className="btn ghost" style={{ background: '#1e3a5f', borderColor: '#0ea5e9' }} onClick={() => setShowDist(true)}>📦 배포·취합</button>
          <button className="btn green" onClick={printClick}>🖨 인쇄/PDF</button>
        </div>
      </div>

      <div className="body">
        <aside className="editor">
          <div className="seccard">
            <label className="lab">양식 라이브러리</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {BUILTIN_TEMPLATES.map((t) => (
                <button key={t.id} className="btn ghost sm" style={{ textAlign: 'left' }} onClick={() => applyTemplate(t)} title={t.description}>
                  📋 {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="seccard">
            <label className="lab">문서 제목 / 번호 양식</label>
            <input style={{ width: '100%', marginTop: 4 }} value={st.doc.title} onChange={(e) => setDoc('title', e.target.value)} />
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <button className={'btn sm ' + (st.doc.numberStyle === 'roman' ? '' : 'ghost')} onClick={() => setDoc('numberStyle', 'roman')}>Ⅰ Ⅱ Ⅲ</button>
              <button className={'btn sm ' + (st.doc.numberStyle === 'number' ? '' : 'ghost')} onClick={() => setDoc('numberStyle', 'number')}>1 2 3</button>
            </div>
          </div>

          <div className="addbar">
            {SECTION_KINDS.map((k) => (
              <button key={k.kind} className="btn ghost sm" onClick={() => setSections((secs) => [...secs, makeSection(k.kind, st.meta.level)])}>＋ {k.label}</button>
            ))}
          </div>

          {st.doc.sections.map((sec) => (
            <SectionEditor key={sec.id} sec={sec} level={st.meta.level} update={(p) => updateSection(sec.id, p)} move={(d) => move(sec.id, d)} remove={() => setSections((secs) => secs.filter((x) => x.id !== sec.id))} />
          ))}
          {!st.doc.sections.length && <div className="muted">섹션을 추가하거나 양식을 적용하세요.</div>}
        </aside>

        <main className="preview">
          <DocPreview st={st} innerRef={docRef} />
        </main>
      </div>

      {showDist && <DistributeModal st={st} onClose={() => setShowDist(false)} />}
    </div>
  )
}

interface SectionEditorProps {
  sec: Section
  level: string
  update: (patch: Partial<Section>) => void
  move: (dir: number) => void
  remove: () => void
}

function SectionEditor({ sec, level, update, move, remove }: SectionEditorProps) {
  const setCell = (ri: number, ci: number, v: string) => {
    const rows = (sec.rows ?? []).map((r) => [...r])
    rows[ri][ci] = v
    update({ rows })
  }
  return (
    <div className="seccard">
      <div className="head">
        <span className="kindtag">{SECTION_KINDS.find((k) => k.kind === sec.kind)?.label.split('(')[0] || sec.kind}</span>
        <input value={sec.title} onChange={(e) => update({ title: e.target.value })} />
        <button className="btn ghost sm" onClick={() => move(-1)}>↑</button>
        <button className="btn ghost sm" onClick={() => move(1)}>↓</button>
        <button className="btn rose sm" onClick={remove}>×</button>
      </div>

      {sec.kind === 'enrollment' && (
        <div className="fieldgrid">
          {(sec.fields ?? []).map((f, i) => (
            <div className="f" key={f.key}>
              <label className="lab">{f.label}</label>
              <input type="number" value={f.value} onChange={(e) => { const fields = (sec.fields ?? []).map((x) => ({ ...x })); fields[i].value = e.target.value; update({ fields }) }} />
            </div>
          ))}
        </div>
      )}

      {sec.kind === 'subjects' && (
        <div>
          <div className="fieldgrid">
            {(sec.subjects ?? []).map((s, i) => (
              <div className="f" key={i}>
                <label className="lab">{s.name}</label>
                <input type="number" step="0.01" value={s.avg} onChange={(e) => { const subjects = (sec.subjects ?? []).map((x) => ({ ...x })); subjects[i].avg = e.target.value; update({ subjects }) }} />
              </div>
            ))}
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label className="lab">학급평균</label>
            <input type="number" step="0.01" value={sec.classAvg} onChange={(e) => update({ classAvg: e.target.value })} />
          </div>
          <div style={{ marginTop: 6 }}>
            <button className="btn ghost sm" onClick={() => update({ subjects: (level === '고등학교' ? SUBJECTS_HIGH : SUBJECTS_MIDDLE).map((name) => ({ name, avg: '' })) })}>과목목록 초기화({level})</button>
          </div>
        </div>
      )}

      {(sec.kind === 'awardList' || sec.kind === 'table') && (
        <div>
          <label className="lab">표 (열 머리글 / 행)</label>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <thead>
              <tr>
                {(sec.columns ?? []).map((c, ci) => (
                  <th key={ci} style={{ border: '1px solid var(--ap-border)', padding: 2 }}>
                    <input style={{ width: '100%', fontSize: 11 }} value={c} onChange={(e) => { const columns = [...(sec.columns ?? [])]; columns[ci] = e.target.value; update({ columns }) }} />
                  </th>
                ))}
                <th style={{ width: 24 }}></th>
              </tr>
            </thead>
            <tbody>
              {(sec.rows ?? []).map((r, ri) => (
                <tr key={ri}>
                  {(sec.columns ?? []).map((_, ci) => (
                    <td key={ci} style={{ border: '1px solid var(--ap-border)', padding: 2 }}>
                      <input style={{ width: '100%', fontSize: 11 }} value={r[ci] || ''} onChange={(e) => setCell(ri, ci, e.target.value)} />
                    </td>
                  ))}
                  <td><button className="btn rose sm" onClick={() => update({ rows: (sec.rows ?? []).filter((_, x) => x !== ri) })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn ghost sm" onClick={() => update({ rows: [...(sec.rows ?? []), (sec.columns ?? []).map(() => '')] })}>＋ 행</button>
            <button className="btn ghost sm" onClick={() => update({ columns: [...(sec.columns ?? []), '열'], rows: (sec.rows ?? []).map((r) => [...r, '']) })}>＋ 열</button>
            <button className="btn ghost sm" onClick={() => update({ columns: (sec.columns ?? []).slice(0, -1), rows: (sec.rows ?? []).map((r) => r.slice(0, -1)) })}>－ 열</button>
          </div>
        </div>
      )}

      {sec.kind === 'textarea' && (
        <textarea style={{ width: '100%', minHeight: 80 }} value={sec.text} onChange={(e) => update({ text: e.target.value })} placeholder="종합 의견을 입력하세요." />
      )}
    </div>
  )
}

function DocPreview({ st, innerRef }: { st: AssessmentState; innerRef?: React.Ref<HTMLDivElement> }) {
  const { doc, meta } = st
  const displayVal = (v: unknown) => (v === 0 || v === '0' || v == null || v === '' ? '' : v)
  return (
    <div className="doc" ref={innerRef}>
      <h1>{doc.title || '사정안'}</h1>
      <div className="docmeta">
        {meta.school && `${meta.school} · `}
        {meta.year}학년도 {meta.grade}학년 {meta.className && `${meta.className}반`}
        {meta.targetCount && ` · 사정 학생수 ${meta.targetCount}명`}
      </div>

      {doc.sections.map((sec, i) => (
        <section key={sec.id}>
          <h2>{sectionNumber(doc.numberStyle, i)}. {sec.title}</h2>
          {sec.showDesc && sec.desc && <p className="desc">{sec.desc}</p>}

          {sec.kind === 'enrollment' && (
            <table>
              <thead><tr>{(sec.fields ?? []).map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
              <tbody><tr>{(sec.fields ?? []).map((f) => <td key={f.key}>{displayVal(f.value)}</td>)}</tr></tbody>
            </table>
          )}

          {sec.kind === 'subjects' && (
            <table>
              <thead><tr>{(sec.subjects ?? []).map((s, j) => <th key={j}>{s.name}</th>)}<th>학급평균</th></tr></thead>
              <tbody><tr>{(sec.subjects ?? []).map((s, j) => <td key={j}>{s.avg}</td>)}<td style={{ fontWeight: 700 }}>{sec.classAvg}</td></tr></tbody>
            </table>
          )}

          {(sec.kind === 'awardList' || sec.kind === 'table') && (
            <table>
              <thead><tr>{(sec.columns ?? []).map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
              <tbody>
                {(sec.rows ?? []).map((r, ri) => (
                  <tr key={ri}>{(sec.columns ?? []).map((_, ci) => <td key={ci}>{sec.hasSeq && ci === 0 && !r[ci] ? ri + 1 : r[ci] || ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}

          {sec.kind === 'textarea' && <div className="note">{sec.text}</div>}
        </section>
      ))}

      {doc.note && <div className="note" style={{ marginTop: 20 }}>{doc.note}</div>}
    </div>
  )
}

// ── 배포·취합 모달 ────────────────────────────────────────────────────────────
function DistributeModal({ st, onClose }: { st: AssessmentState; onClose: () => void }) {
  const [tab, setTab] = useState<'distribute' | 'collect'>('distribute')
  const [classCount, setClassCount] = useState(5)
  const [teacherNames, setTeacherNames] = useState('')
  const [collected, setCollected] = useState<RsamClassFile[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)

  const grade = st.meta.grade || '1'
  const school = st.meta.school || '학교'
  const year = st.meta.year || ''
  const councilLabel = COUNCIL_TYPES.find((c) => c.id === st.doc.council)?.label || '사정회'

  const teachers = teacherNames.split('\n').map((s) => s.trim()).filter(Boolean)

  const buildPayload = (classNo: number): RsamClassFile => ({
    type: 'rsam-class',
    schemaVersion: 1,
    meta: { ...st.meta, className: String(classNo), teacherName: teachers[classNo - 1] || '' },
    doc: { ...st.doc, sections: st.doc.sections.map(clearSectionValues) },
    distributedAt: new Date().toISOString(),
    councilLabel,
  })
  const fileNameFor = (classNo: number) => `${school}_${year}년_${grade}학년${classNo}반_${councilLabel}_양식.rsam-class`

  const downloadClassFile = (classNo: number) => saveClassFile(buildPayload(classNo), fileNameFor(classNo))
  const downloadAll = async () => {
    const files = Array.from({ length: classCount }).map((_, i) => ({ name: fileNameFor(i + 1), payload: buildPayload(i + 1) }))
    const n = await saveAllClassFiles(files)
    if (n > 0) window.alert(`${n}개 반 파일을 저장했습니다.`)
  }

  const loadCollected = async () => {
    const valid = await pickAndLoadCollected()
    setCollected(valid)
    setSelectedIdx(0)
  }

  const selectedFile = collected[selectedIdx]
  const selectedSt: AssessmentState | null = selectedFile
    ? { meta: selectedFile.meta || ({} as AssessmentState['meta']), doc: selectedFile.doc || { sections: [], numberStyle: 'roman', title: '', council: '', note: '' } }
    : null

  return (
    <div className="dist-overlay">
      <div className="dist-modal">
        <div className="dist-header">
          <span>📦 학급 사정안 배포·취합</span>
          <button className="dist-close" onClick={onClose}>✕</button>
        </div>

        <div className="dist-tabs">
          <button className={tab === 'distribute' ? 'on' : ''} onClick={() => setTab('distribute')}>📤 배포 (담임 파일 생성)</button>
          <button className={tab === 'collect' ? 'on' : ''} onClick={() => setTab('collect')}>📥 취합 (제출 파일 열기)</button>
        </div>

        {tab === 'distribute' && (
          <div className="dist-body dist-distribute">
            <div className="dist-form">
              <div className="dist-info">
                <p>
                  현재 양식을 각 반별 <strong>.rsam-class</strong> 파일로 생성합니다.<br />
                  담임 선생님은 파일을 이 앱에서 열어 내용을 작성하고, 저장 후 제출합니다.
                </p>
              </div>

              <label className="lab">학교 / 학년도 / 학년</label>
              <div style={{ background: 'var(--ap-panel2)', border: '1px solid var(--ap-border)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--ap-muted)' }}>
                {school} · {year}학년도 · {grade}학년 · {councilLabel}
                <span style={{ color: 'var(--ap-accent)', marginLeft: 8 }}>(상단 메타 기준)</span>
              </div>

              <label className="lab" style={{ marginTop: 12 }}>반 수</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={1} max={20} value={classCount} onChange={(e) => setClassCount(Math.max(1, Math.min(20, Number(e.target.value))))} style={{ width: 70 }} />
                <span style={{ color: 'var(--ap-muted)', fontSize: 11 }}>{grade}학년 1반 ~ {grade}학년 {classCount}반 파일 생성</span>
              </div>

              <label className="lab" style={{ marginTop: 12 }}>담임 이름 (선택, 반 순서대로 한 줄씩)</label>
              <textarea
                value={teacherNames}
                onChange={(e) => setTeacherNames(e.target.value)}
                placeholder={'예:\n김영희\n이철수\n박민준'}
                style={{ width: '100%', height: 90, resize: 'vertical' }}
              />

              <div className="dist-filelist">
                <label className="lab">생성될 파일 목록</label>
                {Array.from({ length: classCount }).map((_, i) => (
                  <div key={i} className="dist-filerow">
                    <span className="dist-classbadge">{grade}학년 {i + 1}반</span>
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--ap-muted)' }}>{fileNameFor(i + 1)}</span>
                    {teachers[i] && <span style={{ fontSize: 11, color: 'var(--ap-accent)' }}>{teachers[i]} 담임</span>}
                    <button className="btn ghost sm" onClick={() => downloadClassFile(i + 1)}>⬇</button>
                  </div>
                ))}
              </div>

              <button className="btn" style={{ width: '100%', marginTop: 12, fontSize: 14 }} onClick={downloadAll}>
                ⬇ {classCount}개 반 파일 모두 생성 (폴더 선택)
              </button>
            </div>
          </div>
        )}

        {tab === 'collect' && (
          <div className="dist-body dist-collect">
            <div className="dist-collect-left">
              <div className="dist-info">
                <p>담임 선생님이 제출한 <strong>.rsam-class</strong> 파일을 여러 개 선택해 불러오세요.</p>
              </div>
              <button className="btn" style={{ width: '100%', marginBottom: 10 }} onClick={loadCollected}>
                📂 제출 파일 선택 (복수)
              </button>

              {collected.length === 0 ? (
                <div className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>파일을 선택하면 반별 목록이 표시됩니다.</div>
              ) : (
                <div className="dist-classlist">
                  {collected.map((f, i) => {
                    const m = f.meta || ({} as AssessmentState['meta'])
                    const submittedAt = f.submittedAt ? new Date(f.submittedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '미기재'
                    return (
                      <button key={i} className={'dist-classitem' + (i === selectedIdx ? ' on' : '')} onClick={() => setSelectedIdx(i)}>
                        <div style={{ fontWeight: 700 }}>{m.grade}학년 {m.className}반</div>
                        <div style={{ fontSize: 10, color: 'var(--ap-muted)' }}>{m.teacherName || '담임 미기재'} · {submittedAt}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="dist-collect-right">
              {selectedSt ? (
                <div style={{ transform: 'scale(0.55)', transformOrigin: 'top center', marginBottom: -400 }}>
                  <DocPreview st={selectedSt} />
                </div>
              ) : (
                <div className="muted" style={{ padding: 40, textAlign: 'center' }}>반을 선택하면 내용이 표시됩니다.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
