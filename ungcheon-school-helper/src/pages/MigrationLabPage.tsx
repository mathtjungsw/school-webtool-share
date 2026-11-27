import { useEffect, useRef, useState } from 'react'
import { ExternalLink, FlaskConical } from 'lucide-react'
import { MIGRATION_LABS, type MigrationLabId } from '../config/migrationLabs'
import { SchoolToolPage } from './YajaAttendancePage'

export default function MigrationLabPage({ id }: { id: MigrationLabId }) {
  const tool = MIGRATION_LABS[id]
  const dialog = useRef<HTMLDialogElement>(null)
  const [entered, setEntered] = useState(false)
  const [openError, setOpenError] = useState(false)
  useEffect(() => {
    const current = dialog.current
    if (!entered && current && !current.open) current.showModal()
    return () => { if (current?.open) current.close() }
  }, [entered])
  const leave = () => window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'feature_catalog' }))
  const official = async () => {
    try { await window.electron.openExternal(tool.original); leave() }
    catch { setOpenError(true) }
  }
  if (entered) return <div className="flex h-full flex-col">
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm font-bold text-amber-950">
      웅천고 업무도우미로 이전 테스트 중
      <button className="ml-4 underline" onClick={() => setEntered(false)}>이용 안내 다시 보기</button>
    </div>
    <div className="min-h-0 flex-1"><SchoolToolPage id={id} title={tool.title} pinId={{career_tests:'career-pin',yaja_attendance:'yaja-pin',school_seoga:'seoga-pin'}[id]} /></div>
  </div>
  return <dialog ref={dialog} aria-labelledby="migration-title" aria-describedby="migration-message"
    onCancel={event => { event.preventDefault(); leave() }}
    className="fixed inset-0 m-auto w-[min(32rem,90vw)] rounded-2xl border border-slate-200 bg-white p-7 text-slate-950 shadow-xl backdrop:bg-black/35">
    <p className="mb-3 flex items-center gap-2 font-bold text-amber-800"><FlaskConical size={18}/> 웅천고 도우미 실험실 · {tool.title}</p>
    <h1 id="migration-title" className="text-2xl font-bold">웅천고 업무도우미로 이전 테스트 중</h1>
    <p id="migration-message" className="my-4 leading-7">이 화면은 정식 서비스가 아닙니다. 지금은 학교에서 기존에 안내한 링크로 접속해 주세요.</p>
    <div className="flex flex-wrap items-center gap-3">
      <button autoFocus className="btn-primary" onClick={() => void official()}>기존 서비스 열기 <ExternalLink size={15}/></button>
      <button className="btn-secondary" onClick={() => setEntered(true)}>이전 테스트 화면 열기</button>
      <button className="btn-ghost" onClick={leave}>닫기</button>
    </div>
    {openError && <p role="alert" className="mt-3 select-text text-sm">브라우저 주소창에 {tool.original} 를 입력해 주세요.</p>}
  </dialog>
}
