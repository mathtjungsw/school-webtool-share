import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpRight, BellRing, BookOpenCheck, CalendarDays, ClipboardCheck } from 'lucide-react'
import clsx from 'clsx'

export type TodayBriefingKind = 'schedule' | 'task' | 'system'

export interface TodayBriefingItem {
  id: string
  kind: TodayBriefingKind
  title: string
  detail?: string
  page?: string
  urgent?: boolean
}

interface TodayBriefingWidgetProps {
  classSummary: string
  items: TodayBriefingItem[]
  onNavigate: (page: string) => void
}

const TABS: Array<{ id: 'all' | TodayBriefingKind; label: string }> = [
  { id: 'all', label: '한눈에' },
  { id: 'schedule', label: '오늘 일정' },
  { id: 'task', label: '마감 업무' },
  { id: 'system', label: '확인 필요' },
]

const KIND_STYLE: Record<TodayBriefingKind, { icon: typeof CalendarDays; badge: string; label: string }> = {
  schedule: { icon: CalendarDays, badge: 'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100', label: '일정' },
  task: { icon: ClipboardCheck, badge: 'bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100', label: '업무' },
  system: { icon: AlertTriangle, badge: 'bg-rose-100 text-rose-950 dark:bg-rose-500/20 dark:text-rose-100', label: '점검' },
}

export function TodayBriefingWidget({ classSummary, items, onNavigate }: TodayBriefingWidgetProps) {
  const [tab, setTab] = useState<'all' | TodayBriefingKind>('all')
  const counts = useMemo(() => ({
    schedule: items.filter(item => item.kind === 'schedule').length,
    task: items.filter(item => item.kind === 'task').length,
    system: items.filter(item => item.kind === 'system').length,
  }), [items])
  const visible = useMemo(
    () => (tab === 'all' ? items : items.filter(item => item.kind === tab)).slice(0, tab === 'all' ? 6 : 10),
    [items, tab],
  )

  return (
    <section className="card mb-4 overflow-hidden border-sky-300/60 bg-white/85 p-0 dark:border-sky-500/20 dark:bg-surface-900/85" aria-label="오늘 브리핑">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-white/10">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100">
            <BellRing size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950 dark:text-white">오늘 브리핑</p>
            <p className="truncate text-[10px] font-bold text-slate-700 dark:text-slate-200">{classSummary}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[10px] font-black">
          <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100">일정 {counts.schedule}</span>
          <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100">업무 {counts.task}</span>
          {counts.system > 0 && <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-950 dark:bg-rose-500/20 dark:text-rose-100">점검 {counts.system}</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 px-3 py-1.5 dark:border-white/10" role="tablist" aria-label="오늘 브리핑 분류">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={clsx(
              'rounded-lg px-2.5 py-1 text-[10px] font-black transition-colors',
              tab === item.id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-3 dark:bg-white/10">
          {visible.map(item => {
            const style = KIND_STYLE[item.kind]
            const Icon = style.icon
            const content = (
              <>
                <span className={clsx('flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-black', style.badge)}>
                  <Icon size={10} />{style.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={clsx('block truncate text-[11px] font-black', item.urgent ? 'text-rose-800 dark:text-rose-200' : 'text-slate-950 dark:text-white')}>{item.title}</span>
                  {item.detail && <span className="block truncate text-[9px] font-semibold text-slate-600 dark:text-slate-300">{item.detail}</span>}
                </span>
                {item.page && <ArrowUpRight size={12} className="shrink-0 text-slate-500 dark:text-slate-300" />}
              </>
            )
            return item.page ? (
              <button key={item.id} type="button" onClick={() => onNavigate(item.page!)} className="flex min-h-12 items-center gap-2 bg-white px-3 py-2 text-left hover:bg-slate-50 dark:bg-surface-900 dark:hover:bg-white/5">
                {content}
              </button>
            ) : (
              <div key={item.id} className="flex min-h-12 items-center gap-2 bg-white px-3 py-2 dark:bg-surface-900">{content}</div>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 px-4 py-5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <BookOpenCheck size={15} className="text-emerald-700 dark:text-emerald-300" />현재 분류에서 확인할 내용이 없습니다.
        </div>
      )}
    </section>
  )
}
