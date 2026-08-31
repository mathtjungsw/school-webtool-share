import { type ReactNode } from 'react'
import { WidgetModuleHeader, WidgetModuleBody } from './WidgetModuleDisclosure'
import {
  AlarmClock,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CloudSun,
  Coffee,
  ExternalLink,
  MapPin,
  PartyPopper,
  SunMedium,
} from 'lucide-react'
import type {
  WidgetPeriodTiming,
  WidgetTaskBucket,
  WidgetTaskLike,
  WidgetWeatherAction,
} from '../../services/widgetViewModel'

export type WidgetModuleTone = 'blue' | 'green' | 'amber' | 'rose' | 'slate'

export interface WidgetProductivitySectionProps {
  title: string
  summary: string
  icon?: ReactNode
  badge?: ReactNode
  children: ReactNode
  className?: string
  empty?: boolean
}

export function WidgetProductivitySection({
  title,
  summary,
  icon,
  badge,
  children,
  className = '',
  empty = false,
}: WidgetProductivitySectionProps) {
  return (
    <section className={`widget-productivity-section ${className} ${empty ? 'is-empty' : ''} no-drag`}>
      <WidgetModuleHeader title={title} summary={summary} icon={icon} badge={badge} />
      <WidgetModuleBody className="widget-productivity-section-body">{children}</WidgetModuleBody>
    </section>
  )
}

export type WidgetPeriodTimerView = WidgetPeriodTiming & {
  /** Optional timetable-aware override, for example "3교시 · 304 수학". */
  headline?: string
  /** Optional preformatted countdown. Defaults to remainingMinutes. */
  countdown?: string
  progress?: number
}

export function WidgetPeriodTimerModule({ value }: { value: WidgetPeriodTimerView }) {
  const tone: WidgetModuleTone = value.phase === 'lesson'
    ? 'blue'
    : value.phase === 'break' || value.phase === 'lunch'
      ? 'green'
      : 'slate'
  const countdown = value.countdown
    ?? (value.remainingMinutes !== null ? `${value.remainingMinutes}분` : '')
  return (
    <WidgetProductivitySection
      title="교시 타이머"
      summary={[value.headline || value.label, countdown].filter(Boolean).join(' · ')}
      icon={<AlarmClock size={13} aria-hidden="true" />}
      badge={countdown && <b className={`widget-status-pill tone-${tone}`}>{countdown}</b>}
      className={`widget-period-timer tone-${tone}`}
    >
      <div className="widget-timer-line">
        <div>
          <strong>{value.headline || value.label}</strong>
          {value.detail && <small>{value.detail}</small>}
        </div>
        {value.nextPeriod && value.phase !== 'lesson' && (
          <span className="widget-next-period">{value.nextPeriod}교시</span>
        )}
      </div>
      {typeof value.progress === 'number' && (
        <div className="widget-timer-progress" aria-label={`진행률 ${Math.round(value.progress)}%`}>
          <i style={{ width: `${Math.max(0, Math.min(100, value.progress))}%` }} />
        </div>
      )}
    </WidgetProductivitySection>
  )
}

export interface WidgetTomorrowItemView {
  title: string
  meta?: string
  time?: string
  kind?: 'lesson' | 'event' | 'duty'
}

export interface WidgetTomorrowPreviewView {
  dateLabel: string
  dayLabel?: string
  ruleLabel?: string
  firstLesson?: WidgetTomorrowItemView | null
  firstEvent?: WidgetTomorrowItemView | null
  duties?: readonly WidgetTomorrowItemView[]
}

function TomorrowRow({ item, label }: { item: WidgetTomorrowItemView; label: string }) {
  return (
    <div className="widget-tomorrow-row">
      <span>{label}</span>
      <div><b>{item.title}</b>{item.meta && <small>{item.meta}</small>}</div>
      {item.time && <time>{item.time}</time>}
    </div>
  )
}

export function WidgetTomorrowModule({ value }: { value: WidgetTomorrowPreviewView }) {
  const hasItems = Boolean(value.firstLesson || value.firstEvent || value.duties?.length)
  return (
    <WidgetProductivitySection
      title="내일 미리보기"
      summary={[value.dateLabel, value.dayLabel === '다음 수업일' ? value.dayLabel : '', value.firstLesson ? `첫 수업 ${value.firstLesson.title}` : value.firstEvent ? `첫 일정 ${value.firstEvent.title}` : value.duties?.length ? `지도 ${value.duties[0].title}` : value.ruleLabel || '예정된 수업·일정 없음'].filter(Boolean).join(' · ')}
      icon={<CalendarClock size={13} aria-hidden="true" />}
      badge={<small className="widget-heading-meta">{value.dateLabel}{value.dayLabel ? ` · ${value.dayLabel}` : ''}</small>}
      className="widget-tomorrow-module"
      empty={!hasItems}
    >
      {value.ruleLabel && <p className="widget-day-rule-note">{value.ruleLabel}</p>}
      {value.firstLesson && <TomorrowRow item={value.firstLesson} label="첫 수업" />}
      {value.firstEvent && <TomorrowRow item={value.firstEvent} label="첫 일정" />}
      {value.duties?.slice(0, 2).map((item, index) => (
        <TomorrowRow key={`${item.title}-${index}`} item={item} label="지도" />
      ))}
      {!hasItems && <p className="widget-productivity-empty">내일 예정된 수업이나 일정이 없습니다.</p>}
    </WidgetProductivitySection>
  )
}

export interface WidgetWeatherModuleProps {
  location?: string
  temperature?: string
  updatedAt?: string
  actions: readonly WidgetWeatherAction[]
  loading?: boolean
}

export function WidgetWeatherModule({ location, temperature, updatedAt, actions, loading = false }: WidgetWeatherModuleProps) {
  const updatedLabel = updatedAt && !Number.isNaN(new Date(updatedAt).getTime())
    ? new Date(updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : ''
  return (
    <WidgetProductivitySection
      title="날씨 행동 알림"
      summary={loading ? '날씨 불러오는 중' : !temperature && !actions.length ? '날씨 자료 없음' : [temperature, actions[0]?.label || '추가 날씨 알림 없음'].filter(Boolean).join(' · ')}
      icon={<CloudSun size={13} aria-hidden="true" />}
      badge={<small className="widget-heading-meta">{[location, temperature].filter(Boolean).join(' · ')}</small>}
      className="widget-weather-module"
      empty={!loading && actions.length === 0}
    >
      {loading ? (
        <p className="widget-productivity-empty">날씨 정보를 불러오는 중입니다.</p>
      ) : actions.length ? (
        <ul className="widget-weather-actions">
          {actions.slice(0, 2).map((action) => (
            <li key={action.id} className={`tone-${action.severity === 'attention' ? 'amber' : 'blue'}`}>
              <span className="widget-weather-emoji" aria-hidden="true">
                {{ precipitation: '☔', wind: '🌬️', heat: '☀️', cold: '❄️', stale: '↻' }[action.id]}
              </span>
              <div><b>{action.label}</b>{action.detail && <small>{action.detail}</small>}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="widget-productivity-empty">오늘은 추가로 준비할 날씨 알림이 없습니다.</p>
      )}
      {updatedLabel && <small className="widget-weather-updated">예보 기준 · 오늘 {updatedLabel} 확인</small>}
    </WidgetProductivitySection>
  )
}

export interface WidgetTaskItemView extends WidgetTaskLike {
  meta?: string
}

export interface WidgetTaskBucketView extends WidgetTaskBucket<WidgetTaskItemView> {
  tone?: WidgetModuleTone
}

export interface WidgetTaskTimelineProps {
  buckets: readonly WidgetTaskBucketView[]
  onOpenTasks?: () => void
}

function taskBucketTone(bucket: WidgetTaskBucketView): WidgetModuleTone {
  if (bucket.tone) return bucket.tone
  if (bucket.id === 'overdue') return 'rose'
  if (bucket.id === 'today') return 'amber'
  if (bucket.id === 'soon') return 'blue'
  return 'slate'
}

export function WidgetTaskTimelineModule({ buckets, onOpenTasks }: WidgetTaskTimelineProps) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.items.length, 0)
  const incomplete = buckets.reduce((sum, bucket) => sum + bucket.items.filter(item => !item.completed).length, 0)
  const priority = buckets.flatMap((bucket) => bucket.items.map((item) => ({ ...item, bucket }))).slice(0, 3)
  return (
    <WidgetProductivitySection
      title="업무 마감 타임라인"
      summary={`미완료 ${incomplete}건${total > incomplete ? ` · 완료 ${total - incomplete}건` : ''}`}
      icon={<BriefcaseBusiness size={13} aria-hidden="true" />}
      badge={<b className="widget-productivity-count">{total}</b>}
      className="widget-task-timeline"
      empty={total === 0}
    >
      {total ? (
        <>
          <div className="widget-task-bucket-summary">
            {buckets.filter((bucket) => bucket.items.length).map((bucket) => (
              <span key={bucket.id} className={`tone-${taskBucketTone(bucket)}`}>
                {bucket.label} <b>{bucket.items.length}</b>
              </span>
            ))}
          </div>
          <ul className="widget-task-priority-list">
            {priority.map((item) => (
              <li key={`${item.bucket.id}-${item.id}`}>
                <i className={`tone-${taskBucketTone(item.bucket)}`} />
                <div><b>{item.title}</b><small>{[item.source, item.meta].filter(Boolean).join(' · ')}</small></div>
              </li>
            ))}
          </ul>
          {onOpenTasks && (
            <button type="button" className="widget-productivity-open-link" onClick={onOpenTasks}>
              업무센터에서 전체 보기 <ArrowUpRight size={11} />
            </button>
          )}
        </>
      ) : <p className="widget-productivity-empty">미완료 업무가 없습니다.</p>}
    </WidgetProductivitySection>
  )
}

export interface WidgetShortcutView {
  id: string
  label: string
  icon?: ReactNode
}

export function WidgetShortcutsModule({
  shortcuts,
  onOpen,
}: {
  shortcuts: readonly WidgetShortcutView[]
  onOpen: (id: string) => void
}) {
  return (
    <WidgetProductivitySection
      title="자주 쓰는 메뉴"
      summary={shortcuts.length ? `${shortcuts.length}개 · ${shortcuts[0].label}` : '선택한 메뉴 없음'}
      icon={<ExternalLink size={13} aria-hidden="true" />}
      className="widget-shortcuts-module"
      empty={shortcuts.length === 0}
    >
      {shortcuts.length ? (
        <div className="widget-shortcut-buttons">
          {shortcuts.slice(0, 5).map((shortcut) => (
            <button key={shortcut.id} type="button" onClick={() => onOpen(shortcut.id)}>
              {shortcut.icon}<span>{shortcut.label}</span>
            </button>
          ))}
        </div>
      ) : <p className="widget-productivity-empty">설정에서 자주 쓸 메뉴를 고르세요.</p>}
    </WidgetProductivitySection>
  )
}

export interface WidgetEndOfDayView {
  visible: boolean
  incompleteTaskCount: number
  tomorrowLesson?: string
  tomorrowEvent?: string
  tomorrowDuty?: string
  tomorrowReason?: string
  memoCount?: number
}

export function WidgetEndOfDayModule({
  value,
  onDismiss,
  onSnooze,
  onOpenDetails,
}: {
  value: WidgetEndOfDayView
  onDismiss?: () => void
  onSnooze?: () => void
  onOpenDetails?: () => void
}) {
  if (!value.visible) return null
  const items = [
    value.incompleteTaskCount > 0 ? `미완료 업무 ${value.incompleteTaskCount}건` : '미완료 업무 없음',
    value.tomorrowLesson ? `내일 첫 수업 ${value.tomorrowLesson}` : '',
    value.tomorrowEvent ? `내일 일정 ${value.tomorrowEvent}` : '',
    value.tomorrowDuty ? `내일 지도 ${value.tomorrowDuty}` : '',
    value.tomorrowReason ? value.tomorrowReason : '',
    value.memoCount ? `오늘 메모 ${value.memoCount}건` : '',
  ].filter(Boolean)
  return (
    <WidgetProductivitySection
      title="퇴근 전 브리핑"
      summary={items.slice(0, 2).join(' · ')}
      icon={<SunMedium size={13} aria-hidden="true" />}
      badge={<span className="widget-status-pill tone-amber"><Coffee size={10} /> 하루 마무리</span>}
      className="widget-end-of-day"
    >
      <ul>
        {items.map((item) => <li key={item}><CheckCircle2 size={11} />{item}</li>)}
      </ul>
      <p><PartyPopper size={12} /> 오늘도 수고하셨습니다.</p>
      {(onDismiss || onSnooze || onOpenDetails) && (
        <div className="widget-end-of-day-actions">
          {onDismiss && <button type="button" onClick={onDismiss}>오늘은 다시 보지 않기</button>}
          {onSnooze && <button type="button" onClick={onSnooze}>10분 뒤 다시 보기</button>}
          {onOpenDetails && <button type="button" className="primary" onClick={onOpenDetails}>자세히 보기</button>}
        </div>
      )}
    </WidgetProductivitySection>
  )
}

export function WidgetLocationHint({ text }: { text: string }) {
  return <span className="widget-location-hint"><MapPin size={10} />{text}</span>
}
