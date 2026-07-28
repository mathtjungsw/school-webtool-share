import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, ArrowLeftRight, CheckCircle2, FileSpreadsheet,
  LockKeyhole, RefreshCw, ShieldCheck, Upload, Users,
} from 'lucide-react'
import clsx from 'clsx'
import { useAdminStore } from '../stores/adminStore'
import { useAppStore } from '../stores/appStore'
import { getSchoolTimetable, replaceSchoolTimetable } from '../services/schoolHub'
import {
  chooseAndParseTimetable,
  findSwapCandidates,
  PERIODS_PER_DAY,
  slotLabel,
  TIMETABLE_DAYS,
  type SchoolTimetable,
} from '../services/schoolTimetable'

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
  const configured = Boolean(config.schoolHubUrl)

  const load = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    setError('')
    try {
      const next = await getSchoolTimetable()
      setTimetable(next)
      setSelectedSlot(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => { load() }, [load])

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
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><ArrowLeftRight size={22} className="text-violet-400" /> 시간표 교체</h1>
          <p className="text-sm text-slate-400 mt-1">수업을 선택하면 서로 공강이고 같은 학급 수업을 담당하는 교체 가능 교사를 찾습니다.</p>
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

      {timetable && teacher && (
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
                }}
              >
                {timetable.teachers.map((item, index) => (
                  <option key={`${item.name}-${index}`} value={index}>{item.label}</option>
                ))}
              </select>
            </label>
          </section>

          <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
            <Legend className="bg-emerald-500/25 border-emerald-400/40" text="선택한 수업" />
            <Legend className="bg-amber-400/20 border-amber-300/35" text="선택 교사가 이동 가능한 공강" />
            <Legend className="bg-slate-700/70 border-slate-500/40" text="색상 제한으로 교체 불가" icon={<LockKeyhole size={11} />} />
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
                    const candidateTarget = candidateTargetSlots.has(slotIndex)
                    return (
                      <button
                        key={slotIndex}
                        type="button"
                        onClick={() => {
                          setError('')
                          if (!slot.value) return
                          if (slot.locked) {
                            setError('색상이 지정된 수업은 원본 프로그램과 동일하게 교체 대상에서 제외됩니다.')
                            return
                          }
                          setSelectedSlot(slotIndex)
                        }}
                        className={clsx(
                          'w-full min-h-20 px-3 py-2 flex gap-2 text-left transition-colors',
                          selected && 'bg-emerald-500/25 ring-1 ring-inset ring-emerald-400/40',
                          !selected && candidateTarget && 'bg-amber-400/15 ring-1 ring-inset ring-amber-300/25',
                          !selected && !candidateTarget && slot.locked && 'bg-slate-700/50',
                          !selected && !candidateTarget && !slot.locked && slot.value && 'hover:bg-white/5',
                        )}
                      >
                        <span className="text-[10px] text-slate-600 w-4 pt-0.5 flex-shrink-0">{periodOffset + 1}</span>
                        <SlotContent value={slot.value} locked={slot.locked} />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="card p-5">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <ArrowLeftRight size={16} className="text-violet-400" /> 교체 후보
              {selectedSlot !== null && <span className="text-xs font-normal text-slate-500">· {slotLabel(selectedSlot)}</span>}
            </h2>
            {selectedSlot === null ? (
              <p className="text-sm text-slate-500 mt-4">위 시간표에서 교체하려는 수업을 선택하세요.</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">조건에 맞는 교체 후보가 없습니다.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-3 mt-4">
                {candidates.map(candidate => {
                  const partner = timetable.teachers[candidate.partnerTeacherIndex]
                  const selectedClass = teacher.slots[selectedSlot].value
                  const partnerClass = partner.slots[candidate.partnerSlotIndex].value
                  return (
                    <article key={`${candidate.partnerTeacherIndex}-${candidate.partnerSlotIndex}`} className="rounded-xl border border-orange-400/20 bg-orange-500/5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-orange-200">{partner.label}</p>
                        <span className="text-[10px] rounded-full bg-orange-500/15 text-orange-300 px-2 py-1">교체 가능</span>
                      </div>
                      <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                        <span className="text-slate-600">내 수업</span>
                        <span className="text-slate-300">{slotLabel(selectedSlot)} · {oneLine(selectedClass)}</span>
                        <span className="text-slate-600">상대 수업</span>
                        <span className="text-slate-300">{slotLabel(candidate.partnerSlotIndex)} · {oneLine(partnerClass)}</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function SlotContent({ value, locked }: { value: string; locked: boolean }) {
  if (!value) return <span className="text-xs text-slate-700 self-center">공강</span>
  const lines = value.split('\n').filter(Boolean)
  return (
    <span className="min-w-0 flex-1">
      <span className="text-xs font-semibold text-slate-200 break-words">{lines[0]}</span>
      {lines.slice(1).map((line, index) => <span key={index} className="block text-[10px] text-slate-500 break-words mt-0.5">{line}</span>)}
      {locked && <span className="inline-flex items-center gap-1 text-[9px] text-slate-500 mt-1"><LockKeyhole size={9} /> 교체 제한</span>}
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

function oneLine(value: string) {
  return value.split('\n').filter(Boolean).join(' · ')
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}
