export const SPLIT_BOUNDARIES = ['A', 'B', 'C', 'D', 'E'] as const
export type SplitBoundary = typeof SPLIT_BOUNDARIES[number]
export type OutcomeLabel = SplitBoundary | '미도달'

export type DifficultyKey =
  | 'mcEasy' | 'mcMedium' | 'mcHard'
  | 'writtenEasy' | 'writtenMedium' | 'writtenHard'

export interface DifficultyCategory {
  key: DifficultyKey
  label: string
  type: 'mc' | 'written'
  level: 'easy' | 'medium' | 'hard'
}

export const DIFFICULTY_CATEGORIES: DifficultyCategory[] = [
  { key: 'mcEasy', label: '선택형(쉬움)', type: 'mc', level: 'easy' },
  { key: 'mcMedium', label: '선택형(보통)', type: 'mc', level: 'medium' },
  { key: 'mcHard', label: '선택형(어려움)', type: 'mc', level: 'hard' },
  { key: 'writtenEasy', label: '서술형(쉬움)', type: 'written', level: 'easy' },
  { key: 'writtenMedium', label: '서술형(보통)', type: 'written', level: 'medium' },
  { key: 'writtenHard', label: '서술형(어려움)', type: 'written', level: 'hard' },
]

export type DifficultyWeights = Record<DifficultyKey, number>
export type SplitScores = Record<SplitBoundary, number | null>
export type CorrectRateVector = Record<SplitBoundary, number>
export type TeacherCorrectRates = Record<DifficultyKey, CorrectRateVector>

export interface SplitPlannerInput {
  teacherCount: number
  tolerance: number
  boundaries: SplitBoundary[]
  targets: SplitScores
  weights: DifficultyWeights
}

export interface SplitPlannerResult {
  assignments: TeacherCorrectRates[]
  computed: SplitScores
  activeCategories: DifficultyCategory[]
  maxError: number
  exact: boolean
  withinTolerance: boolean
  message: string
}

export interface ThresholdComponent {
  id: string
  name: string
  weight: number
  maxScore: number
  splitScores?: SplitScores
}

export interface DistributionRow {
  integerScore: number
}

export interface TargetDistributionResult {
  targetCounts: Record<OutcomeLabel, number>
  actualCounts: Record<OutcomeLabel, number>
  recommendedComponentCuts: SplitScores
  finalCuts: SplitScores
  feasible: boolean
  messages: string[]
}

const STEP_VALUES = Array.from({ length: 21 }, (_, index) => index * 5)
const LEVEL_ORDER: DifficultyCategory['level'][] = ['easy', 'medium', 'hard']
const MAX_TEACHER_SPREAD = 10

export const DEFAULT_DIFFICULTY_WEIGHTS: DifficultyWeights = {
  mcEasy: 15, mcMedium: 25, mcHard: 10,
  writtenEasy: 10, writtenMedium: 30, writtenHard: 10,
}

export function emptySplitScores(values: Partial<Record<SplitBoundary, number | null>> = {}): SplitScores {
  return {
    A: values.A ?? null,
    B: values.B ?? null,
    C: values.C ?? null,
    D: values.D ?? null,
    E: values.E ?? null,
  }
}

export function defaultSplitScores(includeNonattainment = true): SplitScores {
  return emptySplitScores(includeNonattainment
    ? { A: 85, B: 70, C: 55, D: 40, E: 25 }
    : { A: 85, B: 70, C: 55, D: 40 })
}

export function activeSplitBoundaries(includeNonattainment: boolean, scale: 'ABCDE' | 'ABC' | 'none'): SplitBoundary[] {
  if (scale === 'ABC') return ['A', 'B']
  if (scale === 'none') return []
  return includeNonattainment ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D']
}

export function outcomeLabels(boundaries: SplitBoundary[]): OutcomeLabel[] {
  if (!boundaries.length) return []
  if (boundaries.length === 2 && boundaries[0] === 'A' && boundaries[1] === 'B') return ['A', 'B', 'C']
  return [...boundaries, boundaries.includes('E') ? '미도달' : 'E']
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function round5(value: number) {
  return clamp(Math.round(value / 5) * 5)
}

function cloneAssignments(assignments: TeacherCorrectRates[]) {
  return assignments.map(teacher => Object.fromEntries(
    DIFFICULTY_CATEGORIES.map(category => [category.key, { ...teacher[category.key] }]),
  ) as TeacherCorrectRates)
}

function activeCategories(weights: DifficultyWeights) {
  return DIFFICULTY_CATEGORIES.filter(category => Number(weights[category.key]) > 0)
}

function orderedVector(targets: SplitScores, boundaries: SplitBoundary[], offset: number): CorrectRateVector {
  const vector = emptySplitScores() as CorrectRateVector
  let ceiling = 100
  SPLIT_BOUNDARIES.forEach(boundary => {
    const fallback = boundary === 'A' ? 85 : boundary === 'B' ? 70 : boundary === 'C' ? 55 : boundary === 'D' ? 40 : 25
    const target = boundaries.includes(boundary) ? Number(targets[boundary] ?? fallback) : fallback
    vector[boundary] = Math.min(ceiling, round5(target + offset))
    ceiling = vector[boundary]
  })
  return vector
}

function makeSeed(input: SplitPlannerInput, bias: number): TeacherCorrectRates[] {
  const active = activeCategories(input.weights)
  const hasMc = active.some(category => category.type === 'mc')
  const hasWritten = active.some(category => category.type === 'written')
  const offsets: Record<DifficultyKey, number> = {
    mcEasy: 10, mcMedium: 5, mcHard: 0,
    writtenEasy: 5, writtenMedium: 0, writtenHard: -5,
  }
  if (!hasMc) Object.assign(offsets, { writtenEasy: 5, writtenMedium: 0, writtenHard: -5 })
  if (!hasWritten) Object.assign(offsets, { mcEasy: 5, mcMedium: 0, mcHard: -5 })
  const teacher = Object.fromEntries(DIFFICULTY_CATEGORIES.map(category => [
    category.key,
    orderedVector(input.targets, input.boundaries, offsets[category.key] + bias),
  ])) as TeacherCorrectRates
  return Array.from({ length: input.teacherCount }, () => structuredClone(teacher))
}

function makeSafeSeed(input: SplitPlannerInput): TeacherCorrectRates[] {
  const safeValues: Record<DifficultyKey, number> = {
    mcEasy: 100, mcMedium: 95, mcHard: 90,
    writtenEasy: 95, writtenMedium: 90, writtenHard: 85,
  }
  const teacher = Object.fromEntries(DIFFICULTY_CATEGORIES.map(category => [
    category.key,
    Object.fromEntries(SPLIT_BOUNDARIES.map(boundary => [boundary, safeValues[category.key]])) as CorrectRateVector,
  ])) as TeacherCorrectRates
  return Array.from({ length: input.teacherCount }, () => structuredClone(teacher))
}

function weightedScores(assignments: TeacherCorrectRates[], input: SplitPlannerInput): SplitScores {
  const output = emptySplitScores()
  const active = activeCategories(input.weights)
  input.boundaries.forEach(boundary => {
    let total = 0
    assignments.forEach(teacher => active.forEach(category => {
      total += input.weights[category.key] * teacher[category.key][boundary]
    }))
    output[boundary] = round1(total / assignments.length / 100)
  })
  return output
}

function objective(scores: SplitScores, input: SplitPlannerInput) {
  return input.boundaries.reduce((sum, boundary) => {
    const difference = Number(scores[boundary]) - Number(input.targets[boundary])
    return sum + difference * difference
  }, 0)
}

function respectsBoundaryOrder(vector: CorrectRateVector, boundaries: SplitBoundary[]) {
  return boundaries.every((boundary, index) => index === 0 || vector[boundaries[index - 1]] >= vector[boundary])
}

function respectsDifficultyOrder(teacher: TeacherCorrectRates, input: SplitPlannerInput) {
  return (['mc', 'written'] as const).every(type => {
    const categories = LEVEL_ORDER
      .map(level => DIFFICULTY_CATEGORIES.find(category => category.type === type && category.level === level)!)
      .filter(category => input.weights[category.key] > 0)
    return input.boundaries.every(boundary => categories.every((category, index) => (
      index === 0 || teacher[categories[index - 1].key][boundary] >= teacher[category.key][boundary] + 5
    )))
  })
}

function respectsTypeOrder(teacher: TeacherCorrectRates, input: SplitPlannerInput) {
  return LEVEL_ORDER.every(level => {
    const mc = DIFFICULTY_CATEGORIES.find(category => category.type === 'mc' && category.level === level)!
    const written = DIFFICULTY_CATEGORIES.find(category => category.type === 'written' && category.level === level)!
    if (input.weights[mc.key] <= 0 || input.weights[written.key] <= 0) return true
    return input.boundaries.every(boundary => teacher[mc.key][boundary] >= teacher[written.key][boundary] + 5)
  })
}

function spread(assignments: TeacherCorrectRates[], key: DifficultyKey, boundary: SplitBoundary) {
  const values = assignments.map(teacher => teacher[key][boundary])
  return Math.max(...values) - Math.min(...values)
}

function validAssignments(assignments: TeacherCorrectRates[], input: SplitPlannerInput) {
  const active = activeCategories(input.weights)
  return assignments.every(teacher => (
    active.every(category => respectsBoundaryOrder(teacher[category.key], input.boundaries)) &&
    respectsDifficultyOrder(teacher, input) && respectsTypeOrder(teacher, input)
  ))
}

export function validateSplitPlannerInput(input: SplitPlannerInput): string[] {
  const errors: string[] = []
  const active = activeCategories(input.weights)
  const total = Object.values(input.weights).reduce((sum, value) => sum + Number(value || 0), 0)
  if (!active.length) errors.push('선택형 또는 서술형 배점을 하나 이상 입력해 주세요.')
  if (Math.abs(total - 100) > 0.05) errors.push(`난이도별 배점 합계가 ${round1(total)}점입니다. 100점으로 맞춰 주세요.`)
  if (!Number.isInteger(input.teacherCount) || input.teacherCount < 1 || input.teacherCount > 8) errors.push('교사 수는 1~8명이어야 합니다.')
  const targetValues = input.boundaries.map(boundary => input.targets[boundary])
  if (targetValues.some(value => value === null || !Number.isFinite(Number(value)))) errors.push('희망 분할점수를 모두 입력해 주세요.')
  if (targetValues.some(value => Number(value) < 0 || Number(value) > 100)) errors.push('희망 분할점수는 0~100점 사이여야 합니다.')
  if (targetValues.some((value, index) => index > 0 && Number(targetValues[index - 1]) <= Number(value))) errors.push('희망 분할점수는 A부터 엄격한 내림차순이어야 합니다.')
  return errors
}

export function optimizeCorrectRates(input: SplitPlannerInput): SplitPlannerResult {
  const errors = validateSplitPlannerInput(input)
  const active = activeCategories(input.weights)
  if (errors.length) {
    return {
      assignments: [], computed: emptySplitScores(), activeCategories: active,
      maxError: Number.POSITIVE_INFINITY, exact: false, withinTolerance: false, message: errors[0],
    }
  }

  const seeds = [-10, -5, 0, 5, 10].map(bias => makeSeed(input, bias)).filter(seed => validAssignments(seed, input))
  if (!seeds.length) seeds.push(makeSafeSeed(input))
  let best: { assignments: TeacherCorrectRates[]; scores: SplitScores; loss: number } | null = null

  seeds.forEach(seed => {
    let current = cloneAssignments(seed)
    let currentScores = weightedScores(current, input)
    let currentLoss = objective(currentScores, input)
    let improved = true
    let guard = 0
    while (improved && guard < 80) {
      improved = false
      guard += 1
      for (let teacherIndex = 0; teacherIndex < current.length; teacherIndex++) {
        for (const category of active) {
          for (const boundary of input.boundaries) {
            let localValue = current[teacherIndex][category.key][boundary]
            let localScores = currentScores
            let localLoss = currentLoss
            for (const candidate of STEP_VALUES) {
              if (candidate === localValue) continue
              const trial = cloneAssignments(current)
              trial[teacherIndex][category.key][boundary] = candidate
              if (!respectsBoundaryOrder(trial[teacherIndex][category.key], input.boundaries)) continue
              if (!respectsDifficultyOrder(trial[teacherIndex], input) || !respectsTypeOrder(trial[teacherIndex], input)) continue
              if (spread(trial, category.key, boundary) > MAX_TEACHER_SPREAD) continue
              const scores = weightedScores(trial, input)
              const loss = objective(scores, input)
              if (loss + Math.abs(candidate - localValue) * 0.00001 < localLoss) {
                localValue = candidate
                localScores = scores
                localLoss = loss
              }
            }
            if (localLoss < currentLoss) {
              current[teacherIndex][category.key][boundary] = localValue
              currentScores = localScores
              currentLoss = localLoss
              improved = true
            }
          }
        }
      }
    }
    if (!best || currentLoss < best.loss) best = { assignments: current, scores: currentScores, loss: currentLoss }
  })

  const resolved = best!
  const maxError = round1(Math.max(...input.boundaries.map(boundary => Math.abs(Number(resolved.scores[boundary]) - Number(input.targets[boundary])))))
  const onlyWritten = active.every(category => category.type === 'written')
  const onlyMc = active.every(category => category.type === 'mc')
  return {
    assignments: resolved.assignments,
    computed: resolved.scores,
    activeCategories: active,
    maxError,
    exact: maxError === 0,
    withinTolerance: maxError <= input.tolerance,
    message: onlyWritten
      ? '선택형 배점이 0점이므로 서술형 정답률만 계산했습니다.'
      : onlyMc
        ? '서술형 배점이 0점이므로 선택형 정답률만 계산했습니다.'
        : '선택형과 서술형을 함께 계산했으며, 같은 난이도에서는 선택형 정답률을 더 높게 제한했습니다.',
  }
}

export function weightedFinalCuts(components: ThresholdComponent[], boundaries: SplitBoundary[]): SplitScores {
  const output = emptySplitScores()
  boundaries.forEach(boundary => {
    output[boundary] = round1(components.reduce((sum, component) => {
      const cut = Number(component.splitScores?.[boundary])
      if (!Number.isFinite(cut) || component.maxScore <= 0) return sum
      return sum + cut / component.maxScore * component.weight
    }, 0))
  })
  return output
}

export function assignOutcome(score: number, cuts: SplitScores, boundaries: SplitBoundary[]): OutcomeLabel | null {
  for (const boundary of boundaries) {
    const cut = cuts[boundary]
    if (cut !== null && score >= cut) return boundary
  }
  if (!boundaries.length) return null
  if (boundaries.length === 2 && boundaries[0] === 'A' && boundaries[1] === 'B') return 'C'
  return boundaries.includes('E') ? '미도달' : 'E'
}

export function distributionCounts(rows: DistributionRow[], cuts: SplitScores, boundaries: SplitBoundary[]) {
  const labels = outcomeLabels(boundaries)
  const counts = Object.fromEntries(labels.map(label => [label, 0])) as Record<OutcomeLabel, number>
  rows.forEach(row => {
    const label = assignOutcome(row.integerScore, cuts, boundaries)
    if (label) counts[label] += 1
  })
  return counts
}

function allocateCounts(total: number, percentages: Partial<Record<OutcomeLabel, number>>, labels: OutcomeLabel[]) {
  const raw = labels.map(label => ({ label, value: total * Number(percentages[label] ?? 0) / 100 }))
  const counts = Object.fromEntries(raw.map(item => [item.label, Math.floor(item.value)])) as Record<OutcomeLabel, number>
  let remaining = total - Object.values(counts).reduce((sum, value) => sum + value, 0)
  raw.sort((a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value)))
  for (let index = 0; index < raw.length && remaining > 0; index++, remaining--) counts[raw[index].label] += 1
  return counts
}

function closestBoundaryForCount(scores: number[], wanted: number) {
  const unique = [...new Set(scores)].sort((a, b) => b - a)
  const candidates = [Math.max(101, (unique[0] ?? 100) + 0.1), ...unique]
  let best = { cut: candidates[0], count: 0, difference: Math.abs(wanted) }
  candidates.forEach(cut => {
    const count = scores.filter(score => score >= cut).length
    const difference = Math.abs(count - wanted)
    if (difference < best.difference || (difference === best.difference && Math.abs(cut - 50) < Math.abs(best.cut - 50))) {
      best = { cut, count, difference }
    }
  })
  return best
}

export function solveTargetDistribution(
  rows: DistributionRow[],
  components: ThresholdComponent[],
  targetComponentId: string,
  boundaries: SplitBoundary[],
  desiredPercentages: Partial<Record<OutcomeLabel, number>>,
): TargetDistributionResult {
  const labels = outcomeLabels(boundaries)
  const emptyCounts = Object.fromEntries(labels.map(label => [label, 0])) as Record<OutcomeLabel, number>
  const messages: string[] = []
  const targetComponent = components.find(component => component.id === targetComponentId)
  if (!rows.length || !targetComponent || targetComponent.weight <= 0 || targetComponent.maxScore <= 0) {
    return {
      targetCounts: emptyCounts, actualCounts: emptyCounts,
      recommendedComponentCuts: emptySplitScores(), finalCuts: emptySplitScores(), feasible: false,
      messages: ['학생 점수와 2차 시험 반영비율을 먼저 확인해 주세요.'],
    }
  }
  const percentTotal = labels.reduce((sum, label) => sum + Number(desiredPercentages[label] ?? 0), 0)
  const hasInvalidPercentage = labels.some(label => {
    const value = Number(desiredPercentages[label] ?? 0)
    return !Number.isFinite(value) || value < 0 || value > 100
  })
  if (hasInvalidPercentage) {
    return {
      targetCounts: emptyCounts, actualCounts: emptyCounts,
      recommendedComponentCuts: emptySplitScores(), finalCuts: emptySplitScores(), feasible: false,
      messages: ['성취도별 희망 비율은 각각 0~100% 사이로 입력해 주세요.'],
    }
  }
  if (Math.abs(percentTotal - 100) > 0.05) {
    return {
      targetCounts: emptyCounts, actualCounts: emptyCounts,
      recommendedComponentCuts: emptySplitScores(), finalCuts: emptySplitScores(), feasible: false,
      messages: [`희망 분포 합계가 ${round1(percentTotal)}%입니다. 100%로 맞춰 주세요.`],
    }
  }

  const targetCounts = allocateCounts(rows.length, desiredPercentages, labels)
  const scores = rows.map(row => row.integerScore)
  const desiredFinalCuts = emptySplitScores()
  let cumulative = 0
  boundaries.forEach(boundary => {
    cumulative += targetCounts[boundary]
    const selected = closestBoundaryForCount(scores, cumulative)
    desiredFinalCuts[boundary] = round1(selected.cut)
    if (selected.difference > 0) messages.push(`${boundary} 경계는 동점자 때문에 목표 누적인원과 ${selected.difference}명 차이가 납니다.`)
  })

  const recommended = emptySplitScores()
  let feasible = true
  boundaries.forEach((boundary, index) => {
    const otherContribution = components
      .filter(component => component.id !== targetComponentId)
      .reduce((sum, component) => {
        const cut = Number(component.splitScores?.[boundary])
        return Number.isFinite(cut) && component.maxScore > 0 ? sum + cut / component.maxScore * component.weight : sum
      }, 0)
    const raw = (Number(desiredFinalCuts[boundary]) - otherContribution) * targetComponent.maxScore / targetComponent.weight
    let adjusted = round1(clamp(raw, 0, targetComponent.maxScore))
    if (Math.abs(adjusted - raw) > 0.05) {
      feasible = false
      messages.push(`${boundary} 경계에 필요한 2차 분할점수 ${round1(raw)}점이 0~${targetComponent.maxScore}점 범위를 벗어납니다.`)
    }
    if (index > 0) {
      const previous = Number(recommended[boundaries[index - 1]])
      if (adjusted >= previous) {
        feasible = false
        adjusted = Math.max(0, round1(previous - 0.1))
        messages.push('2차 분할점수의 A→E 내림차순을 유지하도록 일부 값을 보정했습니다.')
      }
    }
    recommended[boundary] = adjusted
  })

  const scenarioComponents = components.map(component => component.id === targetComponentId
    ? { ...component, splitScores: recommended }
    : component)
  const finalCuts = weightedFinalCuts(scenarioComponents, boundaries)
  const actualCounts = distributionCounts(rows, finalCuts, boundaries)
  if (!messages.length) messages.push('입력한 희망 분포에 맞는 2차 시험 추정분할점수를 계산했습니다.')
  return { targetCounts, actualCounts, recommendedComponentCuts: recommended, finalCuts, feasible, messages }
}
