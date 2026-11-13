import { useEffect, useRef, useState } from 'react'
import { Database, Loader2, RefreshCw } from 'lucide-react'
import { useAdminStore } from '../../stores/adminStore'
import { confirmMigrationReview, getMigrationInventory, getMigrationStatus, prepareMigrationReview, runMigrationReplica, setMigrationReplicaPaused, type MigrationInventory, type MigrationReview, type MigrationRunResult, type MigrationStatus } from '../../services/firebaseMigration'

const phases: Record<MigrationStatus['phase'], string> = { PREPARING: '운영 설정 전', DRAINING: '추적 활성화 준비 중', TRACKING: '변경 기록 중 · 기준 사본 준비 전', COPYING_BASELINE: '기준 사본 복사 중', MIRRORING: '변경분 복제 중', NEEDS_REVIEW: '원본 상태 확인 필요', PAUSED: '복제 일시정지', REBASE_REQUIRED: '새 기준 사본 준비 필요 · 기존 복제 재개 금지' }
const runMessages: Record<MigrationRunResult['status'], string> = {
  PROGRESS: '변경분을 반영했습니다.', BUDGET_EXHAUSTED: '이번 분량을 반영했습니다. 남은 작업은 변경분 반영을 다시 누르면 이어집니다.',
  IDLE: '현재 기록까지 복제를 확인했습니다. 운영 전환을 위한 전체 검증은 별도입니다.', NEEDS_REVIEW: '불확실한 기록에서 멈췄습니다. 원본 상태를 검토해 주세요.',
  RETRY_LATER: '일시적인 연결 또는 동시 실행 문제로 멈췄습니다. 현황을 확인한 뒤 다시 실행해 주세요.', BUSY: '다른 실행이 진행 중입니다. 잠시 후 현황을 확인해 주세요.',
  PAUSED: '복제가 일시정지되어 있습니다. 시트 저장과 변경 기록은 계속됩니다.', ERROR: '복제를 완료하지 못했습니다. 기록은 보존되어 있습니다. 관리자 점검이 필요합니다.',
}
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50'

export default function FirebaseMigrationPanel() {
  const isAdmin = useAdminStore(state => state.isAdmin)
  const adminPassword = useAdminStore(state => state.adminPassword)
  const [status, setStatus] = useState<MigrationStatus | null>(null)
  const [inventory, setInventory] = useState<MigrationInventory | null>(null)
  const [review, setReview] = useState<MigrationReview | null>(null)
  const [sourceChecked, setSourceChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    generation.current++
    inFlight.current = false
    setBusy(false); setStatus(null); setInventory(null); setReview(null); setSourceChecked(false); setError(''); setNotice('')
    return () => { generation.current++ }
  }, [isAdmin, adminPassword])

  if (!isAdmin) return null

  const perform = async (operation?: () => Promise<{ message: string; plan?: MigrationReview }>) => {
    if (inFlight.current || !adminPassword) return
    inFlight.current = true
    setBusy(true); setError(''); setNotice(''); setReview(null); setSourceChecked(false)
    const requestGeneration = generation.current
    const current = () => {
      const admin = useAdminStore.getState()
      return generation.current === requestGeneration && admin.isAdmin && admin.adminPassword === adminPassword
    }
    try {
      const result = operation ? await operation() : null
      if (!current()) return
      const [nextStatus, nextInventory] = await Promise.all([getMigrationStatus(adminPassword), getMigrationInventory(adminPassword)])
      if (!current()) return
      setStatus(nextStatus); setInventory(nextInventory)
      if (result) { setNotice(result.message); setReview(result.plan ?? null) }
    } catch (cause) {
      if (!current()) return
      setStatus(null); setInventory(null); setReview(null)
      const message = cause instanceof Error ? cause.message : ''
      setError(/MIGRATION_REVIEW_STALE|MIGRATION_REVIEW_EXPIRED/.test(message)
        ? '검토 중 원본이 바뀌었거나 검토 시간이 지났습니다. 현황을 새로 확인하고 원본 상태를 다시 검토해 주세요.'
        : '요청 결과를 확인하지 못했습니다. 자동으로 다시 실행하지 않습니다. 현황 새로고침으로 서버 상태와 관리자 인증을 확인해 주세요.')
    } finally {
      if (current()) { inFlight.current = false; setBusy(false) }
    }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900" aria-label="Firebase 서버 이전">
    <h2 className="flex items-center gap-2 text-base font-bold"><Database size={17} />Firebase 서버 이전</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-700">PC와 모바일은 기존 구글시트로 계속 조회·저장합니다. 복제 현황은 수동으로 확인하며, 이 화면에서 운영 저장소를 전환하지 않습니다.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={() => void perform()} disabled={busy || !adminPassword} className={buttonClass}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}현황 새로고침
      </button>
      <button type="button" disabled={busy || !status?.canRun} className={buttonClass} onClick={() => void perform(async () => ({ message: runMessages[(await runMigrationReplica(adminPassword)).status] }))}>변경분 반영</button>
      <button type="button" disabled={busy || !status?.liveTrackingEnabled || status.replicaPaused === undefined || status.phase === 'REBASE_REQUIRED'} className={buttonClass} onClick={() => void perform(async () => {
        const result = await setMigrationReplicaPaused(adminPassword, !status?.replicaPaused)
        return { message: result.paused ? '복제를 일시정지했습니다. 진행 중인 한 단계는 마칠 수 있으며 시트 저장과 변경 기록은 계속됩니다.' : '복제를 재개할 수 있습니다. 변경분 반영을 눌러 이어서 실행하세요.' }
      })}>{status?.replicaPaused ? '복제 재개' : '복제 일시정지'}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm leading-relaxed text-sky-900">{notice}</p>}
    {status && inventory && <div className="mt-4 space-y-4" aria-live="polite">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
        <p className="font-semibold">{phases[status.phase]} · 현재 저장소: 구글시트</p>
        <p className="mt-1">기록 번호 {status.recordedRevision ?? '미확인'} · 복제 확인 번호 {status.verifiedRevision ?? '미확인'} · 확인 필요 {status.errorCount ?? '미확인'}건</p>
        <p className="mt-1">{status.baselinePrepared ? `대기 변경 번호 ${status.pendingCount ?? '미확인'}개 · 전체 자료·업무 동작 대조 전` : '운영 설정과 기준 사본 준비 후 복제를 실행할 수 있습니다.'}</p>
        {status.workerBusy && <p className="mt-1">다른 복제 실행이 진행 중입니다.</p>}
        {status.lastRun && <p className="mt-1">최근 실행: {new Date(status.lastRun.completedAt).toLocaleString('ko-KR')} · {runMessages[status.lastRun.result.status]}</p>}
      </div>
      {status.blockedRevision != null && !review && <button type="button" className={buttonClass} disabled={busy || status.phase === 'REBASE_REQUIRED'} onClick={() => void perform(async () => ({ message: '아래 검토 내역과 원본 시트의 실제 저장 결과를 확인해 주세요.', plan: await prepareMigrationReview(adminPassword, status.blockedRevision!) }))}>기록 {status.blockedRevision} 원본 상태 검토</button>}
      {review && <div className="rounded-xl border border-amber-300 bg-white p-4">
        <h3 className="font-semibold">기록 {review.revision} 검토</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">저장 결과가 불확실했던 기록입니다. 원본 시트에서 실제 결과를 확인한 뒤 해당 상태를 복제 대상으로 확정합니다. 업무가 성공했다고 판정하거나 원본 저장을 다시 실행하지 않습니다.</p>
        <ul className="mt-3 space-y-2 text-sm">{review.changes.map(change => <li key={change.resource}>
          <strong>{change.sheetName}</strong>: 저장·변경 {change.putCount}건 / 삭제 {change.deleteCount}건 / 결과 {change.count}건
          <span className="block text-xs text-slate-600">{change.source === 'NEXT_BEFORE_IMAGE' ? '후속 변경 직전의 보존 사본으로 당시 상태 확인' : '현재 원본 상태로 확인'}</span>
        </li>)}</ul>
        <p className="mt-2 text-xs text-slate-600">검토 유효 시간: {new Date(review.expiresAt).toLocaleTimeString('ko-KR')}까지. 자료 내용은 이 화면에 전송하지 않습니다.</p>
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={sourceChecked} disabled={busy} onChange={event => setSourceChecked(event.target.checked)} className="mt-1" />원본에서 실제 저장 결과를 확인했고, 이 상태를 복제에 반영하겠습니다.</label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy || !sourceChecked} className={buttonClass} onClick={() => void perform(async () => {
            await confirmMigrationReview(adminPassword, review.challengeRef)
            return { message: '확인 기록을 보존했습니다. 변경분 반영으로 복제를 이어갈 수 있습니다.' }
          })}>확인한 상태로 반영 확정</button>
          <button type="button" disabled={busy} className={buttonClass} onClick={() => { setReview(null); setSourceChecked(false) }}>검토 닫기</button>
        </div>
      </div>}
      <p className="text-xs leading-relaxed text-slate-600">조회: {new Date(inventory.inspectedAt).toLocaleString('ko-KR')} · 사용 행은 빈 행을 포함할 수 있는 상한입니다. 복제 건수와 단순 비교해 완료로 판단하지 않습니다.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr className="border-b border-slate-300"><th className="p-2">자료</th><th className="p-2">시트</th><th className="p-2 text-right">사용 행(상한)</th><th className="p-2 text-right">복제 확인 건수</th></tr></thead>
        <tbody>{inventory.resources.map(item => <tr key={item.resource} className="border-b border-slate-100">
          <td className="p-2 font-medium">{item.sheetName}</td><td className="p-2">{item.exists ? '있음' : '없음'}</td>
          <td className="p-2 text-right tabular-nums">{item.exists ? item.usedRowsUpperBound?.toLocaleString('ko-KR') : '—'}</td>
          <td className="p-2 text-right tabular-nums">{status.resources.find(resource => resource.resource === item.resource)?.replicaCount?.toLocaleString('ko-KR') ?? '미확인'}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="text-xs text-slate-700">분류되지 않은 시트 {inventory.unclassifiedSheetCount}개 · 외부 입력 시트 조사 전 · 이 조회에서는 자료 본문을 읽지 않습니다.</p>
    </div>}
  </section>
}
