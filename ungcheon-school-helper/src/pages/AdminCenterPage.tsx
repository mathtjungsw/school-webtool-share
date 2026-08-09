import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertCircle, ArrowLeftRight, BellRing, CheckCircle2, Clock3, ExternalLink,
  FileSpreadsheet, Landmark, Link2, Loader2, MonitorCheck, RefreshCw,
  Settings, ShieldCheck, UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useAdminStore } from '../stores/adminStore'
import { useAppStore } from '../stores/appStore'
import { describeNeisSyncReport, getNeisSyncStatus, runNeisSync, type NeisSyncStatus } from '../services/sharedNeis'

const SHORTCUTS: Array<{ page: string; title: string; detail: string; icon: LucideIcon }> = [
  { page: 'school_hub', title: '공지·학교 공유 링크', detail: '학교 공지와 교직원 공용 링크를 관리합니다.', icon: Link2 },
  { page: 'timetable_swap', title: '교환·대강 시간표', detail: '새 학교 시간표를 업로드하고 교환·대강 계획을 확인합니다.', icon: ArrowLeftRight },
  { page: 'staff_roster', title: '교직원 명렬', detail: '교직원 명렬과 연수등록부 출력 명단을 관리합니다.', icon: UsersRound },
  { page: 'attendance_print', title: '학생 명렬·출석부', detail: '학생 명렬을 갱신하고 학급·수업 출석부를 확인합니다.', icon: FileSpreadsheet },
  { page: 'committees', title: '각종 위원회', detail: '위원 명단과 위원회 일정을 관리합니다.', icon: Landmark },
  { page: 'feature_requests', title: '기능개선 요청', detail: '요청 상태와 관리자 답변을 관리합니다.', icon: BellRing },
  { page: 'settings', title: '환경설정', detail: '동기화 PC 등록, API 키와 학교 공유 연결을 설정합니다.', icon: Settings },
]

function navigate(page: string) {
  window.dispatchEvent(new CustomEvent('app:navigate', { detail: page }))
}

function formatDateTime(value: string) {
  if (!value) return '아직 동기화되지 않음'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}

export default function AdminCenterPage() {
  const isAdmin = useAdminStore(state => state.isAdmin)
  const config = useAppStore(state => state.config)
  const [status, setStatus] = useState<NeisSyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [message, setMessage] = useState('')
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')

  const refreshStatus = async () => {
    setError('')
    try {
      const value = await getNeisSyncStatus()
      setStatus(value)
      return value
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return null
    }
  }

  useEffect(() => {
    if (isAdmin && config.schoolHubUrl) void refreshStatus()
  }, [isAdmin, config.schoolHubUrl])

  if (!isAdmin) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <section className="card max-w-lg p-8 text-center">
          <ShieldCheck size={36} className="mx-auto text-amber-400" />
          <h1 className="mt-4 text-xl font-bold text-white">관리자 전용 화면입니다</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">상단 사용자 버튼에서 관리자 모드를 시작한 뒤 이용할 수 있습니다.</p>
          <button type="button" onClick={() => navigate('dashboard')} className="btn-primary mt-5">대시보드로 이동</button>
        </section>
      </div>
    )
  }

  const syncNow = async () => {
    setBusy(true)
    setMessage('')
    setWarning('')
    setError('')
    try {
      const snapshot = await runNeisSync(config)
      await refreshStatus()
      const summary = `${snapshot.fromDate}~${snapshot.toDate} · ${describeNeisSyncReport(snapshot.syncReport)}`
      if (snapshot.syncReport?.partial) setWarning(`일부 동기화를 완료했습니다. ${summary}`)
      else setMessage(`동기화를 완료했습니다. ${summary}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const checkUpdate = async () => {
    setCheckingUpdate(true)
    setMessage('')
    setError('')
    try {
      const started = await window.electron?.checkForUpdates()
      setMessage(started === false ? '현재 개발 환경에서는 업데이트 확인을 사용할 수 없습니다.' : '업데이트 확인을 시작했습니다. 새 버전이 있으면 자동으로 내려받습니다.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      window.setTimeout(() => setCheckingUpdate(false), 800)
    }
  }

  const canSync = Boolean(status?.isThisDevice && config.neisApiKey?.trim())

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><ShieldCheck size={24} className="text-amber-400" />관리자 센터</h1>
          <p className="mt-1 text-sm text-slate-400">학교 공용 자료 동기화와 자주 사용하는 관리 화면을 한곳에서 엽니다.</p>
        </div>
        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300">관리자 모드</span>
      </header>

      <section className="card overflow-hidden border border-sky-400/20">
        <div className="border-b border-white/10 bg-sky-500/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-white"><MonitorCheck size={18} className="text-sky-400" />학교 공용 NEIS 동기화</h2>
              <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-300">매일 13:00에 자동 갱신합니다. 아래 버튼은 기다리지 않고 오늘을 포함한 10일치 <strong className="text-white">급식·NEIS 학사일정·전체 학급시간표</strong>를 즉시 다시 수집할 때 사용합니다.</p>
            </div>
            <button type="button" onClick={() => void refreshStatus()} disabled={busy} className="btn-ghost inline-flex items-center gap-2"><RefreshCw size={14} />상태 새로고침</button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Status label="동기화 PC" value={status?.isThisDevice ? '이 PC가 등록됨' : status?.registered ? '다른 PC가 등록됨' : '등록된 PC 없음'} good={Boolean(status?.isThisDevice)} />
            <Status label="마지막 동기화" value={formatDateTime(status?.lastSyncedAt ?? '')} good={status?.lastStatus === 'success'} />
            <Status label="공유 자료 범위" value={status?.fromDate && status?.toDate ? `${status.fromDate} ~ ${status.toDate}` : '공유 자료 없음'} />
            <Status label="공유 자료 버전" value={status?.version ? `버전 ${status.version}` : '아직 없음'} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void syncNow()} disabled={busy || !canSync} className="btn-primary inline-flex items-center gap-2 px-5 py-2.5">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {busy ? '급식·학사일정·학급시간표 동기화 중...' : '급식·학사일정·학급시간표 지금 동기화'}
            </button>
            <button type="button" onClick={() => navigate('settings')} className="btn-ghost inline-flex items-center gap-2"><Settings size={14} />동기화 PC·API 키 설정</button>
          </div>

          {!status?.isThisDevice && (
            <Notice tone="warn">이 PC는 동기화 PC가 아닙니다. 환경설정에서 이 PC를 동기화 PC로 등록해야 즉시 동기화 버튼을 사용할 수 있습니다.</Notice>
          )}
          {status?.isThisDevice && !config.neisApiKey?.trim() && (
            <Notice tone="warn">이 PC의 NEIS API 키가 비어 있습니다. 환경설정에서 API 키를 저장해 주세요.</Notice>
          )}
          {warning && <Notice tone="warn">{warning}</Notice>}
          {!warning && status?.lastStatus === 'partial' && status.lastError && <Notice tone="warn">마지막 동기화는 일부만 완료되었습니다. {status.lastError}</Notice>}
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">프로그램 관리</h2>
            <p className="mt-1 text-xs text-slate-400">새 배포본이 있는지 확인합니다.</p>
          </div>
          <button type="button" onClick={() => void checkUpdate()} disabled={checkingUpdate} className="btn-ghost inline-flex items-center gap-2">
            <RefreshCw size={14} className={checkingUpdate ? 'animate-spin' : ''} />{checkingUpdate ? '확인 중...' : '지금 업데이트 확인'}
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-bold text-white">관리 바로가기</h2>
          <p className="mt-1 text-xs text-slate-400">원하는 관리 메뉴로 바로 이동합니다.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SHORTCUTS.map(item => {
            const Icon = item.icon
            return (
              <button key={item.page} type="button" onClick={() => navigate(item.page)} className="card group flex min-h-28 items-start gap-3 p-4 text-left transition-colors hover:border-amber-400/30 hover:bg-amber-400/[0.04]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-amber-400 group-hover:bg-amber-400/10"><Icon size={18} /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-100">{item.title}<ExternalLink size={12} className="text-slate-500" /></span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-slate-400">{item.detail}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Status({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <p className={`mt-1.5 text-sm font-bold ${good ? 'text-emerald-300' : 'text-slate-100'}`}>{value}</p>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'success' | 'warn' | 'error'; children: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : Clock3
  const style = tone === 'success'
    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
    : tone === 'error'
      ? 'border-rose-400/20 bg-rose-500/10 text-rose-200'
      : 'border-amber-400/20 bg-amber-500/10 text-amber-200'
  return <p className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs font-semibold leading-relaxed ${style}`}><Icon size={15} className="mt-0.5 shrink-0" />{children}</p>
}
