import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollText, X, Trash2, Download, ChevronDown, Copy, Check as CheckIcon } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../stores/appStore'
import type { LogEntry } from '../types'

type Filter = 'all' | 'error' | 'warn' | 'info'

const LEVEL_STYLE: Record<LogEntry['level'], string> = {
  error: 'text-red-400 bg-red-500/10 border-red-500/20',
  warn:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  info:  'text-slate-400 bg-white/5 border-white/10',
}

const LEVEL_DOT: Record<LogEntry['level'], string> = {
  error: 'bg-red-400',
  warn:  'bg-amber-400',
  info:  'bg-slate-500',
}

export default function LogPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const logs = useAppStore(s => s.logs)
  const clearLogs = useAppStore(s => s.clearLogs)
  const [filter, setFilter] = useState<Filter>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter)

  useEffect(() => {
    if (autoScroll && open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, open, autoScroll])

  const handleExport = () => {
    const text = logs
      .map(l => `[${l.time}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`)
      .join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `app-log-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const errorCount = logs.filter(l => l.level === 'error').length
  const warnCount  = logs.filter(l => l.level === 'warn').length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 280 }}
          animate={{ y: 0 }}
          exit={{ y: 280 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-0 left-0 right-0 h-64 bg-surface-950 border-t border-white/10 flex flex-col z-40 shadow-2xl"
        >
          {/* 헤더 */}
          <div className="flex items-center gap-3 px-3 py-2 border-b border-white/5 flex-shrink-0">
            <ScrollText size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-300">앱 로그</span>

            {/* 카운트 요약 */}
            <div className="flex items-center gap-1.5 ml-1">
              {errorCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/20">
                  오류 {errorCount}
                </span>
              )}
              {warnCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  경고 {warnCount}
                </span>
              )}
              {logs.length === 0 && (
                <span className="text-[10px] text-slate-600">로그 없음</span>
              )}
            </div>

            {/* 필터 */}
            <div className="flex items-center gap-1 ml-auto">
              {(['all', 'error', 'warn', 'info'] as Filter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={clsx(
                    'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                    filter === f
                      ? f === 'error' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : f === 'warn' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        : f === 'info' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                        : 'bg-white/10 text-slate-200 border-white/15'
                      : 'text-slate-500 border-white/5 hover:text-slate-300 hover:border-white/10'
                  )}
                >
                  {f === 'all' ? '전체' : f === 'error' ? '오류' : f === 'warn' ? '경고' : '정보'}
                </button>
              ))}
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setAutoScroll(v => !v)}
                title={autoScroll ? '자동 스크롤 켜짐' : '자동 스크롤 꺼짐'}
                className={clsx(
                  'p-1 rounded transition-colors',
                  autoScroll ? 'text-violet-400 hover:text-violet-300' : 'text-slate-600 hover:text-slate-400'
                )}
              >
                <ChevronDown size={13} />
              </button>
              <button
                onClick={handleExport}
                disabled={logs.length === 0}
                title="로그 내보내기"
                className="p-1 rounded text-slate-600 hover:text-slate-300 transition-colors disabled:opacity-30"
              >
                <Download size={13} />
              </button>
              <button
                onClick={clearLogs}
                disabled={logs.length === 0}
                title="로그 지우기"
                className="p-1 rounded text-slate-600 hover:text-red-400 transition-colors disabled:opacity-30"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded text-slate-600 hover:text-slate-300 transition-colors ml-0.5"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* 로그 목록 */}
          <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5 font-mono scrollbar-none">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-600 px-2 py-4 text-center">
                {filter === 'all' ? '기록된 로그가 없습니다.' : `${filter} 레벨 로그가 없습니다.`}
              </p>
            ) : (
              filtered.map(entry => (
                <LogRow key={entry.id} entry={entry} />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const long = entry.message.length > 120

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = `[${entry.time}] [${entry.level.toUpperCase()}]${entry.source ? ` [${entry.source}]` : ''} ${entry.message}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="group relative flex items-start gap-2 px-2 py-1 rounded-lg text-[11px] leading-relaxed hover:bg-white/3 transition-colors">
      <span className="text-slate-600 flex-shrink-0 tabular-nums mt-px select-none">{entry.time}</span>
      <span className={clsx(
        'flex-shrink-0 px-1.5 py-px rounded border text-[9px] font-bold uppercase mt-px select-none',
        LEVEL_STYLE[entry.level]
      )}>
        {entry.level === 'error' ? '오류' : entry.level === 'warn' ? '경고' : '정보'}
      </span>
      {entry.source && (
        <span className="text-slate-600 flex-shrink-0 mt-px truncate max-w-[80px] select-none">[{entry.source}]</span>
      )}
      <span
        className={clsx(
          'flex-1 break-all font-mono',
          entry.level === 'error' ? 'text-red-300'
            : entry.level === 'warn' ? 'text-amber-300'
            : 'text-slate-400',
          !expanded && long && 'line-clamp-2'
        )}
        style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}
      >
        {entry.message}
      </span>
      <div className="flex-shrink-0 flex items-center gap-1 mt-px">
        {long && (
          <button
            onClick={() => setExpanded(v => !v)}
            title={expanded ? '접기' : '펼치기'}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10"
          >
            <div className={clsx('w-1.5 h-1.5 rounded-full', LEVEL_DOT[entry.level])} />
          </button>
        )}
        <button
          onClick={handleCopy}
          title="클립보드에 복사"
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300"
        >
          {copied
            ? <CheckIcon size={11} className="text-emerald-400" />
            : <Copy size={11} />
          }
        </button>
      </div>
    </div>
  )
}
