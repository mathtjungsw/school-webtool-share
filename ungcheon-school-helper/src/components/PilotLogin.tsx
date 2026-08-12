import { FormEvent, useState } from 'react'
import { Clock3, LogIn, ShieldCheck, UserRound } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import schoolLogo from '../assets/ungcheon-logo.png'

export default function PilotLogin() {
  const [name, setName] = useState('')
  const login = useAuthStore(state => state.login)
  const loading = useAuthStore(state => state.loading)
  const error = useAuthStore(state => state.error)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await login(name)
  }

  return (
    <main className="min-h-screen bg-surface-950 grid place-items-center p-5">
      <section className="w-full max-w-md rounded-3xl border border-amber-400/20 bg-surface-900 p-8 shadow-2xl">
        <div className="mx-auto mb-5 h-20 w-20 rounded-2xl bg-white p-2 shadow-lg">
          <img src={schoolLogo} alt="웅천고등학교" className="h-full w-full object-contain" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black text-white">웅천고 업무도우미</h1>
          <p className="mt-2 text-sm text-slate-400">교직원 명렬에 등록된 본인 이름을 직접 입력하세요.</p>
        </div>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block">
            <span className="field-label flex items-center gap-1.5"><UserRound size={13} />이름</span>
            <input autoFocus autoComplete="name" value={name} onChange={event => setName(event.target.value)} className="input-field mt-1.5 w-full text-base" placeholder="예: 홍길동" maxLength={20} />
          </label>
          {error && <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
          <button disabled={loading || !name.trim()} className="btn-primary flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50"><LogIn size={16} />{loading ? '확인 중...' : '로그인'}</button>
        </form>
        <div className="mt-5 space-y-2 rounded-2xl border border-white/5 bg-white/[0.025] p-4 text-[11px] text-slate-400">
          <p className="flex items-center gap-2 text-amber-300"><ShieldCheck size={14} />시범운영 뒤 비밀번호 생성예정입니다</p>
          <p className="flex items-center gap-2"><Clock3 size={14} />한 번 로그인하면 이 PC에서 72시간 동안 유지됩니다.</p>
        </div>
      </section>
    </main>
  )
}
