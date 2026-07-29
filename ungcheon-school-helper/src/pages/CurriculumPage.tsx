import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Printer,
  RotateCcw,
  Search,
  UserRound,
} from 'lucide-react'
import clsx from 'clsx'
import curriculumData from '../data/curriculumChoices.json'
import { RECOMMENDED_SUBJECTS } from '../data/recommendedSubjects'
import { GENERIC_SUBJECTS, parseSubjects } from '../utils/subjects'

type PdfId = 'all' | 'grade1' | 'grade2' | 'grade3'
type ChoiceId = 'choice1' | 'choice2'
type PageTab = PdfId | ChoiceId
type CohortId = 'grade1' | 'grade2'

interface CurriculumCourse {
  id: string
  group: string
  subject: string
  type: string
  name: string
  credit: number
  semesters: string[]
}

interface CurriculumGroup {
  code: string
  semesters: string[]
  required: number
  requiredBySemester: Record<string, number>
  courseCount: number
}

interface CurriculumCohort {
  label: string
  description: string
  groups: CurriculumGroup[]
  courses: CurriculumCourse[]
}

interface Selection {
  key: string
  course: CurriculumCourse
  semester: string
}

const PDF_TABS: { id: PdfId; label: string; fileName: string; description: string }[] = [
  {
    id: 'all',
    label: '전학년',
    fileName: '2026학년도_웅천고_전학년_교육과정편성표.pdf',
    description: '2026학년도 당해연도 전 학년 교육과정 편성표',
  },
  {
    id: 'grade1',
    label: '1학년',
    fileName: '2026학년도_웅천고_1학년_교육과정편성표.pdf',
    description: '2026학년도 입학생 3개년 교육과정 편성표',
  },
  {
    id: 'grade2',
    label: '2학년',
    fileName: '2026학년도_웅천고_2학년_교육과정편성표.pdf',
    description: '2025학년도 입학생 3개년 교육과정 편성표',
  },
  {
    id: 'grade3',
    label: '3학년',
    fileName: '2026학년도_웅천고_3학년_교육과정편성표.pdf',
    description: '2024학년도 입학생 3개년 교육과정 편성표',
  },
]

const CHOICE_TABS: { id: ChoiceId; label: string; cohort: CohortId }[] = [
  { id: 'choice1', label: '과목선택 도우미 - 1학년', cohort: 'grade1' },
  { id: 'choice2', label: '과목선택 도우미 - 2학년', cohort: 'grade2' },
]

const GROUP_COLORS: Record<string, string> = {
  A: 'border-sky-300/25 bg-sky-500/5',
  B: 'border-violet-300/25 bg-violet-500/5',
  C: 'border-emerald-300/25 bg-emerald-500/5',
  D: 'border-orange-300/25 bg-orange-500/5',
  E: 'border-yellow-300/25 bg-yellow-500/5',
  F: 'border-rose-300/25 bg-rose-500/5',
  G: 'border-teal-300/25 bg-teal-500/5',
  H: 'border-cyan-300/25 bg-cyan-500/5',
  I: 'border-fuchsia-300/25 bg-fuchsia-500/5',
  J: 'border-purple-300/25 bg-purple-500/5',
  K: 'border-slate-300/25 bg-slate-500/5',
}

export default function CurriculumPage() {
  const [tab, setTab] = useState<PageTab>('all')
  const [pdfUrl, setPdfUrl] = useState('')
  const [toast, setToast] = useState('')
  const pdf = PDF_TABS.find(item => item.id === tab)
  const choice = CHOICE_TABS.find(item => item.id === tab)

  useEffect(() => {
    let cancelled = false
    if (!pdf) {
      setPdfUrl('')
      return
    }
    window.electron.curriculumGetPdfUrl(pdf.id)
      .then(url => { if (!cancelled) setPdfUrl(url) })
      .catch(error => {
        if (!cancelled) showToast(error instanceof Error ? error.message : 'PDF를 불러오지 못했습니다.')
      })
    return () => { cancelled = true }
  }, [pdf?.id])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  const savePdf = async () => {
    if (!pdf) return
    const saved = await window.electron.curriculumSavePdf(pdf.id, pdf.fileName)
    if (saved) showToast('PDF를 저장했습니다.')
  }

  return (
    <div className="h-full flex flex-col p-5 max-w-[1500px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText size={21} className="text-sky-400" />
            <h1 className="page-title">교육과정 편제표 출력</h1>
          </div>
          <p className="page-subtitle mt-1">
            2026학년도 웅천고 편제표를 학년별로 확인·출력하고 학생 과목선택 상담을 진행합니다.
          </p>
        </div>
        {pdf && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => window.electron.curriculumOpenPdf(pdf.id)} className="btn-ghost flex items-center gap-1.5 text-sm">
              <ExternalLink size={14} /> 크게 열기
            </button>
            <button onClick={savePdf} className="btn-primary flex items-center gap-1.5 text-sm">
              <Download size={14} /> PDF 저장
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 mb-4 flex-shrink-0">
        {PDF_TABS.map(item => (
          <TabButton key={item.id} active={tab === item.id} onClick={() => setTab(item.id)}>
            <FileText size={13} /> {item.label}
          </TabButton>
        ))}
        <span className="w-px h-5 bg-white/10 mx-1 flex-shrink-0" />
        {CHOICE_TABS.map(item => (
          <TabButton key={item.id} active={tab === item.id} onClick={() => setTab(item.id)}>
            <GraduationCap size={13} /> {item.label}
          </TabButton>
        ))}
      </div>

      {pdf && (
        <section className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 rounded-t-xl border border-b-0 border-white/10 bg-white/[0.035]">
            <div>
              <p className="text-sm font-semibold text-slate-100">{pdf.description}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">원본 Excel의 인쇄 설정과 서식을 그대로 반영한 PDF입니다.</p>
            </div>
            <button onClick={() => window.electron.curriculumOpenPdf(pdf.id)} className="text-xs text-sky-300 hover:text-sky-200 flex items-center gap-1">
              <Printer size={13} /> 인쇄
            </button>
          </div>
          <div className="flex-1 min-h-[520px] rounded-b-xl overflow-hidden border border-white/10 bg-slate-200">
            {pdfUrl ? (
              <iframe key={pdfUrl} src={`${pdfUrl}#view=FitH&toolbar=1`} title={pdf.description} className="w-full h-full border-0" />
            ) : (
              <div className="h-full grid place-items-center text-sm text-slate-500">편제표를 불러오는 중...</div>
            )}
          </div>
        </section>
      )}

      {choice && (
        <SubjectChoiceCounselor
          key={choice.cohort}
          cohortId={choice.cohort}
          cohort={curriculumData.cohorts[choice.cohort] as CurriculumCohort}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-slate-950 border border-white/10 px-4 py-2.5 text-sm text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors',
        active
          ? 'border-sky-400 text-sky-200 bg-sky-500/5'
          : 'border-transparent text-slate-500 hover:text-slate-200',
      )}
    >
      {children}
    </button>
  )
}

function SubjectChoiceCounselor({ cohortId, cohort }: {
  cohortId: CohortId
  cohort: CurriculumCohort
}) {
  const [selected, setSelected] = useState<Record<string, Selection>>({})
  const [studentName, setStudentName] = useState('')
  const [majorQuery, setMajorQuery] = useState('')
  const [message, setMessage] = useState('')

  const visibleGroups = useMemo(() => (
    cohortId === 'grade2'
      ? cohort.groups.filter(group => group.semesters.some(semester => semester.startsWith('3-')))
      : cohort.groups
  ), [cohort, cohortId])

  const visibleCodes = useMemo(() => new Set(visibleGroups.map(group => group.code)), [visibleGroups])
  const visibleCourses = useMemo(
    () => cohort.courses.filter(course => visibleCodes.has(course.group)),
    [cohort.courses, visibleCodes],
  )

  const selections = Object.values(selected)
  const selectedNames = useMemo(() => new Set(selections.map(item => item.course.name)), [selected])
  const selectedAreas = useMemo(() => new Set(selections.map(item => item.course.subject)), [selected])

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of selections) counts[item.course.group] = (counts[item.course.group] ?? 0) + 1
    return counts
  }, [selected])

  const completedGroups = visibleGroups.filter(group => (groupCounts[group.code] ?? 0) === group.required).length
  const languageMathEnglishCount = selections.filter(item => ['국어', '수학', '영어'].includes(item.course.subject)).length
  const allComplete = completedGroups === visibleGroups.length

  const counselingRows = useMemo(() => {
    const query = majorQuery.trim().toLowerCase().replace(/\s+/g, '')
    if (!query) return []
    return RECOMMENDED_SUBJECTS
      .filter(row => `${row.univ}${row.college}${row.dept ?? ''}`.toLowerCase().replace(/\s+/g, '').includes(query))
      .map(row => {
        const core = parseSubjects(row.core)
        const recommend = parseSubjects(row.recommend)
        const met = (subject: string) => (
          selectedNames.has(subject)
          || (GENERIC_SUBJECTS.has(subject) && selectedAreas.has(subject))
          || [...selectedNames].some(name => name.includes(subject) || subject.includes(name))
        )
        return {
          row,
          missingCore: core.filter(subject => !met(subject)),
          matchedCore: core.filter(met),
          matchedRecommend: recommend.filter(met),
        }
      })
      .sort((a, b) => a.missingCore.length - b.missingCore.length)
      .slice(0, 12)
  }, [majorQuery, selectedNames, selectedAreas])

  const toggle = (course: CurriculumCourse, semester: string) => {
    const key = `${course.id}@${semester}`
    if (selected[key]) {
      setSelected(state => {
        const next = { ...state }
        delete next[key]
        return next
      })
      setMessage('')
      return
    }

    const group = visibleGroups.find(item => item.code === course.group)
    if (!group) return
    const groupSelections = selections.filter(item => item.course.group === group.code)
    if (groupSelections.length >= group.required) {
      setMessage(`선택군 ${group.code}는 ${group.required}개까지만 선택할 수 있습니다.`)
      return
    }
    if (group.requiredBySemester[semester]) {
      const semesterCount = groupSelections.filter(item => item.semester === semester).length
      if (semesterCount >= group.requiredBySemester[semester]) {
        setMessage(`선택군 ${group.code}의 ${semester}학기는 ${group.requiredBySemester[semester]}개만 선택합니다.`)
        return
      }
      if (groupSelections.some(item => item.course.name === course.name)) {
        setMessage(`선택군 ${group.code}에서는 같은 과목을 두 학기에 중복 선택할 수 없습니다.`)
        return
      }
    }
    setSelected(state => ({ ...state, [key]: { key, course, semester } }))
    setMessage('')
  }

  return (
    <section className="flex-1 min-h-0 overflow-y-auto pr-1">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="space-y-4">
          <div className="card !p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <GraduationCap size={18} className="text-sky-400" />
                  <h2 className="text-base font-bold text-white">{cohort.label} 과목선택 도우미</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">{cohort.description}</p>
              </div>
              <button
                onClick={() => { setSelected({}); setMessage('') }}
                className="btn-ghost flex items-center gap-1.5 text-xs"
              >
                <RotateCcw size={12} /> 선택 초기화
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              <SummaryCard label="선택군 완료" value={`${completedGroups}/${visibleGroups.length}`} />
              <SummaryCard label="선택 과목" value={`${selections.length}개`} />
              <SummaryCard label="국어·수학·영어" value={`${languageMathEnglishCount}/5개`} warning={languageMathEnglishCount > 5} />
              <SummaryCard label="전체 상태" value={allComplete ? '선택 완료' : '선택 중'} good={allComplete} />
            </div>
            {message && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
                <AlertTriangle size={13} /> {message}
              </div>
            )}
          </div>

          {visibleGroups.map(group => {
            const courses = visibleCourses.filter(course => course.group === group.code)
            const count = groupCounts[group.code] ?? 0
            return (
              <div key={group.code} className={clsx('rounded-xl border p-4', GROUP_COLORS[group.code] ?? GROUP_COLORS.K)}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">선택군 {group.code}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {group.semesters.map(semester => `${semester}학기`).join(' · ')}
                      {Object.keys(group.requiredBySemester).length > 0 && ' · 학기별 1개, 중복 불가'}
                    </p>
                  </div>
                  <span className={clsx(
                    'text-xs font-bold rounded-full px-2.5 py-1 border',
                    count === group.required
                      ? 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10'
                      : 'text-slate-300 border-white/10 bg-black/10',
                  )}>
                    {count}/{group.required}개
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2">
                  {courses.map(course => (
                    <div key={course.id} className="rounded-lg border border-white/10 bg-slate-950/45 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{course.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{course.subject} · {course.type || '선택'} · {course.credit}학점</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {course.semesters.map(semester => {
                          const key = `${course.id}@${semester}`
                          const active = Boolean(selected[key])
                          return (
                            <button
                              key={semester}
                              onClick={() => toggle(course, semester)}
                              aria-label={`${course.name} ${semester} 선택`}
                              className={clsx(
                                'text-[11px] font-semibold rounded-md px-2 py-1 border transition-colors',
                                active
                                  ? 'bg-sky-500/25 text-sky-100 border-sky-300/40'
                                  : 'bg-white/[0.035] text-slate-400 border-white/10 hover:text-white hover:border-white/25',
                              )}
                            >
                              {active && '✓ '}{semester}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <aside className="space-y-4">
          <div className="card !p-4 sticky top-0">
            <div className="flex items-center gap-2 mb-3">
              <UserRound size={16} className="text-violet-400" />
              <h3 className="text-sm font-bold text-white">학생 상담</h3>
            </div>
            <label className="field-label">학생 이름</label>
            <input
              value={studentName}
              onChange={event => setStudentName(event.target.value)}
              placeholder="학생 이름"
              className="input mb-3"
            />
            <label className="field-label">희망 대학·학과 검색</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={majorQuery}
                onChange={event => setMajorQuery(event.target.value)}
                placeholder="예: 컴퓨터공학, 간호, 수학교육"
                className="input !pl-9"
              />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-300">선택 결과</p>
                <span className="text-[10px] text-slate-600">{studentName || '학생 미입력'}</span>
              </div>
              {selections.length === 0 ? (
                <p className="text-xs text-slate-600 mt-2">왼쪽 선택군에서 과목을 선택하세요.</p>
              ) : (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {selections
                    .sort((a, b) => a.semester.localeCompare(b.semester) || a.course.group.localeCompare(b.course.group))
                    .map(item => (
                      <div key={item.key} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.035] px-2.5 py-1.5">
                        <span className="text-xs text-slate-200 truncate">{item.course.name}</span>
                        <span className="text-[10px] text-slate-500 flex-shrink-0">{item.semester} · {item.course.group}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen size={14} className="text-emerald-400" />
                <p className="text-xs font-semibold text-slate-300">대학 권장과목 비교</p>
              </div>
              {!majorQuery.trim() ? (
                <p className="text-xs text-slate-600">희망 학과를 입력하면 대학별 핵심·권장과목과 현재 선택을 비교합니다.</p>
              ) : counselingRows.length === 0 ? (
                <p className="text-xs text-amber-300">검색되는 모집단위가 없습니다. 학과명을 짧게 입력해 보세요.</p>
              ) : (
                <div className="space-y-2 max-h-[430px] overflow-y-auto pr-1">
                  {counselingRows.map(({ row, missingCore, matchedCore }) => (
                    <div key={`${row.univ}-${row.college}-${row.dept}`} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                      <p className="text-xs font-semibold text-white">{row.univ} · {row.dept ?? row.college}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{row.dept ? row.college : row.area}</p>
                      <div className="mt-2 flex items-start gap-1.5">
                        {missingCore.length === 0 ? (
                          <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertTriangle size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                        )}
                        <p className={clsx('text-[11px] leading-relaxed', missingCore.length ? 'text-amber-200' : 'text-emerald-200')}>
                          {missingCore.length
                            ? `추가 검토: ${missingCore.join(', ')}`
                            : matchedCore.length
                              ? `핵심과목 반영: ${matchedCore.join(', ')}`
                              : '구체 과목 지정 없이 진로 적성에 따른 선택 권장'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => window.print()}
              className="btn-secondary w-full mt-4 flex items-center justify-center gap-1.5 text-xs"
            >
              <Printer size={13} /> 선택 결과 인쇄
            </button>
          </div>
        </aside>
      </div>
    </section>
  )
}

function SummaryCard({ label, value, good, warning }: {
  label: string
  value: string
  good?: boolean
  warning?: boolean
}) {
  return (
    <div className={clsx(
      'rounded-lg border px-3 py-2.5',
      good
        ? 'border-emerald-400/20 bg-emerald-500/10'
        : warning
          ? 'border-amber-400/20 bg-amber-500/10'
          : 'border-white/10 bg-white/[0.025]',
    )}>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={clsx('text-lg font-bold mt-0.5', good ? 'text-emerald-300' : warning ? 'text-amber-300' : 'text-white')}>{value}</p>
    </div>
  )
}
