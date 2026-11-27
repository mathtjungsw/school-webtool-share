import { app, BrowserWindow, net, safeStorage, session, shell, WebContentsView } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

declare const __CAREER_SCHOOL_ORIGIN__: string
declare const __YAJA_SCHOOL_ORIGIN__: string

const services = {
  seoga: { title: '웅천 서가 시험판', hosted: '', local: 'UNGCHEON_SEOGA_LOCAL_ORIGIN' },
  career: { title: '진로검사', hosted: __CAREER_SCHOOL_ORIGIN__, local: 'UNGCHEON_CAREER_LOCAL_ORIGIN' },
  yaja: { title: '야자 도장판', hosted: __YAJA_SCHOOL_ORIGIN__, local: 'UNGCHEON_YAJA_LOCAL_ORIGIN' },
}

function schoolOrigin(service: keyof typeof services) {
  const { title, hosted, local } = services[service]
  const localOverride = !app.isPackaged && process.env[local]
  const raw = localOverride || hosted
  if (!raw) throw Error(`${title} 학교 운영 주소가 아직 설정되지 않았습니다.`)
  const url = new URL(raw)
  const valid = !localOverride ? url.protocol === 'https:' :
    !app.isPackaged && url.protocol === 'http:' && url.hostname === '127.0.0.1'
  if (!valid || url.href !== url.origin + '/') throw Error(`학교 ${title} 주소를 확인해 주세요.`)
  return url.origin
}

type Staff = {
  snapshot: () => { authenticated: boolean; teacherName: string; expiresAt: string }
  sessionGeneration: () => number
  request: (payload: Record<string, unknown>) => Promise<any>
}

// Use Chromium networking for the school proxy. Cookies and device credentials stay
// inside the main process. Never follow a redirect carrying a PIN or binding.
function call(origin: string, endpoint: string, name: string, p: object, cookie = '') {
  return new Promise<{ data: Record<string, unknown>; cookie: string }>((resolve, reject) => {
    const req = net.request({ url: origin + endpoint, method: 'POST', redirect: 'error', useSessionCookies: false })
    const timeout = setTimeout(() => { req.abort(); reject(Error('학교 서버 응답이 지연되었습니다.')) }, 30000)
    const fail = () => { clearTimeout(timeout); reject(Error('학교 서버에 연결하지 못했습니다.')) }
    req.on('error', fail)
    req.setHeader('Content-Type', 'application/json')
    req.setHeader('Origin', origin)
    if (cookie) req.setHeader('Cookie', 'ct_tok=' + cookie)
    req.on('response', res => {
      const body: Buffer[] = []
      let length = 0
      res.on('error', fail)
      res.on('aborted', fail)
      res.on('data', (chunk: Buffer) => {
        length += chunk.length
        if (length > 32768) { req.abort(); fail(); return }
        body.push(chunk)
      })
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          if (res.statusCode !== 200) throw Error()
          const header = res.headers['set-cookie']
          const values = Array.isArray(header) ? header : [header || '']
          const cookie = values.map(h => /^ct_tok=([\w.-]+);/.exec(h)?.[1]).find(Boolean) || ''
          resolve({ data: JSON.parse(Buffer.concat(body).toString('utf8')), cookie })
        } catch { fail() }
      })
    })
    req.end(JSON.stringify({ name, p }))
  })
}

export function createSchoolDesktop(main: () => BrowserWindow | null, staff: Staff, service: keyof typeof services) {
  const title = services[service].title
  let view: WebContentsView | undefined
  let generation = 0
  let expiry: ReturnType<typeof setTimeout> | undefined
  let revoke: (() => void) | undefined
  const close = () => {
    generation++
    clearTimeout(expiry)
    if (view && !view.webContents.isDestroyed()) {
      const partition = view.webContents.session
      main()?.contentView.removeChildView(view)
      view.webContents.close()
      void partition.clearStorageData().catch(() => undefined)
    }
    view = undefined
    revoke?.()
    revoke = undefined
  }

  const connect = async (action: 'open' | 'forget', pin?: string) => {
    close()
    const turn = generation, login = staff.sessionGeneration(), identity = staff.snapshot()
    const current = () => turn === generation && login === staff.sessionGeneration() && staff.snapshot().authenticated && identity.teacherName === staff.snapshot().teacherName
    if (!current()) throw Error('업무도우미에 로그인해 주세요.')
    const origin = schoolOrigin(service)
    const endpoint = service === 'seoga' ? '/api/school' : '/api/call'
    if (!safeStorage.isEncryptionAvailable()) throw Error('이 PC에서 Windows 암호화 저장소를 사용할 수 없습니다.')
    const dir = join(app.getPath('userData'), service + '-devices')
    const file = join(dir, createHash('sha256').update(JSON.stringify([origin, identity.teacherName])).digest('hex') + '.bin')
    let device = ''
    if (existsSync(file)) {
      try { device = safeStorage.decryptString(readFileSync(file)) } catch { rmSync(file, { force: true }) }
    }
    const name = identity.teacherName
    if (action === 'forget') {
      if (device) {
        const { data } = await call(origin, endpoint, 'desktopUnpair', { name, device })
        if (data.ok !== true) throw Error('연결을 해제하지 못했습니다. 다시 시도해 주세요.')
      }
      if (current()) rmSync(file, { force: true })
      return { state: 'pin' }
    }
    if (!device && !pin) return { state: 'pin' }
    const verified = await staff.request({ action: 'staffSession' })
    const until = Math.min(Date.parse(verified?.expiresAt), Date.parse(identity.expiresAt))
    if (!current() || verified?.name !== name || !(until > Date.now())) throw Error('업무도우미 로그인을 다시 확인해 주세요.')
    const { data, cookie } = await call(origin, endpoint, 'desktopLogin', { name, until, ...(device ? { device } : { pin }) })
    const logout = () => { if (cookie) void call(origin, endpoint, 'logout', {}, cookie).catch(() => undefined) }
    if (!current()) { logout(); throw Error('로그인이 변경되었습니다.') }
    if (data.code === 'PAIR') { rmSync(file, { force: true }); return { state: 'pin', message: String(data.error) } }
    if (data.error) return { state: device || data.code === 'SETUP' ? 'error' : 'pin', message: String(data.error) }
    if (!cookie || data.role !== 'teacher' || (!device && !/^[\w-]{43}$/.test(String(data.device || '')))) { logout(); throw Error(`${title} 교사 인증을 확인하지 못했습니다.`) }
    revoke = logout
    try {
      if (!device) {
        mkdirSync(dir, { recursive: true })
        writeFileSync(file + '.tmp', safeStorage.encryptString(String(data.device)))
        renameSync(file + '.tmp', file)
      }
      const ses = session.fromPartition(service + '-' + randomUUID(), { cache: false })
      ses.setPermissionRequestHandler((_w, _p, cb) => cb(false))
      await ses.cookies.set({ url: origin, name: 'ct_tok', value: cookie, path: '/', secure: origin.startsWith('https:'), httpOnly: true, sameSite: 'strict' })
      const window = main()
      if (!current() || !window || window.isDestroyed() || until <= Date.now()) throw Error(`${title} 연결이 종료되었습니다.`)
      const guest = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
      view = guest
      guest.setVisible(false)
      window.contentView.addChildView(guest)
      const restrict = (e: Electron.Event, target: string) => { if (new URL(target).origin !== origin) e.preventDefault() }
      guest.webContents.on('will-navigate', restrict)
      guest.webContents.on('will-redirect', restrict)
      guest.webContents.setWindowOpenHandler(({ url }) => {
        const target = new URL(url)
        if (target.protocol === 'https:' || (target.origin === origin && target.protocol === 'http:')) void shell.openExternal(target.href).catch(() => undefined)
        return { action: 'deny' }
      })
      expiry = setTimeout(close, until - Date.now())
      await guest.webContents.loadURL(origin + (service === 'seoga' ? '/school' : '/?desktop=1'))
      if (!current()) throw Error(`${title} 연결이 종료되었습니다.`)
      return { state: 'ready' }
    } catch (error) {
      if (turn === generation) close()
      throw error
    }
  }
  return { close, connect, currentView: () => staff.snapshot().authenticated ? view : undefined }
}
