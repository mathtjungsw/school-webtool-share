import { contextBridge, ipcRenderer } from 'electron'
import type { WidgetSettingsPatch } from '../../src/services/widgetSettings'

contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Config
  configGet: (key: string) => ipcRenderer.invoke('config:get', key),
  configSet: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  configSetMany: (patch: Record<string, unknown>) => ipcRenderer.invoke('config:setMany', patch),
  configGetAll: () => ipcRenderer.invoke('config:getAll'),
  configDelete: (key: string) => ipcRenderer.invoke('config:delete', key),

  // API 키 (safeStorage 암호화)
  apiKeySet: (name: string, value: string) => ipcRenderer.invoke('apiKey:set', name, value),
  apiKeyGet: (name: string): Promise<string> => ipcRenderer.invoke('apiKey:get', name),
  apiKeyDelete: (name: string) => ipcRenderer.invoke('apiKey:delete', name),
  apiKeyGetAll: (): Promise<Record<string, string>> => ipcRenderer.invoke('apiKey:getAll'),

  // 교과세특 개별 인쇄기 (OS safeStorage 암호화 로컬 저장)
  subjectRemarksSet: (value: string) => ipcRenderer.invoke('subjectRemarks:set', value),
  subjectRemarksGet: (): Promise<string> => ipcRenderer.invoke('subjectRemarks:get'),
  subjectRemarksClear: () => ipcRenderer.invoke('subjectRemarks:clear'),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Updates
  onUpdateAvailable: (cb: () => void) => {
    ipcRenderer.on('update:available', cb)
    return () => ipcRenderer.removeListener('update:available', cb)
  },
  onUpdateDownloaded: (cb: () => void) => {
    ipcRenderer.on('update:downloaded', cb)
    return () => ipcRenderer.removeListener('update:downloaded', cb)
  },
  onUpdateNone: (cb: () => void) => {
    ipcRenderer.on('update:none', cb)
    return () => ipcRenderer.removeListener('update:none', cb)
  },
  onUpdateError: (cb: (msg: string) => void) => {
    const h = (_: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('update:error', h)
    return () => ipcRenderer.removeListener('update:error', h)
  },
  installUpdate: () => ipcRenderer.send('update:install'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),

  // Notifier
  notifierStart: (cfg: unknown) => ipcRenderer.send('notifier:start', cfg),
  notifierStop: () => ipcRenderer.send('notifier:stop'),
  notifierStatus: () => ipcRenderer.invoke('notifier:status'),
  onNotifierResult: (cb: (result: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, r: unknown) => cb(r)
    ipcRenderer.on('notifier:result', handler)
    return () => ipcRenderer.removeListener('notifier:result', handler)
  },

  // File dialogs
  openFileDialog: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke('dialog:openFile', filters),
  openFilesDialog: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke('dialog:openFiles', filters),
  saveFileDialog: (defaultName: string, buffer: number[]) =>
    ipcRenderer.invoke('dialog:saveFile', defaultName, buffer),
  saveFilesToDir: (files: { name: string; bytes: number[] }[]) =>
    ipcRenderer.invoke('dialog:saveFilesToDir', files),
  buildTimetablePlanHwp: (draft: unknown): Promise<number[]> =>
    ipcRenderer.invoke('timetablePlan:buildHwp', draft),
  buildVolunteerHwp: (draft: unknown): Promise<number[]> =>
    ipcRenderer.invoke('volunteer:buildHwp', draft),
  buildClassVolunteerHwpx: (draft: unknown): Promise<number[]> =>
    ipcRenderer.invoke('volunteer:buildClassHwpx', draft),
  buildClassVolunteerPdf: (draft: unknown): Promise<number[]> =>
    ipcRenderer.invoke('volunteer:buildClassPdf', draft),
  buildCoordinatorVolunteerPdf: (draft: unknown): Promise<number[]> =>
    ipcRenderer.invoke('volunteer:buildCoordinatorPdf', draft),
  printClassVolunteer: (draft: unknown): Promise<boolean> =>
    ipcRenderer.invoke('volunteer:printClass', draft),
  storeGeneratedVolunteerHwp: (name: string, bytes: number[]) =>
    ipcRenderer.invoke('volunteer:storeGeneratedHwp', name, bytes),
  storeGeneratedVolunteerForms: (title: string, forms: unknown[]) =>
    ipcRenderer.invoke('volunteer:storeGeneratedForms', title, forms),
  importVolunteerHwp: (filePath: string, allowDuplicate = false) => ipcRenderer.invoke('volunteer:importHwp', filePath, allowDuplicate),
  listVolunteerHwp: () => ipcRenderer.invoke('volunteer:listHwp'),
  parseVolunteerHwp: (id: string) => ipcRenderer.invoke('volunteer:parseHwp', id),
  updateVolunteerForms: (id: string, forms: unknown[], title?: string) => ipcRenderer.invoke('volunteer:updateForms', id, forms, title),
  openVolunteerHwp: (id: string) => ipcRenderer.invoke('volunteer:openHwp', id),
  deleteVolunteerHwp: (id: string) => ipcRenderer.invoke('volunteer:deleteHwp', id),

  // Document parser (kordoc)
  parseDocument: (filePath: string) =>
    ipcRenderer.invoke('document:parseFile', filePath),

  // PDF 텍스트 추출 (opendataloader-pdf JAR 엔진)
  checkJava: (): Promise<boolean> => ipcRenderer.invoke('pdf:checkJava'),
  checkOcrTools: () => ipcRenderer.invoke('pdf:checkOcrTools'),
  extractDocument: (filePath: string, format: 'text' | 'markdown' | 'json') =>
    ipcRenderer.invoke('pdf:extractDocument', filePath, format),

  // PDF 좌표 레이아웃 추출 (생기부 결정적 파싱)
  extractPdfLayout: (filePath: string) =>
    ipcRenderer.invoke('pdf:extractLayout', filePath),

  // File read (returns number[] for Excel import etc.)
  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath),
  readFileBase64: (filePath: string) =>
    ipcRenderer.invoke('fs:readFileBase64', filePath),

  // Portal certificate password (OS safeStorage)
  portalSetPassword: (password: string) => ipcRenderer.invoke('portal:setPassword', password),
  portalGetPassword: (): Promise<string> => ipcRenderer.invoke('portal:getPassword'),
  portalClearPassword: () => ipcRenderer.invoke('portal:clearPassword'),

  // Weather — 메인 프로세스에서 fetch하여 CORS 우회
  fetchWeather: (url: string) => ipcRenderer.invoke('weather:fetch', url),

  // 공지사항 — 원격 JSON을 메인 프로세스에서 fetch (실패/미존재 시 빈 배열 반환)
  fetchNotices: () => ipcRenderer.invoke('notices:fetch'),

  // 웅천고 공지·부서별 공유 링크
  schoolHubRequest: (request: Record<string, unknown>) =>
    ipcRenderer.invoke('schoolHub:request', request),
  schoolHubDiagnose: () => ipcRenderer.invoke('schoolHub:diagnose'),
  schoolHubCacheGetAll: () => ipcRenderer.invoke('schoolHubCache:getAll'),
  schoolHubCacheSet: (entry: unknown) => ipcRenderer.invoke('schoolHubCache:set', entry),
  schoolHubCacheDeleteResource: (resource: string) => ipcRenderer.invoke('schoolHubCache:deleteResource', resource),
  schoolHubCacheClear: () => ipcRenderer.invoke('schoolHubCache:clear'),
  schoolHubCacheStatus: () => ipcRenderer.invoke('schoolHubCache:status'),

  // Auto-launch
  getAutoLaunch: (): Promise<boolean> => ipcRenderer.invoke('app:getAutoLaunch'),
  setAutoLaunch: (enable: boolean) => ipcRenderer.invoke('app:setAutoLaunch', enable),

  // Desktop mini dashboard widget
  showWidget: (): Promise<boolean> => ipcRenderer.invoke('widget:show'),
  hideWidget: (): Promise<boolean> => ipcRenderer.invoke('widget:hide'),
  widgetGetSettings: () => ipcRenderer.invoke('widget:getSettings'),
  widgetUpdateSettings: (patch: WidgetSettingsPatch & Record<string, unknown>) => ipcRenderer.invoke('widget:updateSettings', patch),
  widgetFitHeight: (height: number): Promise<boolean> => ipcRenderer.invoke('widget:fitHeight', height),
  widgetOpenMain: (page = ''): Promise<boolean> => ipcRenderer.invoke('widget:openMain', page),
  onWidgetSettingsChanged: (cb: (settings: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, settings: unknown) => cb(settings)
    ipcRenderer.on('widget:settingsChanged', handler)
    return () => ipcRenderer.removeListener('widget:settingsChanged', handler)
  },
  notifyAuthChanged: () => ipcRenderer.send('auth:changed'),
  onAuthChanged: (cb: () => void) => {
    ipcRenderer.on('auth:changed', cb)
    return () => ipcRenderer.removeListener('auth:changed', cb)
  },
  onNavigateRequest: (cb: (page: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, page: string) => cb(page)
    ipcRenderer.on('app:navigate', handler)
    return () => ipcRenderer.removeListener('app:navigate', handler)
  },

  // Resources path (for bundled static HTML tools)
  getResourcesPath: (): Promise<string> => ipcRenderer.invoke('app:resourcesPath'),

  // 교무기획부 웅천고 주간계획
  weeklyPlanGetMonth: (year: number, month: number, force = false) =>
    ipcRenderer.invoke('weeklyPlan:getMonth', year, month, force),

  // 인성안전부 등교지도·문화건강부 급식지도
  dutyScheduleGetMonth: (year: number, month: number, teacherName: string, force = false) =>
    ipcRenderer.invoke('dutySchedule:getMonth', year, month, teacherName, force),

  creativeScheduleGetMonth: (year: number, month: number, force = false) =>
    ipcRenderer.invoke('creativeSchedule:getMonth', year, month, force),

  // 교육과정 편제표 PDF
  curriculumGetPdfUrl: (id: 'all' | 'grade1' | 'grade2' | 'grade3') =>
    ipcRenderer.invoke('curriculum:getPdfUrl', id),
  curriculumOpenPdf: (id: 'all' | 'grade1' | 'grade2' | 'grade3') =>
    ipcRenderer.invoke('curriculum:openPdf', id),
  curriculumSavePdf: (
    id: 'all' | 'grade1' | 'grade2' | 'grade3',
    defaultName: string,
  ): Promise<boolean> => ipcRenderer.invoke('curriculum:savePdf', id, defaultName),

  // 학교알리미 공개 평가계획(개인정보를 전송하지 않는 읽기 전용 연동)
  schoolInfoSearchSchools: (query: string, force = false) =>
    ipcRenderer.invoke('schoolinfo:searchSchools', query, force),
  schoolInfoSearchSchoolsByRegion: (sido: string, sgg: string, force = false) =>
    ipcRenderer.invoke('schoolinfo:searchSchoolsByRegion', sido, sgg, force),
  schoolInfoGetEvaluationPlan: (request: unknown) =>
    ipcRenderer.invoke('schoolinfo:getEvaluationPlan', request),
  schoolInfoClearCache: () => ipcRenderer.invoke('schoolinfo:clearCache'),
})
