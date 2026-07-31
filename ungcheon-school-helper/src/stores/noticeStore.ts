import { create } from 'zustand'
import { listNotices } from '../services/schoolHub'

export interface Notice {
  id: number
  title: string
  body: string
  date?: string                              // 'YYYY-MM-DD' 작성일
  level?: 'info' | 'important' | 'urgent'    // 강조 색상
  expiresAt?: string                         // 'YYYY-MM-DD' (포함) — 이 날짜까지만 자동 팝업
}

// ─── LocalStorage 키 (사용자별 읽음/스누즈 기억) ──────────────────────
const LS_LAST_READ = 'swh.notice.lastReadId'      // 사용자가 확인한 가장 큰 공지 ID
const LS_SNOOZE_UNTIL = 'swh.notice.snoozeUntil'  // '오늘 하루 보지 않기' — 이 날짜(오늘)면 자동 팝업 차단

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// expiresAt(포함)이 지나면 자동 팝업 대상에서 제외
function isExpired(n: Notice): boolean {
  if (!n.expiresAt) return false
  return todayStr() > n.expiresAt
}

function readNum(key: string): number {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) ? v : 0
  } catch {
    return 0
  }
}

// 원격 JSON(임의 형태)을 안전한 Notice[]로 정규화
function sanitize(raw: unknown): Notice[] {
  if (!Array.isArray(raw)) return []
  const out: Notice[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = Number(o.id)
    if (!Number.isFinite(id)) continue
    const title = String(o.title ?? '').trim()
    const body = String(o.body ?? '').trim()
    if (!title) continue
    const level = o.level === 'important' || o.level === 'urgent' ? o.level : 'info'
    out.push({
      id,
      title,
      body,
      level,
      date: typeof o.date === 'string' ? o.date : undefined,
      expiresAt: typeof o.expiresAt === 'string' ? o.expiresAt : undefined,
    })
  }
  // 최신(큰 ID) 우선 정렬
  return out.sort((a, b) => b.id - a.id)
}

interface NoticeState {
  notices: Notice[]          // 최신순 정렬
  loaded: boolean
  open: boolean              // 모달 표시 여부
  activeId: number | null    // 모달에서 보고 있는 공지 ID
  lastReadId: number

  fetchNotices: () => Promise<void>
  openCenter: () => void          // 탭 클릭 → 최신 공지 표시
  openNotice: (id: number) => void
  close: (snoozeToday?: boolean) => void
}

export const useNoticeStore = create<NoticeState>((set, get) => ({
  notices: [],
  loaded: false,
  open: false,
  activeId: null,
  lastReadId: readNum(LS_LAST_READ),

  // 진입 시 자동 확인(On-Load Verification)
  fetchNotices: async () => {
    try {
      const raw = await listNotices()
      const notices = sanitize(raw)
      set({ notices, loaded: true })

      // '오늘 하루 보지 않기' 토큰이 오늘이면 자동 팝업 차단
      let snoozeUntil: string | null = null
      try { snoozeUntil = localStorage.getItem(LS_SNOOZE_UNTIL) } catch { /* ignore */ }
      if (snoozeUntil === todayStr()) return

      // 만료되지 않은 공지 중 가장 최신 ID가 마지막으로 읽은 ID보다 크면 팝업
      const active = notices.filter(n => !isExpired(n))[0]  // notices는 최신순
      if (active && active.id > get().lastReadId) {
        set({ open: true, activeId: active.id })
      }
    } catch {
      set({ loaded: true })
    }
  },

  openCenter: () => {
    const latest = get().notices[0]
    set({ open: true, activeId: latest ? latest.id : null })
  },

  openNotice: (id) => set({ open: true, activeId: id }),

  // 닫기/확인 → 현재까지의 모든 공지를 읽음 처리 (다음 접속부터 자동 팝업 안 함)
  close: (snoozeToday = false) => {
    const maxId = get().notices.reduce((m, n) => Math.max(m, n.id), get().lastReadId)
    try {
      localStorage.setItem(LS_LAST_READ, String(maxId))
      if (snoozeToday) localStorage.setItem(LS_SNOOZE_UNTIL, todayStr())
    } catch { /* ignore */ }
    set({ open: false, activeId: null, lastReadId: maxId })
  },
}))
