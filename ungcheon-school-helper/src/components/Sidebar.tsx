import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Pin, PinOff, ScrollText } from 'lucide-react'
import clsx from 'clsx'
import schoolLogo from '../assets/ungcheon-logo.png'
import { NAVIGATION_BY_ID, type NavigationItem } from '../config/navigationRegistry'
import { isSidebarExpanded, normalizeSidebarExpandedPinned, SIDEBAR_EXPANDED_PINNED_KEY } from '../services/sidebarPreferences'
import { useAppStore } from '../stores/appStore'

const SHORTCUT_LIMIT = 8

export default function Sidebar({
  currentPage, shortcuts, onNavigate, onOpenLog, logErrorCount,
}: {
  currentPage: string
  shortcuts: NavigationItem[]
  onNavigate: (id: string) => void
  onOpenLog: () => void
  logErrorCount: number
}) {
  const [hovered, setHovered] = useState(false)
  const [expandedPinned, setExpandedPinned] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const teacherName = useAppStore(s => s.config.teacherName)
  const expanded = isSidebarExpanded(expandedPinned, hovered, false)
  const showingAll = expanded && showAll

  useEffect(() => {
    let active = true
    void window.electron?.configGet(SIDEBAR_EXPANDED_PINNED_KEY).then(value => {
      if (active) setExpandedPinned(normalizeSidebarExpandedPinned(value))
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const toggleExpandedPinned = () => {
    const next = !expandedPinned
    setExpandedPinned(next)
    void window.electron?.configSet(SIDEBAR_EXPANDED_PINNED_KEY, next).catch(() => undefined)
  }

  const itemButton = (item: NavigationItem, active = currentPage === item.id) => {
    const Icon = item.icon
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onNavigate(item.id)}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        title={!expanded ? item.label : undefined}
        className={clsx(
          'relative mx-1.5 flex h-9 w-[calc(100%-0.75rem)] items-center rounded-xl px-3 text-left transition-colors',
          active ? 'bg-amber-400/20 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
        )}
      >
        {active && <span className="absolute left-0 h-5 w-1 rounded-r-full bg-amber-500" />}
        <Icon size={16} aria-hidden="true" className={clsx('shrink-0', active && 'text-amber-500')} />
        {expanded && <span className="ml-2.5 truncate text-sm">{item.label}</span>}
      </button>
    )
  }

  return (
    <motion.aside
      animate={{ width: expanded ? 226 : 58 }}
      transition={{ duration: 0.22 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="app-sidebar z-20 flex h-full shrink-0 flex-col overflow-hidden border-r bg-surface-950"
    >
      <div className="flex h-14 shrink-0 items-center border-b border-white/5 px-3">
        <div className="school-logo-shell flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-0.5">
          <img src={schoolLogo} alt="웅천고등학교" className="h-full w-full object-contain" />
        </div>
        {expanded && <>
          <div className="ml-2.5 min-w-0 flex-1">
            <p className="whitespace-nowrap text-xs font-bold text-white">웅천고등학교</p>
            <p className="truncate text-[10px] text-slate-500">{teacherName || '교직원 업무지원'}</p>
          </div>
          <button
            type="button"
            onClick={toggleExpandedPinned}
            aria-label={expandedPinned ? '메뉴 펼침 고정 해제' : '메뉴 펼침 고정'}
            aria-pressed={expandedPinned}
            className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-amber-100"
          >
            {expandedPinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
        </>}
      </div>

      <nav aria-label="주 메뉴" className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-none">
        {itemButton(NAVIGATION_BY_ID.get('dashboard')!)}
        {itemButton(NAVIGATION_BY_ID.get('feature_catalog')!, currentPage === 'feature_catalog' || currentPage === 'feature_overview')}

        <section aria-label="내 바로가기" className="mt-3 border-t border-slate-200/60 pt-2">
          {expanded && <h2 className="px-4 pb-1 text-xs font-bold text-slate-600">내 바로가기</h2>}
          {(showingAll ? shortcuts : shortcuts.slice(0, SHORTCUT_LIMIT)).map(item => itemButton(item))}
          {expanded && !shortcuts.length && (
            <button type="button" onClick={() => onNavigate('feature_catalog')} className="mx-3 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-amber-100">
              전체 메뉴에서 추가
            </button>
          )}
          {expanded && shortcuts.length > SHORTCUT_LIMIT && (
            <button type="button" onClick={() => setShowAll(previous => !previous)} aria-expanded={showingAll}
              className="mx-3 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-amber-100">
              <ChevronDown size={14} className={showingAll ? 'rotate-180' : ''} />
              {showingAll ? '바로가기 접기' : '바로가기 더 보기'}
            </button>
          )}
        </section>
      </nav>

      <div className="shrink-0 border-t border-slate-200/60 py-1">
        {itemButton(NAVIGATION_BY_ID.get('settings')!)}
        <button type="button" onClick={onOpenLog} aria-label="앱 로그"
          className="relative mx-1.5 flex h-9 w-[calc(100%-0.75rem)] items-center rounded-xl px-3 text-slate-600 hover:bg-slate-100">
          <ScrollText size={15} aria-hidden="true" className="shrink-0" />
          {expanded && <span className="ml-2.5 whitespace-nowrap text-xs">앱 로그</span>}
          {logErrorCount > 0 && <span className="absolute left-6 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
        </button>
      </div>
    </motion.aside>
  )
}
