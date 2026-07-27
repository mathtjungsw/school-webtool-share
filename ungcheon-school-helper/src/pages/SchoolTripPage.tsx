import { useState } from 'react'
import { Printer, RefreshCw, Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import clsx from 'clsx'

type FormType = 'application' | 'report'

interface TripForm {
  // 공통
  studentName: string
  grade: string
  classNm: string
  studentNum: string
  guardianName: string
  guardianPhone: string
  // 신청서
  destination: string
  purpose: string
  startDate: string
  endDate: string
  dayCount: string
  curriculum: string[]
  // 결과보고서
  actualPeriod: string
  actualDays: string
  activities: { id: string; date: string; place: string; content: string }[]
  reflection: string
  teacherComment: string
}

const defaultForm = (): TripForm => ({
  studentName: '', grade: '', classNm: '', studentNum: '', guardianName: '', guardianPhone: '',
  destination: '', purpose: '', startDate: '', endDate: '', dayCount: '',
  curriculum: [''],
  actualPeriod: '', actualDays: '',
  activities: [{ id: crypto.randomUUID(), date: '', place: '', content: '' }],
  reflection: '', teacherComment: '',
})

export default function SchoolTripPage() {
  const { config } = useAppStore()
  const [formType, setFormType] = useState<FormType>('application')
  const [form, setForm] = useState<TripForm>(defaultForm())

  const schoolName = config.schoolName ?? '○○학교'
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '. ')

  const set = (patch: Partial<TripForm>) => setForm(f => ({ ...f, ...patch }))

  const setCurriculumItem = (i: number, v: string) =>
    set({ curriculum: form.curriculum.map((c, j) => j === i ? v : c) })

  const addActivity = () =>
    set({ activities: [...form.activities, { id: crypto.randomUUID(), date: '', place: '', content: '' }] })

  const updateActivity = (id: string, patch: Partial<TripForm['activities'][0]>) =>
    set({ activities: form.activities.map(a => a.id === id ? { ...a, ...patch } : a) })

  const removeActivity = (id: string) =>
    set({ activities: form.activities.filter(a => a.id !== id) })

  const handlePrint = () => window.print()

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="page-title">교외체험학습</h1>
        <p className="page-subtitle">학교장허가 교외체험학습 신청서 및 결과보고서를 작성하고 출력합니다</p>
      </div>

      {/* 서식 선택 */}
      <div className="flex gap-1 mb-6 bg-surface-800 p-1 rounded-xl w-fit">
        {([['application', '신청서'], ['report', '결과보고서']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFormType(v)}
            className={clsx('px-5 py-1.5 rounded-lg text-sm transition-all',
              formType === v ? 'bg-violet-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            )}>{l}</button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* 입력 폼 */}
        <div className="col-span-2 space-y-4">

          {/* 학생 정보 */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-white text-sm border-b border-white/5 pb-2">학생 정보</h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="field-label">학년</label>
                <input className="input text-center" placeholder="2" value={form.grade}
                  onChange={e => set({ grade: e.target.value })} />
              </div>
              <div>
                <label className="field-label">반</label>
                <input className="input text-center" placeholder="3" value={form.classNm}
                  onChange={e => set({ classNm: e.target.value })} />
              </div>
              <div>
                <label className="field-label">번호</label>
                <input className="input text-center" placeholder="15" value={form.studentNum}
                  onChange={e => set({ studentNum: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="field-label">학생 성명</label>
              <input className="input" placeholder="홍길동" value={form.studentName}
                onChange={e => set({ studentName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">보호자 성명</label>
                <input className="input" placeholder="홍아버지" value={form.guardianName}
                  onChange={e => set({ guardianName: e.target.value })} />
              </div>
              <div>
                <label className="field-label">연락처</label>
                <input className="input" placeholder="010-0000-0000" value={form.guardianPhone}
                  onChange={e => set({ guardianPhone: e.target.value })} />
              </div>
            </div>
          </div>

          {formType === 'application' && (
            <div className="card space-y-3">
              <h3 className="font-semibold text-white text-sm border-b border-white/5 pb-2">신청 내용</h3>
              <div>
                <label className="field-label">체험학습 장소 (목적지)</label>
                <input className="input" placeholder="예: 국립중앙박물관, 제주도" value={form.destination}
                  onChange={e => set({ destination: e.target.value })} />
              </div>
              <div>
                <label className="field-label">목적 및 취지</label>
                <input className="input" placeholder="예: 역사 유물 직접 관람 및 문화 체험" value={form.purpose}
                  onChange={e => set({ purpose: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="field-label">시작일</label>
                  <input type="date" className="input text-xs" value={form.startDate}
                    onChange={e => set({ startDate: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">종료일</label>
                  <input type="date" className="input text-xs" value={form.endDate}
                    onChange={e => set({ endDate: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">일수</label>
                  <input className="input text-center" placeholder="3" value={form.dayCount}
                    onChange={e => set({ dayCount: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="field-label">교육과정 관련성</label>
                {form.curriculum.map((c, i) => (
                  <div key={i} className="flex gap-1.5 mt-1.5">
                    <input className="input flex-1 text-xs"
                      placeholder={`관련 교과·단원 ${i + 1}번`}
                      value={c}
                      onChange={e => setCurriculumItem(i, e.target.value)} />
                    {form.curriculum.length > 1 && (
                      <button onClick={() => set({ curriculum: form.curriculum.filter((_, j) => j !== i) })}
                        className="text-red-400 p-1"><Trash2 size={12} /></button>
                    )}
                  </div>
                ))}
                <button onClick={() => set({ curriculum: [...form.curriculum, ''] })}
                  className="btn-ghost text-xs mt-1.5 flex items-center gap-1">
                  <Plus size={11} />항목 추가
                </button>
              </div>
            </div>
          )}

          {formType === 'report' && (
            <div className="card space-y-3">
              <h3 className="font-semibold text-white text-sm border-b border-white/5 pb-2">결과보고 내용</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="field-label">실제 기간</label>
                  <input className="input text-xs" placeholder="○.○○.○○~○.○○.○○" value={form.actualPeriod}
                    onChange={e => set({ actualPeriod: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">실제 일수</label>
                  <input className="input text-center" placeholder="3" value={form.actualDays}
                    onChange={e => set({ actualDays: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="field-label">활동 내용</label>
                {form.activities.map((a) => (
                  <div key={a.id} className="mt-1.5 bg-surface-900 rounded-xl p-2.5 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input className="input text-xs" placeholder="날짜" value={a.date}
                        onChange={e => updateActivity(a.id, { date: e.target.value })} />
                      <input className="input text-xs" placeholder="장소" value={a.place}
                        onChange={e => updateActivity(a.id, { place: e.target.value })} />
                    </div>
                    <div className="flex gap-1.5">
                      <input className="input flex-1 text-xs" placeholder="활동 내용" value={a.content}
                        onChange={e => updateActivity(a.id, { content: e.target.value })} />
                      {form.activities.length > 1 && (
                        <button onClick={() => removeActivity(a.id)}
                          className="text-red-400 p-1"><Trash2 size={12} /></button>
                      )}
                    </div>
                  </div>
                ))}
                <button onClick={addActivity} className="btn-ghost text-xs mt-1.5 flex items-center gap-1">
                  <Plus size={11} />날짜 추가
                </button>
              </div>
              <div>
                <label className="field-label">소감 및 배운점</label>
                <textarea className="input w-full h-20 resize-none text-xs" value={form.reflection}
                  placeholder="체험학습을 통해 배운 점, 느낀 점을 서술하세요."
                  onChange={e => set({ reflection: e.target.value })} />
              </div>
              <div>
                <label className="field-label">담임 교사 의견</label>
                <input className="input text-xs" value={form.teacherComment}
                  placeholder="체험학습 결과를 확인함."
                  onChange={e => set({ teacherComment: e.target.value })} />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Printer size={14} />출력/저장
            </button>
            <button onClick={() => setForm(defaultForm())} className="btn-ghost p-2.5" title="초기화">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* 서식 미리보기 */}
        <div className="col-span-3">
          <div className="card p-6 print:shadow-none" style={{ fontFamily: '나눔명조, 맑은 고딕, serif', color: '#1a1a1a', background: 'white', minHeight: 600 }}>
            {formType === 'application' ? (
              <ApplicationPreview form={form} schoolName={schoolName} today={today} />
            ) : (
              <ReportPreview form={form} schoolName={schoolName} today={today} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ApplicationPreview({ form, schoolName, today }: { form: TripForm, schoolName: string, today: string }) {
  const startFmt = form.startDate ? form.startDate.replace(/-/g, '. ') : '____. __. __.'
  const endFmt   = form.endDate   ? form.endDate.replace(/-/g, '. ')   : '____. __. __.'
  return (
    <div className="text-[13px] leading-relaxed" style={{ color: '#111' }}>
      <h2 className="text-center text-xl font-bold mb-1">교외체험학습 신청서</h2>
      <p className="text-center text-xs text-gray-500 mb-5">「초·중등교육법 시행령」제48조 및 학교 운영규정에 의거</p>
      <table className="w-full border-collapse text-[12px] mb-4" style={{ borderColor: '#333' }}>
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold w-20 text-center">학교명</td>
            <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{schoolName}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">학년/반</td>
            <td className="border border-gray-400 px-2 py-1.5">{form.grade || '__'}학년 {form.classNm || '__'}반 {form.studentNum || '__'}번</td>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center w-20">성명</td>
            <td className="border border-gray-400 px-2 py-1.5">{form.studentName || '_______'}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">보호자</td>
            <td className="border border-gray-400 px-2 py-1.5">{form.guardianName || '_______'}</td>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">연락처</td>
            <td className="border border-gray-400 px-2 py-1.5">{form.guardianPhone || '_______'}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">장소</td>
            <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{form.destination || '_______________________'}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">기간</td>
            <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{startFmt} ~ {endFmt} ({form.dayCount || '__'}일간)</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">목적</td>
            <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{form.purpose || '_______________________'}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center align-top">교육과정<br/>관련성</td>
            <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>
              <ul className="list-disc list-inside space-y-0.5">
                {form.curriculum.filter(Boolean).length > 0
                  ? form.curriculum.filter(Boolean).map((c, i) => <li key={i}>{c}</li>)
                  : <li className="text-gray-400">___________________</li>}
              </ul>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="text-[12px] space-y-2 mt-4">
        <p>위와 같이 교외체험학습을 실시하고자 신청합니다.</p>
        <p className="text-right">{today}</p>
        <div className="flex justify-end gap-6 mt-3">
          <span>보호자 (서명) : _______________</span>
          <span>담임교사 확인 : _______________</span>
        </div>
        <div className="mt-4 border-t border-gray-300 pt-3">
          <p className="font-semibold text-center">학교장 허가 결재란</p>
          <div className="flex justify-center gap-8 mt-2">
            {['담임', '부장', '교감', '교장'].map(r => (
              <div key={r} className="text-center border border-gray-400 w-16 h-14 flex items-end justify-center pb-1 text-xs">{r}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportPreview({ form, schoolName, today }: { form: TripForm, schoolName: string, today: string }) {
  return (
    <div className="text-[13px] leading-relaxed" style={{ color: '#111' }}>
      <h2 className="text-center text-xl font-bold mb-1">교외체험학습 결과보고서</h2>
      <p className="text-center text-xs text-gray-500 mb-5">교외체험학습 종료 후 3일 이내 제출</p>
      <table className="w-full border-collapse text-[12px] mb-4" style={{ borderColor: '#333' }}>
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold w-24 text-center">학교명</td>
            <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>{schoolName}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">학년/반/번호</td>
            <td className="border border-gray-400 px-2 py-1.5">{form.grade || '__'}학년 {form.classNm || '__'}반 {form.studentNum || '__'}번</td>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center w-20">성명</td>
            <td className="border border-gray-400 px-2 py-1.5">{form.studentName || '_______'}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">실제 기간</td>
            <td className="border border-gray-400 px-2 py-1.5">{form.actualPeriod || '____. __. __. ~ ____. __. __.'}</td>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">일수</td>
            <td className="border border-gray-400 px-2 py-1.5">{form.actualDays || '__'}일</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center align-top" rowSpan={form.activities.length + 1}>활동 내용</td>
            <td className="border border-gray-400 bg-gray-50 px-2 py-1 text-center font-semibold text-xs">날짜</td>
            <td className="border border-gray-400 bg-gray-50 px-2 py-1 text-center font-semibold text-xs">장소</td>
            <td className="border border-gray-400 bg-gray-50 px-2 py-1 text-center font-semibold text-xs">내용</td>
          </tr>
          {form.activities.map(a => (
            <tr key={a.id}>
              <td className="border border-gray-400 px-2 py-1.5 text-xs">{a.date || '______'}</td>
              <td className="border border-gray-400 px-2 py-1.5 text-xs">{a.place || '______'}</td>
              <td className="border border-gray-400 px-2 py-1.5 text-xs">{a.content || '___________________'}</td>
            </tr>
          ))}
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center align-top">소감 및<br/>배운점</td>
            <td className="border border-gray-400 px-2 py-2.5" colSpan={3} style={{ minHeight: 60 }}>
              {form.reflection || <span className="text-gray-400">___________________</span>}
            </td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 px-2 py-1.5 font-semibold text-center">교사 의견</td>
            <td className="border border-gray-400 px-2 py-1.5" colSpan={3}>
              {form.teacherComment || '체험학습 결과를 확인함.'}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="text-[12px] mt-4 space-y-2">
        <p>위와 같이 교외체험학습 결과를 보고합니다.</p>
        <p className="text-right">{today}</p>
        <div className="flex justify-end gap-6 mt-2">
          <span>보호자 (서명) : _______________</span>
          <span>담임교사 확인 : _______________</span>
        </div>
      </div>
    </div>
  )
}
