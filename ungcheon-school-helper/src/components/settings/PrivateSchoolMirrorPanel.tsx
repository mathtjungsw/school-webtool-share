import { useEffect, useRef, useState } from 'react'
import { getPrivateSchoolMirrorStatus, retryPrivateSchoolMirror, type PrivateSchoolGroup, type PrivateSchoolMirrorStatus } from '../../services/firebaseMigration'

const groups = { staffRoster: '교직원 명렬', studentRoster: '학생 명렬', timetable: '교사 시간표', studentTimetable: '학생 시간표' }
const states = { current: '동기화 완료', pending: '재시도 필요', unchecked: '확인 전', disabled: '연결 전' }

export default function PrivateSchoolMirrorPanel({ adminPassword }: { adminPassword: string }) {
  const [status, setStatus] = useState<PrivateSchoolMirrorStatus[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const inFlight = useRef(false)

  useEffect(() => () => { request.current++ }, [])
  async function refresh(group?: PrivateSchoolGroup) {
    if (inFlight.current) return
    inFlight.current = true
    const id = ++request.current
    setBusy(true)
    setMessage('')
    try {
      const result = group ? await retryPrivateSchoolMirror(adminPassword, group) : null
      if (request.current !== id) return
      const next = await getPrivateSchoolMirrorStatus(adminPassword)
      if (request.current !== id) return
      setStatus(next)
      if (group && result) setMessage(result.state === 'current' ? `${groups[group]} 동기화를 확인했습니다.` : '비공개 저장소 연결과 토큰 만료 여부를 확인한 뒤 다시 시도해 주세요.')
    } catch {
      if (request.current === id) setMessage('비공개 사본 상태를 확인하지 못했습니다. 연결을 확인한 뒤 새로고침해 주세요.')
    } finally {
      if (request.current === id) { inFlight.current = false; setBusy(false) }
    }
  }
  const button = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-50'
  return <section className="mt-3 rounded-xl border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold">명렬·시간표 비공개 사본</h3>
      <button type="button" className={button} disabled={busy} onClick={() => void refresh()}>{busy ? '확인 중…' : '상태 새로고침'}</button>
    </div>
    {status.length > 0 && <ul className="mt-2 divide-y divide-slate-200">{status.map(item => <li key={item.group} className="flex flex-wrap items-center gap-3 py-2 text-sm">
      <strong>{groups[item.group]}</strong><span>{states[item.state]}</span>
      {item.checkedAt && <time dateTime={item.checkedAt}>{new Date(item.checkedAt).toLocaleString('ko-KR')}</time>}
      {item.state !== 'disabled' && <button type="button" className={button} disabled={busy} onClick={() => void refresh(item.group)}>{item.state === 'pending' ? '이 자료 다시 동기화' : '원본과 대조'}</button>}
    </li>)}</ul>}
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </section>
}
