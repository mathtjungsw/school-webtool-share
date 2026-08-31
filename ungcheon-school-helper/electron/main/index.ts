import { app, BrowserWindow, ipcMain, shell, nativeTheme, dialog, safeStorage, session, net, Tray, Menu, screen } from 'electron'
import { join, resolve as pathResolve, basename, extname } from 'path'
import { pathToFileURL } from 'url'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { execFile, spawn } from 'child_process'
import { get as httpGet } from 'http'
import { promisify } from 'util'
import { autoUpdater } from 'electron-updater'
import Store from 'electron-store'
import { fitWidgetBounds } from './widgetGeometry'
import { startMonitoring, stopMonitoring, isMonitoringActive } from './notifier'
import { getWeeklyPlanMonth } from './weekly-plan'
import { getDutyScheduleMonth } from './duty-schedule'
import { getCreativeScheduleMonth } from './creative-schedule'
import {
  clearPersistentHubCache,
  deletePersistentHubCacheResource,
  persistentHubCacheStatus,
  readPersistentHubCache,
  writePersistentHubCache,
  type PersistentHubCacheEntry,
} from './school-hub-cache'
import { getSchoolHubEndpointCandidates, resolveSchoolHubEndpoint, UNGCHEON_SCHOOL_HUB_URL } from './school-hub-endpoint'
import { buildTimetablePlanHwp, type TimetablePlanDraftInput } from './timetable-plan-hwp'
import {
  buildVolunteerCertificateHwp,
  parseVolunteerHwpBuffer,
  parseVolunteerHwpFile,
  type ParsedVolunteerForm,
  type VolunteerCertificateDraftInput,
} from './volunteer-hwp'
import {
  deleteVolunteerHwpFile,
  importVolunteerHwpFile,
  listVolunteerHwpFiles,
  resolveVolunteerHwpPath,
  storeGeneratedVolunteerHwp,
  storeGeneratedVolunteerForms,
  updateVolunteerDocumentForms,
} from './volunteer-storage'
import { parseVolunteerPdfFile } from './volunteer-pdf'
import {
  buildClassVolunteerHwpx,
  buildClassVolunteerPdf,
  buildCoordinatorVolunteerPdf,
  printClassVolunteer,
  type ClassVolunteerDocumentInput,
  type CoordinatorVolunteerDocumentInput,
} from './class-volunteer-document'
import {
  clearSchoolInfoEvaluationCache,
  getSchoolInfoEvaluationPlan,
  searchSchoolInfoSchools,
  searchSchoolInfoSchoolsByRegion,
  type SchoolInfoEvaluationRequest,
} from './schoolinfo'
import {
  DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS,
  normalizeWidgetProductivitySettings,
  type WidgetProductivitySettings,
  type WidgetSettingsPatch,
} from '../../src/services/widgetSettings'

const execFileAsync = promisify(execFile)

const store = new Store()
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

// 웅천고 전용 공유 주소는 프로그램에 내장한다. 과거 PC에 다른 주소가 저장되어
// 있어도 시작할 때 고정 주소로 덮어써 사용자가 수정할 필요가 없게 한다.
store.set('config.schoolHubUrl', UNGCHEON_SCHOOL_HUB_URL)

let mainWindow: BrowserWindow | null = null
let widgetWindow: BrowserWindow | null = null
let widgetRequestedHeight = 0
let tray: Tray | null = null
let isQuitting = false

type WidgetPreset = 'glass-light' | 'solid-light' | 'dark-glass' | 'school-yellow' | 'minimal'
interface WidgetSettings extends WidgetProductivitySettings {
  expanded: boolean
  pinned: boolean
  opacity: number
  preset: WidgetPreset
  showFortune: boolean
  showLuckyCard: boolean
  luckyCardKind: 'tarot' | 'hwatu'
  showMeal: boolean
  showPersonalSchedules: boolean
  showPersonalTasksInEvents: boolean
  showNeisSchedules: boolean
  showCommitteeEvents: boolean
  showWeeklyPlans: boolean
  showGateDuty: boolean
  showMealDuty: boolean
  showCreativeActivities: boolean
  dense: boolean
  x?: number
  y?: number
}
const WIDGET_SETTINGS_KEY = 'widget.settings.v1'
const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  ...DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS,
  expanded: true, pinned: true, opacity: 0.96, preset: 'glass-light', showFortune: true, showLuckyCard: true, luckyCardKind: 'tarot', showMeal: true,
  showPersonalSchedules: true, showPersonalTasksInEvents: true, showNeisSchedules: true, showCommitteeEvents: true,
  showWeeklyPlans: true, showGateDuty: true, showMealDuty: true, showCreativeActivities: true, dense: true,
}
function widgetSettings(): WidgetSettings {
  const saved = store.get(WIDGET_SETTINGS_KEY) as Partial<WidgetSettings> | undefined
  return {
    ...DEFAULT_WIDGET_SETTINGS,
    ...(saved ?? {}),
    ...normalizeWidgetProductivitySettings(saved),
    expanded: saved?.expanded !== false,
  }
}
function widgetSize(expanded: boolean, preset: WidgetPreset) {
  if (preset === 'minimal') return expanded ? { width: 360, height: 480 } : { width: 360, height: 96 }
  return expanded ? { width: 390, height: 600 } : { width: 390, height: 110 }
}
function fitWidgetWindow(requestedWidth?: number) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return
  const current = widgetWindow.getBounds()
  const workArea = screen.getDisplayMatching(current).workArea
  const bounds = fitWidgetBounds(current, workArea, widgetRequestedHeight || current.height, requestedWidth)
  widgetWindow.setMinimumSize(Math.min(350, bounds.width), Math.min(84, bounds.height))
  if (bounds.x !== current.x || bounds.y !== current.y || bounds.width !== current.width || bounds.height !== current.height) widgetWindow.setBounds(bounds, false)
}
function loadRenderer(window: BrowserWindow, widget = false) {
  if (process.env['ELECTRON_RENDERER_URL']) window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${widget ? '?window=widget' : ''}`)
  else window.loadFile(join(__dirname, '../renderer/index.html'), widget ? { query: { window: 'widget' } } : undefined)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#eeebe1',
    titleBarStyle: 'hidden',
    show: false,
    icon: process.env['ELECTRON_RENDERER_URL']
      ? join(__dirname, '../../resources/icon.png')
      : join(process.resourcesPath, 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 시작 시 창 최대화를 기본으로 — ready-to-show에서 표시하여 깜빡임 방지
  mainWindow.maximize()
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  nativeTheme.themeSource = 'light'

  // User-Agent에서 Electron 제거 — 구글 캘린더 등 Electron 차단 서비스 우회
  const chromeUA = mainWindow.webContents.getUserAgent()
    .replace(/Electron\/[\d.]+ /, '')
    .replace(/ electron\/[\d.]+/i, '')
  mainWindow.webContents.setUserAgent(chromeUA)

  loadRenderer(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // X-Frame-Options 제거 — 구글 캘린더 embed 전용 (.google.com 도메인만, C-3)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    let isGoogleDomain = false
    try { isGoogleDomain = new URL(details.url).hostname.endsWith('.google.com') } catch { /* ignore */ }
    if (!isGoogleDomain) { callback({ responseHeaders: details.responseHeaders }); return }

    const headers = { ...details.responseHeaders }
    delete headers['x-frame-options']
    delete headers['X-Frame-Options']
    if (headers['content-security-policy']) {
      headers['content-security-policy'] = (headers['content-security-policy'] as string[])
        .map(v => v.replace(/frame-ancestors[^;]*(;|$)/gi, ''))
    }
    callback({ responseHeaders: headers })
  })

  nativeTheme.themeSource = 'light'
  if (!process.argv.includes('--widget')) createWindow()
  createWidgetWindow()
  createTray()
  if (store.get('widget.autoLaunchInitialized') !== true) {
    store.set('widget.autoLaunchInitialized', true)
    setWidgetAutoLaunch(true)
  }

  // 프로덕션 빌드에서만 자동 업데이트 확인 + 자동 실행 기본값 적용
  if (!process.env['ELECTRON_RENDERER_URL'] && !app.getVersion().includes('-preview.')) {
    // app-update.yml이 손상되거나 누락된 설치본에서도 GitHub 공급자를 명시적으로 사용한다.
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'mathtjungsw',
      repo: 'school-webtool-share',
    })
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin' && isQuitting) app.quit()
})

app.on('before-quit', () => { isQuitting = true })
app.on('second-instance', (_, argv) => {
  if (argv.includes('--widget')) createWidgetWindow()
  else showMainWindow()
})

// Window controls IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('widget:show', () => { createWidgetWindow(); return true })
ipcMain.handle('widget:hide', () => { widgetWindow?.hide(); return true })
ipcMain.handle('widget:getSettings', () => widgetSettings())
ipcMain.handle('widget:updateSettings', (_, patch: WidgetSettingsPatch<WidgetSettings>) => {
  const current = widgetSettings()
  const merged = {
    ...current,
    ...patch,
    moduleCollapsed: { ...current.moduleCollapsed, ...patch.moduleCollapsed },
  }
  const next: WidgetSettings = {
    ...merged,
    ...normalizeWidgetProductivitySettings(merged),
  }
  next.opacity = Math.max(0.65, Math.min(1, Number(next.opacity) || DEFAULT_WIDGET_SETTINGS.opacity))
  store.set(WIDGET_SETTINGS_KEY, next)
  if (widgetWindow) {
    widgetWindow.setAlwaysOnTop(next.pinned)
    widgetWindow.setOpacity(next.opacity)
    // Content measurements own height; pin/opacity changes must not reset it.
    fitWidgetWindow(widgetSize(next.expanded, next.preset).width)
    widgetWindow.webContents.send('widget:settingsChanged', next)
  }
  return next
})
ipcMain.handle('widget:fitHeight', (_, requestedHeight: number) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return false
  if (!Number.isFinite(requestedHeight) || requestedHeight <= 0) return false
  widgetRequestedHeight = Math.ceil(requestedHeight)
  fitWidgetWindow()
  return true
})
ipcMain.handle('widget:openMain', (_, page = '') => { showMainWindow(String(page)); return true })
ipcMain.on('auth:changed', () => BrowserWindow.getAllWindows().forEach(window => window.webContents.send('auth:changed')))

// Config IPC
// C-1: 허용 키 접두어 화이트리스트 — 렌더러가 임의 키를 주입하는 것을 방지
const ALLOWED_CONFIG_KEY_PREFIXES = [
  'config.', 'dashboard.', 'att:', 'scoregomoku.',
  'special_remarks:', 'exam_supervisor:', 'newSemClass:',
  'wr:', 'club:', 'photo:', 'insa:',
  'assessment:', 'feedback.', 'timetable_plan:',
  'personal.', 'sidebar.', 'pilotLogin.', 'neisSync.', 'notifier.',
  'staffTasks.',
  'recommendedSubjects.',
  'widget.',
]
function isAllowedConfigKey(key: string): boolean {
  return ALLOWED_CONFIG_KEY_PREFIXES.some(p => key.startsWith(p))
}

ipcMain.handle('config:get', (_, key: string) => store.get(key))
ipcMain.handle('config:set', (_, key: string, value: unknown) => {
  if (!isAllowedConfigKey(key)) throw new Error(`허용되지 않는 config 키: ${key}`)
  store.set(key, value)
})
ipcMain.handle('config:setMany', (_, patch: Record<string, unknown>) => {
  // I-7: 페이로드 크기 상한 (1 MB) — 디스크 소진 공격 방지
  if (JSON.stringify(patch).length > 1_000_000) throw new Error('config:setMany 페이로드가 너무 큽니다 (1 MB 초과)')
  for (const [k, v] of Object.entries(patch)) {
    if (!isAllowedConfigKey(k)) throw new Error(`허용되지 않는 config 키: ${k}`)
    store.set(k, v)
  }
})
ipcMain.handle('config:getAll', () => store.store)
ipcMain.handle('config:delete', (_, key: string) => {
  if (!isAllowedConfigKey(key)) throw new Error(`허용되지 않는 config 키: ${key}`)
  store.delete(key)
})

ipcMain.handle('timetablePlan:buildHwp', (_, draft: Record<string, unknown>) => {
  if (JSON.stringify(draft).length > 200_000) throw new Error('교환보강 계획서 내용이 너무 큽니다.')
  const templatePath = process.env['ELECTRON_RENDERER_URL']
    ? join(process.cwd(), 'resources', 'templates', 'exchange-plan-template.hwp')
    : join(process.resourcesPath, 'templates', 'exchange-plan-template.hwp')
  return Array.from(buildTimetablePlanHwp(templatePath, draft as unknown as TimetablePlanDraftInput))
})

function volunteerTemplatePath(name: string) {
  return process.env['ELECTRON_RENDERER_URL']
    ? join(process.cwd(), 'resources', 'templates', name)
    : join(process.resourcesPath, 'templates', name)
}

ipcMain.handle('volunteer:buildHwp', (_, draft: VolunteerCertificateDraftInput) => {
  if (JSON.stringify(draft).length > 500_000) throw new Error('봉사활동 확인서 입력 내용이 너무 큽니다.')
  return Array.from(buildVolunteerCertificateHwp(
    volunteerTemplatePath('volunteer-single-source.hwp'),
    volunteerTemplatePath('volunteer-double-source.hwp'),
    draft,
  ))
})

ipcMain.handle('volunteer:buildClassHwpx', async (_, draft: ClassVolunteerDocumentInput) => {
  if (JSON.stringify(draft).length > 500_000) throw new Error('반별 봉사활동 확인서 입력 내용이 너무 큽니다.')
  return Array.from(await buildClassVolunteerHwpx(
    volunteerTemplatePath('class-volunteer-template.hwpx'),
    draft,
  ))
})

ipcMain.handle('volunteer:buildClassPdf', async (_, draft: ClassVolunteerDocumentInput) => {
  if (JSON.stringify(draft).length > 500_000) throw new Error('반별 봉사활동 확인서 입력 내용이 너무 큽니다.')
  return Array.from(await buildClassVolunteerPdf(draft))
})

ipcMain.handle('volunteer:buildCoordinatorPdf', async (_, draft: CoordinatorVolunteerDocumentInput) => {
  if (JSON.stringify(draft).length > 2_000_000) throw new Error('담당자용 봉사활동 확인서 입력 내용이 너무 큽니다.')
  return Array.from(await buildCoordinatorVolunteerPdf(draft))
})

ipcMain.handle('volunteer:printClass', async (_, draft: ClassVolunteerDocumentInput) => {
  if (JSON.stringify(draft).length > 500_000) throw new Error('반별 봉사활동 확인서 입력 내용이 너무 큽니다.')
  return printClassVolunteer(draft)
})

ipcMain.handle('volunteer:storeGeneratedHwp', (_, name: string, bytes: number[]) => {
  if (!Array.isArray(bytes) || bytes.length > 10_000_000) throw new Error('봉사활동 확인서 파일 크기가 올바르지 않습니다.')
  const buffer = Buffer.from(bytes)
  const forms = parseVolunteerHwpBuffer(buffer)
  return storeGeneratedVolunteerHwp(name, buffer, {
    formCount: forms.length,
    activities: forms.map(form => form.activityName),
  })
})

ipcMain.handle('volunteer:storeGeneratedForms', (_, title: string, forms: unknown) => {
  if (typeof title !== 'string' || title.length > 150) throw new Error('수기 생성 확인서 제목이 올바르지 않습니다.')
  if (!Array.isArray(forms) || JSON.stringify(forms).length > 2_000_000) throw new Error('수기 생성 확인서 내용이 올바르지 않습니다.')
  return storeGeneratedVolunteerForms(title, forms as ParsedVolunteerForm[])
})

ipcMain.handle('volunteer:importHwp', async (_, filePath: string, allowDuplicate = false) => {
  const abs = pathResolve(filePath)
  const isPdf = abs.toLowerCase().endsWith('.pdf')
  const parsed = isPdf ? await parseVolunteerPdfFile(abs) : null
  const forms = parsed?.forms || parseVolunteerHwpFile(abs)
  return importVolunteerHwpFile(abs, {
    formCount: forms.length,
    activities: forms.map(form => form.activityName),
    fileType: isPdf ? 'pdf' : 'hwp',
    pageCount: parsed?.pageCount,
    analysisMode: parsed?.analysisMode || 'hwp',
    averageConfidence: parsed?.averageConfidence,
    warnings: parsed?.warnings || [],
    forms: isPdf ? forms : undefined,
  }, Boolean(allowDuplicate))
})

ipcMain.handle('volunteer:listHwp', () => listVolunteerHwpFiles())
ipcMain.handle('volunteer:parseHwp', (_, id: string) => {
  const resolved = resolveVolunteerHwpPath(String(id))
  return resolved.item.forms || parseVolunteerHwpFile(resolved.path)
})
ipcMain.handle('volunteer:updateForms', (_, id: string, forms: unknown, title?: string) => {
  if (!Array.isArray(forms) || JSON.stringify(forms).length > 2_000_000) throw new Error('OCR 수정 내용이 올바르지 않습니다.')
  if (title != null && String(title).length > 200) throw new Error('확인서 제목이 너무 깁니다.')
  return updateVolunteerDocumentForms(String(id), forms as any, title == null ? undefined : String(title))
})
ipcMain.handle('volunteer:openHwp', (_, id: string) => shell.openPath(resolveVolunteerHwpPath(String(id)).path))
ipcMain.handle('volunteer:deleteHwp', (_, id: string) => deleteVolunteerHwpFile(String(id)))

// Open external links — http/https only
ipcMain.handle('shell:openExternal', (_, url: string) => {
  let parsed: URL
  try { parsed = new URL(url) } catch {
    throw new Error('유효하지 않은 URL입니다.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('허용되지 않는 프로토콜입니다.')
  }
  return shell.openExternal(url)
})

// Open a local file/path in the OS default application — 허용 확장자만 열기
const ALLOWED_OPEN_EXTS = new Set(['.html', '.pdf', '.xlsx', '.xls', '.hwp', '.hwpx', '.docx', '.txt', '.csv', '.json'])
// IPC 파일 읽기 핸들러에서 허용하는 확장자 (다이얼로그 필터 외 2차 방어)
const ALLOWED_READ_EXTS = new Set([
  '.xlsx', '.xls', '.csv', '.json', '.txt',
  '.pdf', '.hwp', '.hwpx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
])
ipcMain.handle('shell:openPath', (_, filePath: string) => {
  // C-2: path.resolve로 '..' 경로 순회 차단
  const abs = pathResolve(filePath)
  const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_OPEN_EXTS.has(ext)) throw new Error('허용되지 않는 파일 형식입니다.')
  return shell.openPath(abs)
})

// Auto-updater
autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('update:available')
})
autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update:downloaded')
})
autoUpdater.on('update-not-available', () => {
  mainWindow?.webContents.send('update:none')
})
autoUpdater.on('error', (error: Error, message?: string) => {
  mainWindow?.webContents.send('update:error', error?.message ?? message ?? String(error))
})
ipcMain.on('update:install', () => {
  if (app.getVersion().includes('-preview.')) return
  autoUpdater.quitAndInstall()
})
ipcMain.handle('update:check', async () => {
  if (process.env['ELECTRON_RENDERER_URL'] || app.getVersion().includes('-preview.')) {
    mainWindow?.webContents.send('update:none')
    return false
  }
  await autoUpdater.checkForUpdatesAndNotify()
  return true
})

// App info
ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:resourcesPath', () =>
  process.env['ELECTRON_RENDERER_URL']
    ? join(__dirname, '../../resources')  // dev: project resources/
    : process.resourcesPath               // prod: unpacked extraResources
)

ipcMain.handle('weeklyPlan:getMonth', (_, year: number, month: number, force = false) => {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error('주간계획 조회 연도가 올바르지 않습니다.')
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('주간계획 조회 월이 올바르지 않습니다.')
  }
  return getWeeklyPlanMonth(year, month, force === true)
})

ipcMain.handle('dutySchedule:getMonth', (_, year: number, month: number, teacherName: string, force = false) => {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error('지도 일정 조회 연도가 올바르지 않습니다.')
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('지도 일정 조회 월이 올바르지 않습니다.')
  }
  if (typeof teacherName !== 'string' || teacherName.trim().length > 20) {
    throw new Error('교사 이름이 올바르지 않습니다.')
  }
  return getDutyScheduleMonth(year, month, teacherName, force === true)
})

ipcMain.handle('creativeSchedule:getMonth', (_, year: number, month: number, force = false) => {
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('창의적체험활동 조회 날짜가 올바르지 않습니다.')
  }
  return getCreativeScheduleMonth(year, month, force === true)
})

const CURRICULUM_PDFS = {
  all: '2026-all-grades.pdf',
  grade1: '2026-grade-1.pdf',
  grade2: '2026-grade-2.pdf',
  grade3: '2026-grade-3.pdf',
} as const
type CurriculumPdfId = keyof typeof CURRICULUM_PDFS

function curriculumPdfPath(id: CurriculumPdfId) {
  const fileName = CURRICULUM_PDFS[id]
  if (!fileName) throw new Error('등록되지 않은 교육과정 편제표입니다.')
  const resourceRoot = process.env['ELECTRON_RENDERER_URL']
    ? join(__dirname, '../../resources')
    : process.resourcesPath
  const filePath = join(resourceRoot, 'curriculum', fileName)
  if (!existsSync(filePath)) throw new Error('교육과정 편제표 PDF를 찾을 수 없습니다.')
  return filePath
}

ipcMain.handle('curriculum:getPdfUrl', (_, id: CurriculumPdfId) =>
  pathToFileURL(curriculumPdfPath(id)).toString()
)

ipcMain.handle('curriculum:openPdf', (_, id: CurriculumPdfId) =>
  shell.openPath(curriculumPdfPath(id))
)

ipcMain.handle('curriculum:savePdf', async (_, id: CurriculumPdfId, defaultName: string) => {
  if (!mainWindow) return false
  const sourcePath = curriculumPdfPath(id)
  const safeName = basename(defaultName).replace(/[\\/:*?"<>|]/g, '_') || CURRICULUM_PDFS[id]
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: safeName,
    filters: [{ name: 'PDF 문서', extensions: ['pdf'] }],
  })
  if (result.canceled || !result.filePath) return false
  copyFileSync(sourcePath, result.filePath)
  return true
})

// 학교알리미 공개 평가계획 조회. 학생·교직원 정보는 받거나 전송하지 않는다.
ipcMain.handle('schoolinfo:searchSchools', (_, query: string, force = false) =>
  searchSchoolInfoSchools(query, force === true)
)
ipcMain.handle('schoolinfo:searchSchoolsByRegion', (_, sido: string, sgg: string, force = false) =>
  searchSchoolInfoSchoolsByRegion(sido, sgg, force === true)
)
ipcMain.handle('schoolinfo:getEvaluationPlan', (_, request: SchoolInfoEvaluationRequest) =>
  getSchoolInfoEvaluationPlan(request)
)
ipcMain.handle('schoolinfo:clearCache', () => clearSchoolInfoEvaluationCache())

// Auto-launch (Windows 시작 프로그램)
ipcMain.handle('app:getAutoLaunch', () => {
  return app.getLoginItemSettings().openAtLogin
})
ipcMain.handle('app:setAutoLaunch', (_, enable: boolean) => {
  setWidgetAutoLaunch(enable)
})

// Notifier IPC
ipcMain.handle('notifier:status', () => isMonitoringActive())
ipcMain.on('notifier:start', (_, cfg) => {
  if (mainWindow) startMonitoring(mainWindow, cfg)
})
ipcMain.on('notifier:stop', () => stopMonitoring())

// File dialog — open (single)
ipcMain.handle('dialog:openFile', async (_, filters: Electron.FileFilter[]) => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters ?? [{ name: '모든 파일', extensions: ['*'] }],
  })
  return result.canceled ? null : result.filePaths[0]
})

// File dialog — open (multiple)
ipcMain.handle('dialog:openFiles', async (_, filters: Electron.FileFilter[]) => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: filters ?? [{ name: '모든 파일', extensions: ['*'] }],
  })
  return result.canceled ? [] : result.filePaths
})

// File dialog — save many files into a chosen directory (bulk export)
ipcMain.handle('dialog:saveFilesToDir', async (_, files: { name: string; bytes: number[] }[]) => {
  if (!mainWindow) return 0
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return 0
  const dir = result.filePaths[0]
  let count = 0
  for (const f of files) {
    // I-8: basename으로 '..' path traversal 제거 후 특수문자 치환
    const safe = basename(f.name).replace(/[\\/:*?"<>|]/g, '_') || '_'
    try { writeFileSync(join(dir, safe), Buffer.from(f.bytes)); count++ } catch { /* skip */ }
  }
  return count
})

// File dialog — save
ipcMain.handle('dialog:saveFile', async (_, defaultName: string, buffer: number[]) => {
  if (!mainWindow) return false
  const extension = extname(defaultName).replace(/^\./, '').toLowerCase()
  const formatNames: Record<string, string> = {
    xlsx: 'Excel 파일', hwp: '한글 문서', hwpx: '한글 표준 문서', pdf: 'PDF 문서',
    csv: 'CSV 파일', json: 'JSON 파일', zip: 'ZIP 파일',
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      ...(extension ? [{ name: formatNames[extension] || `${extension.toUpperCase()} 파일`, extensions: [extension] }] : []),
      { name: '모든 파일', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePath) return false
  writeFileSync(result.filePath, Buffer.from(buffer))
  return true
})

// ── API 키 — safeStorage 암호화 저장 (Gemini / Claude / OpenAI / NEIS) ──────
// portal 비밀번호와 동일한 방식으로 OS DPAPI/Keychain 사용.
const API_KEY_NAMES = ['neisApiKey', 'neisSyncToken'] as const
type ApiKeyName = (typeof API_KEY_NAMES)[number]

function apiKeyStoreKey(name: ApiKeyName) { return `apikey:enc:${name}` }
function apiKeyFallbackKey(name: ApiKeyName) { return `apikey:plain:${name}` }

ipcMain.handle('apiKey:set', (_, name: ApiKeyName, value: string) => {
  if (!API_KEY_NAMES.includes(name)) throw new Error('허용되지 않는 키 이름')
  if (safeStorage.isEncryptionAvailable()) {
    store.set(apiKeyStoreKey(name), safeStorage.encryptString(value).toString('base64'))
    store.delete(apiKeyFallbackKey(name))
  } else {
    store.set(apiKeyFallbackKey(name), value)
  }
})
ipcMain.handle('apiKey:get', (_, name: ApiKeyName): string => {
  if (!API_KEY_NAMES.includes(name)) throw new Error('허용되지 않는 키 이름')
  if (safeStorage.isEncryptionAvailable()) {
    const b64 = store.get(apiKeyStoreKey(name), '') as string
    if (!b64) return store.get(apiKeyFallbackKey(name), '') as string
    try { return safeStorage.decryptString(Buffer.from(b64, 'base64')) } catch { return '' }
  }
  return store.get(apiKeyFallbackKey(name), '') as string
})
ipcMain.handle('apiKey:delete', (_, name: ApiKeyName) => {
  if (!API_KEY_NAMES.includes(name)) throw new Error('허용되지 않는 키 이름')
  store.delete(apiKeyStoreKey(name))
  store.delete(apiKeyFallbackKey(name))
})
ipcMain.handle('apiKey:getAll', (): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const name of API_KEY_NAMES) {
    if (safeStorage.isEncryptionAvailable()) {
      const b64 = store.get(apiKeyStoreKey(name), '') as string
      if (b64) {
        try { out[name] = safeStorage.decryptString(Buffer.from(b64, 'base64')); continue } catch { /* fall through */ }
      }
    }
    out[name] = store.get(apiKeyFallbackKey(name), '') as string
  }
  return out
})

// 교과세특 개별 인쇄기 — Windows 사용자 계정(DPAPI)으로 암호화된 PC 로컬 저장만 허용.
// 학교 공유 서비스나 일반 config 저장소에는 평문 학생 자료를 남기지 않는다.
const SUBJECT_REMARKS_STORE_KEY = 'subjectRemarks:encrypted:v1'
const SUBJECT_REMARKS_MAX_BYTES = 8_000_000

ipcMain.handle('subjectRemarks:set', (_, value: string) => {
  if (typeof value !== 'string') throw new Error('저장할 교과세특 자료 형식이 올바르지 않습니다.')
  if (Buffer.byteLength(value, 'utf8') > SUBJECT_REMARKS_MAX_BYTES) {
    throw new Error('교과세특 자료가 너무 큽니다. 8MB 이하의 나이스 파일을 사용해 주세요.')
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('이 PC에서 Windows 암호화 저장을 사용할 수 없어 학생 자료를 저장하지 않았습니다.')
  }
  store.set(SUBJECT_REMARKS_STORE_KEY, safeStorage.encryptString(value).toString('base64'))
})

ipcMain.handle('subjectRemarks:get', (): string => {
  const encrypted = store.get(SUBJECT_REMARKS_STORE_KEY, '') as string
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return ''
  }
})

ipcMain.handle('subjectRemarks:clear', () => {
  store.delete(SUBJECT_REMARKS_STORE_KEY)
})

// Portal certificate password — stored via OS safeStorage (Keychain / DPAPI)
ipcMain.handle('portal:setPassword', (_, password: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(password)
    store.set('portal:certPasswordEncrypted', encrypted.toString('base64'))
    store.delete('portal:certPasswordFallback')
  } else {
    store.set('portal:certPasswordFallback', password)
  }
})
ipcMain.handle('portal:getPassword', () => {
  if (safeStorage.isEncryptionAvailable()) {
    const b64 = store.get('portal:certPasswordEncrypted', '') as string
    if (!b64) return store.get('portal:certPasswordFallback', '') as string
    try { return safeStorage.decryptString(Buffer.from(b64, 'base64')) } catch { return '' }
  }
  return store.get('portal:certPasswordFallback', '') as string
})
ipcMain.handle('portal:clearPassword', () => {
  store.delete('portal:certPasswordEncrypted')
  store.delete('portal:certPasswordFallback')
})

// Document parse via kordoc (HWP/HWPX/PDF → Markdown)
ipcMain.handle('document:parseFile', async (_, filePath: string) => {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_READ_EXTS.has(ext)) throw new Error('허용되지 않는 파일 형식입니다.')
  const { parse } = await import('kordoc')
  const buf = readFileSync(filePath)
  return await parse(buf.buffer as ArrayBuffer)
})

// ── PDF 텍스트 추출 (opendataloader-pdf JAR 엔진) ─────────────────────────────
// kordoc 대비 정밀한 레이아웃 추출. Java 11+ 필요.
function resolveOpendataJar(): string {
  return process.env['ELECTRON_RENDERER_URL']
    ? join(__dirname, '../../resources/opendataloader-pdf-cli.jar')  // dev
    : join(process.resourcesPath, 'opendataloader-pdf-cli.jar')      // prod
}

// 출력 디렉토리에서 지정 확장자 파일을 재귀적으로 탐색
function findOutputFile(dir: string, ext: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findOutputFile(full, ext)
      if (nested) return nested
    } else if (entry.name.toLowerCase().endsWith('.' + ext)) {
      return full
    }
  }
  return null
}

// 실행파일 탐색: PATH(where) → 알려진 Python Scripts 경로
async function findExecutable(name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('where', [name], { timeout: 5000 })
    const first = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
    if (first && existsSync(first)) return first
  } catch { /* PATH에 없음 */ }
  const local = process.env['LOCALAPPDATA']
  if (local) {
    const base = join(local, 'Programs', 'Python')
    if (existsSync(base)) {
      for (const dir of readdirSync(base)) {
        for (const ext of ['.exe', '']) {
          const cand = join(base, dir, 'Scripts', name + ext)
          if (existsSync(cand)) return cand
        }
      }
    }
  }
  return null
}

const TESSERACT_DEFAULT = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'

// Java 설치 여부 확인
ipcMain.handle('pdf:checkJava', async () => {
  try {
    await execFileAsync('java', ['-version'], { timeout: 10000 })
    return true
  } catch {
    return false
  }
})

// OCR 도구(Hybrid 서버 / Tesseract) 설치 여부 확인
ipcMain.handle('pdf:checkOcrTools', async () => {
  const hybrid = await findExecutable('opendataloader-pdf-hybrid')
  let tesseract = await findExecutable('tesseract')
  if (!tesseract && existsSync(TESSERACT_DEFAULT)) tesseract = TESSERACT_DEFAULT
  return { hybrid: !!hybrid, tesseract: !!tesseract }
})

type ExtractFormat = 'text' | 'markdown' | 'json'
const EXT_MAP: Record<ExtractFormat, string> = { text: 'txt', markdown: 'md', json: 'json' }

// Hybrid 서버 헬스체크
function hybridHealthOk(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpGet({ host: 'localhost', port, path: '/health', timeout: 1500 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

const HYBRID_PORT = 5002

// Stage 2: Hybrid AI OCR (docling 서버 기동 → JAR --hybrid 호출)
// 스캔본 PDF 전용. hybridExe가 설치된 경우에만 호출.
async function runHybrid(
  jar: string, pdfPath: string, outDir: string,
  format: ExtractFormat, ext: string, hybridExe: string,
): Promise<string | null> {
  const server = spawn(hybridExe, ['--port', String(HYBRID_PORT), '--ocr-lang', 'ko'], {
    stdio: 'ignore',
    windowsHide: true,
  })
  try {
    // 서버 준비 대기 (최대 180초 — torch/docling 임포트 + 첫 실행 모델 로딩이 느림)
    let ready = false
    for (let i = 0; i < 180; i++) {
      if (await hybridHealthOk(HYBRID_PORT)) { ready = true; break }
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (!ready) return null

    // 첫 실행 시 OCR 모델 다운로드로 오래 걸릴 수 있어 timeout 10분
    await execFileAsync('java', [
      '-Dfile.encoding=UTF-8',
      '-Djava.awt.headless=true',
      '-jar', jar,
      pdfPath,
      '--output-dir', outDir,
      '--format', format,
      '--keep-line-breaks',
      '--hybrid', 'docling-fast',
      '--hybrid-url', `http://localhost:${HYBRID_PORT}`,
    ], { timeout: 600000, maxBuffer: 128 * 1024 * 1024 })

    const produced = findOutputFile(outDir, ext)
    if (!produced) return null
    const content = readFileSync(produced, 'utf-8')
    return content.trim().length >= 10 ? content : null
  } catch {
    return null
  } finally {
    try { server.kill() } catch { /* ignore */ }
  }
}

// 단일 PDF → 지정 형식 텍스트 추출
ipcMain.handle('pdf:extractDocument', async (_, filePath: string, format: ExtractFormat) => {
  const fileExt = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_READ_EXTS.has(fileExt)) return { success: false, error: '허용되지 않는 파일 형식입니다.' }
  const jar = resolveOpendataJar()
  if (!existsSync(jar)) return { success: false, error: `엔진(JAR)을 찾을 수 없습니다: ${jar}` }
  if (!existsSync(filePath)) return { success: false, error: '파일이 존재하지 않습니다.' }

  const ext = EXT_MAP[format] ?? 'txt'
  // 한글/비ASCII 경로 문제 회피: ASCII 임시 경로로 복사 후 처리
  const tmpIn = mkdtempSync(join(tmpdir(), 'pdfext_in_'))
  const tmpOut = mkdtempSync(join(tmpdir(), 'pdfext_out_'))
  try {
    const safeInput = join(tmpIn, 'doc.pdf')
    copyFileSync(filePath, safeInput)

    await execFileAsync('java', [
      '-Dfile.encoding=UTF-8',
      '-Dstdout.encoding=UTF-8',
      '-Dstderr.encoding=UTF-8',
      '-Djava.awt.headless=true',
      '-jar', jar,
      safeInput,
      '--output-dir', tmpOut,
      '--format', format,
      '--keep-line-breaks',
    ], { timeout: 300000, maxBuffer: 128 * 1024 * 1024 })

    const produced = findOutputFile(tmpOut, ext)
    if (!produced) return { success: false, error: '출력 파일이 생성되지 않았습니다.' }

    let content = readFileSync(produced, 'utf-8')
    let usedOcr = false

    // Stage 1 결과가 비어있으면(스캔본) Stage 2 Hybrid OCR 시도
    if (content.trim().length < 10) {
      const hybridExe = await findExecutable('opendataloader-pdf-hybrid')
      if (hybridExe) {
        const ocr = await runHybrid(jar, safeInput, tmpOut, format, ext, hybridExe)
        if (ocr != null) { content = ocr; usedOcr = true }
      }
      if (!usedOcr) {
        // OCR 미설치 또는 실패 → UI가 설치 안내 표시
        return { success: true, content, empty: true, usedOcr: false, ocrAvailable: !!hybridExe }
      }
    }
    return { success: true, content, empty: content.trim().length < 10, usedOcr }
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
    if (err.code === 'ENOENT') return { success: false, error: 'NO_JAVA' }
    const msg = (err.stderr || err.stdout || err.message || String(e)).trim()
    return { success: false, error: msg.slice(0, 500) }
  } finally {
    rmSync(tmpIn, { recursive: true, force: true })
    rmSync(tmpOut, { recursive: true, force: true })
  }
})

// PDF 텍스트 레이아웃 추출 (좌표 포함) — 생기부 결정적 파싱용.
// pdfjs를 직접 사용해 kordoc가 일부 PDFium 출력물을 image-based로 오판하는 문제를 우회한다.
ipcMain.handle('pdf:extractLayout', async (_, filePath: string) => {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_READ_EXTS.has(ext)) throw new Error('허용되지 않는 파일 형식입니다.')
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(readFileSync(filePath))
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false } as any).promise
    const pages: Array<{ page: number; w: number; h: number; items: Array<{ x: number; y: number; w: number; str: string }> }> = []
    let totalChars = 0
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const vp = page.getViewport({ scale: 1 })
      const tc = await page.getTextContent()
      const items: Array<{ x: number; y: number; w: number; str: string }> = []
      for (const it of tc.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
        const s = it.str
        if (!s || !s.trim() || !it.transform) continue
        items.push({
          x: Math.round(it.transform[4]),
          y: Math.round(vp.height - it.transform[5]),
          w: Math.round(it.width ?? 0),
          str: s,
        })
        totalChars += s.length
      }
      pages.push({ page: i, w: Math.round(vp.width), h: Math.round(vp.height), items })
    }
    await doc.cleanup()
    return { success: true, pages, totalChars, numPages: doc.numPages }
  } catch (e) {
    return { success: false, error: (e as Error).message, pages: [], totalChars: 0, numPages: 0 }
  }
})

// Read file contents as number array (for Excel import etc.)
ipcMain.handle('fs:readFile', (_, filePath: string) => {
  // I-2: path.resolve로 경로 정규화 후 확장자 재추출
  const abs = pathResolve(filePath)
  const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_READ_EXTS.has(ext)) throw new Error('허용되지 않는 파일 형식입니다.')
  const buf = readFileSync(abs)
  return Array.from(buf)
})

// Read file contents as base64 string (efficient for images → data URL)
ipcMain.handle('fs:readFileBase64', (_, filePath: string) => {
  // I-2: path.resolve로 경로 정규화 후 확장자 재추출
  const abs = pathResolve(filePath)
  const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_READ_EXTS.has(ext)) throw new Error('허용되지 않는 파일 형식입니다.')
  const buf = readFileSync(abs)
  return buf.toString('base64')
})

// 웅천고 공유 서비스 — Google Apps Script 웹 앱을 메인 프로세스에서 호출한다.
// 렌더러에는 임의 URL fetch 권한을 주지 않고, 환경설정에 저장된 Google 호스트만 허용한다.
const HUB_ACTIONS = new Set([
  'health',
  'getSyncManifest',
  'verifyAdmin',
  'listLinks',
  'addLink',
  'deleteLink',
  'listNotices',
  'addNotice',
  'deleteNotice',
  'listFeatureRequests',
  'addFeatureRequest',
  'updateFeatureRequest',
  'deleteFeatureRequest',
  'getTimetable',
  'replaceTimetable',
  'getStudentTimetable',
  'replaceStudentTimetable',
  'getStaffRoster',
  'replaceStaffRoster',
  'getStudentRoster',
  'replaceStudentRoster',
  'listStaffChecklists',
  'addStaffChecklist',
  'updateStaffChecklist',
  'submitStaffChecklist',
  'deleteStaffChecklist',
  'listCommitteeState',
  'saveCommitteeMembers',
  'addCommitteeEvent',
  'deleteCommitteeEvent',
  'listTimetableChanges',
  'createTimetableChange',
  'respondTimetableChange',
  'applyTimetableChangeForRequester',
  'cancelTimetableChange',
  'getNeisSyncStatus',
  'registerNeisSyncDevice',
  'revokeNeisSyncDevice',
  'getNeisSnapshot',
  'replaceNeisSnapshot',
])

// 학교 유선망은 외부 POST 요청만 별도로 차단하는 경우가 있어 조회 요청은 GET으로 보낸다.
// 조회는 재시도해도 서버 데이터가 바뀌지 않지만, 저장·수정 요청은 중복 반영을 막기 위해 재시도하지 않는다.
const HUB_READ_ACTIONS = new Set([
  'health',
  'getSyncManifest',
  'listLinks',
  'listNotices',
  'listFeatureRequests',
  'getTimetable',
  'getStudentTimetable',
  'getStaffRoster',
  'getStudentRoster',
  'listStaffChecklists',
  'listCommitteeState',
  'listTimetableChanges',
  'getNeisSyncStatus',
  'getNeisSnapshot',
])

const HUB_LARGE_DATA_ACTIONS = new Set([
  'getSyncManifest',
  'getStaffRoster',
  'listStaffChecklists',
  'addStaffChecklist',
  'updateStaffChecklist',
  'submitStaffChecklist',
  'deleteStaffChecklist',
  'replaceStudentTimetable',
  'replaceStudentRoster',
  'replaceStaffRoster',
  'replaceNeisSnapshot',
  'getStudentTimetable',
  'getStudentRoster',
  'listCommitteeState',
  'saveCommitteeMembers',
  'addCommitteeEvent',
  'deleteCommitteeEvent',
  'listTimetableChanges',
  'createTimetableChange',
  'respondTimetableChange',
  'applyTimetableChangeForRequester',
  'cancelTimetableChange',
  'getNeisSnapshot',
])

const waitForHubRetry = (delayMs: number) => new Promise(resolve => setTimeout(resolve, delayMs))

async function fetchSchoolHub(
  endpoint: string,
  payload: Record<string, unknown>,
  action: string,
  timeoutMs: number,
  forcePost = false,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (HUB_READ_ACTIONS.has(action) && !forcePost) {
      const url = new URL(endpoint)
      url.searchParams.set('action', action)
      url.searchParams.set('payload', JSON.stringify(payload))
      url.searchParams.set('_', String(Date.now()))
      const options = {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'Cache-Control': 'no-cache' },
      } as const
      const response = await net.fetch(url.toString(), options)
      if (response.status !== 404 && response.status !== 405) return response
      // Electron 네트워크 계층에서 Google 리디렉션이 404로 캐시된 경우가 있어
      // Node 네트워크 계층으로 동일한 고정 주소를 한 번 더 확인한다.
      try { return await fetch(url.toString(), options) }
      catch { return response }
    }

    const options = {
      method: 'POST',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(payload),
    } as const
    const response = await net.fetch(endpoint, options)
    if (!HUB_READ_ACTIONS.has(action) || (response.status !== 404 && response.status !== 405)) return response
    try { return await fetch(endpoint, options) }
    catch { return response }
  } finally {
    clearTimeout(timer)
  }
}

async function requestSchoolHub(payload: Record<string, unknown>) {
  const configuredEndpoint = store.get('config.schoolHubUrl', '')
  const endpointCandidates = getSchoolHubEndpointCandidates(configuredEndpoint)
  const action = String(payload.action ?? '')
  const largePayloadActions = new Set(['replaceStudentTimetable', 'replaceStudentRoster', 'replaceStaffRoster', 'replaceNeisSnapshot'])
  const maxRequestLength = largePayloadActions.has(action) ? 8_000_000 : 500_000
  if (JSON.stringify(payload).length > maxRequestLength) return { ok: false, error: '요청 데이터가 너무 큽니다.' }
  if (!HUB_ACTIONS.has(action)) return { ok: false, error: '허용되지 않는 요청입니다.' }

  const isReadAction = HUB_READ_ACTIONS.has(action)
  const maxAttempts = isReadAction ? 3 : 1
  const timeoutMs = HUB_LARGE_DATA_ACTIONS.has(action) ? 60_000 : 15_000
  let lastError = ''

  for (const [endpointIndex, endpoint] of endpointCandidates.entries()) {
    let parsed: URL
    try { parsed = new URL(endpoint) } catch {
      lastError = '공유 서비스 URL이 올바르지 않습니다.'
      continue
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com') {
      lastError = 'Google Apps Script HTTPS 배포 URL만 사용할 수 있습니다.'
      continue
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        let res = await fetchSchoolHub(endpoint, payload, action, timeoutMs)
        // 일부 학교망이나 Google 리디렉션 캐시에서 GET만 간헐적으로 404/405가
        // 발생할 수 있다. 조회 요청은 부작용이 없으므로 같은 요청을 POST로 한 번 더 확인한다.
        if (isReadAction && (res.status === 404 || res.status === 405)) {
          res = await fetchSchoolHub(endpoint, payload, action, timeoutMs, true)
        }
        if (res.ok) {
          const result = await res.json() as Record<string, unknown>
          if (endpointIndex > 0 && endpoint === UNGCHEON_SCHOOL_HUB_URL) {
            store.set('config.schoolHubUrl', UNGCHEON_SCHOOL_HUB_URL)
          }
          return result
        }

        lastError = `공유 서비스 HTTP ${res.status} (요청: ${action})`
        const obsoleteDeployment = res.status === 404 || res.status === 410
        if (obsoleteDeployment && endpointIndex < endpointCandidates.length - 1) break
        const canRetryStatus = res.status === 408 || res.status === 429 || res.status >= 500
        if (!isReadAction || !canRetryStatus || attempt === maxAttempts) break
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (!isReadAction || attempt === maxAttempts) break
      }

      await waitForHubRetry(attempt === 1 ? 350 : 900)
    }
  }

  return {
    ok: false,
    error: /abort|timeout/i.test(lastError)
      ? `학교 공유 서비스 응답이 지연되어 ${action || '요청'} 처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.${lastError ? ` (${lastError})` : ''}`
      : `학교 공유 서비스에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.${lastError ? ` (${lastError})` : ''}`,
  }
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    fitWidgetWindow()
    widgetWindow.show()
    widgetWindow.focus()
    return widgetWindow
  }
  const settings = widgetSettings()
  const size = widgetSize(settings.expanded, settings.preset)
  const workArea = Number.isFinite(settings.x) && Number.isFinite(settings.y)
    ? screen.getDisplayMatching({ x: Number(settings.x), y: Number(settings.y), ...size }).workArea
    : screen.getPrimaryDisplay().workArea
  const desiredX = Number.isFinite(settings.x) ? Number(settings.x) : workArea.x + workArea.width - size.width - 18
  const desiredY = Number.isFinite(settings.y) ? Number(settings.y) : workArea.y + 18
  const bounds = fitWidgetBounds({ ...size, x: desiredX, y: desiredY }, workArea, size.height)
  widgetRequestedHeight = size.height
  widgetWindow = new BrowserWindow({
    ...bounds,
    minWidth: Math.min(350, bounds.width), minHeight: Math.min(84, bounds.height),
    frame: false, transparent: true, backgroundColor: '#00000000', resizable: false,
    alwaysOnTop: settings.pinned, skipTaskbar: true, show: false, hasShadow: true,
    icon: process.env['ELECTRON_RENDERER_URL'] ? join(__dirname, '../../resources/icon.png') : join(process.resourcesPath, 'icon.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  widgetWindow.setOpacity(Math.max(0.65, Math.min(1, settings.opacity)))
  widgetWindow.once('ready-to-show', () => widgetWindow?.show())
  widgetWindow.on('moved', () => {
    if (!widgetWindow) return
    fitWidgetWindow()
    const [x, y] = widgetWindow.getPosition()
    store.set(WIDGET_SETTINGS_KEY, { ...widgetSettings(), x, y })
  })
  widgetWindow.on('close', event => {
    if (!isQuitting) { event.preventDefault(); widgetWindow?.hide() }
  })
  const refitOnDisplayChange = () => fitWidgetWindow()
  screen.on('display-metrics-changed', refitOnDisplayChange)
  screen.on('display-added', refitOnDisplayChange)
  screen.on('display-removed', refitOnDisplayChange)
  widgetWindow.on('closed', () => {
    screen.removeListener('display-metrics-changed', refitOnDisplayChange)
    screen.removeListener('display-added', refitOnDisplayChange)
    screen.removeListener('display-removed', refitOnDisplayChange)
    widgetWindow = null
    widgetRequestedHeight = 0
  })
  loadRenderer(widgetWindow, true)
  return widgetWindow
}

function showMainWindow(page = '') {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  const sendNavigation = () => {
    if (page && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:navigate', page)
    }
  }
  if (page && mainWindow?.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', sendNavigation)
  } else {
    sendNavigation()
  }
  mainWindow?.show()
  mainWindow?.focus()
}

function setWidgetAutoLaunch(enable: boolean) {
  if (process.env['ELECTRON_RENDERER_URL']) return
  app.setLoginItemSettings({ openAtLogin: enable, args: enable ? ['--widget'] : [] })
}

function createTray() {
  if (tray) return
  tray = new Tray(process.env['ELECTRON_RENDERER_URL'] ? join(__dirname, '../../resources/icon.png') : join(process.resourcesPath, 'icon.png'))
  tray.setToolTip('웅천고 업무도우미')
  const refresh = () => tray?.setContextMenu(Menu.buildFromTemplate([
    { label: '미니 위젯 열기', click: () => createWidgetWindow() },
    { label: '업무도우미 열기', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Windows 시작 시 위젯 자동 실행', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: item => { setWidgetAutoLaunch(item.checked); refresh() } },
    { type: 'separator' },
    { label: '완전 종료', click: () => { isQuitting = true; app.quit() } },
  ]))
  refresh()
  tray.on('double-click', () => createWidgetWindow())
}

ipcMain.handle('schoolHub:request', (_, payload: Record<string, unknown>) => requestSchoolHub(payload))
ipcMain.handle('schoolHubCache:getAll', () => readPersistentHubCache())
ipcMain.handle('schoolHubCache:set', (_, entry: PersistentHubCacheEntry) => {
  if (!entry || typeof entry.cacheKey !== 'string' || typeof entry.resource !== 'string') {
    throw new Error('로컬 캐시 자료 형식이 올바르지 않습니다.')
  }
  return writePersistentHubCache(entry)
})
ipcMain.handle('schoolHubCache:deleteResource', (_, resource: string) => {
  if (typeof resource !== 'string' || resource.length > 50) throw new Error('로컬 캐시 자료 종류가 올바르지 않습니다.')
  deletePersistentHubCacheResource(resource)
})
ipcMain.handle('schoolHubCache:clear', () => clearPersistentHubCache())
ipcMain.handle('schoolHubCache:status', () => persistentHubCacheStatus())

interface HubDiagnosticAttempt {
  ok: boolean
  status: number
  elapsedMs: number
  version: number | null
  error: string
}

async function diagnoseSchoolHubAttempt(endpoint: string, method: 'GET' | 'POST'): Promise<HubDiagnosticAttempt> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const url = new URL(endpoint)
    if (method === 'GET') {
      url.searchParams.set('action', 'health')
      url.searchParams.set('payload', JSON.stringify({ action: 'health' }))
      url.searchParams.set('_', String(Date.now()))
    }
    const response = await net.fetch(url.toString(), {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers: method === 'POST'
        ? { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-cache' }
        : { 'Cache-Control': 'no-cache' },
      body: method === 'POST' ? JSON.stringify({ action: 'health' }) : undefined,
    })
    const body = await response.json() as { ok?: boolean; data?: { version?: unknown }; error?: unknown }
    const ok = response.ok && body.ok === true
    return {
      ok,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      version: Number.isFinite(Number(body.data?.version)) ? Number(body.data?.version) : null,
      error: ok ? '' : String(body.error ?? `HTTP ${response.status}`),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      version: null,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function diagnoseSchoolHubRead(endpoint: string, action: string, payload: Record<string, unknown> = {}): Promise<HubDiagnosticAttempt> {
  const startedAt = Date.now()
  try {
    const result = await fetchSchoolHub(endpoint, { action, ...payload }, action, 30_000)
    const body = await result.json() as { ok?: boolean; error?: unknown }
    const ok = result.ok && body.ok === true
    return { ok, status: result.status, elapsedMs: Date.now() - startedAt, version: null, error: ok ? '' : String(body.error ?? `HTTP ${result.status}`) }
  } catch (error) {
    return { ok: false, status: 0, elapsedMs: Date.now() - startedAt, version: null, error: error instanceof Error ? error.message : String(error) }
  }
}

ipcMain.handle('schoolHub:diagnose', async () => {
  const endpoint = resolveSchoolHubEndpoint(store.get('config.schoolHubUrl', ''))
  let parsed: URL
  try { parsed = new URL(endpoint) } catch { throw new Error('학교 공유 서비스 URL이 올바르지 않습니다.') }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com') {
    throw new Error('Google Apps Script HTTPS 배포 URL만 진단할 수 있습니다.')
  }

  const get = await diagnoseSchoolHubAttempt(endpoint, 'GET')
  const post = await diagnoseSchoolHubAttempt(endpoint, 'POST')
  const teacherName = String(store.get('config.teacherName', '') || '').trim()
  const roster = await diagnoseSchoolHubRead(endpoint, 'getStaffRoster')
  const tasks = teacherName
    ? await diagnoseSchoolHubRead(endpoint, 'listStaffChecklists', { viewerName: teacherName })
    : { ok: false, status: 0, elapsedMs: 0, version: null, error: '환경설정 이름 미입력' }
  return { checkedAt: new Date().toISOString(), get, post, roster, tasks }
})

ipcMain.handle('notices:fetch', async () => {
  const result = await requestSchoolHub({ action: 'listNotices' }) as { ok?: boolean; data?: unknown }
  return result.ok && Array.isArray(result.data) ? result.data : []
})

// Weather fetch — main 프로세스에서 실행하여 CORS/렌더러 제한 우회
const WEATHER_ALLOWED_HOSTS = ['api.open-meteo.com', 'air-quality-api.open-meteo.com']
ipcMain.handle('weather:fetch', async (_, url: string) => {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error('유효하지 않은 URL') }
  if (!WEATHER_ALLOWED_HOSTS.includes(parsed.hostname)) throw new Error('허용되지 않는 날씨 API 호스트')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
})
