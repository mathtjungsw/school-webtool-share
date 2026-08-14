import { useEffect, useMemo, useState } from 'react'
import { FileCheck2, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, UserRoundCheck, X } from 'lucide-react'
import clsx from 'clsx'
import { getSharedStudentRoster } from '../services/schoolHub'
import type { SharedStudentRoster, StudentRosterEntry } from '../services/rosterAttendance'
import {
  createVolunteerRow,
  emptyCoordinatorVolunteerDraft,
  validateCoordinatorVolunteerDraft,
  volunteerStudentId,
  type CoordinatorVolunteerCertificateDraft,
  type ParsedVolunteerForm,
} from '../services/volunteerWork'
import { useAppStore } from '../stores/appStore'

interface Props {
  open: boolean
  onClose: () => void
  onApplied?: () => void | Promise<void>
}

const fieldClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-bold text-slate-950 outline-none focus:border-emerald-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white'

export default function CoordinatorVolunteerModal({ open, onClose, onApplied }: Props) {
  const teacherName = useAppStore(state => state.config.teacherName)
  const [draft, setDraft] = useState<CoordinatorVolunteerCertificateDraft>(() => emptyCoordinatorVolunteerDraft(teacherName))
  const [roster, setRoster] = useState<SharedStudentRoster | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [showExcluded, setShowExcluded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const gradeStudents = useMemo(() => (roster?.students || [])
    .filter(student => student.grade === draft.grade)
    .sort(studentSort), [roster, draft.grade])
  const classOptions = useMemo(() => [...new Set(gradeStudents.map(student => student.className))]
    .sort((a, b) => Number(a) - Number(b)), [gradeStudents])
  const selectedStudents = useMemo(() => gradeStudents.filter(student => selectedIds.has(volunteerStudentId(student.studentId))), [gradeStudents, selectedIds])
  const excludedStudents = useMemo(() => gradeStudents.filter(student => !selectedIds.has(volunteerStudentId(student.studentId))), [gradeStudents, selectedIds])
  const displayedStudents = useMemo(() => {
    const keyword = search.replace(/\s+/g, '').toLowerCase()
    const source = showExcluded ? excludedStudents : selectedStudents
    return source.filter(student => (classFilter === 'all' || student.className === classFilter)
      && (!keyword || `${volunteerStudentId(student.studentId)}${student.name.replace(/\s+/g, '').toLowerCase()}`.includes(keyword)))
  }, [selectedStudents, excludedStudents, showExcluded, classFilter, search])
  const certificateDraft = useMemo<CoordinatorVolunteerCertificateDraft>(() => ({
    ...draft,
    confirmTeacher: teacherName || draft.confirmTeacher,
    students: selectedStudents.map(student => createVolunteerRow({
      studentId: volunteerStudentId(student.studentId),
      name: student.name,
      hours: draft.hours,
      remarks: '',
    })),
  }), [draft, selectedStudents, teacherName])
  const errors = useMemo(() => validateCoordinatorVolunteerDraft(certificateDraft), [certificateDraft])
  const classCounts = useMemo(() => classOptions.map(className => ({
    className,
    included: selectedStudents.filter(student => student.className === className).length,
    total: gradeStudents.filter(student => student.className === className).length,
  })), [classOptions, gradeStudents, selectedStudents])

  useEffect(() => {
    if (!open) return
    setDraft(current => ({ ...current, confirmTeacher: teacherName || current.confirmTeacher }))
    void loadRoster()
  }, [open])

  async function loadRoster(force = false) {
    setLoading(true)
    try {
      const next = await getSharedStudentRoster(force)
      setRoster(next)
      if (!next?.students.length) setMessage('학교 공유 학생 명렬을 불러오지 못했습니다. 학교 공유 서비스 연결 상태를 확인해 주세요.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally { setLoading(false) }
  }

  const chooseGrade = (grade: string) => {
    setDraft(current => ({ ...current, grade }))
    setClassFilter('all')
    setShowExcluded(false)
    const ids = new Set((roster?.students || [])
      .filter(student => student.grade === grade)
      .map(student => volunteerStudentId(student.studentId)))
    setSelectedIds(ids)
    setMessage(grade ? `${grade}학년 전체 ${ids.size}명을 불러왔습니다. 스캔 원본에 없는 학생만 제외해 주세요.` : '')
  }

  const exclude = (student: StudentRosterEntry) => {
    const id = volunteerStudentId(student.studentId)
    setSelectedIds(current => { const next = new Set(current); next.delete(id); return next })
  }
  const restore = (student: StudentRosterEntry) => {
    const id = volunteerStudentId(student.studentId)
    setSelectedIds(current => new Set(current).add(id))
  }
  const restoreAll = () => {
    setSelectedIds(new Set(gradeStudents.map(student => volunteerStudentId(student.studentId))))
    setShowExcluded(false)
    setMessage(`${draft.grade}학년 전체 명렬을 다시 포함했습니다.`)
  }
  const clearAll = () => {
    if (!confirm('현재 생성용 명단에서 모든 학생을 제외할까요? 학교 공유 명렬 원본은 수정되지 않습니다.')) return
    setSelectedIds(new Set())
    setShowExcluded(true)
    setMessage('현재 생성용 명단을 비웠습니다. 제외 학생 보기에서 다시 복원할 수 있습니다.')
  }

  const applyToVerification = async () => {
    if (errors.length) { setMessage(errors[0]); return }
    setBusy(true)
    try {
      const forms = buildVerificationForms(certificateDraft)
      await window.electron.storeGeneratedVolunteerForms(draft.documentTitle, forms)
      await onApplied?.()
      setMessage(`'${draft.documentTitle}'을 수기 생성한 확인서로 검증 보관함에 바로 반영했습니다. PDF를 만들거나 다시 올릴 필요가 없습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }

  if (!open) return null
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="봉사활동 확인서 생성 담당자용">
    <div className="flex max-h-[94vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-3xl border border-slate-300 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
        <div><h2 className="flex items-center gap-2 text-xl font-black"><UserRoundCheck className="text-emerald-600" />봉사활동 확인서 생성(담당자용)</h2><p className="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">스캔 확인서를 눈으로 확인하면서 해당 학년 명렬에서 미참여 학생만 제외한 뒤, 별도 파일 없이 검증 자료에 바로 반영합니다.</p></div>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 p-2 dark:border-slate-600" aria-label="닫기"><X /></button>
      </header>

      <div className="overflow-y-auto p-5">
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-blue-300 bg-blue-50 p-4 text-sm font-bold text-blue-950 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-100"><ShieldCheck className="mt-0.5 shrink-0" size={20} /><span>학교 공유 명렬은 처음 불러올 때만 사용합니다. 작성 명단과 반영 자료는 이 PC에서만 처리하며 서버·구글시트·외부 서비스로 전송하지 않습니다. 원본 학생 명렬도 수정하지 않습니다.</span></div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="text-sm font-black xl:col-span-2">확인서 제목 *<input className={`${fieldClass} mt-1.5`} value={draft.documentTitle} onChange={event => setDraft(current => ({ ...current, documentTitle: event.target.value }))} placeholder="예: 2학년 8월 단체봉사활동 확인서" /></label>
            <label className="text-sm font-black xl:col-span-2">활동 내용 *<input className={`${fieldClass} mt-1.5`} value={draft.activityContent} onChange={event => setDraft(current => ({ ...current, activityContent: event.target.value }))} placeholder="예: 사제동행 교내 환경정화" /></label>
            <label className="text-sm font-black">활동 시작일 *<input type="date" className={`${fieldClass} mt-1.5`} value={draft.startDate} onChange={event => setDraft(current => ({ ...current, startDate: event.target.value }))} /></label>
            <label className="text-sm font-black">활동 종료일 *<input type="date" className={`${fieldClass} mt-1.5`} value={draft.endDate} onChange={event => setDraft(current => ({ ...current, endDate: event.target.value }))} /></label>
            <label className="text-sm font-black">인정 시간 *<input type="number" min="0.5" max="24" step="0.5" className={`${fieldClass} mt-1.5`} value={draft.hours} onChange={event => setDraft(current => ({ ...current, hours: event.target.value }))} /></label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[220px_auto_1fr]">
            <label className="text-sm font-black">학년 *<select className={`${fieldClass} mt-1.5`} value={draft.grade} onChange={event => chooseGrade(event.target.value)}><option value="">학년 선택</option><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select></label>
            <button type="button" onClick={() => void loadRoster(true)} disabled={loading} className="self-end rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black dark:border-slate-600"><RefreshCw size={15} className={clsx('mr-1 inline', loading && 'animate-spin')} />명렬 새로고침</button>
            <div className="self-end rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100">현재 포함 {selectedStudents.length}명 · 제외 {excludedStudents.length}명 · 확인자 {teacherName || '환경설정 이름 필요'}</div>
          </div>
        </section>

        {draft.grade && selectedStudents.length > 0 && <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-200/60 p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between"><div><h3 className="font-black">확인서 미리보기</h3><p className="text-xs font-bold text-slate-600 dark:text-slate-300">실제 PDF를 만들지는 않으며, 아래 내용을 그대로 검증 자료로 반영합니다.</p></div><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-900 dark:bg-violet-900/50 dark:text-violet-100">수기 생성한 확인서</span></div>
          <div className="grid gap-4 xl:grid-cols-2">{classCounts.filter(item => item.included > 0).map(item => {
            const students = selectedStudents.filter(student => student.className === item.className)
            return <article key={item.className} className="mx-auto w-full max-w-[720px] rounded-sm bg-white p-5 text-slate-950 shadow-lg ring-1 ring-slate-300">
              <p className="text-right text-[10px] font-bold">수기 생성한 확인서</p><h4 className="mt-1 border-y-2 border-slate-900 py-2 text-center text-lg font-black">{draft.documentTitle || '확인서 제목 미입력'}</h4>
              <table className="mt-3 w-full border-collapse text-xs"><tbody><tr><th className="w-28 border border-slate-800 bg-slate-100 p-2">학년·반</th><td className="border border-slate-800 p-2">{draft.grade}학년 {item.className}반</td></tr><tr><th className="border border-slate-800 bg-slate-100 p-2">활동 기간</th><td className="border border-slate-800 p-2">{draft.startDate} ~ {draft.endDate}</td></tr><tr><th className="border border-slate-800 bg-slate-100 p-2">활동 내용</th><td className="border border-slate-800 p-2">{draft.activityContent || '-'}</td></tr><tr><th className="border border-slate-800 bg-slate-100 p-2">인정 시간</th><td className="border border-slate-800 p-2">{draft.hours || '-'}시간</td></tr></tbody></table>
              <table className="mt-3 w-full border-collapse text-xs"><thead><tr><th className="border border-slate-800 bg-slate-100 p-1.5">학번</th><th className="border border-slate-800 bg-slate-100 p-1.5">이름</th><th className="border border-slate-800 bg-slate-100 p-1.5">시간</th></tr></thead><tbody>{students.map(student => <tr key={student.studentId}><td className="border border-slate-800 p-1.5 text-center">{volunteerStudentId(student.studentId)}</td><td className="border border-slate-800 p-1.5 text-center font-bold">{student.name}</td><td className="border border-slate-800 p-1.5 text-center">{draft.hours}시간</td></tr>)}</tbody></table>
            </article>
          })}</div>
        </section>}

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-500" size={17} /><input className={`${fieldClass} pl-10`} value={search} onChange={event => setSearch(event.target.value)} placeholder="4자리 학번 또는 이름 검색" /></div>
            <select className={`${fieldClass} xl:w-40`} value={classFilter} onChange={event => setClassFilter(event.target.value)}><option value="all">전체 반</option>{classOptions.map(className => <option key={className} value={className}>{className}반</option>)}</select>
            <button type="button" onClick={() => setShowExcluded(false)} className={viewButton(!showExcluded)}>포함 학생 {selectedStudents.length}</button>
            <button type="button" onClick={() => setShowExcluded(true)} className={viewButton(showExcluded, true)}>제외 학생 {excludedStudents.length}</button>
            <button type="button" onClick={restoreAll} disabled={!gradeStudents.length} className="rounded-xl border border-blue-300 px-3 py-2.5 text-sm font-black text-blue-800 disabled:opacity-50 dark:border-blue-700 dark:text-blue-200"><RotateCcw size={15} className="mr-1 inline" />전체 복원</button>
            <button type="button" onClick={clearAll} disabled={!selectedStudents.length} className="rounded-xl border border-rose-300 px-3 py-2.5 text-sm font-black text-rose-800 disabled:opacity-50 dark:border-rose-700 dark:text-rose-200"><Trash2 size={15} className="mr-1 inline" />현재 명단 비우기</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{classCounts.map(item => <span key={item.className} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black dark:bg-slate-800">{item.className}반 {item.included}/{item.total}명</span>)}</div>
          <div className="mt-3 max-h-[360px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[620px] text-sm"><thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800"><tr><th className="w-20 p-2">반</th><th className="w-24 p-2">번호</th><th className="w-28 p-2">학번</th><th className="p-2 text-left">이름</th><th className="w-28 p-2">처리</th></tr></thead><tbody>{displayedStudents.map(student => <tr key={volunteerStudentId(student.studentId)} className="border-t border-slate-200 dark:border-slate-700"><td className="p-2 text-center font-bold">{student.className}반</td><td className="p-2 text-center font-bold">{Number(student.number)}번</td><td className="p-2 text-center font-black">{volunteerStudentId(student.studentId)}</td><td className="p-2 font-black">{student.name}</td><td className="p-2 text-center">{showExcluded ? <button type="button" onClick={() => restore(student)} className="rounded-lg border border-emerald-400 px-3 py-1.5 text-xs font-black text-emerald-800 dark:text-emerald-200">복원</button> : <button type="button" onClick={() => exclude(student)} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-black text-rose-800 dark:text-rose-200">제외</button>}</td></tr>)}</tbody></table>
            {!displayedStudents.length && <p className="p-8 text-center text-sm font-bold text-slate-600 dark:text-slate-300">{draft.grade ? '현재 조건에 표시할 학생이 없습니다.' : '학년을 선택하면 전체 명렬이 표시됩니다.'}</p>}
          </div>
        </section>

        <section className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_auto] dark:border-slate-700 dark:bg-slate-900">
          <div><h3 className="font-black">반영 전 확인</h3><p className="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">{draft.documentTitle || '제목 미입력'} · {draft.grade || '-'}학년 · {draft.activityContent || '활동 내용 미입력'} · {draft.startDate || '-'} ~ {draft.endDate || '-'} · {draft.hours || '-'}시간 · 포함 {selectedStudents.length}명 · 제외 {excludedStudents.length}명</p>{errors.length > 0 && <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-900 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-100">{errors.slice(0, 5).map(error => <p key={error}>• {error}</p>)}</div>}{message && <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm font-bold dark:bg-slate-800">{message}</p>}</div>
          <button type="button" onClick={() => void applyToVerification()} disabled={busy || errors.length > 0} className="self-end rounded-xl bg-emerald-700 px-6 py-3 font-black text-white disabled:opacity-50"><FileCheck2 size={18} className="mr-2 inline" />{busy ? '검증 자료에 반영 중…' : '검증 자료로 바로 반영'}</button>
        </section>
      </div>
    </div>
  </div>
}

function buildVerificationForms(draft: CoordinatorVolunteerCertificateDraft): ParsedVolunteerForm[] {
  const classes = [...new Set(draft.students.map(student => volunteerStudentId(student.studentId).slice(0, 2)))].sort((a, b) => Number(a) - Number(b))
  return classes.map((classKey, formIndex) => ({
    formIndex,
    activityName: draft.activityContent,
    startDate: draft.startDate,
    endDate: draft.endDate,
    institution: draft.schoolName,
    area: '이웃돕기활동',
    location: '학교 내',
    activityContent: draft.activityContent,
    confirmTeacher: draft.confirmTeacher,
    participants: draft.students
      .filter(student => volunteerStudentId(student.studentId).slice(0, 2) === classKey)
      .sort((a, b) => Number(volunteerStudentId(a.studentId)) - Number(volunteerStudentId(b.studentId)))
      .map(student => ({
        studentId: volunteerStudentId(student.studentId),
        name: student.name,
        hours: Number(draft.hours),
        remarks: '',
        correctionNote: '수기 생성한 확인서',
      })),
  }))
}

function studentSort(a: StudentRosterEntry, b: StudentRosterEntry) {
  return Number(a.className) - Number(b.className) || Number(a.number) - Number(b.number) || a.name.localeCompare(b.name, 'ko')
}

function viewButton(active: boolean, danger = false) {
  return clsx('rounded-xl border px-3 py-2.5 text-sm font-black', active
    ? danger ? 'border-rose-700 bg-rose-700 text-white' : 'border-emerald-700 bg-emerald-700 text-white'
    : danger ? 'border-rose-300 text-rose-800 dark:border-rose-700 dark:text-rose-200' : 'border-slate-300 text-slate-800 dark:border-slate-600 dark:text-slate-100')
}
