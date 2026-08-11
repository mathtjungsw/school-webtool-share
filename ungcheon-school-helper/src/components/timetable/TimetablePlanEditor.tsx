import { Download, Eye, Send, Printer, ShieldCheck, Trash2, X } from 'lucide-react'
import { useId, useState } from 'react'
import {
  PERIODS_PER_DAY,
  type SchoolTimetable,
} from '../../services/schoolTimetable'
import {
  planKindLabel,
  slotDay,
  slotPeriod,
  type TimetablePlanDraft,
  type TimetablePlanEntry,
  type TimetablePlanKind,
} from '../../services/timetablePlan'
import { buildTimetablePlanHtml } from '../../services/timetablePlanDocument'

export default function TimetablePlanEditor({
  draft,
  timetable,
  onChange,
  onPrint,
  onSaveHwp,
  onApply,
}: {
  draft: TimetablePlanDraft
  timetable: SchoolTimetable
  onChange: (draft: TimetablePlanDraft) => void
  onPrint: () => void
  onSaveHwp: () => void
  onApply?: (entry: TimetablePlanEntry) => void
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const setMeta = (patch: Partial<TimetablePlanDraft['meta']>) =>
    onChange({ ...draft, meta: { ...draft.meta, ...patch } })
  const updateEntry = (id: string, patch: Partial<TimetablePlanEntry>) =>
    onChange({
      ...draft,
      entries: draft.entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry),
    })
  const removeEntry = (id: string) =>
    onChange({ ...draft, entries: draft.entries.filter(entry => entry.id !== id) })
  const clearEntries = () => {
    if (draft.entries.length && confirm('계획서에 추가한 항목을 모두 삭제할까요?')) {
      onChange({ ...draft, entries: [] })
    }
  }
  const pageCount = Math.max(1, Math.ceil(draft.entries.length / 6))
  const notifyMultiPage = () => {
    if (draft.entries.length > 6) {
      window.alert(`교체 내용이 ${draft.entries.length}개이므로 6개씩 나누어 ${pageCount}페이지로 작성합니다.\n동일한 표와 나머지 내용이 다음 페이지에 자동 생성됩니다.`)
    }
  }
  const openPreview = () => {
    notifyMultiPage()
    setPreviewOpen(true)
  }
  const saveHwp = () => {
    notifyMultiPage()
    onSaveHwp()
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 flex gap-3">
        <ShieldCheck size={17} className="text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-emerald-300">원본 시간표 보호</p>
          <p className="text-xs text-emerald-300 mt-1">이 목록은 현재 PC에만 저장되며, 관리자가 업로드한 학교 공유 시간표는 수정되지 않습니다.</p>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold text-white">계획서 기본 정보</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
          <Field label="사유">
            <select className="input-field w-full" value={draft.meta.reason} onChange={event => setMeta({ reason: event.target.value as TimetablePlanDraft['meta']['reason'] })}>
              {['출장', '병가', '연가', '공가', '특별휴가', '기타'].map(reason => <option key={reason}>{reason}</option>)}
            </select>
          </Field>
          {draft.meta.reason === '기타' && (
            <Field label="기타 사유">
              <input className="input-field w-full" value={draft.meta.customReason} onChange={event => setMeta({ customReason: event.target.value })} />
            </Field>
          )}
          <Field label="시작일">
            <input type="date" className="input-field w-full" value={draft.meta.startDate} onChange={event => setMeta({ startDate: event.target.value })} />
          </Field>
          <Field label="종료일">
            <input type="date" className="input-field w-full" value={draft.meta.endDate} onChange={event => setMeta({ endDate: event.target.value })} />
          </Field>
          <Field label="작성 교사">
            <input className="input-field w-full" value={draft.meta.author} onChange={event => setMeta({ author: event.target.value })} />
          </Field>
          <Field label="작성일">
            <input type="date" className="input-field w-full" value={draft.meta.documentDate} onChange={event => setMeta({ documentDate: event.target.value })} />
          </Field>
        </div>
      </section>

      <section className="card overflow-hidden min-w-0">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/5">
          <div>
            <h2 className="font-semibold text-white">교환·보강 항목</h2>
            <p className="text-xs text-slate-500 mt-1">모든 칸을 출력 전에 직접 수정할 수 있습니다.</p>
          </div>
          <button type="button" onClick={clearEntries} disabled={!draft.entries.length} className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40">
            <Trash2 size={13} /> 전체 삭제
          </button>
        </div>

        {!draft.entries.length ? (
          <p className="p-8 text-center text-sm text-slate-500">교환 또는 대강 후보의 ‘계획서에 추가’ 버튼을 눌러주세요.</p>
        ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="min-w-[1120px] w-full table-fixed text-[11px]">
              <colgroup>
                <col className="w-[6%]" /><col className="w-[10%]" /><col className="w-[8%]" />
                <col className="w-[5%]" /><col className="w-[7.5%]" /><col className="w-[7%]" />
                <col className="w-[10%]" /><col className="w-[8%]" /><col className="w-[5%]" />
                <col className="w-[7.5%]" /><col className="w-[7%]" /><col className="w-[5%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="bg-white/5 text-slate-400">
                <tr>
                  <th className="p-2">구분</th><th className="p-2">결강일</th><th className="p-2">요일·교시</th>
                  <th className="p-2">학반</th><th className="p-2">과목</th><th className="p-2">결강 교사</th>
                  <th className="p-2">실시일</th><th className="p-2">요일·교시</th><th className="p-2">학반</th>
                  <th className="p-2">과목</th><th className="p-2">담당 교사</th><th className="p-2">비고</th><th className="p-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {draft.entries.map(entry => (
                  <tr key={entry.id} className="align-top">
                    <td className="p-1">
                      <select className="input-field !py-1.5 !px-1.5 w-full min-w-0" value={entry.kind} onChange={event => updateEntry(entry.id, { kind: event.target.value as TimetablePlanKind })}>
                        {(['exchange', 'substitution', 'change'] as TimetablePlanKind[]).map(kind => <option key={kind} value={kind}>{planKindLabel(kind)}</option>)}
                      </select>
                    </td>
                    <td className="p-1"><input type="date" className="input-field !py-1.5 !px-1.5 w-full min-w-0" value={entry.originalDate} onChange={event => updateEntry(entry.id, { originalDate: event.target.value })} /></td>
                    <td className="p-1"><SlotEditor slotIndex={entry.originalSlotIndex} onChange={slot => updateEntry(entry.id, { originalSlotIndex: slot })} /></td>
                    <EditCell value={entry.originalClass} onChange={value => updateEntry(entry.id, { originalClass: value })} />
                    <EditCell value={entry.originalSubject} onChange={value => updateEntry(entry.id, { originalSubject: value })} />
                    <EditCell value={entry.originalTeacher} onChange={value => updateEntry(entry.id, { originalTeacher: value })} list={timetable.teachers.map(teacher => teacher.name)} />
                    <td className="p-1"><input type="date" className="input-field !py-1.5 !px-1.5 w-full min-w-0" value={entry.replacementDate} onChange={event => updateEntry(entry.id, { replacementDate: event.target.value })} /></td>
                    <td className="p-1"><SlotEditor slotIndex={entry.replacementSlotIndex} onChange={slot => updateEntry(entry.id, { replacementSlotIndex: slot })} /></td>
                    <EditCell value={entry.replacementClass} onChange={value => updateEntry(entry.id, { replacementClass: value })} />
                    <EditCell value={entry.replacementSubject} onChange={value => updateEntry(entry.id, { replacementSubject: value })} />
                    <EditCell value={entry.replacementTeacher} onChange={value => updateEntry(entry.id, { replacementTeacher: value })} list={timetable.teachers.map(teacher => teacher.name)} />
                    <EditCell value={entry.note} onChange={value => updateEntry(entry.id, { note: value })} />
                    <td className="p-1"><div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      {entry.kind !== 'change' && <button type="button" className="btn-ghost !px-2 !py-1.5 text-cyan-300" onClick={() => onApply?.(entry)} title="상대 교사에게 반영 요청"><Send size={12} />승인 요청</button>}
                      <button type="button" className="btn-ghost !px-2 !py-1.5 text-rose-400" onClick={() => removeEntry(entry.id)} aria-label="항목 삭제"><Trash2 size={12} />삭제</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {draft.entries.length > 6 && <p className="border-t border-cyan-400/15 bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-200">총 {draft.entries.length}개 항목 · 6개씩 나누어 {pageCount}페이지로 자동 작성됩니다.</p>}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={saveHwp} disabled={!draft.entries.length} className="btn-secondary flex items-center gap-2 disabled:opacity-40">
          <Download size={15} /> 한글(HWP) 저장
        </button>
        <button type="button" onClick={openPreview} disabled={!draft.entries.length} className="btn-primary flex items-center gap-2 disabled:opacity-40">
          <Eye size={15} /> 양식 미리보기·출력
        </button>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm p-4 md:p-8 flex flex-col">
          <div className="max-w-6xl w-full mx-auto bg-surface-900 rounded-2xl border border-white/10 shadow-2xl flex flex-col min-h-0 flex-1">
            <header className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
              <div>
                <h2 className="font-bold text-white">교환·보강 계획서 미리보기</h2>
                <p className="text-xs text-slate-500 mt-0.5">수정이 필요하면 닫고 편집표에서 고친 뒤 다시 열어주세요.</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onSaveHwp} className="btn-secondary text-xs flex items-center gap-1.5"><Download size={13} /> HWP 저장</button>
                <button type="button" onClick={onPrint} className="btn-primary text-xs flex items-center gap-1.5"><Printer size={13} /> 출력 / PDF</button>
                <button type="button" onClick={() => setPreviewOpen(false)} className="btn-ghost !p-2" aria-label="미리보기 닫기"><X size={15} /></button>
              </div>
            </header>
            <iframe
              title="교환·보강 계획서 A4 미리보기"
              className="w-full flex-1 min-h-0 rounded-b-2xl bg-slate-200"
              srcDoc={buildTimetablePlanHtml(draft)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs text-slate-400">{label}<span className="block mt-1">{children}</span></label>
}

function EditCell({
  value,
  onChange,
  list,
}: {
  value: string
  onChange: (value: string) => void
  list?: string[]
}) {
  const generatedId = useId()
  const listId = list ? `teachers-${generatedId.replace(/:/g, '')}` : undefined
  return (
    <td className="p-1">
      <input className="input-field !py-1.5 !px-1.5 w-full min-w-0" value={value} onChange={event => onChange(event.target.value)} list={listId} />
      {list && <datalist id={listId}>{list.map(item => <option key={item} value={item} />)}</datalist>}
    </td>
  )
}

function SlotEditor({ slotIndex, onChange }: { slotIndex: number; onChange: (slotIndex: number) => void }) {
  const dayIndex = Math.floor(slotIndex / PERIODS_PER_DAY)
  const period = slotPeriod(slotIndex)
  return (
    <span className="flex items-center gap-1 min-w-0 w-full">
      <select
        aria-label="요일"
        className="input-field !py-1.5 !px-1 w-[58%] min-w-0"
        value={dayIndex}
        onChange={event => onChange(Number(event.target.value) * PERIODS_PER_DAY + period - 1)}
      >
        {['월', '화', '수', '목', '금'].map((day, index) => <option key={day} value={index}>{day}</option>)}
      </select>
      <input
        aria-label={`${slotDay(slotIndex)}요일 교시`}
        type="number"
        min={1}
        max={7}
        className="input-field !py-1.5 !px-1 w-[42%] min-w-0"
        value={period}
        onChange={event => onChange(dayIndex * PERIODS_PER_DAY + Math.max(1, Math.min(7, Number(event.target.value))) - 1)}
      />
    </span>
  )
}
