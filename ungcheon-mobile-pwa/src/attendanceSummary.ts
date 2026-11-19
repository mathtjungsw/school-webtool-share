import type { DashboardPayload, MobileAttendanceEntry, MobileAttendanceSummary } from './types'

const attendanceException = /(결석|지각|조퇴|결과|병결|미인정|출석\s*인정|공결|체험학습|위탁교육)/

export function isSelfStudyEntry(entry: MobileAttendanceEntry) {
  const remark = String(entry.remark ?? '').trim()
  return remark.includes('자습') && !attendanceException.test(remark)
}

export function attendanceEntryCounts(summary: MobileAttendanceSummary) {
  const entries = summary.entries ?? []
  const selfStudyCount = summary.selfStudyCount ?? entries.filter(isSelfStudyEntry).length
  const attendanceCount = summary.attendanceCount ?? Math.max(entries.length, summary.flaggedCount, selfStudyCount) - selfStudyCount
  return { attendanceCount, selfStudyCount }
}

export function summaryOnly(summary: MobileAttendanceSummary): MobileAttendanceSummary {
  return { ...summary, ...attendanceEntryCounts(summary), entries: [] }
}

export function withoutAttendanceDetails(payload: DashboardPayload): DashboardPayload {
  if (!payload.bundle?.attendanceSummaries) return payload
  return { ...payload, bundle: { ...payload.bundle, attendanceSummaries: payload.bundle.attendanceSummaries.map(summaryOnly) } }
}
