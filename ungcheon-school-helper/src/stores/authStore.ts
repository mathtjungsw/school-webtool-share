import { create } from 'zustand'
import { clearSchoolHubSessionCache, getSharedStaffRoster, preloadSchoolHubCache, verifyExecutive, type ExecutiveRole } from '../services/schoolHub'
import { useAppStore } from './appStore'

const SESSION_NAME_KEY = 'pilotLogin.teacherName'
const SESSION_EXPIRES_KEY = 'pilotLogin.expiresAt'
const SESSION_HOURS = 120

interface AuthState {
  ready: boolean
  authenticated: boolean
  teacherName: string
  expiresAt: string
  error: string
  loading: boolean
  executiveRole: ExecutiveRole | null
  executiveAccessToken: string
  executiveExpiresAt: string
  bootstrap: () => Promise<void>
  login: (name: string, password: string) => Promise<boolean>
  unlockExecutive: (password: string) => Promise<boolean>
  lockExecutive: () => void
  logout: () => Promise<void>
}

export function executiveRoleForName(name: string): ExecutiveRole | null {
  if (name.trim() === '류희열') return 'principal'
  if (name.trim() === '이승훈') return 'vicePrincipal'
  return null
}

function isFuture(value: unknown) {
  const timestamp = Date.parse(String(value ?? ''))
  return Number.isFinite(timestamp) && timestamp > Date.now()
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  authenticated: false,
  teacherName: '',
  expiresAt: '',
  error: '',
  loading: false,
  executiveRole: null,
  executiveAccessToken: '',
  executiveExpiresAt: '',

  bootstrap: async () => {
    try { const result = await window.preview.auth('restore'); if (result.authenticated) await useAppStore.getState().loadConfig(); set({ ready: true, authenticated: result.authenticated, teacherName: result.teacherName, expiresAt: result.expiresAt }) }
    catch { set({ ready: true, authenticated: false, teacherName: '', expiresAt: '' }) }
  },
  login: async (name, password) => {
    set({ loading: true, error: '' })
    try {
      const result = await window.preview.auth('login', { name, password })
      await useAppStore.getState().loadConfig()
      await useAppStore.getState().saveConfig({ teacherName: result.teacherName })
      set({ ready: true, authenticated: result.authenticated, teacherName: result.teacherName, expiresAt: result.expiresAt, executiveRole: null, executiveAccessToken: '', executiveExpiresAt: '' })
      return result.authenticated
    } catch (error) { set({ error: error instanceof Error ? error.message : '로그인할 수 없습니다.' }); return false }
    finally { set({ loading: false }) }
  },

  unlockExecutive: async (password) => {
    const state = useAuthStore.getState()
    const expectedRole = executiveRoleForName(state.teacherName)
    if (!state.authenticated || !expectedRole) {
      set({ error: '교장·교감 계정으로 먼저 로그인해 주세요.' })
      return false
    }
    if (!password) {
      set({ error: '추가 비밀번호를 입력해 주세요.' })
      return false
    }
    set({ loading: true, error: '' })
    try {
      const executiveSession = await verifyExecutive(state.teacherName, password)
      if (executiveSession.role !== expectedRole) throw new Error('보호 메뉴 권한을 확인하지 못했습니다.')
      set({
        executiveRole: executiveSession.role,
        executiveAccessToken: executiveSession.accessToken,
        executiveExpiresAt: executiveSession.expiresAt,
        error: '',
      })
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      return false
    } finally {
      set({ loading: false })
    }
  },

  lockExecutive: () => set({ executiveRole: null, executiveAccessToken: '', executiveExpiresAt: '', error: '' }),

  logout: async () => {
    clearSchoolHubSessionCache()
    await window.preview.auth('logout')
    await Promise.allSettled([
      window.electron?.configDelete(SESSION_NAME_KEY),
      window.electron?.configDelete(SESSION_EXPIRES_KEY),
    ])
    set({ authenticated: false, teacherName: '', expiresAt: '', error: '', executiveRole: null, executiveAccessToken: '', executiveExpiresAt: '' })
    window.electron?.notifyAuthChanged()
  },
}))

