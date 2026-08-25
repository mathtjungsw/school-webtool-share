import { BellRing } from 'lucide-react'
import NotificationsTab from './NotificationsTab'
import { useFutureOperations } from './useFutureOperations'

export default function OperationsNotificationsPage() {
  const operations = useFutureOperations()

  if (!operations.state) {
    return <div className="p-6 text-sm font-bold text-slate-600 dark:text-slate-300">통합 알림을 준비하고 있습니다…</div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header>
        <h1 className="page-title flex items-center gap-2"><BellRing size={24} className="text-violet-500" /> 통합 알림·변경센터</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">내 업무, 위원회 일정, 수업 교환·대강 변경을 한곳에서 확인하고 읽음 또는 내일 다시 보기로 정리합니다.</p>
      </header>
      <NotificationsTab state={operations.state} saving={operations.saving} update={operations.update} />
    </div>
  )
}
