import type { Club, ClubStudent, AssignMethod } from '../types/club'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const studentOrder = (a: ClubStudent, b: ClubStudent) =>
  a.grade - b.grade ||
  Number(a.classNum) - Number(b.classNum) ||
  a.number - b.number

export function runAssignment(
  clubs: Club[],
  students: ClubStudent[],
  method: AssignMethod,
  overAssign: boolean
): ClubStudent[] {
  // 정원 복사
  const caps: Record<string, number> = {}
  for (const c of clubs) caps[c.id] = Number(c.capacity) || 0

  const assignAllUnmatched = ['priority_random_all', 'priority_time_all', 'random'].includes(method)

  // 학생 순서 결정
  let ordered: ClubStudent[]
  if (method === 'priority_time' || method === 'priority_time_all') {
    ordered = [...students].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0) || studentOrder(a, b))
  } else {
    ordered = shuffle([...students])
  }

  const assigned: Record<string, string> = {}   // studentId → clubId
  const extra: Record<string, boolean> = {}

  if (method === 'random') {
    // 무작위: 희망 무시
    for (const s of ordered) {
      const available = clubs.filter(c => (caps[c.id] ?? 0) > 0)
      if (!available.length) break
      const picked = available[Math.floor(Math.random() * available.length)]
      assigned[s.id] = picked.id
      caps[picked.id]--
    }
  } else {
    // 희망 우선: 최대 50순위까지 반복
    const MAX_PREFS = 50
    for (let rank = 0; rank < MAX_PREFS; rank++) {
      for (const s of ordered) {
        if (assigned[s.id]) continue
        const prefClubId = (s.prefs ?? [])[rank]
        if (prefClubId && (caps[prefClubId] ?? 0) > 0) {
          assigned[s.id] = prefClubId
          caps[prefClubId]--
        }
      }
    }

    // 미입력 배정 (all 방식)
    if (assignAllUnmatched) {
      const unmatched = shuffle(ordered.filter(s => !assigned[s.id]))
      for (const s of unmatched) {
        const available = clubs.filter(c => (caps[c.id] ?? 0) > 0)
        if (!available.length) break
        const picked = available[Math.floor(Math.random() * available.length)]
        assigned[s.id] = picked.id
        caps[picked.id]--
      }
    }
  }

  // 비율 추가 배정 (overAssign)
  if (overAssign) {
    const unmatched = shuffle(students.filter(s => !assigned[s.id]))
    if (unmatched.length > 0) {
      const totalCap = clubs.reduce((sum, c) => sum + (Number(c.capacity) || 0), 0)
      const extraCount = unmatched.length

      const quotas = clubs.map(c => {
        const cap = Number(c.capacity) || 0
        const raw = totalCap > 0 ? (extraCount * cap) / totalCap : 0
        return { id: c.id, quota: Math.floor(raw), frac: raw - Math.floor(raw) }
      })

      // 나머지 분배 (분수 내림 오차 보정)
      let rem = extraCount - quotas.reduce((s, q) => s + q.quota, 0)
      quotas.sort((a, b) => b.frac - a.frac)
      quotas.forEach((q, i) => { if (i < rem) q.quota++ })

      const extraCaps: Record<string, number> = {}
      for (const q of quotas) if (q.quota > 0) extraCaps[q.id] = q.quota

      for (const s of unmatched) {
        const available = clubs.filter(c => (extraCaps[c.id] ?? 0) > 0)
        if (!available.length) break
        const picked = available[Math.floor(Math.random() * available.length)]
        assigned[s.id] = picked.id
        extra[s.id] = true
        extraCaps[picked.id]--
      }
    }
  }

  return students.map(s => ({
    ...s,
    assignedClub: assigned[s.id] ?? null,
    isExtra: extra[s.id] ?? false,
  }))
}

export function calcStats(clubs: Club[], students: ClubStudent[]) {
  const total = students.length
  const hasPrefs = students.filter(s => s.prefs && s.prefs.length > 0).length
  const assigned = students.filter(s => s.assignedClub).length
  const wish1 = students.filter(s => s.assignedClub && s.assignedClub === s.prefs?.[0]).length
  const wish2 = students.filter(s => s.assignedClub && s.assignedClub === s.prefs?.[1]).length
  const extra = students.filter(s => s.isExtra).length

  const clubStats = clubs.map(c => ({
    ...c,
    count: students.filter(s => s.assignedClub === c.id).length,
  }))

  return { total, hasPrefs, assigned, unassigned: total - assigned, wish1, wish2, extra, clubStats }
}
