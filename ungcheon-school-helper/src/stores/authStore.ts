import { create } from 'zustand'
import { clearSchoolHubSessionCache, getSharedStaffRoster, preloadSchoolHubCache } from '../services/schoolHub'
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
  bootstrap: () => Promise<void>
  login: (name: string) => Promise<boolean>
  logout: () => Promise<void>
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
    set({ ready: true, authenticated: false, teacherName: '', expiresAt: '' })
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
      set({ authenticated: true, teacherName, expiresAt, error: '' })
      void preloadSchoolHubCache(teacherName)
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      return false
    } finally {
      set({ loading: false })
    }
  },

  logout: async () => {
    clearSchoolHubSessionCache()
    await Promise.allSettled([
      window.electron?.configDelete(SESSION_NAME_KEY),
      window.electron?.configDelete(SESSION_EXPIRES_KEY),
    ])
    set({ authenticated: false, teacherName: '', expiresAt: '', error: '' })
  },
}))

