import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, Check, Loader2, School, User, Save, AlertCircle, Zap, Eye, EyeOff, Calendar, Clock, GraduationCap, Plus, Trash2, Power } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { searchSchool, getTimetableRange, NEIS_API_KEY } from '../services/neis'
import { testConnection } from '../services/llm'
import type { SchoolInfo } from '../types'
import clsx from 'clsx'
import { HelpContent } from './HelpPage'

const BREAK_MINUTES = 10

function getCurrentWeekRange(): { fromYmd: string; toYmd: string } {
  const d = new Date()
  const day = d.getDay()
  const daysFromMon = day === 0 ? 6 : day - 1
  const mon = new Date(d)
  mon.setDate(d.getDate() - daysFromMon)
  const fri = new Date(mon)
  fri.setDate(mon.getDate() + 4)
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`
  return { fromYmd: fmt(mon), toYmd: fmt(fri) }
}

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function SettingsPage() {
  const { config, saveConfig } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SchoolInfo[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<SchoolInfo | null>(null)
  const [grade, setGrade] = useState(config.grade ?? '')
  const [classNm, setClassNm] = useState(config.classNm ?? '')
  const [saved, setSaved] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [aiProvider, setAiProvider] = useState<'claude' | 'openai' | 'gemini'>(config.aiProvider ?? 'gemini')
  const [claudeApiKey, setClaudeApiKey] = useState(config.claudeApiKey ?? '')
  const [openaiApiKey, setOpenaiApiKey] = useState(config.openaiApiKey ?? '')
  const [geminiApiKey, setGeminiApiKey] = useState(config.geminiApiKey ?? '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [googleCalendarUrl, setGoogleCalendarUrl] = useState(config.googleCalendarUrl ?? '')
  const [period1Start, setPeriod1Start] = useState(config.period1Start ?? '09:00')
  const [period2Start, setPeriod2Start] = useState(config.period2Start ?? '09:50')
  const [period3Start, setPeriod3Start] = useState(config.period3Start ?? '10:40')
  const [period4Start, setPeriod4Start] = useState(config.period4Start ?? '11:30')
  const [period5Start, setPeriod5Start] = useState(config.period5Start ?? '13:30')
  const [period6Start, setPeriod6Start] = useState(config.period6Start ?? '14:20')
  const [period7Start, setPeriod7Start] = useState(config.period7Start ?? '15:10')
  const [lunchStart, setLunchStart] = useState(config.lunchStart ?? '')
  const [lunchEnd, setLunchEnd] = useState(config.lunchEnd ?? '')
  const [teacherClasses, setTeacherClasses] = useState<Array<{grade:string;classNm:string;subject:string}>>(
    config.teacherClasses ?? []
  )
  const [secondLocationName, setSecondLocationName] = useState(config.secondLocationName ?? '')
  const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null)
  const [tcGrade, setTcGrade] = useState('1')
  const [tcClassNm, setTcClassNm] = useState('1')
  const [tcSubject, setTcSubject] = useState('')
  const [tcSubjectOptions, setTcSubjectOptions] = useState<string[]>([])
  const [tcSubjectLoading, setTcSubjectLoading] = useState(false)
  const tcSubjectsCache = useRef<Record<string, string[]>>({})

  const schoolType = selectedSchool?.schoolType ?? config.schoolType ?? ''
  const neisApiKey = config.neisApiKey?.trim() || NEIS_API_KEY
  const classDuration = schoolType.includes('고등') ? 50 : schoolType.includes('중학') ? 45 : schoolType.includes('초등') ? 40 : 50
  const interval = classDuration + BREAK_MINUTES
  // 학년 선택은 항상 1~6학년 제공 (초등학교 6학년까지 지원)
  const maxGrade = 6

  // 점심시간 기본값: 4교시 종료 ~ 5교시 시작 (미설정 시 자동 계산)
  const period4End = addMinutes(period1Start, interval * 3 + classDuration)
  const effLunchStart = lunchStart || period4End
  const effLunchEnd = lunchEnd || period5Start

  const handlePeriod1Change = (time: string) => {
    setPeriod1Start(time)
    setPeriod2Start(addMinutes(time, interval))
    setPeriod3Start(addMinutes(time, interval * 2))
    setPeriod4Start(addMinutes(time, interval * 3))
  }

  const handlePeriod5Change = (time: string) => {
    setPeriod5Start(time)
    setPeriod6Start(addMinutes(time, interval))
    setPeriod7Start(addMinutes(time, interval * 2))
  }

  useEffect(() => {
    window.electron?.getAutoLaunch().then(v => setAutoLaunch(v)).catch(() => {})
  }, [])

  useEffect(() => {
    setGrade(config.grade ?? '')
    setClassNm(config.classNm ?? '')
    setAiProvider(config.aiProvider ?? 'gemini')
    setClaudeApiKey(config.claudeApiKey ?? '')
    setOpenaiApiKey(config.openaiApiKey ?? '')
    setGeminiApiKey(config.geminiApiKey ?? '')
    setGoogleCalendarUrl(config.googleCalendarUrl ?? '')
    setPeriod1Start(config.period1Start ?? '09:00')
    setPeriod2Start(config.period2Start ?? '09:50')
    setPeriod3Start(config.period3Start ?? '10:40')
    setPeriod4Start(config.period4Start ?? '11:30')
    setPeriod5Start(config.period5Start ?? '13:30')
    setPeriod6Start(config.period6Start ?? '14:20')
    setPeriod7Start(config.period7Start ?? '15:10')
    setLunchStart(config.lunchStart ?? '')
    setLunchEnd(config.lunchEnd ?? '')
    setTeacherClasses(config.teacherClasses ?? [])
    setSecondLocationName(config.secondLocationName ?? '')
  }, [config])

  // 학교 변경 시 과목 캐시 초기화
  useEffect(() => {
    tcSubjectsCache.current = {}
    setTcSubjectOptions([])
    setTcSubject('')
  }, [config.schoolCode, selectedSchool])

  // 학년·반 변경 시 NEIS 시간표에서 실제 과목 목록 조회 (캐시 우선)
  useEffect(() => {
    const officeCode = config.officeCode
    const schoolCode = config.schoolCode
    const sType = selectedSchool?.schoolType ?? config.schoolType
    if (!officeCode || !schoolCode || !sType) {
      setTcSubjectOptions([])
      return
    }
    const cacheKey = `${tcGrade}_${tcClassNm}`
    const cached = tcSubjectsCache.current[cacheKey]
    if (cached) {
      setTcSubjectOptions(cached)
      setTcSubject(cached[0] ?? '')
      return
    }
    let cancelled = false
    setTcSubjectLoading(true)
    setTcSubject('')
    const { fromYmd, toYmd } = getCurrentWeekRange()
    getTimetableRange(neisApiKey, officeCode, schoolCode, sType, tcGrade, tcClassNm, fromYmd, toYmd)
      .then(entries => {
        if (cancelled) return
        const unique = [...new Set(entries.map(e => e.subject).filter(Boolean))].sort()
        tcSubjectsCache.current[cacheKey] = unique
        setTcSubjectOptions(unique)
        if (unique.length > 0) setTcSubject(unique[0])
      })
      .catch(() => { if (!cancelled) setTcSubjectOptions([]) })
      .finally(() => { if (!cancelled) setTcSubjectLoading(false) })
    return () => { cancelled = true }
  }, [tcGrade, tcClassNm, config.officeCode, config.schoolCode, config.schoolType, selectedSchool, neisApiKey])


  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearchError('')
    setSearching(true)
    try {
      const results = await searchSchool(neisApiKey, searchQuery)
      setSearchResults(results)
      if (!results.length) setSearchError('검색 결과가 없습니다. 학교명을 확인해주세요.')
    } catch {
      setSearchError('검색 중 오류가 발생했습니다.')
    } finally {
      setSearching(false)
    }
  }

  const handleSelectSchool = (school: SchoolInfo) => {
    setSelectedSchool(school)
    setSearchResults([])
    setSearchQuery(school.schoolName)
  }

  const handleSave = async () => {
    const patch: Partial<import('../types').AppConfig> = {
      grade,
      classNm,
      aiProvider,
      claudeApiKey,
      openaiApiKey,
      geminiApiKey,
      googleCalendarUrl,
      period1Start,
      period2Start,
      period3Start,
      period4Start,
      period5Start,
      period6Start,
      period7Start,
      lunchStart: effLunchStart,
      lunchEnd: effLunchEnd,
      teacherClasses,
      secondLocationName,
    }
    if (selectedSchool) {
      patch.schoolName = selectedSchool.schoolName
      patch.officeName = selectedSchool.officeName
      patch.officeCode = selectedSchool.officeCode
      patch.schoolCode = selectedSchool.schoolCode
      patch.schoolType = selectedSchool.schoolType
      patch.schoolAddress = selectedSchool.address
    }
    await saveConfig(patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const msg = await testConnection({ ...config, aiProvider, claudeApiKey, openaiApiKey, geminiApiKey })
      setTestResult({ ok: true, msg })
    } catch (e) {
      setTestResult({ ok: false, msg: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const currentKeyValue = aiProvider === 'claude' ? claudeApiKey : aiProvider === 'openai' ? openaiApiKey : geminiApiKey
  const setCurrentKey = (v: string) => {
    if (aiProvider === 'claude') setClaudeApiKey(v)
    else if (aiProvider === 'openai') setOpenaiApiKey(v)
    else setGeminiApiKey(v)
  }

  const PROVIDER_INFO = {
    claude: { label: 'Claude (Anthropic)', placeholder: 'sk-ant-api03-...', url: 'https://console.anthropic.com', color: 'text-amber-400' },
    openai: { label: 'ChatGPT (OpenAI)', placeholder: 'sk-proj-...', url: 'https://platform.openai.com/api-keys', color: 'text-emerald-400' },
    gemini: { label: 'Gemini (Google)', placeholder: 'AIzaSy...', url: 'https://aistudio.google.com/app/apikey', color: 'text-sky-400' },
  }

  const currentSchool = selectedSchool?.schoolName ?? config.schoolName

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="page-title">환경설정</h1>
        <p className="page-subtitle">학교 정보, AI 모델, 수업 시간 등 사용자 설정을 관리합니다.</p>
      </div>

      <div className="grid grid-cols-2 gap-8 items-start">
      {/* ── 왼쪽: 설정 항목들 ── */}
      <div className="space-y-4">
        {/* School Search */}
        <Section icon={<School size={16} className="text-sky-400" />} title="학교 설정">
          {currentSchool && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-3">
              <Check size={14} className="text-emerald-400 flex-shrink-0" />
              <span className="text-emerald-300 text-sm font-medium">{currentSchool}</span>
              {(selectedSchool?.officeName ?? config.officeName) && (
                <span className="text-emerald-500 text-xs ml-1">· {selectedSchool?.officeName ?? config.officeName}</span>
              )}
            </div>
          )}
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="남원고등학교"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <button onClick={handleSearch} disabled={searching} className="btn-primary flex items-center gap-2 flex-shrink-0">
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                검색
              </button>
            </div>
            {searchError && (
              <div className="flex items-center gap-2 text-amber-400 text-xs">
                <AlertCircle size={13} />{searchError}
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="border border-white/10 rounded-xl overflow-hidden bg-surface-900">
                {searchResults.slice(0, 8).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectSchool(s)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{s.schoolName}</p>
                      <p className="text-xs text-slate-400">{s.officeName} · {s.schoolType} · {s.address}</p>
                    </div>
                    <Check size={14} className="text-slate-600 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 추가 날씨 지역 */}
          <div className="mt-3 pt-3 border-t border-white/5">
            <label className="text-xs text-slate-400 mb-1.5 block">추가 날씨 지역 (선택)</label>
            <input
              className="input w-full"
              placeholder="예: 남원시, 서울특별시, 춘천시"
              value={secondLocationName}
              onChange={e => setSecondLocationName(e.target.value)}
            />
            <p className="text-[10px] text-slate-600 mt-1">대시보드에 두 번째 날씨 카드로 표시됩니다.</p>
          </div>

        </Section>

        {/* AI Model Settings */}
        <Section icon={<Zap size={16} className="text-violet-400" />} title="AI 모델 설정">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-2 block">AI 제공사 선택</label>
              <div className="flex gap-2">
                {(['gemini', 'claude', 'openai'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setAiProvider(p); setTestResult(null) }}
                    className={clsx(
                      'flex-1 py-2 rounded-xl text-sm font-medium transition-all border',
                      aiProvider === p
                        ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                        : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/5'
                    )}
                  >
                    {PROVIDER_INFO[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">
                <span className={PROVIDER_INFO[aiProvider].color}>{PROVIDER_INFO[aiProvider].label}</span> API 키
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    className="input w-full pr-10"
                    placeholder={PROVIDER_INFO[aiProvider].placeholder}
                    value={currentKeyValue}
                    onChange={e => setCurrentKey(e.target.value)}
                  />
                  <button
                    onClick={() => setShowApiKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={testing || !currentKeyValue}
                  className="btn-primary flex items-center gap-2 flex-shrink-0 disabled:opacity-40"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  테스트
                </button>
              </div>
              {testResult && (
                <div className={clsx(
                  'flex items-center gap-2 mt-2 text-xs px-3 py-2 rounded-lg',
                  testResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                )}>
                  {testResult.ok ? <Check size={13} /> : <AlertCircle size={13} />}
                  {testResult.msg}
                </div>
              )}
              <p className="text-xs text-slate-500 mt-1.5">
                API 키 발급:{' '}
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); window.electron?.openExternal(PROVIDER_INFO[aiProvider].url) }}
                  className="text-violet-400 hover:text-violet-300 underline cursor-pointer"
                >
                  {PROVIDER_INFO[aiProvider].url.replace('https://', '')}
                </a>
              </p>
            </div>
          </div>
        </Section>

        {/* User settings */}
        <Section icon={<User size={16} className="text-emerald-400" />} title="사용자 설정">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">학년 (시간표 조회용)</label>
              <select className="input w-full" value={grade} onChange={e => setGrade(e.target.value)}>
                <option value="">선택</option>
                {Array.from({ length: maxGrade }, (_, i) => i + 1).map(n => (
                  <option key={n} value={String(n)}>{n}학년</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">반 (시간표 조회용)</label>
              <select className="input w-full" value={classNm} onChange={e => setClassNm(e.target.value)}>
                <option value="">선택</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={String(n)}>{n}반</option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* Google Calendar */}
        <Section icon={<Calendar size={16} className="text-sky-400" />} title="구글 캘린더 연동">
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              구글 캘린더의 공개 embed URL을 입력하면 대시보드에서 달력을 확인할 수 있습니다.
            </p>
            <div className="text-xs text-sky-600/80 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2 space-y-1">
              <div>① 구글 캘린더 → ⚙️ → 설정 → <strong>내 캘린더의 설정</strong> 선택</div>
              <div>② <strong>캘린더 통합</strong> 섹션 선택</div>
              <div>③ <strong>이 캘린더의 공개된 URL</strong> 복사 후 아래 입력</div>
              <div className="text-slate-500 pt-0.5">※ <strong>일정의 액세스 권한</strong> 섹션 선택 후, <strong>공개 사용 설정</strong> 체크박스에 체크</div>
            </div>
            <input
              className="input w-full"
              placeholder="https://calendar.google.com/calendar/embed?src=..."
              value={googleCalendarUrl}
              onChange={e => setGoogleCalendarUrl(e.target.value)}
            />
          </div>
        </Section>

        {/* Period times */}
        <Section icon={<Clock size={16} className="text-amber-400" />} title="수업 시간 설정">
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
              <Clock size={12} />
              <span>
                {schoolType ? `${schoolType} 기준` : '기본값 (고등학교 기준)'} — 수업 <strong>{classDuration}분</strong> + 쉬는시간 <strong>{BREAK_MINUTES}분</strong>
              </span>
            </div>
            <p className="text-xs text-slate-500">
              1교시·5교시 기준점을 설정하면 2·3·4교시(오전)와 6·7교시(오후)가 자동 계산됩니다.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">오전 기준</p>
                <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                  1교시 시작
                  <span className="text-[9px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full font-semibold">기준점</span>
                </label>
                <input
                  type="time"
                  className="input w-full ring-1 ring-violet-500/30"
                  value={period1Start}
                  onChange={e => handlePeriod1Change(e.target.value)}
                />
                <p className="text-[10px] text-slate-600 mt-2">
                  2교시 {period2Start} · 3교시 {period3Start} · 4교시 {period4Start} 자동 설정
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">오후 기준</p>
                <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                  5교시 시작
                  <span className="text-[9px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full font-semibold">기준점</span>
                </label>
                <input
                  type="time"
                  className="input w-full ring-1 ring-violet-500/30"
                  value={period5Start}
                  onChange={e => handlePeriod5Change(e.target.value)}
                />
                <p className="text-[10px] text-slate-600 mt-2">
                  6교시 {period6Start} · 7교시 {period7Start} 자동 설정
                </p>
              </div>
            </div>

            {/* 점심시간 설정 */}
            <div className="pt-3 border-t border-white/5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                🍱 점심시간
                <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-semibold normal-case tracking-normal">시간표 표시</span>
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">점심시간 시작</label>
                  <input
                    type="time"
                    className="input w-full"
                    value={effLunchStart}
                    onChange={e => setLunchStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">점심시간 종료</label>
                  <input
                    type="time"
                    className="input w-full"
                    value={effLunchEnd}
                    onChange={e => setLunchEnd(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-600 mt-2">
                설정한 점심시간이 대시보드 주간 시간표에 “점심시간” 행으로 표시됩니다. (미설정 시 4교시 종료~5교시 시작으로 자동 적용)
              </p>
            </div>
          </div>
        </Section>

        {/* Save button (before teacher classes) */}
        <div className="flex justify-end pt-2">
          <motion.button
            onClick={handleSave}
            whileTap={{ scale: 0.97 }}
            className={clsx(
              'flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all',
              saved
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                : 'btn-primary'
            )}
          >
            {saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? '저장되었습니다!' : '설정 저장'}
          </motion.button>
        </div>

        {/* Teacher classes */}
        <Section icon={<GraduationCap size={16} className="text-violet-400" />} title="담당 학급 설정">
          <div className="space-y-3">
            <p className="text-xs text-slate-500">담당 학급과 과목을 추가하면 NEIS 탭에서 내 수업 시간표가 표시됩니다.</p>

            {teacherClasses.length > 0 && (
              <div className="space-y-1.5">
                {teacherClasses.map((tc, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 bg-white/3 border border-white/5 rounded-xl">
                    <span className="text-sm text-slate-300">{tc.grade}학년 {tc.classNm}반 · {tc.subject || '과목 미설정'}</span>
                    <button
                      onClick={() => {
                        const next = teacherClasses.filter((_, i) => i !== idx)
                        setTeacherClasses(next)
                        saveConfig({ teacherClasses: next })
                      }}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">학년</label>
                <select
                  className="input w-full"
                  value={tcGrade}
                  onChange={e => setTcGrade(e.target.value)}
                >
                  {Array.from({length: maxGrade}, (_, i) => i + 1).map(n => (
                    <option key={n} value={String(n)}>{n}학년</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">반</label>
                <select
                  className="input w-full"
                  value={tcClassNm}
                  onChange={e => setTcClassNm(e.target.value)}
                >
                  {Array.from({length: 20}, (_, i) => i + 1).map(n => (
                    <option key={n} value={String(n)}>{n}반</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                  과목
                  {tcSubjectLoading && <Loader2 size={10} className="animate-spin text-slate-500" />}
                  {!tcSubjectLoading && tcSubjectOptions.length > 0 && (
                    <span className="text-[9px] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded-full">NEIS</span>
                  )}
                  {!tcSubjectLoading && tcSubjectOptions.length === 0 && config.officeCode && (
                    <span className="text-[9px] bg-white/5 text-slate-500 px-1.5 py-0.5 rounded-full">직접입력</span>
                  )}
                </label>
                {tcSubjectLoading ? (
                  <div className="input w-full text-slate-500 text-sm cursor-not-allowed">불러오는 중...</div>
                ) : tcSubjectOptions.length > 0 ? (
                  <select
                    className="input w-full"
                    value={tcSubject}
                    onChange={e => setTcSubject(e.target.value)}
                  >
                    {tcSubjectOptions.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input w-full disabled:opacity-40 disabled:cursor-not-allowed"
                    value={tcSubject}
                    onChange={e => setTcSubject(e.target.value)}
                    placeholder={config.officeCode ? '과목명 직접 입력' : '학교를 먼저 설정하세요'}
                    disabled={!config.officeCode}
                  />
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (teacherClasses.some(tc => tc.grade === tcGrade && tc.classNm === tcClassNm && tc.subject === tcSubject)) return
                const next = [...teacherClasses, { grade: tcGrade, classNm: tcClassNm, subject: tcSubject }]
                setTeacherClasses(next)
                saveConfig({ teacherClasses: next })
                setTcSubject('')
              }}
              disabled={teacherClasses.some(tc => tc.grade === tcGrade && tc.classNm === tcClassNm && tc.subject === tcSubject)}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Plus size={14} /> 담당 학급 추가
            </button>
          </div>
        </Section>

        {/* App settings */}
        <Section icon={<Power size={16} className="text-rose-400" />} title="앱 설정">
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-white">Windows 시작 시 자동 실행</p>
              <p className="text-xs text-slate-500 mt-0.5">컴퓨터 부팅 후 앱이 자동으로 시작됩니다.</p>
            </div>
            <button
              onClick={async () => {
                const next = !(autoLaunch ?? false)
                setAutoLaunch(next)
                await window.electron?.setAutoLaunch(next)
              }}
              disabled={autoLaunch === null}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${
                autoLaunch ? 'bg-emerald-500' : 'bg-white/10'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                autoLaunch ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </Section>

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <motion.button
            onClick={handleSave}
            whileTap={{ scale: 0.97 }}
            className={clsx(
              'flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all',
              saved
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                : 'btn-primary'
            )}
          >
            {saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? '저장되었습니다!' : '설정 저장'}
          </motion.button>
        </div>
      </div>

      {/* ── 오른쪽: 사용 매뉴얼 ── */}
      <div className="border-l border-white/5 pl-8">
        <HelpContent />
      </div>

      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">{icon}</div>
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}
