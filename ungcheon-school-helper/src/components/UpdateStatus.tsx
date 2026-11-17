import { useEffect, useState } from 'react'

const labels = {
  idle: '업데이트 확인 전',
  checking: '업데이트 확인 중',
  current: '최신 버전',
  available: '새 업데이트 발견',
  downloading: '새 버전 다운로드 중',
  ready: '업데이트 설치 준비 완료',
  installing: '업데이트 설치 중',
  error: '업데이트 실패',
  preview: '시험판 · 정식 자동 업데이트 제외',
}

interface UpdateState {
  revision: number
  phase: keyof typeof labels
  currentVersion: string
  targetVersion: string
  progress: number | null
  error?: string
  simulated?: boolean
}

export default function UpdateStatus({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<UpdateState | null>(null)
  const [open, setOpen] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let revision = -1
    const update = (next: UpdateState) => {
      if (next.revision < revision) return
      revision = next.revision
      setState(next)
      setActionError('')
    }
    void window.preview?.update('snapshot').then(update)
    const unsubscribe = window.preview?.onUpdate(update)
    const openUpdate = () => setOpen(true)
    window.addEventListener('update:open', openUpdate)
    return () => {
      unsubscribe?.()
      window.removeEventListener('update:open', openUpdate)
    }
  }, [])

  useEffect(() => {
    if (compact || state?.phase !== 'ready') return
    const key = 'update.reminded.' + state.targetVersion
    const runKey = 'update.run.' + state.targetVersion
    const remind = () => {
      const last = Number(localStorage.getItem(key) || 0)
      if (!sessionStorage.getItem(runKey) || Date.now() - last >= 24 * 3600000) {
        setOpen(true)
        sessionStorage.setItem(runKey, '1')
        localStorage.setItem(key, String(Date.now()))
      }
    }
    remind()
    const timer = setInterval(remind, 60000)
    return () => clearInterval(timer)
  }, [compact, state?.phase, state?.targetVersion])

  if (!state) return null
  const active = state.phase !== 'current' && state.phase !== 'idle'
  const ready = state.phase === 'ready'
  const progress = state.phase === 'downloading' && state.progress !== null ? ` · ${Math.round(state.progress)}%` : ''
  const target = state.targetVersion ? ` · v${state.targetVersion}` : ''
  const label = `${state.simulated ? '[시험 알림] ' : ''}${labels[state.phase]}${progress}${target}`

  const install = async () => {
    if (state.simulated) {
      alert('업데이트 알림 시험입니다. 정식 프로그램의 설치·재시작은 실행하지 않습니다.')
      return
    }
    if (!compact && !confirm('업데이트를 위해 프로그램과 위젯을 종료합니다. 모든 작업과 외부 사이트 내용을 저장하셨나요?')) return

    try {
      await window.preview.update(compact ? 'install-from-widget' : 'install')
    } catch {
      const message = '현재 설치할 수 없습니다. 업데이트를 다시 확인해 주세요.'
      if (compact) setActionError(message)
      else alert(message)
    }
  }

  if (compact) {
    if (!active) return null
    const error = actionError || (state.phase === 'error' ? state.error : '')
    const canInstall = ready && !error
    return (
      <div className="no-drag flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950">
        {canInstall && (
          <button
            type="button"
            aria-describedby="widget-update-restart"
            className="shrink-0 rounded-md !bg-amber-400 !px-2.5 !py-1 font-extrabold !text-amber-950 hover:!bg-amber-300"
            onClick={() => void install()}
          >
            {state.simulated ? '[시험] 업데이트 지금하기' : '업데이트 지금하기'}
          </button>
        )}
        <p id="widget-update-restart" role="status" className={canInstall ? 'font-medium text-amber-900' : 'font-bold'}>
          {canInstall ? '앱과 위젯이 재시작됩니다.' : error || label}
        </p>
        {error && (
          <button
            type="button"
            className="rounded-md !bg-white !px-2.5 !py-1 font-bold !text-amber-950 ring-1 ring-amber-300"
            onClick={() => void window.preview.update('check').catch(() => undefined)}
          >
            다시 확인
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-950">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen(!open)} className="font-bold text-left">{active ? '● ' : ''}{label}</button>
        {ready && <button className="rounded-lg bg-emerald-700 px-3 py-1 text-white" onClick={() => void install()}>지금 설치</button>}
      </div>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="업데이트 안내" className="mt-3 rounded-xl border border-amber-200 bg-white p-4">
          <p>현재 v{state.currentVersion}{state.targetVersion ? ` → v${state.targetVersion}` : ''}</p>
          <p className="my-2">{state.error || '다운로드가 끝난 뒤 지금 설치를 눌러야 새 버전이 적용됩니다.'}</p>
          {state.phase === 'preview' && <p className="my-2">이 시험판은 정식판을 변경하지 않습니다. 본창·위젯의 표시와 메뉴를 확인할 수 있습니다.</p>}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => void window.preview.update('check').catch(() => undefined)}>업데이트 확인</button>
            {ready && <button className="btn-primary" onClick={() => void install()}>지금 설치</button>}
            {state.phase === 'preview' && <button className="btn-secondary" onClick={() => void window.preview.update('simulate')}>업데이트 알림 시험</button>}
            <button className="btn-secondary" onClick={() => setOpen(false)}>나중에</button>
          </div>
        </div>
      )}
    </div>
  )
}
