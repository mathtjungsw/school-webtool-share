import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LockKeyhole, ShieldCheck, UserRound, X } from 'lucide-react'
import { useAdminStore } from '../stores/adminStore'
import { useAppStore } from '../stores/appStore'

export default function AdminModeButton() {
  const configured = useAppStore(state => Boolean(state.config.schoolHubUrl))
  const isAdmin = useAdminStore(state => state.isAdmin)
  const unlock = useAdminStore(state => state.unlock)
  const lock = useAdminStore(state => state.lock)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setPassword('')
      setError('')
      setLoading(false)
    }
  }, [open])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await unlock(password)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleClick = () => {
    if (isAdmin) {
      lock()
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`h-7 px-2 rounded-md flex items-center gap-1.5 text-[10px] font-medium transition-colors ${
          isAdmin
            ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
            : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
        }`}
        title={isAdmin ? '관리자 모드 종료' : '관리자 모드 시작'}
      >
        {isAdmin ? <ShieldCheck size={12} /> : <UserRound size={12} />}
        {isAdmin ? '관리자' : '사용자'}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/65 backdrop-blur-sm grid place-items-center p-4 no-drag" onMouseDown={() => setOpen(false)}>
          <form
            onSubmit={submit}
            onMouseDown={event => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface-900 shadow-2xl p-6"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-300 grid place-items-center">
                <LockKeyhole size={18} />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-white">관리자 모드</h2>
                <p className="text-xs text-slate-400 mt-1">관리자 비밀번호 인증 후 관리 기능이 표시됩니다.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-white p-1">
                <X size={16} />
              </button>
            </div>

            {!configured && (
              <p className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">
                먼저 환경설정에서 학교 공유 서비스 URL을 입력하세요.
              </p>
            )}

            <label className="block mt-5 text-xs text-slate-400">
              관리자 비밀번호
              <input
                autoFocus
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="input-field w-full mt-1.5"
                placeholder="비밀번호 입력"
                autoComplete="off"
              />
            </label>

            {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}

            <button type="submit" disabled={loading || !password.trim() || !configured} className="btn-primary w-full mt-5 disabled:opacity-40">
              {loading ? '확인 중...' : '관리자 모드 시작'}
            </button>
            <p className="text-[10px] text-slate-600 text-center mt-3">비밀번호는 저장되지 않으며 앱을 종료하면 관리자 모드가 해제됩니다.</p>
          </form>
        </div>,
        document.body,
      )}
    </>
  )
}
