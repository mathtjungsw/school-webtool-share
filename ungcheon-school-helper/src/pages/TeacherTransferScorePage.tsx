import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Calculator, CheckCircle2, Info, Plus, Printer, RotateCcw,
  ShieldCheck, Trash2,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { escapeHtml, printHtml } from '../utils/printHtml'
import {
  COMMENDATION_OPTIONS,
  EDUCATION_ACTIVITY_DEFINITIONS,
  ENGLISH_OPTIONS,
  PREFERENCE_OPTIONS,
  QUALIFICATION_OPTIONS,
  TEE_OPTIONS,
  TRANSFER_GRADE_POINTS,
  calculateTransferScore,
  type AdditionalScoreInput,
  type CareerPeriodInput,
  type TransferGrade,
} from '../services/teacherTransferScore'

const STORAGE_KEY = 'ungcheon.teacher-transfer-score.v1'
const GRADES = Object.keys(TRANSFER_GRADE_POINTS) as TransferGrade[]

interface TransferScoreDraft {
  applicantName: string
  evaluationDate: string
  careerPeriods: CareerPeriodInput[]
  educationActivityMonths: Record<string, number>
  additional: AdditionalScoreInput
}

const EMPTY_ADDITIONAL: AdditionalScoreInput = {
  commendation: '',
  nationalAthleteAwards: 0,
  ministerAwards: 0,
  studyGuidanceAwards: 0,
  competitionGuidanceAwards: 0,
  qualification: '',
  english: '',
  tee: '',
  preference: '',
  integrityContribution: false,
}

function newCareerPeriod(): CareerPeriodInput {
  return {
    id: crypto.randomUUID(),
    schoolName: '웅천고등학교',
    grade: '라',
    startDate: '',
    endDate: '2027-02-28',
  }
}

function createDefaultDraft(teacherName = ''): TransferScoreDraft {
  return {
    applicantName: teacherName,
    evaluationDate: '2027-02-28',
    careerPeriods: [newCareerPeriod()],
    educationActivityMonths: {},
    additional: { ...EMPTY_ADDITIONAL },
  }
}

function loadDraft(teacherName: string): TransferScoreDraft {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<TransferScoreDraft> | null
    if (!saved) return createDefaultDraft(teacherName)
    return {
      applicantName: saved.applicantName ?? teacherName,
      evaluationDate: saved.evaluationDate ?? '2027-02-28',
      careerPeriods: saved.careerPeriods?.length ? saved.careerPeriods : [newCareerPeriod()],
      educationActivityMonths: saved.educationActivityMonths ?? {},
      additional: { ...EMPTY_ADDITIONAL, ...(saved.additional ?? {}) },
    }
  } catch {
    return createDefaultDraft(teacherName)
  }
}

function formatScore(score: number): string {
  return score.toFixed(3).replace(/\.000$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function formatMonths(months: number): string {
  const years = Math.floor(months / 12)
  const remainder = months % 12
  if (!years) return `${remainder}개월`
  if (!remainder) return `${years}년`
  return `${years}년 ${remainder}개월`
}

export default function TeacherTransferScorePage() {
  const teacherName = useAppStore(state => state.config.teacherName ?? '')
  const [draft, setDraft] = useState<TransferScoreDraft>(() => loadDraft(teacherName))

  useEffect(() => {
    if (!draft.applicantName && teacherName) {
      setDraft(current => ({ ...current, applicantName: teacherName }))
    }
  }, [draft.applicantName, teacherName])

  useEffect(() => {
    const timer = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)), 250)
    return () => window.clearTimeout(timer)
  }, [draft])

  const result = useMemo(() => calculateTransferScore({
    evaluationDate: draft.evaluationDate,
    careerPeriods: draft.careerPeriods,
    educationActivityMonths: draft.educationActivityMonths,
    additional: draft.additional,
  }), [draft])

  const updateCareer = (id: string, patch: Partial<CareerPeriodInput>) => {
    setDraft(current => ({
      ...current,
      careerPeriods: current.careerPeriods.map(period => period.id === id ? { ...period, ...patch } : period),
    }))
  }

  const removeCareer = (id: string) => {
    setDraft(current => ({
      ...current,
      careerPeriods: current.careerPeriods.length > 1
        ? current.careerPeriods.filter(period => period.id !== id)
        : current.careerPeriods,
    }))
  }

  const updateAdditional = <K extends keyof AdditionalScoreInput>(key: K, value: AdditionalScoreInput[K]) => {
    setDraft(current => ({ ...current, additional: { ...current.additional, [key]: value } }))
  }

  const reset = () => {
    if (!window.confirm('입력한 전보 점수 자료를 모두 지울까요?')) return
    localStorage.removeItem(STORAGE_KEY)
    setDraft(createDefaultDraft(teacherName))
  }

  const printReport = () => {
    const careerRows = draft.careerPeriods
      .filter(period => period.startDate && period.endDate)
      .map(period => {
        const applied = result.careerPeriodResults.find(item => item.id === period.id)
        return `<tr><td>${escapeHtml(period.schoolName || '-')}</td><td>${period.grade}급지</td><td>${period.startDate} ~ ${period.endDate}</td><td>${applied ? `${applied.months}개월` : '-'}</td><td>${applied ? formatScore(applied.score) : '0'}</td></tr>`
      }).join('')
    const educationRows = result.educationItems
      .map(item => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.detail)}</td><td>${formatScore(item.score)}</td></tr>`).join('')
    const additionalRows = result.additionalItems
      .map(item => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.detail)}</td><td>${formatScore(item.score)}</td></tr>`).join('')
    const warningRows = result.warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')

    printHtml(`<div class="sheet transfer-sheet">
      <h1>일반교사 전보내신점수 계산 결과</h1>
      <p class="standard">2027. 경상남도교육청 중등 교육공무원 인사관리기준</p>
      <table class="meta"><tr><th>소속</th><td>웅천고등학교</td><th>성명</th><td>${escapeHtml(draft.applicantName || '-')}</td><th>평정기준일</th><td>${draft.evaluationDate}</td></tr></table>
      <h2>1. 근무경력점</h2>
      <table><thead><tr><th>학교</th><th>급지</th><th>입력 기간</th><th>최근 3년 반영</th><th>점수</th></tr></thead><tbody>${careerRows || '<tr><td colspan="5">입력 없음</td></tr>'}</tbody><tfoot><tr><th colspan="4">근무경력점 소계</th><th>${formatScore(result.workCareerScore)}</th></tr></tfoot></table>
      <h2>2. 교육활동경력점</h2>
      <table><thead><tr><th>항목</th><th>산출 내용</th><th>점수</th></tr></thead><tbody>${educationRows || '<tr><td colspan="3">해당 없음</td></tr>'}</tbody><tfoot><tr><th colspan="2">교육활동경력점 소계</th><th>${formatScore(result.educationActivityScore)}</th></tr></tfoot></table>
      <h2>3. 가산점</h2>
      <table><thead><tr><th>항목</th><th>산출 내용</th><th>점수</th></tr></thead><tbody>${additionalRows || '<tr><td colspan="3">해당 없음</td></tr>'}</tbody><tfoot><tr><th colspan="2">가산점 소계</th><th>${formatScore(result.additionalScore)}</th></tr></tfoot></table>
      <div class="total"><span>예상 총점</span><strong>${formatScore(result.totalScore)}점</strong></div>
      ${warningRows ? `<div class="warnings"><b>확인 사항</b><ul>${warningRows}</ul></div>` : ''}
      <p class="notice">※ 이 결과는 입력값에 따른 참고용 자동 계산입니다. 휴직·파견 등 제외 기간, 증빙 인정 여부, 학교 급지 변경 및 중복 실적은 반드시 학교 인사 담당자와 원문 기준으로 최종 확인하십시오.</p>
    </div>`, `
      .transfer-sheet{padding:12mm 13mm;font-size:9pt}.transfer-sheet h1{text-align:center;font-size:18pt;margin-bottom:1mm}.standard{text-align:center;color:#555;margin-bottom:6mm}.transfer-sheet h2{font-size:11pt;margin:4mm 0 1.5mm}.transfer-sheet table{width:100%;border-collapse:collapse;table-layout:fixed}.transfer-sheet th,.transfer-sheet td{border:1px solid #555;padding:2mm;text-align:center;word-break:keep-all}.transfer-sheet th{background:#eef2f6}.meta th{width:13%}.meta td{width:20%}.transfer-sheet tfoot th{background:#f8fafc}.total{margin-top:5mm;padding:4mm 6mm;background:#fff7cc;border:2px solid #b69100;display:flex;justify-content:space-between;align-items:center;font-size:13pt}.total strong{font-size:20pt}.warnings{margin-top:4mm;padding:3mm 4mm;border:1px solid #d97706;background:#fff8ed}.warnings ul{margin:1mm 0 0 5mm}.notice{font-size:8pt;color:#555;margin-top:4mm;line-height:1.45}@media print{.transfer-sheet table,.total,.warnings{break-inside:avoid}}
    `)
  }

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Calculator size={23} className="text-amber-400" />전보내신점수 계산기</h1>
          <p className="page-subtitle">2027. 경상남도교육청 중등 일반교사 기준 · 근무경력점 + 교육활동경력점 + 가산점</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex items-center gap-1.5" onClick={reset}><RotateCcw size={14} />초기화</button>
          <button type="button" className="btn-primary flex items-center gap-1.5" onClick={printReport}><Printer size={14} />결과 인쇄·PDF</button>
        </div>
      </header>

      <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 flex gap-3">
        <Info size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-100/80 leading-relaxed">
          <p className="font-semibold text-amber-200">웅천고등학교는 별표 2-1의 라급지로 연 5.5점입니다.</p>
          <p className="mt-1">휴직·정직·직위해제·평정 제외 파견 기간은 빼고 실제 근무 구간만 나누어 입력하세요. 급지가 바뀐 이력은 해당 시점의 급지별로 별도 입력해야 합니다.</p>
        </div>
      </section>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="space-y-5">
          <section className="card space-y-4">
            <SectionTitle number="1" title="기본 정보와 근무경력" description="근무경력점은 최근 3년, 교육활동 근무경력부가점은 최근 5년 이내를 자동 반영합니다." />
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="field-label">성명<input className="input-field mt-1" value={draft.applicantName} onChange={event => setDraft(current => ({ ...current, applicantName: event.target.value }))} placeholder="환경설정 이름 자동 반영" /></label>
              <label className="field-label">평정기준일<input type="date" className="input-field mt-1" value={draft.evaluationDate} onChange={event => setDraft(current => ({ ...current, evaluationDate: event.target.value }))} /></label>
            </div>

            <div className="space-y-3 pt-1">
              {draft.careerPeriods.map((period, index) => {
                const applied = result.careerPeriodResults.find(item => item.id === period.id)
                return (
                  <div key={period.id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                    <div className="grid lg:grid-cols-[1.3fr_110px_1fr_1fr_130px_34px] gap-2 items-end">
                      <label className="field-label">학교명<input className="input-field mt-1" value={period.schoolName} onChange={event => updateCareer(period.id, { schoolName: event.target.value })} /></label>
                      <label className="field-label">급지<select className="input-field mt-1" value={period.grade} onChange={event => updateCareer(period.id, { grade: event.target.value as TransferGrade })}>{GRADES.map(grade => <option key={grade} value={grade}>{grade} · 연 {TRANSFER_GRADE_POINTS[grade]}점</option>)}</select></label>
                      <label className="field-label">시작일<input type="date" className="input-field mt-1" value={period.startDate} onChange={event => updateCareer(period.id, { startDate: event.target.value })} /></label>
                      <label className="field-label">종료일<input type="date" className="input-field mt-1" value={period.endDate} onChange={event => updateCareer(period.id, { endDate: event.target.value })} /></label>
                      <div className="rounded-lg bg-slate-950/40 px-3 py-2.5 min-h-[42px]">
                        <p className="text-[10px] text-slate-500">최근 3년 반영</p>
                        <p className="text-sm font-semibold text-slate-200">{applied ? `${applied.months}개월 · ${formatScore(applied.score)}점` : '-'}</p>
                      </div>
                      <button type="button" aria-label={`${index + 1}번 근무경력 삭제`} disabled={draft.careerPeriods.length === 1} onClick={() => removeCareer(period.id)} className="h-[42px] grid place-items-center rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-20"><Trash2 size={15} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
            <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={() => setDraft(current => ({ ...current, careerPeriods: [...current.careerPeriods, { ...newCareerPeriod(), schoolName: '' }] }))}><Plus size={14} />급지·근무 구간 추가</button>
          </section>

          <section className="card space-y-4">
            <SectionTitle number="2" title="교육활동경력점" description="최근 5년의 실제 인정 월수만 입력합니다. 15일 이상은 1개월, 15일 미만은 버립니다." />
            <div className="grid sm:grid-cols-3 gap-3">
              <ResultMini label="최근 5년 근무경력" value={formatMonths(result.evaluationCareerMonths)} />
              <ResultMini label="2~5년차 누진점" value={`${formatScore(result.longServiceBaseScore)}점`} />
              <ResultMini label="3년 초과 장기 추가점" value={`${formatScore(result.longServiceExtraScore)}점`} />
            </div>
            <div className="grid md:grid-cols-2 gap-2.5">
              {EDUCATION_ACTIVITY_DEFINITIONS.map(definition => {
                const months = draft.educationActivityMonths[definition.id] ?? 0
                return (
                  <label key={definition.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-200">{definition.label} <span className="text-emerald-400">연 {definition.annualPoint.toFixed(2)}점</span></span>
                      <span className="block text-[11px] text-slate-500 mt-0.5 leading-relaxed">{definition.condition}</span>
                    </span>
                    <span className="w-24 flex items-center gap-1"><input type="number" min={0} max={60} className="input-field text-right" value={months || ''} placeholder="0" onChange={event => setDraft(current => ({ ...current, educationActivityMonths: { ...current.educationActivityMonths, [definition.id]: Math.max(0, Number(event.target.value) || 0) } }))} /><span className="text-xs text-slate-500">개월</span></span>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="card space-y-4">
            <SectionTitle number="3" title="가산점" description="표창·상장·대회지도는 동일 실적 중복 적용이 안 되며, 상장·대회지도는 같은 학년도에 하나만 인정됩니다." />
            <div className="grid md:grid-cols-2 gap-3">
              <SelectField label="표창(택일)" value={draft.additional.commendation} options={COMMENDATION_OPTIONS} onChange={value => updateAdditional('commendation', value)} />
              <SelectField label="기술자격증(택일)" value={draft.additional.qualification} options={QUALIFICATION_OPTIONS} onChange={value => updateAdditional('qualification', value)} />
              <SelectField label="영어능력시험(택일)" value={draft.additional.english} options={ENGLISH_OPTIONS} onChange={value => updateAdditional('english', value)} />
              <SelectField label="TEE 인증서" value={draft.additional.tee} options={TEE_OPTIONS} onChange={value => updateAdditional('tee', value)} />
              <SelectField label="우대조건(택일)" value={draft.additional.preference} options={PREFERENCE_OPTIONS} onChange={value => updateAdditional('preference', value)} />
              <label className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={draft.additional.integrityContribution} onChange={event => updateAdditional('integrityContribution', event.target.checked)} className="w-4 h-4 accent-amber-400" />
                <span><span className="block text-sm font-semibold text-slate-200">청렴도 향상 기여</span><span className="block text-[11px] text-slate-500 mt-0.5">현임교 1회 · 0.5점</span></span>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <CountField label="전국체전 학생 지도 상장" point={0.75} max={5} value={draft.additional.nationalAthleteAwards} onChange={value => updateAdditional('nationalAthleteAwards', value)} />
              <CountField label="교육감·장관 이상 상장" point={0.5} max={5} value={draft.additional.ministerAwards} onChange={value => updateAdditional('ministerAwards', value)} />
              <CountField label="학습지도 연구대회" point={0.75} max={99} value={draft.additional.studyGuidanceAwards} onChange={value => updateAdditional('studyGuidanceAwards', value)} />
              <CountField label="인정 대회 학생 지도" point={0.5} max={5} value={draft.additional.competitionGuidanceAwards} onChange={value => updateAdditional('competitionGuidanceAwards', value)} />
            </div>
          </section>

          <section className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 flex gap-3">
            <ShieldCheck size={18} className="text-sky-400 flex-shrink-0" />
            <div><p className="text-sm font-semibold text-sky-200">현재 PC에만 자동 저장됩니다.</p><p className="text-xs text-sky-100/65 mt-1 leading-relaxed">입력한 성명·경력·가산점은 학교 공유 서버나 관리자에게 전송되지 않습니다. 이 계산은 참고용이며 증빙 인정 여부와 예외 규정은 인사 담당자에게 최종 확인하세요.</p></div>
          </section>
        </div>

        <aside className="xl:sticky xl:top-5 space-y-4">
          <section className="card border-amber-400/30 overflow-hidden">
            <div className="-mx-5 -mt-5 mb-5 p-5 bg-gradient-to-br from-amber-400/20 to-emerald-400/5 border-b border-amber-400/20">
              <p className="text-xs font-semibold text-amber-300">예상 전보내신 총점</p>
              <p className="text-4xl font-black text-white mt-1 tabular-nums">{formatScore(result.totalScore)}<span className="text-base font-semibold text-slate-400 ml-1">점</span></p>
            </div>
            <div className="space-y-3">
              <ScoreRow label="근무경력점" detail={`최근 ${result.workCareerMonths}개월`} score={result.workCareerScore} />
              <ScoreRow label="교육활동경력점" detail={`최근 5년 ${result.evaluationCareerMonths}개월`} score={result.educationActivityScore} />
              <ScoreRow label="가산점" detail={`${result.additionalItems.length}개 인정 항목`} score={result.additionalScore} />
            </div>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400" />점수 세부 내역</h2>
            <div className="mt-3 max-h-[360px] overflow-y-auto space-y-2 pr-1">
              {[...result.educationItems, ...result.additionalItems].length ? [...result.educationItems, ...result.additionalItems].map(item => (
                <div key={item.id} className="rounded-lg bg-white/[0.025] px-3 py-2 flex gap-2">
                  <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-300">{item.label}</p><p className="text-[10px] text-slate-600 mt-0.5">{item.detail}</p></div>
                  <strong className="text-xs text-emerald-400 tabular-nums">+{formatScore(item.score)}</strong>
                </div>
              )) : <p className="text-xs text-slate-600 text-center py-5">근무기간과 해당 실적을 입력하면 세부 점수가 표시됩니다.</p>}
            </div>
          </section>

          {result.warnings.length > 0 && (
            <section className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4">
              <h2 className="text-sm font-bold text-rose-200 flex items-center gap-2"><AlertTriangle size={15} />입력 확인</h2>
              <ul className="mt-2 space-y-2">{result.warnings.map(warning => <li key={warning} className="text-xs text-rose-100/75 leading-relaxed flex gap-2"><span>•</span>{warning}</li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function SectionTitle({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="flex gap-3 pb-3 border-b border-white/[0.06]"><span className="w-7 h-7 rounded-lg bg-amber-400/15 text-amber-400 grid place-items-center text-sm font-black flex-shrink-0">{number}</span><div><h2 className="font-bold text-white">{title}</h2><p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p></div></div>
}

function ResultMini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="text-lg font-bold text-emerald-300 mt-1">{value}</p></div>
}

function ScoreRow({ label, detail, score }: { label: string; detail: string; score: number }) {
  return <div className="flex items-center gap-3 pb-3 border-b border-white/[0.05] last:border-0 last:pb-0"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-200">{label}</p><p className="text-[11px] text-slate-600 mt-0.5">{detail}</p></div><strong className="text-lg text-slate-100 tabular-nums">{formatScore(score)}</strong></div>
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; label: string; score: number }>; onChange: (value: string) => void }) {
  return <label className="field-label">{label}<select className="input-field mt-1" value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.id || 'none'} value={option.id}>{option.label}{option.score ? ` · ${option.score}점` : ''}</option>)}</select></label>
}

function CountField({ label, point, max, value, onChange }: { label: string; point: number; max: number; value: number; onChange: (value: number) => void }) {
  return <label className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><span className="text-xs font-semibold text-slate-300">{label}</span><span className="block text-[10px] text-slate-600 mt-0.5">평정기간 내 누가 · 회당 {point}점{max === 5 ? ' · 동일 학년도 택일' : ''}</span><span className="flex items-center gap-2 mt-2"><input type="number" min={0} max={max} className="input-field" value={value || ''} placeholder="0" onChange={event => onChange(Math.max(0, Math.min(max, Math.floor(Number(event.target.value) || 0))))} /><span className="text-xs text-slate-500 whitespace-nowrap">회</span></span></label>
}
