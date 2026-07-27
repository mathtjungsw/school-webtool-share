import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileDown, FolderOpen, Trash2, Play, X, CheckCircle2, AlertCircle, FileText, Loader2, AlertTriangle, ScanText, ExternalLink, Copy, Check } from 'lucide-react'
import clsx from 'clsx'

interface PdfFile {
  id: string
  path: string
  name: string
  status: 'pending' | 'processing' | 'done' | 'error'
  charCount?: number
  error?: string
  scanned?: boolean
  ocr?: boolean
}

interface OcrTools { hybrid: boolean; tesseract: boolean }

type OutputFormat = 'txt' | 'md' | 'json'

// 화면 형식 → 엔진 형식
const ENGINE_FORMAT: Record<OutputFormat, 'text' | 'markdown' | 'json'> = {
  txt: 'text',
  md: 'markdown',
  json: 'json',
}

// 복사 버튼
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="flex-shrink-0 text-slate-400 hover:text-white"
      title="명령어 복사"
    >
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  )
}

// 스캔본 OCR 설치 안내 패널
function OcrInstallGuide({ tools, onClose }: { tools: OcrTools | null; onClose: () => void }) {
  const open = (url: string) => window.electron?.openExternal(url)
  const linkCls = 'text-sky-400 hover:text-sky-300 underline inline-flex items-center gap-1'
  return (
    <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanText size={16} className="text-sky-400" />
          <span className="font-semibold text-white text-sm">스캔본 PDF OCR 설정 방법</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        스캔본(이미지) PDF는 텍스트 레이어가 없어 OCR이 필요합니다. 아래 도구를 설치하면 스캔본도 자동으로 인식합니다.
        무거운 OCR 엔진은 앱에 포함되지 않으며, 설치형으로 동작합니다.
      </p>
      <ol className="mt-3 space-y-2 text-xs text-slate-300">
        <li className="flex gap-2">
          <span className="text-slate-500 flex-shrink-0">1.</span>
          <span>
            <b>Java 11+</b> 설치 (텍스트 추출에도 필요) —{' '}
            <button onClick={() => open('https://adoptium.net')} className={linkCls}>
              adoptium.net <ExternalLink size={10} />
            </button>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-slate-500 flex-shrink-0">2.</span>
          <span>
            <b>Python 3.x</b> 설치 —{' '}
            <button onClick={() => open('https://www.python.org/downloads/')} className={linkCls}>
              python.org <ExternalLink size={10} />
            </button>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-slate-500 flex-shrink-0">3.</span>
          <span className="flex-1">
            <b>OCR 엔진 설치</b> — 명령 프롬프트에서 실행 (첫 추출 시 인식 모델 자동 다운로드 · 인터넷 필요):
            <span className="mt-1 flex items-center gap-2 rounded-lg bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300">
              <span className="flex-1 select-all">pip install "opendataloader-pdf[hybrid]"</span>
              <CopyButton text='pip install "opendataloader-pdf[hybrid]"' />
            </span>
            {tools?.hybrid && <span className="mt-1 block text-emerald-400">✓ 이미 설치됨 — 스캔본이 자동 OCR 처리됩니다</span>}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-slate-500 flex-shrink-0">4.</span>
          <span>
            <span className="text-slate-400">(선택)</span> 다국어용 <b>Tesseract</b> —{' '}
            <button onClick={() => open('https://github.com/UB-Mannheim/tesseract/wiki')} className={linkCls}>
              UB-Mannheim <ExternalLink size={10} />
            </button>
            {tools?.tesseract && <span className="ml-1 text-emerald-400">✓ 설치됨</span>}
          </span>
        </li>
      </ol>
      <p className="text-[11px] text-slate-500 mt-3">설치 후 앱을 다시 시작하면 적용됩니다.</p>
    </div>
  )
}

export default function PdfExtractorPage() {
  const [files, setFiles] = useState<PdfFile[]>([])
  const [format, setFormat] = useState<OutputFormat>('txt')
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [javaOk, setJavaOk] = useState<boolean | null>(null)
  const [ocrTools, setOcrTools] = useState<OcrTools | null>(null)
  const [showOcrGuide, setShowOcrGuide] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Java / OCR 도구 설치 확인
  useEffect(() => {
    window.electron?.checkJava().then(setJavaOk).catch(() => setJavaOk(false))
    window.electron?.checkOcrTools().then(setOcrTools).catch(() => setOcrTools({ hybrid: false, tesseract: false }))
  }, [])

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg])
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 50)
  }

  const handleSelectFiles = async () => {
    const paths = await window.electron?.openFilesDialog([{ name: 'PDF 파일', extensions: ['pdf'] }])
    if (!paths || paths.length === 0) return
    const newFiles: PdfFile[] = paths
      .filter(p => !files.some(f => f.path === p))
      .map(p => ({
        id: crypto.randomUUID(),
        path: p,
        name: p.split(/[/\\]/).pop() ?? p,
        status: 'pending',
      }))
    setFiles(prev => [...prev, ...newFiles])
  }

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id))
  const clearAll = () => { setFiles([]); setLogs([]) }

  const handleExtract = async () => {
    const pending = files.filter(f => f.status === 'pending' || f.status === 'error')
    if (pending.length === 0) return

    setIsRunning(true)
    addLog(`추출 시작 — ${pending.length}개 파일, 형식: .${format}`)

    const outputFiles: { name: string; bytes: number[] }[] = []

    for (const file of pending) {
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'processing' } : f))
      addLog(`처리 중: ${file.name}`)

      try {
        const result = await window.electron?.extractDocument(file.path, ENGINE_FORMAT[format])
        if (!result?.success) {
          if (result?.error === 'NO_JAVA') throw new Error('Java가 설치되어 있지 않습니다')
          throw new Error(result?.error || 'IPC 오류')
        }

        const content = result.content ?? ''
        const outName = file.name.replace(/\.pdf$/i, `.${format}`)

        if (result.empty && !result.usedOcr) {
          // 스캔본인데 OCR 미사용 — 빈 파일 저장하지 않고 안내
          setFiles(prev => prev.map(f =>
            f.id === file.id ? { ...f, status: 'done', charCount: 0, scanned: true } : f
          ))
          addLog(`⚠️ ${file.name} — 스캔본(이미지) PDF, 텍스트 레이어 없음 → OCR 필요`)
          if (!result.ocrAvailable) setShowOcrGuide(true)
        } else {
          const bytes = Array.from(new TextEncoder().encode(content))
          outputFiles.push({ name: outName, bytes })
          setFiles(prev => prev.map(f =>
            f.id === file.id ? { ...f, status: 'done', charCount: content.length, scanned: false, ocr: result.usedOcr } : f
          ))
          if (result.usedOcr) {
            addLog(`🔤 ${file.name} → ${outName} — OCR로 추출 (${content.length.toLocaleString()}자)`)
          } else {
            addLog(`✅ ${file.name} → ${outName} (${content.length.toLocaleString()}자)`)
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error', error: msg } : f))
        addLog(`❌ ${file.name}: ${msg}`)
      }
    }

    if (outputFiles.length > 0) {
      const saved = await window.electron?.saveFilesToDir(outputFiles)
      if (saved && saved > 0) {
        addLog(`💾 ${outputFiles.length}개 파일 저장 완료`)
      } else if (saved === 0) {
        addLog('저장 취소됨')
      }
    }

    addLog(`완료: ${outputFiles.length}/${pending.length}개 처리됨`)
    setIsRunning(false)
  }

  const doneCount = files.filter(f => f.status === 'done').length
  const errorCount = files.filter(f => f.status === 'error').length
  const pendingCount = files.filter(f => f.status === 'pending').length

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">PDF 텍스트 추출기</h1>
          <p className="page-subtitle">여러 PDF에서 텍스트를 정밀 추출하여 파일로 저장합니다 · opendataloader-pdf 엔진</p>
        </div>
        <button
          onClick={() => setShowOcrGuide(v => !v)}
          className={clsx(
            'btn-ghost flex items-center gap-1.5 text-xs mt-1 flex-shrink-0',
            ocrTools?.hybrid ? 'text-emerald-400' : 'text-slate-400',
          )}
          title="스캔본 PDF OCR 설정"
        >
          <ScanText size={13} />
          {ocrTools?.hybrid ? '스캔본 OCR 사용 가능' : '스캔본 OCR 설정'}
        </button>
      </div>

      {/* 스캔본 OCR 설치 안내 */}
      {showOcrGuide && <OcrInstallGuide tools={ocrTools} onClose={() => setShowOcrGuide(false)} />}

      {/* Java 미설치 경고 */}
      {javaOk === false && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
          <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="text-amber-300 font-semibold">Java가 설치되어 있지 않습니다</p>
            <p className="text-amber-300/80">PDF 추출 엔진은 Java 11 이상이 필요합니다. 아래에서 설치 후 앱을 다시 시작하세요.</p>
            <button
              onClick={() => window.electron?.openExternal('https://adoptium.net')}
              className="text-sky-400 hover:text-sky-300 underline"
            >
              https://adoptium.net 에서 Java 설치
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* 파일 선택 + 형식 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="text-violet-400" />
              <span className="font-semibold text-white text-sm">PDF 파일 선택</span>
              {files.length > 0 && (
                <span className="text-xs text-slate-500 ml-1">
                  {files.length}개 선택됨
                  {doneCount > 0 && <span className="text-emerald-400 ml-1">· {doneCount}개 완료</span>}
                  {errorCount > 0 && <span className="text-red-400 ml-1">· {errorCount}개 오류</span>}
                </span>
              )}
            </div>
            {files.length > 0 && (
              <button onClick={clearAll} className="btn-ghost text-xs flex items-center gap-1 text-slate-500">
                <Trash2 size={12} />전체 삭제
              </button>
            )}
          </div>

          <button
            onClick={handleSelectFiles}
            disabled={isRunning}
            className="w-full border-2 border-dashed border-white/10 hover:border-violet-500/30 rounded-xl py-6 text-slate-400 hover:text-slate-200 transition-all disabled:opacity-40 flex flex-col items-center gap-2"
          >
            <FileDown size={22} className="opacity-60" />
            <span className="text-sm">클릭하여 PDF 파일 선택</span>
            <span className="text-xs text-slate-600">여러 파일 동시 선택 가능</span>
          </button>

          {/* 파일 목록 */}
          <AnimatePresence>
            {files.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 space-y-1.5 max-h-52 overflow-y-auto scrollbar-none"
              >
                {files.map(f => (
                  <div
                    key={f.id}
                    className={clsx(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs border',
                      f.status === 'done' && !f.scanned && 'bg-emerald-500/5 border-emerald-500/15',
                      f.status === 'done' && f.scanned && 'bg-amber-500/5 border-amber-500/15',
                      f.status === 'error' && 'bg-red-500/5 border-red-500/15',
                      f.status === 'processing' && 'bg-violet-500/5 border-violet-500/15',
                      f.status === 'pending' && 'bg-white/3 border-white/5',
                    )}
                  >
                    {f.status === 'pending' && <FileText size={13} className="text-slate-500 flex-shrink-0" />}
                    {f.status === 'processing' && <Loader2 size={13} className="text-violet-400 animate-spin flex-shrink-0" />}
                    {f.status === 'done' && !f.scanned && <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />}
                    {f.status === 'done' && f.scanned && <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />}
                    {f.status === 'error' && <AlertCircle size={13} className="text-red-400 flex-shrink-0" />}
                    <span className={clsx(
                      'flex-1 truncate',
                      f.status === 'done' && !f.scanned && 'text-emerald-300',
                      f.status === 'done' && f.scanned && 'text-amber-300',
                      f.status === 'error' && 'text-red-300',
                      f.status === 'processing' && 'text-violet-300',
                      f.status === 'pending' && 'text-slate-300',
                    )}>
                      {f.name}
                    </span>
                    {f.status === 'done' && f.scanned && (
                      <span className="text-amber-600 flex-shrink-0">스캔본 · OCR 필요</span>
                    )}
                    {f.status === 'done' && !f.scanned && f.charCount !== undefined && (
                      <span className="flex items-center gap-1 flex-shrink-0">
                        {f.ocr && <span className="px-1 rounded bg-sky-500/20 text-sky-300 text-[10px]">OCR</span>}
                        <span className="text-emerald-600">{f.charCount.toLocaleString()}자</span>
                      </span>
                    )}
                    {f.status === 'error' && f.error && (
                      <span className="text-red-600 truncate max-w-[120px] flex-shrink-0" title={f.error}>{f.error}</span>
                    )}
                    {!isRunning && f.status !== 'processing' && (
                      <button onClick={() => removeFile(f.id)} className="text-slate-600 hover:text-slate-400 flex-shrink-0">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 출력 형식 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} className="text-sky-400" />
            <span className="font-semibold text-white text-sm">출력 형식</span>
          </div>
          <div className="flex gap-2">
            {([
              { value: 'txt',  label: '텍스트 (.txt)',   desc: '줄바꿈 보존 순수 텍스트' },
              { value: 'md',   label: '마크다운 (.md)',  desc: '제목·표 등 서식 유지' },
              { value: 'json', label: 'JSON (.json)',     desc: '구조화 데이터 (좌표·블록)' },
            ] as { value: OutputFormat; label: string; desc: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                disabled={isRunning}
                className={clsx(
                  'flex-1 px-3 py-3 rounded-xl border text-left transition-all disabled:opacity-40',
                  format === opt.value
                    ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                    : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/5'
                )}
              >
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className="text-[10px] mt-0.5 opacity-60">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 실행 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={handleExtract}
            disabled={isRunning || (pendingCount === 0 && errorCount === 0) || javaOk === false}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isRunning
              ? <><Loader2 size={14} className="animate-spin" />추출 중...</>
              : <><Play size={14} />텍스트 추출 시작</>}
          </button>
        </div>

        {/* 로그 */}
        {logs.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">로그</span>
              <button onClick={() => setLogs([])} className="btn-ghost text-xs">초기화</button>
            </div>
            <div
              ref={logRef}
              className="space-y-1 max-h-48 overflow-y-auto scrollbar-none font-mono"
            >
              {logs.map((l, i) => (
                <p key={i} className={clsx(
                  'text-xs',
                  l.startsWith('✅') && 'text-emerald-400',
                  l.startsWith('❌') && 'text-red-400',
                  l.startsWith('⚠️') && 'text-amber-400',
                  l.startsWith('💾') && 'text-sky-400',
                  !l.startsWith('✅') && !l.startsWith('❌') && !l.startsWith('⚠️') && !l.startsWith('💾') && 'text-slate-400',
                )}>
                  {l}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
