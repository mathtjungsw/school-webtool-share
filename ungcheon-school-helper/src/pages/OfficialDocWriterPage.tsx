import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Sparkles, Loader2, Copy, Check, Printer,
  RotateCcw, ChevronDown, ChevronUp, Info, Square,
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../stores/appStore'
import { generateText } from '../services/llm'

// ─────────────────────────────────────────────
// 타입 / 상수
// ─────────────────────────────────────────────

type DocType = '일반공문' | '안내문' | '협조요청' | '계획서' | '결과보고'
type KeyTag = '[제출]' | '[협조]' | '[설문]' | '[출장]' | '[연수]' | '[공모]' | ''

const DOC_TYPES: DocType[] = ['일반공문', '안내문', '협조요청', '계획서', '결과보고']
const KEY_TAGS: { value: KeyTag; label: string; color: string }[] = [
  { value: '',      label: '없음',    color: 'slate' },
  { value: '[제출]', label: '[제출]', color: 'blue'   },
  { value: '[협조]', label: '[협조]', color: 'emerald'},
  { value: '[설문]', label: '[설문]', color: 'amber'  },
  { value: '[출장]', label: '[출장]', color: 'orange' },
  { value: '[연수]', label: '[연수]', color: 'teal'   },
  { value: '[공모]', label: '[공모]', color: 'rose'   },
]

const SYSTEM_PROMPT = `당신은 경기도교육청 소속 학교의 공문서 작성 전문가입니다.
'행정업무의 운영 및 혁신에 관한 규정'(교육부령)에 따라 정확한 공문서를 작성합니다.

## 공문서 작성 핵심 규칙

### 날짜·시간·금액 표기
- 날짜: 2025. 6. 18.(요일) 형식 (온점·공백 준수)
- 시간: 오전/오후 14:00 (24시간제, '시' 대신 ':')
- 금액: 금 1,234,000원 (아라비아 숫자, 3자리 쉼표)
- 기간: 2025. 3. 1.~2025. 2. 28.

### 항목 표시 순서 (계층)
1. → 가. → 1) → 가) → (1) → (가) → ①
- 항목이 하나뿐이면 항목 표시 생략
- 항목 기호와 내용 사이 1칸 공백

### 쌍점(:) 사용
- 항목 구분: 쌍점 뒤 1칸 공백
- 예) 일시: 2025. 3. 1.(토) 오전 10:00

### 문장 부호
- 쉼표: 나열 시 마지막 쉼표 생략 (A, B, C 형식)
- 괄호: 앞말에 붙여 씀 예) 연수(2시간)
- 등(等): 동등한 것 나열 후 '등' 사용 가능

### 붙임 표시
- 본문 내용 끝에 반드시 '  끝.' (2칸 들여쓰기)
- 붙임 있을 때: 끝. 앞에 붙임 목록 기재
  예) 붙임  1. ○○계획서 1부.  끝.

### 공문 핵심용어표시제
- 제목 앞에 [제출][협조][설문][출장][연수][공모] 중 해당 표시

### 문체 원칙
- 첫 문장: 2행 이내로 짧게 (공문 목적 명시)
- 주어 생략 가능, 명사화 문장
- '-함', '-바람', '-요망' 등 간결한 종결 표현
- 두음법칙, 맞춤법, 띄어쓰기 준수

## 공문서 형식

아래 형식을 반드시 따르세요:

수신: (수신처)
(경유)
제목: [태그] 공문 제목

1. (목적/배경 서술)

2. (세부 내용)
  가. ...
  나. ...

붙임  1. ○○ 1부.(있는 경우)  끝.

---
참고: 수신처가 여러 곳이면 "수신자 참조"로 표기, 본문 끝에 수신자 목록 기재`

// ─────────────────────────────────────────────
// 공문서 작성 프롬프트 생성
// ─────────────────────────────────────────────

function buildPrompt(
  schoolName: string,
  docType: DocType,
  tag: KeyTag,
  title: string,
  receiver: string,
  mainContent: string,
  attachments: string,
  date: string,
): string {
  return `다음 정보를 바탕으로 공문서를 작성해주세요.

**학교명:** ${schoolName}
**문서 유형:** ${docType}
**핵심태그:** ${tag || '없음'}
**제목:** ${tag ? `${tag} ${title}` : title}
**수신처:** ${receiver || '교장'}
**발신일:** ${date}
**주요 내용 (요점):**
${mainContent}
${attachments ? `**붙임 파일:**\n${attachments}` : ''}

위 정보를 바탕으로 행정업무 규정에 맞는 공식 공문서를 작성해주세요.
- 발신: ${schoolName} 장 (직인)
- 날짜 형식: 2025. 6. 18.
- 항목 표시: 1. → 가. → 1) 순
- 끝 표시 포함
- 형식: 수신, 제목, 본문(1. 2. 가. 나. ...), 붙임, 끝. 순으로 작성
- Markdown 없이 순수 텍스트만 출력`
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

export default function OfficialDocWriterPage() {
  const config = useAppStore(s => s.config)

  const today = new Date()
  const dateStr = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}.`

  const [docType, setDocType] = useState<DocType>('일반공문')
  const [tag, setTag] = useState<KeyTag>('')
  const [title, setTitle] = useState('')
  const [receiver, setReceiver] = useState('')
  const [mainContent, setMainContent] = useState('')
  const [attachments, setAttachments] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState('')
  const [showRules, setShowRules] = useState(false)
  const resultRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const generate = async () => {
    if (!config.geminiApiKey && !config.claudeApiKey && !config.openaiApiKey) {
      showToast('환경설정에서 AI API 키를 먼저 입력해주세요.'); return
    }
    if (!title.trim()) { showToast('공문 제목을 입력해주세요.'); return }
    if (!mainContent.trim()) { showToast('주요 내용을 입력해주세요.'); return }

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setResult('')
    try {
      const prompt = buildPrompt(
        config.schoolName ?? '○○학교',
        docType, tag, title, receiver, mainContent, attachments, dateStr,
      )
      const text = await generateText(config, prompt, SYSTEM_PROMPT, ctrl.signal)
      setResult(text)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') showToast((e as Error).message)
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }

  const copyResult = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('클립보드에 복사했습니다.')
  }

  const print = () => {
    if (!result) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>공문서</title>
<style>
  body { font-family: '맑은 고딕', sans-serif; font-size: 12pt; line-height: 1.8; margin: 40px 50px; color: #000; }
  pre { white-space: pre-wrap; font-family: inherit; font-size: 12pt; }
  @page { margin: 25mm; }
</style></head><body><pre>${result.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`)
    w.document.close()
    w.print()
  }

  const reset = () => {
    setTitle(''); setReceiver(''); setMainContent(''); setAttachments('')
    setTag(''); setDocType('일반공문'); setResult('')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 pt-5 pb-4 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <FileText size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">공문서 작성 AI</h1>
            <p className="text-xs text-slate-500 mt-0.5">행정업무규정 기반 공문서 초안 자동 생성</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowRules(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-400 text-xs rounded-lg transition-colors"
            >
              <Info size={12} />
              작성 규칙
              {showRules ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-400 text-xs rounded-lg transition-colors"
            >
              <RotateCcw size={12} /> 초기화
            </button>
          </div>
        </div>
      </div>

      {/* 작성 규칙 패널 */}
      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-white/5"
          >
            <div className="px-6 py-3 bg-surface-800/50">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                {[
                  { title: '날짜 표기', items: ['2025. 6. 18.(수)', '온점·공백 필수'] },
                  { title: '항목 표시', items: ['1. → 가. → 1) → 가)', '(1) → (가) → ①'] },
                  { title: '금액 표기', items: ['금 1,234,000원', '아라비아숫자+원'] },
                  { title: '끝 표시', items: ['본문 끝에 "  끝."', '붙임 있으면 붙임 후'] },
                ].map(s => (
                  <div key={s.title} className="bg-surface-700/50 rounded-lg px-3 py-2">
                    <div className="font-semibold text-sky-400 mb-1">{s.title}</div>
                    {s.items.map((it, i) => <div key={i} className="text-slate-400">{it}</div>)}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-[10px] text-slate-500">핵심용어표시제:</span>
                {KEY_TAGS.filter(t => t.value).map(t => (
                  <span key={t.value} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-slate-300">{t.value}</span>
                ))}
                <span className="text-[10px] text-slate-600 ml-1">— 제목 앞에 표시</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 본문 — 좌우 분할 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 좌: 입력 폼 */}
        <div className="w-96 flex-shrink-0 border-r border-white/5 overflow-y-auto p-4 space-y-3">
          {/* 문서 유형 */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">문서 유형</label>
            <div className="flex flex-wrap gap-1.5">
              {DOC_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setDocType(t)}
                  className={clsx(
                    'px-2.5 py-1 text-xs rounded-lg transition-all',
                    docType === t
                      ? 'bg-sky-600 text-white font-medium'
                      : 'bg-surface-700 text-slate-400 hover:text-slate-200',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 핵심 태그 */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">핵심용어 태그</label>
            <div className="flex flex-wrap gap-1.5">
              {KEY_TAGS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTag(t.value)}
                  className={clsx(
                    'px-2.5 py-1 text-xs rounded-lg transition-all',
                    tag === t.value
                      ? 'bg-emerald-600 text-white font-medium'
                      : 'bg-surface-700 text-slate-400 hover:text-slate-200',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 수신처 */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">수신처</label>
            <input
              value={receiver}
              onChange={e => setReceiver(e.target.value)}
              placeholder="예) 경기도남원교육지원청 교육장"
              className="w-full bg-surface-800 border border-white/10 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-slate-600"
            />
          </div>

          {/* 제목 */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">공문 제목 <span className="text-rose-400">*</span></label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="예) 2025학년도 교원 연수 계획 제출"
              className="w-full bg-surface-800 border border-white/10 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-slate-600"
            />
            {tag && title && (
              <p className="text-[10px] text-sky-400">실제 제목: {tag} {title}</p>
            )}
          </div>

          {/* 주요 내용 */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">주요 내용 요점 <span className="text-rose-400">*</span></label>
            <textarea
              value={mainContent}
              onChange={e => setMainContent(e.target.value)}
              rows={8}
              placeholder={`자유롭게 요점을 입력하면 AI가 공문 형식으로 변환합니다.\n\n예)\n- 2025학년도 1학기 교원 자체연수 결과 제출\n- 연수 일시: 2025. 3. 15.(토) 오전 10:00~12:00\n- 연수 장소: 본교 도서관\n- 참여 인원: 교원 23명\n- 연수 내용: AI 활용 수업 설계`}
              className="w-full bg-surface-800 border border-white/10 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-slate-600 resize-none leading-relaxed"
            />
          </div>

          {/* 붙임 */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">붙임 파일 (선택)</label>
            <textarea
              value={attachments}
              onChange={e => setAttachments(e.target.value)}
              rows={2}
              placeholder="예) 1. 연수 결과 보고서 1부&#10;2. 참석자 명단 1부"
              className="w-full bg-surface-800 border border-white/10 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-slate-600 resize-none"
            />
          </div>

          {/* 생성 버튼 */}
          {loading ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600/80 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Square size={15} /> 생성 중단
            </button>
          ) : (
            <button
              onClick={generate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Sparkles size={15} /> 공문서 AI 생성
            </button>
          )}
        </div>

        {/* 우: 결과 영역 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 결과 툴바 */}
          {result && (
            <div className="flex-shrink-0 px-4 py-2 border-b border-white/5 flex items-center gap-2">
              <span className="text-xs text-slate-500 flex-1">AI 생성 공문서 초안 — 내용을 직접 수정할 수 있습니다</span>
              <button
                onClick={copyResult}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs rounded-lg transition-colors"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {copied ? '복사됨' : '복사'}
              </button>
              <button
                onClick={print}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs rounded-lg transition-colors"
              >
                <Printer size={12} /> 인쇄
              </button>
            </div>
          )}

          {result ? (
            <textarea
              ref={resultRef}
              value={result}
              onChange={e => setResult(e.target.value)}
              className="flex-1 bg-transparent text-slate-200 text-sm font-mono p-5 resize-none focus:outline-none leading-relaxed"
              spellCheck={false}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-700 gap-3">
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-sky-600" />
                  <p className="text-sm text-slate-500">공문서를 작성하고 있습니다...</p>
                </div>
              ) : (
                <>
                  <FileText size={40} className="opacity-20" />
                  <div className="text-center space-y-1">
                    <p className="text-sm">왼쪽에서 공문 정보를 입력하고</p>
                    <p className="text-sm text-slate-600">[공문서 AI 생성] 버튼을 눌러주세요</p>
                  </div>
                  {/* 빠른 예시 */}
                  <div className="mt-4 grid grid-cols-2 gap-2 max-w-sm w-full">
                    {[
                      { label: '연수 결과 제출', tag: '[제출]' as KeyTag, type: '결과보고' as DocType, content: '2025학년도 1학기 교원 자체연수 결과 제출\n- 일시: 2025. 4. 5.(토)\n- 주제: AI 기반 교육과정 재구성\n- 참여: 전체 교원 25명' },
                      { label: '안전점검 협조', tag: '[협조]' as KeyTag, type: '협조요청' as DocType, content: '학교 시설 안전점검 협조 요청\n- 점검 일시: 2025. 9. 1.~2025. 9. 5.\n- 점검 항목: 소방시설, 전기시설\n- 담당: 행정실장' },
                    ].map(ex => (
                      <button
                        key={ex.label}
                        onClick={() => {
                          setTag(ex.tag); setDocType(ex.type)
                          setTitle(ex.label); setMainContent(ex.content)
                        }}
                        className="px-3 py-2 bg-surface-800 hover:bg-surface-700 border border-white/5 text-xs text-slate-400 rounded-xl transition-colors text-left"
                      >
                        <div className="font-medium text-slate-300 mb-0.5">{ex.tag} {ex.label}</div>
                        <div className="text-[10px] text-slate-600">{ex.type}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-700 text-white text-sm px-4 py-2 rounded-xl shadow-xl border border-white/10 z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
