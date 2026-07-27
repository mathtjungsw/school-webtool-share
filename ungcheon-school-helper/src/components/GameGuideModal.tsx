import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import clsx from 'clsx'

export interface GuideTab {
  id: string
  label: string
  content: ReactNode
}

// 게임 공통 "완벽 가이드" 모달 — 탭 구조 (스트림스 마스터 게임 방법과 동일한 형태)
export default function GameGuideModal({
  open, onClose, title, tabs,
}: {
  open: boolean
  onClose: () => void
  title: string
  tabs: GuideTab[]
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')
  const current = tabs.find((t) => t.id === active) ?? tabs[0]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-h-[88vh] overflow-y-auto rounded-t-2xl border border-white/10 bg-surface-800 p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* 탭 버튼 */}
            <div className="mb-4 flex gap-1.5 rounded-xl bg-white/5 p-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={clsx(
                    'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
                    current?.id === t.id
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                      : 'text-slate-400 hover:text-white',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* 콘텐츠 */}
            <motion.div
              key={current?.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-3 text-sm leading-relaxed text-slate-300"
            >
              {current?.content}
            </motion.div>

            <button onClick={onClose} className="btn-primary mt-5 w-full py-2.5">
              이해했습니다!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// 가이드 본문에서 재사용하는 단계 표시 행
export function GuideStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">
        {n}
      </div>
      <div className="flex-1 pt-0.5">{children}</div>
    </div>
  )
}

// 가이드 본문에서 재사용하는 강조 박스
export function GuideCard({ title, color = 'indigo', children }: { title?: string; color?: 'indigo' | 'amber' | 'emerald' | 'rose'; children: ReactNode }) {
  const cls: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-200',
    amber: 'bg-amber-500/10 text-amber-200',
    emerald: 'bg-emerald-500/10 text-emerald-200',
    rose: 'bg-rose-500/10 text-rose-200',
  }
  return (
    <div className={clsx('rounded-xl p-3.5', cls[color])}>
      {title && <p className="mb-1.5 text-sm font-bold">{title}</p>}
      <div className="text-xs leading-relaxed opacity-90">{children}</div>
    </div>
  )
}
