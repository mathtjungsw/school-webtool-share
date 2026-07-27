import { useState } from 'react'
import { MessageSquare, ExternalLink, Copy, Check, ChevronLeft, Link2, Users, Sparkles, Code2, Lightbulb } from 'lucide-react'
import clsx from 'clsx'

// ─── 데이터 ───────────────────────────────────────────────────────
type ExtraBlock =
  | { type: 'band'; url: string; desc: string }
  | { type: 'reminder'; text: string }
  | { type: 'rules'; text: string }

interface NoticeSection {
  id: string
  title: string
  instruction: string
  links: { label: string; url: string }[]
  extra: ExtraBlock[]
  copyText: string
}

const KAKAOTALK_SECTIONS: NoticeSection[] = [
  {
    id: 'class',
    title: '1. 학급 단톡방 공지',
    instruction: '단톡방 공지에 아래 내용 복사 붙여 넣기 한 다음, 아래 링크 모두 클릭하여 "사본 만들기" 후 수정한 다음, 배포용링크를 아래 링크를 대체하여 학생들에게 공지한다.',
    links: [
      { label: '친구칭찬 또는 자기칭찬', url: 'https://docs.google.com/forms/d/1IETSfXvWCOwrWXyFsVz3zOSBhLBDspWu6kK2itZ8Gsk/copy' },
      { label: '학교폭력 익명 신고', url: 'https://docs.google.com/forms/d/1goqpuIY_cKAe2NN2S2I18MYhYdBdsmhCwdl1GN8LTl8/copy' },
      { label: '창체 소감문 양식', url: 'https://docs.google.com/forms/d/1qOVJFzf0JDH_rJJSKnRLQ7clFixOT5fikCwP4xOCoT8/copy' },
      { label: '매월 학급 성찰의 날 설문', url: 'https://docs.google.com/forms/d/1wLjlqRelqvPO_dcMaqYkEJ0iVupWwCDhZkAuuFiqKnE/copy' },
      { label: '행특을 위한 설문지', url: 'https://docs.google.com/forms/d/1TxCvaHFs1C9ECh9GXW4kph15meM51jZXzKPa8nxBt_4/copy' },
    ],
    extra: [
      {
        type: 'band',
        url: 'https://band.us/band/66178793',
        desc: '전북교육청에서 운영하는 진로진학상담 밴드입니다. 궁금하신 부분을 작성하시면 전문 선생님들께서 답변 주시니 잘 활용하시면 좋을 것 같습니다.',
      },
      { type: 'reminder', text: '마지막으로 나갈 때 전등, 히터, 환풍기 끄기, 문닫기' },
      {
        type: 'rules',
        text: `📢 [학급 운영 및 생활 규칙 안내]
우리 반의 원활한 운영과 즐거운 학교 생활을 위해 꼭 지켜야 할 안내 사항입니다.

1. 출결 및 서류 제출 규칙
질병 결석: 아파서 결석할 경우, 5일 이내에 증빙서류(진료확인서, 진단서, 의견서 등)를 꼭 제출해야 합니다. (미제출 시 미인정 결석 처리)
서명 작성: 모든 학교 서류의 서명란에는 흘려 쓰지 말고 반드시 '정자로 이름'을 또박또박 적어주세요.
체험학습: 신청서는 [3]일 전까지, 보고서는 복귀 후 [7]일 내 제출해야 출석이 인정됩니다.

2. 원활한 학급 운영을 위한 협조 사항
조례 및 지각: 아침 조례 시간([08시 40분])까지 반드시 입실을 완료해 주세요. 부득이한 사정으로 늦을 때는 사전에 담임교사에게 연락합니다.

연락 가능 시간: 담임교사에게 상담이나 문의가 필요하실 경우, 가급적 [근무시간 내에 연락 주시면 감사하겠습니다. (긴급 상황 제외)
모두가 함께 성장하는 행복한 학급을 만들기 위해 적극적인 협조 부탁드립니다. 감사합니다!`,
      },
    ],
    copyText: `친구칭찬 또는 자기칭찬 : https://docs.google.com/forms/d/1IETSfXvWCOwrWXyFsVz3zOSBhLBDspWu6kK2itZ8Gsk/copy

학교폭력 익명 신고 : https://docs.google.com/forms/d/1goqpuIY_cKAe2NN2S2I18MYhYdBdsmhCwdl1GN8LTl8/copy

창체 소감문 양식 :
https://docs.google.com/forms/d/1qOVJFzf0JDH_rJJSKnRLQ7clFixOT5fikCwP4xOCoT8/copy

매월 학급 성찰의 날 설문 :
https://docs.google.com/forms/d/1wLjlqRelqvPO_dcMaqYkEJ0iVupWwCDhZkAuuFiqKnE/copy

행특을 위한 설문지
https://docs.google.com/forms/d/1TxCvaHFs1C9ECh9GXW4kph15meM51jZXzKPa8nxBt_4/copy


https://band.us/band/66178793
전북교육청에서 운영하는 진로진학상담 밴드입니다. 궁금하신 부분을 작성하시면 전문 선생님들께서 답변 주시니 잘 활용하시면 좋을 것 같습니다.


마지막으로 나갈 때 전등, 히터, 환풍기 끄기, 문닫기


📢 [학급 운영 및 생활 규칙 안내]
우리 반의 원활한 운영과 즐거운 학교 생활을 위해 꼭 지켜야 할 안내 사항입니다.

1. 출결 및 서류 제출 규칙
질병 결석: 아파서 결석할 경우, 5일 이내에 증빙서류(진료확인서, 진단서, 의견서 등)를 꼭 제출해야 합니다. (미제출 시 미인정 결석 처리)
서명 작성: 모든 학교 서류의 서명란에는 흘려 쓰지 말고 반드시 '정자로 이름'을 또박또박 적어주세요.
체험학습: 신청서는 [3]일 전까지, 보고서는 복귀 후 [7]일 내 제출해야 출석이 인정됩니다.

2. 원활한 학급 운영을 위한 협조 사항
조례 및 지각: 아침 조례 시간([08시 40분])까지 반드시 입실을 완료해 주세요. 부득이한 사정으로 늦을 때는 사전에 담임교사에게 연락합니다.

연락 가능 시간: 담임교사에게 상담이나 문의가 필요하실 경우, 가급적 [근무시간 내에 연락 주시면 감사하겠습니다. (긴급 상황 제외)
모두가 함께 성장하는 행복한 학급을 만들기 위해 적극적인 협조 부탁드립니다. 감사합니다!`,
  },
  {
    id: 'subject',
    title: '2. 교과 단톡방 공지',
    instruction: '단톡방 공지에 아래 내용 복사 붙여 넣기 한 다음, 아래 링크 모두 클릭하여 "사본 만들기" 후 수정할 부분 있으면 수정한 다음, 배포용 링크를 아래 링크를 대체하여 학생들에게 공지한다.',
    links: [
      { label: '교과 과제탐구보고서 링크', url: 'https://docs.google.com/forms/d/14fZtRhL2wTChgUr1bycQ_E3PU4p0ArjBSgSkJQ1nlcQ/copy' },
      { label: '교과 성찰', url: 'https://docs.google.com/forms/d/19yg7P5Zqrc-W3SnnGv9OsfpY8LbN4Mxrvex-s204pfU/copy' },
    ],
    extra: [],
    copyText: `교과 과제탐구보고서 링크
https://docs.google.com/forms/d/14fZtRhL2wTChgUr1bycQ_E3PU4p0ArjBSgSkJQ1nlcQ/copy
교과 성찰 :
https://docs.google.com/forms/d/19yg7P5Zqrc-W3SnnGv9OsfpY8LbN4Mxrvex-s204pfU/copy`,
  },
]

// ─── 메인 페이지 (카드 대시보드) ──────────────────────────────────
type View = 'list' | 'kakaotalk_notice' | 'gemini_form'

export default function SharedResourcesPage() {
  const [view, setView] = useState<View>('list')

  if (view === 'kakaotalk_notice') return <KakaotalkNoticeDetail onBack={() => setView('list')} />
  if (view === 'gemini_form') return <GeminiFormGuideDetail onBack={() => setView('list')} />

  return (
    <div className="p-5">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">공유자료</h1>
        <p className="text-slate-400 text-sm mt-0.5">학급·교과 운영에 활용할 수 있는 자료 모음</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <ResourceCard
          icon={MessageSquare}
          color="emerald"
          title="단톡방 공지를 활용한 학급 및 교과 운영 방법"
          desc="학급·교과 단톡방 공지 양식 링크 및 학급 운영 안내문"
          onClick={() => setView('kakaotalk_notice')}
        />
        <ResourceCard
          icon={Sparkles}
          color="violet"
          title="구글 설문지 쉽게 만드는 법"
          desc="제미나이 + 앱스스크립트로 구글 설문지 자동 생성하기"
          onClick={() => setView('gemini_form')}
        />
      </div>
    </div>
  )
}

const CARD_COLOR: Record<string, { border: string; bg: string; icon: string }> = {
  emerald: { border: 'hover:border-emerald-500/30', bg: 'bg-emerald-500/10', icon: 'text-emerald-400' },
  violet:  { border: 'hover:border-violet-500/30',  bg: 'bg-violet-500/10',  icon: 'text-violet-400' },
}

function ResourceCard({ icon: Icon, color, title, desc, onClick }: {
  icon: typeof MessageSquare; color: string; title: string; desc: string; onClick: () => void
}) {
  const c = CARD_COLOR[color] ?? CARD_COLOR.emerald
  return (
    <button
      onClick={onClick}
      className={clsx('text-left p-4 rounded-xl bg-surface-800 border border-white/5 hover:bg-surface-700 transition-all duration-200 active:scale-[0.98]', c.border)}
    >
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center mb-3', c.bg)}>
        <Icon size={16} className={c.icon} />
      </div>
      <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{title}</p>
      <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
    </button>
  )
}

// ─── 상세 뷰: 구글 설문지 쉽게 만드는 법 ─────────────────────────
const FORM_STEPS: { no: string; title: string; items: string[] }[] = [
  {
    no: '1단계',
    title: '스크립트 에디터 열기',
    items: [
      '구글 드라이브 또는 [구글 스프레드시트]를 엽니다.',
      '상단 메뉴에서 [확장 프로그램] > [Apps Script]를 클릭하여 코드 편집기를 실행합니다.',
    ],
  },
  {
    no: '2단계',
    title: '코드 작성 및 저장',
    items: [
      '기존에 있던 코드를 지우고, 아래의 기본 예시 코드를 복사하여 붙여넣습니다.',
      '상단의 저장 버튼(디스크 아이콘)을 누릅니다.',
    ],
  },
  {
    no: '3단계',
    title: '실행 및 권한 승인',
    items: [
      '상단의 [실행] 버튼을 누릅니다.',
      '최초 실행 시 구글 계정 접근 권한을 요구하는 팝업이 뜹니다. [권한 검토] > [계정 선택] > [고급] > [(제목 없음) 프로젝트로 이동] > [허용]을 차례로 클릭하면 스크립트가 구글 드라이브에 설문지를 자동으로 생성합니다.',
    ],
  },
]

// 2단계에서 붙여넣을 기본 예시 코드(설문지 자동 생성).
const SAMPLE_CODE = `function createForm() {
  // 설문지 생성 (제목)
  var form = FormApp.create('새 설문지 제목');
  form.setDescription('설문지 설명을 여기에 작성합니다.');

  // 단답형 질문
  form.addTextItem()
    .setTitle('이름')
    .setRequired(true);

  // 객관식 질문 (하나만 선택)
  form.addMultipleChoiceItem()
    .setTitle('학년을 선택하세요')
    .setChoiceValues(['1학년', '2학년', '3학년'])
    .setRequired(true);

  // 체크박스 질문 (여러 개 선택)
  form.addCheckboxItem()
    .setTitle('관심 있는 분야를 모두 고르세요')
    .setChoiceValues(['인문', '사회', '자연', '공학', '예체능']);

  // 장문형(서술형) 질문
  form.addParagraphTextItem()
    .setTitle('하고 싶은 말을 자유롭게 적어주세요');

  // 생성된 설문지 URL을 로그에 출력
  Logger.log('편집 URL: ' + form.getEditUrl());
  Logger.log('응답 URL: ' + form.getPublishedUrl());
}`

function GeminiFormGuideDetail({ onBack }: { onBack: () => void }) {
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    await navigator.clipboard.writeText(SAMPLE_CODE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          <ChevronLeft size={14} /> 목록
        </button>
        <h2 className="text-sm font-bold text-white">구글 설문지 쉽게 만드는 법</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* 핵심 팁 */}
          <div className="bg-violet-500/10 border border-violet-500/25 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={16} className="text-violet-300" />
              <p className="text-sm font-bold text-violet-200">핵심 팁</p>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              제미나이에게 <span className="text-slate-400">"~ 구글 설문지 만들어줘"</span> 하면 구글 설문지를 못 만들지만,{' '}
              <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200 font-semibold">"앱스스크립트 코드를 이용하여 ~ 구글 설문지 만들어줘"</span>
              {' '}하면 쉽게 만들어 줍니다. 즉 <span className="font-semibold text-violet-200">"앱스스크립트 코드를 이용하여"</span>만 추가하여 부탁하면 됩니다.
              그러면 생긴 코드를 복사한 후 아래 단계에 따라 진행하면 됩니다.
            </p>
          </div>

          <p className="text-sm font-bold text-white">앱스스크립트로 설문지 만드는 기본 3단계</p>

          <div className="space-y-3">
            {FORM_STEPS.map((step, idx) => (
              <div key={idx} className="card !p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-xs font-bold text-violet-300 bg-violet-500/15 rounded-md px-2 py-0.5">{step.no}</span>
                  <span className="text-sm font-semibold text-slate-200">{step.title}</span>
                </div>
                <ul className="space-y-2 pl-1">
                  {step.items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-400 leading-relaxed">
                      <span className="text-violet-400 flex-shrink-0 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                {/* 2단계 아래에 예시 코드 블록 */}
                {step.no === '2단계' && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-surface-950 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/3">
                      <div className="flex items-center gap-1.5">
                        <Code2 size={12} className="text-emerald-400" />
                        <span className="text-[11px] font-medium text-slate-400">기본 예시 코드 (Apps Script)</span>
                      </div>
                      <button onClick={copyCode} className="btn-ghost p-1 flex items-center gap-1 text-[11px]">
                        {copied ? <><Check size={11} className="text-emerald-400" /> 복사됨</> : <><Copy size={11} /> 코드 복사</>}
                      </button>
                    </div>
                    <pre className="text-[11px] text-slate-300 leading-relaxed p-3 overflow-x-auto font-mono">{SAMPLE_CODE}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-500">앱스스크립트 편집기를 바로 열 수도 있습니다.</p>
            <button
              onClick={() => window.electron?.openExternal('https://script.google.com/')}
              className="btn-secondary !py-2 !px-3 flex items-center gap-1.5 text-xs flex-shrink-0"
            >
              <ExternalLink size={13} /> Apps Script 열기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 상세 뷰: 단톡방 공지 ─────────────────────────────────────────
function KakaotalkNoticeDetail({ onBack }: { onBack: () => void }) {
  const [activeId, setActiveId] = useState('class')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const section = KAKAOTALK_SECTIONS.find(s => s.id === activeId)!

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const open = (url: string) => window.electron?.openExternal(url)

  return (
    <div className="flex h-full">
      {/* 좌측 TOC */}
      <aside className="w-56 flex-shrink-0 border-r border-white/5 bg-surface-950/40 p-3 overflow-y-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4"
        >
          <ChevronLeft size={14} /> 목록
        </button>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">섹션</p>
        {KAKAOTALK_SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className={clsx(
              'w-full text-left px-2.5 py-2 rounded-lg mb-0.5 text-xs transition-colors border',
              s.id === activeId
                ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                : 'text-slate-400 hover:bg-white/5 border-transparent'
            )}
          >
            {s.title}
          </button>
        ))}
      </aside>

      {/* 본문 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 flex-shrink-0">
          <h2 className="text-sm font-bold text-white">{section.title}</h2>
          <button
            onClick={() => copy(section.copyText, `section-${section.id}`)}
            className="ml-auto btn-secondary !py-1.5 !px-3 flex items-center gap-1.5 text-xs flex-shrink-0"
          >
            {copiedKey === `section-${section.id}`
              ? <><Check size={12} className="text-emerald-400" /> 복사됨</>
              : <><Copy size={12} /> 전체 복사</>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 사용 안내 */}
          <div className="bg-white/3 border border-white/8 rounded-lg px-4 py-3">
            <p className="text-xs text-slate-400 leading-relaxed">{section.instruction}</p>
          </div>

          {/* 양식 링크 목록 */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">양식 링크</p>
            {section.links.map((link, i) => (
              <div key={i} className="card !p-3 flex items-center gap-3">
                <Link2 size={14} className="text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{link.label}</p>
                  <p className="text-[10px] text-slate-600 truncate mt-0.5">{link.url}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => copy(link.url, `url-${i}`)}
                    title="URL 복사"
                    className="btn-ghost p-1.5"
                  >
                    {copiedKey === `url-${i}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                  <button
                    onClick={() => open(link.url)}
                    title="브라우저에서 열기"
                    className="btn-ghost p-1.5"
                  >
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 추가 콘텐츠 블록 */}
          {section.extra.map((block, i) => {
            if (block.type === 'band') return (
              <div key={i} className="card !p-3 flex items-start gap-3">
                <Users size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-600 truncate mb-1">{block.url}</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{block.desc}</p>
                </div>
                <button
                  onClick={() => open(block.url)}
                  title="브라우저에서 열기"
                  className="btn-ghost p-1.5 flex-shrink-0"
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            )
            if (block.type === 'reminder') return (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <span className="text-sm">⚡</span>
                <p className="text-xs text-amber-300 font-medium">{block.text}</p>
              </div>
            )
            if (block.type === 'rules') return (
              <div key={i} className="card !p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">학급 운영 규칙</p>
                  <button
                    onClick={() => copy(block.text, 'rules')}
                    className="btn-ghost p-1.5 flex items-center gap-1 text-[10px]"
                  >
                    {copiedKey === 'rules' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span>복사</span>
                  </button>
                </div>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">{block.text}</pre>
              </div>
            )
            return null
          })}
        </div>
      </div>
    </div>
  )
}
