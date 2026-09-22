import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { KeyRound, ShieldCheck, X } from 'lucide-react'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'
import LogPanel from './LogPanel'
import WorkAssistantSearch from './WorkAssistantSearch'
import Dashboard from '../pages/Dashboard'
import { useAppStore } from '../stores/appStore'
import { useAdminStore } from '../stores/adminStore'
import { executiveRoleForName, useAuthStore } from '../stores/authStore'

const NeisPage = lazy(() => import('../pages/NeisPage'))
const CalendarPage = lazy(() => import('../pages/CalendarPage'))
const SettingsPage = lazy(() => import('../pages/UngcheonSettingsPage'))
const HelpPage = lazy(() => import('../pages/UngcheonHelpPage'))
const SchoolHubPage = lazy(() => import('../pages/SchoolHubPage'))
const FeatureRequestsPage = lazy(() => import('../pages/FeatureRequestsPage'))
const TimetableSwapPage = lazy(() => import('../pages/TimetableSwapPage'))
const StudentTimetablePage = lazy(() => import('../pages/StudentTimetablePage'))
const ExcelProcessorPage = lazy(() => import('../pages/ExcelProcessorPage'))
const RecommendedSubjectsPage = lazy(() => import('../pages/RecommendedSubjectsPage'))
const PayrollPage = lazy(() => import('../pages/PayrollPage'))
const AfterSchoolCheckerPage = lazy(() => import('../pages/AfterSchoolCheckerPage'))
const InsaAnalysisPage = lazy(() => import('../pages/InsaAnalysisPage'))
const CurriculumPage = lazy(() => import('../pages/CurriculumPage'))
const PhotoLedgerPage = lazy(() => import('../pages/PhotoLedgerPage'))
const StudentRecordPage = lazy(() => import('../pages/StudentRecordPage'))
const AttendancePage = lazy(() => import('../pages/AttendancePage'))
const SchoolCommitteesPage = lazy(() => import('../pages/SchoolCommitteesPage'))
const PdfExtractorPage = lazy(() => import('../pages/PdfExtractorPage'))
const FileParserPage = lazy(() => import('../pages/FileParserPage'))
const NotifierPage = lazy(() => import('../pages/NotifierPage'))
const OperationsNotificationsPage = lazy(() => import('../features/futureOperations/OperationsNotificationsPage'))
const StaffTasksPage = lazy(() => import('../pages/StaffTasksPage'))
const StaffRosterPage = lazy(() =>
  import('../pages/StaffTasksPage').then(module => ({ default: module.StaffRosterPage })),
)
const AttendancePrintPage = lazy(() => import('../pages/AttendancePrintPage'))
const GradePreviewPage = lazy(() => import('../pages/GradePreviewPage'))
const EstimatedSplitScorePage = lazy(() => import('../pages/EstimatedSplitScorePage'))
const FormCenterPage = lazy(() => import('../pages/FormCenterPage'))
const TeacherToolsPage = lazy(() => import('../pages/TeacherToolsPage'))
const TeacherTransferScorePage = lazy(() => import('../pages/TeacherTransferScorePage'))
const StudentLocatorPage = lazy(() => import('../pages/StudentLocatorPage'))
const SchoolInfoEvaluationPage = lazy(() => import('../pages/SchoolInfoEvaluationPage'))
const StudentIdentityAuditPage = lazy(() => import('../pages/StudentIdentityAuditPage'))
const SubjectRemarksPrintPage = lazy(() => import('../pages/SubjectRemarksPrintPage'))
const AdminCenterPage = lazy(() => import('../pages/AdminCenterPage'))
const VolunteerWorkPage = lazy(() => import('../pages/VolunteerWorkPage'))
const RecordPrivacyBlindPage = lazy(() => import('../pages/RecordPrivacyBlindPage'))
const AuditEvidenceCenterPage = lazy(() => import('../pages/AuditEvidenceCenterPage'))
const ExecutiveCurrentClassesPage = lazy(() => import('../pages/ExecutiveSchedulePage'))
const ExecutiveTeacherSchedulePage = lazy(() => import('../pages/ExecutiveSchedulePage').then(module => ({ default: module.ExecutiveTeacherSchedulePage })))
// 시험 기능은 번들에 포함해 검증하되 사이드바·검색 메뉴에는 노출하지 않습니다.
const FutureOperationsPage = lazy(() => import('../features/futureOperations/FutureOperationsPage'))

const PAGES: Record<string, React.ComponentType> = {
  neis: NeisPage,
  calendar: CalendarPage,
  settings: SettingsPage,
  help: HelpPage,
  school_hub: SchoolHubPage,
  feature_requests: FeatureRequestsPage,
  timetable_swap: TimetableSwapPage,
  student_timetable: StudentTimetablePage,
  excel_processor: ExcelProcessorPage,
  recommended_subjects: RecommendedSubjectsPage,
  payroll: PayrollPage,
  afterschool_checker: AfterSchoolCheckerPage,
  insa_analysis: InsaAnalysisPage,
  curriculum: CurriculumPage,
  photo_ledger: PhotoLedgerPage,
  student_record: StudentRecordPage,
  attendance: AttendancePage,
  committees: SchoolCommitteesPage,
  pdf_extractor: PdfExtractorPage,
  file_parser: FileParserPage,
  notifier: NotifierPage,
  operations_notifications: OperationsNotificationsPage,
  staff_tasks: StaffTasksPage,
  staff_roster: StaffRosterPage,
  attendance_print: AttendancePrintPage,
  grade_preview: GradePreviewPage,
  estimated_split_score: EstimatedSplitScorePage,
  form_center: FormCenterPage,
  teacher_tools: TeacherToolsPage,
  transfer_score: TeacherTransferScorePage,
  student_locator: StudentLocatorPage,
  schoolinfo_evaluation: SchoolInfoEvaluationPage,
  student_identity_audit: StudentIdentityAuditPage,
  subject_remarks_print: SubjectRemarksPrintPage,
  admin_center: AdminCenterPage,
  volunteer_work: VolunteerWorkPage,
  record_privacy_blind: RecordPrivacyBlindPage,
  audit_evidence: AuditEvidenceCenterPage,
  executive_live_classes: ExecutiveCurrentClassesPage,
  executive_teacher_schedule: ExecutiveTeacherSchedulePage,
  future_operations: FutureOperationsPage,
}

const MAX_HISTORY = 40
const INITIAL_PAGE = 'dashboard'

export default function Layout() {
  // 앱을 새로 실행하거나 로그인 세션이 시작될 때는 이전 화면과 관계없이 대시보드에서 시작한다.
  const [history, setHistory] = useState([INITIAL_PAGE])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [logOpen, setLogOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [requestedExecutivePage, setRequestedExecutivePage] = useState('')
  const [executivePassword, setExecutivePassword] = useState('')
  const page = history[historyIndex]
  const logs = useAppStore(state => state.logs)
  const isAdmin = useAdminStore(state => state.isAdmin)
  const executiveRole = useAuthStore(state => state.executiveRole)
  const teacherName = useAuthStore(state => state.teacherName)
  const unlockExecutive = useAuthStore(state => state.unlockExecutive)
  const authLoading = useAuthStore(state => state.loading)
  const authError = useAuthStore(state => state.error)
  const executiveIdentityRole = executiveRoleForName(teacherName)
  const logErrorCount = logs.filter(log => log.level === 'error').length
  const Page = PAGES[page]

  const navigate = (id: string) => {
    if (id === 'admin_center' && !isAdmin) return
    if (id.startsWith('executive_') && !executiveIdentityRole) return
    if (id.startsWith('executive_') && !executiveRole) {
      useAuthStore.setState({ error: '' })
      setRequestedExecutivePage(id)
      setExecutivePassword('')
      return
    }
    if (id === page) return
    const next = [...history.slice(0, historyIndex + 1), id].slice(-MAX_HISTORY)
    setHistory(next)
    setHistoryIndex(next.length - 1)
  }

  const submitExecutiveUnlock = async (event: FormEvent) => {
    event.preventDefault()
    const target = requestedExecutivePage
    if (!target || !await unlockExecutive(executivePassword)) return
    setRequestedExecutivePage('')
    setExecutivePassword('')
    const next = [...history.slice(0, historyIndex + 1), target].slice(-MAX_HISTORY)
    setHistory(next)
    setHistoryIndex(next.length - 1)
  }

  const closeExecutiveUnlock = () => {
    useAuthStore.setState({ error: '' })
    setRequestedExecutivePage('')
    setExecutivePassword('')
  }

  useEffect(() => {
    if (!isAdmin && page === 'admin_center') {
      setHistory([INITIAL_PAGE])
      setHistoryIndex(0)
    }
  }, [isAdmin, page])

  useEffect(() => {
    if (!executiveRole && page.startsWith('executive_')) {
      setHistory([INITIAL_PAGE])
      setHistoryIndex(0)
    }
  }, [executiveRole, page])

  useEffect(() => {
    const openAssistant = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setAssistantOpen(true)
      }
    }
    window.addEventListener('keydown', openAssistant)
    return () => window.removeEventListener('keydown', openAssistant)
  }, [])

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const pageId = (event as CustomEvent<string>).detail
      if (pageId) navigate(pageId)
    }
    window.addEventListener('app:navigate', handleNavigate)
    return () => window.removeEventListener('app:navigate', handleNavigate)
  })

  useEffect(() => window.electron?.onNavigateRequest(pageId => {
    if (pageId) window.dispatchEvent(new CustomEvent('app:navigate', { detail: pageId }))
  }), [])

  return (
    <div className="app-shell h-screen bg-surface-900 flex flex-col overflow-hidden">
      <TitleBar
        currentPage={page}
        onNavigate={navigate}
        onGoBack={() => historyIndex > 0 && setHistoryIndex(index => index - 1)}
        canGoBack={historyIndex > 0}
        onOpenLog={() => setLogOpen(open => !open)}
        onOpenAssistant={() => setAssistantOpen(true)}
        logErrorCount={logErrorCount}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          currentPage={page}
          onNavigate={navigate}
          onOpenLog={() => setLogOpen(open => !open)}
          logErrorCount={logErrorCount}
        />
        <main className="app-main-surface flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.13 }}
              className="absolute inset-0 overflow-y-auto"
            >
              <Suspense fallback={<div className="h-full grid place-items-center text-sm text-slate-500">불러오는 중...</div>}>
                {page === 'dashboard' ? <Dashboard onNavigate={navigate} /> : Page ? <Page /> : <Dashboard onNavigate={navigate} />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
      <WorkAssistantSearch open={assistantOpen} onClose={() => setAssistantOpen(false)} onNavigate={navigate} />
      {requestedExecutivePage && <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-5" role="presentation" onMouseDown={closeExecutiveUnlock}>
        <form onSubmit={submitExecutiveUnlock} onMouseDown={event => event.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-emerald-200 bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="executive-unlock-title">
          <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><ShieldCheck size={21} /></span><div><p className="text-[11px] font-black text-emerald-700">보호 메뉴 추가 인증</p><h2 id="executive-unlock-title" className="text-lg font-black text-slate-950">{executiveIdentityRole === 'principal' ? '교장메뉴' : '교감메뉴'} 열기</h2></div></div><button type="button" aria-label="닫기" onClick={closeExecutiveUnlock} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
          <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">일반 로그인은 유지됩니다. 보호 메뉴를 사용하는 현재 프로그램 창에서만 추가 비밀번호를 확인합니다.</p>
          <label className="mt-5 block"><span className="field-label flex items-center gap-1.5"><KeyRound size={13} />추가 비밀번호</span><input autoFocus type="password" autoComplete="current-password" value={executivePassword} onChange={event => setExecutivePassword(event.target.value)} className="input-field mt-1.5 w-full" placeholder="추가 비밀번호" maxLength={30} /></label>
          {authError && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800" role="alert">{authError}</p>}
          <button type="submit" disabled={authLoading || !executivePassword} className="btn-primary mt-5 w-full justify-center disabled:opacity-50">{authLoading ? '확인 중…' : '보호 메뉴 열기'}</button>
        </form>
      </div>}
    </div>
  )
}
