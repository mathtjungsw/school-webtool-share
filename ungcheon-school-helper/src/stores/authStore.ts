import { create } from 'zustand'
import { clearSchoolHubSessionCache, getSharedStaffRoster, preloadSchoolHubCache, verifyExecutive, type ExecutiveRole } from '../services/schoolHub'
import { useAppStore } from './appStore'

const SESSION_NAME_KEY = 'pilotLogin.teacherName'
const SESSION_EXPIRES_KEY = 'pilotLogin.expiresAt'
const SESSION_HOURS = 72

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
  login: (name: string) => Promise<boolean>
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
    if (!window.electron) {
      set({ ready: true })
      return
    }
    const [savedName, savedExpiresAt] = await Promise.all([
      window.electron.configGet(SESSION_NAME_KEY),
      window.electron.configGet(SESSION_EXPIRES_KEY),
    ])
    const teacherName = String(savedName ?? '').trim()
    const expiresAt = String(savedExpiresAt ?? '')
    if (teacherName && isFuture(expiresAt)) {
      if (useAppStore.getState().config.teacherName !== teacherName) {
        await useAppStore.getState().saveConfig({ teacherName })
      }
      set({ ready: true, authenticated: true, teacherName, expiresAt })
      void preloadSchoolHubCache(teacherName)
      return
    }
    await Promise.allSettled([
      window.electron.configDelete(SESSION_NAME_KEY),
      window.electron.configDelete(SESSION_EXPIRES_KEY),
    ])
    set({ ready: true, authenticated: false, teacherName: '', expiresAt: '', executiveRole: null, executiveAccessToken: '', executiveExpiresAt: '' })
  },

  login: async (name) => {
    const teacherName = name.trim()
    if (!teacherName) {
      set({ error: '이름을 입력해 주세요.' })
      return false
    }
    set({ loading: true, error: '' })
    try {
      const roster = await getSharedStaffRoster(true)
      if (!roster?.members.some(member => member.name.trim() === teacherName)) {
        set({ error: '교직원 명렬에 등록된 이름과 일치하지 않습니다.' })
        return false
      }
      const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()
      await Promise.all([
        window.electron.configSet(SESSION_NAME_KEY, teacherName),
        window.electron.configSet(SESSION_EXPIRES_KEY, expiresAt),
        useAppStore.getState().saveConfig({ teacherName }),
      ])
      set({
        authenticated: true,
        teacherName,
        expiresAt,
        error: '',
        executiveRole: null,
        executiveAccessToken: '',
        executiveExpiresAt: '',
      })
      window.electron?.notifyAuthChanged()
      void preloadSchoolHubCache(teacherName)
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      return false
    } finally {
      set({ loading: false })
    }
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
    await Promise.allSettled([
      window.electron?.configDelete(SESSION_NAME_KEY),
      window.electron?.configDelete(SESSION_EXPIRES_KEY),
    ])
    set({ authenticated: false, teacherName: '', expiresAt: '', error: '', executiveRole: null, executiveAccessToken: '', executiveExpiresAt: '' })
    window.electron?.notifyAuthChanged()
  },
}))

