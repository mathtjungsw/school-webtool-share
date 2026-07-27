import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Printer, UserCheck, BookOpen, List } from 'lucide-react'
import clsx from 'clsx'
import { format, differenceInDays, differenceInMonths } from 'date-fns'
import { ko } from 'date-fns/locale'

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────
const POSITIONS = [
  '2급정교사', '준교사', '실기교사', '기간제교사(자격미소지)',
  '보건교사', '영양교사', '사서교사', '전문상담교사', '특수교사',
]
const SUBJECTS = [
  '국어', '수학', '영어', '사회', '역사', '도덕', '과학', '기술·가정',
  '정보', '체육', '음악', '미술', '한문', '제2외국어', '진로와 직업', '기타',
]
const REASON_TYPES = ['결원보충', '한시적 증원', '파견결원보충', '교원자격미달', '기타']

const INSTRUCTOR_TYPES = [
  '시간강사', '원어민보조교사(영어)', '원어민보조교사(기타)',
  '스포츠강사', '예술강사', '돌봄전담사',
]

const GRADE_OPTIONS = ['1', '2', '3', '1·2', '2·3', '1·2·3', '전학년']

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────
interface Contract {
  id: string
  name: string
  birth: string
  position: string
  subject: string
  startDate: string
  endDate: string
  reason: string
  grade: string
  weekly: number
  salary: number
  note: string
}

interface Instructor {
  id: string
  name: string
  birth: string
  type: string
  subject: string
  startDate: string
  endDate: string
  weeklyHours: number
  grade: string
  payment: number
  note: string
}

type Tab = 'contract' | 'instructor'

// ─────────────────────────────────────────────────────────────────────────────
// 팩토리
// ─────────────────────────────────────────────────────────────────────────────
function makeContract(): Contract {
  const today = new Date()
  const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())
  return {
    id: crypto.randomUUID(),
    name: '',
    birth: '',
    position: '기간제교사(자격미소지)',
    subject: '국어',
    startDate: format(today, 'yyyy-MM-dd'),
    endDate: format(nextYear, 'yyyy-MM-dd'),
    reason: '결원보충',
    grade: '1',
    weekly: 20,
    salary: 0,
    note: '',
  }
}

function makeInstructor(): Instructor {
  const today = new Date()
  const yearEnd = new Date(today.getFullYear(), 11, 31)
  return {
    id: crypto.randomUUID(),
    name: '',
    birth: '',
    type: '시간강사',
    subject: '국어',
    startDate: format(today, 'yyyy-MM-dd'),
    endDate: format(yearEnd, 'yyyy-MM-dd'),
    weeklyHours: 10,
    grade: '1',
    payment: 0,
    note: '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────
function calcPeriod(start: string, end: string) {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (s > e) return null
  const months = differenceInMonths(e, s)
  const days = differenceInDays(e, new Date(s.getFullYear(), s.getMonth() + months, s.getDate()))
  return { months, days, total: differenceInDays(e, s) + 1 }
}

function fmtDate(dateStr: string) {
  if (!dateStr) return '─'
  try { return format(new Date(dateStr), 'yyyy. M. d.', { locale: ko }) }
  catch { return dateStr }
}

function fmtDateKo(dateStr: string) {
  if (!dateStr) return '─'
  try { return format(new Date(dateStr), 'yyyy년 M월 d일', { locale: ko }) }
  catch { return dateStr }
}

// ─────────────────────────────────────────────────────────────────────────────
// 인쇄 헬퍼 (iframe 방식)
// ─────────────────────────────────────────────────────────────────────────────
function printHtml(html: string) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      @page { size: A4; margin: 20mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Malgun Gothic', sans-serif; font-size: 13pt; color: #000; background: #fff; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #555; padding: 6px 10px; }
      th { background: #f0f0f0; font-weight: bold; }
      .center { text-align: center; }
      .right  { text-align: right; }
      .title  { font-size: 18pt; font-weight: bold; text-align: center; margin: 16px 0 24px; letter-spacing: 4px; }
      .sub    { font-size: 10pt; text-align: center; color: #555; margin-bottom: 4px; }
      .label  { background: #f5f5f5; width: 130px; color: #333; }
      .sign   { text-align: right; margin-top: 32px; font-size: 12pt; }
      .date   { text-align: center; margin-top: 16px; color: #333; }
      .notice { text-align: center; margin-top: 8px; }
    </style>
  </head><body>${html}</body></html>`)
  doc.close()
  iframe.onload = () => {
    iframe.contentWindow!.focus()
    iframe.contentWindow!.print()
    setTimeout(() => document.body.removeChild(iframe), 3000)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────────────────────
export default function ContractPage() {
  const [activeTab, setActiveTab] = useState<Tab>('contract')

  // 기간제교원 상태
  const [contracts, setContracts] = useState<Contract[]>([makeContract()])
  const [selectedContract, setSelectedContract] = useState<string>(contracts[0].id)
  const [showContractPreview, setShowContractPreview] = useState(false)

  // 시간강사 상태
  const [instructors, setInstructors] = useState<Instructor[]>([makeInstructor()])
  const [selectedInstructor, setSelectedInstructor] = useState<string>(instructors[0].id)
  const [showInstructorPreview, setShowInstructorPreview] = useState(false)

  // 기간제교원 핸들러
  const currentContract = contracts.find(c => c.id === selectedContract) ?? contracts[0]

  const addContract = () => {
    const c = makeContract()
    setContracts(prev => [...prev, c])
    setSelectedContract(c.id)
    setShowContractPreview(false)
  }
  const removeContract = (id: string) => {
    const next = contracts.filter(c => c.id !== id)
    setContracts(next)
    if (selectedContract === id && next.length > 0) setSelectedContract(next[0].id)
  }
  const updateContract = (patch: Partial<Contract>) => {
    setContracts(prev => prev.map(c => c.id === selectedContract ? { ...c, ...patch } : c))
  }

  // 시간강사 핸들러
  const currentInstructor = instructors.find(i => i.id === selectedInstructor) ?? instructors[0]

  const addInstructor = () => {
    const i = makeInstructor()
    setInstructors(prev => [...prev, i])
    setSelectedInstructor(i.id)
    setShowInstructorPreview(false)
  }
  const removeInstructor = (id: string) => {
    const next = instructors.filter(i => i.id !== id)
    setInstructors(next)
    if (selectedInstructor === id && next.length > 0) setSelectedInstructor(next[0].id)
  }
  const updateInstructor = (patch: Partial<Instructor>) => {
    setInstructors(prev => prev.map(i => i.id === selectedInstructor ? { ...i, ...patch } : i))
  }

  // 발령대장 출력
  const printRoster = () => {
    const rows = [
      ...contracts.map((c, idx) => ({
        no: idx + 1,
        name: c.name || '─',
        type: `기간제 (${c.position})`,
        subject: c.subject,
        grade: `${c.grade}학년`,
        start: fmtDate(c.startDate),
        end: fmtDate(c.endDate),
        weekly: `${c.weekly}시간`,
        note: c.note,
      })),
      ...instructors.map((i, idx) => ({
        no: contracts.length + idx + 1,
        name: i.name || '─',
        type: i.type,
        subject: i.subject,
        grade: `${i.grade}학년`,
        start: fmtDate(i.startDate),
        end: fmtDate(i.endDate),
        weekly: `${i.weeklyHours}시간`,
        note: i.note,
      })),
    ]

    const tableRows = rows.map(r => `
      <tr>
        <td class="center">${r.no}</td>
        <td class="center">${r.name}</td>
        <td>${r.type}</td>
        <td class="center">${r.subject}</td>
        <td class="center">${r.grade}</td>
        <td class="center">${r.start}</td>
        <td class="center">${r.end}</td>
        <td class="center">${r.weekly}</td>
        <td>${r.note}</td>
      </tr>`).join('')

    const today = format(new Date(), 'yyyy년 M월 d일', { locale: ko })

    const html = `
      <p class="sub">[ 별지 ]</p>
      <div class="title">계약제교원 및 시간강사 발령대장</div>
      <p class="right" style="margin-bottom:8px; font-size:11pt; color:#333;">${today} 기준</p>
      <table>
        <thead>
          <tr>
            <th style="width:40px">번호</th>
            <th style="width:70px">성명</th>
            <th style="width:160px">구분</th>
            <th style="width:80px">담당과목</th>
            <th style="width:70px">학년</th>
            <th style="width:100px">계약시작</th>
            <th style="width:100px">계약종료</th>
            <th style="width:70px">주당시수</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    `
    printHtml(html)
  }

  const contractPeriod = calcPeriod(currentContract.startDate, currentContract.endDate)

  return (
    <div className="p-6 max-w-5xl">
      {/* 헤더 */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="page-title">계약제교원 발령관리</h1>
          <p className="page-subtitle">기간제교원 및 시간강사 임용·발령 정보를 관리합니다</p>
        </div>
        <button
          onClick={printRoster}
          className="btn-secondary flex items-center gap-1.5 text-xs"
        >
          <List size={13} />발령대장 출력
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-5 p-1 bg-surface-900 rounded-xl w-fit border border-white/5">
        {([
          { key: 'contract' as Tab, label: '기간제교원', icon: <UserCheck size={13} /> },
          { key: 'instructor' as Tab, label: '시간강사', icon: <BookOpen size={13} /> },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.key
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <AnimatePresence mode="wait">
        {activeTab === 'contract' ? (
          <motion.div key="contract-tab" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            <ContractTab
              contracts={contracts}
              selected={selectedContract}
              current={currentContract}
              period={contractPeriod}
              showPreview={showContractPreview}
              onAdd={addContract}
              onRemove={removeContract}
              onSelect={id => { setSelectedContract(id); setShowContractPreview(false) }}
              onUpdate={updateContract}
              onTogglePreview={() => setShowContractPreview(s => !s)}
            />
          </motion.div>
        ) : (
          <motion.div key="instructor-tab" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            <InstructorTab
              instructors={instructors}
              selected={selectedInstructor}
              current={currentInstructor}
              showPreview={showInstructorPreview}
              onAdd={addInstructor}
              onRemove={removeInstructor}
              onSelect={id => { setSelectedInstructor(id); setShowInstructorPreview(false) }}
              onUpdate={updateInstructor}
              onTogglePreview={() => setShowInstructorPreview(s => !s)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 기간제교원 탭
// ─────────────────────────────────────────────────────────────────────────────
interface ContractTabProps {
  contracts: Contract[]
  selected: string
  current: Contract
  period: ReturnType<typeof calcPeriod>
  showPreview: boolean
  onAdd: () => void
  onRemove: (id: string) => void
  onSelect: (id: string) => void
  onUpdate: (patch: Partial<Contract>) => void
  onTogglePreview: () => void
}

function ContractTab({
  contracts, selected, current, period,
  showPreview, onAdd, onRemove, onSelect, onUpdate, onTogglePreview,
}: ContractTabProps) {
  const printContract = () => {
    const p = calcPeriod(current.startDate, current.endDate)
    const today = format(new Date(), 'yyyy년 M월 d일', { locale: ko })
    const periodStr = p
      ? `${fmtDate(current.startDate)} ~ ${fmtDate(current.endDate)} (${p.months > 0 ? p.months + '개월 ' : ''}${p.days > 0 ? p.days + '일' : ''})`
      : '─'

    const rows = [
      ['성 명', current.name || '─'],
      ['생 년 월 일', fmtDateKo(current.birth)],
      ['자 격 구 분', current.position],
      ['담 당 과 목', current.subject],
      ['담 당 학 년', `${current.grade}학년`],
      ['주 당 수 업', `${current.weekly}시간`],
      ['임 용 기 간', periodStr],
      ['임 용 사 유', current.reason],
      ['월   급   여', current.salary ? `${current.salary.toLocaleString()}원` : '별도 협의'],
      ...(current.note ? [['비 고', current.note]] : []),
    ]

    const tableRows = rows.map(([l, v]) => `
      <tr>
        <td class="label" style="width:130px">${l}</td>
        <td>${v}</td>
      </tr>`).join('')

    const html = `
      <p class="sub">[별지 제○○호 서식]</p>
      <div class="title">기간제교원 임용장</div>
      <table>${tableRows}</table>
      <p class="notice" style="margin-top:20px;">위 사람을 기간제교원으로 임용합니다.</p>
      <p class="date">${today}</p>
      <div class="sign"><p>○○학교장&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="display:inline-block;width:60px;border-bottom:1px solid #000;">&nbsp;</span></p></div>
    `
    printHtml(html)
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* 목록 */}
      <div className="col-span-1 space-y-1.5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500 font-medium">계약 목록 ({contracts.length}명)</p>
          <button onClick={onAdd} className="text-violet-400 hover:text-violet-300 transition-colors">
            <Plus size={14} />
          </button>
        </div>
        {contracts.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={clsx(
              'w-full text-left px-3 py-2.5 rounded-xl border transition-all group',
              c.id === selected
                ? 'bg-violet-500/15 border-violet-500/30 text-violet-200'
                : 'bg-surface-800 border-white/5 text-slate-300 hover:bg-white/5'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck size={13} className={c.id === selected ? 'text-violet-400' : 'text-slate-500'} />
                <span className="text-sm font-medium truncate">{c.name || '(이름 없음)'}</span>
              </div>
              {contracts.length > 1 && (
                <button onClick={e => { e.stopPropagation(); onRemove(c.id) }}
                  className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 pl-5">{c.position}</p>
          </button>
        ))}
      </div>

      {/* 편집 / 미리보기 */}
      <div className="col-span-3">
        <AnimatePresence mode="wait">
          {showPreview ? (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="card border-white/10">
              <ContractPreviewSheet contract={current} period={period} />
              <div className="flex justify-end gap-2 pt-4 border-t border-white/5 mt-4">
                <button onClick={onTogglePreview} className="btn-secondary text-xs">편집 보기</button>
                <button onClick={printContract} className="btn-primary flex items-center gap-1.5 text-xs">
                  <Printer size={13} />인쇄
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 className="font-semibold text-white">발령 정보 입력</h3>
                <button onClick={onTogglePreview} className="btn-secondary flex items-center gap-1.5 text-xs">
                  <Printer size={13} />발령서 미리보기
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">성명</label>
                  <input className="input" placeholder="홍길동" value={current.name}
                    onChange={e => onUpdate({ name: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">생년월일</label>
                  <input type="date" className="input" value={current.birth}
                    onChange={e => onUpdate({ birth: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">자격 구분</label>
                  <select className="input" value={current.position}
                    onChange={e => onUpdate({ position: e.target.value })}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">담당 과목</label>
                  <select className="input" value={current.subject}
                    onChange={e => onUpdate({ subject: e.target.value })}>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">계약 시작일</label>
                  <input type="date" className="input" value={current.startDate}
                    onChange={e => onUpdate({ startDate: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">계약 종료일</label>
                  <input type="date" className="input" value={current.endDate}
                    onChange={e => onUpdate({ endDate: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">임용 사유</label>
                  <select className="input" value={current.reason}
                    onChange={e => onUpdate({ reason: e.target.value })}>
                    {REASON_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">담당 학년</label>
                  <select className="input" value={current.grade}
                    onChange={e => onUpdate({ grade: e.target.value })}>
                    {GRADE_OPTIONS.map(g => (
                      <option key={g} value={g}>{g}학년</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">주당 수업시간</label>
                  <input type="number" min="1" max="40" className="input" value={current.weekly}
                    onChange={e => onUpdate({ weekly: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="field-label">월 급여 (원)</label>
                  <input type="number" className="input" placeholder="2,500,000"
                    value={current.salary || ''}
                    onChange={e => onUpdate({ salary: Number(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <label className="field-label">비고</label>
                  <input className="input" placeholder="특이사항 입력" value={current.note}
                    onChange={e => onUpdate({ note: e.target.value })} />
                </div>
              </div>

              {period && (
                <div className="mt-2 flex gap-3 text-sm text-slate-400">
                  <span>계약기간:</span>
                  <span className="text-white font-medium">
                    {period.months > 0 ? `${period.months}개월 ` : ''}{period.days > 0 ? `${period.days}일 ` : ''}
                    (총 {period.total}일)
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 기간제교원 미리보기
// ─────────────────────────────────────────────────────────────────────────────
function ContractPreviewSheet({ contract: c, period }: { contract: Contract; period: ReturnType<typeof calcPeriod> }) {
  const today = format(new Date(), 'yyyy년 M월 d일', { locale: ko })
  return (
    <div className="font-serif text-slate-200 p-4 space-y-4 text-sm">
      <div className="text-center space-y-1 pb-4 border-b border-white/10">
        <p className="text-xs text-slate-500">[별지 제○○호 서식]</p>
        <h2 className="text-xl font-bold text-white tracking-widest">기간제교원 임용장</h2>
      </div>

      <table className="w-full border-collapse text-sm">
        {[
          ['성 명', c.name || '─'],
          ['생년월일', fmtDateKo(c.birth)],
          ['자격 구분', c.position],
          ['담당 과목', c.subject],
          ['담당 학년', `${c.grade}학년`],
          ['주당 수업', `${c.weekly}시간`],
          ['임용 기간', period
            ? `${fmtDate(c.startDate)} ~ ${fmtDate(c.endDate)} (${period.months > 0 ? period.months + '개월 ' : ''}${period.days > 0 ? period.days + '일' : ''})`
            : '─'],
          ['임용 사유', c.reason],
          ['월 급여', c.salary ? `${c.salary.toLocaleString()}원` : '별도 협의'],
        ].map(([label, value]) => (
          <tr key={label} className="border-b border-white/5">
            <td className="w-28 py-2 px-3 text-slate-500 bg-surface-900">{label}</td>
            <td className="py-2 px-3">{value}</td>
          </tr>
        ))}
        {c.note && (
          <tr className="border-b border-white/5">
            <td className="py-2 px-3 text-slate-500 bg-surface-900">비 고</td>
            <td className="py-2 px-3">{c.note}</td>
          </tr>
        )}
      </table>

      <div className="text-center space-y-3 pt-4">
        <p>위 사람을 기간제교원으로 임용합니다.</p>
        <p className="text-slate-400">{today}</p>
        <div className="mt-6 flex justify-end">
          <div className="text-center space-y-1">
            <p className="text-slate-400">○○학교장</p>
            <div className="w-20 h-6 border-b border-white/20 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 시간강사 탭
// ─────────────────────────────────────────────────────────────────────────────
interface InstructorTabProps {
  instructors: Instructor[]
  selected: string
  current: Instructor
  showPreview: boolean
  onAdd: () => void
  onRemove: (id: string) => void
  onSelect: (id: string) => void
  onUpdate: (patch: Partial<Instructor>) => void
  onTogglePreview: () => void
}

function InstructorTab({
  instructors, selected, current,
  showPreview, onAdd, onRemove, onSelect, onUpdate, onTogglePreview,
}: InstructorTabProps) {
  // 월 예상 급여 = 주당시수 × 4.33 × 시간당강사료
  const monthlyEstimate = Math.round(current.weeklyHours * 4.33 * current.payment)

  const printInstructor = () => {
    const today = format(new Date(), 'yyyy년 M월 d일', { locale: ko })
    const startParts = current.startDate ? current.startDate.split('-') : ['', '', '']
    const endParts = current.endDate ? current.endDate.split('-') : ['', '', '']

    const rows = [
      ['성       명', current.name || '─'],
      ['생 년 월 일', fmtDateKo(current.birth)],
      ['강 사 유 형', current.type],
      ['담 당 과 목', current.subject],
      ['담 당 학 년', `${current.grade}학년`],
      ['주 당 시 수', `( ${current.weeklyHours} )시간`],
      ['계 약 기 간', `${startParts[0]}년 ${startParts[1]}월 ${startParts[2]}일 ~ ${endParts[0]}년 ${endParts[1]}월 ${endParts[2]}일`],
      ['시간당강사료', `( ${current.payment.toLocaleString()} )원`],
      ...(current.note ? [['비       고', current.note]] : []),
    ]

    const tableRows = rows.map(([l, v]) => `
      <tr>
        <td class="label" style="width:140px">${l}</td>
        <td>${v}</td>
      </tr>`).join('')

    const html = `
      <div class="title">시간강사 위촉장</div>
      <p style="text-align:center; margin-bottom:20px;">위 사람을 아래와 같이 위촉합니다.</p>
      <table>${tableRows}</table>
      <p class="date" style="margin-top:24px;">위촉일: ${today}</p>
      <div class="sign"><p>(학교장명)&nbsp;&nbsp;귀중</p></div>
    `
    printHtml(html)
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* 목록 */}
      <div className="col-span-1 space-y-1.5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500 font-medium">강사 목록 ({instructors.length}명)</p>
          <button onClick={onAdd} className="text-violet-400 hover:text-violet-300 transition-colors">
            <Plus size={14} />
          </button>
        </div>
        {instructors.map(i => (
          <button
            key={i.id}
            onClick={() => onSelect(i.id)}
            className={clsx(
              'w-full text-left px-3 py-2.5 rounded-xl border transition-all group',
              i.id === selected
                ? 'bg-violet-500/15 border-violet-500/30 text-violet-200'
                : 'bg-surface-800 border-white/5 text-slate-300 hover:bg-white/5'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen size={13} className={i.id === selected ? 'text-violet-400' : 'text-slate-500'} />
                <span className="text-sm font-medium truncate">{i.name || '(이름 없음)'}</span>
              </div>
              {instructors.length > 1 && (
                <button onClick={e => { e.stopPropagation(); onRemove(i.id) }}
                  className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300 shrink-0">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 pl-5">{i.type}</p>
            <p className="text-xs text-slate-600 mt-0.5 pl-5">{i.subject} · {i.startDate?.slice(0, 7)} ~</p>
          </button>
        ))}
      </div>

      {/* 편집 / 미리보기 */}
      <div className="col-span-3">
        <AnimatePresence mode="wait">
          {showPreview ? (
            <motion.div key="instr-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="card border-white/10">
              <InstructorPreviewSheet instructor={current} />
              <div className="flex justify-end gap-2 pt-4 border-t border-white/5 mt-4">
                <button onClick={onTogglePreview} className="btn-secondary text-xs">편집 보기</button>
                <button onClick={printInstructor} className="btn-primary flex items-center gap-1.5 text-xs">
                  <Printer size={13} />인쇄
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="instr-edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="card space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 className="font-semibold text-white">강사 정보 입력</h3>
                <button onClick={onTogglePreview} className="btn-secondary flex items-center gap-1.5 text-xs">
                  <Printer size={13} />위촉장 미리보기
                </button>
              </div>

              {/* 기본정보 */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wide">기본정보</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">성명</label>
                    <input className="input" placeholder="홍길동" value={current.name}
                      onChange={e => onUpdate({ name: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label">생년월일</label>
                    <input type="date" className="input" value={current.birth}
                      onChange={e => onUpdate({ birth: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label">강사 유형</label>
                    <select className="input" value={current.type}
                      onChange={e => onUpdate({ type: e.target.value })}>
                      {INSTRUCTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">담당 과목</label>
                    <select className="input" value={current.subject}
                      onChange={e => onUpdate({ subject: e.target.value })}>
                      {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* 계약정보 */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wide">계약정보</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">계약 시작일</label>
                    <input type="date" className="input" value={current.startDate}
                      onChange={e => onUpdate({ startDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label">계약 종료일</label>
                    <input type="date" className="input" value={current.endDate}
                      onChange={e => onUpdate({ endDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label">주당 수업시수</label>
                    <input type="number" min="1" max="40" className="input" value={current.weeklyHours}
                      onChange={e => onUpdate({ weeklyHours: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="field-label">담당 학년</label>
                    <select className="input" value={current.grade}
                      onChange={e => onUpdate({ grade: e.target.value })}>
                      {GRADE_OPTIONS.map(g => (
                        <option key={g} value={g}>{g === '전학년' ? '전학년' : `${g}학년`}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 급여정보 */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wide">급여정보</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">시간당 강사료 (원)</label>
                    <input type="number" className="input" placeholder="40,000"
                      value={current.payment || ''}
                      onChange={e => onUpdate({ payment: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="field-label">월 예상 급여 (자동계산)</label>
                    <div className="input bg-surface-900 text-slate-400 cursor-default select-none">
                      {monthlyEstimate > 0
                        ? `${monthlyEstimate.toLocaleString()}원`
                        : '─ (주당시수 × 4.33 × 강사료)'}
                    </div>
                  </div>
                </div>
                {monthlyEstimate > 0 && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    계산: {current.weeklyHours}시간 × 4.33 × {current.payment.toLocaleString()}원 = {monthlyEstimate.toLocaleString()}원
                  </p>
                )}
              </div>

              {/* 비고 */}
              <div>
                <label className="field-label">비고</label>
                <input className="input" placeholder="특이사항 입력" value={current.note}
                  onChange={e => onUpdate({ note: e.target.value })} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 시간강사 미리보기
// ─────────────────────────────────────────────────────────────────────────────
function InstructorPreviewSheet({ instructor: i }: { instructor: Instructor }) {
  const today = format(new Date(), 'yyyy년 M월 d일', { locale: ko })
  const startParts = i.startDate ? i.startDate.split('-') : ['', '', '']
  const endParts = i.endDate ? i.endDate.split('-') : ['', '', '']

  return (
    <div className="font-serif text-slate-200 p-4 space-y-4 text-sm">
      <div className="text-center space-y-1 pb-4 border-b border-white/10">
        <h2 className="text-xl font-bold text-white tracking-widest">시간강사 위촉장</h2>
      </div>

      <p className="text-center text-slate-300 py-2">위 사람을 아래와 같이 위촉합니다.</p>

      <table className="w-full border-collapse text-sm">
        {[
          ['성       명', i.name || '─'],
          ['생 년 월 일', fmtDateKo(i.birth)],
          ['강 사 유 형', i.type],
          ['담 당 과 목', i.subject],
          ['담 당 학 년', `${i.grade}학년`],
          ['주 당 시 수', `( ${i.weeklyHours} )시간`],
          ['계 약 기 간', `${startParts[0]}년 ${startParts[1]}월 ${startParts[2]}일 ~ ${endParts[0]}년 ${endParts[1]}월 ${endParts[2]}일`],
          ['시간당강사료', `( ${i.payment.toLocaleString()} )원`],
        ].map(([label, value]) => (
          <tr key={label} className="border-b border-white/5">
            <td className="w-32 py-2 px-3 text-slate-500 bg-surface-900">{label}</td>
            <td className="py-2 px-3">{value}</td>
          </tr>
        ))}
        {i.note && (
          <tr className="border-b border-white/5">
            <td className="py-2 px-3 text-slate-500 bg-surface-900">비       고</td>
            <td className="py-2 px-3">{i.note}</td>
          </tr>
        )}
      </table>

      <div className="text-center space-y-3 pt-4">
        <p className="text-slate-400">위촉일: {today}</p>
        <div className="mt-4 flex justify-end">
          <div className="text-center">
            <p className="text-slate-400">(학교장명)&nbsp;&nbsp;귀중</p>
          </div>
        </div>
      </div>
    </div>
  )
}
