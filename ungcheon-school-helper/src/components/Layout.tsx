import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'
import LogPanel from './LogPanel'
import WorkAssistantSearch from './WorkAssistantSearch'
import Dashboard from '../pages/Dashboard'
import { useAppStore } from '../stores/appStore'
import { useAdminStore } from '../stores/adminStore'

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
}

const MAX_HISTORY = 40
const INITIAL_PAGE = 'dashboard'

export default function Layout() {
  // 앱을 새로 실행하거나 로그인 세션이 시작될 때는 이전 화면과 관계없이 대시보드에서 시작한다.
  const [history, setHistory] = useState([INITIAL_PAGE])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [logOpen, setLogOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const page = history[historyIndex]
  const logs = useAppStore(state => state.logs)
  const isAdmin = useAdminStore(state => state.isAdmin)
  const logErrorCount = logs.filter(log => log.level === 'error').length
  const Page = PAGES[page]

  const navigate = (id: string) => {
    if (id === 'admin_center' && !isAdmin) return
    if (id === page) return
    const next = [...history.slice(0, historyIndex + 1), id].slice(-MAX_HISTORY)
    setHistory(next)
    setHistoryIndex(next.length - 1)
  }

  useEffect(() => {
    if (!isAdmin && page === 'admin_center') {
      setHistory([INITIAL_PAGE])
      setHistoryIndex(0)
    }
  }, [isAdmin, page])

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
    </div>
  )
}
