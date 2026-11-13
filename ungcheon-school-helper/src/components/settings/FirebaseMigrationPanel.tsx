import { useEffect, useState } from 'react'
import { Database, Loader2, RefreshCw } from 'lucide-react'
import { useAdminStore } from '../../stores/adminStore'
import { getMigrationInventory, getMigrationStatus, type MigrationInventory, type MigrationStatus } from '../../services/firebaseMigration'

export default function FirebaseMigrationPanel() {
  const isAdmin = useAdminStore(state => state.isAdmin)
  const adminPassword = useAdminStore(state => state.adminPassword)
  const [status, setStatus] = useState<MigrationStatus | null>(null)
  const [inventory, setInventory] = useState<MigrationInventory | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setStatus(null)
    setInventory(null)
    setError('')
  }, [isAdmin, adminPassword])

  if (!isAdmin) return null

  const inspect = async () => {
    if (busy || !adminPassword) return
    setBusy(true)
    setStatus(null)
    setInventory(null)
    setError('')
    try {
      const current = await getMigrationStatus(adminPassword)
      const result = await getMigrationInventory(adminPassword)
      // Ignore a result if the administrator has logged out while it was loading.
      const admin = useAdminStore.getState()
      if (!admin.isAdmin || admin.adminPassword !== adminPassword) return
      setStatus(current)
      setInventory(result)
    } catch {
      setError('이전 현황을 확인하지 못했습니다. 서버의 이전 준비 기능 배포 여부와 관리자 인증을 확인하세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900" aria-label="Firebase 서버 이전">
      <h2 className="flex items-center gap-2 text-base font-bold"><Database size={17} />Firebase 서버 이전</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">기존 구글시트로 계속 저장하면서 이전을 준비합니다. 현황은 아래 버튼을 눌러 확인할 수 있습니다.</p>
      <button type="button" onClick={() => void inspect()} disabled={busy || !adminPassword} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}이전 준비 현황 확인
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}
      {status && inventory && <div className="mt-4 space-y-3" aria-live="polite">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
          {status.liveTrackingEnabled ? '변경 기록 중' : '준비 단계'} · 현재 저장소: 구글시트 · 실제 자료 복제 전
          {status.liveTrackingEnabled
            ? <p className="mt-1">복제 전 변경 기록 {status.pendingCount?.toLocaleString('ko-KR') ?? '미확인'}건 · 원본 확인 필요 {status.errorCount?.toLocaleString('ko-KR') ?? '미확인'}건. 기록 번호는 동기화 완료를 뜻하지 않습니다.</p>
            : <p className="mt-1">동기화 대기·오류 건수와 검증 기준은 아직 측정하지 않았습니다. 운영 전환은 동기화 검증을 마친 뒤 진행합니다.</p>}
        </div>
        <p className="text-xs leading-relaxed text-slate-600">조회: {new Date(inventory.inspectedAt).toLocaleString('ko-KR')} · 사용 행은 빈 행을 포함할 수 있는 상한입니다. 실제 자료 수와 일치 여부는 별도 검증합니다.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-slate-300"><th className="p-2">자료</th><th className="p-2">시트</th><th className="p-2 text-right">사용 행(상한)</th><th className="p-2">확인 사항</th></tr></thead>
            <tbody>{inventory.resources.map(item => <tr key={item.resource} className="border-b border-slate-100">
              <td className="p-2 font-medium">{item.sheetName}</td><td className="p-2">{item.exists ? '있음' : '없음'}</td>
              <td className="p-2 text-right tabular-nums">{item.exists ? item.usedRowsUpperBound?.toLocaleString('ko-KR') : '—'}</td>
              <td className="p-2">{item.identity === 'identity-map-required' ? '고정 ID 대응표 필요' : '본문 검증 전'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-xs text-slate-700">분류되지 않은 시트 {inventory.unclassifiedSheetCount}개 · 외부 입력 시트 조사 전 · 자료 본문 조회 전</p>
      </div>}
    </section>
  )
}
