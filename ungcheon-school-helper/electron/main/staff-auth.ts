import { app, ipcMain, safeStorage, BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
export function createStaffAuth(endpoint: () => string, trusted: (event: Electron.IpcMainInvokeEvent) => boolean) {
  let state: { name: string; expiresAt: string; token: string } | null = null
  let generation = 0
  const path = join(app.getPath('userData'), 'staff-session.bin')
  const snapshot = () => ({ authenticated: !!state && Date.parse(state.expiresAt) > Date.now(), teacherName: state?.name || '', expiresAt: state?.expiresAt || '' })
  const broadcast = () => BrowserWindow.getAllWindows().forEach(w => w.webContents.send('auth:changed'))
  const call = async (payload: Record<string, unknown>) => {
    const response = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(payload.action==='caseDocument'?90000:35000) })
    const result = await response.json() as any
    if (!result.ok) { if (result.code === 'AUTH_REQUIRED' || String(result.error || '').startsWith('AUTH_REQUIRED')) clear(); throw new Error(result.error || '인증을 확인할 수 없습니다.') }
    return result.data
  }
  const clear = () => { generation++; state = null; if (existsSync(path)) unlinkSync(path); broadcast() }
  const authorizedRequest = async (payload: Record<string, unknown>) => {
    if (!snapshot().authenticated || !state) { clear(); throw new Error('로그인이 필요합니다.') }
    return call({ ...payload, staffToken: state.token })
  }
  ipcMain.handle('staff:auth', async (event, action: string, args: any = {}) => {
    if (!trusted(event)) throw new Error('허용되지 않은 화면입니다.')
    if (action === 'snapshot') return snapshot()
    if (action === 'login') {
      const current = ++generation
      const result = await call({ action: 'staffLogin', name: String(args.name || '').trim(), password: String(args.password || '') })
      if (generation !== current) throw new Error('인증이 취소되었습니다.')
      state = result
      if (safeStorage.isEncryptionAvailable()) { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(path, safeStorage.encryptString(JSON.stringify(state))) }
      broadcast(); return snapshot()
    }
    if (action === 'restore') {
      const current = ++generation
      try {
        if (!state && existsSync(path) && safeStorage.isEncryptionAvailable()) state = JSON.parse(safeStorage.decryptString(readFileSync(path)))
        if (!state) return snapshot()
        const result = await authorizedRequest({ action: 'staffSession' })
        if (generation !== current) return snapshot()
        state = { ...state, ...result }; return snapshot()
      } catch { clear(); return snapshot() }
    }
    if (action === 'logout') { const token = state?.token; clear(); if (token) await call({ action: 'staffLogout', staffToken: token }).catch(() => undefined); return snapshot() }
    throw new Error('허용되지 않은 인증 요청입니다.')
  })
  return { snapshot, request: authorizedRequest, clear, authorizePayload: (payload: Record<string, unknown>) => { if (!snapshot().authenticated || !state) throw new Error('로그인이 필요합니다.'); return { ...payload, staffToken: state.token } } }
}
