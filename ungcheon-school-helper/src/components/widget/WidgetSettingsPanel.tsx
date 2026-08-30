import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Gauge,
  LayoutGrid,
  Link2,
} from 'lucide-react'
import {
  WIDGET_MODULE_IDS,
  type WidgetDensity,
  type WidgetModuleId,
  type WidgetProductivitySettings,
} from '../../services/widgetSettings'

export interface WidgetShortcutOption {
  id: string
  label: string
  icon?: ReactNode
}

export interface WidgetSettingsPanelProps {
  settings: WidgetProductivitySettings
  shortcutOptions?: readonly WidgetShortcutOption[]
  shortcutLimit?: number
  disabled?: boolean
  onChange: (
    patch: Partial<WidgetProductivitySettings>,
  ) => void | Promise<unknown>
}

const MODULE_LABELS: Record<WidgetModuleId, string> = {
  timetable: '오늘 시간표',
  timer: '현재 교시 타이머',
  events: '오늘 주요 일정',
  meal: '오늘 급식',
  fortune: '오늘의 운세',
  'lucky-card': '오늘의 행운카드',
  tomorrow: '내일 미리보기',
  memo: '빠른 메모',
  shortcuts: '자주 쓰는 메뉴',
  weather: '날씨 행동 알림',
  tasks: '업무 마감 타임라인',
  'quick-tools': '빠른 도구',
  'end-of-day': '퇴근 전 브리핑',
}

const DENSITY_OPTIONS: Array<{
  id: WidgetDensity
  label: string
  description: string
}> = [
  { id: 'compact', label: '촘촘하게', description: '한 화면에 가장 많이 표시' },
  { id: 'default', label: '보통', description: '가독성과 공간의 균형' },
  { id: 'detailed', label: '자세히', description: '넓은 간격으로 표시' },
]

function uniqueKnownModules(order: readonly WidgetModuleId[]) {
  const known = new Set<WidgetModuleId>(WIDGET_MODULE_IDS)
  const seen = new Set<WidgetModuleId>()
  const normalized = order.filter((id) => {
    if (!known.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })
  return [...normalized, ...WIDGET_MODULE_IDS.filter((id) => !seen.has(id))]
}

export default function WidgetSettingsPanel({
  settings,
  shortcutOptions = [],
  shortcutLimit = 5,
  disabled = false,
  onChange,
}: WidgetSettingsPanelProps) {
  const moduleOrder = uniqueKnownModules(settings.moduleOrder ?? WIDGET_MODULE_IDS)
  const selectedShortcuts = settings.shortcutIds ?? []

  const commit = (patch: Partial<WidgetProductivitySettings>) => {
    if (disabled) return
    void onChange(patch)
  }

  const move = (id: WidgetModuleId, offset: -1 | 1) => {
    const currentIndex = moduleOrder.indexOf(id)
    const nextIndex = currentIndex + offset
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= moduleOrder.length) return
    const next = [...moduleOrder]
    ;[next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]]
    commit({ moduleOrder: next })
  }

  const toggleModule = (id: WidgetModuleId, checked: boolean) => {
    commit({
      moduleVisibility: {
        ...settings.moduleVisibility,
        [id]: checked,
      },
    })
  }

  const toggleShortcut = (id: string, checked: boolean) => {
    const next = checked
      ? [...selectedShortcuts.filter((value) => value !== id), id].slice(0, shortcutLimit)
      : selectedShortcuts.filter((value) => value !== id)
    commit({ shortcutIds: next })
  }

  return (
    <section className="widget-productivity-settings no-drag" aria-label="위젯 모듈 설정">
      <div className="widget-productivity-settings-block">
        <div className="widget-productivity-settings-title">
          <LayoutGrid size={14} aria-hidden="true" />
          <div>
            <strong>표시 모듈과 순서</strong>
            <small>필요한 항목만 켜고, 위아래 버튼으로 순서를 바꾸세요.</small>
          </div>
        </div>
        <ol className="widget-module-manager">
          {moduleOrder.map((id, index) => {
            const checked = settings.moduleVisibility?.[id] !== false
            return (
              <li key={id} className={checked ? 'is-visible' : 'is-hidden'}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => toggleModule(id, event.target.checked)}
                  />
                  <span className="widget-check-mark" aria-hidden="true">
                    {checked && <Check size={10} />}
                  </span>
                  <span>{MODULE_LABELS[id]}</span>
                </label>
                <span className="widget-module-order-actions">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    title={`${MODULE_LABELS[id]} 위로`}
                    aria-label={`${MODULE_LABELS[id]} 위로 이동`}
                    onClick={() => move(id, -1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === moduleOrder.length - 1}
                    title={`${MODULE_LABELS[id]} 아래로`}
                    aria-label={`${MODULE_LABELS[id]} 아래로 이동`}
                    onClick={() => move(id, 1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="widget-productivity-settings-block">
        <label className="widget-density-field">
          <span className="widget-productivity-settings-title compact">
            <Gauge size={14} aria-hidden="true" />
            <strong>표시 밀도</strong>
          </span>
          <select
            value={settings.density}
            disabled={disabled}
            onChange={(event) => commit({ density: event.target.value as WidgetDensity })}
          >
            {DENSITY_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.description}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="widget-productivity-settings-block widget-module-detail-settings">
        <div className="widget-productivity-settings-title">
          <Gauge size={14} aria-hidden="true" />
          <div>
            <strong>모듈 세부 설정</strong>
            <small>이 설정은 대시보드와 별도로 현재 PC의 위젯에만 저장됩니다.</small>
          </div>
        </div>
        <div className="widget-detail-setting-grid">
          <label>
            <span>내일 미리보기 시작</span>
            <input
              type="time"
              value={settings.tomorrowStartTime}
              disabled={disabled}
              onChange={(event) => commit({ tomorrowStartTime: event.target.value })}
            />
          </label>
          <label className="widget-detail-check">
            <input
              type="checkbox"
              checked={settings.continueToNextInstructionDay}
              disabled={disabled}
              onChange={(event) => commit({ continueToNextInstructionDay: event.target.checked })}
            />
            비수업일이면 다음 수업일까지 이어서 보기
          </label>
          <label className="widget-detail-check">
            <input
              type="checkbox"
              checked={settings.includeCompletedTasks}
              disabled={disabled}
              onChange={(event) => commit({ includeCompletedTasks: event.target.checked })}
            />
            업무 타임라인에 완료 업무 포함
          </label>
          <fieldset>
            <legend>날씨 행동 알림</legend>
            {([
              ['precipitation', '강수'],
              ['heat', '폭염'],
              ['cold', '한파·결빙'],
              ['wind', '강풍'],
            ] as const).map(([key, label]) => (
              <label className="widget-detail-check" key={key}>
                <input
                  type="checkbox"
                  checked={settings.weatherAlerts[key]}
                  disabled={disabled}
                  onChange={(event) => commit({
                    weatherAlerts: { ...settings.weatherAlerts, [key]: event.target.checked },
                  })}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>퇴근 전 브리핑</legend>
            <label>
              <span>표시 시각</span>
              <input
                type="time"
                value={settings.endOfDay.time}
                disabled={disabled}
                onChange={(event) => commit({
                  endOfDay: { ...settings.endOfDay, time: event.target.value },
                })}
              />
            </label>
            {([
              ['includeTasks', '미완료 업무'],
              ['includeTomorrowLesson', '내일 첫 수업'],
              ['includeTomorrowDuty', '내일 지도'],
              ['includeTomorrowEvents', '내일 행사'],
              ['includeMemos', '빠른 메모'],
            ] as const).map(([key, label]) => (
              <label className="widget-detail-check" key={key}>
                <input
                  type="checkbox"
                  checked={settings.endOfDay[key]}
                  disabled={disabled}
                  onChange={(event) => commit({
                    endOfDay: { ...settings.endOfDay, [key]: event.target.checked },
                  })}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      </div>

      {shortcutOptions.length > 0 && (
        <div className="widget-productivity-settings-block">
          <div className="widget-productivity-settings-title">
            <Link2 size={14} aria-hidden="true" />
            <div>
              <strong>자주 쓰는 메뉴</strong>
              <small>최대 {shortcutLimit}개 · 선택한 순서로 표시</small>
            </div>
            <span className="widget-shortcut-count">
              {selectedShortcuts.length}/{shortcutLimit}
            </span>
          </div>
          <div className="widget-shortcut-picker">
            {shortcutOptions.map((option) => {
              const checked = selectedShortcuts.includes(option.id)
              const limitReached = !checked && selectedShortcuts.length >= shortcutLimit
              return (
                <label key={option.id} className={checked ? 'is-selected' : ''}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || limitReached}
                    onChange={(event) => toggleShortcut(option.id, event.target.checked)}
                  />
                  {option.icon}
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

export { MODULE_LABELS }
