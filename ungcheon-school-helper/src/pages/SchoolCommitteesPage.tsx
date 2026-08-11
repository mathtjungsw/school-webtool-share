import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  Landmark,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { GYEONGNAM_HIGH_SCHOOL_COMMITTEES_2026 } from '../data/gyeongnamCommittees2026'
import { findCommitteeConflicts } from '../services/committeeCalendar'
import {
  addCommitteeEvent,
  deleteCommitteeEvent,
  getSharedStaffRoster,
  listCommitteeState,
  saveCommitteeMembers,
  subscribeHubResource,
  type CommitteeAssignment,
  type CommitteeEvent,
  type CommitteeMember,
  type CommitteeState,
} from '../services/schoolHub'
import type { SharedStaffRoster, StaffMember } from '../services/rosterAttendance'
import { useAppStore } from '../stores/appStore'

type Tab = 'directory' | 'calendar'
type Filter = '전체' | '법정' | '비법정' | '변경' | '폐지'

const today = () => new Date().toISOString().slice(0, 10)

const emptyEventForm = (committeeId = '') => ({
  committeeId,
  title: '',
  date: today(),
  startTime: '15:30',
  endTime: '16:30',
  location: '',
  agenda: '',
})

export default function SchoolCommitteesPage() {
  const config = useAppStore(state => state.config)
  const [tab, setTab] = useState<Tab>('directory')
  const [filter, setFilter] = useState<Filter>('전체')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(GYEONGNAM_HIGH_SCHOOL_COMMITTEES_2026[0]?.id ?? '')
  const [assignments, setAssignments] = useState<CommitteeAssignment[]>([])
  const [events, setEvents] = useState<CommitteeEvent[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [state, roster] = await Promise.all([
        listCommitteeState(),
        getSharedStaffRoster().catch(() => null),
      ])
      setAssignments(state.assignments)
      setEvents(state.events)
      setStaff(roster?.members ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '위원회 정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (config.schoolHubUrl) void load()
    else {
      setError('환경설정에서 학교 공유 서비스 주소를 먼저 확인해 주세요.')
      setLoading(false)
    }
  }, [config.schoolHubUrl])
  useEffect(() => subscribeHubResource<CommitteeState>('committees', data => {
    setAssignments(data.assignments)
    setEvents(data.events)
  }), [])
  useEffect(() => subscribeHubResource<SharedStaffRoster | null>('staffRoster', data => {
    setStaff(data?.members ?? [])
  }), [])

  const selected = GYEONGNAM_HIGH_SCHOOL_COMMITTEES_2026.find(item => item.id === selectedId)
  const selectedAssignment = assignments.find(item => item.committeeId === selectedId)
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ko')
    return GYEONGNAM_HIGH_SCHOOL_COMMITTEES_2026.filter(item => {
      const matchesFilter =
        filter === '전체' ||
        item.category === filter ||
        item.status === filter
      const matchesQuery =
        !keyword ||
        [item.name, item.basis, item.department, item.summary]
          .some(value => value.toLocaleLowerCase('ko').includes(keyword))
      return matchesFilter && matchesQuery
    })
  }, [filter, query])

  return (
    <div className="min-h-full bg-slate-50 p-5 text-slate-800">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-sky-950 p-6 text-white shadow-xl shadow-slate-900/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-sky-300">
                <Landmark size={15} />
                경상남도교육청 2026. 4. 1. 기준 · 고등학교 적용 항목
              </div>
              <h1 className="text-2xl font-black tracking-tight">학교 내 각종위원회</h1>
              <p className="mt-2 text-sm text-slate-300">
                공식 기준표를 확인하고 위원 명단과 개최 일정을 한곳에서 관리합니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-950">
                명단·일정 공동 편집
              </span>
              <button
                onClick={() => void load()}
                className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20"
              >
                <RefreshCw size={14} /> 새로고침
              </button>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <TabButton active={tab === 'directory'} onClick={() => setTab('directory')} icon={UsersRound}>
              기준표·위원 명단
            </TabButton>
            <TabButton active={tab === 'calendar'} onClick={() => setTab('calendar')} icon={CalendarDays}>
              위원회 캘린더
            </TabButton>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <Check size={17} /> {message}
          </div>
        )}

        {loading ? (
          <div className="grid min-h-[420px] place-items-center rounded-3xl border border-slate-200 bg-white">
            <Loader2 className="animate-spin text-indigo-500" size={30} />
          </div>
        ) : tab === 'directory' ? (
          <DirectoryView
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            committees={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            selected={selected}
            assignment={selectedAssignment}
            staff={staff}
            busy={busy}
            onSave={async members => {
              if (!selected) return
              setBusy(true)
              setError('')
              setMessage('')
              try {
                const result = await saveCommitteeMembers(
                  selected.id,
                  selected.name,
                  members,
                  config.teacherName?.trim() || '사용자',
                )
                setAssignments(current => [
                  ...current.filter(item => item.committeeId !== selected.id),
                  {
                    committeeId: selected.id,
                    committeeName: selected.name,
                    members,
                    updatedBy: config.teacherName?.trim() || '사용자',
                    updatedAt: result.updatedAt,
                  },
                ])
                setMessage(`${selected.name} 명단을 저장했습니다.`)
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : '위원 명단을 저장하지 못했습니다.')
              } finally {
                setBusy(false)
              }
            }}
          />
        ) : (
          <CalendarView
            assignments={assignments}
            events={events}
            busy={busy}
            onAdd={async form => {
              const committee = GYEONGNAM_HIGH_SCHOOL_COMMITTEES_2026.find(item => item.id === form.committeeId)
              const assignment = assignments.find(item => item.committeeId === form.committeeId)
              if (!committee || !assignment) return
              setBusy(true)
              setError('')
              setMessage('')
              try {
                const created = await addCommitteeEvent({
                  committeeId: committee.id,
                  committeeName: committee.name,
                  title: form.title.trim() || committee.name,
                  date: form.date,
                  startTime: form.startTime,
                  endTime: form.endTime,
                  location: form.location.trim(),
                  agenda: form.agenda.trim(),
                  memberNames: assignment.members.map(member => member.name),
                  createdBy: config.teacherName?.trim() || '사용자',
                })
                setEvents(current => [...current, created].sort((a, b) =>
                  `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
                ))
                setMessage(`${committee.name} 일정을 등록했습니다.`)
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : '위원회 일정을 등록하지 못했습니다.')
              } finally {
                setBusy(false)
              }
            }}
            onDelete={async event => {
              if (!window.confirm(`${event.committeeName} 일정을 삭제할까요?`)) return
              setBusy(true)
              setError('')
              try {
                await deleteCommitteeEvent(event.id)
                setEvents(current => current.filter(item => item.id !== event.id))
                setMessage('위원회 일정을 삭제했습니다.')
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : '일정을 삭제하지 못했습니다.')
              } finally {
                setBusy(false)
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof UsersRound
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
        active ? 'bg-white text-slate-950 shadow-lg' : 'bg-white/10 text-slate-300 hover:bg-white/20'
      }`}
    >
      <Icon size={16} /> {children}
    </button>
  )
}

function DirectoryView({
  filter,
  setFilter,
  query,
  setQuery,
  committees,
  selectedId,
  onSelect,
  selected,
  assignment,
  staff,
  busy,
  onSave,
}: {
  filter: Filter
  setFilter: (value: Filter) => void
  query: string
  setQuery: (value: string) => void
  committees: typeof GYEONGNAM_HIGH_SCHOOL_COMMITTEES_2026
  selectedId: string
  onSelect: (id: string) => void
  selected: (typeof GYEONGNAM_HIGH_SCHOOL_COMMITTEES_2026)[number] | undefined
  assignment: CommitteeAssignment | undefined
  staff: StaffMember[]
  busy: boolean
  onSave: (members: CommitteeMember[]) => Promise<void>
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(420px,0.95fr)_minmax(560px,1.3fr)]">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="위원회명, 근거, 담당부서 검색"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(['전체', '법정', '비법정', '변경', '폐지'] as Filter[]).map(value => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  filter === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[680px] overflow-y-auto p-2">
          {committees.map(item => (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`mb-1 w-full rounded-2xl border p-3 text-left transition ${
                selectedId === item.id
                  ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                  : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-black text-slate-500">
                  {item.id}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="text-sm text-slate-800">{item.name}</strong>
                    <Badge tone={item.category === '법정' ? 'indigo' : 'slate'}>{item.category}</Badge>
                    {item.status && <Badge tone={item.status === '폐지' ? 'rose' : 'amber'}>{item.status}</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.applicability} · {item.department.replace(/\n/g, ' / ')}</p>
                </div>
              </div>
            </button>
          ))}
          {!committees.length && <p className="p-8 text-center text-sm text-slate-400">검색 결과가 없습니다.</p>}
        </div>
      </section>

      {selected && (
        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900">{selected.name}</h2>
                  <Badge tone={selected.category === '법정' ? 'indigo' : 'slate'}>{selected.category}</Badge>
                  {selected.status && <Badge tone={selected.status === '폐지' ? 'rose' : 'amber'}>{selected.status}</Badge>}
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">적용: {selected.applicability}</p>
              </div>
              <span className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
                {selected.department.replace(/\n/g, ' / ')} · {selected.contact.replace(/\n/g, ', ')}
              </span>
            </div>
            <InfoBlock title="설치 근거" value={selected.basis} />
            <InfoBlock title="구성·운영 기준" value={selected.summary} />
            {selected.status === '폐지' && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                2026년 기준 폐지된 위원회입니다. 명단과 새 일정을 등록할 수 없습니다.
              </div>
            )}
          </div>
          <MemberEditor
            key={`${selected.id}:${assignment?.updatedAt ?? 'empty'}`}
            committeeName={selected.name}
            initialMembers={assignment?.members ?? []}
            staff={staff}
            editable={selected.status !== '폐지'}
            busy={busy}
            updatedAt={assignment?.updatedAt}
            onSave={onSave}
          />
        </section>
      )}
    </div>
  )
}

function MemberEditor({
  committeeName,
  initialMembers,
  staff,
  editable,
  busy,
  updatedAt,
  onSave,
}: {
  committeeName: string
  initialMembers: CommitteeMember[]
  staff: StaffMember[]
  editable: boolean
  busy: boolean
  updatedAt?: string
  onSave: (members: CommitteeMember[]) => Promise<void>
}) {
  const [members, setMembers] = useState(initialMembers)
  const [staffQuery, setStaffQuery] = useState('')
  const [directName, setDirectName] = useState('')
  const [directRole, setDirectRole] = useState('위원')
  const selectedNames = new Set(members.map(member => member.name))
  const matchingStaff = staff.filter(member =>
    !staffQuery.trim() ||
    `${member.name} ${member.position} ${member.department}`.includes(staffQuery.trim()),
  )

  const add = (name: string, role: string, source: CommitteeMember['source']) => {
    const normalized = name.trim()
    if (!normalized || selectedNames.has(normalized)) return
    setMembers(current => [...current, { name: normalized, role: role.trim() || '위원', source }])
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
            <UsersRound size={18} className="text-indigo-600" /> 위원 명단
            <span className="text-sm text-indigo-600">{members.length}명</span>
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {updatedAt ? `마지막 저장 ${new Date(updatedAt).toLocaleString('ko-KR')}` : '아직 저장된 명단이 없습니다.'}
          </p>
        </div>
        {editable && (
          <button
            disabled={busy}
            onClick={() => void onSave(members)}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            명단 저장
          </button>
        )}
      </div>

      {!editable && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-100 p-3 text-xs font-semibold text-slate-600">
          <ShieldCheck size={16} /> 폐지된 위원회는 명단을 편집할 수 없습니다.
        </div>
      )}

      {editable && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-3">
            <p className="mb-2 text-xs font-black text-slate-700">교직원 명렬에서 선택</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                value={staffQuery}
                onChange={event => setStaffQuery(event.target.value)}
                placeholder="이름·직위·부서 검색"
                className="w-full rounded-xl border border-slate-200 py-2 pl-8 pr-2 text-xs outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {matchingStaff.map(person => (
                <button
                  key={person.id}
                  disabled={selectedNames.has(person.name)}
                  onClick={() => add(person.name, person.position === '교장' ? '위원장' : '위원', 'staff')}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-indigo-50 disabled:text-slate-300"
                >
                  <span><strong>{person.name}</strong> · {person.position || '교사'} · {person.department || '부서 미지정'}</span>
                  {selectedNames.has(person.name) ? <Check size={13} /> : <Plus size={13} />}
                </button>
              ))}
              {!staff.length && <p className="p-3 text-center text-xs text-slate-400">등록된 교직원 명렬이 없습니다.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-3">
            <p className="mb-2 text-xs font-black text-slate-700">직접 입력</p>
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <input
                value={directName}
                onChange={event => setDirectName(event.target.value)}
                placeholder="성명 또는 외부위원"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400"
              />
              <input
                value={directRole}
                onChange={event => setDirectRole(event.target.value)}
                placeholder="역할"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400"
              />
            </div>
            <button
              onClick={() => {
                add(directName, directRole, 'direct')
                setDirectName('')
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
            >
              <UserPlus size={14} /> 직접 입력 위원 추가
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              학부모·전문가 등 교직원 명렬에 없는 위원도 직접 등록할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        {members.length ? members.map((member, index) => (
          <div key={member.name} className="grid grid-cols-[36px_1fr_140px_40px] items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0">
            <span className="text-center text-xs font-bold text-slate-400">{index + 1}</span>
            <div>
              <strong className="text-sm text-slate-800">{member.name}</strong>
              <span className="ml-2 text-[11px] text-slate-400">{member.source === 'staff' ? '교직원 명렬' : '직접 입력'}</span>
            </div>
            {editable ? (
              <input
                value={member.role}
                onChange={event => setMembers(current => current.map(item =>
                  item.name === member.name ? { ...item, role: event.target.value } : item,
                ))}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-400"
              />
            ) : (
              <span className="text-xs font-semibold text-slate-600">{member.role}</span>
            )}
            {editable && (
              <button
                title={`${member.name} 삭제`}
                onClick={() => setMembers(current => current.filter(item => item.name !== member.name))}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )) : (
          <p className="p-8 text-center text-sm text-slate-400">{committeeName}에 등록된 위원이 없습니다.</p>
        )}
      </div>
    </div>
  )
}

function CalendarView({
  assignments,
  events,
  busy,
  onAdd,
  onDelete,
}: {
  assignments: CommitteeAssignment[]
  events: CommitteeEvent[]
  busy: boolean
  onAdd: (form: ReturnType<typeof emptyEventForm>) => Promise<void>
  onDelete: (event: CommitteeEvent) => Promise<void>
}) {
  const available = GYEONGNAM_HIGH_SCHOOL_COMMITTEES_2026.filter(committee =>
    committee.status !== '폐지' &&
    (assignments.find(item => item.committeeId === committee.id)?.members.length ?? 0) > 0,
  )
  const [form, setForm] = useState(() => emptyEventForm(available[0]?.id))
  const [month, setMonth] = useState(today().slice(0, 7))
  const assignment = assignments.find(item => item.committeeId === form.committeeId)
  const conflicts = findCommitteeConflicts(events, {
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    memberNames: assignment?.members.map(member => member.name) ?? [],
  })
  const monthEvents = events.filter(event => event.date.startsWith(month))

  useEffect(() => {
    if (!form.committeeId && available[0]) {
      setForm(current => ({ ...current, committeeId: available[0].id }))
    }
  }, [available, form.committeeId])

  return (
    <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
          <CalendarDays size={19} className="text-indigo-600" /> 개최 일정 등록
        </h2>
        <div className="mt-4 space-y-3">
            <Field label="위원회">
              <select
                value={form.committeeId}
                onChange={event => setForm(current => ({ ...current, committeeId: event.target.value }))}
                className="committee-form-control w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              >
                <option value="">명단이 등록된 위원회 선택</option>
                {available.map(committee => (
                  <option key={committee.id} value={committee.id}>{committee.name}</option>
                ))}
              </select>
            </Field>
            <Field label="일정 제목">
              <input
                value={form.title}
                onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                placeholder="비워두면 위원회명이 표시됩니다"
                className="committee-form-control w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="개최일">
                <input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} className="committee-form-control w-full rounded-xl border border-slate-200 px-2 py-2.5 text-xs" />
              </Field>
              <Field label="시작">
                <input type="time" value={form.startTime} onChange={event => setForm(current => ({ ...current, startTime: event.target.value }))} className="committee-form-control w-full rounded-xl border border-slate-200 px-2 py-2.5 text-xs" />
              </Field>
              <Field label="종료">
                <input type="time" value={form.endTime} onChange={event => setForm(current => ({ ...current, endTime: event.target.value }))} className="committee-form-control w-full rounded-xl border border-slate-200 px-2 py-2.5 text-xs" />
              </Field>
            </div>
            <Field label="장소">
              <input value={form.location} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} placeholder="예: 본관 2층 회의실" className="committee-form-control w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </Field>
            <Field label="안건">
              <textarea value={form.agenda} onChange={event => setForm(current => ({ ...current, agenda: event.target.value }))} rows={3} placeholder="주요 안건을 입력하세요" className="committee-form-control w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </Field>
            <div className="rounded-2xl bg-indigo-50 p-3">
              <p className="text-xs font-black text-indigo-800">알림 대상 {assignment?.members.length ?? 0}명</p>
              <p className="mt-1 text-xs leading-relaxed text-indigo-600">
                {assignment?.members.map(member => member.name).join(', ') || '위원회 명단을 먼저 등록해 주세요.'}
              </p>
            </div>
            {form.startTime >= form.endTime && (
              <ConflictWarning>종료 시간은 시작 시간보다 늦어야 합니다.</ConflictWarning>
            )}
            {conflicts.map(conflict => (
              <ConflictWarning key={conflict.event.id}>
                {conflict.event.committeeName} ({conflict.event.startTime}~{conflict.event.endTime})와 겹칩니다.
                중복 위원: {conflict.overlappingMembers.join(', ')}
              </ConflictWarning>
            ))}
            <button
              disabled={
                busy ||
                !form.committeeId ||
                !assignment?.members.length ||
                form.startTime >= form.endTime ||
                conflicts.length > 0
              }
              onClick={async () => {
                await onAdd(form)
                setForm(current => ({ ...emptyEventForm(current.committeeId), date: current.date }))
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 일정 등록
            </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">위원회 일정</h2>
            <p className="mt-1 text-xs text-slate-500">등록된 위원에게만 개인 대시보드 달력과 알림에 표시됩니다.</p>
          </div>
          <input
            type="month"
            value={month}
            onChange={event => setMonth(event.target.value)}
            className="committee-form-control rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </div>
        <MonthCalendar month={month} events={monthEvents} />
        <div className="mt-5 space-y-2">
          {monthEvents.map(event => (
            <div key={event.id} className="rounded-2xl border border-slate-200 p-4 hover:border-indigo-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-slate-900">{event.title}</strong>
                    <Badge tone="indigo">{event.committeeName}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><CalendarDays size={13} /> {event.date}</span>
                    <span className="flex items-center gap-1"><Clock3 size={13} /> {event.startTime}~{event.endTime}</span>
                    {event.location && <span className="flex items-center gap-1"><MapPin size={13} /> {event.location}</span>}
                  </div>
                </div>
                <button
                  disabled={busy}
                  onClick={() => void onDelete(event)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {event.agenda && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{event.agenda}</p>}
              <p className="mt-3 text-xs text-slate-500"><strong>위원:</strong> {event.memberNames.join(', ')}</p>
            </div>
          ))}
          {!monthEvents.length && <p className="rounded-2xl bg-slate-50 p-10 text-center text-sm text-slate-400">이 달에 등록된 위원회 일정이 없습니다.</p>}
        </div>
      </section>
    </div>
  )
}

function MonthCalendar({ month, events }: { month: string; events: CommitteeEvent[] }) {
  const [year, monthNumber] = month.split('-').map(Number)
  const firstDay = new Date(year, monthNumber - 1, 1).getDay()
  const days = new Date(year, monthNumber, 0).getDate()
  const cells = Array.from({ length: firstDay + days }, (_, index) => index < firstDay ? 0 : index - firstDay + 1)
  while (cells.length % 7) cells.push(0)
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
      <div className="grid grid-cols-7 bg-slate-100 text-center text-[11px] font-black text-slate-500">
        {['일', '월', '화', '수', '목', '금', '토'].map(day => <div key={day} className="py-2">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, index) => {
          const date = day ? `${month}-${String(day).padStart(2, '0')}` : ''
          const dayEvents = events.filter(event => event.date === date)
          return (
            <div key={index} className="min-h-20 border-r border-t border-slate-100 p-1.5 last:border-r-0">
              {day > 0 && (
                <>
                  <span className={`text-[11px] font-bold ${index % 7 === 0 ? 'text-rose-500' : 'text-slate-500'}`}>{day}</span>
                  {dayEvents.slice(0, 2).map(event => (
                    <div key={event.id} title={`${event.committeeName} ${event.startTime}`} className="mt-1 truncate rounded bg-indigo-100 px-1.5 py-1 text-[10px] font-bold text-indigo-700">
                      {event.startTime} {event.committeeName}
                    </div>
                  ))}
                  {dayEvents.length > 2 && <p className="mt-1 text-[10px] font-bold text-slate-400">+{dayEvents.length - 2}</p>}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-black text-slate-500">{title}</p>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{value}</p>
    </div>
  )
}

function ConflictWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-relaxed text-rose-700">
      <AlertTriangle className="mt-0.5 shrink-0" size={15} /> <span>{children}</span>
    </div>
  )
}

function Badge({
  tone,
  children,
}: {
  tone: 'indigo' | 'slate' | 'amber' | 'rose'
  children: React.ReactNode
}) {
  const classes = {
    indigo: 'bg-indigo-100 text-indigo-700',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
  }
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${classes[tone]}`}>{children}</span>
}
