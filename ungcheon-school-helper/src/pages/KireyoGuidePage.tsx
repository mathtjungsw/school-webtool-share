import { useEffect, useRef, useState } from 'react'
import { BookOpen, ExternalLink, RefreshCw, AlertCircle, Maximize2, Minimize2 } from 'lucide-react'

export default function KireyoGuidePage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const prevUrl = useRef<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const resourcesPath = await window.electron.getResourcesPath()
      // On Windows, path separator is backslash — normalise to forward slash for file://
      const htmlPath = resourcesPath.replace(/\\/g, '/') + '/student-record-guide.html'
      const bytes: number[] = await window.electron.readFile(htmlPath)
      const blob = new Blob([new Uint8Array(bytes)], { type: 'text/html; charset=utf-8' })
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
      const url = URL.createObjectURL(blob)
      prevUrl.current = url
      setBlobUrl(url)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    return () => {
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`flex flex-col ${fullscreen ? 'fixed inset-0 z-50 bg-surface-900' : 'h-full'}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-surface-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-emerald-400" />
          <span className="font-semibold text-white text-sm">학생부 기재요령 도우미</span>
          <span className="text-xs text-slate-500">— 2026학년도 고등학교 기재요령</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-slate-600 mr-2">
            제작: <span className="text-slate-400">이은덕 선생님 (은평메디텍고 스마트AI과)</span>
          </span>
          <button
            onClick={load}
            disabled={loading}
            title="새로고침"
            className="btn-ghost p-1.5 disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setFullscreen(v => !v)}
            title={fullscreen ? '작게 보기' : '전체 화면'}
            className="btn-ghost p-1.5"
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={() => blobUrl && window.electron.openExternal('file://' + (prevUrl.current ?? ''))}
            title="외부 브라우저에서 열기"
            className="btn-ghost p-1.5"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-900 z-10">
            <RefreshCw size={20} className="animate-spin text-slate-500 mr-2" />
            <span className="text-slate-400 text-sm">기재요령 데이터를 불러오는 중…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900 z-10 p-8">
            <AlertCircle size={32} className="text-red-400 mb-3" />
            <p className="text-red-300 font-medium mb-2">파일 로드 실패</p>
            <p className="text-slate-500 text-sm text-center max-w-md mb-4">{error}</p>
            <button onClick={load} className="btn-primary">다시 시도</button>
          </div>
        )}
        {blobUrl && !loading && (
          <iframe
            ref={iframeRef}
            src={blobUrl}
            title="학생부 기재요령 도우미"
            className="w-full h-full border-0"
            style={{ minHeight: fullscreen ? 'calc(100vh - 48px)' : 'calc(100vh - 128px)' }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
          />
        )}
      </div>
    </div>
  )
}
