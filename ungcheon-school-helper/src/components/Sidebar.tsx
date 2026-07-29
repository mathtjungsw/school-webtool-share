import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight, Bell, BookCopy, BookOpen, Calculator, ChevronDown,
  ChevronRight, FileCode2, FileDown, FileScan, HelpCircle,
  Landmark, LayoutDashboard, Link2, MessageSquareText, Radio, ScrollText,
  Settings, Table2, FileText,
  type LucideIcon,
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../stores/appStore'
import schoolLogo from '../assets/ungcheon-logo.png'

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
}

interface NavGroup {
  label: string
  defaultOpen?: boolean
  items: NavItem[]
}

const NAV: NavGroup[] = [
  {
    label: '',
    defaultOpen: true,
    items: [
      { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
      { id: 'school_hub', label: '학교 공유 링크', icon: Link2 },
      { id: 'feature_requests', label: '기능개선 요청', icon: MessageSquareText },
      { id: 'neis', label: 'NEIS 정보', icon: Radio },
      { id: 'settings', label: '환경설정', icon: Settings },
      { id: 'help', label: '사용 매뉴얼', icon: HelpCircle },
    ],
  },
  {
    label: '자료·진로',
    defaultOpen: true,
    items: [
      { id: 'excel_processor', label: 'Excel 전처리', icon: Table2 },
      { id: 'recommended_subjects', label: '대학 권장과목', icon: BookOpen },
    ],
  },
  {
    label: '인사행정',
    items: [
      { id: 'payroll', label: '호봉획정 계산기', icon: Calculator },
      { id: 'insa_analysis', label: 'NEIS 인사기록 분석', icon: FileScan },
    ],
  },
  {
    label: '학사·기록',
    items: [
      { id: 'timetable_swap', label: '교환·대강 계획', icon: ArrowLeftRight },
      { id: 'curriculum', label: '교육과정 편제표 출력', icon: FileText },
    ],
  },
  {
    label: '학교운영',
    items: [
      { id: 'committees', label: '각종 위원회 현황', icon: Landmark },
      { id: 'school_ledger', label: '비치 장부 현황', icon: BookCopy },
    ],
  },
  {
    label: '파일 처리',
    items: [
      { id: 'pdf_extractor', label: 'PDF 텍스트 추출', icon: FileDown },
      { id: 'file_parser', label: '만능 파일 파서', icon: FileCode2 },
    ],
  },
  {
    label: '알림',
    items: [
      { id: 'notifier', label: '업무 알리미', icon: Bell },
    ],
  },
]

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
  const [expanded, setExpanded] = useState(false)
  const config = useAppStore(s => s.config)
  const currentGroup = NAV.find(group => group.items.some(item => item.id === currentPage))?.label ?? ''
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV.filter(g => g.label).map(g => [g.label, Boolean(g.defaultOpen)])),
  )

  useEffect(() => {
    if (currentGroup) setOpenGroups(state => ({ ...state, [currentGroup]: true }))
  }, [currentGroup])

  return (
    <motion.aside
      animate={{ width: expanded ? 226 : 58 }}
      transition={{ duration: 0.22 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="app-sidebar h-full bg-surface-950 border-r flex flex-col flex-shrink-0 overflow-hidden z-20"
    >
      <div className="h-14 px-3 flex items-center border-b border-white/5">
        <div className="school-logo-shell w-8 h-8 rounded-lg p-0.5 flex items-center justify-center flex-shrink-0">
          <img src={schoolLogo} alt="웅천고등학교" className="w-full h-full object-contain" />
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="ml-2.5 min-w-0">
              <p className="text-xs font-bold text-white whitespace-nowrap">웅천고등학교</p>
              <p className="text-[10px] text-slate-500 truncate">{config.teacherName || '교직원 업무지원'}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-none">
        {NAV.map((group, groupIndex) => {
          const alwaysOpen = group.label === ''
          const isOpen = alwaysOpen || openGroups[group.label]
          return (
            <div key={group.label || groupIndex} className="mb-1">
              {group.label && expanded && (
                <button
                  onClick={() => setOpenGroups(state => ({ ...state, [group.label]: !state[group.label] }))}
                  className="w-full px-4 pt-3 pb-1 flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-600 hover:text-slate-400"
                >
                  {group.label}
                  <ChevronDown size={10} className={clsx('transition-transform', !isOpen && '-rotate-90')} />
                </button>
              )}
              {group.label && !expanded && <div className="mx-3 my-1.5 border-t border-white/5" />}
              {(isOpen || !expanded) && group.items.map(item => (
                <NavButton
                  key={item.id}
                  item={item}
                  expanded={expanded}
                  active={currentPage === item.id}
                  onClick={() => onNavigate(item.id)}
                />
              ))}
            </div>
          )
        })}
      </nav>

      <button onClick={onOpenLog} className="relative h-10 mx-1.5 mb-1 flex items-center px-3 text-slate-600 hover:text-slate-300 rounded-lg hover:bg-white/5">
        <ScrollText size={15} className="flex-shrink-0" />
        {expanded && <span className="ml-2.5 text-xs whitespace-nowrap">앱 로그</span>}
        {logErrorCount > 0 && <span className="absolute top-1.5 left-6 w-2 h-2 rounded-full bg-rose-500" />}
      </button>
      <div className="h-8 border-t border-white/5 flex items-center justify-center text-slate-700">
        <ChevronRight size={13} className={clsx('transition-transform', expanded && 'rotate-180')} />
      </div>
    </motion.aside>
  )
}

function NavButton({
  item, expanded, active, onClick,
}: {
  item: NavItem
  expanded: boolean
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      title={!expanded ? item.label : undefined}
      className={clsx(
        'relative h-9 mx-1.5 px-3 flex items-center rounded-xl transition-colors',
        active ? 'bg-amber-400/20 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
      )}
      style={{ width: 'calc(100% - 12px)' }}
    >
      {active && <span className="absolute left-0 w-1 h-5 rounded-r-full bg-amber-400" />}
      <Icon size={16} className={clsx('flex-shrink-0', active && 'text-amber-400')} />
      {expanded && <span className="ml-2.5 text-sm whitespace-nowrap">{item.label}</span>}
    </button>
  )
}
