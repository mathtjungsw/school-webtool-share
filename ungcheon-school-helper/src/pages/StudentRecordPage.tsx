import { useState } from 'react'
import { Plus, Trash2, Printer, RefreshCw, User, ArrowRight, ArrowLeft, MinusCircle, XCircle } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import clsx from 'clsx'

type RecordType = 'transfer_in' | 'transfer_out' | 'hold' | 'expel'

interface StudentRecord {
  id: string
  type: RecordType
  // 공통
  studentName: string
  grade: string
  classNm: string
  studentNum: string
  birthDate: string
  guardianName: string
  // 전입
  prevSchool: string
  prevGrade: string
  transferInDate: string
  // 전출
  destSchool: string
  transferOutDate: string
  transferOutReason: string
  // 유급
  holdYear: string
  holdReason: string
  // 퇴학
  expelDate: string
  expelReason: string
  principalApproval: string
  teacherNote: string
}

const TYPE_META: Record<RecordType, { label: string; color: string; icon: React.ElementType; desc: string }> = {
  transfer_in:  { label: '전입',  color: 'emerald', icon: ArrowRight, desc: '타교에서 전입하는 학생 처리' },
  transfer_out: { label: '전출',  color: 'sky',     icon: ArrowLeft,  desc: '타교·타지역으로 전출하는 학생 처리' },
  hold:         { label: '유급',  color: 'amber',   icon: MinusCircle, desc: '진급 불가 · 유급 처리' },
  expel:        { label: '퇴학',  color: 'red',     icon: XCircle,    desc: '징계·자퇴 등 학적 말소 처리' },
}

function makeRecord(type: RecordType): StudentRecord {
  return {
    id: crypto.randomUUID(), type,
    studentName: '', grade: '', classNm: '', studentNum: '', birthDate: '', guardianName: '',
    prevSchool: '', prevGrade: '', transferInDate: '',
    destSchool: '', transferOutDate: '', transferOutReason: '',
    holdYear: '', holdReason: '',
    expelDate: '', expelReason: '', principalApproval: '',
    teacherNote: '',
  }
}

export default function StudentRecordPage() {
  const { config } = useAppStore()
  const [records, setRecords] = useState<StudentRecord[]>([makeRecord('transfer_in')])
  const [selected, setSelected] = useState<string>(records[0].id)
  const [activeType, setActiveType] = useState<RecordType>('transfer_in')

  const schoolName = config.schoolName ?? '○○학교'
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '. ')

  const addRecord = () => {
    const r = makeRecord(activeType)
    setRecords(prev => [...prev, r])
    setSelected(r.id)
  }

  const removeRecord = (id: string) => {
    setRecords(prev => {
      const next = prev.filter(r => r.id !== id)
      if (selected === id) setSelected(next[next.length - 1]?.id ?? '')
      return next
    })
  }

  const currentRecord = records.find(r => r.id === selected) ?? records[0]

  const update = (patch: Partial<StudentRecord>) =>
    setRecords(prev => prev.map(r => r.id === selected ? { ...r, ...patch } : r))

  const filteredRecords = records.filter(r => r.type === activeType)

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="page-title">학적업무</h1>
        <p className="page-subtitle">전입·전출·유급·퇴학 처리 서식을 작성하고 출력합니다</p>
      </div>

      {/* 유형 선택 탭 */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {(Object.entries(TYPE_META) as [RecordType, typeof TYPE_META[RecordType]][]).map(([type, meta]) => {
          const Icon = meta.icon
          const count = records.filter(r => r.type === type).length
          return (
            <button
              key={type}
              onClick={() => {
                setActiveType(type)
                const f = records.find(r => r.type === type)
                if (f) {
                  setSelected(f.id)
                } else {
                  // 해당 유형 레코드가 없으면 자동 생성
                  const r = makeRecord(type)
                  setRecords(prev => [...prev, r])
                  setSelected(r.id)
                }
              }}
              className={clsx(
                'card text-left transition-all border-2',
                activeType === type
                  ? `border-${meta.color}-500/50 bg-${meta.color}-500/10`
                  : 'border-transparent hover:border-white/10'
              )}
            >
              <div className={clsx('flex items-center gap-2 mb-1', `text-${meta.color}-400`)}>
                <Icon size={14} />
                <span className="font-semibold text-sm">{meta.label}</span>
                {count > 0 && (
                  <span className={clsx('ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold',
                    `bg-${meta.color}-500/20 text-${meta.color}-300`)}>{count}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-snug">{meta.desc}</p>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* 목록 */}
        <div className="col-span-1 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500 font-medium">
              {TYPE_META[activeType].label} 목록
            </span>
            <button onClick={addRecord} className="btn-ghost p-1 text-xs flex items-center gap-0.5">
              <Plus size={11} />추가
            </button>
          </div>
          {filteredRecords.length === 0 && (
            <button onClick={addRecord}
              className="w-full py-3 border border-dashed border-white/10 rounded-xl text-xs text-slate-600 hover:border-white/20 hover:text-slate-400 transition-all flex items-center justify-center gap-1">
              <Plus size={11} />처리 학생 추가
            </button>
          )}
          {filteredRecords.map(r => (
            <div key={r.id}
              onClick={() => setSelected(r.id)}
              className={clsx(
                'group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer border transition-all',
                selected === r.id
                  ? 'bg-violet-500/15 border-violet-500/30 text-white'
                  : 'border-transparent hover:bg-white/5 text-slate-400'
              )}>
              <User size={12} className="flex-shrink-0" />
              <span className="text-xs truncate flex-1">
                {r.studentName || '(이름 없음)'}
              </span>
              <button
                onClick={e => { e.stopPropagation(); removeRecord(r.id) }}
                className="opacity-0 group-hover:opacity-100 text-red-400 p-0.5">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>

        {/* 편집 + 미리보기 */}
        {currentRecord && currentRecord.type === activeType && (
          <>
            <div className="col-span-2 space-y-3">
              {/* 공통 학생 정보 */}
              <div className="card space-y-2.5">
                <h3 className="font-semibold text-white text-sm border-b border-white/5 pb-2">기본 정보</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="field-label">학년</label>
                    <input className="input text-center" value={currentRecord.grade}
                      onChange={e => update({ grade: e.target.value })} placeholder="2" /></div>
                  <div><label className="field-label">반</label>
                    <input className="input text-center" value={currentRecord.classNm}
                      onChange={e => update({ classNm: e.target.value })} placeholder="3" /></div>
                  <div><label className="field-label">번호</label>
                    <input className="input text-center" value={currentRecord.studentNum}
                      onChange={e => update({ studentNum: e.target.value })} placeholder="15" /></div>
                </div>
                <div><label className="field-label">학생 성명</label>
                  <input className="input" value={currentRecord.studentName}
                    onChange={e => update({ studentName: e.target.value })} placeholder="홍길동" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="field-label">생년월일</label>
                    <input type="date" className="input text-xs" value={currentRecord.birthDate}
                      onChange={e => update({ birthDate: e.target.value })} /></div>
                  <div><label className="field-label">보호자</label>
                    <input className="input" value={currentRecord.guardianName}
                      onChange={e => update({ guardianName: e.target.value })} placeholder="홍아버지" /></div>
                </div>
              </div>

              {/* 유형별 세부 정보 */}
              {activeType === 'transfer_in' && (
                <div className="card space-y-2.5">
                  <h3 className="font-semibold text-emerald-300 text-sm border-b border-white/5 pb-2">전입 정보</h3>
                  <div><label className="field-label">전입 전 학교</label>
                    <input className="input" value={currentRecord.prevSchool}
                      onChange={e => update({ prevSchool: e.target.value })} placeholder="○○중학교" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="field-label">전 학교 학년</label>
                      <input className="input" value={currentRecord.prevGrade}
                        onChange={e => update({ prevGrade: e.target.value })} placeholder="2학년" /></div>
                    <div><label className="field-label">전입일</label>
                      <input type="date" className="input text-xs" value={currentRecord.transferInDate}
                        onChange={e => update({ transferInDate: e.target.value })} /></div>
                  </div>
                  <div><label className="field-label">담당 교사 메모</label>
                    <textarea className="input w-full h-16 resize-none text-xs" value={currentRecord.teacherNote}
                      onChange={e => update({ teacherNote: e.target.value })}
                      placeholder="전입 관련 특이사항, 전입서류 수령 여부 등" /></div>
                </div>
              )}

              {activeType === 'transfer_out' && (
                <div className="card space-y-2.5">
                  <h3 className="font-semibold text-sky-300 text-sm border-b border-white/5 pb-2">전출 정보</h3>
                  <div><label className="field-label">전출 예정 학교</label>
                    <input className="input" value={currentRecord.destSchool}
                      onChange={e => update({ destSchool: e.target.value })} placeholder="○○중학교" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="field-label">전출일</label>
                      <input type="date" className="input text-xs" value={currentRecord.transferOutDate}
                        onChange={e => update({ transferOutDate: e.target.value })} /></div>
                    <div><label className="field-label">사유</label>
                      <input className="input" value={currentRecord.transferOutReason}
                        onChange={e => update({ transferOutReason: e.target.value })} placeholder="거주지 이전" /></div>
                  </div>
                  <div><label className="field-label">담당 교사 메모</label>
                    <textarea className="input w-full h-16 resize-none text-xs" value={currentRecord.teacherNote}
                      onChange={e => update({ teacherNote: e.target.value })}
                      placeholder="전출서류 발급 여부, 학생부 이관 등" /></div>
                </div>
              )}

              {activeType === 'hold' && (
                <div className="card space-y-2.5">
                  <h3 className="font-semibold text-amber-300 text-sm border-b border-white/5 pb-2">유급 정보</h3>
                  <div><label className="field-label">유급 학년</label>
                    <input className="input" value={currentRecord.holdYear}
                      onChange={e => update({ holdYear: e.target.value })} placeholder="2학년 → 재이수" /></div>
                  <div><label className="field-label">유급 사유</label>
                    <textarea className="input w-full h-20 resize-none text-xs" value={currentRecord.holdReason}
                      onChange={e => update({ holdReason: e.target.value })}
                      placeholder="출석일수 부족 (연간 수업일수의 1/3 이상 결석)" /></div>
                  <div><label className="field-label">교장 결재 일자</label>
                    <input type="date" className="input text-xs" value={currentRecord.principalApproval}
                      onChange={e => update({ principalApproval: e.target.value })} /></div>
                  <div><label className="field-label">담당 교사 메모</label>
                    <textarea className="input w-full h-16 resize-none text-xs" value={currentRecord.teacherNote}
                      onChange={e => update({ teacherNote: e.target.value })}
                      placeholder="보호자 상담 일자, 특이사항 등" /></div>
                </div>
              )}

              {activeType === 'expel' && (
                <div className="card space-y-2.5">
                  <h3 className="font-semibold text-red-300 text-sm border-b border-white/5 pb-2">퇴학 정보</h3>
                  <div><label className="field-label">퇴학 일자</label>
                    <input type="date" className="input text-xs" value={currentRecord.expelDate}
                      onChange={e => update({ expelDate: e.target.value })} /></div>
                  <div><label className="field-label">퇴학 사유</label>
                    <textarea className="input w-full h-20 resize-none text-xs" value={currentRecord.expelReason}
                      onChange={e => update({ expelReason: e.target.value })}
                      placeholder="「초·중등교육법」 제18조에 따른 퇴학 사유를 기재하세요." /></div>
                  <div><label className="field-label">교장 결재 일자</label>
                    <input type="date" className="input text-xs" value={currentRecord.principalApproval}
                      onChange={e => update({ principalApproval: e.target.value })} /></div>
                  <div><label className="field-label">담당 교사 메모</label>
                    <textarea className="input w-full h-16 resize-none text-xs" value={currentRecord.teacherNote}
                      onChange={e => update({ teacherNote: e.target.value })}
                      placeholder="보호자 통보 일자, 이의신청 여부 등" /></div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => window.print()} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <Printer size={14} />출력/저장
                </button>
                <button onClick={() => update(makeRecord(activeType))} className="btn-ghost p-2.5" title="초기화">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* 서식 미리보기 */}
            <div className="col-span-2">
              <div className="card p-5 overflow-auto" style={{ background: 'white', minHeight: 500 }}>
                <RecordPreview record={currentRecord} schoolName={schoolName} today={today} />
              </div>
            </div>
          </>
        )}

        {(!currentRecord || currentRecord.type !== activeType) && (
          <div className="col-span-4 card flex items-center justify-center py-20 text-slate-500">
            <div className="text-center">
              <User size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">좌측에서 학생을 선택하거나 추가하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RecordPreview({ record, schoolName, today }: { record: StudentRecord, schoolName: string, today: string }) {
  const meta = TYPE_META[record.type]
  const titleMap: Record<RecordType, string> = {
    transfer_in:  '학생 전입 처리 확인서',
    transfer_out: '학생 전출 처리 확인서',
    hold:         '학생 유급 처리 확인서',
    expel:        '학생 퇴학 처리 통지서',
  }
  const birthFmt = record.birthDate ? record.birthDate.replace(/-/g, '. ') : '____. __. __.'

  return (
    <div className="text-[12px] leading-relaxed" style={{ color: '#111', fontFamily: '맑은 고딕, sans-serif' }}>
      <h2 className="text-center text-lg font-bold mb-1">{titleMap[record.type]}</h2>
      <p className="text-center text-xs text-gray-500 mb-4">
        「초·중등교육법」 및 학교 학적관리규정에 의거
      </p>

      <table className="w-full border-collapse text-[12px] mb-3">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold w-24 text-center">학교명</td>
            <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{schoolName}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">학년/반/번호</td>
            <td className="border border-gray-400 px-2 py-1.5">
              {record.grade || '__'}학년 {record.classNm || '__'}반 {record.studentNum || '__'}번
            </td>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center w-20">성명</td>
            <td className="border border-gray-400 px-2 py-1.5">{record.studentName || '_______'}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">생년월일</td>
            <td className="border border-gray-400 px-2 py-1.5">{birthFmt}</td>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">보호자</td>
            <td className="border border-gray-400 px-2 py-1.5">{record.guardianName || '_______'}</td>
          </tr>

          {record.type === 'transfer_in' && <>
            <tr>
              <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">전입 전 학교</td>
              <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{record.prevSchool || '_______'} ({record.prevGrade || '__'})</td>
            </tr>
            <tr>
              <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">전입일</td>
              <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>
                {record.transferInDate ? record.transferInDate.replace(/-/g, '. ') : '____. __. __.'}
              </td>
            </tr>
          </>}

          {record.type === 'transfer_out' && <>
            <tr>
              <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">전출 학교</td>
              <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{record.destSchool || '_______'}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">전출일</td>
              <td className="border border-gray-400 px-2 py-1.5">{record.transferOutDate ? record.transferOutDate.replace(/-/g, '. ') : '____. __. __.'}</td>
              <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">사유</td>
              <td className="border border-gray-400 px-2 py-1.5">{record.transferOutReason || '_______'}</td>
            </tr>
          </>}

          {record.type === 'hold' && <>
            <tr>
              <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">유급 학년</td>
              <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{record.holdYear || '_______'}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center align-top">유급 사유</td>
              <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{record.holdReason || '_______________________'}</td>
            </tr>
          </>}

          {record.type === 'expel' && <>
            <tr>
              <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">퇴학 일자</td>
              <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>
                {record.expelDate ? record.expelDate.replace(/-/g, '. ') : '____. __. __.'}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center align-top">퇴학 사유</td>
              <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{record.expelReason || '_______________________'}</td>
            </tr>
          </>}
        </tbody>
      </table>

      <p className="mt-3 text-[11px]">
        위 학생의 {meta.label} 처리를 확인합니다.
      </p>
      <p className="text-right text-[11px] mt-1">{today}</p>
      <div className="flex justify-end gap-6 mt-3">
        <span className="text-[11px]">보호자 (서명) : _______________</span>
        <span className="text-[11px]">담임 교사 : _______________</span>
      </div>
      <div className="mt-4 border-t border-gray-300 pt-3">
        <p className="text-center text-[11px] font-semibold mb-2">결재란</p>
        <div className="flex justify-center gap-6">
          {['담임', '교무부장', '교감', '교장'].map(r => (
            <div key={r} className="text-center border border-gray-400 w-16 h-14 flex items-end justify-center pb-1 text-[10px]">{r}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
