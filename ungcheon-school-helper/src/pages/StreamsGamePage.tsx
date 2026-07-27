import { useEffect, useRef, useState } from 'react'
import { Waves, RefreshCw, AlertCircle, Maximize2, Minimize2 } from 'lucide-react'

export default function StreamsGamePage() {
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
      const base = resourcesPath.replace(/\\/g, '/')

      const [htmlBytes, cssBytes, jsBytes] = await Promise.all([
        window.electron.readFile(base + '/streams/index.html'),
        window.electron.readFile(base + '/streams/style.css'),
        window.electron.readFile(base + '/streams/game.js'),
      ])

      const dec = new TextDecoder('utf-8')
      let html = dec.decode(new Uint8Array(htmlBytes))
      const css = dec.decode(new Uint8Array(cssBytes))
      const js = dec.decode(new Uint8Array(jsBytes))

      html = html.replace(
        '<link rel="stylesheet" href="style.css" />',
        `<style>${css}</style>`
      )
      html = html.replace(
        '<script src="game.js"></script>',
        `<script>${js}</script>`
      )

      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
      const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
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
    return () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`flex flex-col ${fullscreen ? 'fixed inset-0 z-50 bg-surface-900' : 'h-full'}`}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-surface-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Waves size={16} className="text-indigo-400" />
          <span className="font-semibold text-white text-sm">스트림스 마스터</span>
          <span className="text-xs text-slate-500">— 오름차순 숫자 전략 게임</span>
        </div>
        <div className="flex items-center gap-1">
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
        </div>
      </div>

      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-900 z-10">
            <RefreshCw size={20} className="animate-spin text-slate-500 mr-2" />
            <span className="text-slate-400 text-sm">게임을 불러오는 중…</span>
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
            title="스트림스 마스터"
            className="w-full h-full border-0"
            style={{ minHeight: fullscreen ? 'calc(100vh - 48px)' : 'calc(100vh - 128px)' }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
          />
        )}
      </div>
    </div>
  )
}
