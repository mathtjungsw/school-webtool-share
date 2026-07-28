import { useEffect, useState } from 'react'
import { Bell, BellRing, CalendarDays, Info, Play, Square } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

interface NotifierResult {
  neisPending: number
  edufaiPending: number
  timestamp: string
  error?: string
}

export default function NotifierPage() {
  const config = useAppStore(state => state.config)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<NotifierResult | null>(null)

  useEffect(() => {
    window.electron.notifierStatus().then(setRunning)
    return window.electron.onNotifierResult(raw => {
      const next = raw as NotifierResult
      setResult(next)
      if (!next.error && next.neisPending > 0 && 'Notification' in window) {
        new Notification('웅천고 업무 알림', { body: `오늘 등록된 학사일정이 ${next.neisPending}건 있습니다.` })
      }
    })
  }, [])

  const start = () => {
    window.electron.notifierStart({
      schoolCode: config.schoolCode,
      officeCode: config.officeCode,
      apiKey: config.neisApiKey,
      intervalMinutes: 15,
    })
    setRunning(true)
  }

  const stop = () => {
    window.electron.notifierStop()
    setRunning(false)
  }

  const checkNow = () => {
    window.electron.notifierStart({
      schoolCode: config.schoolCode,
      officeCode: config.officeCode,
      apiKey: config.neisApiKey,
      intervalMinutes: 0,
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <header>
        <h1 className="page-title flex items-center gap-2"><BellRing size={22} className="text-amber-400" /> 업무 알리미</h1>
        <p className="text-sm text-slate-400 mt-1">NEIS Open API에서 오늘의 웅천고 학사일정을 주기적으로 확인합니다.</p>
      </header>

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4 flex gap-3 text-sm text-sky-200">
        <Info size={18} className="flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          NEIS·K-에듀파인의 실제 미결 공문은 공개 API가 없어 자동으로 읽을 수 없습니다.
          이 첫 버전은 오늘의 학사일정과 학교 공지를 알리는 안전한 모드로 동작합니다.
        </p>
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl grid place-items-center ${running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-slate-500'}`}>
            <Bell size={22} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white">{running ? '15분 간격으로 확인 중' : '자동 확인이 꺼져 있습니다'}</p>
            <p className="text-xs text-slate-500 mt-1">프로그램이 실행 중일 때만 알림을 확인합니다.</p>
          </div>
          <button onClick={checkNow} className="btn-ghost">지금 확인</button>
          {running ? (
            <button onClick={stop} className="btn-ghost flex items-center gap-2 text-rose-300"><Square size={13} /> 중지</button>
          ) : (
            <button onClick={start} className="btn-primary flex items-center gap-2"><Play size={13} /> 자동 확인 시작</button>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-white flex items-center gap-2"><CalendarDays size={16} className="text-violet-400" /> 최근 확인 결과</h2>
        {!result ? (
          <p className="text-sm text-slate-500 mt-5">아직 확인한 기록이 없습니다.</p>
        ) : result.error ? (
          <p className="text-sm text-rose-300 mt-5">{result.error}</p>
        ) : (
          <div className="mt-5">
            <p className="text-4xl font-black text-white">{result.neisPending}<span className="text-base font-normal text-slate-500 ml-2">건</span></p>
            <p className="text-sm text-slate-400 mt-1">오늘 등록된 학사일정</p>
            <p className="text-[11px] text-slate-600 mt-4">{new Date(result.timestamp).toLocaleString('ko-KR')} 확인</p>
          </div>
        )}
      </div>
    </div>
  )
}
