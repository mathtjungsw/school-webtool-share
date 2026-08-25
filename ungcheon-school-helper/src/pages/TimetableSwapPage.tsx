import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, ArrowLeftRight, CheckCircle2, FileSpreadsheet,
  CalendarRange, ClipboardList, LockKeyhole, RefreshCw, Search, ShieldCheck, Upload, UserCog, UserRoundSearch, Users, X,
} from 'lucide-react'
import clsx from 'clsx'
import { useAdminStore } from '../stores/adminStore'
import { useAppStore } from '../stores/appStore'
import TeacherSchedulePreview from '../components/timetable/TeacherSchedulePreview'
import TeacherTimetableWorkspace from '../components/timetable/TeacherTimetableWorkspace'
import TimetablePlanEditor from '../components/timetable/TimetablePlanEditor'
import { getSchoolTimetable, getSharedStaffRoster, replaceSchoolTimetable, subscribeHubResource } from '../services/schoolHub'
import {
  chooseAndParseTimetable,
  findCommonFreeSlots,
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
  rankSubstitutionCandidates,
  saveTimetablePlanDraft,
  simulateExchange,
  simulateSubstitution,
  slotDay,
  type TimetablePlanDraft,
} from '../services/timetablePlan'
import {
  printTimetablePlan,
} from '../services/timetablePlanDocument'
import { applyTimetableChangeForRequester, cancelTimetableChange, createTimetableChange, listTimetableChanges, timetableChangeSummary, type TimetableChangeRequest } from '../services/timetableChanges'
import type { TimetablePlanEntry } from '../services/timetablePlan'
import type { SharedStaffRoster } from '../services/rosterAttendance'

type ViewMode = 'exchange' | 'substitution' | 'common_free' | 'teacher_schedule' | 'manager_schedule' | 'plan'
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
  const [commonFreeTeacherIndexes, setCommonFreeTeacherIndexes] = useState<number[]>([])
  const [preview, setPreview] = useState<PreviewSelection | null>(null)
  const [planDraft, setPlanDraft] = useState<TimetablePlanDraft>(() => createEmptyPlanDraft(config.teacherName))
  const [planLoaded, setPlanLoaded] = useState(false)
  const [changeRequests, setChangeRequests] = useState<TimetableChangeRequest[]>([])
  const [staffRoster, setStaffRoster] = useState<SharedStaffRoster | null>(null)
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

  const loadStaffRoster = useCallback(async () => {
    if (!configured) return setStaffRoster(null)
    try { setStaffRoster(await getSharedStaffRoster()) } catch { setStaffRoster(null) }
  }, [configured])
  useEffect(() => { void loadStaffRoster() }, [loadStaffRoster])
  useEffect(() => subscribeHubResource<SharedStaffRoster | null>('staffRoster', setStaffRoster), [])

  useEffect(() => {
    loadTimetablePlanDraft(config.teacherName?.trim() || '').then(draft => {
      setPlanDraft(draft)
      setPlanLoaded(true)
    })
  }, [config.teacherName])

  const loadChangeRequests = useCallback(async () => {
    const name = config.teacherName?.trim()
    if (!name || !configured) return setChangeRequests([])
    try { setChangeRequests(await listTimetableChanges(name)) } catch { setChangeRequests([]) }
  }, [config.teacherName, configured])
  useEffect(() => { void loadChangeRequests(); const handler = () => void loadChangeRequests(); window.addEventListener('timetableChanges:updated', handler); return () => window.removeEventListener('timetableChanges:updated', handler) }, [loadChangeRequests])

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
    if (ownIndex >= 0) {
      setTeacherIndex(ownIndex)
      setCommonFreeTeacherIndexes(current => current.length ? current : [ownIndex])
    }
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
    const candidateIndexes = findSubstitutionCandidates(timetable, teacherIndex, selectedSlot)
    return rankSubstitutionCandidates(
      candidateIndexes,
      timetable.teachers[teacherIndex],
      timetable.teachers,
      staffRoster?.members ?? [],
    )
  }, [staffRoster, timetable, teacherIndex, selectedSlot])

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
    setError('')
    try {
      const bytes = await window.electron.buildTimetablePlanHwp(planDraft)
      const saved = await window.electron.saveFileDialog(name, bytes)
      if (saved) setSuccess('PDF 기준 양식을 적용한 편집 가능한 한글(HWP) 계획서를 저장했습니다.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const requestApplication = async (entry: TimetablePlanEntry) => {
    const requesterName = config.teacherName?.trim() || ''
    if (!requesterName || entry.originalTeacher !== requesterName) {
      setError('본인 수업이 원 수업인 교환·대강 항목만 반영 요청을 보낼 수 있습니다.')
      return
    }
    const warning = '해당 교사와 학급에 반영됩니다. 계속 하시겠습니까?\n\n이 기능은 NEIS와 별개이며 교직원의 업무 편의를 위해 제공되는 기능입니다.'
    if (!window.confirm(warning)) return
    try {
      const result = await createTimetableChange(entry, requesterName)
      setSuccess(`${result.targetTeacherName} 교사에게 승인 요청을 보냈습니다. 승인 후 날짜별 시간표에 반영됩니다.`)
      await loadChangeRequests()
      window.dispatchEvent(new Event('timetableChanges:updated'))
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
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
          <button onClick={() => { void load(); void loadStaffRoster() }} disabled={loading} className="btn-ghost flex items-center gap-2">
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
          active={viewMode === 'common_free'}
          onClick={() => { setViewMode('common_free'); setSelectedSlot(null); setPreview(null) }}
          icon={<Users size={14} />}
          label="공동 공강 확인"
        />
        <ModeButton
          active={viewMode === 'teacher_schedule'}
          onClick={() => { setViewMode('teacher_schedule'); setSelectedSlot(null); setPreview(null) }}
          icon={<CalendarRange size={14} />}
          label="교사 시간표"
        />
        <ModeButton
          active={viewMode === 'manager_schedule'}
          onClick={() => { setViewMode('manager_schedule'); setSelectedSlot(null); setPreview(null) }}
          icon={<UserCog size={14} />}
          label="시간표 업무 담당자"
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

      {timetable && teacher && (viewMode === 'plan' ? (<>
        <TimetablePlanEditor
          draft={planDraft}
          timetable={timetable}
          onChange={setPlanDraft}
          onPrint={() => printTimetablePlan(planDraft)}
          onSaveHwp={saveHwp}
          onApply={requestApplication}
        />
        <ChangeRequestHistory items={changeRequests} teacherName={config.teacherName?.trim() ?? ''} onChanged={loadChangeRequests} />
      </>) : viewMode === 'teacher_schedule' ? (
        <TeacherTimetableWorkspace mode="teacher" timetable={timetable} currentTeacherName={config.teacherName?.trim() ?? ''} configured={configured} staffRoster={staffRoster} />
      ) : viewMode === 'manager_schedule' ? (
        <TeacherTimetableWorkspace mode="manager" timetable={timetable} currentTeacherName={config.teacherName?.trim() ?? ''} configured={configured} staffRoster={staffRoster} />
      ) : viewMode === 'common_free' ? (
        <CommonFreeTimePanel
          timetable={timetable}
          selectedTeacherIndexes={commonFreeTeacherIndexes}
          onChange={setCommonFreeTeacherIndexes}
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
            {viewMode === 'substitution' && (
              <Legend className="bg-emerald-500/25 border-emerald-400/60" text="동교과 공강 교사 · 우선 표시" />
            )}
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
                  : substitutionCandidates.map(candidate => {
                      const candidateIndex = candidate.teacherIndex
                      const substitute = timetable.teachers[candidateIndex]
                      const dayIndex = Math.floor(selectedSlot / PERIODS_PER_DAY)
                      const dayLoad = substitute.slots
                        .slice(dayIndex * PERIODS_PER_DAY, (dayIndex + 1) * PERIODS_PER_DAY)
                        .filter(slot => slot.value).length
                      return (
                        <CandidateButton
                          key={candidateIndex}
                          name={substitute.label}
                          badge={candidate.isSameSubject ? '동교과 · 현재 공강' : '현재 공강'}
                          sameSubject={candidate.isSameSubject}
                          active={preview?.mode === 'substitution' && preview.teacherIndex === candidateIndex}
                          onClick={() => setPreview({
                            mode: 'substitution',
                            teacherIndex: candidateIndex,
                            partnerSlotIndex: selectedSlot,
                          })}
                          rows={[
                            ['담당 교과', candidate.teacherSubject || '교과 미등록'],
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

function CommonFreeTimePanel({
  timetable,
  selectedTeacherIndexes,
  onChange,
}: {
  timetable: SchoolTimetable
  selectedTeacherIndexes: number[]
  onChange: (indexes: number[]) => void
}) {
  const [query, setQuery] = useState('')
  const selectedSet = useMemo(() => new Set(selectedTeacherIndexes), [selectedTeacherIndexes])
  const commonFreeSlots = useMemo(
    () => findCommonFreeSlots(timetable, selectedTeacherIndexes),
    [timetable, selectedTeacherIndexes],
  )
  const commonFreeSlotSet = useMemo(() => new Set(commonFreeSlots), [commonFreeSlots])
  const filteredTeachers = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ko-KR')
    return timetable.teachers
      .map((teacher, index) => ({ teacher, index }))
      .filter(({ teacher }) => !keyword || `${teacher.name} ${teacher.label}`.toLocaleLowerCase('ko-KR').includes(keyword))
  }, [query, timetable.teachers])

  const toggleTeacher = (index: number) => {
    onChange(selectedSet.has(index)
      ? selectedTeacherIndexes.filter(item => item !== index)
      : [...selectedTeacherIndexes, index])
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-white">
              <Users size={18} className="text-violet-400" /> 공동 공강 확인
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              교사를 2명 이상 선택하면 모든 선생님에게 수업이 없는 요일·교시를 동시에 찾습니다.
            </p>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={() => onChange([])} disabled={!selectedTeacherIndexes.length}>
            전체 해제
          </button>
        </div>

        <div className="mt-4 flex min-h-10 flex-wrap gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-2.5">
          {selectedTeacherIndexes.map(index => {
            const teacher = timetable.teachers[index]
            if (!teacher) return null
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleTeacher(index)}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/15 px-3 py-1.5 text-xs font-black text-violet-200"
                title={`${teacher.name} 선택 해제`}
              >
                {teacher.label}<X size={12} />
              </button>
            )
          })}
          {!selectedTeacherIndexes.length && <span className="self-center text-xs font-semibold text-slate-500">아래에서 교사를 선택하세요.</span>}
        </div>

        <label className="relative mt-4 block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="input-field w-full !pl-9"
            placeholder="교사 이름 검색"
          />
        </label>

        <div className="mt-3 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-5">
          {filteredTeachers.map(({ teacher, index }) => {
            const selected = selectedSet.has(index)
            return (
              <button
                key={`${teacher.name}-${index}`}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleTeacher(index)}
                className={clsx(
                  'rounded-lg border px-3 py-2 text-left text-xs font-extrabold transition-colors',
                  selected
                    ? 'border-violet-400/60 bg-violet-500/20 text-violet-200'
                    : 'border-white/10 bg-white/[0.025] text-slate-200 hover:border-violet-400/35 hover:bg-violet-500/10',
                )}
              >
                {teacher.label}
              </button>
            )
          })}
          {!filteredTeachers.length && <p className="col-span-full py-5 text-center text-xs font-semibold text-slate-500">검색 결과가 없습니다.</p>}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-black text-white">공동 공강 결과</h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {selectedTeacherIndexes.length < 2
                ? '교사를 2명 이상 선택하면 결과가 표시됩니다.'
                : `선택한 ${selectedTeacherIndexes.length}명 모두가 비는 시간은 총 ${commonFreeSlots.length}개입니다.`}
            </p>
          </div>
          {selectedTeacherIndexes.length >= 2 && commonFreeSlots.length > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-black text-emerald-300">
              공동 공강 {commonFreeSlots.length}개
            </span>
          )}
        </div>

        {selectedTeacherIndexes.length >= 2 && (
          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            {TIMETABLE_DAYS.map((day, dayIndex) => {
              const daySlots = Array.from({ length: PERIODS_PER_DAY }, (_, periodOffset) =>
                dayIndex * PERIODS_PER_DAY + periodOffset,
              )
              const freePeriods = daySlots.filter(slotIndex => commonFreeSlotSet.has(slotIndex))
              return (
                <div key={day} className="overflow-hidden rounded-xl border border-white/10">
                  <div className="flex items-center justify-between bg-white/5 px-3 py-2">
                    <strong className="text-sm text-slate-100">{day}요일</strong>
                    <span className="text-[10px] font-black text-emerald-300">{freePeriods.length}개</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {daySlots.map((slotIndex, periodOffset) => {
                      const isFree = commonFreeSlotSet.has(slotIndex)
                      const busyTeachers = isFree ? [] : selectedTeacherIndexes
                        .map(index => timetable.teachers[index])
                        .filter(teacher => teacher?.slots[slotIndex]?.value)
                      return (
                        <div
                          key={slotIndex}
                          className={clsx(
                            'min-h-14 px-3 py-2',
                            isFree
                              ? 'bg-emerald-500/20 ring-1 ring-inset ring-emerald-400/35'
                              : 'bg-white/[0.015]',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black text-slate-400">{periodOffset + 1}교시</span>
                            <span className={clsx('text-[11px] font-black', isFree ? 'text-emerald-300' : 'text-slate-400')}>
                              {isFree ? '모두 공강' : `${busyTeachers.length}명 수업`}
                            </span>
                          </div>
                          {!isFree && (
                            <p className="mt-1 truncate text-[9px] font-semibold text-slate-500" title={busyTeachers.map(item => item.label).join(', ')}>
                              {busyTeachers.slice(0, 3).map(item => item.name).join(', ')}{busyTeachers.length > 3 ? ` 외 ${busyTeachers.length - 3}명` : ''}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {selectedTeacherIndexes.length >= 2 && commonFreeSlots.length === 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-6 text-center text-sm font-bold text-amber-300">
            선택한 교사 전원이 동시에 공강인 시간이 없습니다.
          </div>
        )}
      </section>
    </div>
  )
}

function ChangeRequestHistory({ items, teacherName, onChanged }: { items: TimetableChangeRequest[]; teacherName: string; onChanged: () => Promise<void> }) {
  const applyForMeOnly = async (item: TimetableChangeRequest) => {
    if (!window.confirm(`상대 교사가 승인하기 전까지 ${teacherName} 교사의 캘린더와 날짜별 시간표에만 우선 반영합니다.\n상대 교사의 승인 요청은 그대로 유지되며, 승인하면 상대 교사와 학급에도 반영됩니다.\n\n이 기능은 NEIS와 별개인 업무 편의 기능입니다. 계속하시겠습니까?\n\n${timetableChangeSummary(item)}`)) return
    try {
      await applyTimetableChangeForRequester(item.id, teacherName)
      await onChanged()
      window.dispatchEvent(new Event('timetableChanges:updated'))
    } catch (error) { window.alert(error instanceof Error ? error.message : String(error)) }
  }
  const cancel = async (item: TimetableChangeRequest) => {
    if (!window.confirm(`'${timetableChangeSummary(item)}' 반영 요청을 취소할까요?\n승인된 요청이라면 날짜별 반영도 함께 해제됩니다.`)) return
    try { await cancelTimetableChange(item.id, teacherName); await onChanged(); window.dispatchEvent(new Event('timetableChanges:updated')) }
    catch (error) { window.alert(error instanceof Error ? error.message : String(error)) }
  }
  const labels: Record<TimetableChangeRequest['status'], string> = { pending: '승인 대기', approved: '승인·전체 반영', held: '보류', rejected: '보류', cancelled: '취소' }
  return <section className="card p-4"><h2 className="font-bold text-white">반영 요청·처리 내역</h2><p className="mt-1 text-xs text-slate-500">‘나만 우선 반영’은 상대 승인 전까지 내 캘린더와 날짜별 시간표에만 적용합니다. 상대가 승인하면 상대 교사와 학급에도 반영되고 내게 승인 완료 알림이 옵니다. 학교 공유 원본과 NEIS는 바뀌지 않습니다.</p><div className="mt-3 space-y-2">{items.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">{timetableChangeSummary(item)}</p><p className="mt-1 text-[10px] text-slate-500">요청 {item.requesterName} → {item.targetTeacherName}</p></div><span className={clsx('rounded-full px-2 py-1 text-[10px] font-bold', item.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : item.requesterAppliedAt ? 'bg-cyan-500/15 text-cyan-300' : ['pending', 'held', 'rejected'].includes(item.status) ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-500/15 text-slate-400')}>{item.status !== 'approved' && item.requesterAppliedAt ? '나만 우선 반영' : labels[item.status]}</span>{item.requesterName === teacherName && ['pending', 'held', 'rejected'].includes(item.status) && !item.requesterAppliedAt && <button onClick={() => void applyForMeOnly(item)} className="btn-secondary text-[10px] text-cyan-200">나만 우선 반영</button>}{item.requesterName === teacherName && ['pending', 'held', 'rejected', 'approved'].includes(item.status) && <button onClick={() => void cancel(item)} className="btn-ghost text-[10px] text-rose-300">취소·반영 해제</button>}</div>)}{!items.length && <p className="py-6 text-center text-xs text-slate-500">반영 요청 내역이 없습니다.</p>}</div></section>
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
  sameSubject = false,
  rows,
  active,
  onClick,
}: {
  name: string
  badge: string
  sameSubject?: boolean
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
          ? sameSubject
            ? 'border-emerald-400/80 bg-emerald-500/20 ring-2 ring-emerald-400/45'
            : 'border-violet-400/70 bg-violet-500/15 ring-1 ring-violet-400/40'
          : sameSubject
            ? 'border-emerald-400/60 bg-emerald-500/15 hover:bg-emerald-500/25'
            : 'border-orange-400/40 bg-orange-500/10 hover:bg-orange-500/15',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={clsx('font-bold', sameSubject ? 'same-subject-candidate-text' : active ? 'text-violet-300' : 'text-orange-400')}>{name}</span>
        <span className={clsx(
          'text-[10px] font-semibold rounded-full px-2 py-1',
          sameSubject
            ? 'same-subject-candidate-badge bg-emerald-400/25 ring-1 ring-emerald-300/50'
            : active
              ? 'bg-violet-500/20 text-violet-300'
              : 'bg-orange-500/20 text-orange-400',
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
