import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight, Bell, BookOpen, Calculator, CalendarDays, CalendarRange,
  Check, ClipboardCheck, FileCode2, FileDown, FileScan, FilePenLine, FileText,
  GripVertical, HelpCircle, Landmark, LayoutDashboard, Link2, ListRestart, Pin, PinOff, EyeOff,
  Building2, HeartHandshake, MapPinned, MessageSquareText, ScanSearch, ScrollText, SearchCheck, Settings, ShieldCheck, Table2, UsersRound, Wrench,
  type LucideIcon,
} from 'lucide-react'
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { useAppStore } from '../stores/appStore'
import { useAdminStore } from '../stores/adminStore'
import schoolLogo from '../assets/ungcheon-logo.png'
import { isSidebarExpanded, normalizeSidebarExpandedPinned, SIDEBAR_EXPANDED_PINNED_KEY } from '../services/sidebarPreferences'

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { id: 'help', label: '사용 매뉴얼', icon: HelpCircle },
  { id: 'notifier', label: '업무알리미', icon: Bell },
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'calendar', label: '캘린더', icon: CalendarDays },
  { id: 'settings', label: '환경설정', icon: Settings },
  { id: 'admin_center', label: '관리자 센터', icon: ShieldCheck },
  { id: 'staff_tasks', label: '업무센터', icon: ClipboardCheck },
  { id: 'school_hub', label: '학교 공유 링크', icon: Link2 },
  { id: 'timetable_swap', label: '교환·대강 계획', icon: ArrowLeftRight },
  { id: 'student_timetable', label: '학생별 시간표', icon: CalendarRange },
  { id: 'attendance_print', label: '출석부 출력', icon: UsersRound },
  { id: 'volunteer_work', label: '봉사활동 업무', icon: HeartHandshake },
  { id: 'student_locator', label: '학생 위치 찾기', icon: SearchCheck },
  { id: 'schoolinfo_evaluation', label: '타학교 평가계획', icon: Building2 },
  { id: 'student_identity_audit', label: '학생 학번·이름 교정기', icon: ScanSearch },
  { id: 'subject_remarks_print', label: '교과세특 개별 인쇄기', icon: ScrollText },
  { id: 'staff_roster', label: '교직원 명렬', icon: UsersRound },
  { id: 'committees', label: '각종 위원회 현황', icon: Landmark },
  { id: 'feature_requests', label: '기능개선 요청', icon: MessageSquareText },
  { id: 'transfer_score', label: '전보내신점수 계산기', icon: MapPinned },
  { id: 'grade_preview', label: '성적 산출 미리보기', icon: Calculator },
  { id: 'estimated_split_score', label: '추정분할점수 도우미', icon: Table2 },
  { id: 'curriculum', label: '교육과정 편제표 출력', icon: FileText },
  { id: 'form_center', label: '서식센터', icon: FilePenLine },
  { id: 'teacher_tools', label: '교사용 도구', icon: Wrench },
  { id: 'excel_processor', label: 'Excel 전처리', icon: Table2 },
  { id: 'recommended_subjects', label: '대학 권장과목', icon: BookOpen },
  { id: 'payroll', label: '호봉획정 계산기', icon: Calculator },
  { id: 'insa_analysis', label: 'NEIS 인사기록 분석', icon: FileScan },
  { id: 'pdf_extractor', label: 'PDF 텍스트 추출', icon: FileDown },
  { id: 'file_parser', label: '만능 파일 파서', icon: FileCode2 },
]

const DEFAULT_ORDER = NAV.map(item => item.id)
const LEGACY_DEFAULT_ORDER = [
  'dashboard', 'calendar', 'school_hub', 'feature_requests', 'settings', 'help',
  'timetable_swap', 'student_timetable', 'student_locator', 'student_identity_audit',
  'attendance_print', 'grade_preview', 'estimated_split_score', 'curriculum',
  'staff_tasks', 'staff_roster', 'form_center', 'teacher_tools', 'committees',
  'excel_processor', 'recommended_subjects', 'payroll', 'transfer_score',
  'insa_analysis', 'pdf_extractor', 'file_parser', 'notifier',
]
const NAV_BY_ID = new Map(NAV.map(item => [item.id, item]))
export const SIDEBAR_MENU_OPTIONS = NAV.map(({ id, label }) => ({ id, label }))
const SIDEBAR_PINNED_KEY = 'sidebar.pinnedMenus.v1'
const SIDEBAR_HIDDEN_KEY = 'sidebar.hiddenMenus.v1'

function normalizeOrder(value: unknown) {
  const saved = Array.isArray(value) ? value.map(String) : []
  if (!saved.length || (saved.length === LEGACY_DEFAULT_ORDER.length && saved.every((id, index) => id === LEGACY_DEFAULT_ORDER[index]))) {
    return DEFAULT_ORDER
  }
  const known = saved.filter((id, index) => NAV_BY_ID.has(id) && saved.indexOf(id) === index)
  const next = [...known, ...DEFAULT_ORDER.filter(id => !known.includes(id))]
  if (!known.includes('admin_center')) {
    const appendedIndex = next.indexOf('admin_center')
    if (appendedIndex >= 0) next.splice(appendedIndex, 1)
    const settingsIndex = next.indexOf('settings')
    next.splice(settingsIndex >= 0 ? settingsIndex + 1 : 0, 0, 'admin_center')
  }
  if (!known.includes('subject_remarks_print')) {
    const appendedIndex = next.indexOf('subject_remarks_print')
    if (appendedIndex >= 0) next.splice(appendedIndex, 1)
    const studentAuditIndex = next.indexOf('student_identity_audit')
    next.splice(studentAuditIndex >= 0 ? studentAuditIndex + 1 : next.length, 0, 'subject_remarks_print')
  }
  if (!known.includes('volunteer_work')) {
    const appendedIndex = next.indexOf('volunteer_work')
    if (appendedIndex >= 0) next.splice(appendedIndex, 1)
    const attendanceIndex = next.indexOf('attendance_print')
    next.splice(attendanceIndex >= 0 ? attendanceIndex + 1 : next.length, 0, 'volunteer_work')
  }
  if (!known.includes('schoolinfo_evaluation')) {
    const appendedIndex = next.indexOf('schoolinfo_evaluation')
    if (appendedIndex >= 0) next.splice(appendedIndex, 1)
    const locatorIndex = next.indexOf('student_locator')
    next.splice(locatorIndex >= 0 ? locatorIndex + 1 : next.length, 0, 'schoolinfo_evaluation')
  }
  return next
}

export default function Sidebar({
  currentPage,
  onNavigate,
  onOpenLog,
  logErrorCount,
}: {
  currentPage: string
  onNavigate: (id: string) => void
  onOpenLog: () => void
  logErrorCount: number
}) {
  const [hovered, setHovered] = useState(false)
  const [expandedPinned, setExpandedPinned] = useState(true)
  const [editing, setEditing] = useState(false)
  const [menuOrder, setMenuOrder] = useState(DEFAULT_ORDER)
  const [pinnedMenus, setPinnedMenus] = useState<string[]>([])
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([])
  const config = useAppStore(s => s.config)
  const isAdmin = useAdminStore(s => s.isAdmin)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const isExpanded = isSidebarExpanded(expandedPinned, hovered, editing)

  const loadPreferences = useCallback(() => {
    void Promise.all([
      window.electron?.configGet('sidebar.menuOrder'),
      window.electron?.configGet(SIDEBAR_PINNED_KEY),
      window.electron?.configGet(SIDEBAR_HIDDEN_KEY),
      window.electron?.configGet(SIDEBAR_EXPANDED_PINNED_KEY),
    ]).then(([order, pinned, hidden, expandedPin]) => {
      setMenuOrder(normalizeOrder(order))
      setPinnedMenus(Array.isArray(pinned) ? pinned.map(String).filter(id => NAV_BY_ID.has(id)) : [])
      setHiddenMenus(Array.isArray(hidden) ? hidden.map(String).filter(id => NAV_BY_ID.has(id) && id !== 'settings') : [])
      setExpandedPinned(normalizeSidebarExpandedPinned(expandedPin))
    })
  }, [])

  useEffect(() => {
    loadPreferences()
    window.addEventListener('sidebar:preferences-updated', loadPreferences)
    return () => window.removeEventListener('sidebar:preferences-updated', loadPreferences)
  }, [loadPreferences])

  const orderedItems = useMemo(() => {
    const pinned = pinnedMenus.filter(id => menuOrder.includes(id))
    const orderedIds = [...pinned, ...menuOrder.filter(id => !pinned.includes(id))]
    return orderedIds
      .map(id => NAV_BY_ID.get(id))
      .filter((item): item is NavItem => Boolean(item))
      .filter(item => !hiddenMenus.includes(item.id))
      .filter(item => item.id !== 'admin_center' || isAdmin)
  }, [hiddenMenus, isAdmin, menuOrder, pinnedMenus])

  const saveOrder = (next: string[]) => {
    setMenuOrder(next)
    void window.electron?.configSet('sidebar.menuOrder', next)
  }

  const toggleExpandedPinned = () => {
    setExpandedPinned(current => {
      const next = !current
      void window.electron?.configSet(SIDEBAR_EXPANDED_PINNED_KEY, next)
      return next
    })
  }

  const togglePinned = (id: string) => {
    setPinnedMenus(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
      void window.electron?.configSet(SIDEBAR_PINNED_KEY, next)
      return next
    })
  }

  const hideMenu = (id: string) => {
    if (id === 'settings') return
    setHiddenMenus(current => {
      const next = [...new Set([...current, id])]
      void window.electron?.configSet(SIDEBAR_HIDDEN_KEY, next)
      return next
    })
    if (currentPage === id) onNavigate('dashboard')
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const oldIndex = menuOrder.indexOf(String(active.id))
    const newIndex = menuOrder.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    saveOrder(arrayMove(menuOrder, oldIndex, newIndex))
  }

  return (
    <motion.aside
      animate={{ width: isExpanded ? 226 : 58 }}
      transition={{ duration: 0.22 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="app-sidebar h-full bg-surface-950 border-r flex flex-col flex-shrink-0 overflow-hidden z-20"
    >
      <div className="h-14 px-3 flex items-center border-b border-white/5">
        <div className="school-logo-shell w-8 h-8 rounded-lg p-0.5 flex items-center justify-center flex-shrink-0">
          <img src={schoolLogo} alt="웅천고등학교" className="w-full h-full object-contain" />
        </div>
        <AnimatePresence>
          {isExpanded && (
            <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="ml-2.5 min-w-0 flex-1">
              <p className="text-xs font-bold text-white whitespace-nowrap">웅천고등학교</p>
              <p className="text-[10px] text-slate-500 truncate">{config.teacherName || '교직원 업무지원'}</p>
            </motion.div>
          )}
        </AnimatePresence>
        {isExpanded && <button
          type="button"
          onClick={toggleExpandedPinned}
          title={expandedPinned ? '메뉴 자동 접힘으로 전환' : '메뉴 펼침 고정'}
          aria-label={expandedPinned ? '메뉴 펼침 고정 해제' : '메뉴 펼침 고정'}
          aria-pressed={expandedPinned}
          className={clsx('ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors', expandedPinned
            ? 'border-amber-400/40 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
            : 'border-white/10 text-slate-500 hover:bg-white/10 hover:text-slate-200')}
        >
          {expandedPinned ? <Pin size={15} /> : <PinOff size={15} />}
        </button>}
      </div>

      {isExpanded && (
        <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setEditing(value => !value)}
            className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-colors', editing ? 'bg-amber-400/15 text-amber-300' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300')}
          >
            {editing ? <><Check size={12} />순서 변경 완료</> : <><GripVertical size={12} />목록 순서 변경</>}
          </button>
          {editing && (
            <button type="button" onClick={() => saveOrder(DEFAULT_ORDER)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300" title="기본 순서로 초기화">
              <ListRestart size={13} />
            </button>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-none">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={menuOrder} strategy={verticalListSortingStrategy}>
            {orderedItems.map(item => (
              <NavButton
                key={item.id}
                item={item}
                expanded={isExpanded}
                editing={editing}
                active={currentPage === item.id}
                pinned={pinnedMenus.includes(item.id)}
                onClick={() => onNavigate(item.id)}
                onTogglePinned={() => togglePinned(item.id)}
                onHide={() => hideMenu(item.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </nav>

      <button onClick={onOpenLog} className="relative h-10 mx-1.5 mb-1 flex items-center px-3 text-slate-600 hover:text-slate-300 rounded-lg hover:bg-white/5">
        <ScrollText size={15} className="flex-shrink-0" />
        {isExpanded && <span className="ml-2.5 text-xs whitespace-nowrap">앱 로그</span>}
        {logErrorCount > 0 && <span className="absolute top-1.5 left-6 w-2 h-2 rounded-full bg-rose-500" />}
      </button>
    </motion.aside>
  )
}

function NavButton({
  item, expanded, editing, active, pinned, onClick, onTogglePinned, onHide,
}: {
  item: NavItem
  expanded: boolean
  editing: boolean
  active: boolean
  pinned: boolean
  onClick: () => void
  onTogglePinned: () => void
  onHide: () => void
}) {
  const Icon = item.icon
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !editing,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }}
      className="group relative mx-1.5"
    >
      <button
        type="button"
        onClick={() => { if (!editing) onClick() }}
        title={!expanded ? item.label : undefined}
        className={clsx(
          'relative flex h-9 w-full items-center rounded-xl px-3 transition-colors',
          editing ? 'cursor-default pr-9' : expanded ? 'pr-16' : '',
          active ? 'bg-amber-400/20 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
        )}
      >
        {active && <span className="absolute left-0 w-1 h-5 rounded-r-full bg-amber-400" />}
        <Icon size={16} className={clsx('flex-shrink-0', active && 'text-amber-400')} />
        {expanded && <span className="ml-2.5 truncate text-sm whitespace-nowrap">{item.label}</span>}
      </button>
      {expanded && editing && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute right-1 top-1 grid h-7 w-7 cursor-grab place-items-center rounded-lg text-slate-500 hover:bg-white/10 hover:text-amber-300 active:cursor-grabbing"
          title={`${item.label} 순서 이동`}
          aria-label={`${item.label} 순서 이동`}
        >
          <GripVertical size={14} />
        </button>
      )}
      {expanded && !editing && (
        <div className="pointer-events-none absolute right-1 top-1 flex opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <button
            type="button"
            onClick={event => { event.stopPropagation(); onTogglePinned() }}
            className={clsx('grid h-7 w-7 place-items-center rounded-lg hover:bg-white/10', pinned ? 'text-amber-300' : 'text-slate-500 hover:text-amber-300')}
            title={pinned ? `${item.label} 고정 해제` : `${item.label} 위에 고정`}
            aria-label={pinned ? `${item.label} 고정 해제` : `${item.label} 위에 고정`}
          >
            {pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          {item.id !== 'settings' && (
            <button
              type="button"
              onClick={event => { event.stopPropagation(); onHide() }}
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white/10 hover:text-rose-300"
              title={`${item.label} 메뉴 숨기기`}
              aria-label={`${item.label} 메뉴 숨기기`}
            >
              <EyeOff size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
