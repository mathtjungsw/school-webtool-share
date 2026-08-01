import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import { useNoticeStore } from './stores/noticeStore'
import Layout from './components/Layout'
import UpdateModal from './components/UpdateModal'
import NoticeModal from './components/NoticeModal'
import { clearSchoolHubSessionCache, preloadSchoolHubCache } from './services/schoolHub'

export default function App() {
  const { loadConfig, setUpdateAvailable, setUpdateDownloaded, setUpdateNone, setUpdateError, config } = useAppStore()
  const fetchNotices = useNoticeStore(s => s.fetchNotices)

  useEffect(() => {
    void (async () => {
      await loadConfig()
      const loadedConfig = useAppStore.getState().config
      if (loadedConfig.schoolHubUrl) void preloadSchoolHubCache(loadedConfig.teacherName ?? '')
      await fetchNotices()   // 설정 로드 후 공지 자동 확인 → 새 공지 있으면 팝업
    })()
    if (!window.electron) return
    const clearSessionCache = () => clearSchoolHubSessionCache()
    window.addEventListener('beforeunload', clearSessionCache)
    const unsub1 = window.electron.onUpdateAvailable(() => setUpdateAvailable())
    const unsub2 = window.electron.onUpdateDownloaded(() => setUpdateDownloaded())
    const unsub3 = window.electron.onUpdateNone(() => setUpdateNone())
    const unsub4 = window.electron.onUpdateError((msg) => setUpdateError(msg))
    return () => {
      window.removeEventListener('beforeunload', clearSessionCache)
      unsub1(); unsub2(); unsub3(); unsub4()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 시간 기반 자동 테마: 오전 6시~오후 6시 라이트, 나머지(저녁·새벽) 다크
  useEffect(() => {
    const apply = () => {
      const pref = config.theme ?? 'auto'
      const h = new Date().getHours()
      const resolved = pref === 'auto'
        ? (h >= 6 && h < 18 ? 'light' : 'dark')
        : pref
      document.documentElement.setAttribute('data-theme', resolved)
    }
    apply()
    const t = setInterval(apply, 60_000)
    return () => clearInterval(t)
  }, [config.theme])

  return (
    <>
      <Layout />
      <UpdateModal />
      <NoticeModal />
    </>
  )
}
