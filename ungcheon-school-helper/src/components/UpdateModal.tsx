import { Download, RefreshCw, X, Sparkles } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

export default function UpdateModal() {
  const updateAvailable = useAppStore(s => s.updateAvailable)
  const updateDownloaded = useAppStore(s => s.updateDownloaded)
  const updateDismissed = useAppStore(s => s.updateDismissed)
  const dismissUpdate = useAppStore(s => s.dismissUpdate)

  const showDownloading = updateAvailable && !updateDownloaded && !updateDismissed
  const showReady = updateDownloaded && !updateDismissed

  if (!showDownloading && !showReady) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal card */}
      <div className="relative w-[360px] bg-surface-950 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4">

        {/* 닫기 버튼 (다운로드 완료 시에만) */}
        {showReady && (
          <button
            onClick={dismissUpdate}
            className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={14} />
          </button>
        )}

        {/* 아이콘 */}
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
          showReady
            ? 'bg-emerald-500/20 border border-emerald-500/30'
            : 'bg-sky-500/20 border border-sky-500/30'
        }`}>
          {showReady
            ? <Sparkles size={26} className="text-emerald-400" />
            : <Download size={26} className="text-sky-400 animate-bounce" />
          }
        </div>

        {/* 텍스트 */}
        <div className="text-center space-y-1.5">
          <h2 className="text-base font-bold text-white">
            {showReady ? '업데이트 준비 완료' : '새 버전 다운로드 중'}
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            {showReady
              ? '새 버전이 다운로드되었습니다.\n지금 재시작하여 업데이트를 적용하시겠습니까?'
              : '백그라운드에서 새 버전을 다운로드하고 있습니다.\n완료되면 다시 알려드립니다.'}
          </p>
        </div>

        {/* 버튼 */}
        {showReady ? (
          <div className="flex gap-2 w-full pt-1">
            <button
              onClick={dismissUpdate}
              className="flex-1 py-2 rounded-xl text-sm text-slate-400 bg-white/5 hover:bg-white/10 transition-colors border border-white/5"
            >
              나중에
            </button>
            <button
              onClick={() => window.electron?.installUpdate()}
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-400 transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={13} />
              지금 설치
            </button>
          </div>
        ) : (
          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full animate-pulse w-2/3" />
          </div>
        )}
      </div>
    </div>
  )
}
