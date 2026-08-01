import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, ArrowLeftRight, CheckCircle2, FileSpreadsheet,
  ClipboardList, LockKeyhole, RefreshCw, ShieldCheck, Upload, UserRoundSearch, Users,
} from 'lucide-react'
import clsx from 'clsx'
import { useAdminStore } from '../stores/adminStore'
import { useAppStore } from '../stores/appStore'
import TeacherSchedulePreview from '../components/timetable/TeacherSchedulePreview'
import TimetablePlanEditor from '../components/timetable/TimetablePlanEditor'
import { getSchoolTimetable, replaceSchoolTimetable, subscribeHubResource } from '../services/schoolHub'
import {
  chooseAndParseTimetable,
  findSwapCandidates,
  PERIODS_PER_DAY,
  slotLabel,
  TIMETABLE_DAYS,
  type SchoolTimetable,
} from '../services/schoolTimetable'
import {
  buildPlanEntry,
  createEmptyPlanDraft,
  findSubstitutionCandidates,
  loadTimetablePlanDraft,
  saveTimetablePlanDraft,
  simulateExchange,
  simulateSubstitution,
  slotDay,
  type TimetablePlanDraft,
} from '../services/timetablePlan'
import {
  buildTimetablePlanHwpBytes,
  printTimetablePlan,
} from '../services/timetablePlanDocument'

type ViewMode = 'exchange' | 'substitution' | 'plan'
type PreviewSelection = {
  mode: 'exchange' | 'substitution'
  teacherIndex: number
  partnerSlotIndex: number
}

export default function TimetableSwapPage() {
  const config = useAppStore(state => state.config)
  const isAdmin = useAdminStore(state => state.isAdmin)
  const adminPassword = useAdminStore(state => state.adminPassword)
  const [timetable, setTimetable] = useState<SchoolTimetable | null>(null)
  const [teacherIndex, setTeacherIndex] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('exchange')
  const [preview, setPreview] = useState<PreviewSelection | null>(null)
  const [planDraft, setPlanDraft] = useState<TimetablePlanDraft>(() => createEmptyPlanDraft(config.teacherName))
  const [planLoaded, setPlanLoaded] = useState(false)
  const configured = Boolean(config.schoolHubUrl)

  const load = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    setError('')
    try {
      const next = await getSchoolTimetable()
      setTimetable(next)
      setSelectedSlot(null)
      setPreview(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => { load() }, [load])
  useEffect(() => subscribeHubResource<SchoolTimetable | null>('timetable', data => {
    setTimetable(data)
    setSelectedSlot(null)
    setPreview(null)
  }), [])

  useEffect(() => {
    loadTimetablePlanDraft(config.teacherName?.trim() || '').then(draft => {
      setPlanDraft(draft)
      setPlanLoaded(true)
    })
  }, [config.teacherName])

  useEffect(() => {
    if (!planLoaded) return
    const timer = setTimeout(() => {
      saveTimetablePlanDraft(planDraft).catch(() => {})
    }, 250)
    return () => clearTimeout(timer)
  }, [planDraft, planLoaded])

  useEffect(() => {
    if (!timetable?.teachers.length) return
    const teacherName = config.teacherName?.trim()
    if (!teacherName) return
    const ownIndex = timetable.teachers.findIndex(teacher =>
      teacher.name === teacherName || teacher.label.startsWith(teacherName),
    )
    if (ownIndex >= 0) setTeacherIndex(ownIndex)
  }, [timetable, config.teacherName])

  const candidates = useMemo(() => {
    if (!timetable || selectedSlot === null) return []
    return findSwapCandidates(timetable, teacherIndex, selectedSlot)
  }, [timetable, teacherIndex, selectedSlot])

  const candidateTargetSlots = useMemo(
    () => new Set(candidates.map(candidate => candidate.partnerSlotIndex)),
    [candidates],
  )
  const candidatesByTargetSlot = useMemo(() => {
    const grouped = new Map<number, typeof candidates>()
    candidates.forEach(candidate => {
      const current = grouped.get(candidate.partnerSlotIndex) ?? []
      grouped.set(candidate.partnerSlotIndex, [...current, candidate])
    })
    return grouped
  }, [candidates])
  const substitutionCandidates = useMemo(() => {
    if (!timetable || selectedSlot === null) return []
    return findSubstitutionCandidates(timetable, teacherIndex, selectedSlot)
  }, [timetable, teacherIndex, selectedSlot])

  const previewSimulation = useMemo(() => {
    if (!timetable || selectedSlot === null || !preview) return null
    return preview.mode === 'exchange'
      ? simulateExchange(
          timetable,
          teacherIndex,
          selectedSlot,
          preview.teacherIndex,
          preview.partnerSlotIndex,
        )
      : simulateSubstitution(
          timetable,
          teacherIndex,
          selectedSlot,
          preview.teacherIndex,
        )
  }, [preview, selectedSlot, teacherIndex, timetable])

  const addPreviewToPlan = () => {
    if (!timetable || selectedSlot === null || !preview) return
    const entry = buildPlanEntry(
      timetable,
      preview.mode,
      teacherIndex,
      selectedSlot,
      preview.teacherIndex,
      preview.partnerSlotIndex,
    )
    const duplicate = planDraft.entries.some(item =>
      item.kind === entry.kind &&
      item.originalSlotIndex === entry.originalSlotIndex &&
      item.replacementSlotIndex === entry.replacementSlotIndex &&
      item.replacementTeacher === entry.replacementTeacher,
    )
    if (duplicate) {
      setError('이미 계획서에 추가된 항목입니다.')
      return
    }
    const nextEntries = [...planDraft.entries, entry]
    const dates = nextEntries.flatMap(item => [item.originalDate, item.replacementDate]).filter(Boolean).sort()
    setPlanDraft({
      ...planDraft,
      meta: {
        ...planDraft.meta,
        author: planDraft.meta.author || config.teacherName?.trim() || '',
        startDate: dates[0] || planDraft.meta.startDate,
        endDate: dates.at(-1) || planDraft.meta.endDate,
      },
      entries: nextEntries,
    })
    setSuccess(`${entry.replacementTeacher} 교사를 계획서에 추가했습니다.`)
    setPreview(null)
  }

  const saveHwp = async () => {
    const name = `교환보강_계획서_${planDraft.meta.documentDate || new Date().toISOString().slice(0, 10)}.hwp`
    const saved = await window.electron?.saveFileDialog(name, buildTimetablePlanHwpBytes(planDraft))
    if (saved) setSuccess('한글(HWP) 계획서를 저장했습니다.')
  }

  const upload = async () => {
    if (!isAdmin || !adminPassword) {
      setError('관리자 모드에서만 시간표를 업로드할 수 있습니다.')
      return
    }
    setError('')
    setSuccess('')
    setUploading(true)
    try {
      const parsed = await chooseAndParseTimetable()
      if (!parsed) return
      const confirmed = confirm(
        `${parsed.title}\n교사 ${parsed.teachers.length}명\n\n이 시간표로 학교 공유 시간표 전체를 교체할까요?`,
      )
      if (!confirmed) return
      const result = await replaceSchoolTimetable(
        parsed,
        adminPassword,
        config.teacherName?.trim() || '관리자',
      )
      setSuccess(`시간표 ${result.version}차 업로드가 완료되었습니다.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  if (!configured) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="card p-10 text-center border-amber-500/20">
          <FileSpreadsheet size={36} className="mx-auto text-amber-400 mb-3" />
          <h1 className="text-xl font-bold text-white">학교 공유 서비스 설정이 필요합니다</h1>
          <p className="text-sm text-slate-400 mt-2">환경설정에 Google Apps Script 웹 앱 URL을 입력하면 교사 시간표를 공유할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  const teacher = timetable?.teachers[teacherIndex]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5 min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><ArrowLeftRight size={22} className="text-violet-400" /> 교환·대강 계획</h1>
          <p className="text-sm text-slate-400 mt-1">교환·대강 후보의 예상 시간표와 연강을 확인하고 계획서를 작성합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={upload} disabled={uploading} className="btn-primary flex items-center gap-2">
              <Upload size={14} /> {uploading ? '분석·업로드 중...' : '새 시간표 업로드'}
            </button>
          )}
          <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 새로고침
          </button>
        </div>
      </header>

      {isAdmin && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex gap-3">
          <ShieldCheck size={17} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-400">관리자 시간표 업로드</p>
            <p className="text-xs font-medium text-amber-300 mt-1">
              `.xlsm`, `.xlsx`, `.xls` 파일의 `주간시간표` 시트를 읽습니다. 새 파일을 올리면 기존 공유 시간표는 전체 교체됩니다.
            </p>
          </div>
        </div>
      )}

      <nav className="card p-1.5 flex flex-wrap gap-1">
        <ModeButton
          active={viewMode === 'exchange'}
          onClick={() => { setViewMode('exchange'); setSelectedSlot(null); setPreview(null) }}
          icon={<ArrowLeftRight size={14} />}
          label="수업 교환"
        />
        <ModeButton
          active={viewMode === 'substitution'}
          onClick={() => { setViewMode('substitution'); setSelectedSlot(null); setPreview(null) }}
          icon={<UserRoundSearch size={14} />}
          label="대강 교사 찾기"
        />
        <ModeButton
          active={viewMode === 'plan'}
          onClick={() => { setViewMode('plan'); setPreview(null) }}
          icon={<ClipboardList size={14} />}
          label={`계획서 편집·출력 (${planDraft.entries.length})`}
        />
      </nav>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
          <CheckCircle2 size={15} /> {success}
        </div>
      )}

      {!loading && !timetable && (
        <div className="card p-10 text-center">
          <Users size={34} className="mx-auto text-slate-600 mb-3" />
          <h2 className="font-semibold text-white">등록된 교사 시간표가 없습니다</h2>
          <p className="text-sm text-slate-500 mt-2">
            관리자가 상단 사용자 버튼에서 관리자 모드를 시작한 뒤 시간표 파일을 업로드해야 합니다.
          </p>
        </div>
      )}

      {timetable && teacher && (viewMode === 'plan' ? (
        <TimetablePlanEditor
          draft={planDraft}
          timetable={timetable}
          onChange={setPlanDraft}
          onPrint={() => printTimetablePlan(planDraft)}
          onSaveHwp={saveHwp}
        />
      ) : (
        <>
          <section className="card p-4 flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">{timetable.title}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {timetable.version}차 · 교사 {timetable.teachers.length}명 · {timetable.uploadedBy} 업로드 · {formatDate(timetable.uploadedAt)}
              </p>
              {timetable.sourceFileName && <p className="text-[10px] text-slate-600 mt-0.5 truncate">{timetable.sourceFileName}</p>}
            </div>
            <label className="text-xs text-slate-400 min-w-64">
              교사 선택
              <select
                className="input-field w-full mt-1"
                value={teacherIndex}
                onChange={event => {
                  setTeacherIndex(Number(event.target.value))
                  setSelectedSlot(null)
                  setPreview(null)
                }}
              >
                {timetable.teachers.map((item, index) => (
                  <option key={`${item.name}-${index}`} value={index}>{item.label}</option>
                ))}
              </select>
            </label>
          </section>

          <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
            <Legend className="bg-sky-500/20 border-sky-400/35" text="일반 수업" />
            <Legend className="bg-emerald-500/25 border-emerald-400/40" text="선택한 수업" />
            {viewMode === 'exchange' && <Legend className="bg-amber-400/20 border-amber-300/35" text="선택 교사가 이동 가능한 공강" />}
            {viewMode === 'exchange'
              ? <Legend className="bg-slate-700/70 border-slate-500/40" text="색상 제한으로 교환 불가" icon={<LockKeyhole size={11} />} />
              : <Legend className="bg-violet-500/20 border-violet-400/35" text="색상 제한 수업도 대강 선택 가능" />}
          </div>

          <section className="grid lg:grid-cols-5 gap-3">
            {TIMETABLE_DAYS.map((day, dayIndex) => (
              <div key={day} className="card overflow-hidden">
                <div className="px-3 py-2 bg-white/5 text-sm font-semibold text-center text-slate-200">{day}요일</div>
                <div className="divide-y divide-white/5">
                  {Array.from({ length: PERIODS_PER_DAY }, (_, periodOffset) => {
                    const slotIndex = dayIndex * PERIODS_PER_DAY + periodOffset
                    const slot = teacher.slots[slotIndex]
                    const selected = selectedSlot === slotIndex
                    const candidateTarget = viewMode === 'exchange' && candidateTargetSlots.has(slotIndex)
                    const inlineCandidates = viewMode === 'exchange'
                      ? candidatesByTargetSlot.get(slotIndex) ?? []
                      : []
                    return (
                      <button
                        key={slotIndex}
                        type="button"
                        onClick={() => {
                          setError('')
                          if (inlineCandidates.length) {
                            const candidate = inlineCandidates[0]
                            setPreview({
                              mode: 'exchange',
                              teacherIndex: candidate.partnerTeacherIndex,
                              partnerSlotIndex: candidate.partnerSlotIndex,
                            })
                            return
                          }
                          if (!slot.value) return
                          if (slot.locked && viewMode === 'exchange') {
                            setError('색상이 지정된 수업은 원본 프로그램과 동일하게 교체 대상에서 제외됩니다.')
                            return
                          }
                          setSelectedSlot(slotIndex)
                          setPreview(null)
                        }}
                        className={clsx(
                          'w-full min-h-20 px-3 py-2 flex gap-2 text-left transition-colors',
                          selected && 'bg-emerald-500/25 ring-1 ring-inset ring-emerald-400/40',
                          !selected && candidateTarget && 'bg-amber-400/15 ring-1 ring-inset ring-amber-300/25',
                          !selected && !candidateTarget && slot.locked && viewMode === 'exchange' && 'bg-slate-700/50',
                          !selected && slot.locked && viewMode === 'substitution' && 'bg-violet-500/20 ring-1 ring-inset ring-violet-400/35 hover:bg-violet-500/30',
                          !selected && !candidateTarget && !slot.locked && slot.value && 'bg-sky-500/20 ring-1 ring-inset ring-sky-400/35 hover:bg-sky-500/30',
                        )}
                      >
                        <span className="text-[10px] text-slate-600 w-4 pt-0.5 flex-shrink-0">{periodOffset + 1}</span>
                        {inlineCandidates.length
                          ? <InlineSwapCandidates timetable={timetable} candidates={inlineCandidates} />
                          : <SlotContent value={slot.value} locked={slot.locked} substitutionMode={viewMode === 'substitution'} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="card p-5">
            <h2 className="font-semibold text-white flex items-center gap-2">
              {viewMode === 'exchange'
                ? <ArrowLeftRight size={16} className="text-violet-400" />
                : <UserRoundSearch size={16} className="text-violet-400" />}
              {viewMode === 'exchange' ? '교환 후보' : '대강 가능 교사'}
              {selectedSlot !== null && <span className="text-xs font-normal text-slate-500">· {slotLabel(selectedSlot)}</span>}
            </h2>
            {selectedSlot === null ? (
              <p className="text-sm text-slate-500 mt-4">
                위 시간표에서 {viewMode === 'exchange' ? '교환하려는' : '대강이 필요한'} 수업을 선택하세요.
              </p>
            ) : viewMode === 'exchange' && candidates.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">서로 공강이고 같은 학급 수업을 담당하는 교환 후보가 없습니다.</p>
            ) : viewMode === 'substitution' && substitutionCandidates.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">해당 시간에 대강 가능한 공강 교사가 없습니다.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-3 mt-4">
                {viewMode === 'exchange'
                  ? candidates.map(candidate => {
                      const partner = timetable.teachers[candidate.partnerTeacherIndex]
                      const selectedClass = teacher.slots[selectedSlot].value
                      const partnerClass = partner.slots[candidate.partnerSlotIndex].value
                      return (
                        <CandidateButton
                          key={`${candidate.partnerTeacherIndex}-${candidate.partnerSlotIndex}`}
                          name={partner.label}
                          badge="교환 가능"
                          active={preview?.mode === 'exchange' && preview.teacherIndex === candidate.partnerTeacherIndex && preview.partnerSlotIndex === candidate.partnerSlotIndex}
                          onClick={() => setPreview({
                            mode: 'exchange',
                            teacherIndex: candidate.partnerTeacherIndex,
                            partnerSlotIndex: candidate.partnerSlotIndex,
                          })}
                          rows={[
                            ['내 수업', `${slotLabel(selectedSlot)} · ${oneLine(selectedClass)}`],
                            ['상대 수업', `${slotLabel(candidate.partnerSlotIndex)} · ${oneLine(partnerClass)}`],
                          ]}
                        />
                      )
                    })
                  : substitutionCandidates.map(candidateIndex => {
                      const substitute = timetable.teachers[candidateIndex]
                      const dayIndex = Math.floor(selectedSlot / PERIODS_PER_DAY)
                      const dayLoad = substitute.slots
                        .slice(dayIndex * PERIODS_PER_DAY, (dayIndex + 1) * PERIODS_PER_DAY)
                        .filter(slot => slot.value).length
                      return (
                        <CandidateButton
                          key={candidateIndex}
                          name={substitute.label}
                          badge="현재 공강"
                          active={preview?.mode === 'substitution' && preview.teacherIndex === candidateIndex}
                          onClick={() => setPreview({
                            mode: 'substitution',
                            teacherIndex: candidateIndex,
                            partnerSlotIndex: selectedSlot,
                          })}
                          rows={[
                            ['대강 수업', oneLine(teacher.slots[selectedSlot].value)],
                            ['당일 수업', `${slotDay(selectedSlot)}요일 현재 ${dayLoad}시간 · 대강 후 ${dayLoad + 1}시간`],
                          ]}
                        />
                      )
                    })}
              </div>
            )}
          </section>

          {preview && previewSimulation && (
            <TeacherSchedulePreview
              teacher={timetable.teachers[preview.teacherIndex]}
              simulation={previewSimulation}
              mode={preview.mode}
              onAdd={addPreviewToPlan}
              onClose={() => setPreview(null)}
            />
          )}
        </>
      ))}
    </div>
  )
}

function SlotContent({
  value,
  locked,
  substitutionMode = false,
}: {
  value: string
  locked: boolean
  substitutionMode?: boolean
}) {
  if (!value) return <span className="text-xs text-slate-700 self-center">공강</span>
  const lines = value.split('\n').filter(Boolean)
  return (
    <span className="min-w-0 flex-1">
      <span className="text-xs font-semibold text-slate-200 break-words">{lines[0]}</span>
      {lines.slice(1).map((line, index) => <span key={index} className="block text-[10px] text-slate-500 break-words mt-0.5">{line}</span>)}
      {locked && (
        <span className={clsx(
          'inline-flex items-center gap-1 text-[9px] mt-1',
          substitutionMode ? 'text-violet-400' : 'text-slate-500',
        )}>
          {substitutionMode ? <UserRoundSearch size={9} /> : <LockKeyhole size={9} />}
          {substitutionMode ? '대강 선택 가능' : '교환 제한'}
        </span>
      )}
    </span>
  )
}

function InlineSwapCandidates({
  timetable,
  candidates,
}: {
  timetable: SchoolTimetable
  candidates: ReturnType<typeof findSwapCandidates>
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[9px] font-bold text-orange-500 mb-1">교환 후보 · 클릭하여 미리보기</span>
      {candidates.slice(0, 2).map(candidate => {
        const partner = timetable.teachers[candidate.partnerTeacherIndex]
        const lesson = partner.slots[candidate.partnerSlotIndex].value
        return (
          <span key={`${candidate.partnerTeacherIndex}-${candidate.partnerSlotIndex}`} className="block leading-tight mb-1 last:mb-0">
            <span className="block text-[11px] font-extrabold text-orange-400">{partner.name}</span>
            <span className="block text-[9px] text-slate-400 break-words">{oneLine(lesson)}</span>
          </span>
        )
      })}
      {candidates.length > 2 && <span className="block text-[9px] text-orange-400">외 {candidates.length - 2}명</span>}
    </span>
  )
}

function Legend({ className, text, icon }: { className: string; text: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`w-4 h-4 rounded border ${className}`} />
      {icon}{text}
    </span>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
        active ? 'bg-violet-500 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
      )}
    >
      {icon}{label}
    </button>
  )
}

function CandidateButton({
  name,
  badge,
  rows,
  active,
  onClick,
}: {
  name: string
  badge: string
  rows: [string, string][]
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-xl border p-4 text-left transition-colors',
        active
          ? 'border-violet-400/70 bg-violet-500/15 ring-1 ring-violet-400/40'
          : 'border-orange-400/40 bg-orange-500/10 hover:bg-orange-500/15',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={clsx('font-bold', active ? 'text-violet-300' : 'text-orange-400')}>{name}</span>
        <span className={clsx(
          'text-[10px] font-semibold rounded-full px-2 py-1',
          active ? 'bg-violet-500/20 text-violet-300' : 'bg-orange-500/20 text-orange-400',
        )}>{badge}</span>
      </span>
      <span className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
        {rows.map(([label, value]) => (
          <span key={`${label}-${value}`} className="contents">
            <span className="text-slate-600">{label}</span>
            <span className="text-slate-300">{value}</span>
          </span>
        ))}
      </span>
      <span className="block text-[10px] text-violet-400 mt-3">클릭하여 예상 시간표 보기</span>
    </button>
  )
}

function oneLine(value: string) {
  return value.split('\n').filter(Boolean).join(' · ')
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}
