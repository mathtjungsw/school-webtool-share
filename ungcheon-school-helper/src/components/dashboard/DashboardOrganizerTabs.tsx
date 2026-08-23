import { useState, type ReactNode } from 'react'
import { BellRing, ListTodo, StickyNote } from 'lucide-react'
import clsx from 'clsx'

type OrganizerTab = 'shared' | 'personal' | 'memo'

export function DashboardOrganizerTabs({ shared, personal, memo }: { shared: ReactNode; personal: ReactNode; memo: ReactNode }) {
  const [tab, setTab] = useState<OrganizerTab>('shared')
  const tabs: Array<{ id: OrganizerTab; label: string; icon: typeof BellRing }> = [
    { id: 'shared', label: '배부 업무', icon: BellRing },
    { id: 'personal', label: '개인 업무', icon: ListTodo },
    { id: 'memo', label: '개인 메모', icon: StickyNote },
  ]
  return (
    <section className="mt-4" aria-label="업무와 개인 메모">
      <div className="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/70 p-1 dark:border-white/10 dark:bg-surface-900/70" role="tablist">
        {tabs.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black transition-colors',
                tab === item.id
                  ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10',
              )}
            >
              <Icon size={12} />{item.label}
            </button>
          )
        })}
        <span className="ml-auto hidden pr-2 text-[9px] font-semibold text-slate-600 sm:block dark:text-slate-300">필요한 영역만 열어 대시보드 높이를 줄였습니다.</span>
      </div>
      <div role="tabpanel">
        {tab === 'shared' ? shared : tab === 'personal' ? personal : memo}
      </div>
    </section>
  )
}
