export const SESSION_KEY = 'ungcheon.mobile.session.v1'
export type MobileSession = { name: string; accessToken: string; expiresAt: number }

export function readStoredSession(): Partial<MobileSession> {
  return JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') ?? {}
}
