import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from './stores/appStore'
import { useNoticeStore } from './stores/noticeStore'
import Layout from './components/Layout'
import UpdateStatus from './components/UpdateStatus'
import NoticeModal from './components/NoticeModal'
import { clearSchoolHubSessionCache, preloadSchoolHubCache, startSchoolHubBackgroundSync } from './services/schoolHub'
import { useAuthStore } from './stores/authStore'
import PilotLogin from './components/PilotLogin'
import { startNeisSyncScheduler } from './services/sharedNeis'

export default function App() {
  const { loadConfig, setUpdateAvailable, setUpdateDownloaded, setUpdateNone, setUpdateError, config } = useAppStore()
  const fetchNotices = useNoticeStore(s => s.fetchNotices)
  const authReady = useAuthStore(state => state.ready)
  const authenticated = useAuthStore(state => state.authenticated)
  const executiveExpiresAt = useAuthStore(state => state.executiveExpiresAt)
  const lockExecutive = useAuthStore(state => state.lockExecutive)
  const bootstrapAuth = useAuthStore(state => state.bootstrap)

  useEffect(() => {
    void (async () => {
      await loadConfig()
      const loadedConfig = useAppStore.getState().config
      await bootstrapAuth()
      if (loadedConfig.schoolHubUrl && useAuthStore.getState().authenticated) {
        void preloadSchoolHubCache(useAuthStore.getState().teacherName)
      }
      if (useAuthStore.getState().authenticated) await fetchNotices()   // 설정 로드 후 공지 자동 확인 → 새 공지 있으면 팝업
    })()
    if (!window.electron) return
    const clearSessionCache = () => clearSchoolHubSessionCache()
    window.addEventListener('beforeunload', clearSessionCache)
    const offAuth = window.electron.onAuthChanged(() => void bootstrapAuth())
    const unsub1 = window.electron.onUpdateAvailable(() => setUpdateAvailable())
    const unsub2 = window.electron.onUpdateDownloaded(() => setUpdateDownloaded())
    const unsub3 = window.electron.onUpdateNone(() => setUpdateNone())
    const unsub4 = window.electron.onUpdateError((msg) => setUpdateError(msg))
    return () => {
      window.removeEventListener('beforeunload', clearSessionCache)
      offAuth(); unsub1(); unsub2(); unsub3(); unsub4()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 웅천고 업무도우미는 밝은 모드만 제공한다.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = 'light'
  }, [])

  useEffect(() => {
    if (!authenticated) return
    const remaining = Date.parse(useAuthStore.getState().expiresAt) - Date.now()
    if (remaining <= 0) {
      void useAuthStore.getState().logout()
      return
    }
    const timer = window.setTimeout(() => void useAuthStore.getState().logout(), remaining)
    return () => window.clearTimeout(timer)
  }, [authenticated])

  useEffect(() => {
    if (!authenticated || !executiveExpiresAt) return
    const remaining = Date.parse(executiveExpiresAt) - Date.now()
    if (remaining <= 0) { lockExecutive(); return }
    const timer = window.setTimeout(lockExecutive, remaining)
    return () => window.clearTimeout(timer)
  }, [authenticated, executiveExpiresAt, lockExecutive])

  useEffect(() => {
    if (!authenticated || !config.schoolHubUrl) return
    return startNeisSyncScheduler(() => useAppStore.getState().config)
  }, [authenticated, config.schoolHubUrl, config.neisApiKey])

  useEffect(() => {
    if (!authenticated || !config.schoolHubUrl) return
    return startSchoolHubBackgroundSync(useAuthStore.getState().teacherName)
  }, [authenticated, config.schoolHubUrl])

  const ready = useAppStore.getState().isConfigLoaded && authReady
  if (!ready || !authenticated) {
    return (
      <div className="flex h-screen flex-col bg-surface-950">
        <header className="app-titlebar drag-region flex h-10 shrink-0 items-center justify-end border-b px-2">
          <button
            type="button"
            title="프로그램 종료"
            className="no-drag inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-rose-100 hover:text-rose-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-700"
            onClick={() => window.electron.quit()}
          >
            <X size={16} aria-hidden="true" /> 종료
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {ready ? <><UpdateStatus /><PilotLogin /></> : (
            <div className="grid flex-1 place-items-center text-sm text-slate-400">시작 준비 중...</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <Layout />
      <div className="fixed top-9 right-4 z-[95] max-w-xl"><UpdateStatus /></div>
      <NoticeModal />
    </>
  )
}
