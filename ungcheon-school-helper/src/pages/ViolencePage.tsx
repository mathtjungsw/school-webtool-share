import { useState } from 'react'
import { Shield, CheckCircle2, Circle, ChevronDown, ChevronRight, Printer, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'

const VIOLENCE_TYPES = [
  '신체폭력', '언어폭력', '금품갈취', '강요', '따돌림',
  '성폭력', '사이버폭력', '스토킹', '복합유형', '기타',
]

interface CaseInfo {
  date: string
  place: string
  type: string
  summary: string
  victimName: string
  victimGrade: string
  victimClass: string
  offenderName: string
  offenderGrade: string
  offenderClass: string
  witness: string
  reportDate: string
  reporter: string
}

interface CheckItem { id: string; label: string; done: boolean }

const CHECKLIST_STEPS: { title: string; items: CheckItem[] }[] = [
  {
    title: '1단계: 즉시 조치 (사안 인지 후 48시간 이내)',
    items: [
      { id: 'c1', label: '피해학생 안전 조치 및 분리', done: false },
      { id: 'c2', label: '학교장 보고', done: false },
      { id: 'c3', label: '피해학생 보호자 통보', done: false },
      { id: 'c4', label: '가해학생 보호자 통보', done: false },
      { id: 'c5', label: '117 신고 여부 확인 (중대한 경우 즉시 신고)', done: false },
    ],
  },
  {
    title: '2단계: 사안 조사 (7일 이내)',
    items: [
      { id: 'c6', label: '피해학생 면담 (동의서 첨부)', done: false },
      { id: 'c7', label: '가해학생 면담', done: false },
      { id: 'c8', label: '목격학생·주변학생 면담', done: false },
      { id: 'c9', label: 'CCTV 등 증거자료 확보', done: false },
      { id: 'c10', label: '사안 조사 보고서 작성', done: false },
    ],
  },
  {
    title: '3단계: 전담기구 심의',
    items: [
      { id: 'c11', label: '전담기구 구성·소집 (14일 이내)', done: false },
      { id: 'c12', label: '피해·가해 학생 학부모 의견 청취', done: false },
      { id: 'c13', label: '심의 결과 기록', done: false },
      { id: 'c14', label: '학교장 자체 해결 적합 여부 판단', done: false },
    ],
  },
  {
    title: '4단계: 심의위원회 개최 또는 학교장 자체 해결',
    items: [
      { id: 'c15', label: '교육지원청 심의위원회 신청 (자체해결 불가 시)', done: false },
      { id: 'c16', label: '피해학생 보호조치 결정·이행', done: false },
      { id: 'c17', label: '가해학생 선도조치 결정·이행', done: false },
      { id: 'c18', label: '조치 결과 학생부 기재', done: false },
    ],
  },
  {
    title: '5단계: 사후 관리',
    items: [
      { id: 'c19', label: '피해학생 심리상담 지원', done: false },
      { id: 'c20', label: '가해학생 특별교육 이수 확인', done: false },
      { id: 'c21', label: '관계회복 프로그램 운영', done: false },
      { id: 'c22', label: '재발 방지 모니터링', done: false },
    ],
  },
]

export default function ViolencePage() {
  const [info, setInfo] = useState<CaseInfo>({
    date: '', place: '', type: '신체폭력', summary: '',
    victimName: '', victimGrade: '1', victimClass: '1',
    offenderName: '', offenderGrade: '1', offenderClass: '1',
    witness: '', reportDate: format(new Date(), 'yyyy-MM-dd'), reporter: '',
  })
  const [steps, setSteps] = useState(CHECKLIST_STEPS.map(s => ({
    ...s, items: s.items.map(i => ({ ...i })), open: true,
  })))
  const [tab, setTab] = useState<'input' | 'checklist' | 'form'>('input')

  const updateInfo = (patch: Partial<CaseInfo>) => setInfo(i => ({ ...i, ...patch }))

  const toggleItem = (stepIdx: number, itemId: string) => {
    setSteps(prev => prev.map((s, si) => si !== stepIdx ? s : {
      ...s,
      items: s.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i),
    }))
  }

  const toggleStep = (idx: number) => setSteps(prev => prev.map((s, si) => si === idx ? { ...s, open: !s.open } : s))

  const totalItems = steps.reduce((s, step) => s + step.items.length, 0)
  const doneItems  = steps.reduce((s, step) => s + step.items.filter(i => i.done).length, 0)
  const progress = Math.round((doneItems / totalItems) * 100)

  const reset = () => {
    setInfo({ date: '', place: '', type: '신체폭력', summary: '', victimName: '', victimGrade: '1', victimClass: '1', offenderName: '', offenderGrade: '1', offenderClass: '1', witness: '', reportDate: format(new Date(), 'yyyy-MM-dd'), reporter: '' })
    setSteps(CHECKLIST_STEPS.map(s => ({ ...s, items: s.items.map(i => ({ ...i, done: false })), open: true })))
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="page-title">학교폭력 사안처리</h1>
          <p className="page-subtitle">사안 정보 기록 및 처리 단계별 체크리스트를 제공합니다</p>
        </div>
        <button onClick={reset} className="btn-secondary flex items-center gap-1.5 text-xs">
          <RefreshCw size={12} />초기화
        </button>
      </div>

      {/* 진행률 */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400">처리 진행률</span>
          <span className="text-sm font-semibold text-white">{doneItems}/{totalItems} ({progress}%)</span>
        </div>
        <div className="h-2 bg-surface-900 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-surface-800 p-1 rounded-xl w-fit">
        {([['input', '사안 정보'], ['checklist', '처리 체크리스트'], ['form', '서식 미리보기']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm transition-all',
              tab === v ? 'bg-violet-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            )}>{l}</button>
        ))}
      </div>

      {tab === 'input' && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-white pb-3 border-b border-white/5">사안 정보</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">발생 일시</label>
              <input type="datetime-local" className="input" value={info.date}
                onChange={e => updateInfo({ date: e.target.value })} />
            </div>
            <div>
              <label className="field-label">발생 장소</label>
              <input className="input" placeholder="교실, 복도, 화장실 등" value={info.place}
                onChange={e => updateInfo({ place: e.target.value })} />
            </div>
            <div>
              <label className="field-label">폭력 유형</label>
              <select className="input" value={info.type} onChange={e => updateInfo({ type: e.target.value })}>
                {VIOLENCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">인지(신고)일</label>
              <input type="date" className="input" value={info.reportDate}
                onChange={e => updateInfo({ reportDate: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 space-y-2">
              <p className="text-xs font-semibold text-sky-300">피해학생</p>
              <input className="input text-sm" placeholder="성명" value={info.victimName}
                onChange={e => updateInfo({ victimName: e.target.value })} />
              <div className="flex gap-2">
                <select className="input text-sm flex-1" value={info.victimGrade}
                  onChange={e => updateInfo({ victimGrade: e.target.value })}>
                  {['1','2','3'].map(g => <option key={g} value={g}>{g}학년</option>)}
                </select>
                <select className="input text-sm flex-1" value={info.victimClass}
                  onChange={e => updateInfo({ victimClass: e.target.value })}>
                  {Array.from({length:15},(_,i)=>String(i+1)).map(c => <option key={c} value={c}>{c}반</option>)}
                </select>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
              <p className="text-xs font-semibold text-red-300">가해학생</p>
              <input className="input text-sm" placeholder="성명 (복수 시 쉼표 구분)" value={info.offenderName}
                onChange={e => updateInfo({ offenderName: e.target.value })} />
              <div className="flex gap-2">
                <select className="input text-sm flex-1" value={info.offenderGrade}
                  onChange={e => updateInfo({ offenderGrade: e.target.value })}>
                  {['1','2','3'].map(g => <option key={g} value={g}>{g}학년</option>)}
                </select>
                <select className="input text-sm flex-1" value={info.offenderClass}
                  onChange={e => updateInfo({ offenderClass: e.target.value })}>
                  {Array.from({length:15},(_,i)=>String(i+1)).map(c => <option key={c} value={c}>{c}반</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="field-label">목격자</label>
            <input className="input" placeholder="없음 또는 성명 입력" value={info.witness}
              onChange={e => updateInfo({ witness: e.target.value })} />
          </div>
          <div>
            <label className="field-label">사안 개요</label>
            <textarea className="input h-24 resize-none" placeholder="발생 경위를 육하원칙에 따라 기록하세요"
              value={info.summary} onChange={e => updateInfo({ summary: e.target.value })} />
          </div>
          <div>
            <label className="field-label">보고자 (교원)</label>
            <input className="input" placeholder="이름 (직위)" value={info.reporter}
              onChange={e => updateInfo({ reporter: e.target.value })} />
          </div>
        </div>
      )}

      {tab === 'checklist' && (
        <div className="space-y-3">
          {steps.map((step, si) => {
            const stepDone = step.items.filter(i => i.done).length
            return (
              <div key={si} className="card">
                <button onClick={() => toggleStep(si)}
                  className="w-full flex items-center justify-between text-left">
                  <div className="flex items-center gap-2">
                    {step.open ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-500" />}
                    <span className="font-medium text-white text-sm">{step.title}</span>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full border',
                    stepDone === step.items.length
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-slate-400'
                  )}>
                    {stepDone}/{step.items.length}
                  </span>
                </button>
                {step.open && (
                  <div className="mt-3 space-y-2">
                    {step.items.map(item => (
                      <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                        <button onClick={() => toggleItem(si, item.id)}
                          className={clsx('flex-shrink-0 transition-colors',
                            item.done ? 'text-emerald-400' : 'text-slate-600 group-hover:text-slate-400'
                          )}>
                          {item.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        </button>
                        <span className={clsx('text-sm', item.done ? 'line-through text-slate-500' : 'text-slate-300')}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'form' && (
        <div className="card space-y-4 text-sm">
          <div className="text-center pb-3 border-b border-white/10">
            <h2 className="text-lg font-bold text-white">학교폭력 사안 처리 보고서</h2>
            <p className="text-xs text-slate-500 mt-1">
              {info.reportDate ? format(new Date(info.reportDate), 'yyyy년 M월 d일') : '날짜 미입력'} 보고
            </p>
          </div>
          <table className="w-full border-collapse">
            {[
              ['발생 일시', info.date ? info.date.replace('T', ' ') : '─'],
              ['발생 장소', info.place || '─'],
              ['폭력 유형', info.type],
              ['피해학생', info.victimName ? `${info.victimGrade}학년 ${info.victimClass}반 ${info.victimName}` : '─'],
              ['가해학생', info.offenderName ? `${info.offenderGrade}학년 ${info.offenderClass}반 ${info.offenderName}` : '─'],
              ['목격자', info.witness || '없음'],
              ['보고자', info.reporter || '─'],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-white/5">
                <td className="w-24 py-2 px-3 text-slate-500 bg-surface-900 text-xs">{label}</td>
                <td className="py-2 px-3 text-slate-200">{value}</td>
              </tr>
            ))}
          </table>
          {info.summary && (
            <div>
              <p className="text-xs text-slate-500 mb-1">사안 개요</p>
              <div className="p-3 bg-surface-900 rounded-xl text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                {info.summary}
              </div>
            </div>
          )}
          <p className="text-xs text-slate-600">
            ※ 본 서식은 참고용입니다. 실제 처리는 「학교폭력예방 및 대책에 관한 법률」에 따라 진행하세요.
          </p>
        </div>
      )}
    </div>
  )
}
