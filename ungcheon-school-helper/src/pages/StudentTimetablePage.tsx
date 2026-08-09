import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle, CheckCircle2, FileSpreadsheet, FolderOpen, GraduationCap,
  Printer, RefreshCw, Search, ShieldCheck, UsersRound,
} from 'lucide-react'
import clsx from 'clsx'
import { useAdminStore } from '../stores/adminStore'
import { useAppStore } from '../stores/appStore'
import {
  getSharedStudentTimetable,
  getSharedStudentRoster,
  replaceSharedStudentTimetable,
  subscribeHubResource,
} from '../services/schoolHub'
import { UNGCHEON_PERIOD_PLAN } from '../services/ungcheonSchedule'
import {
  STUDENT_TIMETABLE_DAYS,
  emptyStudentTimetableDataset,
  getStudentTimetableStats,
  mergeStudentTimetableImport,
  parseStudentTimetableWorkbook,
  prepareSharedStudentTimetable,
  type PersonalTimetable,
  type SharedStudentTimetable,
} from '../services/studentTimetable'

interface ImportMessage {
  fileName: string
  ok: boolean
  text: string
}

const KIND_LABEL = {
  master: '학급별 전체시간표',
  courses: '강좌 일괄개설',
  enrollments: '수강생 일괄개설',
  subjectNames: '과목 정식 명칭',
} as const

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character)

function timetablePrintBlock(personal: PersonalTimetable) {
  const rows = UNGCHEON_PERIOD_PLAN.slice(0, 7).map(period => {
    const cells = STUDENT_TIMETABLE_DAYS.map(day => {
      const slot = personal.slots[`${day}${period.period}`]
      const details = [slot?.classroom, slot?.teacher].filter(Boolean).join(' · ')
      return `
        <td class="${slot?.selectedCourse ? 'selected' : ''}">
          <strong>${escapeHtml(slot?.subject ?? '')}</strong>
          ${details ? `<small>${escapeHtml(details)}</small>` : ''}
        </td>
      `
    }).join('')
    return `
      <tr>
        <th><b>${period.period}교시</b><small>${period.start}~${period.end}</small></th>
        ${cells}
      </tr>
    `
  }).join('')

  return `
    <section class="sheet">
      <header>
        <div>
          <h1>학생별 시간표</h1>
          <p>2026학년도 2학기 · 웅천고등학교</p>
        </div>
        <dl>
          <div><dt>학번</dt><dd>${escapeHtml(personal.student.studentId)}</dd></div>
          <div><dt>이름</dt><dd>${escapeHtml(personal.student.name)}</dd></div>
        </dl>
      </header>
      <table>
        <thead><tr><th></th>${STUDENT_TIMETABLE_DAYS.map(day => `<th>${day}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="legend"><i></i> 선택과목 수업 · 강의실과 담당교사가 함께 표시됩니다.</p>
    </section>
  `
}

function printPersonalTimetables(personals: PersonalTimetable[], title: string) {
  if (personals.length === 0) return
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.setAttribute('aria-hidden', 'true')
  document.body.appendChild(frame)
  const documentRef = frame.contentDocument
  if (!documentRef) {
    frame.remove()
    return
  }
  documentRef.open()
  documentRef.write(`<!doctype html>
    <html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #172033; font-family: "Malgun Gothic", sans-serif; }
      .sheet { min-height: 180mm; page-break-after: always; display: flex; flex-direction: column; justify-content: center; }
      .sheet:last-child { page-break-after: auto; }
      header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 12px; }
      h1 { margin: 0; font-size: 23px; }
      header p { margin: 5px 0 0; color: #64748b; font-size: 11px; }
      dl { display: flex; margin: 0; border: 1px solid #64748b; }
      dl div { display: flex; }
      dt, dd { margin: 0; padding: 7px 12px; font-size: 12px; }
      dt { background: #f1f5f9; font-weight: 700; }
      dd { min-width: 80px; border-left: 1px solid #cbd5e1; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #64748b; text-align: center; height: 58px; padding: 4px; }
      thead th { height: 34px; background: #f1f5f9; font-size: 13px; }
      tbody th { width: 90px; background: #f8fafc; }
      th b, th small, td strong, td small { display: block; }
      th small, td small { margin-top: 3px; color: #64748b; font-size: 9px; font-weight: 400; }
      td strong { font-size: 11px; }
      td.selected { background: #dcfce7; }
      .legend { margin: 9px 0 0; color: #64748b; font-size: 10px; }
      .legend i { display: inline-block; width: 10px; height: 10px; margin-right: 4px; background: #dcfce7; border: 1px solid #86efac; vertical-align: -1px; }
    </style></head><body>${personals.map(timetablePrintBlock).join('')}</body></html>`)
  documentRef.close()
  frame.onload = () => {
    const printWindow = frame.contentWindow
    if (!printWindow) return
    printWindow.onafterprint = () => frame.remove()
    printWindow.focus()
    printWindow.print()
  }
}

export default function StudentTimetablePage() {
  const config = useAppStore(state => state.config)
  const isAdmin = useAdminStore(state => state.isAdmin)
  const adminPassword = useAdminStore(state => state.adminPassword)
  const [shared, setShared] = useState<SharedStudentTimetable | null>(null)
  const [messages, setMessages] = useState<ImportMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [grade, setGrade] = useState('2')
  const [className, setClassName] = useState('')
  const [query, setQuery] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const configured = Boolean(config.schoolHubUrl)

  const students = useMemo(
    () => shared?.students.map(personal => personal.student) ?? [],
    [shared],
  )
  const classOptions = useMemo(() =>
    [...new Set(students.filter(student => student.grade === grade).map(student => student.className))]
      .sort((a, b) => Number(a) - Number(b)),
  [students, grade])
  const filteredStudents = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return students.filter(student =>
      student.grade === grade &&
      (!className || student.className === className) &&
      (!keyword || student.studentId.includes(keyword) || student.name.toLowerCase().includes(keyword)),
    )
  }, [students, grade, className, query])

  useEffect(() => {
    if (filteredStudents.some(student => student.studentId === selectedStudentId)) return
    setSelectedStudentId(filteredStudents[0]?.studentId ?? '')
  }, [filteredStudents, selectedStudentId])

  const personal = useMemo(
    () => shared?.students.find(item => item.student.studentId === selectedStudentId) ?? null,
    [shared, selectedStudentId],
  )

  const load = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    setError('')
    try {
      setShared(await getSharedStudentTimetable())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => { load() }, [load])
  useEffect(() => subscribeHubResource<SharedStudentTimetable | null>(
    'studentTimetable',
    data => setShared(data),
  ), [])

  const uploadFiles = async () => {
    if (!isAdmin || !adminPassword) {
      setError('관리자 모드에서만 학생 시간표 자료를 업로드할 수 있습니다.')
      return
    }
    const paths = await window.electron.openFilesDialog([
      { name: 'Excel 파일', extensions: ['xlsx', 'xlsm', 'xls'] },
    ])
    if (!paths.length) return
    setUploading(true)
    setError('')
    setSuccess('')
    const nextMessages: ImportMessage[] = []
    let nextDataset = emptyStudentTimetableDataset()
    try {
      for (const filePath of paths) {
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath
        try {
          const bytes = await window.electron.readFile(filePath)
          const imported = parseStudentTimetableWorkbook(fileName, bytes)
          nextDataset = mergeStudentTimetableImport(nextDataset, imported)
          nextMessages.push({
            fileName,
            ok: true,
            text: `${KIND_LABEL[imported.kind]}${imported.grades.length ? ` · ${imported.grades.join(',')}학년` : ''}`,
          })
        } catch (fileError) {
          nextMessages.push({
            fileName,
            ok: false,
            text: fileError instanceof Error ? fileError.message : '파일을 읽지 못했습니다.',
          })
        }
      }
      setMessages(nextMessages)
      if (nextMessages.some(message => !message.ok)) {
        throw new Error('읽지 못한 파일이 있습니다. 파일 내용을 확인한 뒤 다시 업로드해 주세요.')
      }

      const stats = getStudentTimetableStats(nextDataset)
      const roster = await getSharedStudentRoster(true)
      const prepared = prepareSharedStudentTimetable(nextDataset, roster?.students ?? [])
      const confirmed = confirm(
        `학생별 시간표 공유 자료를 교체할까요?\n\n학생 ${prepared.studentCount}명 · 학급 ${stats.classes}개 · 강좌 ${stats.courses}개\n\n학생 명렬에 등록된 1학년은 학급 기본시간표로 함께 생성됩니다.\nExcel 원본은 전송되지 않으며 조회용 시간표만 저장됩니다.`,
      )
      if (!confirmed) return

      const result = await replaceSharedStudentTimetable(
        prepared,
        adminPassword,
        config.teacherName?.trim() || '관리자',
      )
      setSuccess(`학생별 시간표 ${result.version}차 업로드가 완료되었습니다.`)
      await load()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError))
    } finally {
      setUploading(false)
    }
  }

  const printSelected = () => {
    if (personal) printPersonalTimetables([personal], `${personal.student.studentId}_${personal.student.name}_시간표`)
  }

  const printClass = () => {
    if (!className || !shared) return
    const personals = shared.students.filter(
      item => item.student.grade === grade && item.student.className === className,
    )
    printPersonalTimetables(personals, `${grade}학년_${className}반_학생별시간표`)
  }

  if (!configured) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="card p-10 text-center border-amber-500/20">
          <FileSpreadsheet size={36} className="mx-auto text-amber-400 mb-3" />
          <h1 className="text-xl font-bold text-white">학교 공유 서비스 설정이 필요합니다</h1>
          <p className="text-sm text-slate-400 mt-2">
            환경설정에 학교 공유 서비스 URL을 입력하면 관리자가 올린 학생별 시간표를 조회할 수 있습니다.
          </p>
        </div>
      </div>
    )
  }

  const ready = Boolean(shared?.students.length)

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap size={23} className="text-emerald-400" />
            <h1 className="page-title">학생별 시간표</h1>
          </div>
          <p className="page-subtitle mt-1">
            관리자가 공유한 2학기 학생별 시간표를 조회하고 인쇄합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading || uploading} className="btn-ghost flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />새로고침
          </button>
          {isAdmin && (
            <button onClick={uploadFiles} disabled={uploading || loading} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              <FolderOpen size={14} />{uploading ? '분석·업로드 중...' : '학생 시간표 자료 업로드'}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/7 px-4 py-3 mb-4 flex items-start gap-3">
        <ShieldCheck size={17} className="text-emerald-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-emerald-300">
            {isAdmin ? '관리자는 자료를 교체하고, 사용자는 조회·인쇄만 할 수 있습니다' : '조회·인쇄 전용 공유 시간표입니다'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Excel 원본은 관리자 PC에서만 분석되고 서버에는 조회용 시간표만 저장됩니다.
            일반 사용자 화면에는 자료 변경이나 원본 다운로드 기능이 제공되지 않습니다.
          </p>
        </div>
      </div>

      {shared && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <SharedStatus title="공유 버전" value={`${shared.version}차`} />
          <SharedStatus title="학생" value={`${shared.studentCount}명`} />
          <SharedStatus title="학급" value={`${shared.classCount}학급`} />
          <SharedStatus title="강좌" value={`${shared.courseCount}강좌`} />
        </div>
      )}

      {shared && (
        <div className="card px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-300 font-semibold">{shared.title}</span>
          <span className="text-slate-500">
            {shared.uploadedBy} 업로드 · {new Date(shared.uploadedAt).toLocaleString('ko-KR')}
          </span>
        </div>
      )}

      {messages.length > 0 && (
        <div className="card p-3 mb-4">
          <p className="text-[10px] font-semibold text-slate-500 mb-2">관리자 업로드 파일 확인 결과</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {messages.map(message => (
              <div key={`${message.fileName}-${message.text}`} className="flex items-start gap-2 text-[11px]">
                {message.ok
                  ? <CheckCircle2 size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  : <AlertCircle size={13} className="text-rose-400 mt-0.5 flex-shrink-0" />}
                <span className="text-slate-300 truncate">{message.fileName}</span>
                <span className={message.ok ? 'text-emerald-400' : 'text-rose-400'}>· {message.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 mb-4 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 mb-4 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 size={15} />
          {success}
        </div>
      )}

      {!ready ? (
        <div className="card border-dashed border-white/10 py-16 text-center">
          {loading
            ? <RefreshCw size={38} className="mx-auto text-emerald-400 mb-3 animate-spin" />
            : <FileSpreadsheet size={38} className="mx-auto text-slate-600 mb-3" />}
          <h2 className="text-base font-semibold text-slate-300">
            {loading ? '공유 시간표를 불러오는 중입니다' : '등록된 학생별 시간표가 없습니다'}
          </h2>
          <p className="text-xs text-slate-500 mt-2">
            {isAdmin
              ? '관리자 모드의 ‘학생 시간표 자료 업로드’에서 2학기 Excel 자료 전체를 선택해 주세요.'
              : '관리자가 자료를 업로드하면 별도 Excel 파일 없이 이 화면에서 조회·인쇄할 수 있습니다.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4">
          <aside className="card p-0 overflow-hidden self-start">
            <div className="p-4 border-b border-white/5">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select value={grade} onChange={event => { setGrade(event.target.value); setClassName('') }} className="input text-xs">
                  <option value="1">1학년</option>
                  <option value="2">2학년</option>
                  <option value="3">3학년</option>
                </select>
                <select value={className} onChange={event => setClassName(event.target.value)} className="input text-xs">
                  <option value="">전체 반</option>
                  {classOptions.map(value => <option key={value} value={value}>{value}반</option>)}
                </select>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="학번 또는 이름 검색"
                  className="input w-full pl-8 text-xs"
                />
              </div>
            </div>
            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between text-[10px]">
              <span className="text-slate-500">학생 목록</span>
              <span className="text-emerald-400">{filteredStudents.length}명</span>
            </div>
            <div className="max-h-[620px] overflow-y-auto scrollbar-none p-2 space-y-1">
              {filteredStudents.map(student => (
                <button
                  key={student.studentId}
                  onClick={() => setSelectedStudentId(student.studentId)}
                  className={clsx(
                    'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    student.studentId === selectedStudentId
                      ? 'bg-emerald-500/15 border border-emerald-400/25'
                      : 'border border-transparent hover:bg-white/5',
                  )}
                >
                  <span className={clsx(
                    'w-8 h-8 rounded-lg grid place-items-center text-[10px] font-bold flex-shrink-0',
                    student.studentId === selectedStudentId
                      ? 'bg-emerald-500/25 text-emerald-300'
                      : 'bg-white/5 text-slate-500',
                  )}>
                    {student.className}-{student.number}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-200 truncate">{student.name}</span>
                    <span className="block text-[10px] text-slate-500">{student.studentId} · 선택 {student.enrollmentCount}과목</span>
                  </span>
                </button>
              ))}
              {filteredStudents.length === 0 && (
                <p className="text-center text-xs text-slate-500 py-10">검색 결과가 없습니다.</p>
              )}
            </div>
          </aside>

          <main className="min-w-0">
            {personal ? (
              <motion.div key={personal.student.studentId} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="card">
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="w-11 h-11 rounded-xl bg-emerald-500/15 grid place-items-center">
                        <UsersRound size={20} className="text-emerald-400" />
                      </span>
                      <div>
                        <h2 className="text-lg font-bold text-white">{personal.student.name}</h2>
                        <p className="text-xs text-slate-400">
                          {personal.student.studentId} · {personal.student.grade}학년 {personal.student.className}반 {personal.student.number}번
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={printSelected} className="btn-ghost flex items-center gap-1.5">
                        <Printer size={13} />이 학생 인쇄
                      </button>
                      <button
                        onClick={printClass}
                        disabled={!className}
                        title={!className ? '왼쪽에서 반을 선택하세요' : undefined}
                        className="btn-primary flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <Printer size={13} />{className ? `${grade}-${className}반 전체 인쇄` : '학급 전체 인쇄'}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed border-separate border-spacing-1 min-w-[720px]">
                      <thead>
                        <tr>
                          <th className="w-24 py-2 text-[11px] text-slate-500"></th>
                          {STUDENT_TIMETABLE_DAYS.map(day => (
                            <th key={day} className="py-2 rounded-lg bg-white/5 text-xs font-bold text-slate-300">{day}요일</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {UNGCHEON_PERIOD_PLAN.slice(0, 7).map(period => (
                          <tr key={period.period}>
                            <th className="px-2 py-2 rounded-lg bg-white/3 text-center">
                              <span className="block text-[11px] font-bold text-slate-400">{period.period}교시</span>
                              <span className="block text-[9px] text-slate-600 mt-0.5">{period.start}~{period.end}</span>
                            </th>
                            {STUDENT_TIMETABLE_DAYS.map(day => {
                              const slot = personal.slots[`${day}${period.period}`]
                              return (
                                <td key={day} className="p-0.5">
                                  <div className={clsx(
                                    'min-h-[68px] rounded-xl border px-2 py-2 flex flex-col justify-center text-center transition-colors',
                                    slot.selectedCourse
                                      ? 'bg-emerald-500/14 border-emerald-400/35'
                                      : slot.subject
                                        ? 'bg-sky-500/8 border-sky-400/15'
                                        : 'bg-white/[0.02] border-white/5',
                                  )}>
                                    {slot.group && (
                                      <span className="text-[8px] font-black text-emerald-400/80 mb-0.5">{slot.group}군</span>
                                    )}
                                    <span className={clsx(
                                      'text-[11px] font-semibold leading-snug',
                                      slot.selectedCourse ? 'text-emerald-200' : slot.subject ? 'text-slate-300' : 'text-slate-700',
                                    )}>
                                      {slot.subject || '·'}
                                    </span>
                                    {(slot.classroom || slot.teacher) && (
                                      <span className="text-[9px] text-slate-500 mt-1 truncate" title={[slot.classroom, slot.teacher].filter(Boolean).join(' · ')}>
                                        {[slot.classroom, slot.teacher].filter(Boolean).join(' · ')}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded bg-sky-500/20 border border-sky-400/20" />학급 기본수업</span>
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-400/40" />학생 선택과목</span>
                  </div>
                </div>

                <div className="card">
                  <h3 className="text-sm font-bold text-white mb-3">선택과목 현황</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {personal.selections
                      .sort((a, b) => a.group.localeCompare(b.group))
                      .map(course => (
                        <div key={`${course.group}-${course.courseName}`} className="rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-3">
                          <div className="flex items-start gap-2">
                            <span className="rounded-md bg-emerald-500/20 text-emerald-300 text-[9px] font-black px-1.5 py-1">{course.group}군</span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-200">{course.courseName}</p>
                              <p className="text-[10px] text-slate-500 mt-1">
                                {course.times.join(' · ')} · {course.classroom || '교실 미지정'} · {course.teacher || '담당교사 미지정'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {personal.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                    <p className="text-xs font-bold text-amber-300 mb-2">확인이 필요한 항목</p>
                    {personal.warnings.map(warning => <p key={warning} className="text-[11px] text-amber-200/80">• {warning}</p>)}
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="card py-20 text-center text-sm text-slate-500">왼쪽에서 학생을 선택하세요.</div>
            )}
          </main>
        </div>
      )}
    </div>
  )
}

function SharedStatus({ title, value }: { title: string; value: string }) {
  return (
    <div className="card p-3.5 border border-emerald-400/20">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 size={14} className="text-emerald-400" />
        <p className="text-[11px] font-semibold text-slate-300">{title}</p>
      </div>
      <p className="text-lg font-bold text-emerald-300">{value}</p>
    </div>
  )
}
