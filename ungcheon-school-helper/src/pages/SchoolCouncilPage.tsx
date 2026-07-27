import { useState } from 'react'
import { Plus, Trash2, Printer, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

const MEMBER_TYPES = ['교원위원', '학부모위원', '지역위원']
const MEETING_TYPES = ['정기회', '임시회', '서면회의']
const AGENDA_TYPES = ['심의', '자문', '보고', '기타']

interface Member {
  id: string
  name: string
  type: string
  role: string  // 위원장, 부위원장, 간사, 위원
  term: string  // 임기
  phone: string
}

interface AgendaItem {
  id: string
  no: number
  type: string
  title: string
  result: string
  note: string
}

interface Meeting {
  id: string
  date: string
  time: string
  place: string
  meetingType: string
  chair: string
  agenda: AgendaItem[]
  attendees: string
  decision: string
}

function makeMember(): Member {
  return { id: crypto.randomUUID(), name: '', type: '교원위원', role: '위원', term: '', phone: '' }
}
function makeAgenda(no: number): AgendaItem {
  return { id: crypto.randomUUID(), no, type: '심의', title: '', result: '', note: '' }
}
function makeMeeting(): Meeting {
  return {
    id: crypto.randomUUID(),
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '15:00',
    place: '학교운영위원회실',
    meetingType: '정기회',
    chair: '',
    agenda: [makeAgenda(1)],
    attendees: '',
    decision: '',
  }
}

export default function SchoolCouncilPage() {
  const [members, setMembers] = useState<Member[]>([
    { ...makeMember(), type: '교원위원', role: '위원장' },
    { ...makeMember(), type: '학부모위원', role: '부위원장' },
    { ...makeMember(), type: '지역위원', role: '위원' },
  ])
  const [meetings, setMeetings] = useState<Meeting[]>([makeMeeting()])
  const [selectedMeeting, setSelectedMeeting] = useState(meetings[0].id)
  const [tab, setTab] = useState<'members' | 'minutes'>('members')
  const [year, setYear] = useState(new Date().getFullYear())
  const [schoolName, setSchoolName] = useState('')

  const meeting = meetings.find(m => m.id === selectedMeeting) ?? meetings[0]

  const addMember = () => setMembers(m => [...m, makeMember()])
  const removeMember = (id: string) => setMembers(m => m.filter(x => x.id !== id))
  const updateMember = (id: string, patch: Partial<Member>) =>
    setMembers(m => m.map(x => x.id === id ? { ...x, ...patch } : x))

  const addMeeting = () => {
    const m = makeMeeting()
    setMeetings(prev => [...prev, m])
    setSelectedMeeting(m.id)
  }

  const updateMeeting = (patch: Partial<Meeting>) =>
    setMeetings(prev => prev.map(m => m.id === selectedMeeting ? { ...m, ...patch } : m))

  const addAgenda = () => {
    const no = (meeting.agenda.at(-1)?.no ?? 0) + 1
    updateMeeting({ agenda: [...meeting.agenda, makeAgenda(no)] })
  }

  const removeAgenda = (id: string) =>
    updateMeeting({ agenda: meeting.agenda.filter(a => a.id !== id).map((a, i) => ({ ...a, no: i + 1 })) })

  const updateAgenda = (id: string, patch: Partial<AgendaItem>) =>
    updateMeeting({ agenda: meeting.agenda.map(a => a.id === id ? { ...a, ...patch } : a) })

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="page-title">학교운영위원회</h1>
          <p className="page-subtitle">위원 명단 관리 및 회의록을 작성합니다</p>
        </div>
        <button onClick={() => window.print?.()} className="btn-secondary flex items-center gap-1.5 text-xs">
          <Printer size={12} />인쇄
        </button>
      </div>

      {/* 기본 정보 */}
      <div className="card mb-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">학교명</label>
            <input className="input" placeholder="○○중학교" value={schoolName}
              onChange={e => setSchoolName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">학년도</label>
            <input type="number" className="input" value={year}
              onChange={e => setYear(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-surface-800 p-1 rounded-xl w-fit">
        {([['members', '위원 명단'], ['minutes', '회의록']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm transition-all',
              tab === v ? 'bg-violet-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            )}>{l}</button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">
              {year}학년도 {schoolName || '○○학교'} 학교운영위원 명단 ({members.length}명)
            </h3>
            <button onClick={addMember} className="btn-ghost text-xs flex items-center gap-1">
              <Plus size={12} />위원 추가
            </button>
          </div>

          {MEMBER_TYPES.map(type => {
            const group = members.filter(m => m.type === type)
            return (
              <div key={type}>
                <h4 className="text-xs font-semibold text-violet-300 mb-2">{type} ({group.length}명)</h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-white/10">
                      {['직위', '성명', '임기', '연락처', ''].map(h => (
                        <th key={h} className="text-left py-1.5 px-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.map(m => (
                      <tr key={m.id} className="border-b border-white/5 group">
                        <td className="py-1.5 px-2">
                          <select className="input text-xs w-24" value={m.role}
                            onChange={e => updateMember(m.id, { role: e.target.value })}>
                            {['위원장','부위원장','간사','위원'].map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 px-2">
                          <input className="input text-xs w-24" placeholder="성명" value={m.name}
                            onChange={e => updateMember(m.id, { name: e.target.value })} />
                        </td>
                        <td className="py-1.5 px-2">
                          <input className="input text-xs w-32" placeholder="예: 2025.3~2027.2" value={m.term}
                            onChange={e => updateMember(m.id, { term: e.target.value })} />
                        </td>
                        <td className="py-1.5 px-2">
                          <input className="input text-xs w-36" placeholder="010-0000-0000" value={m.phone}
                            onChange={e => updateMember(m.id, { phone: e.target.value })} />
                        </td>
                        <td className="py-1.5 px-2">
                          <button onClick={() => removeMember(m.id)}
                            className="text-red-400 opacity-0 group-hover:opacity-100">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'minutes' && (
        <div className="grid grid-cols-4 gap-4">
          {/* 회의 목록 */}
          <div className="col-span-1 space-y-1.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">회의 목록</p>
              <button onClick={addMeeting} className="btn-ghost text-xs p-0.5"><Plus size={12} /></button>
            </div>
            {meetings.map((m, i) => (
              <button key={m.id} onClick={() => setSelectedMeeting(m.id)}
                className={clsx('w-full text-left px-3 py-2 rounded-xl border text-xs transition-all',
                  m.id === selectedMeeting
                    ? 'bg-violet-500/15 border-violet-500/30 text-violet-200'
                    : 'bg-surface-800 border-white/5 text-slate-400 hover:bg-white/5'
                )}>
                <p className="font-medium">{i + 1}차 {m.meetingType}</p>
                <p className="text-slate-500 mt-0.5">{m.date}</p>
              </button>
            ))}
          </div>

          {/* 회의록 편집 */}
          <div className="col-span-3 card space-y-4">
            <h3 className="font-semibold text-white pb-3 border-b border-white/5">회의록 작성</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">회의 일자</label>
                <input type="date" className="input" value={meeting.date}
                  onChange={e => updateMeeting({ date: e.target.value })} />
              </div>
              <div>
                <label className="field-label">시각</label>
                <input type="time" className="input" value={meeting.time}
                  onChange={e => updateMeeting({ time: e.target.value })} />
              </div>
              <div>
                <label className="field-label">장소</label>
                <input className="input" value={meeting.place}
                  onChange={e => updateMeeting({ place: e.target.value })} />
              </div>
              <div>
                <label className="field-label">회의 종류</label>
                <select className="input" value={meeting.meetingType}
                  onChange={e => updateMeeting({ meetingType: e.target.value })}>
                  {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="field-label">참석위원</label>
                <input className="input" placeholder="예: 위원장 홍길동, 위원 김영희 외 5명"
                  value={meeting.attendees} onChange={e => updateMeeting({ attendees: e.target.value })} />
              </div>
            </div>

            {/* 안건 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="field-label mb-0">안건</label>
                <button onClick={addAgenda} className="btn-ghost text-xs flex items-center gap-1">
                  <Plus size={12} />안건 추가
                </button>
              </div>
              <div className="space-y-2">
                {meeting.agenda.map(a => (
                  <div key={a.id} className="p-3 bg-surface-900 rounded-xl border border-white/5 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-12">제{a.no}호</span>
                      <select className="input text-xs w-20" value={a.type}
                        onChange={e => updateAgenda(a.id, { type: e.target.value })}>
                        {AGENDA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input className="input text-xs flex-1" placeholder="안건명" value={a.title}
                        onChange={e => updateAgenda(a.id, { title: e.target.value })} />
                      <button onClick={() => removeAgenda(a.id)}
                        className="text-red-400 hover:text-red-300">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex gap-2 pl-14">
                      <input className="input text-xs flex-1" placeholder="심의 결과" value={a.result}
                        onChange={e => updateAgenda(a.id, { result: e.target.value })} />
                      <input className="input text-xs w-28" placeholder="비고" value={a.note}
                        onChange={e => updateAgenda(a.id, { note: e.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label">결정사항 및 기타</label>
              <textarea className="input h-20 resize-none" placeholder="추가 결정사항, 차기 회의 일정 등"
                value={meeting.decision} onChange={e => updateMeeting({ decision: e.target.value })} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
