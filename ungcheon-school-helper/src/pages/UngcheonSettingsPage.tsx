import { useEffect, useState } from 'react'
import {
  CheckCircle2, KeyRound, Link2, Palette, Save, School,
  UserRound, Clock3, CalendarDays, Power, AlertCircle, ExternalLink, LockKeyhole,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useAdminStore } from '../stores/adminStore'
import { UNGCHEON_PERIOD_PLAN } from '../services/ungcheonSchedule'

const NEIS_KEY_URL = 'https://open.neis.go.kr/portal/guide/actKeyPage.do'

export default function UngcheonSettingsPage() {
  const config = useAppStore(s => s.config)
  const saveConfig = useAppStore(s => s.saveConfig)
  const isAdmin = useAdminStore(s => s.isAdmin)
  const [draft, setDraft] = useState(config)
  const [saved, setSaved] = useState(false)
  const [hubStatus, setHubStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [autoLaunch, setAutoLaunch] = useState(false)

  useEffect(() => setDraft(config), [config])
  useEffect(() => {
    window.electron?.getAutoLaunch().then(setAutoLaunch).catch(() => undefined)
  }, [])

  const save = async () => {
    await saveConfig(isAdmin ? draft : { ...draft, schoolHubUrl: config.schoolHubUrl })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
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
        <Field label="NEIS API 키" help="키는 Windows 보안 저장소로 암호화해 이 PC에만 저장합니다. 자세한 발급 방법은 사용 매뉴얼에서도 확인할 수 있습니다.">
          <input
            type="password"
            value={draft.neisApiKey ?? ''}
            onChange={e => setDraft({ ...draft, neisApiKey: e.target.value })}
            placeholder="발급받은 NEIS API 키"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => window.electron?.openExternal(NEIS_KEY_URL)}
            className="mt-2 text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
          >
            NEIS 인증키 발급·확인 페이지
            <ExternalLink size={12} />
          </button>
        </Field>
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
