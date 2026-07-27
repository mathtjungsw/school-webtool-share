import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, BarChart3, GraduationCap, ClipboardCheck,
  Users, Sparkles, AlertCircle, CheckCircle2, AlertTriangle,
  Info, RotateCcw, TrendingUp, BookOpen, Clock, Star, Award,
  ChevronRight, Heart,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { parseSaenggibu } from '../services/saenggibu/parser'
import type { SaenggibuRecord, GradeSubject } from '../services/saenggibu/types'
import { generateText } from '../services/llm'
import clsx from 'clsx'

// ── AI 결과 타입 ─────────────────────────────────────────────────────────────

interface CompetencyItem { score: number; comment: string; strengths: string[]; improvements: string[] }
interface CompetencyResult {
  gradeSystemNote: string
  academic: CompetencyItem
  major: CompetencyItem
  community: CompetencyItem
  growth: CompetencyItem
  overallScore: number
  universityTier: string
  overallComment: string
  keyStrengths: string[]
  criticalWeaknesses: string[]
  recommendedMajors: Array<{ major: string; university: string; reason: string }>
}

interface CareerResult {
  aspiration: string
  consistencyScore: number
  consistencyLevel: string
  evidences: string[]
  gaps: string[]
  suggestions: string[]
  collegeStrategy: string
}

interface TeacherIssue { severity: 'error' | 'warning' | 'info'; message: string }
interface TeacherSection { name: string; status: 'pass' | 'warning' | 'fail'; issues: TeacherIssue[] }
interface TeacherResult { sections: TeacherSection[]; summary: string }

interface StudentResult {
  greeting: string
  strengths: string[]
  growthAreas: string[]
  careerComment: string
  encouragement: string
  nextSteps: string[]
}

type Tab = 'summary' | 'competency' | 'career' | 'teacher' | 'student'

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType; ai?: boolean }> = [
  { id: 'summary',    label: '정량 요약',   icon: BarChart3 },
  { id: 'competency', label: '학종 역량',   icon: GraduationCap, ai: true },
  { id: 'career',     label: '진로 분석',   icon: TrendingUp,    ai: true },
  { id: 'teacher',    label: '교사 점검',   icon: ClipboardCheck, ai: true },
  { id: 'student',    label: '학생 리포트', icon: Heart,          ai: true },
]

// ── 프롬프트 빌더 ─────────────────────────────────────────────────────────────

function buildBasePrompt(rec: SaenggibuRecord): string {
  const m = rec.metrics
  const p = rec.personal

  const gradeRows = rec.grades.subjects.map(s =>
    `  ${s.year ?? '?'}학년 ${s.semester ?? '?'}학기 | ${s.dept ?? ''} | ${s.subject ?? ''} | ${s.credit ?? ''}학점 | 원점수 ${s.rawScore} | 과목평균 ${s.subjectAvg} | 성취도 ${s.achievement ?? '-'} | 등급 ${s.rank ?? '-'} | ${s.enrolled ?? ''}명`
  ).join('\n')

  const artsPeRows = rec.grades.artsPe.map(s =>
    `  ${s.year ?? '?'}학년 ${s.semester ?? '?'}학기 | ${s.dept ?? ''} | ${s.subject ?? ''} | ${s.credit ?? ''}학점 | 성취도 ${s.achievement ?? '-'}`
  ).join('\n')

  const sebakText = rec.grades.sebak.map(s => `  [${s.subject}] ${s.text}`).join('\n')
  const behaviorText = Object.entries(rec.behavior).map(([g, t]) => `  [${g}학년] ${t}`).join('\n')

  const creativeText = rec.creative.areas.map(a => `  ${a.area}: ${a.hours}시간`).join('\n')

  const awardsText = rec.awards.length
    ? rec.awards.map(a => `  ${a.date} ${a.title} (${a.org ?? ''})`).join('\n')
    : '  없음'

  const readingText = rec.reading.books.length ? rec.reading.books.join(', ') : '미기재'

  return `학생 기본정보:
  이름: ${p.name ?? '미상'} / 성별: ${p.gender ?? '미상'} / 생년월일: ${p.birth ?? '미상'}
  입학년도: ${m.admissionYear ?? '미상'} → ${m.gradeSystem}
  진로희망: ${m.careerAspiration ?? '미기재'}

성적 (교과 과목, ${m.gradedSubjectCount}과목, 평균원점수 ${m.avgRawScore?.toFixed(1) ?? '-'}, 평균등급 ${m.avgRank?.toFixed(2) ?? '-'}):
${gradeRows || '  데이터 없음'}

예·체능 과목:
${artsPeRows || '  없음'}

출결:
${rec.attendance.map(a => `  ${a.grade}학년: 수업일수 ${a.schoolDays}일, 무결석 ${a.perfectAttendance ? '예' : '아니오'}${a.absenceFigures > 0 ? `, 결석 관련 ${a.absenceFigures}건` : ''}`).join('\n') || '  데이터 없음'}

창체 활동:
${creativeText || '  데이터 없음'}
  진로희망: ${rec.creative.aspiration ?? '미기재'}
  봉사활동: 총 ${m.volunteerHours}시간 (${m.volunteerCount}회)

수상경력 (※ 2022개정교육과정 적용 학생은 수상경력 대입 미반영):
${awardsText}

세부능력 및 특기사항:
${sebakText || '  데이터 없음'}

행동특성 및 종합의견:
${behaviorText || '  데이터 없음'}

독서활동: ${readingText}`
}

// JSON 파싱 헬퍼 (```json ... ``` 감싸기 처리)
function parseJsonSafe<T>(text: string): T | null {
  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function SaenggibuAnalysisPage() {
  const { config } = useAppStore()
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [record, setRecord] = useState<SaenggibuRecord | null>(null)
  const [tab, setTab] = useState<Tab>('summary')

  const [competencyResult, setCompetencyResult] = useState<CompetencyResult | null>(null)
  const [careerResult, setCareerResult] = useState<CareerResult | null>(null)
  const [teacherResult, setTeacherResult] = useState<TeacherResult | null>(null)
  const [studentResult, setStudentResult] = useState<StudentResult | null>(null)

  const [aiLoading, setAiLoading] = useState<Tab | null>(null)
  const [aiError, setAiError] = useState<Record<Tab, string>>({} as Record<Tab, string>)
  const abortRef = useRef<AbortController | null>(null)

  const reset = () => {
    setFilePath(null); setFileName(''); setRecord(null); setParseError('')
    setCompetencyResult(null); setCareerResult(null); setTeacherResult(null); setStudentResult(null)
    setAiLoading(null); setAiError({} as Record<Tab, string>)
  }

  const loadFile = useCallback(async (path: string, name: string) => {
    setFilePath(path); setFileName(name); setRecord(null); setParseError('')
    setParsing(true)
    try {
      const layout = await window.electron.extractPdfLayout(path)
      if (!layout.success || layout.totalChars < 100) {
        setParseError(layout.error ?? '텍스트를 추출할 수 없습니다. 이미지 기반 PDF이거나 지원되지 않는 형식입니다.')
        return
      }
      const rec = parseSaenggibu(layout.pages)
      setRecord(rec)
    } catch (e) {
      setParseError((e as Error).message)
    } finally {
      setParsing(false)
    }
  }, [])

  const handleFileSelect = async () => {
    const path = await window.electron.openFileDialog([{ name: 'PDF 파일', extensions: ['pdf'] }])
    if (path) {
      const name = path.split(/[\\/]/).pop() ?? path
      await loadFile(path, name)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const path = (file as { path?: string }).path
    if (!path) { setParseError('파일 경로를 확인할 수 없습니다.'); return }
    if (!file.name.toLowerCase().endsWith('.pdf')) { setParseError('PDF 파일만 지원합니다.'); return }
    await loadFile(path, file.name)
  }

  const runAi = async (t: Tab) => {
    if (!record) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setAiLoading(t)
    setAiError(prev => ({ ...prev, [t]: '' }))
    const base = buildBasePrompt(record)
    const signal = abortRef.current.signal

    try {
      if (t === 'competency') {
        const prompt = `${base}

위 학생의 학교생활기록부를 분석하여 2025학년도 학생부종합전형 기준으로 4가지 역량을 평가하세요.
주의: 이 학생은 2022 개정 교육과정 적용 학생으로 5등급제를 적용합니다. 성취도 A=상위10%, B=상위34%, C=이하. 석차등급(rank)이 있어도 구 9등급제 기준이 아닙니다.

JSON만 반환 (설명 없이):
{
  "gradeSystemNote": "2022개정 5등급제 적용(2025학년도 입학) — 등급 1은 상위 10% 의미",
  "academic": {
    "score": 0~10 정수,
    "comment": "한두 문장 평가",
    "strengths": ["강점1", "강점2"],
    "improvements": ["개선1"]
  },
  "major": { "score": 0~10, "comment": "", "strengths": [], "improvements": [] },
  "community": { "score": 0~10, "comment": "", "strengths": [], "improvements": [] },
  "growth": { "score": 0~10, "comment": "", "strengths": [], "improvements": [] },
  "overallScore": 0~10,
  "universityTier": "최상위(SKY급)" 또는 "상위(연고중하~인서울)" 또는 "중상위(지방거점국립)" 또는 "중하위",
  "overallComment": "전체 총평 2~3문장",
  "keyStrengths": ["핵심강점1", "핵심강점2", "핵심강점3"],
  "criticalWeaknesses": ["치명약점1"],
  "recommendedMajors": [
    { "major": "전공명", "university": "대학명 예시", "reason": "이유 한 문장" }
  ]
}`
        const text = await generateText(config, prompt, undefined, signal)
        const result = parseJsonSafe<CompetencyResult>(text)
        if (!result) throw new Error('AI 응답을 파싱하지 못했습니다.')
        setCompetencyResult(result)
      }

      else if (t === 'career') {
        const prompt = `${base}

위 학생의 진로희망을 중심으로 학교생활기록부 전반의 진로 일관성을 분석하세요.

JSON만 반환:
{
  "aspiration": "진로희망 한 줄",
  "consistencyScore": 0~10,
  "consistencyLevel": "매우 높음" 또는 "높음" 또는 "보통" 또는 "낮음",
  "evidences": ["근거 활동 1", "근거 활동 2"],
  "gaps": ["진로와 연결 부족한 부분"],
  "suggestions": ["보완 제안 1", "보완 제안 2"],
  "collegeStrategy": "진로 기반 대입 전략 요약 (3~5문장)"
}`
        const text = await generateText(config, prompt, undefined, signal)
        const result = parseJsonSafe<CareerResult>(text)
        if (!result) throw new Error('AI 응답을 파싱하지 못했습니다.')
        setCareerResult(result)
      }

      else if (t === 'teacher') {
        const prompt = `${base}

위 학교생활기록부를 교사 관점에서 점검하세요. 교육부 기재요령 위반(날짜형식, 비교표현, 특정외부기관명, 소논문, 금지어, 미기재 항목 등)을 체크하세요.

JSON만 반환:
{
  "sections": [
    {
      "name": "섹션명(예: 출결상황)",
      "status": "pass" 또는 "warning" 또는 "fail",
      "issues": [
        { "severity": "error" 또는 "warning" 또는 "info", "message": "구체적 지적 사항" }
      ]
    }
  ],
  "summary": "전체 점검 결과 요약 2문장"
}`
        const text = await generateText(config, prompt, undefined, signal)
        const result = parseJsonSafe<TeacherResult>(text)
        if (!result) throw new Error('AI 응답을 파싱하지 못했습니다.')
        setTeacherResult(result)
      }

      else if (t === 'student') {
        const prompt = `${base}

위 학생의 학교생활기록부를 바탕으로 학생·학부모가 이해하기 쉬운 진단 리포트를 작성하세요.
쉬운 말, 긍정적이고 격려하는 톤을 사용하세요.

JSON만 반환:
{
  "greeting": "학생에게 한마디 인사말 (이름 포함, 1문장)",
  "strengths": ["나의 강점 1", "강점 2", "강점 3"],
  "growthAreas": ["성장 포인트 1", "성장 포인트 2"],
  "careerComment": "진로 관련 응원 2문장",
  "encouragement": "격려 메시지 2~3문장",
  "nextSteps": ["앞으로 할 일 1", "앞으로 할 일 2", "앞으로 할 일 3"]
}`
        const text = await generateText(config, prompt, undefined, signal)
        const result = parseJsonSafe<StudentResult>(text)
        if (!result) throw new Error('AI 응답을 파싱하지 못했습니다.')
        setStudentResult(result)
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setAiError(prev => ({ ...prev, [t]: (e as Error).message }))
      }
    } finally {
      setAiLoading(null)
    }
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4 min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-white">생기부 분석+</h1>
          <p className="text-xs text-slate-500 mt-0.5">2022개정 교육과정(5등급제) 완전 지원 · 결정적 파싱 + AI 분석</p>
        </div>
        {record && (
          <button onClick={reset} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <RotateCcw size={12} /> 초기화
          </button>
        )}
      </div>

      {/* 파일 드롭 영역 */}
      {!record && !parsing && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={handleFileSelect}
          className={clsx(
            'flex-shrink-0 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
            dragging ? 'border-violet-500 bg-violet-500/10' : 'border-white/10 hover:border-violet-500/50 hover:bg-white/3'
          )}
        >
          <div className={clsx('w-14 h-14 rounded-2xl flex items-center justify-center transition-colors', dragging ? 'bg-violet-500/20' : 'bg-white/5')}>
            <Upload size={24} className={dragging ? 'text-violet-400' : 'text-slate-500'} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">생기부 PDF를 드래그하거나 클릭하여 선택</p>
            <p className="text-xs text-slate-600 mt-1">NEIS 학교생활기록부II (2025·2026학년도 1·2학년)</p>
          </div>
        </div>
      )}

      {/* 파싱 중 */}
      {parsing && (
        <div className="flex-shrink-0 rounded-2xl bg-white/3 border border-white/5 p-8 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-300">PDF 레이아웃 분석 중...</span>
        </div>
      )}

      {/* 파싱 오류 */}
      {parseError && (
        <div className="flex-shrink-0 rounded-xl bg-red-500/10 border border-red-500/30 p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-300 font-medium">파싱 오류</p>
            <p className="text-xs text-red-400 mt-1">{parseError}</p>
          </div>
        </div>
      )}

      {/* 파일 정보 헤더 (파싱 완료) */}
      {record && (
        <>
          <div className="flex-shrink-0 rounded-xl bg-white/3 border border-white/5 p-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={14} className="text-violet-400 flex-shrink-0" />
              <span className="text-xs text-slate-300 truncate max-w-xs">{fileName}</span>
            </div>
            <div className="flex items-center gap-3 ml-auto flex-wrap">
              <InfoChip label="학생" value={record.personal.name ?? '미상'} />
              <InfoChip label="입학" value={`${record.metrics.admissionYear ?? '?'}년`} />
              <span className={clsx(
                'px-2 py-0.5 rounded-full text-[10px] font-bold',
                record.metrics.admissionYear && record.metrics.admissionYear >= 2025
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              )}>
                {record.metrics.gradeSystem}
              </span>
              <InfoChip label="진로" value={record.metrics.careerAspiration ?? '미기재'} />
              <InfoChip label="평균원점수" value={record.metrics.avgRawScore?.toFixed(1) ?? '-'} />
              {record.metrics.avgRank !== null && (
                <InfoChip label="평균등급" value={record.metrics.avgRank.toFixed(2)} />
              )}
              <InfoChip label="무결석" value={record.metrics.perfectAttendance ? '✓' : '✗'} highlight={record.metrics.perfectAttendance} />
              <InfoChip label="봉사" value={`${record.metrics.volunteerHours}h`} />
            </div>
          </div>

          {/* 탭 바 */}
          <div className="flex-shrink-0 flex gap-1 bg-white/3 p-1 rounded-xl">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center',
                  tab === t.id
                    ? 'bg-gradient-to-r from-violet-500/30 to-sky-500/20 text-white border border-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                )}
              >
                <t.icon size={12} />
                <span className="hidden sm:inline">{t.label}</span>
                {t.ai && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-500/30 text-violet-300">AI</span>}
              </button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {tab === 'summary' && <SummaryTab record={record} />}
                {tab === 'competency' && <AiTab tab="competency" result={competencyResult} loading={aiLoading === 'competency'} error={aiError.competency} onRun={() => runAi('competency')}><CompetencyContent result={competencyResult} /></AiTab>}
                {tab === 'career' && <AiTab tab="career" result={careerResult} loading={aiLoading === 'career'} error={aiError.career} onRun={() => runAi('career')}><CareerContent result={careerResult} /></AiTab>}
                {tab === 'teacher' && <AiTab tab="teacher" result={teacherResult} loading={aiLoading === 'teacher'} error={aiError.teacher} onRun={() => runAi('teacher')}><TeacherContent result={teacherResult} /></AiTab>}
                {tab === 'student' && <AiTab tab="student" result={studentResult} loading={aiLoading === 'student'} error={aiError.student} onRun={() => runAi('student')}><StudentContent result={studentResult} /></AiTab>}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}

// ── 공통 헬퍼 컴포넌트 ────────────────────────────────────────────────────────

function InfoChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-slate-600">{label}</span>
      <span className={clsx('text-[11px] font-medium', highlight ? 'text-emerald-400' : 'text-slate-300')}>{value}</span>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white/3 border border-white/5 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-violet-400" />
        <h3 className="text-xs font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function AiTab({ result, loading, error, onRun, children }: {
  tab: Tab; result: unknown; loading: boolean; error: string; onRun: () => void; children: React.ReactNode
}) {
  if (!result && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-md text-center">
            {error}
          </div>
        )}
        <button
          onClick={onRun}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-sky-500 text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/20"
        >
          <Sparkles size={14} />
          AI 분석 시작
        </button>
        <p className="text-xs text-slate-600">AI API 키가 환경설정에 등록되어 있어야 합니다.</p>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400">AI 분석 중...</p>
      </div>
    )
  }
  return <div className="pb-4">{children}</div>
}

// ── 탭별 콘텐츠 ───────────────────────────────────────────────────────────────

function SummaryTab({ record: rec }: { record: SaenggibuRecord }) {
  const m = rec.metrics

  // 학년+학기로 그룹
  const gradeGroups = rec.grades.subjects.reduce<Record<string, GradeSubject[]>>((acc, s) => {
    const key = `${s.year ?? '?'}학년 ${s.semester ?? '?'}학기`
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  const achievementColor = (a: string | null) => {
    if (!a) return 'text-slate-500'
    if (a === 'A') return 'text-emerald-400 font-bold'
    if (a === 'B') return 'text-sky-400 font-semibold'
    if (a === 'C') return 'text-amber-400'
    return 'text-slate-300'
  }

  return (
    <div className="grid gap-3">
      {/* 2022개정 안내 */}
      {m.admissionYear && m.admissionYear >= 2025 && (
        <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3 flex items-start gap-3">
          <Info size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-violet-300 leading-relaxed">
            <strong>2022 개정 교육과정 적용 학생 (입학 {m.admissionYear}년)</strong> — 성취평가제 <strong>5등급제</strong>: A(상위 10%) · B(상위 34%) · C(이하).<br />
            일반선택 과목에 석차등급 있음. 수상경력은 대입 미반영(교내 수상이어도 대학에 미제출).
          </div>
        </div>
      )}

      {/* 성적 테이블 */}
      <Section title="교과 성적" icon={BarChart3}>
        {Object.entries(gradeGroups).length > 0 ? (
          <div className="space-y-4">
            {Object.entries(gradeGroups).map(([grpKey, subjects]) => (
              <div key={grpKey}>
                <p className="text-[10px] font-semibold text-slate-500 mb-1.5">{grpKey}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left text-slate-600 font-medium pb-1.5 pr-3">교과</th>
                        <th className="text-left text-slate-600 font-medium pb-1.5 pr-3">과목</th>
                        <th className="text-right text-slate-600 font-medium pb-1.5 pr-3">학점</th>
                        <th className="text-right text-slate-600 font-medium pb-1.5 pr-3">원점수</th>
                        <th className="text-right text-slate-600 font-medium pb-1.5 pr-3">과목평균</th>
                        <th className="text-center text-slate-600 font-medium pb-1.5 pr-3">성취도</th>
                        <th className="text-center text-slate-600 font-medium pb-1.5 pr-3">등급</th>
                        <th className="text-right text-slate-600 font-medium pb-1.5">수강인원</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map((s, i) => (
                        <tr key={i} className="border-b border-white/3 hover:bg-white/3 transition-colors">
                          <td className="py-1.5 pr-3 text-slate-400">{s.dept ?? '-'}</td>
                          <td className="py-1.5 pr-3 text-slate-200 font-medium">{s.subject ?? '-'}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-400">{s.credit ?? '-'}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-200 font-medium">{s.rawScore}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-400">{s.subjectAvg}</td>
                          <td className={clsx('py-1.5 pr-3 text-center', achievementColor(s.achievement))}>{s.achievement ?? '-'}</td>
                          <td className="py-1.5 pr-3 text-center text-slate-300">{s.rank ?? '-'}</td>
                          <td className="py-1.5 text-right text-slate-500">{s.enrolled ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* 성취도 분포 */}
            {Object.keys(m.achievementCounts).length > 0 && (
              <div className="flex items-center gap-4 pt-1 border-t border-white/5">
                <span className="text-[10px] text-slate-600">성취도 분포</span>
                {['A','B','C','D','E'].map(g => m.achievementCounts[g] ? (
                  <span key={g} className={clsx('text-[10px] font-bold', achievementColor(g))}>
                    {g}: {m.achievementCounts[g]}과목
                  </span>
                ) : null)}
                <span className="text-[10px] text-slate-600 ml-auto">평균원점수 <strong className="text-slate-300">{m.avgRawScore?.toFixed(1)}</strong></span>
                {m.avgRank !== null && <span className="text-[10px] text-slate-600">평균등급 <strong className="text-slate-300">{m.avgRank.toFixed(2)}</strong></span>}
              </div>
            )}
          </div>
        ) : <p className="text-xs text-slate-600">데이터 없음</p>}
      </Section>

      {/* 예·체능 */}
      {rec.grades.artsPe.length > 0 && (
        <Section title="예·체능 과목" icon={Star}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-slate-600 font-medium pb-1.5 pr-3">학기</th>
                  <th className="text-left text-slate-600 font-medium pb-1.5 pr-3">교과</th>
                  <th className="text-left text-slate-600 font-medium pb-1.5 pr-3">과목</th>
                  <th className="text-right text-slate-600 font-medium pb-1.5 pr-3">학점</th>
                  <th className="text-center text-slate-600 font-medium pb-1.5">성취도</th>
                </tr>
              </thead>
              <tbody>
                {rec.grades.artsPe.map((s, i) => (
                  <tr key={i} className="border-b border-white/3">
                    <td className="py-1.5 pr-3 text-slate-400">{s.year ?? '?'}/{s.semester ?? '?'}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{s.dept ?? '-'}</td>
                    <td className="py-1.5 pr-3 text-slate-200 font-medium">{s.subject ?? '-'}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-400">{s.credit ?? '-'}</td>
                    <td className={clsx('py-1.5 text-center', achievementColor(s.achievement))}>{s.achievement ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 출결 */}
      <Section title="출결 상황" icon={Clock}>
        {rec.attendance.length > 0 ? (
          <div className="space-y-2">
            {rec.attendance.map((a, i) => (
              <div key={i} className="flex items-center gap-4 text-xs">
                <span className="text-slate-400 w-12">{a.grade}학년</span>
                <span className="text-slate-300">수업일수 {a.schoolDays}일</span>
                <span className={clsx(
                  'flex items-center gap-1',
                  a.perfectAttendance ? 'text-emerald-400' : 'text-amber-400'
                )}>
                  {a.perfectAttendance ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {a.perfectAttendance ? '무결석' : `결석 관련 ${a.absenceFigures}건`}
                </span>
                {a.note && <span className="text-slate-600 truncate max-w-xs">{a.note}</span>}
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-slate-600">데이터 없음</p>}
      </Section>

      {/* 창체 */}
      <Section title="창의적 체험활동" icon={Users}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {rec.creative.areas.map((a, i) => (
            <div key={i} className="rounded-xl bg-white/3 p-3 text-center">
              <div className="text-lg font-bold text-violet-400">{a.hours}<span className="text-xs text-slate-500">h</span></div>
              <div className="text-[10px] text-slate-500 mt-0.5">{a.area}</div>
            </div>
          ))}
          <div className="rounded-xl bg-white/3 p-3 text-center">
            <div className="text-lg font-bold text-emerald-400">{m.volunteerHours}<span className="text-xs text-slate-500">h</span></div>
            <div className="text-[10px] text-slate-500 mt-0.5">봉사활동</div>
          </div>
        </div>
        {rec.creative.aspiration && (
          <p className="text-xs text-slate-400">진로희망: <span className="text-slate-200 font-medium">{rec.creative.aspiration}</span></p>
        )}
      </Section>

      {/* 수상경력 */}
      {rec.awards.length > 0 && (
        <Section title="수상경력" icon={Award}>
          <div className="mb-2 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
            ⚠ 2022 개정 교육과정 적용 학생 — 수상경력은 대입 시 학교에서 대학으로 미제출 (참고 목적)
          </div>
          <div className="space-y-1.5">
            {rec.awards.map((a, i) => (
              <div key={i} className="flex items-start gap-3 text-xs">
                <span className="text-slate-600 flex-shrink-0 w-20">{a.date}</span>
                <span className="text-slate-200 font-medium">{a.title}</span>
                {a.org && <span className="text-slate-500">{a.org}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 독서 */}
      {rec.reading.hasReading && rec.reading.books.length > 0 && (
        <Section title="독서활동" icon={BookOpen}>
          <div className="flex flex-wrap gap-2">
            {rec.reading.books.map((b, i) => (
              <span key={i} className="text-xs bg-white/5 text-slate-300 px-2.5 py-1 rounded-lg">{b}</span>
            ))}
          </div>
        </Section>
      )}

      {/* 세특 */}
      {rec.grades.sebak.length > 0 && (
        <Section title="세부능력 및 특기사항" icon={FileText}>
          <div className="space-y-3">
            {rec.grades.sebak.map((s, i) => (
              <div key={i}>
                <p className="text-[10px] font-semibold text-violet-400 mb-1">{s.subject}</p>
                <p className="text-xs text-slate-300 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 행동특성 */}
      {Object.keys(rec.behavior).length > 0 && (
        <Section title="행동특성 및 종합의견" icon={FileText}>
          <div className="space-y-3">
            {Object.entries(rec.behavior).map(([grade, text]) => (
              <div key={grade}>
                <p className="text-[10px] font-semibold text-sky-400 mb-1">{grade}학년</p>
                <p className="text-xs text-slate-300 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function ScoreBar({ label, score, color = 'violet' }: { label: string; score: number; color?: string }) {
  const pct = Math.min(100, (score / 10) * 100)
  const colorMap: Record<string, string> = {
    violet: 'from-violet-500 to-sky-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    sky: 'from-sky-500 to-cyan-500',
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300 font-medium">{label}</span>
        <span className="text-slate-400">{score}/10</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={clsx('h-full rounded-full bg-gradient-to-r', colorMap[color] ?? colorMap.violet)}
        />
      </div>
    </div>
  )
}

function CompetencyContent({ result }: { result: CompetencyResult | null }) {
  if (!result) return null
  const competencies = [
    { key: 'academic',   label: '학업 역량',   color: 'violet', data: result.academic },
    { key: 'major',      label: '전공 적합성', color: 'sky',    data: result.major },
    { key: 'community',  label: '공동체 역량', color: 'emerald', data: result.community },
    { key: 'growth',     label: '발전 가능성', color: 'amber',  data: result.growth },
  ]
  return (
    <div className="grid gap-3">
      {result.gradeSystemNote && (
        <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3 text-xs text-violet-300">
          <Info size={12} className="inline mr-1.5" />{result.gradeSystemNote}
        </div>
      )}

      {/* 종합 등급 */}
      <div className="rounded-xl bg-gradient-to-r from-violet-500/15 to-sky-500/10 border border-white/10 p-4 flex items-center gap-4">
        <div className="text-center flex-shrink-0">
          <div className="text-3xl font-bold text-white">{result.overallScore}<span className="text-lg text-slate-400">/10</span></div>
          <div className="text-[10px] text-slate-500 mt-0.5">종합 점수</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-violet-300 mb-1">{result.universityTier}</div>
          <p className="text-xs text-slate-400 leading-relaxed">{result.overallComment}</p>
        </div>
      </div>

      {/* 4개 역량 */}
      <div className="grid sm:grid-cols-2 gap-3">
        {competencies.map(c => (
          <div key={c.key} className="bg-white/3 border border-white/5 rounded-xl p-3 space-y-2">
            <ScoreBar label={c.label} score={c.data.score} color={c.color} />
            <p className="text-xs text-slate-400 leading-relaxed">{c.data.comment}</p>
            {c.data.strengths.length > 0 && (
              <div className="space-y-0.5">
                {c.data.strengths.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-400">
                    <CheckCircle2 size={10} className="flex-shrink-0 mt-0.5" />{s}
                  </div>
                ))}
              </div>
            )}
            {c.data.improvements.length > 0 && (
              <div className="space-y-0.5">
                {c.data.improvements.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-400">
                    <ChevronRight size={10} className="flex-shrink-0 mt-0.5" />{s}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 강약점 요약 */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Section title="핵심 강점" icon={Star}>
          <div className="space-y-1.5">
            {result.keyStrengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-emerald-300">
                <CheckCircle2 size={12} className="flex-shrink-0 mt-0.5" />{s}
              </div>
            ))}
          </div>
        </Section>
        <Section title="보완 포인트" icon={AlertTriangle}>
          <div className="space-y-1.5">
            {result.criticalWeaknesses.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-300">
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />{s}
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* 추천 전공 */}
      {result.recommendedMajors?.length > 0 && (
        <Section title="추천 전공·대학" icon={GraduationCap}>
          <div className="space-y-2">
            {result.recommendedMajors.map((m, i) => (
              <div key={i} className="flex items-start gap-3 text-xs">
                <span className="text-slate-600 w-4 flex-shrink-0">{i + 1}.</span>
                <div>
                  <span className="text-violet-300 font-medium">{m.major}</span>
                  <span className="text-slate-500 ml-2">{m.university}</span>
                  <p className="text-slate-400 mt-0.5">{m.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function CareerContent({ result }: { result: CareerResult | null }) {
  if (!result) return null
  return (
    <div className="grid gap-3">
      {/* 일관성 점수 */}
      <div className="rounded-xl bg-white/3 border border-white/5 p-4">
        <div className="flex items-center gap-4 mb-3">
          <div className="text-center flex-shrink-0">
            <div className="text-3xl font-bold text-white">{result.consistencyScore}<span className="text-lg text-slate-400">/10</span></div>
            <div className="text-[10px] text-slate-500 mt-0.5">진로 일관성</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-sky-300 mb-1">{result.aspiration}</div>
            <div className="text-xs text-slate-400">일관성 수준: <span className="text-sky-400 font-medium">{result.consistencyLevel}</span></div>
          </div>
        </div>
        <ScoreBar label="진로 일관성" score={result.consistencyScore} color="sky" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Section title="근거 활동" icon={CheckCircle2}>
          <div className="space-y-1.5">
            {result.evidences.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-emerald-300">
                <CheckCircle2 size={11} className="flex-shrink-0 mt-0.5" />{e}
              </div>
            ))}
          </div>
        </Section>
        <Section title="보완이 필요한 부분" icon={AlertTriangle}>
          <div className="space-y-1.5">
            {result.gaps.map((g, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-300">
                <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />{g}
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="제안 사항" icon={TrendingUp}>
        <div className="space-y-1.5">
          {result.suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-sky-300">
              <ChevronRight size={11} className="flex-shrink-0 mt-0.5" />{s}
            </div>
          ))}
        </div>
      </Section>

      <Section title="대입 전략" icon={GraduationCap}>
        <p className="text-xs text-slate-300 leading-relaxed">{result.collegeStrategy}</p>
      </Section>
    </div>
  )
}

function TeacherContent({ result }: { result: TeacherResult | null }) {
  if (!result) return null
  const statusIcon = (s: string) => s === 'pass' ? <CheckCircle2 size={12} className="text-emerald-400" /> : s === 'warning' ? <AlertTriangle size={12} className="text-amber-400" /> : <AlertCircle size={12} className="text-red-400" />
  const severityColor = (s: string) => s === 'error' ? 'text-red-300' : s === 'warning' ? 'text-amber-300' : 'text-sky-300'
  return (
    <div className="grid gap-3">
      <div className="rounded-xl bg-white/3 border border-white/5 p-3">
        <p className="text-xs text-slate-300 leading-relaxed">{result.summary}</p>
      </div>
      {result.sections.map((sec, i) => (
        <div key={i} className="bg-white/3 border border-white/5 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            {statusIcon(sec.status)}
            <span className="text-xs font-medium text-white">{sec.name}</span>
          </div>
          {sec.issues.length > 0 ? (
            <div className="space-y-1.5 mt-2">
              {sec.issues.map((issue, j) => (
                <div key={j} className={clsx('flex items-start gap-2 text-xs', severityColor(issue.severity))}>
                  <span className="flex-shrink-0 text-[10px] font-bold uppercase bg-white/5 px-1 py-0.5 rounded">
                    {issue.severity === 'error' ? '오류' : issue.severity === 'warning' ? '주의' : '정보'}
                  </span>
                  {issue.message}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-500">이상 없음</p>
          )}
        </div>
      ))}
    </div>
  )
}

function StudentContent({ result }: { result: StudentResult | null }) {
  if (!result) return null
  return (
    <div className="grid gap-3">
      {/* 인사말 */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-500/15 to-sky-500/10 border border-white/10 p-5 text-center">
        <Heart size={20} className="text-violet-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-white">{result.greeting}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Section title="나의 강점" icon={Star}>
          <div className="space-y-2">
            {result.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-emerald-300">
                <Star size={11} className="flex-shrink-0 mt-0.5 text-amber-400" />{s}
              </div>
            ))}
          </div>
        </Section>
        <Section title="성장 포인트" icon={TrendingUp}>
          <div className="space-y-2">
            {result.growthAreas.map((g, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-sky-300">
                <TrendingUp size={11} className="flex-shrink-0 mt-0.5" />{g}
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="진로 이야기" icon={GraduationCap}>
        <p className="text-xs text-slate-300 leading-relaxed">{result.careerComment}</p>
      </Section>

      <Section title="앞으로 할 일" icon={CheckCircle2}>
        <div className="space-y-2">
          {result.nextSteps.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500/30 text-violet-300 text-[10px] flex items-center justify-center font-bold">{i+1}</span>
              {s}
            </div>
          ))}
        </div>
      </Section>

      {/* 격려 메시지 */}
      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
        <p className="text-sm text-emerald-300 leading-relaxed font-medium">{result.encouragement}</p>
      </div>
    </div>
  )
}
