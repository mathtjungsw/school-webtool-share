import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Download, FileCheck2, FilePlus2, FolderOpen,
  HardDrive, HeartHandshake, Plus, RefreshCw, ShieldCheck, Trash2, Upload, XCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../stores/appStore'
import { getSharedStudentRoster } from '../services/schoolHub'
import type { SharedStudentRoster } from '../services/rosterAttendance'
import {
  buildVolunteerRosterTemplate, compareVolunteerRosterSources, createVolunteerRow, emptyVolunteerDraft,
  parseNeisVolunteerWorkbook, parseRosterPaste, parseRosterWorkbook, validateIssuanceDraft, volunteerStudentId,
  type StoredVolunteerHwp, type StoredVolunteerNeisDataset, type VolunteerCertificateDraft,
  type VolunteerRosterComparisonResult, type VolunteerRosterComparisonRow, type VolunteerStudentRow,
} from '../services/volunteerWork'

const DRAFT_KEY = 'ungcheon.volunteer.certificateDraft.v1'
const NEIS_DATASETS_KEY = 'ungcheon.volunteer.neisDatasets.v1'

export default function VolunteerWorkPage() {
  const [tab, setTab] = useState<'issue' | 'verify'>('issue')
  return (
    <div className="volunteer-work-page min-h-full p-6 lg:p-8 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header>
          <h1 className="page-title flex items-center gap-2"><HeartHandshake className="text-emerald-600" />봉사활동 업무</h1>
          <p className="page-subtitle">봉사활동 확인서 발급과 나이스 자료 검증을 한곳에서 처리합니다.</p>
        </header>
        <LocalOnlyNotice />
        <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <TabButton active={tab === 'issue'} onClick={() => setTab('issue')} icon={<FilePlus2 size={17} />} label="봉사활동 확인서 발급" />
          <TabButton active={tab === 'verify'} onClick={() => setTab('verify')} icon={<FileCheck2 size={17} />} label="봉사활동 확인서 검증(봉사활동담당자)" />
        </div>
        {tab === 'issue' ? <IssuanceTab /> : <VerificationTab />}
      </div>
    </div>
  )
}

function LocalOnlyNotice() {
  return (
    <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50 px-5 py-4 text-emerald-950 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/60 dark:text-emerald-50">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 shrink-0" size={24} />
        <div>
          <p className="text-base font-black">학생 명단과 확인서 파일은 이 PC에만 저장됩니다.</p>
          <p className="mt-1 text-sm font-bold">학교 공유 서버·구글시트·외부 서버로 전송하거나 업로드하지 않습니다. 발급·검증 작업은 모두 현재 PC 안에서만 처리됩니다.</p>
        </div>
      </div>
    </div>
  )
}

function IssuanceTab() {
  const teacherName = useAppStore(state => state.config.teacherName)
  const [draft, setDraft] = useState<VolunteerCertificateDraft>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') as Partial<VolunteerCertificateDraft>
      return {
        ...emptyVolunteerDraft(teacherName),
        ...saved,
        students: Array.isArray(saved.students)
          ? saved.students.map(student => ({ ...student, studentId: volunteerStudentId(student.studentId) }))
          : [],
      }
    }
    catch { return emptyVolunteerDraft(teacherName) }
  })
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [storeCopy, setStoreCopy] = useState(true)
  const errors = useMemo(() => validateIssuanceDraft(draft), [draft])
  const capacity = draft.students.length <= 20 ? 20 : draft.students.length <= 40 ? 40 : draft.students.length <= 60 ? 60 : 68

  useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) }, [draft])

  const update = <K extends keyof VolunteerCertificateDraft>(key: K, value: VolunteerCertificateDraft[K]) => setDraft(current => ({ ...current, [key]: value }))
  const updateStudent = (id: string, patch: Partial<VolunteerStudentRow>) => update('students', draft.students.map(row => row.id === id ? { ...row, ...patch } : row))

  const importExcel = async () => {
    const path = await window.electron.openFileDialog([{ name: '학생 명단 Excel', extensions: ['xlsx', 'xls'] }])
    if (!path) return
    try {
      const rows = parseRosterWorkbook(await window.electron.readFile(path))
      update('students', rows)
      setMessage(`${rows.length}명의 명단을 불러왔습니다. 시수와 이름을 확인해 주세요.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }

  const downloadRosterTemplate = async () => {
    try {
      const saved = await window.electron.saveFileDialog(
        '봉사활동_확인서_학생명단_입력양식.xlsx',
        buildVolunteerRosterTemplate(),
      )
      setMessage(saved
        ? 'Excel 명단 양식을 저장했습니다. 4행 아래에 학번·이름·실제 시수·비고를 입력한 뒤 불러와 주세요.'
        : 'Excel 명단 양식 저장을 취소했습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }

  const applyPaste = () => {
    const rows = parseRosterPaste(paste)
    if (!rows.length) { setMessage('붙여넣은 내용에서 학번과 이름을 찾지 못했습니다.'); return }
    update('students', rows)
    setMessage(`${rows.length}명의 붙여넣기 명단을 적용했습니다.`)
  }

  const issueHwp = async () => {
    if (errors.length) { setMessage(errors[0]); return }
    setBusy(true)
    try {
      const bytes = await window.electron.buildVolunteerHwp(draft)
      const safeActivity = draft.activityName.replace(/[\\/:*?"<>|]/g, '_')
      const fileName = `봉사활동_확인서_${safeActivity}_${draft.startDate}.hwp`
      const saved = await window.electron.saveFileDialog(fileName, bytes)
      if (!saved) { setMessage('저장을 취소했습니다.'); return }
      if (storeCopy) await window.electron.storeGeneratedVolunteerHwp(fileName, bytes)
      setMessage(`HWP 확인서를 저장했습니다.${storeCopy ? ' 검증용 로컬 보관함에도 복사했습니다.' : ''}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="space-y-5">
        <Panel title="1. 활동 정보 입력" subtitle="첨부된 웅천고 확인서 양식의 항목에 그대로 들어갑니다.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="봉사활동명 *"><input value={draft.activityName} onChange={e => update('activityName', e.target.value)} placeholder="예: 도서관 도우미" /></Field>
            <Field label="활동 시작일 *"><input type="date" value={draft.startDate} onChange={e => update('startDate', e.target.value)} /></Field>
            <Field label="활동 종료일 *"><input type="date" value={draft.endDate} onChange={e => update('endDate', e.target.value)} /></Field>
            <Field label="활동 기관 *"><input value={draft.institution} onChange={e => update('institution', e.target.value)} /></Field>
            <Field label="활동 장소"><input value={draft.location} onChange={e => update('location', e.target.value)} /></Field>
            <Field label="활동 영역"><select value={draft.area} onChange={e => update('area', e.target.value as VolunteerCertificateDraft['area'])}><option value="neighbor">이웃돕기활동</option><option value="environment">환경보호활동</option><option value="campaign">캠페인활동</option></select></Field>
            <Field label="활동 내용 *" wide><input value={draft.activityContent} onChange={e => update('activityContent', e.target.value)} placeholder="나이스에 입력할 활동 내용과 같은 표현을 권장합니다." /></Field>
            <Field label="확인 교사 *"><input value={draft.confirmTeacher} onChange={e => update('confirmTeacher', e.target.value)} /></Field>
            <Field label="공통 비고"><input value={draft.commonRemarks} onChange={e => update('commonRemarks', e.target.value)} /></Field>
          </div>
        </Panel>

        <Panel title="2. 학생 명단 입력" subtitle="먼저 전용 Excel 양식을 내려받아 작성한 뒤 불러오는 방법을 권장합니다.">
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={downloadRosterTemplate} icon={<Download size={15} />}>명단 Excel 양식 내려받기</ActionButton>
            <ActionButton onClick={importExcel} icon={<Upload size={15} />}>Excel 명단 불러오기</ActionButton>
            <ActionButton onClick={() => update('students', [...draft.students, createVolunteerRow()])} icon={<Plus size={15} />}>빈 학생 추가</ActionButton>
            <ActionButton onClick={() => update('students', [])} icon={<Trash2 size={15} />} danger>명단 비우기</ActionButton>
          </div>
          <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-950 dark:bg-blue-950/50 dark:text-blue-100">전용 양식의 열 순서를 그대로 사용하면 안정적으로 불러옵니다. 봉사활동 확인서와 나이스 봉사자료는 4자리 학번을 사용하며, 5자리 학번을 넣어도 자동으로 4자리로 바꿉니다.</div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={4} placeholder={'Excel·한글 표에서 복사한 내용을 여기에 붙여넣으세요.\n학번\t이름\t시수\t비고'} />
            <button onClick={applyPaste} className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold text-white dark:bg-slate-200 dark:text-slate-900">붙여넣기 적용</button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800"><tr><th className="w-14 p-2">번호</th><th className="p-2">학번</th><th className="p-2">이름</th><th className="w-28 p-2">실제 시수</th><th className="p-2">비고</th><th className="w-14 p-2"></th></tr></thead>
              <tbody>{draft.students.map((row, index) => <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700"><td className="p-2 text-center font-bold">{index + 1}</td><td className="p-2"><input inputMode="numeric" maxLength={5} value={row.studentId} onChange={e => updateStudent(row.id, { studentId: e.target.value.replace(/\D/g, '').slice(0, 5) })} onBlur={() => updateStudent(row.id, { studentId: volunteerStudentId(row.studentId) })} /></td><td className="p-2"><input value={row.name} onChange={e => updateStudent(row.id, { name: e.target.value })} /></td><td className="p-2"><input type="number" min="0.5" step="0.5" value={row.hours} onChange={e => updateStudent(row.id, { hours: e.target.value === '' ? '' : Number(e.target.value) })} /></td><td className="p-2"><input value={row.remarks} onChange={e => updateStudent(row.id, { remarks: e.target.value })} /></td><td className="p-2"><button onClick={() => update('students', draft.students.filter(item => item.id !== row.id))} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50 dark:text-rose-300"><Trash2 size={15} /></button></td></tr>)}</tbody>
            </table>
            {!draft.students.length && <p className="p-8 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">아직 입력된 학생이 없습니다.</p>}
          </div>
        </Panel>
      </section>

      <aside className="space-y-5">
        <Panel title="3. 확인하고 발급" subtitle="학생 수에 맞는 고정 양식을 자동 선택합니다.">
          <div className="grid grid-cols-2 gap-3">
            <Summary label="입력 인원" value={`${draft.students.length}명`} />
            <Summary label="선택 양식" value={draft.students.length > 68 ? '분할 필요' : `${capacity}명 고정 양식`} />
          </div>
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
            모든 학생의 시수 칸에 실제 시수를 각각 입력합니다. 따옴표(″)로 반복 표기하지 않습니다.
          </div>
          {errors.length > 0 && <div className="mt-4 max-h-40 overflow-y-auto rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-900 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-100">{errors.slice(0, 8).map(error => <p key={error}>• {error}</p>)}</div>}
          <label className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm font-bold dark:border-slate-700"><input type="checkbox" className="mt-1" checked={storeCopy} onChange={e => setStoreCopy(e.target.checked)} /><span>발급한 HWP를 검증용 로컬 보관함에도 저장<br /><small className="font-semibold text-slate-600 dark:text-slate-300">이 PC 안에만 복사되며 직접 삭제하기 전까지 유지됩니다.</small></span></label>
          <button disabled={busy || errors.length > 0} onClick={issueHwp} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><Download size={18} />{busy ? 'HWP 만드는 중…' : '한글(HWP) 확인서 저장'}</button>
          <button onClick={() => { const next = emptyVolunteerDraft(teacherName); setDraft(next); setPaste(''); setMessage('입력 내용을 초기화했습니다.') }} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold dark:border-slate-600">새 확인서 작성</button>
          {message && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm font-bold dark:bg-slate-800">{message}</p>}
        </Panel>
        <Panel title="고정 양식 기준" subtitle="칸을 임의로 늘리지 않아 서식 깨짐을 줄입니다.">
          <ul className="space-y-2 text-sm font-semibold"><li>1~20명: 1열 20명 양식</li><li>21~40명: 2열 40명 양식</li><li>41~60명: 2열 60명 양식</li><li>61~68명: 2열 68명 양식</li><li className="text-rose-700 dark:text-rose-300">69명 이상은 한 장 가독성을 위해 명단을 나누어 발급</li></ul>
        </Panel>
      </aside>
    </div>
  )
}

function VerificationTab() {
  const [files, setFiles] = useState<StoredVolunteerHwp[]>([])
  const [neisDatasets, setNeisDatasets] = useState<StoredVolunteerNeisDataset[]>(loadNeisDatasets)
  const [roster, setRoster] = useState<SharedStudentRoster | null>(null)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [comparison, setComparison] = useState<VolunteerRosterComparisonResult | null>(null)
  const [selectedClass, setSelectedClass] = useState('all')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const items = await window.electron.listVolunteerHwp()
    setFiles(items)
  }
  const loadRoster = async (force = false) => {
    setRosterLoading(true)
    try {
      const next = await getSharedStudentRoster(force)
      setRoster(next)
      return next
    } finally { setRosterLoading(false) }
  }
  useEffect(() => { void refresh(); void loadRoster() }, [])
  useEffect(() => { localStorage.setItem(NEIS_DATASETS_KEY, JSON.stringify(neisDatasets)) }, [neisDatasets])

  const importHwp = async () => {
    const paths = await window.electron.openFilesDialog([{ name: '봉사활동 확인서', extensions: ['hwp'] }])
    if (!paths.length) return
    setBusy(true)
    try {
      const current = [...files]
      let added = 0
      let skipped = 0
      for (const path of paths) {
        const sha256 = await hashBytes(await window.electron.readFile(path))
        const duplicate = current.find(file => file.sha256 === sha256)
        const allowDuplicate = duplicate
          ? confirm(`동일한 확인서 파일이 이미 등록되어 있습니다.\n\n기존 파일: ${duplicate.originalName}\n추가 파일: ${fileNameFromPath(path)}\n\n그래도 중복 등록하시겠습니까? 등록하면 검증 결과의 중복 자료에 표시됩니다.`)
          : false
        if (duplicate && !allowDuplicate) { skipped += 1; continue }
        const stored = await window.electron.importVolunteerHwp(path, allowDuplicate)
        current.push(stored)
        added += 1
      }
      await refresh()
      setComparison(null)
      setMessage(`${added}개 HWP를 이 PC의 검증용 보관함에 추가했습니다.${skipped ? ` 중복 등록을 취소한 ${skipped}개는 건너뛰었습니다.` : ''}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  const importNeis = async () => {
    const paths = await window.electron.openFilesDialog([{ name: '나이스 XLS data', extensions: ['xlsx', 'xls'] }])
    if (!paths.length) return
    setBusy(true)
    try {
      const next = [...neisDatasets]
      let added = 0
      let skipped = 0
      let recordCount = 0
      for (const path of paths) {
        const bytes = await window.electron.readFile(path)
        const sha256 = await hashBytes(bytes)
        const duplicate = next.find(dataset => dataset.sha256 === sha256)
        if (duplicate && !confirm(`동일한 나이스 파일이 이미 등록되어 있습니다.\n\n기존 파일: ${duplicate.originalName}\n추가 파일: ${fileNameFromPath(path)}\n\n그래도 중복 등록하시겠습니까? 등록하면 검증 결과의 중복 자료에 표시됩니다.`)) { skipped += 1; continue }
        const records = parseNeisVolunteerWorkbook(bytes)
        next.push({
          id: crypto.randomUUID(),
          originalName: fileNameFromPath(path),
          importedAt: new Date().toISOString(),
          sha256,
          recordCount: records.length,
          studentCount: new Set(records.map(record => volunteerStudentId(record.studentId))).size,
          records,
        })
        added += 1
        recordCount += records.length
      }
      setNeisDatasets(next)
      setComparison(null)
      setMessage(`${added}개 나이스 파일에서 ${recordCount}건을 누적했습니다.${skipped ? ` 중복 등록을 취소한 ${skipped}개는 건너뛰었습니다.` : ''}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  const verify = async () => {
    if (!files.length) { setMessage('먼저 확인서 HWP 파일을 한 개 이상 추가해 주세요.'); return }
    if (!neisDatasets.length) { setMessage('먼저 나이스 XLS data 파일을 한 개 이상 누적해 주세요.'); return }
    setBusy(true)
    try {
      const hwpSources = await Promise.all(files.map(async file => ({
        id: file.id,
        originalName: file.originalName,
        forms: await window.electron.parseVolunteerHwp(file.id),
      })))
      const currentRoster = roster || await loadRoster(true)
      if (!currentRoster?.students.length) throw new Error('학교 공유 서버의 학생 명렬을 불러오지 못했습니다. 학교 공유 서비스 연결을 확인해 주세요.')
      const result = compareVolunteerRosterSources(neisDatasets, hwpSources, currentRoster.students)
      setComparison(result)
      setSelectedClass('all')
      const problemCount = result.rows.filter(row => row.status !== 'matched').length + result.unclassified.length + result.duplicates.length
      setMessage(problemCount
        ? `전체 누적 자료 검증을 마쳤습니다. 활동 누락·미분류·중복 확인 항목 ${problemCount}건이 있습니다.`
        : `검증 완료: ${result.rows.length}개 활동 기록의 내용과 시간이 모두 일치합니다.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('이 PC의 앱 보관함에 있는 복사본만 삭제합니다. 원래 HWP 파일은 삭제되지 않습니다. 계속하시겠습니까?')) return
    await window.electron.deleteVolunteerHwp(id)
    setComparison(null)
    await refresh()
  }

  const removeNeis = (id: string) => {
    if (!confirm('이 PC에 누적한 나이스 자료만 삭제합니다. 원래 Excel 파일은 삭제되지 않습니다. 계속하시겠습니까?')) return
    setNeisDatasets(current => current.filter(dataset => dataset.id !== id))
    setComparison(null)
  }

  const counts = useMemo(() => comparison ? {
    matched: comparison.rows.filter(row => row.status === 'matched').length,
    neisOnly: comparison.rows.filter(row => row.status === 'neis-only').length,
    hwpOnly: comparison.rows.filter(row => row.status === 'hwp-only').length,
    unclassified: comparison.unclassified.length,
    duplicates: comparison.duplicates.length,
  } : { matched: 0, neisOnly: 0, hwpOnly: 0, unclassified: 0, duplicates: 0 }, [comparison])
  const classOptions = useMemo(() => comparison
    ? [...new Set(comparison.rows.filter(row => row.grade && row.className).map(row => `${row.grade}-${row.className}`))]
      .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
    : [], [comparison])
  const visibleRows = useMemo(() => {
    if (!comparison) return []
    if (selectedClass === 'unclassified') return comparison.unclassified
    return comparison.rows.filter(row => selectedClass === 'all' || `${row.grade}-${row.className}` === selectedClass)
  }, [comparison, selectedClass])

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="1. 나이스 봉사활동 누적 자료" subtitle="반별 XLS data 파일을 계속 추가할 수 있으며, 직접 삭제하기 전까지 이 PC에 누적됩니다.">
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={importNeis} icon={<Upload size={15} />} disabled={busy}>나이스 XLS data 추가</ActionButton>
            <ActionButton onClick={() => { if (confirm('누적된 나이스 자료를 모두 비울까요? 원래 Excel 파일은 삭제되지 않습니다.')) { setNeisDatasets([]); setComparison(null) } }} icon={<Trash2 size={15} />} danger disabled={!neisDatasets.length}>전체 비우기</ActionButton>
          </div>
          <p className="mt-3 text-sm font-bold">누적: <span className="text-emerald-700 dark:text-emerald-300">{neisDatasets.length}개 파일 · {neisDatasets.reduce((sum, dataset) => sum + dataset.studentCount, 0)}명분 · {neisDatasets.reduce((sum, dataset) => sum + dataset.recordCount, 0)}개 기록</span></p>
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
            {neisDatasets.map(dataset => <div key={dataset.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="min-w-0 flex-1"><b className="block truncate">{dataset.originalName}</b><small className="font-semibold text-slate-600 dark:text-slate-300">학생 {dataset.studentCount}명 · 기록 {dataset.recordCount}건 · {new Date(dataset.importedAt).toLocaleString('ko-KR')}</small></div><button onClick={() => removeNeis(dataset.id)} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-700 dark:text-rose-300"><Trash2 size={14} className="mr-1 inline" />삭제</button></div>)}
            {!neisDatasets.length && <p className="py-5 text-center text-sm font-bold text-slate-600 dark:text-slate-300">아직 누적한 나이스 파일이 없습니다.</p>}
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-600 dark:text-slate-300">원본 Excel은 복사하지 않고 검증에 필요한 학번·이름·봉사 기록만 이 PC의 앱 저장소에 보관합니다.</p>
        </Panel>
        <Panel title="2. 확인서 HWP 누적 보관함" subtitle="넣어 둔 모든 확인서를 한꺼번에 검증하며, 직접 삭제하기 전까지 이 PC에 보관됩니다.">
          <div className="flex flex-wrap gap-2"><ActionButton onClick={importHwp} icon={<FilePlus2 size={15} />} disabled={busy}>HWP 추가</ActionButton><ActionButton onClick={refresh} icon={<RefreshCw size={15} />}>목록 새로고침</ActionButton></div>
          <div className="mt-3 rounded-xl border border-blue-300 bg-blue-50 p-3 text-xs font-bold text-blue-950 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-100"><HardDrive size={15} className="mr-1 inline" />앱 전용 로컬 복사본만 보관합니다. 구글시트·학교 공유 서버에는 파일명이나 내용도 보내지 않습니다.</div>
          <p className="mt-3 text-sm font-bold">누적: <span className="text-emerald-700 dark:text-emerald-300">{files.length}개 HWP · {files.reduce((sum, file) => sum + file.formCount, 0)}개 확인서</span></p>
        </Panel>
      </div>

      <Panel title="보관된 확인서 목록" subtitle="목록에 있는 모든 파일이 전체 누적 검증 대상입니다.">
        <div className="space-y-2">{files.map(file => <div key={file.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 md:flex-row md:items-center dark:border-slate-700"><div className="min-w-0 flex-1"><b className="block truncate">{file.originalName}</b><small className="font-semibold text-slate-600 dark:text-slate-300">{file.formCount}개 확인서 · {file.activities.join(', ') || '활동명 확인 필요'} · {(file.size / 1024).toFixed(0)}KB</small></div><div className="flex gap-2"><button onClick={() => window.electron.openVolunteerHwp(file.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-600"><FolderOpen size={14} className="mr-1 inline" />열기</button><button onClick={() => remove(file.id)} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-700 dark:text-rose-300"><Trash2 size={14} className="mr-1 inline" />로컬 복사본 삭제</button></div></div>)}</div>
        {!files.length && <p className="py-8 text-center text-sm font-bold text-slate-600 dark:text-slate-300">보관된 HWP가 없습니다. 위의 `HWP 추가`를 눌러 주세요.</p>}
      </Panel>

      <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center dark:border-slate-700 dark:bg-slate-900">
        <div className="flex-1"><p className="font-black">3. 활동 내용·시간 전체 검증</p><p className="text-sm font-semibold text-slate-600 dark:text-slate-300">학생마다 나이스와 확인서의 봉사활동을 여러 행으로 펼쳐 내용과 시간을 일대일로 맞춥니다. 확인서 학번·이름은 서버 학생 명렬로 검증합니다.</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold"><span className={clsx('rounded-full px-2.5 py-1', roster?.students.length ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100' : 'bg-amber-100 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100')}>서버 학생 명렬: {roster?.students.length ? `${roster.students.length}명 불러옴` : rosterLoading ? '불러오는 중…' : '확인 필요'}</span><button onClick={() => void loadRoster(true)} disabled={rosterLoading} className="rounded-full border border-slate-300 px-2.5 py-1 dark:border-slate-600"><RefreshCw size={12} className={clsx('mr-1 inline', rosterLoading && 'animate-spin')} />명렬 새로고침</button></div></div>
        <button disabled={busy || !files.length || !neisDatasets.length} onClick={verify} className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-50"><FileCheck2 size={18} className="mr-2 inline" />{busy ? '전체 검증 중…' : '누적 자료 전체 검증'}</button>
      </div>

      {message && <p className="rounded-xl bg-slate-100 p-4 text-sm font-bold dark:bg-slate-800">{message}</p>}
      {comparison && <Panel title="검증 결과" subtitle={`학생 ${new Set(comparison.rows.map(row => row.studentId)).size}명 · 활동 비교 ${comparison.rows.length}행 · 확인서 미분류 ${comparison.unclassified.length}행`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Summary label="내용·시간 일치" value={`${counts.matched}행`} tone="emerald" /><Summary label="나이스에만 있음" value={`${counts.neisOnly}행`} tone="amber" /><Summary label="확인서에만 있음" value={`${counts.hwpOnly}행`} tone="amber" /><Summary label="미분류" value={`${counts.unclassified}행`} tone={counts.unclassified ? 'rose' : 'emerald'} /><Summary label="중복 자료" value={`${counts.duplicates}건`} tone={counts.duplicates ? 'rose' : 'emerald'} /></div>
        {!counts.neisOnly && !counts.hwpOnly && !counts.unclassified && !counts.duplicates && <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-5 font-black text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"><CheckCircle2 />모든 활동의 내용과 시간이 누락·중복 없이 정상적으로 일치합니다.</div>}
        <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setSelectedClass('all')} className={classFilterClass(selectedClass === 'all')}>전체 {comparison.rows.length}행</button>{classOptions.map(className => <button key={className} onClick={() => setSelectedClass(className)} className={classFilterClass(selectedClass === className)}>{className}반 {comparison.rows.filter(row => `${row.grade}-${row.className}` === className).length}행</button>)}<button onClick={() => setSelectedClass('unclassified')} className={classFilterClass(selectedClass === 'unclassified', true)}>미분류 {comparison.unclassified.length}행</button></div>
        {selectedClass === 'unclassified' && <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-950 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-100">미분류에는 확인서에 사람이 잘못 입력한 것으로 보이는 학번·이름이 모입니다. 나이스 자료는 신뢰하고 별도의 명렬 검사를 하지 않습니다.</div>}
        <p className="mt-3 text-xs font-semibold text-slate-600 dark:text-slate-300">활동 내용·기간·시간 칸에 마우스를 올리면 원본 파일명과 Excel 행 또는 HWP 내 확인서 위치를 볼 수 있습니다.</p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full min-w-[1360px] table-fixed text-sm"><colgroup><col className="w-[105px]" /><col className="w-[75px]" /><col className="w-[90px]" /><col className="w-[220px]" /><col className="w-[155px]" /><col className="w-[80px]" /><col className="w-[220px]" /><col className="w-[155px]" /><col className="w-[80px]" /><col className="w-[210px]" /></colgroup><thead className="bg-slate-100 dark:bg-slate-800"><tr><th className="p-2">상태</th><th className="p-2">학번</th><th className="p-2">이름</th><th className="p-2 text-left">나이스 활동 내용</th><th className="p-2">기간</th><th className="p-2">시간</th><th className="p-2 text-left">확인서 활동 내용</th><th className="p-2">기간</th><th className="p-2">시간</th><th className="p-2 text-left">판정</th></tr></thead><tbody>{visibleRows.map(row => <RosterComparisonRow key={row.id} row={row} />)}</tbody></table></div>
        {!visibleRows.length && <p className="py-6 text-center text-sm font-bold text-slate-600 dark:text-slate-300">선택한 반의 자료가 없습니다.</p>}
        {comparison.duplicates.length > 0 && <div className="mt-5"><h3 className="font-black text-rose-800 dark:text-rose-200">중복 자료 상세</h3><div className="mt-2 overflow-x-auto rounded-xl border border-rose-200 dark:border-rose-800"><table className="w-full min-w-[850px] text-sm"><thead className="bg-rose-50 dark:bg-rose-950/40"><tr><th className="p-3">자료</th><th className="p-3">학번</th><th className="p-3">이름</th><th className="p-3">중복 횟수</th><th className="p-3 text-left">활동</th></tr></thead><tbody>{comparison.duplicates.map((duplicate, index) => <tr key={`${duplicate.source}-${duplicate.studentId}-${index}`} className="border-t border-rose-200 dark:border-rose-800"><td className="p-3 font-black">{duplicate.source === 'neis' ? '나이스' : '확인서'}</td><td className="p-3 font-bold">{duplicate.studentId}</td><td className="p-3 font-bold">{duplicate.name}</td><td className="p-3 text-center font-black text-rose-700 dark:text-rose-300">{duplicate.count}회</td><td className="cursor-help p-3" title={`원본 파일: ${duplicate.sourceNames.join(', ')}`}><b>{duplicate.activity || '활동명 없음'}</b><small className="ml-2 text-slate-500 dark:text-slate-400">(파일 정보는 마우스를 올려 확인)</small></td></tr>)}</tbody></table></div></div>}
      </Panel>}
    </div>
  )
}

function RosterComparisonRow({ row }: { row: VolunteerRosterComparisonRow }) {
  const status = {
    matched: { label: '일치', icon: CheckCircle2, style: 'text-emerald-800 dark:text-emerald-200' },
    'neis-only': { label: '나이스에만', icon: AlertTriangle, style: 'text-amber-800 dark:text-amber-200' },
    'hwp-only': { label: '확인서에만', icon: AlertTriangle, style: 'text-amber-800 dark:text-amber-200' },
    unclassified: { label: '미분류', icon: XCircle, style: 'text-rose-800 dark:text-rose-200' },
  }[row.status]
  const Icon = status.icon
  return <tr className={clsx('border-t border-slate-200 align-middle dark:border-slate-700', row.status === 'matched' ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : row.status === 'unclassified' ? 'bg-rose-50/50 dark:bg-rose-950/20' : 'bg-amber-50/30 dark:bg-amber-950/10')}><td className={clsx('whitespace-nowrap p-2 font-black', status.style)}><Icon size={15} className="mr-1 inline" />{status.label}</td><td className="p-2 text-center font-black">{row.studentId || '-'}</td><td className="truncate p-2 text-center font-bold" title={row.displayName}>{row.displayName}</td><ActivitySideCells side={row.neis} /><ActivitySideCells side={row.hwp} /><td className="cursor-help p-2 font-semibold"><p className="line-clamp-2 leading-5" title={row.message}>{row.message}</p></td></tr>
}

function ActivitySideCells({ side }: { side: VolunteerRosterComparisonRow['neis'] }) {
  if (!side) return <><td className="p-2 font-bold text-slate-500 dark:text-slate-400">기록 없음</td><td className="p-2 text-center text-slate-500 dark:text-slate-400">-</td><td className="p-2 text-center text-slate-500 dark:text-slate-400">-</td></>
  const date = [side.startDate, side.endDate].filter(Boolean).join(' ~ ')
  const sourceTooltip = [`원본 파일: ${side.sourceName}`, side.sourceLocation && `원본 위치: ${side.sourceLocation}`].filter(Boolean).join('\n')
  return <><td className="cursor-help p-2" title={sourceTooltip}><div className="flex min-w-0 items-center gap-1.5"><p className="truncate font-black">{side.content || '활동 내용 없음'}</p>{side.duplicateCount > 1 && <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-black text-rose-800 dark:bg-rose-900/50 dark:text-rose-100">{side.duplicateCount}회</span>}</div></td><td className="cursor-help truncate p-2 text-center font-semibold" title={`${date || '기간 미입력'}\n${sourceTooltip}`}>{date || '-'}</td><td className="cursor-help whitespace-nowrap p-2 text-center font-black text-blue-900 dark:text-blue-200" title={sourceTooltip}>{side.hours == null ? '미입력' : `${side.hours}시간`}</td></>
}

function loadNeisDatasets(): StoredVolunteerNeisDataset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NEIS_DATASETS_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(dataset => dataset && typeof dataset.id === 'string' && Array.isArray(dataset.records))
  } catch { return [] }
}

async function hashBytes(bytes: number[]) {
  const buffer = new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).at(-1) || '나이스 봉사활동 자료.xls'
}

function classFilterClass(active: boolean, danger = false) {
  return clsx('rounded-full border px-3 py-1.5 text-sm font-black', active ? danger ? 'border-rose-700 bg-rose-700 text-white dark:border-rose-300 dark:bg-rose-300 dark:text-slate-950' : 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-300 dark:bg-emerald-300 dark:text-slate-950' : danger ? 'border-rose-300 bg-white text-rose-800 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200' : 'border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100')
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="text-lg font-black">{title}</h2>{subtitle && <p className="mb-4 mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{subtitle}</p>}{children}</section>
}
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={clsx('block text-sm font-bold', wide && 'md:col-span-2')}><span className="mb-1.5 block">{label}</span>{children}</label> }
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button onClick={onClick} className={clsx('flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black', active ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800')}>{icon}{label}</button> }
function ActionButton({ onClick, icon, children, danger, disabled }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; danger?: boolean; disabled?: boolean }) { return <button disabled={disabled} onClick={onClick} className={clsx('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold disabled:opacity-50', danger ? 'border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300' : 'border-slate-300 text-slate-800 dark:border-slate-600 dark:text-slate-100')}>{icon}{children}</button> }
function Summary({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'rose' | 'amber' | 'emerald' }) { const styles = { slate: 'bg-slate-100 dark:bg-slate-800', rose: 'bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-100', amber: 'bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100', emerald: 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100' }; return <div className={clsx('rounded-xl p-3', styles[tone])}><p className="text-xs font-bold opacity-75">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div> }
