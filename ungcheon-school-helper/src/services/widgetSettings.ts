/**
 * Desktop widget productivity settings.
 *
 * The Electron main process owns the durable value, while this module owns the
 * schema and migration rules.  Keeping the migration pure makes old v1 widget
 * settings safe to read in both the renderer and release checks.
 */

export const WIDGET_MODULE_IDS = [
  'timetable',
  'timer',
  'meal',
  'fortune',
  'lucky-card',
  'tomorrow',
  'memo',
  'shortcuts',
  'weather',
  'tasks',
  'quick-tools',
  'end-of-day',
] as const

export type WidgetModuleId = (typeof WIDGET_MODULE_IDS)[number]
export type WidgetDensity = 'compact' | 'default' | 'detailed'

export const WIDGET_SHORTCUT_IDS = [
  'calendar',
  'timetable_swap',
  'student_locator',
  'staff_tasks',
  'volunteer_work',
  'committees',
  'audit_evidence',
  'dashboard',
] as const

/** Explicitly out of scope for this release. */
export const EXCLUDED_WIDGET_MODULE_IDS = ['change-summary', 'focus-mode'] as const

export interface WidgetWeatherAlertSettings {
  precipitation: boolean
  heat: boolean
  cold: boolean
  wind: boolean
}

export interface WidgetEndOfDaySettings {
  enabled: boolean
  time: string
  includeTasks: boolean
  includeTomorrowLesson: boolean
  includeTomorrowDuty: boolean
  includeTomorrowEvents: boolean
  includeMemos: boolean
}

export interface WidgetProductivitySettings {
  version: 3
  showTimedEvents: boolean
  moduleOrder: WidgetModuleId[]
  moduleVisibility: Record<WidgetModuleId, boolean>
  density: WidgetDensity
  shortcutIds: string[]
  tomorrowStartTime: string
  continueToNextInstructionDay: boolean
  includeCompletedTasks: boolean
  weatherAlerts: WidgetWeatherAlertSettings
  endOfDay: WidgetEndOfDaySettings
}

const DEFAULT_MODULE_VISIBILITY: Record<WidgetModuleId, boolean> = {
  timetable: true,
  timer: true,
  meal: true,
  fortune: true,
  'lucky-card': true,
  tomorrow: true,
  memo: false,
  shortcuts: false,
  weather: false,
  tasks: true,
  'quick-tools': false,
  'end-of-day': false,
}

export const DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS: WidgetProductivitySettings = {
  version: 3,
  showTimedEvents: true,
  moduleOrder: [...WIDGET_MODULE_IDS],
  moduleVisibility: { ...DEFAULT_MODULE_VISIBILITY },
  density: 'default',
  shortcutIds: ['student_locator', 'timetable_swap', 'staff_tasks'],
  tomorrowStartTime: '16:00',
  continueToNextInstructionDay: true,
  includeCompletedTasks: false,
  weatherAlerts: {
    precipitation: true,
    heat: true,
    cold: true,
    wind: true,
  },
  endOfDay: {
    enabled: false,
    time: '16:20',
    includeTasks: true,
    includeTomorrowLesson: true,
    includeTomorrowDuty: true,
    includeTomorrowEvents: true,
    includeMemos: true,
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isModuleId(value: unknown): value is WidgetModuleId {
  return typeof value === 'string' && (WIDGET_MODULE_IDS as readonly string[]).includes(value)
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function validTime(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return fallback
  return value
}

function normalizeModuleOrder(value: unknown): WidgetModuleId[] {
  const requested = Array.isArray(value) ? value.filter(isModuleId) : []
  const unique = [...new Set(requested)]
  return [...unique, ...WIDGET_MODULE_IDS.filter(id => !unique.includes(id))]
}

function normalizeShortcutIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.shortcutIds]
  const values = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => (WIDGET_SHORTCUT_IDS as readonly string[]).includes(item))
  return [...new Set(values)].slice(0, 5)
}

function normalizeModuleVisibility(input: Record<string, unknown>) {
  const visibility = { ...DEFAULT_MODULE_VISIBILITY }
  const saved = isRecord(input.moduleVisibility) ? input.moduleVisibility : null
  const enabledModules = Array.isArray(input.enabledModules)
    ? new Set(input.enabledModules.filter(isModuleId))
    : null

  for (const id of WIDGET_MODULE_IDS) {
    if (saved && typeof saved[id] === 'boolean') visibility[id] = saved[id]
    else if (enabledModules) visibility[id] = enabledModules.has(id)
  }

  // v1 stored these independent checkboxes on the widget shell settings.
  if ((!saved || typeof saved.meal !== 'boolean') && typeof input.showMeal === 'boolean') {
    visibility.meal = input.showMeal
  }
  if ((!saved || typeof saved.fortune !== 'boolean') && typeof input.showFortune === 'boolean') {
    visibility.fortune = input.showFortune
  }
  if ((!saved || typeof saved['lucky-card'] !== 'boolean') && typeof input.showLuckyCard === 'boolean') {
    visibility['lucky-card'] = input.showLuckyCard
  }

  return visibility
}

/**
 * Reads current settings and every legacy shape used by the desktop widget.
 * Unknown or duplicate module ids are discarded and newly introduced modules
 * are appended with their documented defaults.
 */
export function normalizeWidgetProductivitySettings(value: unknown): WidgetProductivitySettings {
  const input = isRecord(value) ? value : {}
  const weather = isRecord(input.weatherAlerts) ? input.weatherAlerts : {}
  const endOfDay = isRecord(input.endOfDay) ? input.endOfDay : {}
  const legacyVisibility = isRecord(input.moduleVisibility) ? input.moduleVisibility : {}
  const legacyEventsVisible = typeof legacyVisibility.events === 'boolean' ? legacyVisibility.events
    : Array.isArray(input.enabledModules) ? input.enabledModules.includes('events')
      : input.showEvents === true
  const showTimedEvents = typeof input.showTimedEvents === 'boolean' ? input.showTimedEvents
    : typeof legacyVisibility.events === 'boolean' ? legacyVisibility.events
      : Array.isArray(input.enabledModules) ? input.enabledModules.includes('events')
        : booleanValue(input.showEvents, true)
  const moduleVisibility = normalizeModuleVisibility(input)
  // The old events card had its own visibility. Keep explicitly visible events
  // reachable after merging it into the timetable, but never undo a v3 choice.
  const legacySchema = typeof input.version === 'number' ? input.version < 3 : true
  if (legacySchema && legacyEventsVisible && showTimedEvents) moduleVisibility.timetable = true
  const density: WidgetDensity = input.density === 'compact'
    || input.density === 'default'
    || input.density === 'detailed'
    ? input.density
    : input.dense === true
      ? 'compact'
      : 'default'

  return {
    version: 3,
    showTimedEvents,
    moduleOrder: normalizeModuleOrder(input.moduleOrder),
    moduleVisibility,
    density,
    shortcutIds: normalizeShortcutIds(input.shortcutIds),
    tomorrowStartTime: validTime(input.tomorrowStartTime, DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.tomorrowStartTime),
    continueToNextInstructionDay: booleanValue(
      input.continueToNextInstructionDay,
      DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.continueToNextInstructionDay,
    ),
    includeCompletedTasks: booleanValue(
      input.includeCompletedTasks,
      DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.includeCompletedTasks,
    ),
    weatherAlerts: {
      precipitation: booleanValue(weather.precipitation, DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.weatherAlerts.precipitation),
      heat: booleanValue(weather.heat, DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.weatherAlerts.heat),
      cold: booleanValue(weather.cold, DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.weatherAlerts.cold),
      wind: booleanValue(weather.wind, DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.weatherAlerts.wind),
    },
    endOfDay: {
      enabled: booleanValue(endOfDay.enabled, DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.endOfDay.enabled),
      time: validTime(endOfDay.time, DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.endOfDay.time),
      includeTasks: booleanValue(endOfDay.includeTasks, DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.endOfDay.includeTasks),
      includeTomorrowLesson: booleanValue(
        endOfDay.includeTomorrowLesson,
        DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.endOfDay.includeTomorrowLesson,
      ),
      includeTomorrowDuty: booleanValue(
        endOfDay.includeTomorrowDuty,
        DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.endOfDay.includeTomorrowDuty,
      ),
      includeTomorrowEvents: booleanValue(
        endOfDay.includeTomorrowEvents,
        DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.endOfDay.includeTomorrowEvents,
      ),
      includeMemos: booleanValue(endOfDay.includeMemos, DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.endOfDay.includeMemos),
    },
  }
}

/** Alias used at persistence boundaries to make the migration intent explicit. */
export const migrateWidgetProductivitySettings = normalizeWidgetProductivitySettings

export function isWidgetModuleVisible(settings: WidgetProductivitySettings, id: WidgetModuleId) {
  return settings.moduleVisibility[id] !== false
}

export function setWidgetModuleVisibility(
  settings: WidgetProductivitySettings,
  id: WidgetModuleId,
  visible: boolean,
): WidgetProductivitySettings {
  return normalizeWidgetProductivitySettings({
    ...settings,
    moduleVisibility: { ...settings.moduleVisibility, [id]: visible },
  })
}

export function moveWidgetModule(
  order: readonly WidgetModuleId[],
  id: WidgetModuleId,
  directionOrIndex: 'up' | 'down' | number,
): WidgetModuleId[] {
  const normalized = normalizeModuleOrder(order)
  const from = normalized.indexOf(id)
  if (from < 0) return normalized
  const requested = directionOrIndex === 'up'
    ? from - 1
    : directionOrIndex === 'down'
      ? from + 1
      : Math.trunc(directionOrIndex)
  const to = Math.max(0, Math.min(normalized.length - 1, requested))
  if (from === to) return normalized
  const next = [...normalized]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}
