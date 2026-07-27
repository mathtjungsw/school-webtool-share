// 시험감독 자동 배정 알고리즘 — assign.js TypeScript 변환
import type { ExamState, Teacher, Period, Unit, AssignmentCell, Assignments, RunAssignmentResult, PreflightResult } from './types'
import { genUnits } from './defaults'

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface PeriodGroup { [key: string]: Period[] }

function groupPeriods(periods: Period[]): PeriodGroup {
  const groups: PeriodGroup = {}
  periods.forEach((p) => {
    const key = `${p.date}_${p.name}_${p.time}`
    ;(groups[key] || (groups[key] = [])).push(p)
  })
  return groups
}

interface ParsedRules {
  mainSubPriority: string
  maxDiff: number
  subInTwo: boolean
  hallwayConsec: boolean
  maxConsec: number
  subjectConsec: boolean
  sameClass: boolean
  excludeSubject: string
  excludeHomeroom: string
  selfStudyRole: string
  assignPriority: string
}

function parseRules(config: ExamState['config']): ParsedRules {
  const r = config.rules || ({} as ExamState['config']['rules'])
  return {
    mainSubPriority: ['균등', '무관'].includes(r.mainSubPriority) ? r.mainSubPriority : '균등',
    maxDiff: r.maxDiffPerDay === '제한없음' ? Infinity : parseInt(r.maxDiffPerDay ?? '1') || 1,
    subInTwo: r.excludeSubInTwo !== '미적용',
    hallwayConsec: r.excludeHallwayConsecutive !== '미적용',
    maxConsec: r.excludeConsecutive === '제한없음' ? Infinity : parseInt(r.excludeConsecutive ?? '2') || 2,
    subjectConsec: r.excludeSubjectConsec !== '미적용',
    sameClass: r.excludeSameClass !== '미적용',
    excludeSubject: r.excludeSubject,
    excludeHomeroom: r.excludeHomeroom,
    selfStudyRole: r.selfStudyRole || '정감독',
    assignPriority: r.assignPriority,
  }
}

interface UnitWithPeriod { row: Unit; period: Period }

function unitInUse(u: Unit, h: Period, unitList: UnitWithPeriod[], classSubjects: ExamState['classSubjects']): boolean {
  if (u.type === 'class') return !!((classSubjects[h.id] || {})[u.id])
  if (u.type === 'hallway') return (((classSubjects[h.id] || {})[u.id]) || '') === '배정'
  return unitList.some(
    (x) => x.row.type === 'class' && (u.grade === '전체' || x.row.grade === u.grade) && !!((classSubjects[x.period.id] || {})[x.row.id]),
  )
}

function methodKeyOf(u: Unit, h: Period, config: ExamState['config']): string | null {
  if (u.type === 'class') return u.grade !== '전체' ? u.grade : h.grade !== '전체' ? h.grade : null
  if (u.type === 'special') return config.specialRoomMode === 'integrated' ? 'special_integrated' : `special_${u.grade}`
  return config.hallwayMode === 'integrated' ? 'hallway_integrated' : `hallway_${u.grade}`
}

export function runAssignment(state: ExamState): RunAssignmentResult {
  const { config, teachers, classSubjects, periods } = state
  const R = parseRules(config)

  const assignments: Assignments = {}
  const total: Record<string, number> = {}
  const mainCnt: Record<string, number> = {}
  const subCnt: Record<string, number> = {}
  const perDay: Record<string, Record<string, number>> = {}
  teachers.forEach((t) => {
    total[t.id] = 0; mainCnt[t.id] = 0; subCnt[t.id] = 0; perDay[t.id] = {}
  })

  const units = genUnits(config)
  const groups = groupPeriods(periods)
  const slotKeys = Object.keys(groups)
  const groupArr = Object.values(groups)

  groupArr.forEach((group, slotIdx) => {
    const used = new Set<string>()
    const unitList: UnitWithPeriod[] = []
    const gradeToPeriod: Record<string, Period> = {}
    group.forEach((p) => (gradeToPeriod[p.grade] = p))
    group.forEach((p) => {
      units.filter((u) => (p.grade === '전체' ? true : u.grade === '전체' || u.grade === p.grade)).forEach((u) => {
        if (unitList.some((x) => x.row.id === u.id)) return
        if (u.type === 'hallway' || u.type === 'special') {
          const integ = u.type === 'hallway' ? config.hallwayMode === 'integrated' : config.specialRoomMode === 'integrated'
          const per = gradeToPeriod[integ ? '전체' : u.grade] || p
          unitList.push({ row: u, period: per })
        } else unitList.push({ row: u, period: p })
      })
    })

    const examinedSubjects = new Set<string>()
    group.forEach((p) =>
      unitList.forEach(({ row }) => {
        if (row.type !== 'class') return
        const s = (classSubjects[p.id] || {})[row.id]
        if (s) s.split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => examinedSubjects.add(x))
      }),
    )

    const date = (group[0] || ({} as Period)).date || ''
    const prevKey = slotIdx > 0 ? slotKeys[slotIdx - 1] : null
    const prev2Key = slotIdx > 1 ? slotKeys[slotIdx - 2] : null
    const prev3Key = slotIdx > 2 ? slotKeys[slotIdx - 3] : null

    const hwUnits = unitList.filter(({ row }) => row.type === 'hallway')
    const spUnits = unitList.filter(({ row }) => row.type === 'special')
    const clUnits = unitList.filter(({ row }) => row.type === 'class')

    ;[...shuffle(hwUnits), ...shuffle(spUnits), ...shuffle(clUnits)].forEach(({ row: u, period: h }) => {
      if (!unitInUse(u, h, unitList, classSubjects)) return

      const mk = methodKeyOf(u, h, config)
      const method = (config.assignmentMethods || {})[mk ?? ''] || {}
      const mType = method.type || '1인 감독'
      const mDetail = method.detail || ''
      const classSubjectsList = ((u.type === 'class' && (classSubjects[h.id] || {})[u.id]) || '')
        .split(',').map((s) => s.trim()).filter(Boolean)
      const isSelfStudy = u.type === 'class' && classSubjectsList.some((s) => s === '자율학습')
      const selfRole = R.selfStudyRole
      const classNo = u.id.replace('c-', '')

      let needMain = 1, needSub = 0, needSub2 = 0
      if (isSelfStudy) {
        if (selfRole === '부감독') { needMain = 0; needSub = 1 }
      } else if (mType === '2인 감독') needSub = 1
      else if (mType === '3인 감독') { needSub = 1; needSub2 = 1 }

      assignments[h.id] || (assignments[h.id] = {})
      const cell: AssignmentCell = assignments[h.id][u.id] || { main: null, sub: null, sub2: null }

      const sameClassSet = new Set<string>()
      if (R.sameClass && prevKey)
        (groups[prevKey] || []).forEach((pp) => {
          const c = (assignments[pp.id] || {})[u.id]
          if (c) { c.main && sameClassSet.add(c.main); c.sub && sameClassSet.add(c.sub); c.sub2 && sameClassSet.add(c.sub2) }
        })

      const consecSet = new Set<string>()
      if (R.maxConsec < Infinity && prevKey) {
        const slotIds = (key: string | null): Set<string> => {
          const s = new Set<string>()
          if (!key) return s
          ;(groups[key] || []).forEach((pp) =>
            Object.values(assignments[pp.id] || {}).forEach((c) => {
              if (c) { c.main && s.add(c.main); c.sub && s.add(c.sub) }
            }),
          )
          return s
        }
        // 합집합(union) → 교집합(intersection): 모든 체크 슬롯에 연속 배정된 교사만 차단
        const sets: Set<string>[] = [slotIds(prevKey)]
        if (R.maxConsec >= 2 && prev2Key) sets.push(slotIds(prev2Key))
        if (R.maxConsec >= 3 && prev3Key) sets.push(slotIds(prev3Key))
        for (const id of sets[0]) {
          if (sets.every((s) => s.has(id))) consecSet.add(id)
        }
      }

      const hallwayConsecSet = new Set<string>()
      if (R.hallwayConsec && prevKey)
        units.filter((x) => x.type === 'hallway').forEach((hwUnit) =>
          (groups[prevKey] || []).forEach((pp) => {
            const c = (assignments[pp.id] || {})[hwUnit.id]
            c && c.main && hallwayConsecSet.add(c.main)
          }),
        )

      const subConsecSet = new Set<string>()
      if (R.subInTwo && prevKey)
        (groups[prevKey] || []).forEach((pp) =>
          Object.values(assignments[pp.id] || {}).forEach((c) => { c && c.sub && subConsecSet.add(c.sub) }),
        )

      const subjConsecSet = new Set<string>()
      if (R.subjectConsec && prevKey && u.type === 'class')
        (groups[prevKey] || []).forEach((pp) =>
          ((classSubjects[pp.id] || {})[u.id] || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => subjConsecSet.add(s)),
        )

      const eligible = teachers.filter((t) => {
        if (used.has(t.id) || t.isAbsentAll || (t.exclusions || []).includes(h.id)) return false
        if (t.absences) {
          const matched = t.absences.filter((a) => a.date === h.date && a.periodName === h.name)
          for (const a of matched)
            if (a.scope === 'ALL' || (a.scope === 'GRADE' && u.grade === a.target) || (a.scope === 'CLASS' && u.id === a.target)) return false
        }
        if (t.maxPeriods !== undefined && t.maxPeriods !== null && t.maxPeriods !== '' && t.maxPeriods > 0 && total[t.id] >= t.maxPeriods) return false
        if (R.maxDiff < Infinity) {
          const dayCounts = Object.values(perDay).map((m) => m[date] || 0)
          const maxC = dayCounts.length ? Math.max(...dayCounts) : 0
          const my = (perDay[t.id] || {})[date] || 0
          if (my >= maxC && maxC > 0 && my - Math.min(...dayCounts) >= R.maxDiff) return false
        }
        return !(R.maxConsec < Infinity && consecSet.has(t.id))
      })

      const hallwaySameSubject = R.assignPriority === '복도감독(동일교과)'

      const balanceCap = (t: Teacher, role: string): boolean => {
        if (R.mainSubPriority !== '균등' || !t.isMain || !t.isSub) return false
        const mc = mainCnt[t.id] || 0; const sc = subCnt[t.id] || 0
        return role === 'main' ? mc - sc > 3 : role === 'sub' ? sc - mc > 3 : false
      }

      const excluded = (t: Teacher, role: string): boolean =>
        !!(
          (t.avoidance || []).includes(classNo) ||
          (u.type === 'class' &&
            ((R.excludeSubject !== '미적용' && classSubjectsList.length > 0 && (t.subjects || []).some((s) => classSubjectsList.includes(s))) ||
              (R.excludeHomeroom !== '미적용' && t.homeroom && t.homeroom === classNo) ||
              (R.subjectConsec && subjConsecSet.size > 0 && classSubjectsList.some((s) => subjConsecSet.has(s))))) ||
          (R.sameClass && sameClassSet.has(t.id)) ||
          (R.hallwayConsec && u.type === 'hallway' && hallwayConsecSet.has(t.id)) ||
          (role === 'sub' && R.subInTwo && subConsecSet.has(t.id)) ||
          balanceCap(t, role)
        )

      const sortPool = (arr: Teacher[], role: string): Teacher[] =>
        shuffle(arr).sort((a, b) => {
          if (u.type === 'special') {
            const ai = a.isSpecial !== false ? 1 : 0; const bi = b.isSpecial !== false ? 1 : 0
            if (ai !== bi) return bi - ai
          } else if (u.type === 'hallway') {
            const ai = a.isHallway !== false ? 1 : 0; const bi = b.isHallway !== false ? 1 : 0
            if (ai !== bi) return bi - ai
            if (hallwaySameSubject) {
              const aa = (a.subjects || []).some((s) => examinedSubjects.has(s)) ? 1 : 0
              const bb = (b.subjects || []).some((s) => examinedSubjects.has(s)) ? 1 : 0
              if (aa !== bb) return bb - aa
            }
          }
          if (R.mainSubPriority === '균등') {
            if (role === 'main') {
              const ra = (mainCnt[a.id] || 0) - (subCnt[a.id] || 0); const rb = (mainCnt[b.id] || 0) - (subCnt[b.id] || 0)
              if (ra !== rb) return ra - rb
            } else {
              const ra = (subCnt[a.id] || 0) - (mainCnt[a.id] || 0); const rb = (subCnt[b.id] || 0) - (mainCnt[b.id] || 0)
              if (ra !== rb) return ra - rb
            }
            return (total[a.id] || 0) - (total[b.id] || 0)
          }
          return (total[a.id] || 0) - (total[b.id] || 0)
        })

      // 정감독
      let mainPool = sortPool(eligible.filter((t) => !!t.isMain && !excluded(t, 'main')), 'main')
      let relaxed = false
      if (needMain > 0 && mainPool.length === 0 && u.type === 'class') {
        relaxed = true
        const hardBlocked = (t: Teacher) =>
          t.isAbsentAll ||
          (t.absences || []).some((a) => a.date === date && a.periodName === h.name && a.scope === 'ALL') ||
          (classSubjectsList.length > 0 && (t.subjects || []).some((s) => classSubjectsList.includes(s))) ||
          (t.homeroom && t.homeroom === classNo)
        const levels = [
          (t: Teacher) => !!t.isMain && !hardBlocked(t) && !used.has(t.id) && !(t.avoidance || []).includes(classNo),
          (t: Teacher) => !!t.isMain && !hardBlocked(t) && !used.has(t.id),
          (t: Teacher) => !!t.isMain && !hardBlocked(t) && !used.has(t.id),
        ]
        for (const f of levels) { mainPool = sortPool(teachers.filter(f), 'main'); if (mainPool.length > 0) break }
        if (mainPool.length === 0)
          mainPool = sortPool(teachers.filter((t) => !!t.isMain && !t.isAbsentAll && !used.has(t.id) && !(t.absences || []).some((a) => a.date === date && a.periodName === h.name && a.scope === 'ALL')), 'main')
      }
      if (needMain > 0 && mainPool.length > 0) {
        const t = mainPool[0]
        cell.main = t.id; if (relaxed) cell._relaxed = true
        used.add(t.id); total[t.id]++; mainCnt[t.id]++
        perDay[t.id] || (perDay[t.id] = {}); perDay[t.id][date] = (perDay[t.id][date] || 0) + 1
      }

      // 부감독
      let subPool = sortPool(eligible.filter((t) => !!t.isSub && !used.has(t.id) && !excluded(t, 'sub')), 'sub')
      if (isSelfStudy) {
        if (selfRole === '부감독') subPool = subPool.filter((t) => t.category === '교사')
      } else if (needSub > 0 && mType === '2인 감독') {
        const cats = mDetail === '교사-교사' ? ['교사'] : mDetail === '교사-명예교사' ? ['명예교사'] : ['교육봉사자']
        subPool = subPool.filter((t) => (cats as string[]).includes(t.category))
      } else if (mType === '3인 감독') subPool = subPool.filter((t) => t.category === '명예교사')
      if (needSub > 0 && subPool.length > 0) {
        const t = subPool[0]; cell.sub = t.id
        used.add(t.id); total[t.id]++; subCnt[t.id]++
        perDay[t.id] || (perDay[t.id] = {}); perDay[t.id][date] = (perDay[t.id][date] || 0) + 1
      }

      // 제2부감독
      if (!isSelfStudy && mType === '3인 감독') {
        const pool = sortPool(eligible.filter((t) => t.category === '교육봉사자' && !used.has(t.id) && !excluded(t, 'sub2')), 'sub')
        if (needSub2 > 0 && pool.length > 0) {
          const t = pool[0]; cell.sub2 = t.id
          used.add(t.id); total[t.id]++; subCnt[t.id]++
          perDay[t.id] || (perDay[t.id] = {}); perDay[t.id][date] = (perDay[t.id][date] || 0) + 1
        }
      }

      if (cell.main || cell.sub || cell.sub2) assignments[h.id][u.id] = cell
    })
  })

  const timeUsed: Record<string, Set<string>> = {}
  Object.entries(assignments).forEach(([pid, cells]) => {
    const p = periods.find((x) => x.id === pid); if (!p) return
    const key = `${p.date}_${p.name}_${p.time || ''}`
    timeUsed[key] || (timeUsed[key] = new Set())
    Object.values(cells).forEach((c) => {
      c && c.main && timeUsed[key].add(c.main); c && c.sub && timeUsed[key].add(c.sub); c && c.sub2 && timeUsed[key].add(c.sub2)
    })
  })

  // Pass 2
  let emptyFixed = 0; let emptyRemain = 0
  const emptySlots: Record<string, { date: string; name: string; time: string; rooms: { label: string; role: string }[] }> = {}
  const recordEmpty = (date: string, name: string, time: string, unit: Unit, role: string) => {
    const key = `${date}_${name}_${time}`
    emptySlots[key] || (emptySlots[key] = { date, name, time, rooms: [] })
    emptySlots[key].rooms.push({ label: `${unit.grade}-${unit.label.replace(/반$/, '')}`, role })
  }

  units.filter((u) => u.type === 'class').forEach((unit) => {
    periods.forEach((period) => {
      if (!(period.grade === '전체' || unit.grade === period.grade)) return
      const subj = (classSubjects[period.id] || {})[unit.id] || ''; if (!subj.trim()) return
      assignments[period.id] || (assignments[period.id] = {})
      assignments[period.id][unit.id] || (assignments[period.id][unit.id] = { main: null, sub: null, sub2: null })
      const cell = assignments[period.id][unit.id]
      const { date, name } = period
      const timeKey = `${date}_${name}_${period.time || ''}`
      timeUsed[timeKey] || (timeUsed[timeKey] = new Set())

      const mk = period.grade !== '전체' ? period.grade : unit.grade !== '전체' ? unit.grade : null
      const mType = ((config.assignmentMethods || {})[mk ?? ''] || {}).type || '1인 감독'
      const isSelf = subj.split(',').map((s) => s.trim()).some((s) => s === '자율학습')
      const selfRole = R.selfStudyRole
      if (isSelf && cell.sub) cell.sub = null; if (isSelf && cell.sub2) cell.sub2 = null

      const needSub_ = !isSelf && (mType === '2인 감독' || mType === '3인 감독')
      const needSub2_ = !isSelf && mType === '3인 감독'
      const needMain_ = !isSelf || selfRole === '정감독'
      const selfNeedsSub = isSelf && selfRole === '부감독'
      const subjList = subj.split(',').map((s) => s.trim()).filter(Boolean)
      const classNo = unit.id.replace('c-', '')
      const hardBlock = (t: Teacher) =>
        !!(t.isAbsentAll ||
          (t.absences || []).some((a) => a.date === date && a.periodName === name && a.scope === 'ALL') ||
          (subjList.length > 0 && (t.subjects || []).some((s) => subjList.includes(s))) ||
          (t.homeroom && t.homeroom === classNo))
      const pool = (isMainRole: boolean) =>
        teachers.filter((t) => (isMainRole ? !!t.isMain : !!t.isSub) && !hardBlock(t) && !timeUsed[timeKey].has(t.id))
          .sort((a, b) => (total[a.id] || 0) - (total[b.id] || 0))
      const fill = (id: string) => { timeUsed[timeKey].add(id); total[id] = (total[id] || 0) + 1; emptyFixed++ }

      if (!cell.main && needMain_) {
        const c = pool(true)
        if (c.length > 0) { cell.main = c[0].id; cell._relaxed = true; fill(c[0].id) }
        else { emptyRemain++; recordEmpty(date, name, period.time || '', unit, '정감독') }
      }
      if (selfNeedsSub && !cell.sub) {
        const c = pool(false).filter((t) => t.category === '교사')
        if (c.length > 0) { cell.sub = c[0].id; cell._relaxed = true; fill(c[0].id) }
        else { emptyRemain++; recordEmpty(date, name, period.time || '', unit, '부감독') }
      }
      if (needSub_ && cell.main && !cell.sub) {
        const c = pool(false).filter((t) => t.id !== cell.main)
        if (c.length > 0) { cell.sub = c[0].id; fill(c[0].id) }
        else { emptyRemain++; recordEmpty(date, name, period.time || '', unit, '부감독') }
      }
      if (needSub2_ && cell.main && cell.sub && !cell.sub2) {
        const c = pool(false).filter((t) => t.id !== cell.main && t.id !== cell.sub)
        if (c.length > 0) { cell.sub2 = c[0].id; fill(c[0].id) }
        else { emptyRemain++; recordEmpty(date, name, period.time || '', unit, '제2부감독') }
      }
    })
  })

  const totalAssigned = Object.values(assignments).reduce((acc, cells) => acc + Object.values(cells).filter((c) => c && c.main).length, 0)
  return { assignments, totalAssigned, emptyRemain, emptyFixed, emptySlots: Object.values(emptySlots), counts: { total, mainCnt, subCnt } }
}

export function preflight(state: ExamState): PreflightResult {
  const { config, teachers, classSubjects, periods } = state
  const units = genUnits(config)
  const groups = groupPeriods(periods)
  const isAbsent = (t: Teacher, date: string, name: string) =>
    t.isAbsentAll || (t.absences || []).some((a) => a.date === date && a.periodName === name && a.scope === 'ALL')

  const slots = Object.values(groups)
    .sort((a, b) => (a[0].date + a[0].name).localeCompare(b[0].date + b[0].name))
    .flatMap((group) => {
      const date = group[0].date; const name = group[0].name; const time = group[0].time || ''
      const gradeToPeriod: Record<string, Period> = {}
      group.forEach((p) => (gradeToPeriod[p.grade] = p))
      const unitList: UnitWithPeriod[] = []
      group.forEach((p) => {
        units.filter((u) => (p.grade === '전체' ? true : u.grade === '전체' || u.grade === p.grade)).forEach((u) => {
          if (unitList.some((x) => x.row.id === u.id)) return
          if (u.type === 'hallway' || u.type === 'special') {
            const integ = u.type === 'hallway' ? config.hallwayMode === 'integrated' : config.specialRoomMode === 'integrated'
            const per = gradeToPeriod[integ ? '전체' : u.grade] || p
            unitList.push({ row: u, period: per })
          } else unitList.push({ row: u, period: p })
        })
      })
      let needMain = 0; let needSub = 0
      unitList.forEach(({ row: u, period: h }) => {
        if (!unitInUse(u, h, unitList, classSubjects)) return
        const mk = methodKeyOf(u, h, config)
        const mType = ((config.assignmentMethods || {})[mk ?? ''] || {}).type || '1인 감독'
        const isSelf = ((classSubjects[h.id] || {})[u.id] || '').split(',').map((s) => s.trim()).some((s) => s === '자율학습')
        const selfRole = (config.rules || {}).selfStudyRole || '정감독'
        if (u.type === 'class' && isSelf) { selfRole === '부감독' ? needSub++ : needMain++ }
        else { needMain++; if (mType === '2인 감독') needSub++; else if (mType === '3인 감독') needSub += 2 }
      })
      if (needMain === 0 && needSub === 0) return []
      const availMain = teachers.filter((t) => t.isMain && !isAbsent(t, date, name)).length
      const availSub = teachers.filter((t) => t.isSub && !isAbsent(t, date, name)).length
      return [{ date, name, time, needMain, needSub, availMain, availSub, shortMain: Math.max(0, needMain - availMain), shortSub: Math.max(0, needSub - availSub) }]
    })
  return { slots, hasShortage: slots.some((s) => s.shortMain > 0 || s.shortSub > 0) }
}
