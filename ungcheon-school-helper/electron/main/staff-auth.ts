import { app, ipcMain, safeStorage, BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { fetchStaffJson } from './staff-transport'
export function createStaffAuth(endpoint: () => string, trusted: (event: Electron.IpcMainInvokeEvent) => boolean) {
  let state: { name: string; expiresAt: string; token: string } | null = null
  let retryRequired = false
  let restoring: Promise<ReturnType<typeof snapshot>> | undefined
  let generation = 0
  const changes = new Set<() => void>()
  const path = join(app.getPath('userData'), 'staff-session.bin')
  const snapshot = () => ({ retryRequired, authenticated: !!state && Date.parse(state.expiresAt) > Date.now(), teacherName: state?.name || '', expiresAt: state?.expiresAt || '' })
  const broadcast = () => {
    changes.forEach(fn => fn())
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('auth:changed'))
  }
  const call = async (payload: Record<string, unknown>) => {
    const started = generation
    const result = await fetchStaffJson(endpoint(), payload)
    if (!result.ok) { if (started === generation && (result.code === 'AUTH_REQUIRED' || String(result.error || '').startsWith('AUTH_REQUIRED'))) clear(); throw new Error(result.error || '인증을 확인할 수 없습니다.') }
    return result.data
  }
  const clear = () => { generation++; retryRequired = false; state = null; if (existsSync(path)) unlinkSync(path); broadcast() }
  const authorizedRequest = async (payload: Record<string, unknown>) => {
    if (!snapshot().authenticated || !state) { if (state) clear(); throw new Error('로그인이 필요합니다.') }
    return call({ ...payload, staffToken: state.token })
  }
  ipcMain.handle('staff:auth', async (event, action: string, args: any = {}) => {
    if (!trusted(event)) throw new Error('허용되지 않은 화면입니다.')
    if (action === 'snapshot') return snapshot()
    if (action === 'login') {
      const current = ++generation
      const result = await call({ action: 'staffLogin', name: String(args.name || '').trim(), password: String(args.password || '') })
      if (generation !== current) throw new Error('인증이 취소되었습니다.')
      retryRequired = false
      state = result
      generation++
      if (safeStorage.isEncryptionAvailable()) { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(path, safeStorage.encryptString(JSON.stringify(state))) }
      broadcast(); return snapshot()
    }
    if (action === 'restore') {
      if (snapshot().authenticated) return snapshot()
      if (restoring) return restoring
      const current = generation
      restoring = (async () => {
        if (!existsSync(path)) return snapshot()
        let candidate: NonNullable<typeof state>
        try {
          candidate = JSON.parse(safeStorage.decryptString(readFileSync(path)))
          if (!candidate?.token || !candidate.name || !(Date.parse(candidate.expiresAt) > Date.now())) throw Error()
        } catch { clear(); return snapshot() }
        try {
          const result = await call({ action: 'staffSession', staffToken: candidate.token })
          if (generation !== current) return snapshot()
          const end = Math.min(Date.parse(result.expiresAt), Date.parse(candidate.expiresAt))
          if (result.name !== candidate.name || !(end > Date.now())) { clear(); return snapshot() }
          state = { ...candidate, expiresAt: new Date(end).toISOString() }
          retryRequired = false
        } catch {
          if (generation === current && Date.parse(candidate.expiresAt) > Date.now()) retryRequired = true
          else if (generation === current) clear()
        }
        return snapshot()
      })()
      try { return await restoring } finally { restoring = undefined }
    }
    if (action === 'logout') { const token = state?.token; clear(); if (token) await call({ action: 'staffLogout', staffToken: token }).catch(() => undefined); return snapshot() }
    throw new Error('허용되지 않은 인증 요청입니다.')
  })
  return { snapshot, onChange: (fn: () => void) => changes.add(fn), sessionGeneration: () => generation, request: authorizedRequest, clear, authorizePayload: (payload: Record<string, unknown>) => { if (!snapshot().authenticated || !state) throw new Error('로그인이 필요합니다.'); return { ...payload, staffToken: state.token } } }
}
