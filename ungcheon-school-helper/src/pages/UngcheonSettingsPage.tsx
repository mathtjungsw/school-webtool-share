import { useEffect, useState } from 'react'
import {
  CheckCircle2, KeyRound, Link2, Palette, Save, School,
  UserRound, Clock3, Power, AlertCircle, ExternalLink, LockKeyhole,
  Database, Trash2,
  MonitorCheck, RefreshCw, Loader2,
  Eye, RotateCcw,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { useAdminStore } from '../stores/adminStore'
import { SIDEBAR_MENU_OPTIONS } from '../config/navigationRegistry'
import { UNGCHEON_PERIOD_PLAN } from '../services/ungcheonSchedule'
import {
  clearSchoolHubPersistentCache,
  getSchoolHubCacheStatus,
  getPersistentSchoolHubCacheStatus,
} from '../services/schoolHub'
import {
  getNeisSyncStatus,
  describeNeisSyncReport,
  registerThisNeisSyncDevice,
  revokeNeisSyncDevice,
  runNeisSync,
  type NeisSyncStatus,
} from '../services/sharedNeis'

const NEIS_KEY_URL = 'https://open.neis.go.kr/portal/guide/actKeyPage.do'

export default function UngcheonSettingsPage() {
  const logout = useAuthStore(state => state.logout)
  const config = useAppStore(s => s.config)
  const saveConfig = useAppStore(s => s.saveConfig)
  const isAdmin = useAdminStore(s => s.isAdmin)
  const adminPassword = useAdminStore(s => s.adminPassword)
  const [draft, setDraft] = useState(config)
  const [saved, setSaved] = useState(false)
  const [hubStatus, setHubStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [cacheStatus, setCacheStatus] = useState(() => getSchoolHubCacheStatus())
  const [persistentCacheStatus, setPersistentCacheStatus] = useState<{ count: number; newestAt: number | null; encrypted: boolean }>({ count: 0, newestAt: null, encrypted: false })
  const [cacheMessage, setCacheMessage] = useState('')
  const [neisSyncStatus, setNeisSyncStatus] = useState<NeisSyncStatus | null>(null)
  const [neisSyncBusy, setNeisSyncBusy] = useState(false)
  const [neisSyncMessage, setNeisSyncMessage] = useState('')
  const [neisSyncWarning, setNeisSyncWarning] = useState('')
  const [neisSyncError, setNeisSyncError] = useState('')
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([])

  useEffect(() => setDraft(config), [config])
  useEffect(() => {
    window.electron?.getAutoLaunch().then(setAutoLaunch).catch(() => undefined)
  }, [])
  useEffect(() => {
    window.electron?.configGet('sidebar.hiddenMenus.v1').then(value => {
      setHiddenMenus(Array.isArray(value) ? value.map(String) : [])
    }).catch(() => setHiddenMenus([]))
  }, [])
  useEffect(() => {
    if (!config.schoolHubUrl) return
    getNeisSyncStatus().then(setNeisSyncStatus).catch(() => setNeisSyncStatus(null))
  }, [config.schoolHubUrl, isAdmin])
  useEffect(() => {
    const refresh = () => {
      setCacheStatus(getSchoolHubCacheStatus())
      void getPersistentSchoolHubCacheStatus().then(setPersistentCacheStatus).catch(() => undefined)
    }
    refresh()
    const timer = window.setInterval(refresh, 5_000)
    return () => window.clearInterval(timer)
  }, [])

  const save = async () => {
    await saveConfig({ ...draft, schoolHubUrl: config.schoolHubUrl })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const testHub = async () => {
    setHubStatus('testing')
    try {
      const result = await window.electron.schoolHubRequest({ action: 'health' }) as { ok?: boolean }
      setHubStatus(result?.ok ? 'ok' : 'error')
    } catch {
      setHubStatus('error')
    }
  }

  const refreshNeisSyncStatus = async () => {
    const status = await getNeisSyncStatus()
    setNeisSyncStatus(status)
    return status
  }

  const registerSyncPc = async () => {
    if (!isAdmin || !adminPassword) return
    if (neisSyncStatus?.registered && !neisSyncStatus.isThisDevice && !window.confirm('기존 동기화 PC의 권한을 해제하고 이 PC로 변경할까요?')) return
    setNeisSyncBusy(true); setNeisSyncError(''); setNeisSyncMessage(''); setNeisSyncWarning('')
    try {
      await saveConfig({ neisApiKey: draft.neisApiKey?.trim() ?? '' })
      const status = await registerThisNeisSyncDevice(adminPassword, config.teacherName?.trim() || '관리자')
      setNeisSyncStatus(status)
      setNeisSyncMessage('이 PC를 NEIS 동기화 PC로 등록했습니다. API 키를 저장한 뒤 지금 동기화를 실행하세요.')
    } catch (error) {
      setNeisSyncError(error instanceof Error ? error.message : String(error))
    } finally { setNeisSyncBusy(false) }
  }

  const syncNow = async () => {
    setNeisSyncBusy(true); setNeisSyncError(''); setNeisSyncMessage(''); setNeisSyncWarning('')
    try {
      const apiKey = draft.neisApiKey?.trim() ?? ''
      await saveConfig({ neisApiKey: apiKey })
      const snapshot = await runNeisSync({ ...config, ...draft, neisApiKey: apiKey })
      await refreshNeisSyncStatus()
      const summary = `${snapshot.fromDate}~${snapshot.toDate} · ${describeNeisSyncReport(snapshot.syncReport)}`
      if (snapshot.syncReport?.partial) setNeisSyncWarning(`일부 동기화를 완료했습니다. ${summary}`)
      else setNeisSyncMessage(`동기화를 완료했습니다. ${summary}`)
    } catch (error) {
      setNeisSyncError(error instanceof Error ? error.message : String(error))
    } finally { setNeisSyncBusy(false) }
  }

  const revokeSyncPc = async () => {
    if (!isAdmin || !adminPassword || !window.confirm('등록된 NEIS 동기화 PC 권한을 해제할까요? 공용으로 저장된 기존 자료는 유지됩니다.')) return
    setNeisSyncBusy(true); setNeisSyncError(''); setNeisSyncMessage(''); setNeisSyncWarning('')
    try {
      await revokeNeisSyncDevice(adminPassword)
      await refreshNeisSyncStatus()
      setNeisSyncMessage('동기화 PC 권한을 해제했습니다. 기존 공용 자료는 그대로 유지됩니다.')
    } catch (error) {
      setNeisSyncError(error instanceof Error ? error.message : String(error))
    } finally { setNeisSyncBusy(false) }
  }

  const saveHiddenMenus = async (next: string[]) => {
    setHiddenMenus(next)
    await window.electron?.configSet('sidebar.hiddenMenus.v1', next)
    window.dispatchEvent(new CustomEvent('sidebar:preferences-updated'))
  }

  const restoreMenu = (id: string) => void saveHiddenMenus(hiddenMenus.filter(item => item !== id))
  const restoreAllMenus = () => void saveHiddenMenus([])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <header>
        <h1 className="page-title">환경설정</h1>
        <p className="text-sm text-slate-400 mt-1">웅천고 업무도우미의 학교·사용자·연동 정보를 관리합니다.</p>
      </header>

      <Section icon={<School size={17} />} title="학교 기본정보">
        <div className="grid sm:grid-cols-2 gap-3">
          <ReadOnly label="학교명" value="웅천고등학교" />
          <ReadOnly label="교육청" value="경상남도교육청" />
          <ReadOnly label="NEIS 학교 코드" value="9010464" />
          <ReadOnly label="교육청 코드" value="S10" />
          <div className="sm:col-span-2">
            <ReadOnly label="주소" value="경상남도 창원시 진해구 웅천중로 71" />
          </div>
        </div>
      </Section>

      <Section icon={<UserRound size={17} />} title="사용자 설정">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="교사 이름">
            <input value={draft.teacherName ?? ''} readOnly className="cursor-not-allowed opacity-70" />
            <button type="button" onClick={() => void logout()} className="mt-2 text-xs text-sky-400 hover:text-sky-300">로그아웃하고 사용자 전환</button>
            <p className="mt-1 text-[10px] text-amber-300">시범운영 뒤 비밀번호 생성예정입니다</p>
          </Field>
          <Field label="담당 학년">
            <select value={draft.grade ?? '1'} onChange={e => setDraft({ ...draft, grade: e.target.value })}>
              <option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option>
            </select>
          </Field>
          <Field label="담당 반">
            <input value={draft.classNm ?? '1'} onChange={e => setDraft({ ...draft, classNm: e.target.value })} inputMode="numeric" />
          </Field>
        </div>
      </Section>

      <Section icon={<MonitorCheck size={17} />} title="학교 공용 NEIS 동기화">
        <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-4">
          <p className="text-sm font-bold text-slate-100">일반 사용자는 API 키를 입력하지 않습니다.</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">등록된 관리자 PC 한 대가 매일 13:00에 오늘 포함 10일치 급식·학사일정·전체 학급 시간표를 수집합니다. 13시에 꺼져 있었다면 다음 실행 때 자동으로 보충합니다.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ReadOnly label="동기화 PC" value={neisSyncStatus?.isThisDevice ? '이 PC가 등록됨' : neisSyncStatus?.registered ? '다른 PC가 등록됨' : '등록된 PC 없음'} />
          <ReadOnly label="마지막 공용 동기화" value={neisSyncStatus?.lastSyncedAt ? new Date(neisSyncStatus.lastSyncedAt).toLocaleString('ko-KR') : '아직 동기화되지 않음'} />
        </div>

        {isAdmin ? (
          <div className="mt-4 space-y-3">
            <Field label="관리자 PC 전용 NEIS API 키" help="키는 서버나 구글시트에 올라가지 않고 이 PC의 Windows 보안 저장소에만 암호화해 저장됩니다.">
              <input
                type="password"
                value={draft.neisApiKey ?? ''}
                onChange={e => setDraft({ ...draft, neisApiKey: e.target.value })}
                placeholder="관리자 본인의 NEIS API 키"
                autoComplete="off"
                disabled={!neisSyncStatus?.isThisDevice}
              />
              <button type="button" onClick={() => window.electron?.openExternal(NEIS_KEY_URL)} className="mt-2 text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1">
                NEIS 인증키 발급·확인 페이지 <ExternalLink size={12} />
              </button>
            </Field>
            <div className="flex flex-wrap gap-2">
              {!neisSyncStatus?.isThisDevice && (
                <button type="button" onClick={() => void registerSyncPc()} disabled={neisSyncBusy} className="btn-primary inline-flex items-center gap-2">
                  {neisSyncBusy ? <Loader2 size={14} className="animate-spin" /> : <MonitorCheck size={14} />}{neisSyncStatus?.registered ? '이 PC로 동기화 PC 변경' : '이 PC를 동기화 PC로 등록'}
                </button>
              )}
              {neisSyncStatus?.isThisDevice && (
                <>
                  <button type="button" onClick={() => void syncNow()} disabled={neisSyncBusy || !draft.neisApiKey?.trim()} className="btn-primary inline-flex items-center gap-2">
                    {neisSyncBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}급식·학사일정·학급시간표 지금 동기화
                  </button>
                  <button type="button" onClick={() => void revokeSyncPc()} disabled={neisSyncBusy} className="btn-ghost text-rose-300">동기화 PC 등록 해제</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-400">급식·학사일정·학급 시간표는 관리자가 동기화한 공용 자료를 자동으로 사용합니다.</p>
        )}
        {neisSyncMessage && <p className="mt-3 text-xs font-semibold text-emerald-400">{neisSyncMessage}</p>}
        {neisSyncWarning && <p className="mt-3 text-xs font-semibold text-amber-400">{neisSyncWarning}</p>}
        {neisSyncError && <p className="mt-3 text-xs font-semibold text-rose-400">{neisSyncError}</p>}
      </Section>

      <Section icon={<Link2 size={17} />} title="학교 공유 서비스">
        <Field
          label="웅천고 공유 서비스"
          help="공지·명렬·시간표·업무 자료를 모든 교직원 PC에 동기화합니다."
        >
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <LockKeyhole size={14} className="text-emerald-400" />
              공유 서비스 주소가 프로그램에 안전하게 내장되어 있으며 사용자가 변경할 수 없습니다.
            </p>
            <button onClick={testHub} disabled={hubStatus === 'testing'} className="btn-ghost shrink-0 px-4">
              {hubStatus === 'testing' ? '확인 중' : '연결 확인'}
            </button>
          </div>
          {hubStatus === 'ok' && <p className="text-xs text-emerald-400 flex items-center gap-1 mt-2"><CheckCircle2 size={12} /> 연결되었습니다.</p>}
          {hubStatus === 'error' && <p className="text-xs text-rose-400 flex items-center gap-1 mt-2"><AlertCircle size={12} /> 연결하지 못했습니다. 배포 URL과 권한을 확인하세요.</p>}
        </Field>
      </Section>

      <Section icon={<Database size={17} />} title="공유자료 로컬 저장·자동 동기화">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-300">현재 {persistentCacheStatus.count || cacheStatus.persistentCount}개 자료를 PC에 저장하고, {cacheStatus.count}개 자료를 바로 표시할 수 있습니다.</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">시간표·명렬·업무·일정은 로컬 자료를 먼저 표시한 뒤 서버의 변경분만 백그라운드에서 갱신합니다. 학생·교직원 자료는 Windows 사용자 계정에 묶어 암호화합니다.</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">마지막 로컬 갱신: {persistentCacheStatus.newestAt ? new Date(persistentCacheStatus.newestAt).toLocaleString('ko-KR') : '아직 저장된 자료 없음'} · {persistentCacheStatus.encrypted ? '암호화됨' : '암호화 확인 중'}</p>
            {cacheMessage && <p className="mt-2 text-xs text-emerald-400">{cacheMessage}</p>}
          </div>
          <button
            type="button"
            onClick={async () => {
              await clearSchoolHubPersistentCache()
              setCacheStatus(getSchoolHubCacheStatus())
              setPersistentCacheStatus({ count: 0, newestAt: null, encrypted: persistentCacheStatus.encrypted })
              setCacheMessage('PC에 저장된 공유자료를 모두 삭제했습니다. 다음 메뉴 진입 시 서버에서 다시 내려받습니다.')
            }}
            className="btn-ghost inline-flex shrink-0 items-center gap-2 text-rose-300"
          >
            <Trash2 size={14} />로컬 저장자료 모두 삭제
          </button>
        </div>
      </Section>

      <Section icon={<Clock3 size={17} />} title="웅천고 고정 수업시간">
        <p className="text-xs text-slate-500 mb-3">첨부된 학교 시간계획에 따라 모든 PC에서 같은 시간으로 표시됩니다.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {UNGCHEON_PERIOD_PLAN.map(item => (
            <div key={item.period} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
              <p className="text-[11px] font-bold text-amber-400">{item.period}교시</p>
              <p className="mt-1 text-sm font-semibold text-slate-200">{item.start} - {item.end}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<Palette size={17} />} title="화면 및 실행">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="화면 모드">
            <div className="input-field flex min-h-10 items-center bg-white font-bold text-slate-950">밝은 모드 고정</div>
            <p className="mt-1 text-[11px] font-semibold text-slate-600">글자 가독성을 위해 다크 모드와 시간별 자동 전환은 사용하지 않습니다.</p>
          </Field>
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 cursor-pointer">
            <Power size={16} className="text-slate-400" />
            <span className="text-sm text-slate-300 flex-1">Windows 시작 시 자동 실행</span>
            <input
              type="checkbox"
              checked={autoLaunch}
              onChange={async e => {
                setAutoLaunch(e.target.checked)
                await window.electron.setAutoLaunch(e.target.checked)
              }}
              className="w-4 h-4"
            />
          </label>
        </div>
        <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><Eye size={15} className="text-violet-500" /> 숨긴 메뉴 관리</h3><p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-400">사이드바에서 숨긴 메뉴를 다시 표시합니다. 대시보드와 환경설정은 숨길 수 없습니다.</p></div>
            <button type="button" onClick={restoreAllMenus} disabled={!hiddenMenus.length} className="btn-ghost inline-flex items-center gap-1.5 text-xs disabled:opacity-40"><RotateCcw size={13} />전체 복원</button>
          </div>
          {hiddenMenus.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{hiddenMenus.map(id => {
            const menu = SIDEBAR_MENU_OPTIONS.find(item => item.id === id)
            if (!menu) return null
            return <div key={id} className="flex items-center justify-between rounded-xl border border-black/10 bg-black/[0.025] px-3 py-2 dark:border-white/10 dark:bg-white/[0.025]"><span className="text-sm font-bold text-slate-900 dark:text-slate-100">{menu.label}</span><button type="button" onClick={() => restoreMenu(id)} className="btn-ghost !px-2 !py-1 text-xs">다시 표시</button></div>
          })}</div> : <p className="mt-3 rounded-xl border border-dashed border-black/15 px-4 py-5 text-center text-xs font-semibold text-slate-500 dark:border-white/15 dark:text-slate-400">현재 숨긴 메뉴가 없습니다.</p>}
        </div>
      </Section>

      <div className="sticky bottom-4 flex justify-end">
        <button onClick={save} className="btn-primary flex items-center gap-2 px-5 py-2.5 shadow-xl">
          {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saved ? '저장되었습니다' : '설정 저장'}
        </button>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
        <span className="text-amber-400">{icon}</span>{title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-400 mb-1.5">{label}</span>
      <div className="[&_input]:input-field [&_select]:input-field [&_input]:w-full [&_select]:w-full">{children}</div>
      {help && <span className="block text-[11px] text-slate-500 mt-1.5 leading-relaxed">{help}</span>}
    </label>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-sm text-slate-200">{value}</p>
    </div>
  )
}
