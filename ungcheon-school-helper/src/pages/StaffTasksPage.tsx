import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, ClipboardCheck, Download, FileSpreadsheet,
  GraduationCap, Plus, Printer, RefreshCw, Save, ShieldCheck, Trash2, Upload,
  UserRoundCog, UsersRound,
} from 'lucide-react'
import clsx from 'clsx'
import { useAdminStore } from '../stores/adminStore'
import { useAppStore } from '../stores/appStore'
import {
  addStaffChecklist,
  deleteStaffChecklist,
  getSharedStaffRoster,
  listStaffChecklists,
  replaceSharedStaffRoster,
  subscribeHubResource,
  submitStaffChecklist,
} from '../services/schoolHub'
import {
  downloadStaffRoster,
  parseStaffRosterWorkbook,
  printTrainingRoster,
  sortStaffMembers,
  type SharedStaffRoster,
  type StaffChecklist,
  type StaffMember,
} from '../services/rosterAttendance'

type Tab = 'checklists' | 'roster' | 'training'
type StaffPageMode = 'checklists' | 'roster'

const today = () => new Date().toISOString().slice(0, 10)

export default function StaffTasksPage() {
  return <StaffPage mode="checklists" />
}

export function StaffRosterPage() {
  return <StaffPage mode="roster" />
}

function StaffPage({ mode }: { mode: StaffPageMode }) {
  const config = useAppStore(state => state.config)
  const isAdmin = useAdminStore(state => state.isAdmin)
  const adminPassword = useAdminStore(state => state.adminPassword)
  const teacherName = config.teacherName?.trim() ?? ''
  const [tab, setTab] = useState<Tab>(mode === 'checklists' ? 'checklists' : 'roster')
  const [roster, setRoster] = useState<SharedStaffRoster | null>(null)
  const [checklists, setChecklists] = useState<StaffChecklist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    if (!config.schoolHubUrl) return
    setLoading(true)
    setError('')
    try {
      const [nextRoster, nextChecklists] = await Promise.all([
        getSharedStaffRoster(),
        mode === 'checklists' && teacherName
          ? listStaffChecklists(teacherName, isAdmin ? adminPassword : '')
          : Promise.resolve([]),
      ])
      setRoster(nextRoster)
      setChecklists(nextChecklists)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [adminPassword, config.schoolHubUrl, isAdmin, mode, teacherName])

  useEffect(() => { load() }, [load])
  useEffect(() => subscribeHubResource<SharedStaffRoster | null>('staffRoster', data => setRoster(data)), [])
  useEffect(() => {
    if (!teacherName) return
    const expectedKey = `staffChecklists:${teacherName}:${isAdmin && adminPassword ? 'admin' : 'user'}`
    return subscribeHubResource<StaffChecklist[]>('staffChecklists', (data, cacheKey) => {
      if (cacheKey === expectedKey) setChecklists(data)
    })
  }, [adminPassword, isAdmin, teacherName])

  if (!config.schoolHubUrl) {
    return <SetupNeeded />
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof ClipboardCheck }> = [
    { id: 'roster', label: '교원 명렬', icon: UsersRound },
    { id: 'training', label: '연수등록부', icon: GraduationCap },
  ]
  const pageTitle = mode === 'checklists' ? '업무 체크리스트' : '교원 명렬'
  const pageSubtitle = mode === 'checklists'
    ? '교원별·부서별 업무를 배부하고 완료 현황을 확인합니다.'
    : '공유 교원 명렬을 관리하고 연수등록부를 출력합니다.'
  const PageIcon = mode === 'checklists' ? ClipboardCheck : UsersRound

  return (
    <div className="p-6 max-w-[1450px] mx-auto space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><PageIcon size={22} className="text-amber-400" />{pageTitle}</h1>
          <p className="page-subtitle">{pageSubtitle}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />새로고침
        </button>
      </header>

      {mode === 'checklists' && (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/8 px-4 py-3 flex items-start gap-3">
          <UserRoundCog size={17} className="text-sky-300 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-sky-200">
              현재 사용자: {teacherName || '환경설정에서 이름을 입력해 주세요'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              로그인 도입 전까지 환경설정의 교사 이름을 본인 확인 기준으로 사용합니다. 다른 사람의 이름을 입력할 수 있으므로 공식 확인 자료보다는 업무 진행 확인용으로 사용해 주세요.
            </p>
          </div>
        </div>
      )}

      {mode === 'roster' && (
        <div className="flex gap-1 rounded-xl bg-surface-800 border border-white/5 p-1">
          {tabs.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={clsx(
                  'flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                  tab === item.id ? 'bg-amber-400/15 text-amber-300' : 'text-slate-500 hover:text-slate-200',
                )}
              >
                <Icon size={14} />{item.label}
              </button>
            )
          })}
        </div>
      )}

      {error && <Notice tone="error" text={error} />}
      {success && <Notice tone="success" text={success} />}

      {mode === 'checklists' && (
        <ChecklistTab
          teacherName={teacherName}
          members={roster?.members ?? []}
          checklists={checklists}
          isAdmin={isAdmin}
          adminPassword={adminPassword}
          onChanged={load}
          onError={setError}
          onSuccess={setSuccess}
        />
      )}
      {mode === 'roster' && tab === 'roster' && (
        <RosterTab
          roster={roster}
          isAdmin={isAdmin}
          adminPassword={adminPassword}
          uploadedBy={teacherName || '관리자'}
          onChanged={load}
          onError={setError}
          onSuccess={setSuccess}
        />
      )}
      {mode === 'roster' && tab === 'training' && <TrainingTab members={roster?.members ?? []} />}
    </div>
  )
}

function ChecklistTab({
  teacherName,
  members,
  checklists,
  isAdmin,
  adminPassword,
  onChanged,
  onError,
  onSuccess,
}: {
  teacherName: string
  members: StaffMember[]
  checklists: StaffChecklist[]
  isAdmin: boolean
  adminPassword: string
  onChanged: () => Promise<void>
  onError: (value: string) => void
  onSuccess: (value: string) => void
}) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    deadline: today(),
    itemsText: '',
    targetNames: [] as string[],
  })
  const departments = useMemo(
    () => [...new Set(members.map(member => member.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [members],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!teacherName) {
      onError('환경설정에서 본인 이름을 먼저 입력하세요.')
      return
    }
    const items = form.itemsText.split('\n').map(value => value.trim()).filter(Boolean)
    if (!items.length || !form.targetNames.length) {
      onError('확인 항목과 배부 대상 교원을 선택하세요.')
      return
    }
    setCreating(true)
    onError('')
    try {
      await addStaffChecklist({
        title: form.title,
        description: form.description,
        deadline: form.deadline,
        creatorName: teacherName,
        items,
        targetNames: form.targetNames,
      })
      setForm({ title: '', description: '', deadline: today(), itemsText: '', targetNames: [] })
      onSuccess('업무 체크리스트를 배부했습니다.')
      await onChanged()
    } catch (submitError) {
      onError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setCreating(false)
    }
  }

  const selectDepartment = (department: string) => {
    const names = members.filter(member => member.department === department).map(member => member.name)
    setForm(current => ({ ...current, targetNames: [...new Set([...current.targetNames, ...names])] }))
  }

  if (!members.length) {
    return (
      <div className="card border-dashed border-amber-500/20 py-14 text-center">
        <UsersRound size={36} className="mx-auto text-slate-600 mb-3" />
        <h2 className="text-base font-semibold text-slate-300">교원 명렬을 먼저 등록해 주세요</h2>
        <p className="text-xs text-slate-500 mt-2">관리자 모드에서 ‘교원 명렬’ 탭으로 이동해 Excel을 업로드하면 배부 대상을 선택할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="grid xl:grid-cols-[410px_minmax(0,1fr)] gap-4 items-start">
      <form onSubmit={submit} className="card space-y-3 sticky top-4">
        <div>
          <h2 className="font-bold text-white">새 업무 배부</h2>
          <p className="text-[11px] text-slate-500 mt-1">확인할 항목은 한 줄에 하나씩 입력합니다.</p>
        </div>
        <input required maxLength={100} className="input-field" placeholder="제목" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
        <textarea maxLength={1000} className="input-field min-h-20 resize-y" placeholder="안내 또는 참고사항" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
        <textarea required maxLength={2000} className="input-field min-h-28 resize-y" placeholder={'확인 항목 1\n확인 항목 2'} value={form.itemsText} onChange={event => setForm({ ...form, itemsText: event.target.value })} />
        <label className="field-label">마감일<input type="date" className="input-field mt-1" value={form.deadline} onChange={event => setForm({ ...form, deadline: event.target.value })} /></label>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-slate-300">배부 대상 {form.targetNames.length}명</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setForm(current => ({ ...current, targetNames: members.map(member => member.name) }))} className="text-[10px] text-amber-300">전체</button>
              <button type="button" onClick={() => setForm(current => ({ ...current, targetNames: [] }))} className="text-[10px] text-slate-500">해제</button>
            </div>
          </div>
          {departments.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {departments.map(department => (
                <button key={department} type="button" onClick={() => selectDepartment(department)} className="rounded-md bg-sky-500/10 text-sky-300 px-2 py-1 text-[10px]">
                  {department}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-44 overflow-y-auto grid grid-cols-2 gap-1 pr-1">
            {sortStaffMembers(members).map(member => (
              <label key={member.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={form.targetNames.includes(member.name)}
                  onChange={event => setForm(current => ({
                    ...current,
                    targetNames: event.target.checked
                      ? [...current.targetNames, member.name]
                      : current.targetNames.filter(name => name !== member.name),
                  }))}
                />
                <span className="truncate">{member.name}{member.department ? ` · ${member.department}` : ''}</span>
              </label>
            ))}
          </div>
        </div>
        <button disabled={creating || !teacherName} className="btn-primary w-full flex items-center justify-center gap-1.5">
          <Plus size={14} />{creating ? '배부 중...' : '체크리스트 배부'}
        </button>
      </form>

      <div className="space-y-3">
        {checklists.map(checklist => (
          <ChecklistCard
            key={checklist.id}
            checklist={checklist}
            teacherName={teacherName}
            isAdmin={isAdmin}
            adminPassword={adminPassword}
            onChanged={onChanged}
            onError={onError}
            onSuccess={onSuccess}
          />
        ))}
        {checklists.length === 0 && (
          <div className="card py-14 text-center text-sm text-slate-500">내게 배부되었거나 내가 만든 체크리스트가 없습니다.</div>
        )}
      </div>
    </div>
  )
}

function ChecklistCard({
  checklist,
  teacherName,
  isAdmin,
  adminPassword,
  onChanged,
  onError,
  onSuccess,
}: {
  checklist: StaffChecklist
  teacherName: string
  isAdmin: boolean
  adminPassword: string
  onChanged: () => Promise<void>
  onError: (value: string) => void
  onSuccess: (value: string) => void
}) {
  const own = checklist.responses.find(response => response.teacherName === teacherName)
  const [checked, setChecked] = useState<string[]>(own?.checkedItemIds ?? [])
  const [memo, setMemo] = useState(own?.memo ?? '')
  const [saving, setSaving] = useState(false)
  const assigned = checklist.targetNames.includes(teacherName)
  const doneCount = checklist.responses.filter(response =>
    checklist.items.every(item => response.checkedItemIds.includes(item.id)),
  ).length

  useEffect(() => {
    setChecked(own?.checkedItemIds ?? [])
    setMemo(own?.memo ?? '')
  }, [own?.checkedItemIds, own?.memo])

  const save = async () => {
    setSaving(true)
    onError('')
    try {
      await submitStaffChecklist(checklist.id, teacherName, checked, memo)
      onSuccess('내 체크 결과를 저장했습니다.')
      await onChanged()
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('이 체크리스트와 모든 응답을 삭제할까요?')) return
    try {
      await deleteStaffChecklist(checklist.id, teacherName, isAdmin ? adminPassword : '')
      onSuccess('체크리스트를 삭제했습니다.')
      await onChanged()
    } catch (deleteError) {
      onError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  return (
    <article className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-white">{checklist.title}</h2>
            <span className="rounded-full bg-amber-500/12 text-amber-300 px-2 py-0.5 text-[10px]">마감 {checklist.deadline || '미지정'}</span>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">{checklist.creatorName} 배부 · {new Date(checklist.createdAt).toLocaleString('ko-KR')}</p>
          {checklist.description && <p className="text-xs text-slate-400 mt-3 whitespace-pre-wrap">{checklist.description}</p>}
        </div>
        {(checklist.canManage || isAdmin) && (
          <button onClick={remove} className="btn-ghost text-rose-400 p-2" title="삭제"><Trash2 size={14} /></button>
        )}
      </div>

      {assigned && (
        <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3 space-y-2">
          {checklist.items.map(item => (
            <label key={item.id} className="flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={checked.includes(item.id)}
                disabled={checklist.closed}
                onChange={event => setChecked(current =>
                  event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id),
                )}
                className="mt-0.5"
              />
              <span className={checked.includes(item.id) ? 'line-through text-slate-500' : ''}>{item.label}</span>
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <input className="input-field flex-1 text-xs" maxLength={300} placeholder="메모(선택)" value={memo} onChange={event => setMemo(event.target.value)} disabled={checklist.closed} />
            <button onClick={save} disabled={saving || checklist.closed} className="btn-primary px-4 flex items-center gap-1.5"><Save size={13} />{saving ? '저장 중' : '저장'}</button>
          </div>
        </div>
      )}

      {checklist.canManage && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300">완료 현황</span>
            <span className="text-emerald-300">{doneCount}/{checklist.targetNames.length}명 완료</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-emerald-500" style={{ width: `${checklist.targetNames.length ? doneCount / checklist.targetNames.length * 100 : 0}%` }} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {checklist.targetNames.map(name => {
              const response = checklist.responses.find(item => item.teacherName === name)
              const itemCount = response?.checkedItemIds.length ?? 0
              const complete = itemCount === checklist.items.length
              return (
                <div key={name} className={clsx('rounded-lg border px-2.5 py-2 text-[11px] flex items-center justify-between gap-2', complete ? 'border-emerald-500/20 bg-emerald-500/7' : 'border-white/5 bg-white/[0.02]')}>
                  <span className="text-slate-300">{name}</span>
                  <span className={complete ? 'text-emerald-300' : 'text-slate-600'}>{itemCount}/{checklist.items.length}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </article>
  )
}

function RosterTab({
  roster,
  isAdmin,
  adminPassword,
  uploadedBy,
  onChanged,
  onError,
  onSuccess,
}: {
  roster: SharedStaffRoster | null
  isAdmin: boolean
  adminPassword: string
  uploadedBy: string
  onChanged: () => Promise<void>
  onError: (value: string) => void
  onSuccess: (value: string) => void
}) {
  const [draft, setDraft] = useState<StaffMember[]>([])
  const [sourceFileName, setSourceFileName] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(sortStaffMembers(roster?.members ?? [])), [roster])

  const upload = async () => {
    const [filePath] = await window.electron.openFilesDialog([{ name: 'Excel 파일', extensions: ['xlsx', 'xlsm', 'xls'] }])
    if (!filePath) return
    try {
      const members = parseStaffRosterWorkbook(await window.electron.readFile(filePath))
      setDraft(members)
      setSourceFileName(filePath.split(/[\\/]/).pop() ?? '')
      onSuccess(`${members.length}명의 교원 명렬을 읽었습니다. 내용을 확인하고 저장하세요.`)
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : String(uploadError))
    }
  }

  const save = async () => {
    if (!draft.length) return
    setSaving(true)
    onError('')
    try {
      const result = await replaceSharedStaffRoster(sortStaffMembers(draft), adminPassword, uploadedBy, sourceFileName || roster?.sourceFileName)
      onSuccess(`교원 명렬 ${result.version}차 저장을 완료했습니다.`)
      await onChanged()
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const update = (id: string, patch: Partial<StaffMember>) =>
    setDraft(current => current.map(member => member.id === id ? { ...member, ...patch } : member))

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-white">공유 교원 명렬 {roster ? `${roster.version}차` : ''}</h2>
          <p className="text-[11px] text-slate-500 mt-1">
            {roster ? `${roster.members.length}명 · ${roster.uploadedBy} · ${new Date(roster.uploadedAt).toLocaleString('ko-KR')}` : '등록된 명렬이 없습니다.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadStaffRoster(draft)} disabled={!draft.length} className="btn-ghost flex items-center gap-1.5"><Download size={13} />명렬 내려받기</button>
          {isAdmin && <button onClick={upload} className="btn-ghost flex items-center gap-1.5"><Upload size={13} />Excel 불러오기</button>}
          {isAdmin && <button onClick={save} disabled={!draft.length || saving} className="btn-primary flex items-center gap-1.5"><Save size={13} />{saving ? '저장 중...' : '공유 명렬 저장'}</button>}
        </div>
      </div>

      {!isAdmin && (
        <div className="rounded-xl border border-slate-500/15 bg-white/[0.02] px-4 py-3 text-xs text-slate-400">
          일반 사용자는 가나다순 명렬을 조회하고 내려받을 수 있습니다. 수정은 관리자 모드에서만 가능합니다.
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="grid grid-cols-[60px_120px_140px_minmax(160px,1fr)_42px] gap-2 px-4 py-2.5 bg-white/5 text-[10px] font-semibold text-slate-500">
          <span>순번</span><span>직책</span><span>성명</span><span>부서</span><span></span>
        </div>
        <div className="max-h-[620px] overflow-y-auto">
          {sortStaffMembers(draft).map((member, index) => (
            <div key={member.id} className="grid grid-cols-[60px_120px_140px_minmax(160px,1fr)_42px] gap-2 items-center px-4 py-2 border-t border-white/5">
              <span className="text-xs text-slate-600">{index + 1}</span>
              {isAdmin
                ? <input className="input-field py-1.5 text-xs" value={member.position} onChange={event => update(member.id, { position: event.target.value })} />
                : <span className="text-xs text-slate-400">{member.position}</span>}
              {isAdmin
                ? <input className="input-field py-1.5 text-xs" value={member.name} onChange={event => update(member.id, { name: event.target.value })} />
                : <span className="text-sm font-semibold text-slate-200">{member.name}</span>}
              {isAdmin
                ? <input className="input-field py-1.5 text-xs" placeholder="부서(체크리스트 배부에 사용)" value={member.department} onChange={event => update(member.id, { department: event.target.value })} />
                : <span className="text-xs text-slate-500">{member.department || '-'}</span>}
              {isAdmin
                ? <button onClick={() => setDraft(current => current.filter(item => item.id !== member.id))} className="btn-ghost p-2 text-rose-400"><Trash2 size={13} /></button>
                : <span />}
            </div>
          ))}
          {!draft.length && <p className="py-14 text-center text-sm text-slate-500">등록된 교원이 없습니다.</p>}
        </div>
        {isAdmin && (
          <div className="border-t border-white/5 p-3">
            <button onClick={() => setDraft(current => [...current, { id: crypto.randomUUID(), position: '교사', name: '', department: '' }])} className="btn-ghost flex items-center gap-1.5"><Plus size={13} />교원 추가</button>
          </div>
        )}
      </div>
    </div>
  )
}

function TrainingTab({ members }: { members: StaffMember[] }) {
  const [title, setTitle] = useState('교과학점제 연수')
  const [date, setDate] = useState(today())
  const sortedMembers = useMemo(() => sortStaffMembers(members), [members])
  const splitAt = Math.max(33, Math.ceil(sortedMembers.length / 2))
  const leftMembers = sortedMembers.slice(0, splitAt)
  const rightMembers = sortedMembers.slice(splitAt)
  const previewRows = Array.from(
    { length: Math.max(leftMembers.length, rightMembers.length) },
    (_, index) => ({ left: leftMembers[index], right: rightMembers[index] }),
  )
  return (
    <div className="grid lg:grid-cols-[380px_minmax(0,1fr)] gap-4 items-start">
      <div className="card space-y-4">
        <div>
          <h2 className="font-bold text-white">연수등록부 출력</h2>
          <p className="text-[11px] text-slate-500 mt-1">예시 엑셀과 같은 2단 서명표로 인쇄합니다.</p>
        </div>
        <label className="field-label">연수 제목<input className="input-field mt-1" value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label className="field-label">연수 날짜<input type="date" className="input-field mt-1" value={date} onChange={event => setDate(event.target.value)} /></label>
        <button onClick={() => printTrainingRoster(members, title, date)} disabled={!members.length || !title.trim()} className="btn-primary w-full flex items-center justify-center gap-1.5">
          <Printer size={14} />연수등록부 인쇄·PDF 저장
        </button>
      </div>
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <FileSpreadsheet size={16} className="text-emerald-400" />
          <h3 className="font-semibold text-white">출력 미리보기 정보</h3>
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-xs">
          <dt className="text-slate-500">제목</dt><dd className="text-slate-200">{title || '-'}</dd>
          <dt className="text-slate-500">날짜</dt><dd className="text-slate-200">{date || '-'}</dd>
          <dt className="text-slate-500">대상 인원</dt><dd className="text-slate-200">{members.length}명</dd>
          <dt className="text-slate-500">정렬</dt><dd className="text-slate-200">교장, 교감, 나머지 교원 가나다순</dd>
        </dl>
        <div className="mt-4 rounded-xl border border-white/5 overflow-hidden">
          <div className="grid grid-cols-2 bg-white/[0.04] text-[10px] font-semibold text-slate-500">
            <div className="px-3 py-2 border-r border-white/5">왼쪽 열 · 1번부터</div>
            <div className="px-3 py-2">오른쪽 열 · {rightMembers.length ? `${splitAt + 1}번부터` : '계속'}</div>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {previewRows.map(({ left, right }, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-2 border-t border-white/5 text-xs">
                <div className="min-h-9 px-3 py-2 border-r border-white/5 flex gap-2">
                  <span className="text-slate-600 w-7">{left ? rowIndex + 1 : ''}</span>
                  <span className="text-slate-300">{left ? `${left.position} ${left.name}` : ''}</span>
                </div>
                <div className="min-h-9 px-3 py-2 flex gap-2">
                  <span className="text-slate-600 w-7">{right ? splitAt + rowIndex + 1 : ''}</span>
                  <span className="text-slate-300">{right ? `${right.position} ${right.name}` : ''}</span>
                </div>
              </div>
            ))}
            {!previewRows.length && <p className="py-12 text-center text-sm text-slate-500">등록된 교원이 없습니다.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function SetupNeeded() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="card p-10 text-center border-amber-500/20">
        <ShieldCheck size={36} className="mx-auto text-amber-400 mb-3" />
        <h1 className="text-xl font-bold text-white">학교 공유 서비스 설정이 필요합니다</h1>
        <p className="text-sm text-slate-400 mt-2">환경설정에서 학교 공유 서비스 URL을 확인해 주세요.</p>
      </div>
    </div>
  )
}

function Notice({ tone, text }: { tone: 'error' | 'success'; text: string }) {
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2
  return (
    <div className={clsx('rounded-xl border px-4 py-3 text-xs flex items-center gap-2', tone === 'error' ? 'border-rose-500/25 bg-rose-500/10 text-rose-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300')}>
      <Icon size={15} />{text}
    </div>
  )
}
