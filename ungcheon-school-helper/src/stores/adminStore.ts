import { create } from 'zustand'
import { verifyAdmin } from '../services/schoolHub'

interface AdminState {
  isAdmin: boolean
  adminPassword: string
  unlock: (password: string) => Promise<void>
  lock: () => void
}

export const useAdminStore = create<AdminState>(set => ({
  isAdmin: false,
  adminPassword: '',

  unlock: async (password) => {
    const normalized = password.trim()
    if (!normalized) throw new Error('관리자 비밀번호를 입력하세요.')
    await verifyAdmin(normalized)
    set({ isAdmin: true, adminPassword: normalized })
  },

  lock: () => set({ isAdmin: false, adminPassword: '' }),
}))
