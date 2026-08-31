import { useMemo, useState } from 'react'
import { WidgetModuleHeader, WidgetModuleBody } from './WidgetModuleDisclosure'
import {
  CalendarRange,
  Check,
  Clipboard,
  Copy,
  Download,
  Hash,
  Plus,
  QrCode,
  Sparkles,
  Trash2,
  UsersRound,
} from 'lucide-react'
import type { QuickSnippet } from '../../services/widgetLocalData'
import {
  calculatePeriodTotal,
  countText,
  normalizeStudentList,
} from '../../services/widgetViewModel'

export type WidgetSnippetView = QuickSnippet

export interface WidgetQuickToolsProps {
  snippets: readonly WidgetSnippetView[]
  qrDataUrl?: string
  busy?: boolean
  onGenerateQr?: (value: string) => string | void | Promise<string | void>
  onAddSnippet: (label: string, text: string) => void | Promise<unknown>
  onDeleteSnippet: (id: string) => void | Promise<unknown>
  onNormalizeStudents?: (value: string) => string
}

type ToolId = 'qr' | 'snippets' | 'students' | 'periods' | 'text'

const TOOLS: Array<{ id: ToolId; label: string; icon: typeof QrCode }> = [
  { id: 'qr', label: 'QR', icon: QrCode },
  { id: 'snippets', label: '문구', icon: Clipboard },
  { id: 'students', label: '학번', icon: UsersRound },
  { id: 'periods', label: '기간·시수', icon: CalendarRange },
  { id: 'text', label: '글자 수', icon: Hash },
]

function dateFromYmd(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

function inclusiveDays(start: string, end: string, weekdaysOnly: boolean) {
  const startDate = dateFromYmd(start)
  const endDate = dateFromYmd(end)
  if (!startDate || !endDate || endDate < startDate) return 0
  let count = 0
  for (let cursor = startDate.getTime(); cursor <= endDate.getTime(); cursor += 86_400_000) {
    const day = new Date(cursor).getUTCDay()
    if (!weekdaysOnly || (day !== 0 && day !== 6)) count += 1
  }
  return count
}

export default function WidgetQuickTools({
  snippets,
  qrDataUrl,
  busy = false,
  onGenerateQr,
  onAddSnippet,
  onDeleteSnippet,
  onNormalizeStudents,
}: WidgetQuickToolsProps) {
  const [active, setActive] = useState<ToolId>('qr')
  const [message, setMessage] = useState('')
  const [qrValue, setQrValue] = useState('')
  const [localQr, setLocalQr] = useState('')
  const [snippetLabel, setSnippetLabel] = useState('')
  const [snippetText, setSnippetText] = useState('')
  const [studentInput, setStudentInput] = useState('')
  const [studentOutput, setStudentOutput] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [periodsPerDay, setPeriodsPerDay] = useState(1)
  const [periodExpression, setPeriodExpression] = useState('')
  const [weekdaysOnly, setWeekdaysOnly] = useState(true)
  const [textInput, setTextInput] = useState('')

  const days = useMemo(
    () => inclusiveDays(startDate, endDate, weekdaysOnly),
    [endDate, startDate, weekdaysOnly],
  )
  const textStats = useMemo(() => countText(textInput), [textInput])
  const visibleQr = localQr || qrDataUrl || ''
  const summary = active === 'qr'
    ? `QR · ${visibleQr ? '생성됨' : qrValue.trim() ? `입력 중 ${qrValue.trim()}` : '입력 대기'}`
    : active === 'snippets'
      ? `문구 · ${snippetLabel.trim() || snippetText.trim() ? `작성 중 ${snippetLabel.trim() || snippetText.trim()}` : `${snippets.length}건 저장`}`
      : active === 'students'
        ? `학번 · ${studentOutput ? '정리 결과 있음' : studentInput.trim() ? '입력 중' : '입력 대기'}`
        : active === 'periods'
          ? `기간·시수 · ${startDate && endDate ? `${days}일 / ${days * periodsPerDay}시간` : periodExpression.trim() ? `표현 합계 ${calculatePeriodTotal(periodExpression)}시간` : '기간 입력 대기'}`
          : `글자 수 · ${textStats.characters}자 / ${textStats.utf8Bytes}B`

  const flash = (value: string) => {
    setMessage(value)
    window.setTimeout(() => setMessage(''), 1_800)
  }

  const copy = async (value: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      flash('클립보드에 복사했습니다.')
    } catch {
      flash('복사하지 못했습니다. 다시 시도해 주세요.')
    }
  }

  const generateQr = async () => {
    const value = qrValue.trim()
    if (!value || !onGenerateQr) return
    if (new TextEncoder().encode(value).length > 1_500) {
      flash('QR 내용이 너무 깁니다. 한글은 약 500자 이내로 줄여주세요.')
      return
    }
    try {
      const generated = await onGenerateQr(value)
      if (typeof generated === 'string') setLocalQr(generated)
    } catch {
      setLocalQr('')
      flash('QR을 만들지 못했습니다. 내용을 조금 줄여 다시 시도해 주세요.')
    }
  }

  const addSnippet = async () => {
    if (!snippetLabel.trim() || !snippetText.trim() || busy) return
    await onAddSnippet(snippetLabel.trim(), snippetText.trim())
    setSnippetLabel('')
    setSnippetText('')
    flash('문구를 저장했습니다.')
  }

  return (
    <section className="widget-productivity-section widget-quick-tools no-drag" aria-label="빠른 도구">
      <WidgetModuleHeader title="빠른 도구" icon={<Sparkles size={13} />} summary={summary}
        badge={message && <small className="widget-tool-message"><Check size={10} />{message}</small>} />
      <WidgetModuleBody>
      <div className="widget-tool-tabs" role="tablist" aria-label="빠른 도구 선택">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          return (
            <button
              key={tool.id}
              type="button"
              role="tab"
              aria-selected={active === tool.id}
              className={active === tool.id ? 'active' : ''}
              onClick={() => setActive(tool.id)}
            >
              <Icon size={11} />{tool.label}
            </button>
          )
        })}
      </div>

      <div className="widget-tool-body">
        {active === 'qr' && (
          <div className="widget-tool-qr">
            <div className="widget-tool-inline-input">
              <input
                value={qrValue}
                maxLength={1_000}
                placeholder="주소나 안내 문구 입력"
                onChange={(event) => { setQrValue(event.target.value); setLocalQr('') }}
                onKeyDown={(event) => { if (event.key === 'Enter') void generateQr() }}
              />
              <button type="button" disabled={!qrValue.trim() || !onGenerateQr || busy} onClick={() => void generateQr()}>
                <QrCode size={12} /> 만들기
              </button>
            </div>
            {visibleQr ? (
              <div className="widget-qr-result">
                <img src={visibleQr} alt="입력한 내용의 QR코드" />
                <small>외부 서버로 내용을 보내지 않고 이 PC에서 생성했습니다.</small>
                <div className="widget-tool-button-row">
                  <button type="button" onClick={() => void copy(qrValue)}><Copy size={11} /> 내용 복사</button>
                  <a href={visibleQr} download="웅천고-QR코드.png"><Download size={11} /> PNG 저장</a>
                </div>
              </div>
            ) : <p className="widget-productivity-empty">QR로 보여줄 내용을 입력해 주세요.</p>}
          </div>
        )}

        {active === 'snippets' && (
          <div className="widget-snippet-tool">
            <div className="widget-snippet-editor">
              <input value={snippetLabel} maxLength={30} placeholder="문구 이름" onChange={(event) => setSnippetLabel(event.target.value)} />
              <textarea value={snippetText} maxLength={500} rows={2} placeholder="자주 쓰는 문구" onChange={(event) => setSnippetText(event.target.value)} />
              <button type="button" disabled={!snippetLabel.trim() || !snippetText.trim() || busy} onClick={() => void addSnippet()}>
                <Plus size={12} /> 저장
              </button>
            </div>
            {snippets.length ? (
              <ul className="widget-snippet-list">
                {snippets.slice(0, 8).map((snippet) => (
                  <li key={snippet.id}>
                    <button type="button" className="widget-snippet-copy" title={snippet.text} onClick={() => void copy(snippet.text)}>
                      <Copy size={11} /><span>{snippet.label}</span>
                    </button>
                    <button type="button" className="widget-snippet-delete" disabled={busy} title="문구 삭제" onClick={() => void onDeleteSnippet(snippet.id)}>
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="widget-productivity-empty">아직 저장한 문구가 없습니다.</p>}
          </div>
        )}

        {active === 'students' && (
          <div className="widget-student-tool">
            <textarea
              value={studentInput}
              rows={3}
              placeholder={'1201 홍길동\n12002, 김웅천'}
              onChange={(event) => setStudentInput(event.target.value)}
            />
            <div className="widget-tool-button-row">
              <button type="button" disabled={!studentInput.trim()} onClick={() => setStudentOutput(onNormalizeStudents ? onNormalizeStudents(studentInput) : normalizeStudentList(studentInput).normalizedText)}>
                <UsersRound size={12} /> 학번·이름 정리
              </button>
              <button type="button" disabled={!studentOutput} onClick={() => void copy(studentOutput)}><Copy size={12} /> 복사</button>
            </div>
            {studentOutput && <pre className="widget-tool-output">{studentOutput}</pre>}
            <small className="widget-tool-note">5자리 학번은 앱에서 쓰는 4자리 형식으로 정리합니다.</small>
          </div>
        )}

        {active === 'periods' && (
          <div className="widget-period-tool">
            <div className="widget-date-fields">
              <label>시작일<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
              <label>종료일<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label>
              <label>하루 시수<input type="number" min={0} max={20} value={periodsPerDay} onChange={(event) => setPeriodsPerDay(Math.max(0, Number(event.target.value) || 0))} /></label>
            </div>
            <label className="widget-tool-check"><input type="checkbox" checked={weekdaysOnly} onChange={(event) => setWeekdaysOnly(event.target.checked)} /> 주말 제외</label>
            <div className="widget-period-result">
              <span>포함 기간 <b>{days}일</b></span>
              <span>예상 총 시수 <b>{days * periodsPerDay}시간</b></span>
            </div>
            <div className="widget-period-expression">
              <input
                value={periodExpression}
                placeholder="예: 월 5,6,7교시 / 화 1~4교시"
                onChange={(event) => setPeriodExpression(event.target.value)}
              />
              <span>표현 합계 <b>{calculatePeriodTotal(periodExpression)}시간</b></span>
            </div>
            <small className="widget-tool-note">주말 제외는 토·일요일만 계산하며, 공휴일과 학사일정은 반영하지 않습니다.</small>
          </div>
        )}

        {active === 'text' && (
          <div className="widget-text-tool">
            <textarea value={textInput} rows={4} placeholder="글자 수를 세어볼 내용" onChange={(event) => setTextInput(event.target.value)} />
            <div className="widget-text-stats">
              <span>공백 포함 <b>{textStats.characters}</b></span>
              <span>공백 제외 <b>{textStats.charactersWithoutSpaces}</b></span>
              <span>UTF-8 <b>{textStats.utf8Bytes}B</b></span>
            </div>
            <button type="button" className="widget-copy-all" disabled={!textInput} onClick={() => void copy(textInput)}><Copy size={12} /> 전체 복사</button>
          </div>
        )}
      </div>
      </WidgetModuleBody>
    </section>
  )
}
