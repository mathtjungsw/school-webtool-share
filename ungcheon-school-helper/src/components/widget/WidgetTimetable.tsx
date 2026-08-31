import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock3, RefreshCw, X } from 'lucide-react'
import { buildWidgetTimedSchedule, widgetClockLabel, type WidgetTimedEvent, type WidgetTimedLesson, type NormalizedWidgetTimedEvent } from '../../services/widgetTimedSchedule'
import './widgetTimedSchedule.css'

export interface WidgetTimetableProps {
  date: string
  lessons: readonly WidgetTimedLesson[]
  events: readonly WidgetTimedEvent[]
  now: Date
  rule?: { kind?: string; label?: string }
  timetableUnavailable?: boolean
  timer: { currentPeriod: number | null; nextPeriod: number | null; countdown?: string; remainingMinutes?: number | null }
  syncing?: boolean
  onRefresh?: () => void
}
function tone(kind: string) {
  if (kind === 'committee') return 'violet'
  if (kind === 'gate' || kind === 'meal') return 'teal'
  if (kind.includes('task')) return 'amber'
  return 'blue'
}

export default function WidgetTimetable({ date, lessons, events, now, rule, timetableUnavailable = false, timer, syncing, onRefresh }: WidgetTimetableProps) {
  const [detail, setDetail] = useState<{ date: string; keys: string[] } | null>(null)
  const detailsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!detail) return
    const region = detailsRef.current
    const body = region?.closest('.widget-scroll-body')
    if (!region || !body) return
    const bounds = region.getBoundingClientRect()
    const viewport = body.getBoundingClientRect()
    if (bounds.top < viewport.top || bounds.bottom > viewport.bottom) {
      region.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [detail])
  const instruction = rule?.kind === 'instruction'
  const available = !timetableUnavailable && lessons.length > 0
  const model = useMemo(() => buildWidgetTimedSchedule({ date, lessons, events, instruction, timetableAvailable: available }), [date, lessons, events, instruction, available])
  const minute = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  const visibleDetails = detail?.date === date ? model.events.filter(event => detail.keys.includes(event.key)) : []
  const show = (items: NormalizedWidgetTimedEvent[]) => setDetail({ date, keys: items.map(event => event.key) })

  return <section className="widget-section timetable-section widget-timed-schedule" aria-label="오늘 수업과 시간 지정 일정">
    <div className="section-title">
      <span><Clock3 size={15} /> 오늘 시간표</span>
      {onRefresh && <button type="button" title="새로고침" aria-label="시간표 새로고침" onClick={onRefresh}><RefreshCw size={14} className={syncing ? 'spin' : ''} /></button>}
    </div>
    {rule?.label && <div className="day-rule">{rule.label}</div>}
    {(!instruction || !available) && <p className="wts-notice">{!instruction ? (rule?.label || '오늘 수업일 정보를 확인할 수 없습니다.') : '교사 시간표를 확인할 수 없습니다.'} 시간 있는 일정은 아래에서 확인하세요.</p>}
    <div className="wts-head" aria-hidden="true"><span>수업</span><span>시간 지정 일정</span></div>
    <div className="wts-rows">
      {model.segments.map(segment => {
        const current = instruction && available && minute >= segment.start && minute < segment.end
        const next = segment.lesson && timer.nextPeriod === segment.lesson.period && !current && Boolean(segment.lesson.value)
        const crowded = segment.pieces.length > 2 || segment.laneCount > 2 || (segment.pieces.length > 1 && segment.laneCount < 2)
        const height = segment.kind === 'lesson' ? 42 : 32
        const laneCount = Math.max(1, segment.laneCount)
        const pieceEvents = segment.pieces.map(piece => piece.event)
        return <div className={`wts-row ${current ? 'wts-current' : ''} ${next ? 'wts-next' : ''} ${segment.kind !== 'lesson' ? 'wts-gap' : ''}`} key={segment.id} style={{ minHeight: height }}>
          <div className="wts-lesson">
            <div className="wts-lesson-line"><b>{segment.label}</b><span>{segment.kind === 'lesson' ? widgetClockLabel(segment.start) : (segment.kind === 'lunch' || segment.kind === 'break') ? `${widgetClockLabel(segment.start)}~${widgetClockLabel(segment.end)}` : ''}</span>
              {current && <em>현재</em>}
            </div>
            {segment.kind === 'lesson' && <strong title={segment.lesson?.value || ''}>{segment.lesson ? (segment.lesson.value.replace(/\r?\n/g, ' · ') || '공강') : '시간표 없음'}</strong>}
            <div className="wts-badges">{segment.lesson?.badge && <span title={segment.lesson.badge}>{segment.lesson.badge}</span>}
              {current && segment.kind === 'lesson' && <small>{Math.max(0, Math.ceil(segment.end - minute))}분 남음</small>}
              {next && <small>다음 {Math.max(0, Math.ceil(segment.start - minute))}분 후</small>}
            </div>
          </div>
          <div className="wts-events" style={{ minHeight: height }} aria-label={`${segment.label} 일정`}>
            {segment.pieces.map(piece => {
              const event = piece.event
              const lane = crowded ? 0 : event.lane
              const columns = crowded ? 1 : laneCount
              const inset = crowded ? Math.min(event.lane * 5, 20) : 0
              return <div key={event.key} className={`wts-event-track wts-${tone(event.kind)} ${piece.continuesBefore ? 'wts-continues-before' : ''} ${piece.continuesAfter ? 'wts-continues-after' : ''}`} style={{ left: `calc(${lane / columns * 100}% + ${inset}px)`, width: crowded ? 4 : `calc(${100 / columns}% - 3px)`, top: `${piece.topPercent}%`, height: event.point ? 0 : `${piece.heightPercent}%` }} aria-hidden="true" />
            })}
            {crowded ? <button type="button" className="wts-overlap" onClick={() => show(pieceEvents)} aria-label={`${segment.label} ${segment.pieces.length}개 일정 상세 보기`}>
              <b>{segment.pieces.length > 1 && segment.laneCount > 1 ? '겹친 일정' : '일정'} {segment.pieces.length}개</b><small>펼쳐 보기</small>
            </button> : segment.pieces.map(piece => {
              const event = piece.event
              return <button type="button" key={`label-${event.key}`} className={`wts-event-label wts-${tone(event.kind)} ${event.point ? 'wts-point' : ''}`} style={{ left: `${event.lane / laneCount * 100}%`, width: `calc(${100 / laneCount}% - 3px)`, top: Math.min(piece.topPercent / 100 * height, height - 27) }} onClick={() => show([event])} title={`${event.title} · ${event.timeLabel}${event.location ? ` · ${event.location}` : ''}`} aria-label={`${event.point ? '시각' : '기간'} ${event.timeLabel} ${event.title}${piece.continuesBefore || piece.continuesAfter ? ' · 이어지는 일정' : ''}`}>
                <b>{event.point ? '◆ ' : piece.continuesBefore ? '↳ ' : ''}{event.title}</b><small>{event.timeLabel}{piece.continuesAfter ? ' ↓' : ''}</small>
              </button>
            })}
          </div>
        </div>
      })}
    </div>
    {!model.events.length && <p className="wts-empty">오늘 시간 지정 일정이 없습니다.</p>}
    {visibleDetails.length > 0 && <div ref={detailsRef} className="wts-details" role="region" aria-label="일정 상세" aria-live="polite">
      <div className="wts-detail-head"><b>일정 상세 · 읽기 전용</b><button type="button" aria-label="일정 상세 닫기" onClick={() => setDetail(null)}><X size={14} /></button></div>
      {visibleDetails.map(event => <article key={event.key}><strong>{event.title}</strong><span>{event.date} · {event.timeLabel}{event.point ? ' (지정 시각)' : ''}</span>{event.location && <span>장소 · {event.location}</span>}{event.meta && <p>{event.meta}</p>}</article>)}
    </div>}
  </section>
}
