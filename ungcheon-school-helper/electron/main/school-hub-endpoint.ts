export const UNGCHEON_SCHOOL_HUB_URL = 'https://script.google.com/macros/s/AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w/exec'

export function resolveSchoolHubEndpoint(value: unknown) {
  return String(value ?? '').trim() || UNGCHEON_SCHOOL_HUB_URL
}
