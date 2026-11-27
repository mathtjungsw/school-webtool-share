import { useCallback, useEffect, useRef, useState } from 'react'
import { FeatureSurface } from './ExternalToolPage'

type Connection = { state: 'loading' | 'pin' | 'ready' | 'error'; message?: string }

export default function YajaAttendancePage() {
  return <SchoolToolPage id="yaja_attendance" title="야자 도장판" pinId="yaja-pin" />
}

function SchoolToolPage({ id, title, pinId }: { id: string; title: string; pinId: string }) {
  const [connection, setConnection] = useState<Connection>({ state: 'loading' })
  const [pin, setPin] = useState('')
  const sequence = useRef(0)
  const connect = useCallback(async (action: 'schoolOpen' | 'schoolForget', input?: string) => {
    const ticket = ++sequence.current
    setPin('')
    setConnection({ state: 'loading' })
    try {
      const result = await window.preview.view({ id, action, pin: input })
      if (ticket === sequence.current) setConnection(result)
    } catch {
      if (ticket === sequence.current) setConnection({ state: 'error', message: '업무도우미 로그인 상태와 네트워크 연결을 확인해 주세요.' })
    }
  }, [id])
  useEffect(() => {
    void connect('schoolOpen')
    return () => { sequence.current++; void window.preview.view({ id, action: 'schoolLeave' }) }
  }, [connect, id])

  return <div className="flex h-full flex-col">
    <header className="flex items-center justify-between gap-4 border-b bg-white px-6 py-4">
      <h1 className="text-xl font-bold">{title}</h1>
      {connection.state === 'ready' && <button className="btn-secondary" onClick={() => {
        if (window.confirm(`이 PC와 ${title}의 연결을 해제할까요? 다음에 열 때 개인 PIN을 다시 입력합니다.`)) void connect('schoolForget')
      }}>이 PC 연결 해제</button>}
    </header>
    {connection.state === 'ready' ? <FeatureSurface id={id} /> :
      <section className="mx-auto w-full max-w-lg p-6" aria-live="polite">
        {connection.state === 'loading' && <p>교사 화면을 여는 중입니다…</p>}
        {connection.state === 'pin' && <form onSubmit={e => { e.preventDefault(); if (pin.length === 6) void connect('schoolOpen', pin) }}>
          <h2 className="text-lg font-bold">이 PC를 내 {title} 계정에 연결</h2>
          <p className="my-3">2027학년도 감독교사로 등록된 뒤, 본인 전용 PC에서 개인 PIN을 한 번 입력하세요. 다음부터는 업무도우미 로그인으로 바로 열립니다.</p>
          <label className="block font-semibold" htmlFor={pinId}>개인 PIN 6자리</label>
          <input className="my-2 w-full rounded-lg border p-3" id={pinId} type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
          {connection.message && <p role="alert" className="my-2 text-red-700">{connection.message}</p>}
          <button type="submit" className="btn-primary" disabled={pin.length !== 6}>연결하고 {title} 열기</button>
        </form>}
        {connection.state === 'error' && <><p role="alert">{connection.message}</p><button className="btn-secondary mt-4" onClick={() => void connect('schoolOpen')}>다시 열기</button></>}
      </section>}
  </div>
}
