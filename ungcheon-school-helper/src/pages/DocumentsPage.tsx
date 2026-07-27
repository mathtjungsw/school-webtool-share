import { useState, useMemo, useRef } from 'react'
import { Search, FileSearch, CheckCircle2, Circle, ChevronDown, ChevronRight, AlertCircle, Upload, FileText, X, FileCode2, PenLine, Loader2, Copy, Check, Wand2, Square } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { generateText } from '../services/llm'
import clsx from 'clsx'

// 학교생활기록부 기재요령 주요 항목 (2025학년도 기준)
const RECORD_GUIDE: { category: string; items: { keyword: string; content: string }[] }[] = [
  {
    category: '인적·학적사항',
    items: [
      { keyword: '성명 변경', content: '성명 변경 시 변경 전 성명을 함께 기재하고, 비고란에 변경 사유와 일자를 기재한다.' },
      { keyword: '주소', content: '입학 당시 주소를 기재하되, 변경된 경우 현재 주소를 병기한다. 개인정보보호로 인해 상세 주소는 최소화한다.' },
      { keyword: '특기사항', content: '졸업 유예, 면제, 정원 외 관리 등 특별한 학적 변동 사항을 기재한다.' },
    ],
  },
  {
    category: '출결상황',
    items: [
      { keyword: '무단결석', content: '보호자 연락 없이 결석한 경우 미인정 결석으로 처리. 질병·기타·미인정으로 구분 기재한다.' },
      { keyword: '인정결석', content: '천재지변, 병가(의사 소견서 첨부), 경조사 등으로 학교장이 인정한 결석. 출결 일수에서 제외하지 않는다.' },
      { keyword: '지각·조퇴', content: '지각·조퇴·결과 각 3회 누적 시 결석 1일로 처리하지 않음. 별도 기재한다.' },
    ],
  },
  {
    category: '수상경력',
    items: [
      { keyword: '기재 기준', content: '학교 내·외 수상 구분 없이 학교생활기록부에 기재 가능. 교내상만 대입에 반영 (2019학년도 이후).' },
      { keyword: '수상명', content: '수상명은 상장에 기재된 명칭 그대로 기재. 임의 축약 금지.' },
      { keyword: '대회 참가', content: '수상하지 못한 대회 참가 사실은 기재 불가.' },
    ],
  },
  {
    category: '자격증 및 인증',
    items: [
      { keyword: '기재 대상', content: '재학 중 취득한 국가기술자격증, 국가전문자격증에 한해 기재. 민간자격증은 기재 불가.' },
      { keyword: '기재 시기', content: '취득 학년도의 학적부에 기재하며, 졸업 후 취득 자격은 기재 불가.' },
    ],
  },
  {
    category: '진로희망사항',
    items: [
      { keyword: '기재 방법', content: '학생의 희망 진로를 기재하되, 직업명이나 직종 중심으로 구체적으로 기재한다.' },
      { keyword: '부모희망', content: '2019학년도부터 부모희망 항목은 삭제됨. 학생 희망만 기재.' },
    ],
  },
  {
    category: '창의적 체험활동',
    items: [
      { keyword: '봉사활동', content: '교내·외 봉사활동 모두 기재 가능. 활동 시간, 장소, 내용을 구체적으로 기재한다.' },
      { keyword: '자율동아리', content: '자율동아리는 학생이 자발적으로 조직하고 운영. 학기 초 학교장 승인 후 기재 가능.' },
      { keyword: '진로활동', content: '진로 체험, 직업인 특강, 진로상담 등 진로와 관련된 활동을 구체적으로 기재.' },
    ],
  },
  {
    category: '교과학습발달상황',
    items: [
      { keyword: '성취평가제', content: '고교 교과목 성취도는 A~E(또는 P/F)로 기재. 원점수, 과목 평균, 표준편차 기재.' },
      { keyword: '세부능력 및 특기사항', content: '교과 담당 교사가 과목별로 학생의 성취기준별 학습 활동 특성을 기재. 500자 이내.' },
      { keyword: '수행평가', content: '수행평가 결과는 정량적으로 처리하여 최종 성취도에 반영하며 별도 서술 불가.' },
    ],
  },
  {
    category: '행동특성 및 종합의견',
    items: [
      { keyword: '기재 원칙', content: '담임교사가 학생을 종합적으로 관찰·평가한 내용을 기재. 500자 이내. 학생 인성, 사회성, 학습 태도 중심.' },
      { keyword: '금지 사항', content: '부정적 서술, 특정 학원·교사 언급, 개인 신상 관련 민감 정보 기재 금지.' },
      { keyword: '용어', content: '\'수상함\', \'○○이\' 등 비표준 표현 사용 금지. 학생 성명 대신 \'이 학생\' 사용 권장.' },
    ],
  },
]

// 공문서 자가진단 체크리스트
const DOC_CHECKLIST: { category: string; items: { id: string; label: string }[] }[] = [
  {
    category: '형식 요건',
    items: [
      { id: 'd1', label: '두문 (수신자, 발신자, 문서번호) 정확히 기재' },
      { id: 'd2', label: '제목이 내용을 명확히 나타내고 있음' },
      { id: 'd3', label: '날짜 형식 준수 (YYYY. M. D.)' },
      { id: 'd4', label: '결재선 및 서명 포함' },
      { id: 'd5', label: '붙임 문서 목록 기재 (있는 경우)' },
    ],
  },
  {
    category: '내용 요건',
    items: [
      { id: 'd6', label: '육하원칙 (누가, 언제, 어디서, 무엇을, 어떻게, 왜) 명확히 서술' },
      { id: 'd7', label: '외래어·약어 남용 없음' },
      { id: 'd8', label: '표준어·맞춤법 준수' },
      { id: 'd9', label: '관련 법령·규정 근거 명시 (필요 시)' },
      { id: 'd10', label: '예산 관련 사항은 근거 첨부' },
    ],
  },
  {
    category: '정보 보호',
    items: [
      { id: 'd11', label: '개인정보(주민등록번호 등) 불필요한 기재 없음' },
      { id: 'd12', label: '비공개 정보는 비공개 표시 처리' },
      { id: 'd13', label: '학생 이름, 사진 포함 시 동의 확인' },
    ],
  },
]

interface PdfDoc {
  id: string
  name: string
  text: string
  size: number
}

function highlightMatch(text: string, query: string, contextLen = 80): string[] {
  if (!query.trim()) return []
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  const results: string[] = []
  let pos = 0
  while (pos < t.length && results.length < 20) {
    const idx = t.indexOf(q, pos)
    if (idx < 0) break
    const start = Math.max(0, idx - contextLen)
    const end = Math.min(text.length, idx + q.length + contextLen)
    results.push(
      (start > 0 ? '...' : '') +
      text.slice(start, idx) +
      '【' + text.slice(idx, idx + q.length) + '】' +
      text.slice(idx + q.length, end) +
      (end < text.length ? '...' : '')
    )
    pos = idx + q.length
  }
  return results
}

const DOC_TYPES = [
  '공문 발신(통보)', '공문 발신(협조 요청)', '공문 발신(알림)', '가정통신문',
  '품의서(예산 집행)', '품의서(행사 개최)', '회의 안건', '보고서', '계획서', '결과 보고서',
]

const DOC_WRITING_PROMPT = `당신은 대한민국 교육청 소속 공문서 작성 전문가입니다. 공문서 기재요령을 완벽히 숙지하고 있습니다.

[공문서 핵심 작성 원칙]
1. 두문: 발신기관 → 수신기관 (수신처) → 제목 순서
2. 본문: 배경/목적 → 내용 → 협조/요청사항 순서
3. 결문: 붙임 목록, 발신자, 날짜
4. 날짜 형식: 2025. 6. 13. (마침표 필수)
5. 문체: 간결하고 명확한 공식체 (합쇼체)
6. 육하원칙 명확히 기술
7. 금지: 감정적 표현, 불필요한 외래어, 비공식 언어

다음 조건에 맞는 완성된 공문서를 작성해주세요.`

export default function DocumentsPage() {
  const { config } = useAppStore()
  const [tab, setTab] = useState<'guide' | 'checklist' | 'pdf' | 'parser' | 'writer'>('guide')

  // Parser state
  const [parsedResult, setParsedResult] = useState<string>('')
  const [parserLoading, setParserLoading] = useState(false)
  const [parserError, setParserError] = useState('')
  const [parsedFileName, setParsedFileName] = useState('')
  const [parserCopied, setParserCopied] = useState(false)

  // Writer state
  const [docType, setDocType] = useState(DOC_TYPES[0])
  const [docContent, setDocContent] = useState('')
  const [docResult, setDocResult] = useState('')
  const [docWriting, setDocWriting] = useState(false)
  const [docError, setDocError] = useState('')
  const [docCopied, setDocCopied] = useState(false)
  const docAbortRef = useRef<AbortController | null>(null)

  const hasApiKey = !!(
    config.aiProvider === 'claude' ? config.claudeApiKey :
    config.aiProvider === 'openai' ? config.openaiApiKey :
    config.geminiApiKey
  )

  const handleParseFile = async () => {
    const filePath = await window.electron?.openFileDialog([
      { name: '공문서 파일', extensions: ['hwp', 'hwpx', 'pdf'] },
      { name: '모든 파일', extensions: ['*'] },
    ])
    if (!filePath) return
    setParserLoading(true)
    setParserError('')
    setParsedResult('')
    const parts = filePath.replace(/\\/g, '/').split('/')
    setParsedFileName(parts[parts.length - 1])
    try {
      const result = await window.electron?.parseDocument(filePath)
      if (!result?.success) throw new Error(result?.warnings?.join(', ') ?? '파싱 실패')
      setParsedResult(result.markdown)
    } catch (e) {
      setParserError((e as Error).message)
    } finally {
      setParserLoading(false)
    }
  }

  const handleCopyParser = async () => {
    await navigator.clipboard.writeText(parsedResult)
    setParserCopied(true)
    setTimeout(() => setParserCopied(false), 2000)
  }

  const handleWriteDoc = async () => {
    if (!docContent.trim()) return
    const ctrl = new AbortController()
    docAbortRef.current = ctrl
    setDocWriting(true)
    setDocError('')
    try {
      const prompt = `문서 종류: ${docType}\n\n주요 내용:\n${docContent}\n\n위 내용을 바탕으로 완성된 공문서를 작성해주세요.`
      const result = await generateText(config, prompt, DOC_WRITING_PROMPT, ctrl.signal)
      setDocResult(result)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setDocError((e as Error).message)
    } finally {
      docAbortRef.current = null
      setDocWriting(false)
    }
  }

  const handleCopyWriter = async () => {
    await navigator.clipboard.writeText(docResult)
    setDocCopied(true)
    setTimeout(() => setDocCopied(false), 2000)
  }
  const [search, setSearch] = useState('')
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(RECORD_GUIDE.map(g => [g.category, true]))
  )

  // PDF 탭 상태
  const [pdfDocs, setPdfDocs] = useState<PdfDoc[]>([])
  const [pdfSearch, setPdfSearch] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setPdfLoading(true); setPdfError('')
    try {
      const results: PdfDoc[] = []
      for (const file of files) {
        // 텍스트 파일만 지원 (PDF는 이진 파일로 브라우저에서 직접 파싱 불가)
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          setPdfError('PDF 파일은 직접 지원하지 않습니다. Acrobat/Chrome에서 "텍스트로 저장(.txt)"하거나 복사-붙여넣기 후 .txt로 저장해 업로드해주세요.')
          continue
        }
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target!.result as string)
          reader.onerror = () => reject(new Error('파일 읽기 실패'))
          reader.readAsText(file, 'utf-8')
        })
        results.push({ id: crypto.randomUUID(), name: file.name, text, size: file.size })
      }
      if (results.length) setPdfDocs(prev => [...prev, ...results])
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setPdfLoading(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  const pdfResults = useMemo(() => {
    if (!pdfSearch.trim() || !pdfDocs.length) return []
    return pdfDocs.flatMap(doc => {
      const snippets = highlightMatch(doc.text, pdfSearch)
      return snippets.length ? [{ doc, snippets }] : []
    })
  }, [pdfSearch, pdfDocs])

  const filteredGuide = useMemo(() => {
    if (!search.trim()) return RECORD_GUIDE
    const q = search.toLowerCase()
    return RECORD_GUIDE.map(g => ({
      ...g,
      items: g.items.filter(i => i.keyword.includes(q) || i.content.includes(q)),
    })).filter(g => g.items.length > 0)
  }, [search])

  const toggleCheck = (id: string) => setChecks(c => ({ ...c, [id]: !c[id] }))
  const toggleCategory = (cat: string) => setOpenCategories(o => ({ ...o, [cat]: !o[cat] }))

  const totalChecks = DOC_CHECKLIST.reduce((s, c) => s + c.items.length, 0)
  const doneChecks  = Object.values(checks).filter(Boolean).length

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title">공문서·학생부 검색</h1>
        <p className="page-subtitle">학생부 기재요령 검색 및 공문서 자가진단 체크리스트를 제공합니다</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-surface-800 p-1 rounded-xl overflow-x-auto">
        {([
          ['guide', '학생부 기재요령'],
          ['checklist', '공문서 자가진단'],
          ['pdf', '텍스트 검색'],
          ['parser', 'HWP/PDF 파서'],
          ['writer', 'AI 공문서 작성'],
        ] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm transition-all whitespace-nowrap',
              tab === v ? 'bg-violet-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            )}>{l}</button>
        ))}
      </div>

      {tab === 'guide' && (
        <>
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="키워드 검색 (예: 봉사활동, 수상명, 무단결석)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            {filteredGuide.map(group => (
              <div key={group.category} className="card">
                <button
                  onClick={() => toggleCategory(group.category)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="font-semibold text-white text-sm">{group.category}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{group.items.length}항목</span>
                    {openCategories[group.category]
                      ? <ChevronDown size={14} className="text-slate-500" />
                      : <ChevronRight size={14} className="text-slate-500" />}
                  </div>
                </button>

                {openCategories[group.category] && (
                  <div className="mt-3 space-y-3">
                    {group.items.map(item => (
                      <div key={item.keyword} className="pl-2 border-l-2 border-violet-500/30">
                        <div className="flex items-center gap-2 mb-1">
                          <FileSearch size={12} className="text-violet-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-violet-300">{item.keyword}</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed pl-4">
                          {item.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {filteredGuide.length === 0 && (
              <div className="card text-center py-12">
                <Search size={32} className="mx-auto mb-3 text-slate-600" />
                <p className="text-slate-500 text-sm">'{search}'에 대한 검색 결과가 없습니다.</p>
              </div>
            )}

            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>2025학년도 학교생활기록부 기재요령 기준 요약본입니다. 정확한 내용은 교육부 공식 기재요령 PDF를 반드시 확인하세요.</span>
            </div>
          </div>
        </>
      )}

      {tab === 'checklist' && (
        <div className="space-y-4">
          {/* 진행률 */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">완료율</span>
              <span className="text-sm font-semibold text-white">{doneChecks}/{totalChecks}</span>
            </div>
            <div className="h-2 bg-surface-900 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-sky-500 transition-all duration-500 rounded-full"
                style={{ width: `${(doneChecks / totalChecks) * 100}%` }} />
            </div>
            {doneChecks === totalChecks && (
              <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                <CheckCircle2 size={12} />모든 항목을 완료했습니다. 공문을 발송해도 됩니다.
              </p>
            )}
          </div>

          {DOC_CHECKLIST.map(group => (
            <div key={group.category} className="card space-y-2">
              <h3 className="font-semibold text-white text-sm pb-2 border-b border-white/5">{group.category}</h3>
              {group.items.map(item => (
                <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                  <button onClick={() => toggleCheck(item.id)}
                    className={clsx('flex-shrink-0 transition-colors',
                      checks[item.id] ? 'text-emerald-400' : 'text-slate-600 group-hover:text-slate-400'
                    )}>
                    {checks[item.id] ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  </button>
                  <span className={clsx('text-sm',
                    checks[item.id] ? 'line-through text-slate-500' : 'text-slate-300'
                  )}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          ))}

          <button onClick={() => setChecks({})} className="btn-secondary w-full text-xs">
            체크리스트 초기화
          </button>
        </div>
      )}

      {tab === 'pdf' && (
        <div className="space-y-4">
          {/* 업로드 */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-white text-sm">PDF 파일 업로드</h3>
            <p className="text-xs text-slate-500">
              학생부·공문서를 텍스트 파일(.txt)로 저장한 뒤 업로드하면 키워드를 빠르게 검색할 수 있습니다.
              PDF는 Acrobat에서 <strong className="text-slate-400">다른 이름으로 저장 → 텍스트</strong>를 사용해 변환하세요.
            </p>
            <input
              ref={pdfInputRef}
              type="file"
              accept=".txt,.md,.csv"
              multiple
              className="hidden"
              onChange={handlePdfUpload}
            />
            <button
              onClick={() => pdfInputRef.current?.click()}
              disabled={pdfLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-300 hover:bg-violet-500/20 transition-all text-sm"
            >
              <Upload size={14} />{pdfLoading ? '처리 중...' : '텍스트 파일 선택 (.txt / .csv)'}
            </button>
            {pdfError && <p className="text-xs text-red-400">{pdfError}</p>}
          </div>

          {/* 업로드된 문서 목록 */}
          {pdfDocs.length > 0 && (
            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white text-sm">{pdfDocs.length}개 파일 로드됨</h3>
                <button onClick={() => setPdfDocs([])} className="btn-ghost text-xs flex items-center gap-1">
                  <X size={11} />전체 제거
                </button>
              </div>
              {pdfDocs.map(doc => (
                <div key={doc.id} className="flex items-center gap-2 text-xs text-slate-400">
                  <FileText size={12} className="text-violet-400 flex-shrink-0" />
                  <span className="flex-1 truncate">{doc.name}</span>
                  <span className="text-slate-600">{(doc.size / 1024).toFixed(0)}KB</span>
                  <button onClick={() => setPdfDocs(d => d.filter(x => x.id !== doc.id))}
                    className="text-red-400 hover:text-red-300 p-0.5"><X size={11} /></button>
                </div>
              ))}
            </div>
          )}

          {/* 검색 */}
          {pdfDocs.length > 0 && (
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input pl-9"
                placeholder="검색어 입력 (예: 봉사활동, 창의적 체험)"
                value={pdfSearch}
                onChange={e => setPdfSearch(e.target.value)}
              />
            </div>
          )}

          {/* 검색 결과 */}
          {pdfSearch.trim() && pdfResults.length === 0 && (
            <div className="card text-center py-8 text-slate-500 text-sm">
              '{pdfSearch}'에 대한 검색 결과가 없습니다.
            </div>
          )}

          {pdfResults.map(({ doc, snippets }) => (
            <div key={doc.id} className="card space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                <FileText size={13} className="text-violet-400" />
                <span className="text-sm font-medium text-white truncate">{doc.name}</span>
                <span className="ml-auto text-xs text-violet-400">{snippets.length}건</span>
              </div>
              {snippets.map((s, i) => (
                <div key={i} className="pl-3 border-l-2 border-violet-500/30 text-xs text-slate-400 leading-relaxed">
                  {s.split(/【|】/).map((part, j) =>
                    j % 2 === 1
                      ? <mark key={j} className="bg-violet-500/30 text-violet-200 rounded px-0.5 not-italic">{part}</mark>
                      : <span key={j}>{part}</span>
                  )}
                </div>
              ))}
            </div>
          ))}

          {pdfDocs.length === 0 && !pdfLoading && (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <Upload size={32} className="mb-3 text-slate-600" />
              <p className="text-sm text-slate-500">PDF나 텍스트 파일을 업로드하면</p>
              <p className="text-xs text-slate-600 mt-1">내용을 추출하여 키워드 검색이 가능합니다</p>
            </div>
          )}

          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
            <span>현재 .txt / .csv / .md 텍스트 파일을 지원합니다. HWP/PDF는 'HWP/PDF 파서' 탭을 이용하세요.</span>
          </div>
        </div>
      )}

      {/* HWP/PDF Parser tab */}
      {tab === 'parser' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
              <FileCode2 size={15} className="text-violet-400" />
              <h3 className="font-semibold text-white">HWP/HWPX/PDF 문서 파서</h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              HWP, HWPX, PDF 파일을 업로드하면 텍스트와 표가 포함된 마크다운으로 변환됩니다.
              변환된 내용을 복사하여 다른 AI 도구나 문서 편집기에서 활용할 수 있습니다.
            </p>
            <button
              onClick={handleParseFile}
              disabled={parserLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            >
              {parserLoading
                ? <><Loader2 size={15} className="animate-spin" /> 파싱 중...</>
                : <><Upload size={15} /> HWP / HWPX / PDF 파일 선택</>
              }
            </button>
          </div>

          {parserError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              <AlertCircle size={14} /> {parserError}
            </div>
          )}

          {parsedResult && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-emerald-400" />
                  <span className="text-sm font-medium text-white">{parsedFileName}</span>
                </div>
                <button
                  onClick={handleCopyParser}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  {parserCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  {parserCopied ? '복사됨!' : '전체 복사'}
                </button>
              </div>
              <pre className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-surface-950 p-4 rounded-xl max-h-96 overflow-y-auto font-mono">
                {parsedResult}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* AI Document Writer tab */}
      {tab === 'writer' && (
        <div className="space-y-4">
          {!hasApiKey && (
            <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-300"><strong>환경설정</strong>에서 AI API 키를 먼저 입력해주세요.</p>
            </div>
          )}

          <div className="card space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <PenLine size={15} className="text-violet-400" />
              <h3 className="font-semibold text-white">AI 공문서 작성</h3>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">문서 종류</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="input w-full"
              >
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">작성할 주요 내용</label>
              <textarea
                className="input w-full h-32 resize-none"
                placeholder="예) 2025학년도 1학기 학부모 공개수업 안내. 일시: 5월 15일 오전 10시, 장소: 각 교실, 대상: 전교생 학부모..."
                value={docContent}
                onChange={e => setDocContent(e.target.value)}
              />
            </div>

            {docWriting ? (
              <button
                onClick={() => docAbortRef.current?.abort()}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 bg-red-600/80 hover:bg-red-600"
              >
                <Square size={15} /> 작성 중단
              </button>
            ) : (
              <button
                onClick={handleWriteDoc}
                disabled={!docContent.trim() || !hasApiKey}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 disabled:opacity-40"
              >
                <Wand2 size={15} /> AI 공문서 작성
              </button>
            )}
          </div>

          {docError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              <AlertCircle size={14} /> {docError}
            </div>
          )}

          {docResult && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-sm font-medium text-white">작성된 공문서</span>
                <button
                  onClick={handleCopyWriter}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  {docCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  {docCopied ? '복사됨!' : '전체 복사'}
                </button>
              </div>
              <textarea
                value={docResult}
                onChange={e => setDocResult(e.target.value)}
                className="input w-full h-72 resize-none font-mono text-xs"
              />
              <p className="text-xs text-slate-500">내용을 직접 수정할 수 있습니다.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
