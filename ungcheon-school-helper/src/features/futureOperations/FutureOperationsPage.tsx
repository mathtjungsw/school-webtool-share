import { useState } from 'react'
import { BellRing, CalendarClock, ClipboardList, Construction, DoorOpen, RefreshCcw, UsersRound } from 'lucide-react'
import CollectionsTab from './CollectionsTab'
import DensityTab from './DensityTab'
import DutiesTab from './DutiesTab'
import { FEATURE_FUTURE_OPERATIONS } from './feature'
import HandoverTab from './HandoverTab'
import NotificationsTab from './NotificationsTab'
import ReservationsTab from './ReservationsTab'
import type { FutureOperationsTab } from './types'
import { useFutureOperations } from './useFutureOperations'
import './futureOperations.css'

const tabs = [
  { id: 'notifications' as const, label: '통합 알림', icon: BellRing },
  { id: 'reservations' as const, label: '시설·기자재 예약', icon: DoorOpen },
  { id: 'density' as const, label: '평가·행사 밀집도', icon: CalendarClock },
  { id: 'collections' as const, label: '자료수합', icon: ClipboardList },
  { id: 'duties' as const, label: '당번·지도 배정', icon: UsersRound },
  { id: 'handover' as const, label: '연간업무·인수인계', icon: RefreshCcw },
]

export default function FutureOperationsPage() {
  const [tab, setTab] = useState<FutureOperationsTab>('notifications')
  const { state, saving, update } = useFutureOperations()
  if (!state) return <div className="p-8 text-sm text-slate-600 dark:text-slate-400">학교 운영 확장 도구를 준비하고 있습니다…</div>
  const props = { state, saving, update }
  return <div className="future-operations p-6 max-w-[1600px] mx-auto space-y-5">
    <header><h1 className="page-title flex items-center gap-2"><Construction size={24} className="text-amber-400" />학교 운영 확장 도구</h1><p className="page-subtitle">추후 공개를 위해 준비 중인 로컬 시험 기능입니다. 현재 사이드바와 검색도우미에는 나타나지 않습니다.</p></header>
    {!FEATURE_FUTURE_OPERATIONS && <div className="future-operations-local-notice rounded-xl border px-4 py-3 text-sm"><strong>숨김 시험 기능</strong> · 아래 자료는 학교 공유 서버로 전송하지 않고 이 PC에만 저장됩니다.</div>}
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="학교 운영 확장 도구">
      {tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-bold flex items-center gap-2 ${tab === item.id ? 'border-violet-400 bg-violet-500/15 text-violet-200' : 'border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-black/[0.06] dark:hover:bg-white/10'}`}><item.icon size={15} />{item.label}</button>)}
    </nav>
    {tab === 'notifications' && <NotificationsTab {...props} />}
    {tab === 'reservations' && <ReservationsTab {...props} />}
    {tab === 'density' && <DensityTab {...props} />}
    {tab === 'collections' && <CollectionsTab {...props} />}
    {tab === 'duties' && <DutiesTab {...props} />}
    {tab === 'handover' && <HandoverTab {...props} />}
  </div>
}
