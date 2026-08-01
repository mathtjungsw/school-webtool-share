import { app, BrowserWindow, ipcMain, shell, nativeTheme, dialog, safeStorage, session } from 'electron'
import { join, resolve as pathResolve, basename } from 'path'
import { pathToFileURL } from 'url'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { execFile, spawn } from 'child_process'
import { get as httpGet } from 'http'
import { promisify } from 'util'
import { autoUpdater } from 'electron-updater'
import Store from 'electron-store'
import { startMonitoring, stopMonitoring, isMonitoringActive } from './notifier'
import { getWeeklyPlanMonth } from './weekly-plan'

const execFileAsync = promisify(execFile)

const store = new Store()

let mainWindow: BrowserWindow | null = null

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

  nativeTheme.themeSource = 'dark'

  // User-Agent에서 Electron 제거 — 구글 캘린더 등 Electron 차단 서비스 우회
  const chromeUA = mainWindow.webContents.getUserAgent()
    .replace(/Electron\/[\d.]+ /, '')
    .replace(/ electron\/[\d.]+/i, '')
  mainWindow.webContents.setUserAgent(chromeUA)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

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

  createWindow()

  // 프로덕션 빌드에서만 자동 업데이트 확인 + 자동 실행 기본값 적용
  if (!process.env['ELECTRON_RENDERER_URL']) {
    // app-update.yml이 손상되거나 누락된 설치본에서도 GitHub 공급자를 명시적으로 사용한다.
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'mathtjungsw',
      repo: 'school-webtool-share',
    })
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Window controls IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// Config IPC
// C-1: 허용 키 접두어 화이트리스트 — 렌더러가 임의 키를 주입하는 것을 방지
const ALLOWED_CONFIG_KEY_PREFIXES = [
  'config.', 'dashboard.', 'att:', 'scoregomoku.',
  'special_remarks:', 'exam_supervisor:', 'newSemClass:',
  'wr:', 'club:', 'photo:', 'insa:',
  'assessment:', 'feedback.', 'timetable_plan:',
  'personal.',
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
ipcMain.on('update:install', () => autoUpdater.quitAndInstall())
ipcMain.handle('update:check', async () => {
  if (process.env['ELECTRON_RENDERER_URL']) {
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

// Auto-launch (Windows 시작 프로그램)
ipcMain.handle('app:getAutoLaunch', () => {
  return app.getLoginItemSettings().openAtLogin
})
ipcMain.handle('app:setAutoLaunch', (_, enable: boolean) => {
  if (process.env['ELECTRON_RENDERER_URL']) return  // dev 환경에서는 잘못된 경로 등록 방지
  app.setLoginItemSettings({ openAtLogin: enable })
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
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: 'Excel 파일', extensions: ['xlsx'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePath) return false
  writeFileSync(result.filePath, Buffer.from(buffer))
  return true
})

// ── API 키 — safeStorage 암호화 저장 (Gemini / Claude / OpenAI / NEIS) ──────
// portal 비밀번호와 동일한 방식으로 OS DPAPI/Keychain 사용.
const API_KEY_NAMES = ['neisApiKey'] as const
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
  'submitStaffChecklist',
  'deleteStaffChecklist',
  'listCommitteeState',
  'saveCommitteeMembers',
  'addCommitteeEvent',
  'deleteCommitteeEvent',
])

async function requestSchoolHub(payload: Record<string, unknown>) {
  const endpoint = String(store.get('config.schoolHubUrl', '')).trim()
  if (!endpoint) return { ok: false, error: '학교 공유 서비스 URL이 설정되지 않았습니다.' }
  const action = String(payload.action ?? '')
  const largePayloadActions = new Set([
    'replaceStudentTimetable',
    'replaceStudentRoster',
    'replaceStaffRoster',
  ])
  const maxRequestLength = largePayloadActions.has(action) ? 8_000_000 : 500_000
  if (JSON.stringify(payload).length > maxRequestLength) return { ok: false, error: '요청 데이터가 너무 큽니다.' }
  if (!HUB_ACTIONS.has(action)) return { ok: false, error: '허용되지 않는 요청입니다.' }

  let parsed: URL
  try { parsed = new URL(endpoint) } catch { return { ok: false, error: '공유 서비스 URL이 올바르지 않습니다.' } }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com') {
    return { ok: false, error: 'Google Apps Script HTTPS 배포 URL만 사용할 수 있습니다.' }
  }

  const controller = new AbortController()
  const isLargeDataAction = largePayloadActions.has(action) ||
    action === 'getStudentTimetable' ||
    action === 'getStudentRoster' ||
    action === 'listCommitteeState' ||
    action === 'saveCommitteeMembers' ||
    action === 'addCommitteeEvent' ||
    action === 'deleteCommitteeEvent'
  const timer = setTimeout(() => controller.abort(), isLargeDataAction ? 60_000 : 20_000)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { ok: false, error: `공유 서비스 HTTP ${res.status}` }
    return await res.json() as Record<string, unknown>
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

ipcMain.handle('schoolHub:request', (_, payload: Record<string, unknown>) => requestSchoolHub(payload))

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
