import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2, KeyRound, Link2, Palette, Save, School,
  UserRound, Clock3, CalendarDays, Power, AlertCircle, ExternalLink, LockKeyhole,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useAdminStore } from '../stores/adminStore'
import { UNGCHEON_PERIOD_PLAN } from '../services/ungcheonSchedule'
import { getSchoolNeisStatus, setSchoolNeisApiKey } from '../services/schoolHub'

const NEIS_KEY_URL = 'https://open.neis.go.kr/portal/guide/actKeyPage.do'

export default function UngcheonSettingsPage() {
  const config = useAppStore(s => s.config)
  const saveConfig = useAppStore(s => s.saveConfig)
  const patchConfig = useAppStore(s => s.patchConfig)
  const isAdmin = useAdminStore(s => s.isAdmin)
  const adminPassword = useAdminStore(s => s.adminPassword)
  const [draft, setDraft] = useState(config)
  const [saved, setSaved] = useState(false)
  const [hubStatus, setHubStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [neisKeyDraft, setNeisKeyDraft] = useState('')
  const [neisConfigured, setNeisConfigured] = useState<boolean | null>(null)
  const [neisStatusMessage, setNeisStatusMessage] = useState('')
  const [neisSaving, setNeisSaving] = useState(false)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const legacyMigrationStarted = useRef(false)

  useEffect(() => setDraft(config), [config])
  useEffect(() => {
    window.electron?.getAutoLaunch().then(setAutoLaunch).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!config.schoolHubUrl) {
      setNeisConfigured(null)
      setNeisStatusMessage('학교 공유 서비스 URL을 먼저 설정하세요.')
      return
    }
    let cancelled = false
    getSchoolNeisStatus()
      .then(async status => {
        if (cancelled) return
        setNeisConfigured(status.configured)
        setNeisStatusMessage(status.configured
          ? '학교 공용 NEIS 키가 안전하게 등록되어 있습니다.'
          : '관리자가 학교 공용 NEIS 키를 등록해야 합니다.')
        if (status.configured && config.neisApiKey) {
          await window.electron.apiKeyDelete('neisApiKey')
          patchConfig({ neisApiKey: '' })
        }
      })
      .catch(error => {
        if (cancelled) return
        setNeisConfigured(null)
        setNeisStatusMessage(error instanceof Error ? error.message : 'NEIS 연동 상태를 확인하지 못했습니다.')
      })
    return () => { cancelled = true }
  }, [config.schoolHubUrl, config.neisApiKey, patchConfig])

  useEffect(() => {
    const legacyKey = config.neisApiKey?.trim()
    if (!isAdmin || !adminPassword || neisConfigured !== false || !legacyKey || legacyMigrationStarted.current) return
    legacyMigrationStarted.current = true
    setNeisSaving(true)
    setNeisStatusMessage('이 PC에 저장된 기존 NEIS 키를 학교 공용 키로 안전하게 이전하고 있습니다.')
    setSchoolNeisApiKey(legacyKey, adminPassword)
      .then(async status => {
        setNeisConfigured(status.configured)
        await window.electron.apiKeyDelete('neisApiKey')
        patchConfig({ neisApiKey: '' })
        setNeisStatusMessage('기존 NEIS 키를 학교 공유 서버로 이전하고 이 PC의 키를 삭제했습니다.')
      })
      .catch(error => {
        legacyMigrationStarted.current = false
        setNeisStatusMessage(error instanceof Error ? error.message : '기존 NEIS 키를 이전하지 못했습니다.')
      })
      .finally(() => setNeisSaving(false))
  }, [adminPassword, config.neisApiKey, isAdmin, neisConfigured, patchConfig])

  const save = async () => {
    const safeDraft = { ...draft, neisApiKey: '' }
    await saveConfig(isAdmin ? safeDraft : { ...safeDraft, schoolHubUrl: config.schoolHubUrl })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const saveSchoolNeisKey = async () => {
    if (!isAdmin || !adminPassword || !neisKeyDraft.trim()) return
    setNeisSaving(true)
    setNeisStatusMessage('')
    try {
      if (draft.schoolHubUrl?.trim() !== config.schoolHubUrl) {
        await saveConfig({ schoolHubUrl: draft.schoolHubUrl?.trim() })
      }
      const status = await setSchoolNeisApiKey(neisKeyDraft.trim(), adminPassword)
      setNeisConfigured(status.configured)
      setNeisKeyDraft('')
      setNeisStatusMessage('학교 공용 NEIS 키를 등록했습니다. 일반 사용자에게 키는 공개되지 않습니다.')
      await window.electron.apiKeyDelete('neisApiKey')
      patchConfig({ neisApiKey: '' })
    } catch (error) {
      setNeisConfigured(false)
      setNeisStatusMessage(error instanceof Error ? error.message : 'NEIS API 키를 등록하지 못했습니다.')
    } finally {
      setNeisSaving(false)
    }
  }

  const testHub = async () => {
    if (isAdmin) {
      await saveConfig({ schoolHubUrl: draft.schoolHubUrl?.trim() })
    }
    setHubStatus('testing')
    try {
      const result = await window.electron.schoolHubRequest({ action: 'health' }) as { ok?: boolean }
      setHubStatus(result?.ok ? 'ok' : 'error')
    } catch {
      setHubStatus('error')
    }
  }

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
            <input value={draft.teacherName ?? ''} onChange={e => setDraft({ ...draft, teacherName: e.target.value })} placeholder="예: 김교사" />
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

      <Section icon={<KeyRound size={17} />} title="NEIS Open API">
        <div className={`rounded-xl border px-4 py-3 ${
          neisConfigured === true
            ? 'border-emerald-500/25 bg-emerald-500/10'
            : 'border-amber-500/25 bg-amber-500/10'
        }`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            {neisConfigured === true ? <CheckCircle2 size={15} className="text-emerald-400" /> : <AlertCircle size={15} className="text-amber-400" />}
            {neisConfigured === true ? '학교 공용 NEIS 연동 사용 중' : '학교 공용 NEIS 연동 확인 필요'}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">{neisStatusMessage || '연동 상태를 확인하고 있습니다.'}</p>
        </div>

        {isAdmin ? (
          <div className="mt-4">
            <Field
              label={neisConfigured ? '학교 공용 NEIS API 키 교체' : '학교 공용 NEIS API 키 등록'}
              help="키는 Google Apps Script의 비공개 속성에만 저장되며 사용자 PC와 서버 응답에는 포함되지 않습니다."
            >
              <div className="flex gap-2">
                <input
                  type="password"
                  value={neisKeyDraft}
                  onChange={e => setNeisKeyDraft(e.target.value)}
                  placeholder="관리자가 발급받은 NEIS API 키"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={saveSchoolNeisKey}
                  disabled={!neisKeyDraft.trim() || neisSaving}
                  className="btn-primary whitespace-nowrap px-4"
                >
                  {neisSaving ? '확인 중' : neisConfigured ? '키 교체' : '키 등록'}
                </button>
              </div>
            </Field>
            <button
              type="button"
              onClick={() => window.electron?.openExternal(NEIS_KEY_URL)}
              className="mt-2 text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              관리자용 NEIS 인증키 발급·확인
              <ExternalLink size={12} />
            </button>
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <LockKeyhole size={12} />
            일반 사용자는 API 키를 발급하거나 입력할 필요가 없습니다.
          </p>
        )}
      </Section>

      <Section icon={<Link2 size={17} />} title="학교 공유 서비스">
        <Field
          label="Google Apps Script 웹 앱 URL"
          help="공지와 부서별 공유 링크를 모든 교직원 PC에 동기화합니다. URL이 비어 있으면 공유 기능은 읽기 전용 안내 모드로 동작합니다."
        >
          {!isAdmin && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-400">
              <LockKeyhole size={12} />
              사용자 모드에서는 주소를 변경할 수 없습니다. 관리자 모드에서만 수정할 수 있습니다.
            </p>
          )}
          <div className="flex gap-2">
            <input
              className={`flex-1 ${!isAdmin ? 'cursor-not-allowed opacity-65' : ''}`}
              value={draft.schoolHubUrl ?? ''}
              readOnly={!isAdmin}
              aria-readonly={!isAdmin}
              onChange={e => {
                if (!isAdmin) return
                setDraft({ ...draft, schoolHubUrl: e.target.value })
                setHubStatus('idle')
              }}
              placeholder="https://script.google.com/macros/s/.../exec"
            />
            <button onClick={testHub} disabled={!draft.schoolHubUrl || hubStatus === 'testing'} className="btn-ghost px-4">
              {hubStatus === 'testing' ? '확인 중' : '연결 확인'}
            </button>
          </div>
          {hubStatus === 'ok' && <p className="text-xs text-emerald-400 flex items-center gap-1 mt-2"><CheckCircle2 size={12} /> 연결되었습니다.</p>}
          {hubStatus === 'error' && <p className="text-xs text-rose-400 flex items-center gap-1 mt-2"><AlertCircle size={12} /> 연결하지 못했습니다. 배포 URL과 권한을 확인하세요.</p>}
        </Field>
      </Section>

      <Section icon={<CalendarDays size={17} />} title="Google 캘린더">
        <Field label="공개 캘린더 임베드 URL" help="Google 캘린더 설정의 통합 코드에서 iframe 주소를 복사해 입력합니다.">
          <input
            value={draft.googleCalendarUrl ?? ''}
            onChange={e => setDraft({ ...draft, googleCalendarUrl: e.target.value })}
            placeholder="https://calendar.google.com/calendar/embed?..."
          />
        </Field>
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
          <Field label="테마">
            <select value={draft.theme ?? 'auto'} onChange={e => setDraft({ ...draft, theme: e.target.value as 'auto' | 'light' | 'dark' })}>
              <option value="auto">시간에 따라 자동</option>
              <option value="light">라이트</option>
              <option value="dark">다크</option>
            </select>
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
