import type { ReactNode } from 'react'
import type { FutureOperationsState } from './types'

export interface FutureTabProps {
  state: FutureOperationsState
  saving: boolean
  update: (updater: (current: FutureOperationsState) => FutureOperationsState) => Promise<void>
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`field-label ${className}`}>{label}<div className="mt-1.5">{children}</div></label>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-black/10 dark:border-white/10 px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">{children}</div>
}

export function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-3 mb-4">
    <div><h2 className="font-black text-slate-950 dark:text-white">{title}</h2><p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{description}</p></div>
    {action && <div className="ml-auto">{action}</div>}
  </div>
}

export const splitNames = (value: string): string[] => Array.from(new Set(value.split(/[\n,]/).map(name => name.trim()).filter(Boolean)))
