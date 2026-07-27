import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Brain, Plus, Trash2, Download, Upload,
  Sparkles, Loader2, Copy, Check, ChevronDown, Square,
} from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { useAppStore } from '../stores/appStore'
import {
  generateSpecialRemark,
  getTargetLen,
  type TabCategory,
  type RemarkStudent,
} from '../services/specialRemarks'

const TAB_LIST: { id: TabCategory; label: string; short: string; color: string }[] = [
  { id: '교과세특',              label: '교과세특',           short: '교과',  color: 'violet' },
  { id: '행동특성및종합의견',    label: '행동특성및종합의견', short: '행특',  color: 'sky'    },
  { id: '개인별세부능력특기사항', label: '개인별세특',         short: '개세특',color: 'emerald'},
  { id: '자율활동특기사항',      label: '자율활동',           short: '자율',  color: 'amber'  },
  { id: '동아리특기사항',        label: '동아리',             short: '동아리',color: 'rose'   },
  { id: '봉사활동특기사항',      label: '봉사활동',           short: '봉사',  color: 'orange' },
  { id: '진로활동특기사항',      label: '진로활동',           short: '진로',  color: 'teal'   },
]

interface Subject2022Entry { name: string; type: '공통' | '일반선택' | '진로선택' | '융합선택' }
const TYPE_ORDER: Subject2022Entry['type'][] = ['공통', '일반선택', '진로선택', '융합선택']

const SUBJECTS_2015: Record<string, string[]> = {
  '국어':         ['국어', '문학', '독서', '언어와 매체', '화법과 작문'],
  '수학':         ['수학', '수학Ⅰ', '수학Ⅱ', '미적분', '확률과 통계', '기하'],
  '영어':         ['영어', '영어Ⅰ', '영어Ⅱ', '영어 독해와 작문'],
  '사회':         ['한국사', '통합사회', '한국지리', '세계지리', '생활과 윤리', '윤리와 사상', '정치와 법', '경제', '사회문화', '세계사', '동아시아사'],
  '과학':         ['통합과학', '물리학Ⅰ', '물리학Ⅱ', '화학Ⅰ', '화학Ⅱ', '생명과학Ⅰ', '생명과학Ⅱ', '지구과학Ⅰ', '지구과학Ⅱ'],
  '체육':         ['체육'],
  '예술':         ['음악', '미술'],
  '기술·가정/정보': ['기술·가정', '정보'],
  '교양':         ['진로와 직업'],
}

const SUBJECTS_2022: Record<string, Subject2022Entry[]> = {
  '국어': [
    { name: '공통국어1', type: '공통' }, { name: '공통국어2', type: '공통' },
    { name: '화법과 언어', type: '일반선택' }, { name: '독서와 작문', type: '일반선택' }, { name: '문학', type: '일반선택' },
    { name: '주제 탐구 독서', type: '진로선택' }, { name: '문학과 영상', type: '진로선택' }, { name: '직무 의사소통', type: '진로선택' },
    { name: '독서 토론과 글쓰기', type: '융합선택' }, { name: '매체 의사소통', type: '융합선택' }, { name: '언어생활 탐구', type: '융합선택' },
  ],
  '수학': [
    { name: '공통수학1', type: '공통' }, { name: '공통수학2', type: '공통' }, { name: '기본수학1', type: '공통' }, { name: '기본수학2', type: '공통' },
    { name: '대수', type: '일반선택' }, { name: '미적분Ⅰ', type: '일반선택' }, { name: '확률과 통계', type: '일반선택' },
    { name: '기하', type: '진로선택' }, { name: '미적분Ⅱ', type: '진로선택' }, { name: '경제 수학', type: '진로선택' }, { name: '인공지능 수학', type: '진로선택' }, { name: '직무 수학', type: '진로선택' },
    { name: '수학과 문화', type: '융합선택' }, { name: '실용 통계', type: '융합선택' }, { name: '수학과제 탐구', type: '융합선택' },
  ],
  '영어': [
    { name: '공통영어1', type: '공통' }, { name: '공통영어2', type: '공통' }, { name: '기본영어1', type: '공통' }, { name: '기본영어2', type: '공통' },
    { name: '영어Ⅰ', type: '일반선택' }, { name: '영어Ⅱ', type: '일반선택' }, { name: '영어 독해와 작문', type: '일반선택' },
    { name: '영미 문학 읽기', type: '진로선택' }, { name: '영어 발표와 토론', type: '진로선택' }, { name: '심화 영어', type: '진로선택' }, { name: '심화 영어 독해와 작문', type: '진로선택' }, { name: '직무 영어', type: '진로선택' },
    { name: '실생활 영어 회화', type: '융합선택' }, { name: '미디어 영어', type: '융합선택' }, { name: '세계 문화와 영어', type: '융합선택' },
  ],
  '사회': [
    { name: '한국사1', type: '공통' }, { name: '한국사2', type: '공통' }, { name: '통합사회1', type: '공통' }, { name: '통합사회2', type: '공통' },
    { name: '세계시민과 지리', type: '일반선택' }, { name: '세계사', type: '일반선택' }, { name: '사회와 문화', type: '일반선택' }, { name: '현대사회와 윤리', type: '일반선택' },
    { name: '한국지리 탐구', type: '진로선택' }, { name: '도시의 미래 탐구', type: '진로선택' }, { name: '동아시아 역사 기행', type: '진로선택' }, { name: '정치', type: '진로선택' }, { name: '법과 사회', type: '진로선택' }, { name: '경제', type: '진로선택' }, { name: '윤리와 사상', type: '진로선택' }, { name: '인문학과 윤리', type: '진로선택' }, { name: '국제 관계의 이해', type: '진로선택' },
    { name: '여행지리', type: '융합선택' }, { name: '역사로 탐구하는 현대 세계', type: '융합선택' }, { name: '사회문제 탐구', type: '융합선택' }, { name: '금융과 경제생활', type: '융합선택' }, { name: '윤리문제 탐구', type: '융합선택' }, { name: '기후변화와 지속가능한 세계', type: '융합선택' },
  ],
  '과학': [
    { name: '통합과학1', type: '공통' }, { name: '통합과학2', type: '공통' }, { name: '과학탐구실험1', type: '공통' }, { name: '과학탐구실험2', type: '공통' },
    { name: '물리학', type: '일반선택' }, { name: '화학', type: '일반선택' }, { name: '생명과학', type: '일반선택' }, { name: '지구과학', type: '일반선택' },
    { name: '역학과 에너지', type: '진로선택' }, { name: '전자기와 양자', type: '진로선택' }, { name: '물질과 에너지', type: '진로선택' }, { name: '화학 반응의 세계', type: '진로선택' }, { name: '세포와 물질대사', type: '진로선택' }, { name: '생물의 유전', type: '진로선택' }, { name: '지구시스템과학', type: '진로선택' }, { name: '행성우주과학', type: '진로선택' },
    { name: '과학의 역사와 문화', type: '융합선택' }, { name: '기후변화와 환경생태', type: '융합선택' }, { name: '융합과학 탐구', type: '융합선택' },
  ],
  '체육': [
    { name: '체육1', type: '일반선택' }, { name: '체육2', type: '일반선택' },
    { name: '운동과 건강', type: '진로선택' }, { name: '스포츠 문화', type: '진로선택' }, { name: '스포츠 과학', type: '진로선택' },
    { name: '스포츠 생활1', type: '융합선택' },
  ],
  '예술': [
    { name: '음악', type: '일반선택' }, { name: '미술', type: '일반선택' }, { name: '연극', type: '일반선택' },
    { name: '음악 연주와 창작', type: '진로선택' }, { name: '음악 감상과 비평', type: '진로선택' }, { name: '미술 창작', type: '진로선택' }, { name: '미술 감상과 비평', type: '진로선택' },
    { name: '음악과 미디어', type: '융합선택' }, { name: '미술과 매체', type: '융합선택' },
  ],
  '기술·가정/정보': [
    { name: '기술·가정', type: '일반선택' }, { name: '정보', type: '일반선택' },
    { name: '로봇과 공학세계', type: '진로선택' }, { name: '생활과학 탐구', type: '진로선택' }, { name: '인공지능 기초', type: '진로선택' }, { name: '데이터 과학', type: '진로선택' },
    { name: '창의 공학 설계', type: '융합선택' }, { name: '지식 재산 일반', type: '융합선택' }, { name: '생애 설계와 자립', type: '융합선택' }, { name: '아동발달과 부모', type: '융합선택' }, { name: '소프트웨어와 생활', type: '융합선택' },
  ],
  '제2외국어/한문': [
    { name: '독일어', type: '일반선택' }, { name: '프랑스어', type: '일반선택' }, { name: '스페인어', type: '일반선택' }, { name: '중국어', type: '일반선택' }, { name: '일본어', type: '일반선택' }, { name: '러시아어', type: '일반선택' }, { name: '아랍어', type: '일반선택' }, { name: '베트남어', type: '일반선택' },
    { name: '독일어 회화', type: '진로선택' }, { name: '프랑스어 회화', type: '진로선택' }, { name: '스페인어 회화', type: '진로선택' }, { name: '중국어 회화', type: '진로선택' }, { name: '일본어 회화', type: '진로선택' }, { name: '러시아어 회화', type: '진로선택' }, { name: '아랍어 회화', type: '진로선택' }, { name: '베트남어 회화', type: '진로선택' },
    { name: '심화 독일어', type: '진로선택' }, { name: '심화 프랑스어', type: '진로선택' }, { name: '심화 스페인어', type: '진로선택' }, { name: '심화 중국어', type: '진로선택' }, { name: '심화 일본어', type: '진로선택' }, { name: '심화 러시아어', type: '진로선택' }, { name: '심화 아랍어', type: '진로선택' }, { name: '심화 베트남어', type: '진로선택' },
    { name: '독일어권 문화', type: '융합선택' }, { name: '프랑스어권 문화', type: '융합선택' }, { name: '스페인어권 문화', type: '융합선택' }, { name: '중국 문화', type: '융합선택' }, { name: '일본 문화', type: '융합선택' }, { name: '러시아 문화', type: '융합선택' }, { name: '아랍 문화', type: '융합선택' }, { name: '베트남 문화', type: '융합선택' },
    { name: '한문 고전 읽기', type: '진로선택' }, { name: '언어생활과 한자', type: '융합선택' },
  ],
  '교양': [
    { name: '진로와 직업', type: '일반선택' }, { name: '생태와 환경', type: '일반선택' },
    { name: '인간과 철학', type: '진로선택' }, { name: '논리와 사고', type: '진로선택' }, { name: '인간과 심리', type: '진로선택' }, { name: '교육의 이해', type: '진로선택' }, { name: '삶과 종교', type: '진로선택' }, { name: '보건', type: '진로선택' },
    { name: '인간과 경제활동', type: '융합선택' }, { name: '논술', type: '융합선택' },
  ],
}

function makeId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

function storageKey(tab: TabCategory, subject: string) {
  return `special_remarks:${tab}:${subject}`
}

export default function SpecialRemarksMasterPage() {
  const config = useAppStore(s => s.config)
  const [activeTab, setActiveTab] = useState<TabCategory>('교과세특')
  const [grade, setGrade] = useState<'g12' | 'g3'>('g12')
  const [setukLen, setSetukLen] = useState<250 | 500>(250)   // 교과세특 전용 분량(두 버전)
  const [curriculum, setCurriculum] = useState<'2015' | '2022'>('2015')
  const [subjectGroup, setSubjectGroup] = useState('국어')
  const [subject, setSubject] = useState('국어')
  const [students, setStudents] = useState<RemarkStudent[]>([])
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())
  const [generatingAll, setGeneratingAll] = useState(false)
  const [toast, setToast] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortMap = useRef<Map<string, AbortController>>(new Map())
  const stopAllRef = useRef(false)
  const batchAbortRef = useRef<AbortController | null>(null)

  // 교과세특은 사용자가 고른 분량(250/500), 그 외 탭은 학년별 기준 분량
  const targetLen = activeTab === '교과세특' ? setukLen : getTargetLen(activeTab, grade)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const key = storageKey(activeTab, activeTab === '교과세특' ? subject : '')

  useEffect(() => {
    window.electron?.configGet(key).then(v => {
      if (Array.isArray(v)) setStudents(v as RemarkStudent[])
      else setStudents([])
    }).catch(() => setStudents([]))
  }, [key])

  // 교과세특 분량 선호값 불러오기 (화면 재진입 시 유지)
  useEffect(() => {
    window.electron?.configGet('special_remarks:setukLen').then(v => {
      if (v === 250 || v === 500) setSetukLen(v as 250 | 500)
    }).catch(() => {})
  }, [])

  const save = useCallback((next: RemarkStudent[]) => {
    window.electron?.configSet(key, next)
    setStudents(next)
  }, [key])

  const handleCurriculumChange = (c: '2015' | '2022') => {
    setCurriculum(c)
    const firstGroup = c === '2015' ? Object.keys(SUBJECTS_2015)[0] : Object.keys(SUBJECTS_2022)[0]
    setSubjectGroup(firstGroup)
    const firstSubject = c === '2015'
      ? (SUBJECTS_2015[firstGroup]?.[0] ?? '')
      : (SUBJECTS_2022[firstGroup]?.[0]?.name ?? '')
    setSubject(firstSubject)
  }

  const handleGroupChange = (group: string) => {
    setSubjectGroup(group)
    const firstSubject = curriculum === '2015'
      ? (SUBJECTS_2015[group]?.[0] ?? '')
      : (SUBJECTS_2022[group]?.[0]?.name ?? '')
    setSubject(firstSubject)
  }

  const addStudent = () => {
    save([...students, { id: makeId(), studentId: '', name: '', activity: '', generatedRemark: '' }])
  }

  const removeStudent = (id: string) => {
    save(students.filter(s => s.id !== id))
  }

  const updateStudent = (id: string, field: keyof RemarkStudent, value: string) => {
    save(students.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const generateOne = async (student: RemarkStudent) => {
    if (!student.activity.trim()) { showToast('활동 내용을 입력하세요.'); return }
    if (!config.geminiApiKey && !config.claudeApiKey && !config.openaiApiKey) {
      showToast('환경설정에서 AI API 키를 먼저 입력해주세요.'); return
    }
    const ctrl = new AbortController()
    abortMap.current.set(student.id, ctrl)
    setGeneratingIds(prev => new Set(prev).add(student.id))
    try {
      const remark = await generateSpecialRemark(
        config, student.activity, activeTab, targetLen,
        activeTab === '교과세특' ? subject : undefined,
        ctrl.signal,
      )
      save(students.map(s => s.id === student.id ? { ...s, generatedRemark: remark } : s))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') showToast((e as Error).message)
    } finally {
      abortMap.current.delete(student.id)
      setGeneratingIds(prev => { const n = new Set(prev); n.delete(student.id); return n })
    }
  }

  const generateAll = async () => {
    const targets = students.filter(s => s.activity.trim())
    if (targets.length === 0) { showToast('활동 내용이 입력된 학생이 없습니다.'); return }
    if (!config.geminiApiKey && !config.claudeApiKey && !config.openaiApiKey) {
      showToast('환경설정에서 AI API 키를 먼저 입력해주세요.'); return
    }
    stopAllRef.current = false
    setGeneratingAll(true)
    let current = [...students]
    let stopped = false
    for (const student of targets) {
      if (stopAllRef.current) { stopped = true; break }
      const ctrl = new AbortController()
      batchAbortRef.current = ctrl
      abortMap.current.set(student.id, ctrl)
      setGeneratingIds(prev => new Set(prev).add(student.id))
      try {
        const remark = await generateSpecialRemark(
          config, student.activity, activeTab, targetLen,
          activeTab === '교과세특' ? subject : undefined,
          ctrl.signal,
        )
        current = current.map(s => s.id === student.id ? { ...s, generatedRemark: remark } : s)
        save(current)
      } catch (e) {
        // 전체 중단 버튼 또는 개별 행 중단 버튼 모두 AbortError로 들어옴
        if ((e as Error).name === 'AbortError') { stopped = true; break }
        showToast(`${student.name || '학생'} 생성 실패: ${(e as Error).message}`)
      } finally {
        abortMap.current.delete(student.id)
        batchAbortRef.current = null
        setGeneratingIds(prev => { const n = new Set(prev); n.delete(student.id); return n })
      }
    }
    stopAllRef.current = false
    setGeneratingAll(false)
    if (!stopped) showToast('전체 생성 완료!')
  }

  const stopAll = () => {
    stopAllRef.current = true
    batchAbortRef.current?.abort()
  }

  const copyRemark = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const downloadTemplate = () => {
    const rows = [{ 학번: '', 이름: '', 활동내용: '', 특기사항: '' }]
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 50 }, { wch: 60 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '특기사항')
    XLSX.writeFile(wb, '특기사항_양식.xlsx')
    showToast('양식 다운로드 완료!')
  }

  const exportExcel = () => {
    if (students.length === 0) { showToast('내보낼 데이터가 없습니다.'); return }
    const rows = students.map((s, i) => ({
      번호: i + 1,
      학번: s.studentId,
      이름: s.name,
      활동내용: s.activity,
      특기사항: s.generatedRemark,
      글자수: s.generatedRemark.length,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 8 }, { wch: 40 }, { wch: 60 }, { wch: 6 }]
    const wb = XLSX.utils.book_new()
    const tabLabel = TAB_LIST.find(t => t.id === activeTab)?.short ?? activeTab
    XLSX.utils.book_append_sheet(wb, ws, tabLabel)
    const subjectPart = activeTab === '교과세특' ? `_${subject}` : ''
    XLSX.writeFile(wb, `특기사항_${tabLabel}${subjectPart}_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.xlsx`)
    showToast('Excel 내보내기 완료!')
  }

  const importExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target?.result as ArrayBuffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
        const imported: RemarkStudent[] = rows.map(row => ({
          id: makeId(),
          studentId: String(row['학번'] ?? row['번호'] ?? ''),
          name: String(row['이름'] ?? row['성명'] ?? ''),
          activity: String(row['활동내용'] ?? row['활동'] ?? ''),
          generatedRemark: String(row['특기사항'] ?? ''),
        })).filter(s => s.name)
        if (imported.length === 0) { showToast('가져올 데이터를 찾을 수 없습니다. 열: 이름, 활동내용'); return }
        save([...students, ...imported])
        showToast(`${imported.length}명 가져오기 완료!`)
      } catch {
        showToast('파일 파싱 실패. Excel 형식(.xlsx)인지 확인해주세요.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const currentGroups = curriculum === '2015' ? Object.keys(SUBJECTS_2015) : Object.keys(SUBJECTS_2022)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 pt-5 pb-4 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Brain size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">학생부 작성</h1>
            <p className="text-xs text-slate-500 mt-0.5">AI가 학생 활동 내용을 생기부 특기사항으로 변환합니다</p>
          </div>
        </div>
      </div>

      {/* 탭 바 */}
      <div className="px-6 pt-3 flex-shrink-0 border-b border-white/5">
        <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0">
          {TAB_LIST.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-3 py-1.5 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-all border-b-2',
                activeTab === tab.id
                  ? 'text-white border-violet-400 bg-white/5'
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/3'
              )}
            >
              {tab.id === '진로활동특기사항'
                ? `진로활동(${grade === 'g12' ? '500' : '700'}자)`
                : tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 학년 선택 (교과세특은 분량 토글로 길이를 정하므로 숨김) */}
      {activeTab !== '교과세특' && (
      <div className="px-6 py-2 flex-shrink-0 border-b border-white/5 bg-surface-900/30">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">학년</span>
          {(['g12', 'g3'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGrade(g)}
              className={clsx(
                'px-3 py-1 text-xs font-medium rounded-lg transition-colors',
                grade === g
                  ? 'bg-violet-600 text-white'
                  : 'bg-white/5 text-slate-400 hover:text-slate-300 hover:bg-white/10'
              )}
            >
              {g === 'g12' ? '고1·고2' : '고3'}
            </button>
          ))}
          <span className="text-[10px] text-slate-600">
            {grade === 'g12'
              ? '(2022 개정 적용 — 행특 300자, 진로 500자)'
              : '(2015 개정 기준 — 행특 500자, 진로 700자)'}
          </span>
        </div>
      </div>
      )}

      {/* 과목 선택 (교과세특만) */}
      {activeTab === '교과세특' && (
        <div className="px-6 py-3 flex-shrink-0 bg-surface-900/50 border-b border-white/5 space-y-2">
          {/* 분량 선택 (교과세특 전용 — 250자 / 500자 두 버전) */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">분량</span>
            {([250, 500] as const).map(len => (
              <button
                key={len}
                onClick={() => { setSetukLen(len); window.electron?.configSet('special_remarks:setukLen', len) }}
                className={clsx(
                  'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
                  setukLen === len
                    ? 'bg-violet-600 text-white'
                    : 'bg-white/5 text-slate-400 hover:text-slate-300 hover:bg-white/10'
                )}
              >
                {len}자
              </button>
            ))}
            <span className="text-[10px] text-slate-600">간결본 250자 · 상세본 500자(5단계 충분히)</span>
          </div>

          {/* 교육과정 토글 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">교육과정</span>
            {(['2015', '2022'] as const).map(c => (
              <button
                key={c}
                onClick={() => handleCurriculumChange(c)}
                className={clsx(
                  'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
                  curriculum === c
                    ? 'bg-sky-600 text-white'
                    : 'bg-white/5 text-slate-400 hover:text-slate-300 hover:bg-white/10'
                )}
              >
                {c} 개정
              </button>
            ))}
          </div>

          {/* 교과군 pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap flex-shrink-0">교과군</span>
            {currentGroups.map(g => (
              <button
                key={g}
                onClick={() => handleGroupChange(g)}
                className={clsx(
                  'px-2 py-0.5 text-xs rounded-md whitespace-nowrap transition-colors flex-shrink-0',
                  subjectGroup === g
                    ? 'bg-violet-600 text-white'
                    : 'bg-white/5 text-slate-400 hover:text-slate-300 hover:bg-white/10'
                )}
              >
                {g}
              </button>
            ))}
          </div>

          {/* 과목 드롭다운 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">과목</span>
            <div className="relative">
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="appearance-none bg-surface-800 border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {curriculum === '2015'
                  ? (SUBJECTS_2015[subjectGroup] ?? []).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))
                  : TYPE_ORDER.map(type => {
                      const items = (SUBJECTS_2022[subjectGroup] ?? []).filter(e => e.type === type)
                      if (items.length === 0) return null
                      return (
                        <optgroup key={type} label={type}>
                          {items.map(e => (
                            <option key={e.name} value={e.name}>{e.name}</option>
                          ))}
                        </optgroup>
                      )
                    })
                }
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <span className="text-xs text-slate-600">* 과목마다 별도 저장됩니다</span>
          </div>
        </div>
      )}

      {/* 툴바 */}
      <div className="px-6 py-3 flex-shrink-0 flex items-center gap-2 flex-wrap border-b border-white/5">
        <button
          onClick={addStudent}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus size={13} /> 학생 추가
        </button>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
          title="Excel 양식 다운로드 후 채워서 가져오기"
        >
          <Download size={13} /> Excel 양식
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
        >
          <Upload size={13} /> Excel 가져오기
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={importExcel} className="hidden" />
        <button
          onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
        >
          <Download size={13} /> Excel 내보내기
        </button>
        {generatingAll ? (
          <button
            onClick={stopAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-all ml-auto"
          >
            <Square size={13} /> 전체 중단
          </button>
        ) : (
          <button
            onClick={generateAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 text-white text-xs font-medium rounded-lg transition-all ml-auto"
          >
            <Sparkles size={13} /> 전체 생성
          </button>
        )}
      </div>

      {/* 학생 테이블 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-600 space-y-2">
            <Brain size={32} className="opacity-30" />
            <p className="text-sm">학생을 추가하거나 Excel 파일을 가져오세요</p>
            <p className="text-xs">필수 열: 이름, 활동내용 (Excel 가져오기)</p>
          </div>
        ) : (
          students.map((student, idx) => (
            <StudentRow
              key={student.id}
              index={idx}
              student={student}
              isGenerating={generatingIds.has(student.id)}
              isCopied={copiedId === student.id}
              targetLen={targetLen}
              onUpdate={updateStudent}
              onGenerate={generateOne}
              onStop={id => abortMap.current.get(id)?.abort()}
              onCopy={copyRemark}
              onRemove={removeStudent}
            />
          ))
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-700 text-white text-sm px-4 py-2 rounded-xl shadow-xl border border-white/10 z-50"
        >
          {toast}
        </motion.div>
      )}
    </div>
  )
}

interface StudentRowProps {
  index: number
  student: RemarkStudent
  isGenerating: boolean
  isCopied: boolean
  targetLen: number
  onUpdate: (id: string, field: keyof RemarkStudent, value: string) => void
  onGenerate: (student: RemarkStudent) => void
  onStop: (id: string) => void
  onCopy: (id: string, text: string) => void
  onRemove: (id: string) => void
}

function StudentRow({ index, student, isGenerating, isCopied, targetLen, onUpdate, onGenerate, onStop, onCopy, onRemove }: StudentRowProps) {
  const remarkLen = student.generatedRemark.length
  const lenColor = remarkLen === 0
    ? 'text-slate-600'
    : remarkLen < targetLen * 0.85
    ? 'text-amber-400'
    : remarkLen > targetLen * 1.05
    ? 'text-rose-400'
    : 'text-emerald-400'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-800/60 rounded-xl border border-white/5 p-4 space-y-3"
    >
      {/* 상단: 번호, 학번, 이름, 삭제 */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-slate-500 w-6 text-center">{index + 1}</span>
        <input
          value={student.studentId}
          onChange={e => onUpdate(student.id, 'studentId', e.target.value)}
          placeholder="학번"
          className="w-20 bg-surface-700 border border-white/10 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <input
          value={student.name}
          onChange={e => onUpdate(student.id, 'name', e.target.value)}
          placeholder="이름 *"
          className="w-28 bg-surface-700 border border-white/10 text-white text-sm font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button
          onClick={() => onRemove(student.id)}
          className="ml-auto text-slate-600 hover:text-rose-400 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 본문: 활동내용 | 특기사항 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-slate-500 font-medium mb-1 block">활동 내용</label>
          <textarea
            value={student.activity}
            onChange={e => onUpdate(student.id, 'activity', e.target.value)}
            placeholder="학생이 수행한 활동, 역할, 성과 등을 자유롭게 입력하세요"
            rows={5}
            className="w-full bg-surface-700 border border-white/10 text-white text-xs rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-slate-600"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-slate-500 font-medium">AI 생성 특기사항</label>
            <span className={clsx('text-[10px] font-mono', lenColor)}>
              {remarkLen}자 / 목표 {targetLen}자
            </span>
          </div>
          <textarea
            value={student.generatedRemark}
            onChange={e => onUpdate(student.id, 'generatedRemark', e.target.value)}
            placeholder="AI 생성 버튼을 누르면 특기사항이 여기에 표시됩니다"
            rows={5}
            className="w-full bg-surface-700 border border-white/10 text-white text-xs rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="flex items-center gap-2 justify-end">
        {student.generatedRemark && (
          <button
            onClick={() => onCopy(student.id, student.generatedRemark)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors"
          >
            {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {isCopied ? '복사됨' : '복사'}
          </button>
        )}
        {isGenerating ? (
          <button
            onClick={() => onStop(student.id)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-red-600/80 hover:bg-red-600 rounded-lg transition-colors"
          >
            <Square size={12} /> 중단
          </button>
        ) : (
          <button
            onClick={() => onGenerate(student)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
          >
            <Sparkles size={12} /> AI 생성
          </button>
        )}
      </div>
    </motion.div>
  )
}
