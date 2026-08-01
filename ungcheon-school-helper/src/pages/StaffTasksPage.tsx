import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CalendarDays, Check, CheckCircle2, ClipboardCheck,
  ClipboardCopy, Clock3, Download, ExternalLink, FileSpreadsheet, GraduationCap,
  LayoutList, Link2, Pencil, Plus, Printer, RefreshCw, Save,
  ShieldCheck, Trash2, Upload, UserRoundCog, UsersRound,
} from 'lucide-react'
import clsx from 'clsx'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
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
  updateStaffChecklist,
} from '../services/schoolHub'
import {
  downloadStaffRoster,
  parseStaffRosterWorkbook,
  printTrainingRoster,
  sortStaffMembers,
  type SharedStaffRoster,
  type StaffChecklist,
  type StaffMember,
  type StaffTaskPriority,
  type StaffTaskStatus,
} from '../services/rosterAttendance'
import {
  createPersonalTaskId, loadPersonalTasks, savePersonalTasks, subscribePersonalOrganizer,
  type PersonalTask, type PersonalTaskPriority,
} from '../services/personalOrganizer'

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
  const pageTitle = mode === 'checklists' ? '업무센터' : '교원 명렬'
  const pageSubtitle = mode === 'checklists'
    ? '개인 업무와 교원별·부서별 공유 업무를 등록하고 진행 현황을 확인합니다.'
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

type WorkView = 'assigned' | 'created' | 'department' | 'personal'
type SharedLayout = 'list' | 'calendar'

interface SharedTaskDraft {
  id?: string
  title: string
  description: string
  startDate: string
  deadline: string
  priority: StaffTaskPriority
  status: StaffTaskStatus
  linkUrl: string
  itemsText: string
  targetNames: string[]
  departmentNames: string[]
}

const STATUS_LABEL: Record<StaffTaskStatus, string> = {
  planned: '예정', in_progress: '진행 중', completed: '완료', hold: '보류',
}
const STATUS_STYLE: Record<StaffTaskStatus, string> = {
  planned: 'bg-sky-500/12 text-sky-300',
  in_progress: 'bg-amber-500/12 text-amber-300',
  completed: 'bg-emerald-500/12 text-emerald-300',
  hold: 'bg-slate-500/15 text-slate-400',
}
const PRIORITY_LABEL: Record<StaffTaskPriority, string> = { low: '낮음', normal: '보통', high: '높음' }

function emptySharedTask(): SharedTaskDraft {
  return {
    title: '', description: '', startDate: today(), deadline: today(), priority: 'normal',
    status: 'in_progress', linkUrl: '', itemsText: '', targetNames: [], departmentNames: [],
  }
}

function isTaskResponseComplete(task: StaffChecklist, teacherName: string) {
  const response = task.responses.find(item => item.teacherName === teacherName)
  return Boolean(response && task.items.every(item => response.checkedItemIds.includes(item.id)))
}

function ChecklistTab(props: {
  teacherName: string
  members: StaffMember[]
  checklists: StaffChecklist[]
  isAdmin: boolean
  adminPassword: string
  onChanged: () => Promise<void>
  onError: (value: string) => void
  onSuccess: (value: string) => void
}) {
  const { teacherName, members, checklists, isAdmin, adminPassword, onChanged, onError, onSuccess } = props
  const [view, setView] = useState<WorkView>('assigned')
  const [layout, setLayout] = useState<SharedLayout>('list')
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<SharedTaskDraft>(emptySharedTask)
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([])
  const departments = useMemo(
    () => [...new Set(members.map(member => member.department.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [members],
  )

  useEffect(() => { void loadPersonalTasks().then(setPersonalTasks) }, [])
  useEffect(() => subscribePersonalOrganizer(change => {
    if (change.kind === 'tasks') setPersonalTasks(change.value)
  }), [])

  const assigned = checklists.filter(task => task.targetNames.includes(teacherName))
  const created = checklists.filter(task => task.canManage)
  const myIncomplete = assigned.filter(task => task.status !== 'completed' && !isTaskResponseComplete(task, teacherName))
  const todayDeadline = myIncomplete.filter(task => task.deadline === today()).length
  const overdue = myIncomplete.filter(task => task.deadline && task.deadline < today()).length
  const activeCreated = created.filter(task => task.status !== 'completed').length

  const visible = useMemo(() => {
    const source = view === 'created'
      ? created
      : view === 'department'
        ? checklists.filter(task => task.departmentNames.length > 0)
        : assigned
    return [...source].sort((a, b) => {
      const completeDiff = Number(a.status === 'completed') - Number(b.status === 'completed')
      if (completeDiff) return completeDiff
      const priorityDiff = ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority])
      return priorityDiff || (a.deadline || '9999').localeCompare(b.deadline || '9999') || b.createdAt.localeCompare(a.createdAt)
    })
  }, [assigned, checklists, created, view])

  const resetForm = () => setForm(emptySharedTask())
  const selectDepartment = (department: string) => {
    const names = members.filter(member => member.department === department).map(member => member.name)
    setForm(current => ({
      ...current,
      departmentNames: [...new Set([...current.departmentNames, department])],
      targetNames: [...new Set([...current.targetNames, ...names])],
    }))
  }
  const editTask = (task: StaffChecklist) => {
    setForm({
      id: task.id, title: task.title, description: task.description, startDate: task.startDate || today(),
      deadline: task.deadline || today(), priority: task.priority, status: task.status,
      linkUrl: task.linkUrl, itemsText: task.items.map(item => item.label).join('\n'),
      targetNames: task.targetNames, departmentNames: task.departmentNames,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const duplicateTask = (task: StaffChecklist) => {
    editTask({ ...task, id: '', title: `${task.title} (복사)`, canManage: false })
    setForm(current => ({ ...current, id: undefined, title: `${task.title} (복사)`, status: 'planned' }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!teacherName) return onError('환경설정에서 본인 이름을 먼저 입력하세요.')
    const items = form.itemsText.split('\n').map(value => value.trim()).filter(Boolean)
    if (!items.length || !form.targetNames.length) return onError('확인 항목과 배부 대상 교원을 선택하세요.')
    setSaving(true)
    onError('')
    try {
      if (form.id) {
        await updateStaffChecklist({
          checklistId: form.id, viewerName: teacherName, adminPassword: isAdmin ? adminPassword : '',
          title: form.title, description: form.description, startDate: form.startDate,
          deadline: form.deadline, priority: form.priority, status: form.status,
          linkUrl: form.linkUrl, items, targetNames: form.targetNames,
          departmentNames: form.departmentNames,
        })
        onSuccess('공유 업무를 수정했습니다.')
      } else {
        await addStaffChecklist({
          title: form.title, description: form.description, startDate: form.startDate,
          deadline: form.deadline, priority: form.priority, status: form.status,
          linkUrl: form.linkUrl, creatorName: teacherName, items,
          targetNames: form.targetNames, departmentNames: form.departmentNames,
        })
        onSuccess('공유 업무를 배부했습니다.')
      }
      resetForm()
      await onChanged()
    } catch (submitError) {
      onError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setSaving(false)
    }
  }

  if (!members.length) {
    return <div className="card border-dashed border-amber-500/20 py-14 text-center"><UsersRound size={36} className="mx-auto mb-3 text-slate-600" /><h2 className="text-base font-semibold text-slate-300">교원 명렬을 먼저 등록해 주세요</h2><p className="mt-2 text-xs text-slate-500">관리자 모드의 교원 명렬 메뉴에서 Excel을 업로드하면 대상자와 부서를 선택할 수 있습니다.</p></div>
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WorkSummary label="내 미완료 업무" value={myIncomplete.length} tone="sky" icon={ClipboardCheck} />
        <WorkSummary label="오늘 마감" value={todayDeadline} tone="amber" icon={Clock3} />
        <WorkSummary label="기한 초과" value={overdue} tone="rose" icon={AlertCircle} />
        <WorkSummary label="내가 배부한 진행 업무" value={activeCreated} tone="emerald" icon={UsersRound} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-surface-800 p-1.5">
        <div className="flex flex-wrap gap-1">
          {([
            ['assigned', '내 업무'], ['created', '내가 만든 업무'], ['department', '부서 업무'], ['personal', '개인 업무'],
          ] as Array<[WorkView, string]>).map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={clsx('rounded-lg px-3 py-2 text-xs font-semibold', view === id ? 'bg-amber-400/15 text-amber-300' : 'text-slate-500 hover:text-slate-200')}>{label}</button>
          ))}
        </div>
        {view !== 'personal' && <div className="flex gap-1"><button onClick={() => setLayout('list')} className={clsx('btn-ghost p-2', layout === 'list' && 'text-amber-300')} title="목록 보기"><LayoutList size={14} /></button><button onClick={() => setLayout('calendar')} className={clsx('btn-ghost p-2', layout === 'calendar' && 'text-amber-300')} title="달력 보기"><CalendarDays size={14} /></button></div>}
      </div>

      {view === 'personal' ? (
        <PersonalWorkPanel tasks={personalTasks} onTasksChanged={setPersonalTasks} onSuccess={onSuccess} />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <form onSubmit={submit} className="card sticky top-4 space-y-3">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-bold text-white">{form.id ? '공유 업무 수정' : '새 공유 업무'}</h2><p className="mt-1 text-[11px] text-slate-500">전체·부서·개별 교원에게 배부할 수 있습니다.</p></div>{form.id && <button type="button" onClick={resetForm} className="text-[10px] text-slate-500 hover:text-white">새 업무</button>}</div>
            <input required maxLength={100} className="input-field" placeholder="업무 제목" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
            <textarea maxLength={1000} className="input-field min-h-20 resize-y" placeholder="업무 설명·안내" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
            <textarea required maxLength={2000} className="input-field min-h-24 resize-y" placeholder={'세부 확인 항목 1\n세부 확인 항목 2'} value={form.itemsText} onChange={event => setForm({ ...form, itemsText: event.target.value })} />
            <div className="grid grid-cols-2 gap-2"><label className="field-label">시작일<input type="date" required className="input-field mt-1" value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} /></label><label className="field-label">마감일<input type="date" required className="input-field mt-1" value={form.deadline} onChange={event => setForm({ ...form, deadline: event.target.value })} /></label></div>
            <div className="grid grid-cols-2 gap-2"><label className="field-label">우선순위<select className="input-field mt-1" value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value as StaffTaskPriority })}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select></label><label className="field-label">업무 상태<select className="input-field mt-1" value={form.status} onChange={event => setForm({ ...form, status: event.target.value as StaffTaskStatus })}><option value="planned">예정</option><option value="in_progress">진행 중</option><option value="hold">보류</option><option value="completed">완료</option></select></label></div>
            <label className="field-label">관련 링크<div className="relative mt-1"><Link2 size={13} className="absolute left-3 top-2.5 text-slate-600" /><input type="url" className="input-field pl-8" placeholder="https://..." value={form.linkUrl} onChange={event => setForm({ ...form, linkUrl: event.target.value })} /></div></label>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-300">배부 대상 {form.targetNames.length}명</span><div className="flex gap-2"><button type="button" onClick={() => setForm(current => ({ ...current, targetNames: members.map(member => member.name), departmentNames: departments }))} className="text-[10px] text-amber-300">전체</button><button type="button" onClick={() => setForm(current => ({ ...current, targetNames: [], departmentNames: [] }))} className="text-[10px] text-slate-500">해제</button></div></div>
              <div className="mb-2 flex flex-wrap gap-1">{departments.map(department => <button key={department} type="button" onClick={() => selectDepartment(department)} className={clsx('rounded-md px-2 py-1 text-[10px]', form.departmentNames.includes(department) ? 'bg-sky-500/20 text-sky-200' : 'bg-sky-500/8 text-sky-400')}>{department}</button>)}</div>
              <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto pr-1">{sortStaffMembers(members).map(member => <label key={member.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/5"><input type="checkbox" checked={form.targetNames.includes(member.name)} onChange={event => setForm(current => ({ ...current, targetNames: event.target.checked ? [...new Set([...current.targetNames, member.name])] : current.targetNames.filter(name => name !== member.name) }))} /><span className="truncate">{member.name}{member.department ? ` · ${member.department}` : ''}</span></label>)}</div>
            </div>
            <button disabled={saving || !teacherName} className="btn-primary flex w-full items-center justify-center gap-1.5"><Save size={14} />{saving ? '저장 중...' : form.id ? '업무 수정 저장' : '공유 업무 배부'}</button>
          </form>

          {layout === 'calendar'
            ? <SharedWorkCalendar tasks={visible} month={viewMonth} onMonthChange={setViewMonth} />
            : <div className="space-y-3">{visible.map(task => <SharedTaskCard key={task.id} checklist={task} teacherName={teacherName} isAdmin={isAdmin} adminPassword={adminPassword} onEdit={editTask} onDuplicate={duplicateTask} onChanged={onChanged} onError={onError} onSuccess={onSuccess} />)}{visible.length === 0 && <div className="card py-14 text-center text-sm text-slate-500">해당하는 업무가 없습니다.</div>}</div>}
        </div>
      )}
    </div>
  )
}

function WorkSummary({ label, value, tone, icon: Icon }: { label: string; value: number; tone: 'sky' | 'amber' | 'rose' | 'emerald'; icon: typeof ClipboardCheck }) {
  const styles = { sky: 'border-sky-500/20 text-sky-300', amber: 'border-amber-500/20 text-amber-300', rose: 'border-rose-500/20 text-rose-300', emerald: 'border-emerald-500/20 text-emerald-300' }
  return <div className={clsx('card flex items-center gap-3 border', styles[tone])}><div className="grid h-9 w-9 place-items-center rounded-xl bg-white/5"><Icon size={17} /></div><div><p className="text-[10px] text-slate-500">{label}</p><p className="text-xl font-black">{value}</p></div></div>
}

function SharedTaskCard(props: {
  checklist: StaffChecklist; teacherName: string; isAdmin: boolean; adminPassword: string
  onEdit: (task: StaffChecklist) => void; onDuplicate: (task: StaffChecklist) => void
  onChanged: () => Promise<void>; onError: (value: string) => void; onSuccess: (value: string) => void
}) {
  const { checklist, teacherName, isAdmin, adminPassword, onEdit, onDuplicate, onChanged, onError, onSuccess } = props
  const own = checklist.responses.find(response => response.teacherName === teacherName)
  const [checked, setChecked] = useState<string[]>(own?.checkedItemIds ?? [])
  const [memo, setMemo] = useState(own?.memo ?? '')
  const [saving, setSaving] = useState(false)
  const assigned = checklist.targetNames.includes(teacherName)
  const canManage = checklist.canManage || isAdmin
  const doneCount = checklist.responses.filter(response => checklist.items.every(item => response.checkedItemIds.includes(item.id))).length
  const incompleteNames = checklist.targetNames.filter(name => !isTaskResponseComplete(checklist, name))
  useEffect(() => { setChecked(own?.checkedItemIds ?? []); setMemo(own?.memo ?? '') }, [own?.checkedItemIds, own?.memo])

  const save = async () => {
    setSaving(true); onError('')
    try { await submitStaffChecklist(checklist.id, teacherName, checked, memo); onSuccess('내 업무 진행 상태를 저장했습니다.'); await onChanged() }
    catch (error) { onError(error instanceof Error ? error.message : String(error)) }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!confirm('이 공유 업무와 모든 응답을 삭제할까요?')) return
    try { await deleteStaffChecklist(checklist.id, teacherName, isAdmin ? adminPassword : ''); onSuccess('공유 업무를 삭제했습니다.'); await onChanged() }
    catch (error) { onError(error instanceof Error ? error.message : String(error)) }
  }
  const copyIncomplete = async () => {
    await navigator.clipboard.writeText(incompleteNames.join(', '))
    onSuccess(`미완료자 ${incompleteNames.length}명의 이름을 복사했습니다.`)
  }
  return (
    <article className={clsx('card p-5', checklist.priority === 'high' && checklist.status !== 'completed' && 'border-rose-500/20')}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-white">{checklist.title}</h2><span className={clsx('rounded-full px-2 py-0.5 text-[10px]', STATUS_STYLE[checklist.status])}>{STATUS_LABEL[checklist.status]}</span><span className={clsx('rounded-full px-2 py-0.5 text-[10px]', checklist.priority === 'high' ? 'bg-rose-500/12 text-rose-300' : 'bg-white/5 text-slate-500')}>우선순위 {PRIORITY_LABEL[checklist.priority]}</span></div><p className="mt-1 text-[10px] text-slate-600">{checklist.creatorName} 작성 · {checklist.startDate || '-'} 시작 · {checklist.deadline || '마감 미지정'}</p>{checklist.departmentNames.length > 0 && <p className="mt-1 text-[10px] text-sky-400">{checklist.departmentNames.join(' · ')}</p>}{checklist.description && <p className="mt-3 whitespace-pre-wrap text-xs text-slate-400">{checklist.description}</p>}{checklist.linkUrl && <a href={checklist.linkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline"><ExternalLink size={11} />관련 자료 열기</a>}</div><div className="flex flex-shrink-0 gap-1">{canManage && <button onClick={() => onEdit(checklist)} className="btn-ghost p-2" title="수정"><Pencil size={13} /></button>}<button onClick={() => onDuplicate(checklist)} className="btn-ghost p-2" title="복제"><ClipboardCopy size={13} /></button>{canManage && <button onClick={remove} className="btn-ghost p-2 text-rose-400" title="삭제"><Trash2 size={13} /></button>}</div></div>
      {assigned && <div className="mt-4 space-y-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">{checklist.items.map(item => <label key={item.id} className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" className="mt-0.5" checked={checked.includes(item.id)} disabled={checklist.closed} onChange={event => setChecked(current => event.target.checked ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id))} /><span className={checked.includes(item.id) ? 'text-slate-500 line-through' : ''}>{item.label}</span></label>)}<div className="flex gap-2 pt-1"><input className="input-field flex-1 text-xs" maxLength={300} placeholder="진행 메모(선택)" value={memo} onChange={event => setMemo(event.target.value)} disabled={checklist.closed} /><button onClick={save} disabled={saving || checklist.closed} className="btn-primary flex items-center gap-1.5 px-4"><Save size={13} />{saving ? '저장 중' : '저장'}</button></div></div>}
      {checklist.canManage && <div className="mt-4"><div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-300">대상자 진행 현황</span><div className="flex items-center gap-2"><button onClick={copyIncomplete} disabled={!incompleteNames.length} className="text-[10px] text-sky-300 disabled:text-slate-600">미완료자 복사</button><span className="text-emerald-300">{doneCount}/{checklist.targetNames.length}명 완료</span></div></div><div className="mb-3 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full bg-emerald-500" style={{ width: `${checklist.targetNames.length ? doneCount / checklist.targetNames.length * 100 : 0}%` }} /></div><div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{checklist.targetNames.map(name => { const response = checklist.responses.find(item => item.teacherName === name); const itemCount = response?.checkedItemIds.filter(id => checklist.items.some(item => item.id === id)).length ?? 0; const complete = itemCount === checklist.items.length; return <div key={name} className={clsx('rounded-lg border px-2.5 py-2 text-[11px]', complete ? 'border-emerald-500/20 bg-emerald-500/7' : 'border-white/5 bg-white/[0.02]')}><div className="flex justify-between gap-2"><span className="text-slate-300">{name}</span><span className={complete ? 'text-emerald-300' : 'text-slate-600'}>{itemCount}/{checklist.items.length}</span></div>{response?.memo && <p className="mt-1 truncate text-[9px] text-slate-600" title={response.memo}>{response.memo}</p>}</div>})}</div></div>}
    </article>
  )
}

function SharedWorkCalendar({ tasks, month, onMonthChange }: { tasks: StaffChecklist[]; month: Date; onMonthChange: (date: Date) => void }) {
  const monthStart = startOfMonth(month)
  const days = eachDayOfInterval({ start: startOfWeek(monthStart, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) })
  const byDate = new Map<string, StaffChecklist[]>()
  tasks.forEach(task => { if (task.deadline) byDate.set(task.deadline, [...(byDate.get(task.deadline) ?? []), task]) })
  return <section className="card p-4"><div className="mb-4 flex items-center justify-between"><button className="btn-ghost p-2" onClick={() => onMonthChange(addMonths(month, -1))}>‹</button><h2 className="font-bold text-white">{format(month, 'yyyy년 M월', { locale: ko })} 업무 마감</h2><button className="btn-ghost p-2" onClick={() => onMonthChange(addMonths(month, 1))}>›</button></div><div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-white/5">{['월','화','수','목','금','토','일'].map(day => <div key={day} className="bg-surface-900 py-2 text-center text-[10px] font-bold text-slate-500">{day}</div>)}{days.map(day => { const date = format(day, 'yyyy-MM-dd'); const dayTasks = byDate.get(date) ?? []; return <div key={date} className={clsx('min-h-28 bg-surface-800/95 p-1.5', !isSameMonth(day, month) && 'opacity-35')}><span className={clsx('grid h-5 w-5 place-items-center rounded-full text-[10px]', date === today() ? 'bg-amber-400 font-bold text-slate-950' : 'text-slate-400')}>{format(day, 'd')}</span><div className="mt-1 space-y-1">{dayTasks.slice(0,4).map(task => <div key={task.id} className={clsx('truncate rounded border-l-2 px-1 py-0.5 text-[9px]', task.status === 'completed' ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300 line-through opacity-60' : task.priority === 'high' ? 'border-rose-400 bg-rose-500/10 text-rose-200' : 'border-sky-400 bg-sky-500/10 text-sky-200')} title={task.title}>{task.title}</div>)}{dayTasks.length > 4 && <p className="text-[8px] text-slate-600">+{dayTasks.length-4}개</p>}</div></div>})}</div></section>
}

function PersonalWorkPanel({ tasks, onTasksChanged, onSuccess }: { tasks: PersonalTask[]; onTasksChanged: (tasks: PersonalTask[]) => void; onSuccess: (text: string) => void }) {
  const [draft, setDraft] = useState<{ title: string; date: string; priority: PersonalTaskPriority; memo: string }>({ title: '', date: today(), priority: 'normal', memo: '' })
  const persist = async (next: PersonalTask[], message: string) => { const saved = await savePersonalTasks(next); onTasksChanged(saved); onSuccess(message) }
  const submit = async (event: FormEvent) => { event.preventDefault(); const title = draft.title.trim(); if (!title) return; const now = new Date().toISOString(); await persist([...tasks, { id: createPersonalTaskId(), title, date: draft.date, priority: draft.priority, memo: draft.memo.trim(), completed: false, createdAt: now, updatedAt: now }], '개인 업무를 등록했습니다.'); setDraft({ title: '', date: today(), priority: 'normal', memo: '' }) }
  return <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]"><form onSubmit={submit} className="card sticky top-4 space-y-3"><div><h2 className="font-bold text-white">개인 업무 등록</h2><p className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400"><ShieldCheck size={11} />현재 PC에만 저장되며 관리자도 볼 수 없습니다.</p></div><input required className="input-field" placeholder="업무 제목" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /><label className="field-label">마감일<input type="date" required className="input-field mt-1" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label><label className="field-label">우선순위<select className="input-field mt-1" value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as PersonalTaskPriority })}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select></label><textarea className="input-field min-h-24" placeholder="개인 메모" value={draft.memo} onChange={event => setDraft({ ...draft, memo: event.target.value })} /><button className="btn-primary flex w-full items-center justify-center gap-1.5"><Plus size={14} />개인 업무 등록</button></form><div className="space-y-2">{[...tasks].sort((a,b) => Number(a.completed)-Number(b.completed) || a.date.localeCompare(b.date)).map(task => <div key={task.id} className={clsx('card flex items-start gap-3 p-4', task.completed && 'opacity-55')}><button onClick={() => void persist(tasks.map(item => item.id === task.id ? { ...item, completed: !item.completed, updatedAt: new Date().toISOString() } : item), task.completed ? '미완료로 되돌렸습니다.' : '개인 업무를 완료했습니다.')} className={clsx('mt-0.5 grid h-5 w-5 place-items-center rounded border', task.completed ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-slate-600')}>{task.completed && <Check size={12} />}</button><div className="min-w-0 flex-1"><p className={clsx('font-semibold text-slate-200', task.completed && 'line-through')}>{task.title}</p><p className={clsx('mt-1 text-[10px]', !task.completed && task.date < today() ? 'text-rose-400' : 'text-slate-500')}>{task.date} · 우선순위 {PRIORITY_LABEL[task.priority]}</p>{task.memo && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">{task.memo}</p>}</div><button onClick={() => { if (confirm('이 개인 업무를 삭제할까요?')) void persist(tasks.filter(item => item.id !== task.id), '개인 업무를 삭제했습니다.') }} className="btn-ghost p-2 text-rose-400"><Trash2 size={13} /></button></div>)}{tasks.length === 0 && <div className="card py-14 text-center text-sm text-slate-500">등록된 개인 업무가 없습니다.</div>}</div></div>
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

      <div className="card overflow-x-auto p-0">
        <div className="min-w-[980px]">
        <div className="grid grid-cols-[54px_100px_120px_180px_150px_120px_42px] gap-2 px-4 py-2.5 bg-white/5 text-[10px] font-semibold text-slate-500">
          <span>순번</span><span>직책</span><span>성명</span><span>부서</span><span>교과</span><span>담임</span><span></span>
        </div>
        <div className="max-h-[620px] overflow-y-auto">
          {sortStaffMembers(draft).map((member, index) => (
            <div key={member.id} className="grid grid-cols-[54px_100px_120px_180px_150px_120px_42px] gap-2 items-center px-4 py-2 border-t border-white/5">
              <span className="text-xs text-slate-600">{index + 1}</span>
              {isAdmin
                ? <input className="input-field py-1.5 text-xs" value={member.position} onChange={event => update(member.id, { position: event.target.value })} />
                : <span className="text-xs text-slate-400">{member.position}</span>}
              {isAdmin
                ? <input className="input-field py-1.5 text-xs" value={member.name} onChange={event => update(member.id, { name: event.target.value })} />
                : <span className="text-sm font-semibold text-slate-200">{member.name}</span>}
              {isAdmin
                ? <input className="input-field py-1.5 text-xs" placeholder="부서(업무 배부에 사용)" value={member.department ?? ''} onChange={event => update(member.id, { department: event.target.value })} />
                : <span className="text-xs text-slate-500">{member.department || '-'}</span>}
              {isAdmin
                ? <input className="input-field py-1.5 text-xs" placeholder="담당 교과" value={member.subject ?? ''} onChange={event => update(member.id, { subject: event.target.value })} />
                : <span className="text-xs text-slate-500">{member.subject || '-'}</span>}
              {isAdmin
                ? <input className="input-field py-1.5 text-xs" placeholder="예: 1-1" value={member.homeroom ?? ''} onChange={event => update(member.id, { homeroom: event.target.value })} />
                : <span className="text-xs text-slate-500">{member.homeroom || '-'}</span>}
              {isAdmin
                ? <button onClick={() => setDraft(current => current.filter(item => item.id !== member.id))} className="btn-ghost p-2 text-rose-400"><Trash2 size={13} /></button>
                : <span />}
            </div>
          ))}
          {!draft.length && <p className="py-14 text-center text-sm text-slate-500">등록된 교원이 없습니다.</p>}
        </div>
        {isAdmin && (
          <div className="border-t border-white/5 p-3">
            <button onClick={() => setDraft(current => [...current, { id: crypto.randomUUID(), position: '교사', name: '', department: '', subject: '', homeroom: '' }])} className="btn-ghost flex items-center gap-1.5"><Plus size={13} />교원 추가</button>
          </div>
        )}
        </div>
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
