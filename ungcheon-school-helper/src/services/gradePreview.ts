import * as XLSX from 'xlsx'
import {
  activeSplitBoundaries, defaultSplitScores, emptySplitScores,
  type SplitScores,
} from './achievementScenario'

export type CalculationMode = 'term' | 'firstExam'
export type GradeSystem = '5' | '9' | 'none'
export type AchievementScale = 'ABCDE' | 'ABC' | 'none'

export interface GradePreviewConfig {
  calculationMode: CalculationMode
  gradeYear: '1' | '2' | '3'
  gradeSystem: GradeSystem
  achievementScale: AchievementScale
  includeNonattainment: boolean
  missingPolicy: 'zero' | 'exclude'
  splitMethod: 'fixed' | 'estimated'
  fixedBasis: 'general' | 'common'
  thresholds: SplitScores
}

export interface ScoreEntry {
  classNo: number
  studentNo: number
  studentName: string
  rawScore: number | null
  status: string
}

export interface GradeComponent {
  id: string
  name: string
  type: 'exam' | 'performance'
  weight: number
  maxScore: number
  splitScores: SplitScores
  scores: Record<string, ScoreEntry>
}

export interface GradeResult {
  key: string
  classNo: number
  studentNo: number
  studentName: string
  raw: Record<string, number | null>
  rawStatus: Record<string, string>
  converted: Record<string, number>
  exactTotal: number
  total: number
  integerScore: number
  notes: string[]
  rank: number
  tieCount: number
  midRank: number
  midPct: number
  grade: number | null
  boundaryTie: boolean
  achievement: string | null
}

export interface GradePreviewState {
  config: GradePreviewConfig
  components: GradeComponent[]
  componentCache: Partial<Record<CalculationMode, GradeComponent[]>>
  results: GradeResult[]
  calculatedAt: string | null
}

export type Matrix = { name: string; rows: unknown[][] }

export const STORAGE_KEY = 'ungcheon-grade-preview-v1'
export const cumulativeRates: Record<'5' | '9', number[]> = {
  '5': [10, 34, 66, 90, 100],
  '9': [4, 11, 23, 40, 60, 77, 89, 96, 100],
}

export function uid() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function defaultComponents(mode: CalculationMode): GradeComponent[] {
  if (mode === 'firstExam') {
    return [{ id: uid(), name: '1차 시험', type: 'exam', weight: 100, maxScore: 100, splitScores: defaultSplitScores(true), scores: {} }]
  }
  return [
    { id: uid(), name: '1차 지필평가', type: 'exam', weight: 30, maxScore: 100, splitScores: defaultSplitScores(true), scores: {} },
    { id: uid(), name: '2차 지필평가', type: 'exam', weight: 30, maxScore: 100, splitScores: defaultSplitScores(true), scores: {} },
    { id: uid(), name: '수행평가1', type: 'performance', weight: 40, maxScore: 100, splitScores: emptySplitScores({ A: 100, B: 90, C: 80, D: 70, E: 60 }), scores: {} },
  ]
}

export function defaultGradePreviewState(): GradePreviewState {
  return {
    config: {
      calculationMode: 'term', gradeYear: '1', gradeSystem: '5', achievementScale: 'ABCDE', includeNonattainment: true,
      missingPolicy: 'zero', splitMethod: 'estimated', fixedBasis: 'general',
      thresholds: emptySplitScores(),
    },
    components: defaultComponents('term'), componentCache: {}, results: [], calculatedAt: null,
  }
}

export function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function normalizeScoreRows(rows: Array<Record<string, unknown>>): Record<string, ScoreEntry> {
  const scores: Record<string, ScoreEntry> = {}
  rows.forEach(row => {
    const classNo = Math.trunc(numberValue(row.classNo) ?? 0)
    const studentNo = Math.trunc(numberValue(row.studentNo) ?? 0)
    const rawScore = numberValue(row.rawScore)
    const status = String(row.status ?? '').trim()
    if (!classNo || !studentNo || (rawScore === null && !status)) return
    scores[`${classNo}-${studentNo}`] = {
      classNo, studentNo, studentName: String(row.studentName ?? '').trim(), rawScore, status,
    }
  })
  return scores
}

export function parseMatrixGradeSheet(rows: unknown[][]): Array<Record<string, unknown>> {
  for (let r = 0; r < Math.min(rows.length, 80); r++) {
    for (let col = 0; col < (rows[r] ?? []).length; col++) {
      const label = String(rows[r]?.[col] ?? '').replace(/\s/g, '')
      if (!label.includes('반번호')) continue
      const classCols: Array<{ c: number; classNo: number }> = []
      for (let c = col + 1; c < (rows[r] ?? []).length; c++) {
        const classNo = numberValue(rows[r]?.[c])
        if (classNo !== null && classNo > 0 && classNo < 100) classCols.push({ c, classNo })
        else if (classCols.length && String(rows[r]?.[c] ?? '').trim() === '') break
      }
      if (!classCols.length) continue
      const output: Array<Record<string, unknown>> = []
      for (let rr = r + 1; rr < rows.length; rr++) {
        const studentNo = numberValue(rows[rr]?.[col])
        if (studentNo === null) {
          if (output.length && rr > r + 4) break
          continue
        }
        if (studentNo <= 0 || studentNo > 999) continue
        classCols.forEach(({ c, classNo }) => {
          const value = rows[rr]?.[c]
          const rawScore = numberValue(value)
          const status = rawScore === null ? String(value ?? '').trim() : ''
          if (rawScore !== null || status) output.push({ classNo, studentNo, studentName: '', rawScore, status })
        })
      }
      if (output.length) return output
    }
  }
  return []
}

export interface ColumnMapping {
  startRow: number
  cols: { classCol: number; noCol: number; nameCol: number; scoreCol: number }
}

export function parseColumnGradeSheet(rows: unknown[][], mapping?: ColumnMapping): Array<Record<string, unknown>> {
  let header = -1
  let cols = { classCol: -1, noCol: -1, scoreCol: -1, nameCol: -1 }
  if (mapping) {
    header = mapping.startRow - 2
    cols = mapping.cols
  } else {
    for (let r = 0; r < Math.min(rows.length, 50); r++) {
      const normalized = (rows[r] ?? []).map(value => String(value).replace(/\s/g, '').toLowerCase())
      const find = (names: string[]) => normalized.findIndex(value => names.some(name => value === name || value.includes(name)))
      const classCol = find(['반', '학급', 'class'])
      const noCol = find(['번호', '번', 'studentno'])
      const scoreCol = find(['점수', '원점수', '득점', 'score'])
      const nameCol = find(['성명', '이름', '학생명', 'name'])
      if (classCol >= 0 && noCol >= 0 && scoreCol >= 0) {
        header = r
        cols = { classCol, noCol, scoreCol, nameCol }
        break
      }
    }
  }
  if (header < -1) return []
  const output: Array<Record<string, unknown>> = []
  for (let r = header + 1; r < rows.length; r++) {
    const classNo = numberValue(rows[r]?.[cols.classCol])
    const studentNo = numberValue(rows[r]?.[cols.noCol])
    const value = rows[r]?.[cols.scoreCol]
    const rawScore = numberValue(value)
    const status = rawScore === null ? String(value ?? '').trim() : ''
    if (classNo === null || studentNo === null || (!status && rawScore === null)) continue
    output.push({
      classNo, studentNo,
      studentName: cols.nameCol >= 0 ? String(rows[r]?.[cols.nameCol] ?? '').trim() : '',
      rawScore, status,
    })
  }
  return output
}

export function detectMaxScore(matrices: Matrix[]): number | null {
  for (const matrix of matrices) {
    for (const row of matrix.rows) {
      for (const cell of row) {
        const text = String(cell ?? '').replace(/\s/g, '')
        const match = text.match(/(?:영역)?만점[:：]?([0-9]+(?:\.[0-9]+)?)/)
        const value = match ? numberValue(match[1]) : null
        if (value !== null && value > 0) return value
      }
    }
  }
  return null
}

export function columnIndex(text: string) {
  const normalized = text.trim().toUpperCase()
  if (!/^[A-Z]+$/.test(normalized)) return -1
  return [...normalized].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1
}

export function validateGradePreviewState(state: GradePreviewState): string[] {
  const errors: string[] = []
  const total = state.components.reduce((sum, component) => sum + (numberValue(component.weight) ?? 0), 0)
  if (Math.abs(total - 100) > 0.0001) errors.push(`반영비율 합계가 ${round2(total)}%입니다. 100%로 맞춰 주세요.`)
  if (!state.components.length) errors.push('평가 항목을 하나 이상 추가해 주세요.')
  state.components.forEach(component => {
    if (!component.name.trim()) errors.push('평가 항목 이름을 입력해 주세요.')
    if (!((numberValue(component.maxScore) ?? 0) > 0)) errors.push(`${component.name || '평가 항목'}의 만점은 0보다 커야 합니다.`)
    if (state.config.splitMethod === 'estimated' && state.config.achievementScale !== 'none' && component.weight > 0) {
      const keys = activeSplitBoundaries(state.config.includeNonattainment, state.config.achievementScale)
      const values = keys.map(key => component.splitScores?.[key])
      if (values.some(value => numberValue(value) === null)) errors.push(`${component.name || '평가 항목'}의 분할점수를 모두 입력해 주세요.`)
      if (values.some((value, index) => index > 0 && Number(values[index - 1]) <= Number(value))) errors.push(`${component.name || '평가 항목'}의 분할점수는 A부터 내림차순이어야 합니다.`)
    }
  })
  if (state.config.splitMethod === 'estimated' && state.config.achievementScale !== 'none') {
    const keys = activeSplitBoundaries(state.config.includeNonattainment, state.config.achievementScale)
    const values = keys.map(key => state.config.thresholds[key])
    const any = values.some(value => value !== null)
    if (any && values.some(value => numberValue(value) === null)) errors.push('추정분할 점수는 모두 입력하거나 모두 비워 주세요.')
    if (any && values.some((value, index) => index > 0 && Number(values[index - 1]) <= Number(value))) errors.push('추정분할 점수는 A부터 내림차순으로 입력해 주세요.')
  }
  return errors
}

export function calculateGradePreview(state: GradePreviewState): GradeResult[] {
  const keys = new Set<string>()
  state.components.forEach(component => Object.keys(component.scores).forEach(key => keys.add(key)))
  const rows: GradeResult[] = []
  keys.forEach(key => {
    const available = state.components.map(component => component.scores[key])
    const missing = available.some(entry => !entry || numberValue(entry.rawScore) === null)
    if (missing && state.config.missingPolicy === 'exclude') return
    const identity = available.find(Boolean)
    if (!identity) return
    const row: GradeResult = {
      key, classNo: identity.classNo, studentNo: identity.studentNo,
      studentName: available.find(entry => entry?.studentName)?.studentName ?? '',
      raw: {}, rawStatus: {}, converted: {}, exactTotal: 0, total: 0, integerScore: 0,
      notes: [], rank: 0, tieCount: 0, midRank: 0, midPct: 0, grade: null,
      boundaryTie: false, achievement: null,
    }
    state.components.forEach((component, index) => {
      const score = available[index]
      const hasScore = Boolean(score && numberValue(score.rawScore) !== null)
      const raw = hasScore ? (numberValue(score.rawScore) ?? 0) : 0
      row.raw[component.id] = hasScore ? raw : null
      row.rawStatus[component.id] = score?.status ?? ''
      const converted = raw / Number(component.maxScore) * Number(component.weight)
      row.converted[component.id] = converted
      row.exactTotal += converted
      if (!hasScore) row.notes.push(`${component.name} ${score?.status || '미입력'}(0점 처리)`)
    })
    row.total = round2(row.exactTotal)
    row.integerScore = Math.round(row.total)
    rows.push(row)
  })

  rows.sort((a, b) => b.total - a.total || a.classNo - b.classNo || a.studentNo - b.studentNo)
  const rates = state.config.gradeSystem === 'none' ? [] : cumulativeRates[state.config.gradeSystem]
  const count = rows.length
  for (let i = 0; i < rows.length;) {
    let j = i + 1
    while (j < rows.length && Math.abs(rows[j].total - rows[i].total) < 1e-9) j++
    const rank = i + 1
    const tieCount = j - i
    const midRank = rank + (tieCount - 1) / 2
    const midPct = midRank / count * 100
    let grade: number | null = null
    let boundaryTie = false
    if (rates.length) {
      const counts = rates.map(percent => Math.round(count * percent / 100))
      boundaryTie = counts.some((cutoff, index) => index < counts.length - 1 && rank <= cutoff && rank + tieCount - 1 > cutoff)
      grade = boundaryTie ? rates.findIndex(percent => midPct <= percent) + 1 : counts.findIndex(cutoff => rank <= cutoff) + 1
      if (grade <= 0) grade = rates.length
    }
    for (let k = i; k < j; k++) Object.assign(rows[k], { rank, tieCount, midRank, midPct, grade, boundaryTie })
    i = j
  }
  rows.forEach(row => { row.achievement = calculateAchievement(row, state.config) })
  return rows
}

export function calculateAchievement(row: GradeResult, config: GradePreviewConfig): string | null {
  if (config.achievementScale === 'none') return null
  let thresholds: Array<[string, number]>
  if (config.splitMethod === 'estimated') {
    const keys = activeSplitBoundaries(config.includeNonattainment, config.achievementScale)
    if (keys.some(key => numberValue(config.thresholds[key]) === null)) return null
    thresholds = keys.map(key => [key, Number(config.thresholds[key])])
  } else if (config.achievementScale === 'ABC') thresholds = [['A', 80], ['B', 60]]
  else thresholds = [['A', 90], ['B', 80], ['C', 70], ['D', 60]]
  for (const [label, cutoff] of thresholds) if (row.integerScore >= cutoff) return label
  if (config.achievementScale === 'ABCDE' && config.fixedBasis === 'common' && row.integerScore < 40) {
    row.notes.push('40점 미만: 학교 규정에 따른 최저 성취수준 처리 확인')
  }
  if (config.achievementScale === 'ABC') return 'C'
  return config.includeNonattainment ? '미도달' : 'E'
}

export function buildGradeCutSummary(rows: GradeResult[], system: GradeSystem) {
  const rates = system === 'none' ? [] : cumulativeRates[system]
  return rates.map((rate, index) => {
    const group = rows.filter(row => row.grade === index + 1)
    const totals = group.map(row => row.total)
    return {
      grade: index + 1, rate,
      expected: Math.round(rows.length * rate / 100) - (index ? Math.round(rows.length * rates[index - 1] / 100) : 0),
      actual: group.length,
      min: totals.length ? Math.min(...totals) : null,
      max: totals.length ? Math.max(...totals) : null,
      boundaryTie: group.some(row => row.boundaryTie),
    }
  })
}

export function exportRestoreWorkbook(state: GradePreviewState) {
  const workbook = XLSX.utils.book_new()
  const readme = [
    ['성적 산출 미리 해보기 복원 파일'],
    ['이 파일은 설정·점수·현재 계산 결과를 다른 PC에서 복원하기 위한 파일입니다.'],
    ['학생 개인정보와 점수정보가 포함될 수 있으므로 안전하게 보관하세요.'],
    ['생성 시각', new Date().toLocaleString('ko-KR')],
  ]
  const config = [
    ['key', 'value'],
    ...Object.entries(state.config).filter(([key]) => key !== 'thresholds').map(([key, value]) => [key, value]),
    ...Object.entries(state.config.thresholds).map(([key, value]) => [`threshold_${key}`, value ?? '']),
  ]
  const components = [['id', 'name', 'type', 'weight', 'maxScore', 'splitA', 'splitB', 'splitC', 'splitD', 'splitE'], ...state.components.map(component => [component.id, component.name, component.type, component.weight, component.maxScore, component.splitScores.A ?? '', component.splitScores.B ?? '', component.splitScores.C ?? '', component.splitScores.D ?? '', component.splitScores.E ?? ''])]
  const scores: unknown[][] = [['classNo', 'studentNo', 'studentName', 'componentId', 'rawScore', 'status']]
  state.components.forEach(component => Object.values(component.scores).forEach(score => scores.push([score.classNo, score.studentNo, score.studentName, component.id, score.rawScore, score.status])))
  const results = [['classNo', 'studentNo', 'studentName', 'total', 'integerScore', 'rank', 'tieCount', 'midRank', 'midPct', 'grade', 'achievement', 'notes'], ...state.results.map(row => [row.classNo, row.studentNo, row.studentName, row.total, row.integerScore, row.rank, row.tieCount, row.midRank, row.midPct, row.grade ?? '', row.achievement ?? '', row.notes.join(', ')])]
  ;([['README', readme], ['CONFIG', config], ['COMPONENTS', components], ['SCORES', scores], ['RESULTS', results]] as Array<[string, unknown[][]]>).forEach(([name, data]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), name))
  XLSX.writeFile(workbook, `성적_산출_미리보기_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export async function importRestoreWorkbook(file: File): Promise<GradePreviewState> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  for (const required of ['CONFIG', 'COMPONENTS', 'SCORES']) if (!workbook.SheetNames.includes(required)) throw new Error(`missing ${required}`)
  const config = defaultGradePreviewState().config
  const configRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.CONFIG, { defval: '' })
  configRows.forEach(row => {
    const key = String(row.key)
    if (key.startsWith('threshold_')) config.thresholds[key.slice(10) as keyof typeof config.thresholds] = numberValue(row.value)
    else if (key === 'includeNonattainment') config.includeNonattainment = String(row.value).toLowerCase() === 'true'
    else if (key in config && key !== 'thresholds') (config as unknown as Record<string, unknown>)[key] = String(row.value)
  })
  const components = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.COMPONENTS, { defval: '' }).map(row => ({
    id: String(row.id), name: String(row.name), type: String(row.type) as GradeComponent['type'],
    weight: Number(row.weight), maxScore: Number(row.maxScore),
    splitScores: emptySplitScores({ A: numberValue(row.splitA), B: numberValue(row.splitB), C: numberValue(row.splitC), D: numberValue(row.splitD), E: numberValue(row.splitE) }),
    scores: {} as Record<string, ScoreEntry>,
  }))
  XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.SCORES, { defval: '' }).forEach(row => {
    const component = components.find(item => item.id === String(row.componentId))
    if (component) Object.assign(component.scores, normalizeScoreRows([row]))
  })
  if (!components.length) throw new Error('no components')
  if (!config.calculationMode) config.calculationMode = 'term'
  if (config.calculationMode === 'firstExam') {
    components.splice(1)
    components[0].type = 'exam'
    components[0].weight = 100
  }
  return { config, components, componentCache: {}, results: [], calculatedAt: null }
}

export async function readScoreWorkbook(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const matrices: Matrix[] = workbook.SheetNames.map(name => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' }),
  }))
  let parsed: Array<Record<string, unknown>> = []
  for (const matrix of matrices) {
    parsed = parseMatrixGradeSheet(matrix.rows)
    if (parsed.length) break
    parsed = parseColumnGradeSheet(matrix.rows)
    if (parsed.length) break
  }
  return { matrices, parsed, detectedMax: detectMaxScore(matrices) }
}
