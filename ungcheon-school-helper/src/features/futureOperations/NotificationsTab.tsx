import { useEffect, useMemo, useState } from 'react'
import { Bell, Check, Clock3, RefreshCw } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { loadHubNotifications } from './hubNotifications'
import { localOperationalNotifications, notificationCounts } from './model'
import type { NotificationCategory, OperationsNotification } from './types'
import { EmptyState, SectionHeader, type FutureTabProps } from './ui'

const categoryLabel: Record<NotificationCategory, string> = { action: '처리 필요', reference: '참고', done: '완료' }

export default function NotificationsTab({ state, saving, update }: FutureTabProps) {
  const viewerName = useAuthStore(value => value.teacherName)
  const [filter, setFilter] = useState<NotificationCategory>('action')
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const localItems = useMemo(() => localOperationalNotifications(state), [state])
  const allItems = useMemo(() => {
    const generatedIds = new Set(localItems.map(item => item.id))
    const now = new Date().toISOString()
    return [...localItems, ...state.notifications.filter(item => item.id.startsWith('hub-') && !generatedIds.has(item.id) && (!item.snoozedUntil || item.snoozedUntil <= now))]
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || b.createdAt.localeCompare(a.createdAt))
  }, [localItems, state.notifications])
  const counts = notificationCounts(allItems)
  const visible = allItems.filter(item => item.category === filter)

  const refresh = async () => {
    setRefreshing(true); setMessage('')
    try {
      const loaded = await loadHubNotifications(viewerName, true)
      await update(current => {
        const old = new Map(current.notifications.map(item => [item.id, item]))
        const hubItems = loaded.map(item => ({
          ...item,
          readAt: old.get(item.id)?.readAt ?? '',
          snoozedUntil: old.get(item.id)?.snoozedUntil ?? '',
        }))
        return { ...current, notifications: [...current.notifications.filter(item => !item.id.startsWith('hub-')), ...hubItems] }
      })
      setMessage(`학교 공유자료에서 ${loaded.length}건을 확인했습니다.`)
    } catch (error) {
      setMessage(`공유자료를 불러오지 못했습니다. 로컬 알림은 계속 사용할 수 있습니다. (${error instanceof Error ? error.message : String(error)})`)
    } finally { setRefreshing(false) }
  }

  useEffect(() => { void refresh() }, [])

  const patchNotification = async (item: OperationsNotification, patch: Partial<OperationsNotification>) => {
    await update(current => {
      const found = current.notifications.some(saved => saved.id === item.id)
      const notifications = found
        ? current.notifications.map(saved => saved.id === item.id ? { ...saved, ...patch } : saved)
        : [...current.notifications, { ...item, ...patch }]
      return { ...current, notifications }
    })
  }

  return <div className="space-y-4">
    <section className="card">
      <SectionHeader title="통합 알림·변경센터" description="업무, 위원회, 수업변경과 내부 운영도구의 알림을 한곳에서 분류합니다. 시험판의 읽음·미루기 상태는 이 PC에만 저장됩니다." action={
        <button className="btn-secondary flex items-center gap-2" onClick={refresh} disabled={refreshing || saving}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />학교 자료 새로 확인</button>
      } />
      {message && <p className="mb-3 rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-300">{message}</p>}
      <div className="grid grid-cols-3 gap-2">
        {(['action', 'reference', 'done'] as const).map(category => <button key={category} onClick={() => setFilter(category)} className={`rounded-xl border px-3 py-3 text-left ${filter === category ? 'border-violet-400 bg-violet-500/15' : 'border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5'}`}>
          <span className="text-xs text-slate-600 dark:text-slate-400">{categoryLabel[category]}</span><strong className="block mt-1 text-xl text-slate-950 dark:text-white">{counts[category]}건</strong>
        </button>)}
      </div>
    </section>
    <section className="card">
      {visible.length === 0 ? <EmptyState>현재 분류에 표시할 알림이 없습니다.</EmptyState> : <div className="divide-y divide-black/5 dark:divide-white/5">
        {visible.map(item => <article key={item.id} className={`py-3 first:pt-0 last:pb-0 ${item.readAt ? 'opacity-60' : ''}`}>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 rounded-lg p-2 ${item.category === 'action' ? 'bg-rose-500/15 text-rose-300' : item.category === 'done' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300'}`}><Bell size={15} /></span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950 dark:text-white">{item.title}</strong><span className="badge bg-black/[0.03] dark:bg-white/5 text-slate-600 dark:text-slate-400">{item.source}</span></div><p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.summary}</p>{item.dueAt && <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">기준일 {item.dueAt.replace('T', ' ')}</p>}</div>
            <div className="flex shrink-0 gap-1">
              <button className="btn-ghost flex items-center gap-1 text-xs" onClick={() => patchNotification(item, { readAt: item.readAt ? '' : new Date().toISOString() })}><Check size={13} />{item.readAt ? '읽지 않음' : '읽음'}</button>
              <button className="btn-ghost flex items-center gap-1 text-xs" onClick={() => patchNotification(item, { snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })}><Clock3 size={13} />내일</button>
            </div>
          </div>
        </article>)}
      </div>}
    </section>
  </div>
}
