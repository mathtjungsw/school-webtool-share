import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckSquare2, FileSpreadsheet, Loader2, Printer, Search,
  ShieldCheck, Square, Trash2, Upload,
} from 'lucide-react'
import clsx from 'clsx'
import {
  clearSubjectRemarks, loadStoredSubjectRemarks, parseSubjectRemarksWorkbook,
  printSubjectRemarks, saveSubjectRemarks,
  type SubjectRemarksDataset,
} from '../services/subjectRemarksPrint'

export default function SubjectRemarksPrintPage() {
  const [dataset, setDataset] = useState<SubjectRemarksDataset | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadStoredSubjectRemarks()
      .then(stored => {
        if (!stored) return
        setDataset(stored)
        setSelected(new Set(stored.students.map(student => student.id)))
        setActiveId(stored.students[0]?.id ?? '')
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!dataset) return []
    const normalized = query.replace(/\s+/g, '').toLowerCase()
    if (!normalized) return dataset.students
    return dataset.students.filter(student =>
      `${student.className}${student.studentNumber}${student.name}`.replace(/\s+/g, '').toLowerCase().includes(normalized),
    )
  }, [dataset, query])
  const active = filtered.find(student => student.id === activeId) ?? filtered[0] ?? null
  const selectedStudents = dataset?.students.filter(student => selected.has(student.id)) ?? []

  const importFile = async () => {
    const filePath = await window.electron?.openFileDialog([
      { name: '나이스 XLS data', extensions: ['xlsx', 'xls'] },
    ])
    if (!filePath) return
    if (dataset && !window.confirm('현재 PC에 저장된 교과세특 자료를 새 파일로 교체할까요?')) return
    const sourceFileName = filePath.split(/[/\\]/).pop() ?? filePath
    setLoading(true); setError(''); setMessage('')
    try {
      const bytes = await window.electron.readFile(filePath)
      const next = parseSubjectRemarksWorkbook(bytes, sourceFileName)
      await saveSubjectRemarks(next)
      setDataset(next)
      setSelected(new Set(next.students.map(student => student.id)))
      setActiveId(next.students[0]?.id ?? '')
      setQuery('')
      setMessage(`${next.students.length}명의 교과세특을 이 PC에 암호화하여 저장했습니다.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  const clearAll = async () => {
    if (!dataset) return
    const ok = window.confirm(
      `앱에 저장된 학생 ${dataset.students.length}명의 교과세특을 삭제할까요?\n\n원본 XLS 파일은 삭제되지 않으므로 필요하면 파일도 별도로 삭제해 주세요.`,
    )
    if (!ok) return
    setLoading(true); setError(''); setMessage('')
    try {
      await clearSubjectRemarks()
      setDataset(null); setSelected(new Set()); setActiveId(''); setQuery('')
      setMessage('앱에 저장된 교과세특 자료를 비웠습니다.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (loading && !dataset) {
    return <div className="grid h-full place-items-center"><div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" />로컬 자료를 확인하는 중...</div></div>
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><FileSpreadsheet size={23} className="text-emerald-400" />교과세특 개별 인쇄기</h1>
          <p className="page-subtitle">나이스 성적조회 XLS data를 불러와 학생별 A4 한 장으로 확인하고 인쇄합니다.</p>
        </div>
        <div className="flex gap-2">
          {dataset && <button type="button" onClick={() => void clearAll()} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-rose-300"><Trash2 size={14} />비우기</button>}
          <button type="button" onClick={() => void importFile()} disabled={loading} className="btn-primary flex items-center gap-1.5">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{dataset ? '새 파일로 교체' : 'XLS data 불러오기'}
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-amber-400/35 bg-amber-400/10 p-4 text-sm text-amber-100">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <p className="font-black">민감 개인정보 · 현재 PC 로컬에만 암호화 저장</p>
            <p className="mt-1 text-xs font-medium leading-5 text-amber-100/90">학생 이름과 교과세특은 Windows 사용자 계정으로 암호화되어 이 PC에만 저장됩니다. 학교 공유서비스·구글시트·외부 서버로 전송되지 않습니다. 작업 후 반드시 <b>비우기</b>를 누르고, 내려받은 원본 XLS 파일도 별도로 삭제해 주세요.</p>
          </div>
        </div>
      </section>

      {error && <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-200"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div>}
      {message && <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-200">{message}</div>}

      {!dataset ? <EmptyState onImport={() => void importFile()} loading={loading} /> : <>
        <section className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <Meta label="학년도·학기" value={`${dataset.academicYear || '-'}학년도 ${dataset.semester || '-'}학기`} />
          <Meta label="학년·강의실" value={`${dataset.grade || '-'}학년 ${dataset.classroom ? `${dataset.classroom}강의실` : ''}`} />
          <Meta label="교과목" value={dataset.course || '확인 필요'} wide />
          <Meta label="학생 수" value={`${dataset.students.length}명`} />
          <Meta label="가져온 시각" value={new Date(dataset.importedAt).toLocaleString('ko-KR')} />
        </section>

        <section className="grid min-h-[650px] gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <div className="card flex min-h-0 flex-col overflow-hidden p-0">
            <div className="border-b border-white/10 p-4">
              <label className="input-field flex items-center gap-2 px-3"><Search size={15} className="text-slate-500" /><input value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" placeholder="반·번호 또는 이름 검색" /></label>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">선택 {selected.size}명 · 검색 {filtered.length}명</span>
                <div className="flex gap-2"><button type="button" onClick={() => setSelected(new Set(dataset.students.map(student => student.id)))} className="text-cyan-300 hover:underline">전체 선택</button><button type="button" onClick={() => setSelected(new Set())} className="text-slate-400 hover:underline">선택 해제</button></div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.map(student => {
                const checked = selected.has(student.id)
                const current = active?.id === student.id
                return <button key={student.id} type="button" onClick={() => setActiveId(student.id)} className={clsx('mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors', current ? 'border-emerald-400/45 bg-emerald-400/10' : 'border-transparent hover:bg-white/5')}>
                  <span role="checkbox" aria-checked={checked} tabIndex={0} onClick={event => { event.stopPropagation(); toggle(student.id) }} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); toggle(student.id) } }} className="shrink-0 text-emerald-300">{checked ? <CheckSquare2 size={18} /> : <Square size={18} className="text-slate-500" />}</span>
                  <span className="min-w-0 flex-1"><b className="block text-sm text-white">{student.name}</b><span className="mt-1 block text-[11px] font-medium text-slate-400">{student.className}반 {student.studentNumber}번 · {student.remark.length.toLocaleString()}자</span></span>
                </button>
              })}
              {!filtered.length && <p className="p-8 text-center text-sm text-slate-500">검색 결과가 없습니다.</p>}
            </div>
          </div>

          <div className="card flex min-w-0 flex-col p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-black text-white">학생별 A4 미리보기</h2><p className="mt-1 text-xs font-medium text-slate-400">미리보기와 실제 인쇄는 학생 한 명당 한 페이지로 구성됩니다.</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!active} onClick={() => active && printSubjectRemarks(dataset, [active])} className="btn-ghost flex items-center gap-1.5"><Printer size={14} />현재 학생</button>
                <button type="button" disabled={!selectedStudents.length} onClick={() => printSubjectRemarks(dataset, selectedStudents)} className="btn-primary flex items-center gap-1.5"><Printer size={14} />선택 {selectedStudents.length}명 인쇄</button>
                <button type="button" onClick={() => printSubjectRemarks(dataset, dataset.students)} className="btn-ghost flex items-center gap-1.5"><Printer size={14} />전체 인쇄</button>
              </div>
            </div>
            {active ? <A4Preview dataset={dataset} student={active} /> : <div className="grid flex-1 place-items-center text-sm text-slate-500">왼쪽에서 학생을 선택해 주세요.</div>}
          </div>
        </section>
      </>}
    </div>
  )
}

function EmptyState({ onImport, loading }: { onImport: () => void; loading: boolean }) {
  return <section className="card flex min-h-[430px] flex-col items-center justify-center border-dashed p-8 text-center"><FileSpreadsheet size={44} className="text-emerald-400" /><h2 className="mt-4 text-lg font-black text-white">나이스 XLS data 파일을 불러오세요</h2><p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-400">나이스 → 성적조회에서 교과세특이 포함된 <b>XLS data</b> 파일을 내려받으세요. 반복 머리글과 다음 페이지로 이어진 문장은 자동으로 합쳐집니다.</p><button type="button" onClick={onImport} disabled={loading} className="btn-primary mt-6 flex items-center gap-2 px-6"><Upload size={16} />파일 선택</button><p className="mt-4 text-xs font-semibold text-amber-300">지원 형식: .xlsx · .xls</p></section>
}

function Meta({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={clsx('min-w-0 rounded-xl bg-white/[0.04] px-3 py-2', wide && 'xl:col-span-2')}><p className="text-[10px] font-bold text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-black text-white" title={value}>{value}</p></div>
}

function A4Preview({ dataset, student }: { dataset: SubjectRemarksDataset; student: SubjectRemarksDataset['students'][number] }) {
  const meta = [dataset.academicYear && `${dataset.academicYear}학년도`, dataset.semester && `${dataset.semester}학기`, dataset.grade && `${dataset.grade}학년`, dataset.course].filter(Boolean).join(' · ')
  return <div className="flex flex-1 justify-center overflow-auto rounded-2xl bg-slate-950/25 p-3 sm:p-6"><article className="flex aspect-[210/297] h-fit min-h-[690px] w-full max-w-[720px] flex-col bg-white p-[6%] text-slate-950 shadow-2xl">
    <header className="border-b-2 border-slate-800 pb-5 text-center"><p className="text-[10px] font-bold tracking-[.18em] text-slate-600">{dataset.schoolName}</p><h3 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">과목별 세부능력 및 특기사항</h3><p className="mt-2 text-[10px] font-semibold text-slate-600 sm:text-xs">{meta}</p></header>
    <table className="mt-5 w-full border-collapse text-center text-xs sm:text-sm"><tbody><tr><th className="border border-slate-500 bg-slate-100 p-2">반</th><td className="border border-slate-500 p-2">{student.className}</td><th className="border border-slate-500 bg-slate-100 p-2">번호</th><td className="border border-slate-500 p-2">{student.studentNumber}</td><th className="border border-slate-500 bg-slate-100 p-2">성명</th><td className="border border-slate-500 p-2 font-black">{student.name}</td></tr></tbody></table>
    <section className="flex-1 border border-t-0 border-slate-500 p-5 sm:p-7"><h4 className="text-xs font-black text-slate-700">세부능력 및 특기사항</h4><p className="mt-4 whitespace-pre-wrap text-justify text-[11px] font-medium leading-[1.85] sm:text-[13px]">{student.remark}</p></section>
    <footer className="mt-3 flex justify-between gap-4 text-[9px] font-medium text-slate-500"><span className="truncate">{dataset.sourceFileName}</span><span>{student.remark.length.toLocaleString()}자</span></footer>
  </article></div>
}
