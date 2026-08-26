import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, EyeOff, GripVertical, ListRestart, Pin, PinOff, ScrollText } from 'lucide-react'
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
import {
  NAVIGATION_BY_ID,
  NAVIGATION_ITEMS,
  type NavigationItem,
} from '../config/navigationRegistry'

const DEFAULT_ORDER = NAVIGATION_ITEMS.map(item => item.id)
const LEGACY_DEFAULT_ORDER = [
  'dashboard', 'calendar', 'school_hub', 'feature_requests', 'settings', 'help',
  'timetable_swap', 'student_timetable', 'student_locator', 'student_identity_audit',
  'attendance_print', 'grade_preview', 'estimated_split_score', 'curriculum',
  'staff_tasks', 'staff_roster', 'form_center', 'teacher_tools', 'committees',
  'excel_processor', 'recommended_subjects', 'payroll', 'transfer_score',
  'insa_analysis', 'pdf_extractor', 'file_parser', 'notifier',
]
const NAV_BY_ID = NAVIGATION_BY_ID
const SIDEBAR_PINNED_KEY = 'sidebar.pinnedMenus.v1'
const SIDEBAR_HIDDEN_KEY = 'sidebar.hiddenMenus.v1'
const SIDEBAR_COLLAPSED_GROUPS_KEY = 'sidebar.collapsedGroups.v1'

const MENU_GROUPS = [
  { id: 'start', label: '시작·설정', items: ['help', 'notifier', 'operations_notifications', 'calendar', 'settings', 'admin_center'] },
  { id: 'school', label: '업무·학교운영', items: ['staff_tasks', 'audit_evidence', 'school_hub', 'timetable_swap', 'staff_roster', 'committees', 'feature_requests', 'form_center'] },
  { id: 'student', label: '학생·학사', items: ['student_timetable', 'attendance_print', 'volunteer_work', 'student_locator', 'student_identity_audit', 'subject_remarks_print', 'record_privacy_blind'] },
  { id: 'curriculum', label: '평가·교육과정·진로', items: ['schoolinfo_evaluation', 'grade_preview', 'estimated_split_score', 'curriculum', 'recommended_subjects'] },
  { id: 'tools', label: '인사·교사용 도구', items: ['transfer_score', 'teacher_tools', 'excel_processor', 'payroll', 'insa_analysis', 'pdf_extractor', 'file_parser'] },
] as const

const DEFAULT_COLLAPSED_GROUPS: string[] = []
const GROUP_BY_MENU: ReadonlyMap<string, string> = new Map<string, string>(MENU_GROUPS.flatMap(group => group.items.map(id => [id, group.id])))

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
  if (!known.includes('record_privacy_blind')) {
    const appendedIndex = next.indexOf('record_privacy_blind')
    if (appendedIndex >= 0) next.splice(appendedIndex, 1)
    const remarksIndex = next.indexOf('subject_remarks_print')
    next.splice(remarksIndex >= 0 ? remarksIndex + 1 : next.length, 0, 'record_privacy_blind')
  }
  if (!known.includes('audit_evidence')) {
    const appendedIndex = next.indexOf('audit_evidence')
    if (appendedIndex >= 0) next.splice(appendedIndex, 1)
    const tasksIndex = next.indexOf('staff_tasks')
    next.splice(tasksIndex >= 0 ? tasksIndex + 1 : next.length, 0, 'audit_evidence')
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
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(DEFAULT_COLLAPSED_GROUPS)
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
      window.electron?.configGet(SIDEBAR_COLLAPSED_GROUPS_KEY),
    ]).then(([order, pinned, hidden, expandedPin, collapsed]) => {
      setMenuOrder(normalizeOrder(order))
      setPinnedMenus(Array.isArray(pinned) ? pinned.map(String).filter(id => NAV_BY_ID.has(id) && id !== 'dashboard') : [])
      setHiddenMenus(Array.isArray(hidden) ? hidden.map(String).filter(id => NAV_BY_ID.has(id) && id !== 'settings' && id !== 'dashboard') : [])
      setExpandedPinned(normalizeSidebarExpandedPinned(expandedPin))
      setCollapsedGroups(Array.isArray(collapsed)
        ? collapsed.map(String).filter(id => MENU_GROUPS.some(group => group.id === id))
        : DEFAULT_COLLAPSED_GROUPS)
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
      .filter((item): item is NavigationItem => Boolean(item))
      .filter(item => item.id === 'dashboard' || !hiddenMenus.includes(item.id))
      .filter(item => item.id !== 'admin_center' || isAdmin)
  }, [hiddenMenus, isAdmin, menuOrder, pinnedMenus])

  const dashboardItem = useMemo(() => orderedItems.find(item => item.id === 'dashboard'), [orderedItems])
  const menuItems = useMemo(() => orderedItems.filter(item => item.id !== 'dashboard'), [orderedItems])
  const pinnedItems = useMemo(() => menuItems.filter(item => pinnedMenus.includes(item.id)), [menuItems, pinnedMenus])
  const groupedItems = useMemo(() => MENU_GROUPS.map(group => ({
    ...group,
    entries: menuItems.filter(item => !pinnedMenus.includes(item.id) && (group.items as readonly string[]).includes(item.id)),
  })).filter(group => group.entries.length), [menuItems, pinnedMenus])
  const ungroupedItems = useMemo(() => menuItems.filter(item => !pinnedMenus.includes(item.id) && !GROUP_BY_MENU.has(item.id)), [menuItems, pinnedMenus])

  useEffect(() => {
    const activeGroup = GROUP_BY_MENU.get(currentPage)
    if (!activeGroup) return
    setCollapsedGroups(current => current.includes(activeGroup) ? current.filter(id => id !== activeGroup) : current)
  }, [currentPage])

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
    if (id === 'dashboard') return
    setPinnedMenus(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
      void window.electron?.configSet(SIDEBAR_PINNED_KEY, next)
      return next
    })
  }

  const hideMenu = (id: string) => {
    if (id === 'settings' || id === 'dashboard') return
    setHiddenMenus(current => {
      const next = [...new Set([...current, id])]
      void window.electron?.configSet(SIDEBAR_HIDDEN_KEY, next)
      return next
    })
    if (currentPage === id) onNavigate('dashboard')
  }

  const toggleGroup = (id: string) => {
    setCollapsedGroups(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
      void window.electron?.configSet(SIDEBAR_COLLAPSED_GROUPS_KEY, next)
      return next
    })
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
          <SortableContext items={menuOrder.filter(id => id !== 'dashboard')} strategy={verticalListSortingStrategy}>
            {dashboardItem && (
              <NavButton key={dashboardItem.id} item={dashboardItem} expanded={isExpanded} editing={false} active={currentPage === dashboardItem.id} pinned={false} locked onClick={() => onNavigate(dashboardItem.id)} onTogglePinned={() => undefined} onHide={() => undefined} />
            )}
            {editing || !isExpanded ? menuItems.map(item => (
              <NavButton key={item.id} item={item} expanded={isExpanded} editing={editing} active={currentPage === item.id} pinned={pinnedMenus.includes(item.id)} onClick={() => onNavigate(item.id)} onTogglePinned={() => togglePinned(item.id)} onHide={() => hideMenu(item.id)} />
            )) : <>
              {pinnedItems.length > 0 && <MenuGroupHeader label="고정 메뉴" count={pinnedItems.length} pinned />}
              {pinnedItems.map(item => (
                <NavButton key={item.id} item={item} expanded editing={false} active={currentPage === item.id} pinned onClick={() => onNavigate(item.id)} onTogglePinned={() => togglePinned(item.id)} onHide={() => hideMenu(item.id)} />
              ))}
              {groupedItems.map(group => {
                const collapsed = collapsedGroups.includes(group.id)
                return <section key={group.id} className="mb-1">
                  <MenuGroupHeader label={group.label} count={group.entries.length} collapsed={collapsed} onToggle={() => toggleGroup(group.id)} />
                  {!collapsed && group.entries.map(item => (
                    <NavButton key={item.id} item={item} expanded editing={false} active={currentPage === item.id} pinned={false} onClick={() => onNavigate(item.id)} onTogglePinned={() => togglePinned(item.id)} onHide={() => hideMenu(item.id)} />
                  ))}
                </section>
              })}
              {ungroupedItems.length > 0 && <section>
                <MenuGroupHeader label="기타" count={ungroupedItems.length} />
                {ungroupedItems.map(item => <NavButton key={item.id} item={item} expanded editing={false} active={currentPage === item.id} pinned={false} onClick={() => onNavigate(item.id)} onTogglePinned={() => togglePinned(item.id)} onHide={() => hideMenu(item.id)} />)}
              </section>}
            </>}
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

function MenuGroupHeader({
  label, count, collapsed = false, pinned = false, onToggle,
}: {
  label: string
  count: number
  collapsed?: boolean
  pinned?: boolean
  onToggle?: () => void
}) {
  const content = <>
    <span className="truncate">{label}</span>
    <span className="ml-auto rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] dark:bg-white/10">{count}</span>
    {!pinned && <ChevronDown size={12} className={clsx('transition-transform', collapsed && '-rotate-90')} />}
  </>
  if (pinned) return <div className="mx-3 mt-1 flex h-7 items-center gap-1.5 text-[10px] font-black tracking-wide text-amber-700 dark:text-amber-300">{content}</div>
  return <button type="button" onClick={onToggle} className="mx-2 flex h-8 w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg px-2 text-left text-[10px] font-black tracking-wide text-slate-600 hover:bg-black/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100" aria-expanded={!collapsed}>{content}</button>
}

function NavButton({
  item, expanded, editing, active, pinned, locked = false, onClick, onTogglePinned, onHide,
}: {
  item: NavigationItem
  expanded: boolean
  editing: boolean
  active: boolean
  pinned: boolean
  locked?: boolean
  onClick: () => void
  onTogglePinned: () => void
  onHide: () => void
}) {
  const Icon = item.icon
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !editing || locked,
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
      {expanded && editing && !locked && (
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
      {expanded && !editing && !locked && (
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
