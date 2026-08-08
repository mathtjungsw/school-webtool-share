import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, ClipboardPaste, Copy, FileCheck2, FileSearch2,
  Loader2, RefreshCw, ShieldCheck, Upload,
} from 'lucide-react'
import clsx from 'clsx'
import { getSharedStudentRoster } from '../services/schoolHub'
import type { SharedStudentRoster } from '../services/rosterAttendance'
import {
  auditStudentIdentities, extractPairsFromText, extractStudentIdentitiesFromFile,
  type StudentIdentityAuditResult, type StudentIdentityIssue,
} from '../services/studentIdentityAudit'

const ISSUE_META: Record<StudentIdentityIssue['kind'], { label: string; className: string }> = {
  nameMismatch: { label: '이름 불일치', className: 'bg-rose-500/15 text-rose-300' },
  studentIdMismatch: { label: '학번 불일치', className: 'bg-amber-500/15 text-amber-300' },
  ambiguousName: { label: '동명이인 확인', className: 'bg-violet-500/15 text-violet-300' },
  notInRoster: { label: '명렬에 없음', className: 'bg-slate-500/15 text-slate-300' },
}

export default function StudentIdentityAuditPage() {
  const [roster, setRoster] = useState<SharedStudentRoster | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [result, setResult] = useState<StudentIdentityAuditResult | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [loading, setLoading] = useState(false)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const loadRoster = async (force = false) => {
    setRosterLoading(true); setError('')
    try { setRoster(await getSharedStudentRoster(force)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setRosterLoading(false) }
  }
  useEffect(() => { void loadRoster() }, [])

  const runAudit = (pairs: ReturnType<typeof extractPairsFromText>, source: string) => {
    if (!roster?.students.length) throw new Error('관리자가 등록한 학생 명렬이 없습니다. 출석부 출력 메뉴에서 학생 명렬을 먼저 등록해 주세요.')
    if (!pairs.length) throw new Error('4~5자리 학번과 한글 이름 쌍을 찾지 못했습니다. 학번과 이름이 있는 부분을 함께 붙여넣어 주세요.')
    setSourceName(source)
    setResult(auditStudentIdentities(pairs, roster.students))
  }

  const inspectFile = async () => {
    const filePath = await window.electron?.openFileDialog([
      { name: '학번·이름 자료', extensions: ['xlsx', 'xls', 'xlsm', 'csv', 'hwp', 'hwpx', 'pdf'] },
    ])
    if (!filePath) return
    const fileName = filePath.split(/[/\\]/).pop() ?? filePath
    setLoading(true); setError(''); setResult(null)
    try { runAudit(await extractStudentIdentitiesFromFile(filePath, fileName), fileName) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }

  const inspectPaste = () => {
    setError(''); setResult(null)
    try {
      if (!pasteText.trim()) throw new Error('검사할 내용을 붙여넣어 주세요.')
      runAudit(extractPairsFromText(pasteText, '붙여넣기'), '붙여넣기')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const copyIssues = async () => {
    if (!result?.issues.length) return
    const rows = [
      ['상태', '입력 학번', '입력 이름', '확인할 학번', '확인할 이름', '원본 위치'],
      ...result.issues.map(issue => [
        ISSUE_META[issue.kind].label, issue.studentId, issue.name,
        issue.expectedStudentIds.join(', '), issue.expectedNames.join(', '), issue.contexts.join(' / '),
      ]),
    ]
    await navigator.clipboard.writeText(rows.map(row => row.join('\t')).join('\n'))
    setCopied(true); window.setTimeout(() => setCopied(false), 1500)
  }

  const issueCounts = useMemo(() => result?.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.kind] = (counts[issue.kind] ?? 0) + 1
    return counts
  }, {}) ?? {}, [result])

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><FileSearch2 size={22} className="text-cyan-400" />학생 학번·이름 교정기</h1>
          <p className="page-subtitle">파일 또는 붙여넣기 자료의 학번·이름 연결을 학교 학생 명렬과 비교합니다.</p>
        </div>
        <button onClick={() => void loadRoster(true)} disabled={rosterLoading} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw size={14} className={rosterLoading ? 'animate-spin' : ''} />학생 명렬 새로고침
        </button>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card flex min-h-64 flex-col items-center justify-center border-dashed border-cyan-400/20 p-7 text-center">
          <Upload size={30} className="text-cyan-400" />
          <h2 className="mt-3 font-bold text-white">Excel·한글·PDF 파일 검사</h2>
          <p className="mt-2 text-xs leading-5 text-slate-400">한 셀에 `10101 홍길동`처럼 함께 있거나<br />학번과 이름이 옆 칸에 나뉜 표를 모두 인식합니다.</p>
          <button onClick={() => void inspectFile()} disabled={loading || rosterLoading} className="btn-primary mt-5 flex items-center gap-2 px-5">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}{loading ? '분석 중...' : '파일 선택·검사'}
          </button>
          <p className="mt-3 text-[10px] text-slate-600">xlsx · xls · xlsm · csv · hwp · hwpx · pdf</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2"><ClipboardPaste size={17} className="text-violet-400" /><h2 className="font-bold text-white">복사한 내용 붙여넣기</h2></div>
          <p className="mt-1 text-[11px] text-slate-500">Excel·한글·PDF의 표나 문장을 원본에서 복사한 뒤 아래 칸에 그대로 붙여넣으세요.</p>
          <textarea
            value={pasteText}
            onChange={event => setPasteText(event.target.value)}
            className="input-field mt-3 min-h-36 w-full resize-y font-mono text-xs leading-5"
            placeholder={'학번\t이름\n10101\t홍길동\n10102 김웅천'}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => { setPasteText(''); setResult(null); setError('') }} className="btn-ghost text-xs">지우기</button>
            <button onClick={inspectPaste} disabled={!pasteText.trim() || rosterLoading} className="btn-primary flex items-center gap-1.5"><FileSearch2 size={14} />붙여넣은 내용 검사</button>
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-sky-400/15 bg-sky-500/5 px-4 py-3 text-xs text-sky-100">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={15} />비교 기준: 관리자 등록 학생 명렬 {roster ? `${roster.version}차 · ${roster.students.length}명` : '불러오는 중'}</p>
        <p className="mt-1 text-[11px] text-sky-200/70">선택한 파일과 붙여넣은 내용은 현재 PC에서만 분석하며 원본 파일과 공유 학생 명렬을 수정하지 않습니다.</p>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-200"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}

      {result && <>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Summary label="자료 출처" value={sourceName} />
          <Summary label="추출한 학번·이름" value={`${result.uniquePairCount}쌍`} />
          <Summary label="정상 매칭" value={`${result.matchedCount}건`} tone="success" />
          <Summary label="확인 필요" value={`${result.issues.length}명`} tone={result.issues.length ? 'danger' : 'success'} />
        </section>

        {result.issues.length === 0 ? (
          <section className="card flex items-center gap-3 border-emerald-400/20 p-6 text-emerald-200"><CheckCircle2 size={24} /><div><h2 className="font-bold">잘못 연결된 학번·이름을 찾지 못했습니다.</h2><p className="mt-1 text-xs text-emerald-200/70">추출된 {result.uniquePairCount}쌍이 모두 학생 명렬과 일치합니다.</p></div></section>
        ) : (
          <section className="card overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
              <div><h2 className="font-bold text-white">확인할 학생</h2><p className="mt-1 text-[10px] text-slate-500">{Object.entries(issueCounts).map(([kind, count]) => `${ISSUE_META[kind as StudentIdentityIssue['kind']].label} ${count}`).join(' · ')}</p></div>
              <button onClick={() => void copyIssues()} className="btn-ghost flex items-center gap-1.5 text-xs"><Copy size={13} />{copied ? '복사됨' : '오류 목록 복사'}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-white/[0.035] text-[10px] text-slate-500"><tr><th className="px-4 py-2">상태</th><th className="px-4 py-2">입력된 값</th><th className="px-4 py-2">학생 명렬 기준</th><th className="px-4 py-2">원본 위치</th><th className="px-4 py-2 text-center">횟수</th></tr></thead>
                <tbody>{result.issues.map(issue => <IssueRow key={issue.key} issue={issue} />)}</tbody>
              </table>
            </div>
          </section>
        )}
      </>}
    </div>
  )
}

function Summary({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'success' | 'danger' }) {
  return <div className="card p-4"><p className="text-[10px] text-slate-500">{label}</p><p className={clsx('mt-2 truncate text-lg font-black', tone === 'success' ? 'text-emerald-300' : tone === 'danger' ? 'text-rose-300' : 'text-white')} title={value}>{value}</p></div>
}

function IssueRow({ issue }: { issue: StudentIdentityIssue }) {
  const meta = ISSUE_META[issue.kind]
  const expected = issue.kind === 'nameMismatch'
    ? <><b>{issue.studentId}</b>의 이름은 <b className="text-emerald-300">{issue.expectedNames.join(', ')}</b>{issue.expectedStudentIds.length ? <span className="block text-[10px] text-slate-500">입력 이름의 학번: {issue.expectedStudentIds.join(', ')}</span> : null}</>
    : issue.expectedStudentIds.length
      ? <>이름 <b>{issue.name}</b>의 학번: <b className="text-emerald-300">{issue.expectedStudentIds.join(', ')}</b></>
      : <>학생 명렬에서 해당 학번과 이름을 찾지 못했습니다.</>
  return <tr className="border-t border-white/5 align-top hover:bg-white/[0.02]"><td className="px-4 py-3"><span className={clsx('rounded-full px-2 py-1 text-[10px] font-bold', meta.className)}>{meta.label}</span></td><td className="px-4 py-3"><p className="font-bold text-white">{issue.studentId} · {issue.name}</p></td><td className="px-4 py-3 leading-5 text-slate-300">{expected}</td><td className="max-w-sm px-4 py-3 text-[11px] leading-5 text-slate-400">{issue.contexts.slice(0, 3).join(' / ')}{issue.contexts.length > 3 ? ` 외 ${issue.contexts.length - 3}곳` : ''}</td><td className="px-4 py-3 text-center text-slate-400">{issue.occurrences}</td></tr>
}
