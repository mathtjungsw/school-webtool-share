import { useEffect, useState } from 'react'
import {
  AlertCircle, Check, ChevronLeft, Link2, Megaphone, MessageSquareText,
  LogOut, Minus, Search, ScrollText, Square, X, PanelsTopLeft,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useNoticeStore } from '../stores/noticeStore'
import AdminModeButton from './AdminModeButton'
import schoolLogo from '../assets/ungcheon-logo.png'
import { useAuthStore } from '../stores/authStore'
import TimetableChangeNotifications from './TimetableChangeNotifications'

export default function TitleBar({
  currentPage,
  onNavigate,
  onGoBack,
  canGoBack,
  onOpenLog,
  onOpenAssistant,
  logErrorCount,
}: {
  currentPage: string
  onNavigate: (id: string) => void
  onGoBack: () => void
  canGoBack: boolean
  onOpenLog: () => void
  onOpenAssistant: () => void
  logErrorCount: number
}) {
  const [version, setVersion] = useState('')
  const config = useAppStore(state => state.config)
  const updateNone = useAppStore(state => state.updateNone)
  const updateError = useAppStore(state => state.updateError)
  const clearUpdateError = useAppStore(state => state.clearUpdateError)
  const logout = useAuthStore(state => state.logout)

  useEffect(() => { window.electron?.getVersion().then(setVersion) }, [])

  return (
    <div className="app-titlebar drag-region h-11 flex items-center px-3 bg-surface-950 border-b flex-shrink-0">
      <div className="no-drag flex items-center gap-2 w-60">
        <button onClick={onGoBack} disabled={!canGoBack} className={canGoBack ? 'text-slate-400 hover:text-white' : 'text-slate-700'}>
          <ChevronLeft size={15} />
        </button>
        <span className="school-logo-shell w-6 h-6 rounded-md p-0.5 flex-shrink-0">
          <img src={schoolLogo} alt="" className="w-full h-full object-contain" />
        </span>
        <span className="text-xs font-black tracking-tight text-slate-300">웅천고 업무도우미</span>
        {version && <span className="text-[9px] text-slate-600">v{version}</span>}
      </div>

      <div className="flex-1 flex items-center justify-center gap-1">
        <TopNav active={currentPage === 'dashboard'} onClick={() => onNavigate('dashboard')}>대시보드</TopNav>
        <button type="button" onClick={onOpenAssistant} className="no-drag mx-1 flex items-center gap-2 px-3 py-1 rounded-md border border-violet-400/20 bg-violet-500/10 text-[11px] text-violet-200 hover:bg-violet-500/20 hover:border-violet-400/35 transition-colors" title="업무 도우미 검색 (Ctrl+K)">
          <Search size={12} />
          <span>업무 검색</span>
          <kbd className="hidden xl:inline rounded border border-white/10 bg-black/15 px-1 text-[9px] text-violet-300/70">Ctrl K</kbd>
        </button>
        <TopNav active={currentPage === 'school_hub'} onClick={() => onNavigate('school_hub')} icon={<Link2 size={11} />}>학교 공유 링크</TopNav>
        <TopNav active={currentPage === 'feature_requests'} onClick={() => onNavigate('feature_requests')} icon={<MessageSquareText size={11} />}>기능개선</TopNav>
        <NoticeButton />
        <TimetableChangeNotifications />
        <button type="button" onClick={() => window.electron?.showWidget()} className="no-drag flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] text-slate-400 hover:text-white hover:bg-white/5" title="바탕화면 미니 대시보드 열기">
          <PanelsTopLeft size={12} />미니 위젯
        </button>
        <TopNav active={currentPage === 'settings'} onClick={() => onNavigate('settings')}>환경설정</TopNav>
      </div>

      <div className="no-drag flex items-center gap-1 w-60 justify-end">
        {updateNone && <span className="text-[10px] text-emerald-400 flex items-center gap-1 mr-1"><Check size={10} />최신 버전</span>}
        {updateError && (
          <button onClick={clearUpdateError} title={updateError} className="text-[10px] text-rose-400 flex items-center gap-1 mr-1">
            <AlertCircle size={10} />업데이트 확인 실패
          </button>
        )}
        <AdminModeButton />
        <button onClick={() => void logout()} title={`${config.teacherName ?? ''} 로그아웃·사용자 전환`} className="flex h-7 items-center gap-1 rounded px-2 text-[10px] text-slate-400 hover:bg-white/5 hover:text-white">
          <LogOut size={12} /><span className="max-w-16 truncate">{config.teacherName}</span>
        </button>
        <button onClick={onOpenLog} title="앱 로그" className="relative w-7 h-7 grid place-items-center text-slate-500 hover:text-slate-200 rounded hover:bg-white/5">
          <ScrollText size={13} />
          {logErrorCount > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-rose-500 rounded-full" />}
        </button>
        <span className="w-px h-4 bg-white/10 mx-1" />
        <button onClick={() => window.electron?.minimize()} className="window-button"><Minus size={13} /></button>
        <button onClick={() => window.electron?.maximize()} className="window-button"><Square size={11} /></button>
        <button onClick={() => window.electron?.close()} className="window-button hover:!text-rose-400 hover:!bg-rose-500/10"><X size={14} /></button>
      </div>
    </div>
  )
}

function TopNav({
  children, active, onClick, icon,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`no-drag flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
        active ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {icon}{children}
    </button>
  )
}

function NoticeButton() {
  const notices = useNoticeStore(state => state.notices)
  const lastReadId = useNoticeStore(state => state.lastReadId)
  const openCenter = useNoticeStore(state => state.openCenter)
  const unread = notices.filter(notice => notice.id > lastReadId).length
  return (
    <button onClick={openCenter} className="no-drag relative flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] text-slate-400 hover:text-white hover:bg-white/5">
      <Megaphone size={11} />공지
      {unread > 0 && <span className="min-w-4 h-4 rounded-full bg-rose-500 text-[9px] text-white grid place-items-center px-1">{unread > 9 ? '9+' : unread}</span>}
    </button>
  )
}
