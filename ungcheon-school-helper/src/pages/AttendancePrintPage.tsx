import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, Download, FileSpreadsheet, GraduationCap, Plus, Printer,
  RefreshCw, Save, ShieldCheck, Trash2, Upload, UsersRound,
} from 'lucide-react'
import clsx from 'clsx'
import { useAdminStore } from '../stores/adminStore'
import { useAppStore } from '../stores/appStore'
import {
  getSharedStudentRoster,
  getSharedStudentTimetable,
  replaceSharedStudentRoster,
  subscribeHubResource,
} from '../services/schoolHub'
import {
  downloadAttendanceRosters,
  parseStudentRosterWorkbook,
  printAttendanceRoster,
  printAttendanceRosters,
  type AttendanceRosterPrintGroup,
  type SharedStudentRoster,
  type StudentRosterEntry,
} from '../services/rosterAttendance'
import type { SharedStudentTimetable } from '../services/studentTimetable'

type Tab = 'class' | 'course' | 'manage'

interface CourseRoster {
  key: string
  grade: string
  group: string
  courseName: string
  teacher: string
  classroom: string
  studentIds: string[]
}

const today = () => new Date().toISOString().slice(0, 10)

function studentLookupKey(student: {
  studentId: string
  grade?: string
  className?: string
  number?: string
}): string {
  const grade = String(student.grade ?? '').replace(/\D/g, '')
  const className = String(Number(String(student.className ?? '').replace(/\D/g, '')))
  const number = String(student.number ?? '').replace(/\D/g, '').padStart(2, '0')
  if (grade && className && className !== '0' && number !== '00') {
    return `${grade}${className}${number}`
  }
  const digits = String(student.studentId ?? '').replace(/\D/g, '')
  const padded = digits.match(/^([123])(\d{2})(\d{2})$/)
  return padded ? `${padded[1]}${Number(padded[2])}${padded[3]}` : digits
}

export default function AttendancePrintPage() {
  const config = useAppStore(state => state.config)
  const isAdmin = useAdminStore(state => state.isAdmin)
  const adminPassword = useAdminStore(state => state.adminPassword)
  const [tab, setTab] = useState<Tab>('class')
  const [roster, setRoster] = useState<SharedStudentRoster | null>(null)
  const [timetable, setTimetable] = useState<SharedStudentTimetable | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    if (!config.schoolHubUrl) return
    setLoading(true)
    setError('')
    try {
      const [nextRoster, nextTimetable] = await Promise.all([
        getSharedStudentRoster(),
        getSharedStudentTimetable(),
      ])
      setRoster(nextRoster)
      setTimetable(nextTimetable)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [config.schoolHubUrl])

  useEffect(() => { load() }, [load])
  useEffect(() => subscribeHubResource<SharedStudentRoster | null>('studentRoster', data => setRoster(data)), [])
  useEffect(() => subscribeHubResource<SharedStudentTimetable | null>('studentTimetable', data => setTimetable(data)), [])

  if (!config.schoolHubUrl) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="card p-10 text-center border-amber-500/20">
          <ShieldCheck size={36} className="mx-auto text-amber-400 mb-3" />
          <h1 className="text-xl font-bold text-white">학교 공유 서비스 설정이 필요합니다</h1>
          <p className="text-sm text-slate-400 mt-2">환경설정에서 학교 공유 서비스 URL을 확인해 주세요.</p>
        </div>
      </div>
    )
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof UsersRound }> = [
    { id: 'class', label: '학급 출석부', icon: UsersRound },
    { id: 'course', label: '수업 출석부', icon: GraduationCap },
    ...(isAdmin ? [{ id: 'manage' as const, label: '학생 명렬 관리', icon: FileSpreadsheet }] : []),
  ]

  return (
    <div className="p-6 max-w-[1450px] mx-auto space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><UsersRound size={22} className="text-emerald-400" />출석부 출력</h1>
          <p className="page-subtitle">관리자가 공유한 학생 명렬로 학급 및 이동수업 출석부를 인쇄합니다.</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />새로고침
        </button>
      </header>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/7 px-4 py-3">
        <p className="text-xs font-semibold text-emerald-200">
          {isAdmin ? '관리자는 학생 명렬을 업로드·수정할 수 있습니다.' : '사용자는 공유 명렬 조회와 출석부 인쇄만 할 수 있습니다.'}
        </p>
        <p className="text-[11px] text-slate-400 mt-1">원본 Excel 다운로드 기능은 제공하지 않으며, 이동수업 명단은 ‘학생별 시간표’의 공유 과목선택 자료와 연결됩니다.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-surface-800 border border-white/5 p-1">
        {tabs.map(item => {
          const Icon = item.icon
          return (
            <button key={item.id} onClick={() => setTab(item.id)} className={clsx('flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5', tab === item.id ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-500 hover:text-slate-200')}>
              <Icon size={14} />{item.label}
            </button>
          )
        })}
      </div>

      {error && <Notice tone="error" text={error} />}
      {success && <Notice tone="success" text={success} />}

      {!roster?.students.length && tab !== 'manage' ? (
        <div className="card border-dashed border-white/10 py-16 text-center">
          <FileSpreadsheet size={38} className="mx-auto text-slate-600 mb-3" />
          <h2 className="font-semibold text-slate-300">등록된 학생 명렬이 없습니다</h2>
          <p className="text-xs text-slate-500 mt-2">{isAdmin ? '학생 명렬 관리 탭에서 전체 명렬 Excel을 업로드해 주세요.' : '관리자가 학생 명렬을 등록하면 사용할 수 있습니다.'}</p>
        </div>
      ) : (
        <>
          {tab === 'class' && <ClassAttendance students={roster?.students ?? []} />}
          {tab === 'course' && <CourseAttendance students={roster?.students ?? []} timetable={timetable} />}
          {tab === 'manage' && isAdmin && (
            <ManageRoster
              roster={roster}
              adminPassword={adminPassword}
              uploadedBy={config.teacherName?.trim() || '관리자'}
              onChanged={load}
              onError={setError}
              onSuccess={setSuccess}
            />
          )}
        </>
      )}
    </div>
  )
}

function ClassAttendance({ students }: { students: StudentRosterEntry[] }) {
  const grades = [...new Set(students.map(student => student.grade))].sort()
  const [grade, setGrade] = useState(grades[0] ?? '1')
  const classes = useMemo(
    () => [...new Set(students.filter(student => student.grade === grade).map(student => student.className))]
      .sort((a, b) => Number(a) - Number(b)),
    [grade, students],
  )
  const [className, setClassName] = useState(classes[0] ?? '1')
  const [date, setDate] = useState(today())
  const selected = useMemo(
    () => students.filter(student => student.grade === grade && student.className === className),
    [className, grade, students],
  )
  const homeroom = selected[0]?.homeroomTeacher ?? ''
  const assistant = selected[0]?.assistantTeacher ?? ''
  const [title, setTitle] = useState(`${new Date().getFullYear()}학년도 학급 출석부`)

  useEffect(() => {
    if (!classes.includes(className)) setClassName(classes[0] ?? '')
  }, [className, classes])

  return (
    <div className="grid lg:grid-cols-[390px_minmax(0,1fr)] gap-4 items-start">
      <div className="card space-y-4">
        <h2 className="font-bold text-white">학급 출석부 설정</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="field-label">학년<select className="input-field mt-1" value={grade} onChange={event => setGrade(event.target.value)}>{grades.map(value => <option key={value} value={value}>{value}학년</option>)}</select></label>
          <label className="field-label">반<select className="input-field mt-1" value={className} onChange={event => setClassName(event.target.value)}>{classes.map(value => <option key={value} value={value}>{value}반</option>)}</select></label>
        </div>
        <label className="field-label">출석부 제목<input className="input-field mt-1" value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label className="field-label">날짜<input type="date" className="input-field mt-1" value={date} onChange={event => setDate(event.target.value)} /></label>
        <button
          onClick={() => printAttendanceRoster({ title, date, subtitle: `${grade}학년 ${className}반 · 담임 ${homeroom || '-'}${assistant ? ` · 부담임 ${assistant}` : ''}`, students: selected })}
          disabled={!selected.length || !title.trim()}
          className="btn-primary w-full flex items-center justify-center gap-1.5"
        >
          <Printer size={14} />학급 출석부 인쇄·PDF 저장
        </button>
      </div>
      <RosterPreview title={`${grade}학년 ${className}반`} detail={`담임 ${homeroom || '-'} · 부담임 ${assistant || '-'} · ${selected.length}명`} students={selected} />
    </div>
  )
}

function CourseAttendance({
  students,
  timetable,
}: {
  students: StudentRosterEntry[]
  timetable: SharedStudentTimetable | null
}) {
  const offerings = useMemo(() => buildCourseRosters(timetable), [timetable])
  const teachers = useMemo(
    () => [...new Set(offerings.flatMap(offering => offering.teacher.split(/[·,/]/).map(value => value.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'ko')),
    [offerings],
  )
  const [teacher, setTeacher] = useState('')
  const [outputMode, setOutputMode] = useState<'single' | 'teacher' | 'subject'>('single')
  const subjects = useMemo(
    () => [...new Set(offerings.map(offering => offering.courseName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [offerings],
  )
  const [subject, setSubject] = useState('')
  const filtered = useMemo(
    () => teacher ? offerings.filter(offering => offering.teacher.includes(teacher)) : offerings,
    [offerings, teacher],
  )
  const [offeringKey, setOfferingKey] = useState('')
  const selectedOffering = offerings.find(offering => offering.key === offeringKey) ?? filtered[0]
  const rosterById = useMemo(
    () => new Map(students.map(student => [studentLookupKey(student), student])),
    [students],
  )
  const selectedStudents = useMemo(
    () => selectedOffering?.studentIds.map(studentId => rosterById.get(studentId)).filter((student): student is StudentRosterEntry => Boolean(student)) ?? [],
    [rosterById, selectedOffering],
  )
  const [date, setDate] = useState(today())
  const [title, setTitle] = useState('수업 출석부')

  const outputOfferings = useMemo(() => {
    if (outputMode === 'teacher') {
      return teacher ? offerings.filter(offering => offering.teacher.includes(teacher)) : []
    }
    if (outputMode === 'subject') {
      return subject ? offerings.filter(offering => offering.courseName === subject) : []
    }
    return selectedOffering ? [selectedOffering] : []
  }, [offerings, outputMode, selectedOffering, subject, teacher])

  const outputGroups = useMemo<AttendanceRosterPrintGroup[]>(
    () => outputOfferings.map(offering => ({
      title,
      date,
      subtitle: `${offering.teacher || '담당교사 미지정'} · ${offering.courseName} · ${offering.classroom || '교실 미지정'}${offering.group ? ` · ${offering.group}군` : ''}`,
      students: offering.studentIds
        .map(studentId => rosterById.get(studentId))
        .filter((student): student is StudentRosterEntry => Boolean(student)),
    })).filter(group => group.students.length > 0),
    [date, outputOfferings, rosterById, title],
  )

  useEffect(() => {
    if (!filtered.some(offering => offering.key === offeringKey)) setOfferingKey(filtered[0]?.key ?? '')
  }, [filtered, offeringKey])

  if (!timetable?.students.length) {
    return (
      <div className="card border-dashed border-white/10 py-16 text-center">
        <GraduationCap size={38} className="mx-auto text-slate-600 mb-3" />
        <h2 className="font-semibold text-slate-300">공유된 학생별 시간표가 없습니다</h2>
        <p className="text-xs text-slate-500 mt-2">관리자가 ‘학생별 시간표’ 메뉴에서 2학기 시간표·강좌·수강생 자료를 먼저 업로드해야 합니다.</p>
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-[430px_minmax(0,1fr)] gap-4 items-start">
      <div className="card space-y-4">
        <h2 className="font-bold text-white">이동수업 출석부 설정</h2>
        <div>
          <span className="field-label">출력 기준</span>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/[0.03] p-1">
            {([
              ['single', '한 강좌'],
              ['teacher', '교사별 전체'],
              ['subject', '과목별 전체'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setOutputMode(value)}
                className={clsx('rounded-lg py-2 text-[11px] font-semibold', outputMode === value ? 'bg-emerald-500/18 text-emerald-300' : 'text-slate-500 hover:text-slate-300')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {(outputMode === 'single' || outputMode === 'teacher') && (
          <label className="field-label">담당 교사
            <select className="input-field mt-1" value={teacher} onChange={event => setTeacher(event.target.value)}>
              <option value="">{outputMode === 'teacher' ? '교사를 선택하세요' : '전체 교사'}</option>
              {teachers.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}
        {outputMode === 'single' && (
          <label className="field-label">과목 · 교실
            <select className="input-field mt-1" value={selectedOffering?.key ?? ''} onChange={event => setOfferingKey(event.target.value)}>
              {filtered.map(offering => (
                <option key={offering.key} value={offering.key}>
                  {offering.grade}학년 · {offering.courseName} · {offering.teacher || '교사 미지정'} · {offering.classroom || '교실 미지정'} ({offering.studentIds.length}명)
                </option>
              ))}
            </select>
          </label>
        )}
        {outputMode === 'subject' && (
          <label className="field-label">과목
            <select className="input-field mt-1" value={subject} onChange={event => setSubject(event.target.value)}>
              <option value="">과목을 선택하세요</option>
              {subjects.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}
        <label className="field-label">출석부 제목<input className="input-field mt-1" value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label className="field-label">날짜<input type="date" className="input-field mt-1" value={date} onChange={event => setDate(event.target.value)} /></label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => printAttendanceRosters(outputGroups)}
            disabled={!outputGroups.length || !title.trim()}
            className="btn-primary flex items-center justify-center gap-1.5"
          >
            <Printer size={14} />{outputGroups.length > 1 ? `${outputGroups.length}개 묶음 인쇄` : '출석부 인쇄'}
          </button>
          <button
            onClick={() => downloadAttendanceRosters(
              outputGroups,
              `${outputMode === 'teacher' ? teacher : outputMode === 'subject' ? subject : selectedOffering?.courseName || '수업'}_출석부`,
            )}
            disabled={!outputGroups.length || !title.trim()}
            className="btn-ghost border border-white/10 flex items-center justify-center gap-1.5"
          >
            <Download size={14} />Excel 내려받기
          </button>
        </div>
        {outputGroups.length > 1 && (
          <p className="text-[11px] text-emerald-300">강좌별로 한 페이지씩 총 {outputGroups.length}개 출석부가 연속 출력됩니다.</p>
        )}
        {selectedOffering && selectedStudents.length !== selectedOffering.studentIds.length && (
          <p className="text-[11px] text-amber-300">과목선택 학생 {selectedOffering.studentIds.length}명 중 현재 학생 명렬과 연결된 {selectedStudents.length}명을 출력합니다.</p>
        )}
      </div>
      {outputMode === 'single'
        ? <RosterPreview
            title={selectedOffering ? `${selectedOffering.courseName} · ${selectedOffering.classroom || '교실 미지정'}` : '수업을 선택하세요'}
            detail={selectedOffering ? `${selectedOffering.teacher || '교사 미지정'} · ${selectedStudents.length}명` : ''}
            students={selectedStudents}
          />
        : <BundlePreview groups={outputGroups} emptyText={outputMode === 'teacher' ? '교사를 선택하세요.' : '과목을 선택하세요.'} />}
    </div>
  )
}

function ManageRoster({
  roster,
  adminPassword,
  uploadedBy,
  onChanged,
  onError,
  onSuccess,
}: {
  roster: SharedStudentRoster | null
  adminPassword: string
  uploadedBy: string
  onChanged: () => Promise<void>
  onError: (value: string) => void
  onSuccess: (value: string) => void
}) {
  const [draft, setDraft] = useState<StudentRosterEntry[]>([])
  const [sourceFileName, setSourceFileName] = useState('')
  const [grade, setGrade] = useState('1')
  const [className, setClassName] = useState('1')
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(roster?.students ?? []), [roster])

  const upload = async () => {
    const [filePath] = await window.electron.openFilesDialog([{ name: 'Excel 파일', extensions: ['xlsx', 'xlsm', 'xls'] }])
    if (!filePath) return
    try {
      const students = parseStudentRosterWorkbook(await window.electron.readFile(filePath))
      const counts = [1, 2, 3].map(value => students.filter(student => student.grade === String(value)).length)
      setDraft(students)
      setSourceFileName(filePath.split(/[\\/]/).pop() ?? '')
      onSuccess(`학생 ${students.length}명을 읽었습니다. (1학년 ${counts[0]}명 · 2학년 ${counts[1]}명 · 3학년 ${counts[2]}명)`)
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : String(uploadError))
    }
  }

  const save = async () => {
    if (!draft.length) return
    setSaving(true)
    onError('')
    try {
      const result = await replaceSharedStudentRoster(
        draft,
        adminPassword,
        uploadedBy,
        sourceFileName || roster?.sourceFileName || '',
      )
      onSuccess(`학생 명렬 ${result.version}차 저장을 완료했습니다.`)
      await onChanged()
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const filtered = draft.filter(student => student.grade === grade && student.className === className)
  const update = (studentId: string, patch: Partial<StudentRosterEntry>) =>
    setDraft(current => current.map(student => student.studentId === studentId ? { ...student, ...patch } : student))

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-white">공유 학생 명렬 {roster ? `${roster.version}차` : ''}</h2>
          <p className="text-[11px] text-slate-500 mt-1">{draft.length}명 · 원본 파일은 서버에 저장하지 않고 조회용 명렬만 저장합니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={upload} className="btn-ghost flex items-center gap-1.5"><Upload size={13} />전체 명렬 Excel 불러오기</button>
          <button onClick={save} disabled={!draft.length || saving} className="btn-primary flex items-center gap-1.5"><Save size={13} />{saving ? '저장 중...' : '공유 명렬 저장'}</button>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <div className="p-3 border-b border-white/5 flex gap-2">
          <select className="input-field w-28" value={grade} onChange={event => setGrade(event.target.value)}>
            <option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option>
          </select>
          <select className="input-field w-28" value={className} onChange={event => setClassName(event.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map(value => <option key={value} value={value}>{value}반</option>)}
          </select>
          <span className="self-center text-xs text-slate-500">{filtered.length}명</span>
        </div>
        <div className="grid grid-cols-[90px_120px_80px_140px_140px_42px] gap-2 px-4 py-2 bg-white/5 text-[10px] font-semibold text-slate-500">
          <span>학번</span><span>성명</span><span>성별</span><span>담임</span><span>부담임</span><span></span>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {filtered.map(student => (
            <div key={student.studentId} className="grid grid-cols-[90px_120px_80px_140px_140px_42px] gap-2 items-center px-4 py-2 border-t border-white/5">
              <input className="input-field py-1.5 text-xs" value={student.studentId} onChange={event => update(student.studentId, {
                studentId: event.target.value,
                number: String(Number(event.target.value.length === 4 ? event.target.value.slice(2) : event.target.value.slice(3))),
              })} />
              <input className="input-field py-1.5 text-xs" value={student.name} onChange={event => update(student.studentId, { name: event.target.value })} />
              <input className="input-field py-1.5 text-xs" value={student.gender} onChange={event => update(student.studentId, { gender: event.target.value })} />
              <input className="input-field py-1.5 text-xs" value={student.homeroomTeacher} onChange={event => update(student.studentId, { homeroomTeacher: event.target.value })} />
              <input className="input-field py-1.5 text-xs" value={student.assistantTeacher} onChange={event => update(student.studentId, { assistantTeacher: event.target.value })} />
              <button onClick={() => setDraft(current => current.filter(item => item.studentId !== student.studentId))} className="btn-ghost p-2 text-rose-400"><Trash2 size={13} /></button>
            </div>
          ))}
          {!filtered.length && <p className="py-12 text-center text-sm text-slate-500">이 학급에 등록된 학생이 없습니다.</p>}
        </div>
        <div className="border-t border-white/5 p-3">
          <button
            onClick={() => {
              const number = String(Math.max(0, ...filtered.map(student => Number(student.number) || 0)) + 1)
              const studentId = `${grade}${className}${String(number).padStart(2, '0')}`
              setDraft(current => [...current, { studentId, name: '', gender: '', remark: '', grade, className, number, homeroomTeacher: filtered[0]?.homeroomTeacher ?? '', assistantTeacher: filtered[0]?.assistantTeacher ?? '' }])
            }}
            className="btn-ghost flex items-center gap-1.5"
          >
            <Plus size={13} />학생 추가
          </button>
        </div>
      </div>
    </div>
  )
}

function RosterPreview({ title, detail, students }: { title: string; detail: string; students: StudentRosterEntry[] }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="p-4 border-b border-white/5">
        <h2 className="font-bold text-white">{title}</h2>
        <p className="text-[11px] text-slate-500 mt-1">{detail}</p>
      </div>
      <div className="grid grid-cols-[55px_100px_130px_80px] px-4 py-2 bg-white/5 text-[10px] font-semibold text-slate-500">
        <span>순번</span><span>학번</span><span>성명</span><span>성별</span>
      </div>
      <div className="max-h-[590px] overflow-y-auto">
        {students.map((student, index) => (
          <div key={student.studentId} className="grid grid-cols-[55px_100px_130px_80px] px-4 py-2 border-t border-white/5 text-xs">
            <span className="text-slate-600">{index + 1}</span><span className="text-slate-500">{student.studentId}</span>
            <span className="font-semibold text-slate-200">{student.name}</span><span className="text-slate-500">{student.gender}</span>
          </div>
        ))}
        {!students.length && <p className="py-14 text-center text-sm text-slate-500">표시할 학생이 없습니다.</p>}
      </div>
    </div>
  )
}

function BundlePreview({ groups, emptyText }: { groups: AttendanceRosterPrintGroup[]; emptyText: string }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="p-4 border-b border-white/5">
        <h2 className="font-bold text-white">묶음 출력 목록</h2>
        <p className="text-[11px] text-slate-500 mt-1">{groups.length ? `${groups.length}개 출석부 · 총 ${groups.reduce((sum, group) => sum + group.students.length, 0)}명(중복 포함)` : emptyText}</p>
      </div>
      <div className="max-h-[590px] overflow-y-auto p-3 space-y-2">
        {groups.map((group, index) => (
          <div key={`${group.subtitle}-${index}`} className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-200">{index + 1}. {group.subtitle}</p>
              <p className="text-[10px] text-slate-500 mt-1">{group.students.slice(0, 8).map(student => student.name).join(', ')}{group.students.length > 8 ? ' 외' : ''}</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2.5 py-1 text-[10px] whitespace-nowrap">{group.students.length}명</span>
          </div>
        ))}
        {!groups.length && <p className="py-14 text-center text-sm text-slate-500">{emptyText}</p>}
      </div>
    </div>
  )
}

function buildCourseRosters(timetable: SharedStudentTimetable | null): CourseRoster[] {
  if (!timetable) return []
  const map = new Map<string, CourseRoster>()
  for (const personal of timetable.students) {
    for (const selection of personal.selections) {
      const key = [selection.grade, selection.group, selection.courseName, selection.teacher, selection.classroom].join('|')
      const current = map.get(key) ?? {
        key,
        grade: selection.grade,
        group: selection.group,
        courseName: selection.courseName,
        teacher: selection.teacher,
        classroom: selection.classroom,
        studentIds: [],
      }
      const studentKey = studentLookupKey(personal.student)
      if (!current.studentIds.includes(studentKey)) current.studentIds.push(studentKey)
      map.set(key, current)
    }
  }
  return [...map.values()].sort((a, b) =>
    a.grade.localeCompare(b.grade) ||
    a.teacher.localeCompare(b.teacher, 'ko') ||
    a.courseName.localeCompare(b.courseName, 'ko') ||
    a.classroom.localeCompare(b.classroom, 'ko'),
  )
}

function Notice({ tone, text }: { tone: 'error' | 'success'; text: string }) {
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2
  return (
    <div className={clsx('rounded-xl border px-4 py-3 text-xs flex items-center gap-2', tone === 'error' ? 'border-rose-500/25 bg-rose-500/10 text-rose-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300')}>
      <Icon size={15} />{text}
    </div>
  )
}
