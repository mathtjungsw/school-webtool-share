import { create } from 'zustand'
import type { AppConfig, MealInfo, ScheduleEvent, LogEntry } from '../types'

export const UNGCHEON_DEFAULT_CONFIG: AppConfig = {
  schoolName: '웅천고등학교',
  officeName: '경상남도교육청',
  officeCode: 'S10',
  schoolCode: '9010464',
  schoolType: '고등학교',
  schoolHubUrl: 'https://script.google.com/macros/s/AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w/exec',
  schoolAddress: '경상남도 창원시 진해구 웅천중로 71',
  theme: 'auto',
  showNeisSchedule: false,
  grade: '1',
  classNm: '1',
  period1Start: '08:40',
  period2Start: '09:40',
  period3Start: '10:40',
  period4Start: '11:40',
  period5Start: '13:30',
  period6Start: '14:30',
  period7Start: '15:30',
}

interface AppState {
  config: AppConfig
  isConfigLoaded: boolean
  todayMeal: MealInfo | null
  todaySchedule: ScheduleEvent[]
  updateAvailable: boolean
  updateDownloaded: boolean
  updateNone: boolean
  updateError: string | null
  updateDismissed: boolean
  logs: LogEntry[]

  setConfig: (cfg: AppConfig) => void
  patchConfig: (patch: Partial<AppConfig>) => void
  setTodayMeal: (meal: MealInfo | null) => void
  setTodaySchedule: (events: ScheduleEvent[]) => void
  setConfigLoaded: (v: boolean) => void
  setUpdateAvailable: () => void
  setUpdateDownloaded: () => void
  setUpdateNone: () => void
  setUpdateError: (msg: string) => void
  clearUpdateError: () => void
  dismissUpdate: () => void
  addLog: (level: LogEntry['level'], message: string, source?: string) => void
  clearLogs: () => void

  saveConfig: (patch: Partial<AppConfig>) => Promise<void>
  loadConfig: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  config: UNGCHEON_DEFAULT_CONFIG,
  isConfigLoaded: false,
  todayMeal: null,
  todaySchedule: [],
  updateAvailable: false,
  updateDownloaded: false,
  updateNone: false,
  updateError: null,
  updateDismissed: false,
  logs: [],

  setConfig: (cfg) => set({ config: cfg }),
  patchConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  setTodayMeal: (meal) => set({ todayMeal: meal }),
  setTodaySchedule: (events) => set({ todaySchedule: events }),
  setConfigLoaded: (v) => set({ isConfigLoaded: v }),
  setUpdateAvailable: () => set({ updateAvailable: true, updateDismissed: false }),
  setUpdateDownloaded: () => set({ updateDownloaded: true }),
  setUpdateNone: () => {
    set({ updateNone: true })
    setTimeout(() => set({ updateNone: false }), 3000)
  },
  setUpdateError: (msg) => set({ updateError: msg }),
  clearUpdateError: () => set({ updateError: null }),
  dismissUpdate: () => set({ updateDismissed: true }),
  addLog: (level, message, source = '') => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' }),
      level,
      source,
      message,
    }
    set(s => ({ logs: [...s.logs.slice(-499), entry] }))
  },
  clearLogs: () => set({ logs: [] }),

  saveConfig: async (patch) => {
    if (!window.electron) return
    const newCfg = { ...get().config, ...patch }

    // API 키는 safeStorage로 분리 저장
    const API_KEY_FIELDS = ['neisApiKey'] as const
    type ApiKeyField = (typeof API_KEY_FIELDS)[number]
    const apiKeyUpdates = API_KEY_FIELDS
      .filter((k) => k in patch && patch[k as keyof typeof patch] !== undefined)
    await Promise.all(apiKeyUpdates.map((k) =>
      window.electron.apiKeySet(k, ((newCfg[k as ApiKeyField] ?? '') as string).trim()),
    ))

    // API 키를 제외한 나머지를 단일 배치 IPC로 저장
    const batchPatch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(newCfg)) {
      if (v === undefined) continue
      if (API_KEY_FIELDS.includes(k as ApiKeyField)) continue
      batchPatch[`config.${k}`] = v
    }
    if (Object.keys(batchPatch).length > 0) await window.electron.configSetMany(batchPatch)

    // 로컬 상태에서는 API 키 값을 유지 (마스킹 안 함 — UI 표시 필요)
    set({ config: newCfg })
  },

  loadConfig: async () => {
    if (!window.electron) {
      set({ isConfigLoaded: true })
      return
    }
    // electron-store의 dot-notation은 중첩 객체로 저장됨:
    // store.set('config.grade', '1') → { config: { grade: '1' } }
    // 따라서 store.store를 flat하게 순회하면 'config' 키 하나만 나옴 → 직접 꺼내야 함
    const all = (await window.electron.configGetAll()) as Record<string, unknown>
    const nested = ((all as Record<string, unknown>).config ?? {}) as Record<string, unknown>
    // dashboard.*는 메인 프로세스의 허용된 설정 영역이다.
    // 1.0.41의 migrations.* 키는 보안 화이트리스트에 없어 시작 중 저장 예외를 일으켰다.
    const migrations = ((all as Record<string, unknown>).dashboard ?? {}) as Record<string, unknown>
    const applyNeisDefaultOff = migrations.neisScheduleDefaultOffV1 !== true

    // API 키는 safeStorage에서 별도 로드 (없으면 기존 plain 값 유지 — 마이그레이션)
    const apiKeys = await window.electron.apiKeyGetAll()
    const cfg: AppConfig = { ...UNGCHEON_DEFAULT_CONFIG, ...nested, ...apiKeys } as AppConfig
    // 일부 구버전 PC는 학교 기본정보만 있고 공유 URL만 빈 상태로 남아 있었다.
    // 로그인과 공용 자료 조회가 막히지 않도록 웅천고 기본 URL을 자동 복구한다.
    if (!cfg.schoolHubUrl?.trim()) {
      cfg.schoolHubUrl = UNGCHEON_DEFAULT_CONFIG.schoolHubUrl
    }
    // 기존 기본값(true)이 저장된 PC도 이번 업데이트에서 한 번만 꺼짐으로 전환한다.
    // 이후 사용자가 켜거나 끈 선택은 그대로 유지된다.
    if (applyNeisDefaultOff) cfg.showNeisSchedule = false

    set({ config: cfg, isConfigLoaded: true })

    const patch: Record<string, unknown> = {}
    // 최초 실행 시 웅천고 기본값을 사용자 데이터 폴더에 저장한다.
    if (!nested.schoolCode) {
      for (const [key, value] of Object.entries(UNGCHEON_DEFAULT_CONFIG)) {
        patch[`config.${key}`] = value
      }
    }
    if (!String(nested.schoolHubUrl ?? '').trim()) {
      patch['config.schoolHubUrl'] = UNGCHEON_DEFAULT_CONFIG.schoolHubUrl
    }
    if (applyNeisDefaultOff) {
      patch['config.showNeisSchedule'] = false
      patch['dashboard.neisScheduleDefaultOffV1'] = true
    }
    if (Object.keys(patch).length > 0) {
      try {
        await window.electron.configSetMany(patch)
      } catch (error) {
        // 설정 이전 기록 저장에 실패해도 로그인 초기화와 앱 시작을 막지 않는다.
        get().addLog('warn', `초기 설정 저장을 건너뜁니다: ${error instanceof Error ? error.message : String(error)}`, '설정')
      }
    }
  },
}))
