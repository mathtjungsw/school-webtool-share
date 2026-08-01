export const TRANSFER_GRADE_POINTS = {
  가: 4,
  나: 4.5,
  다: 5,
  라: 5.5,
  마: 6,
  바: 6.5,
  사: 7,
} as const

export type TransferGrade = keyof typeof TRANSFER_GRADE_POINTS

export interface CareerPeriodInput {
  id: string
  schoolName: string
  grade: TransferGrade
  startDate: string
  endDate: string
}

export interface CareerPeriodResult extends CareerPeriodInput {
  appliedStartDate: string
  appliedEndDate: string
  months: number
  annualPoint: number
  score: number
}

export interface EducationActivityDefinition {
  id: string
  label: string
  annualPoint: number
  cap?: number
  condition: string
}

export const EDUCATION_ACTIVITY_DEFINITIONS: EducationActivityDefinition[] = [
  { id: 'homeroom', label: '담임교사', annualPoint: 0.3, condition: '2010.3.1. 이후 경력' },
  { id: 'school_violence', label: '학교폭력책임교사', annualPoint: 0.3, condition: '2027.3.1. 이후, 학교별 1명 한정' },
  { id: 'dual_subject', label: '2과목 이상 지도교사', annualPoint: 0.2, condition: '복수·부전공 자격, 2과목 이상 지도' },
  { id: 'athlete_coach', label: '선수육성 지도교사', annualPoint: 0.25, condition: '2011.3.1. 이후 인정 경력' },
  { id: 'department_head', label: '부장교사', annualPoint: 0.4, condition: '2021.3.1. 이후 경력' },
  { id: 'joint_curriculum', label: '공동교육과정 수업교사', annualPoint: 0.2, condition: '2022.3.1. 이후, 일과시간 내 수업' },
  { id: 'concurrent_one', label: '1개 학교 겸임', annualPoint: 0.5, condition: '통합운영학교 겸임 포함' },
  { id: 'concurrent_two', label: '2개 학교 겸임', annualPoint: 0.7, condition: '2010.3.1. 이후' },
  { id: 'broadcast_adjunct', label: '방송통신중·고 겸직', annualPoint: 0.2, cap: 0.6, condition: '2004.3.1. 이후, 상한 0.60점' },
  { id: 'research_school', label: '연구·시범학교', annualPoint: 0.5, condition: '전보 가산점 인정 교사' },
  { id: 'training_cooperation', label: '연수협력학교', annualPoint: 0.3, condition: '2012.3.1. 이후, 교당 매년 2명 이내' },
  { id: 'common_practice', label: '공동 실습소', annualPoint: 0.25, condition: '농업계·공업계 전문교과 교사' },
  { id: 'dormitory_supervisor', label: '기숙사 사감', annualPoint: 0.2, cap: 0.6, condition: '인정 대상자, 상한 0.60점' },
  { id: 'special_school_nurse', label: '특수학교 보건교사', annualPoint: 0.3, condition: '2027.3.1. 이후 경력' },
  { id: 'specialized_school', label: '각종학교', annualPoint: 0.2, condition: '별표3 지정 학교 경력' },
  { id: 'happiness_school', label: '행복(나눔)학교', annualPoint: 0.2, cap: 0.6, condition: '점수 인정 경력만 입력, 최대 0.60점' },
]

export interface SelectOption {
  id: string
  label: string
  score: number
}

export const COMMENDATION_OPTIONS: SelectOption[] = [
  { id: '', label: '해당 없음', score: 0 },
  { id: 'life_guidance', label: '생활지도 표창(교육감)', score: 1.5 },
  { id: 'general_education', label: '교육일반 표창', score: 1 },
  { id: 'university_president', label: '대학교총장 표창(2010.3.1. 이후)', score: 0.7 },
  { id: 'direct_agency', label: '직속기관장 표창', score: 0.7 },
]

export const QUALIFICATION_OPTIONS: SelectOption[] = [
  { id: '', label: '해당 없음', score: 0 },
  { id: 'technical', label: '교과지도에 직접 필요한 기술자격증', score: 0.5 },
]

export const ENGLISH_OPTIONS: SelectOption[] = [
  { id: '', label: '해당 없음', score: 0 },
  { id: 'high', label: '상위 기준 충족(TSE-P 50·TOEFL 92·TOEIC 800·TEPS 712/393 이상)', score: 1 },
  { id: 'middle', label: '중간 기준 충족(TSE-P 45·TOEFL 80·TOEIC 700·TEPS 602/328 이상)', score: 0.5 },
]

export const TEE_OPTIONS: SelectOption[] = [
  { id: '', label: '해당 없음', score: 0 },
  { id: 'tee', label: '우수교사(하급) 또는 특별교사(상급) 인증서', score: 0.5 },
  { id: 'tee_both', label: '전보 전 우수교사 + 전보 후 특별교사 인증', score: 1 },
]

export const PREFERENCE_OPTIONS: SelectOption[] = [
  { id: '', label: '해당 없음', score: 0 },
  { id: 'veteran', label: '국가유공자 본인 또는 그 부양자', score: 1 },
  { id: 'severe_disability', label: '장애 정도가 심한 장애인', score: 1 },
  { id: 'mild_disability', label: '장애 정도가 심하지 않은 장애인', score: 0.5 },
  { id: 'parent_support', label: '본인·배우자 부모 1년 이상 실제 봉양', score: 0.5 },
  { id: 'children_three', label: '만 20세 미만 자녀 3명 이상', score: 1 },
  { id: 'children_two', label: '만 20세 미만 자녀 2명', score: 0.6 },
  { id: 'children_one', label: '만 20세 미만 자녀 1명', score: 0.3 },
  { id: 'teacher_couple', label: '배우자 근무지역으로 전보하는 부부교원', score: 0.5 },
  { id: 'age_55', label: '정기인사일 기준 만 55세 이상', score: 0.5 },
  { id: 'fallen_teacher_family', label: '순직 교원의 배우자·자녀·며느리', score: 1 },
]

export interface AdditionalScoreInput {
  commendation: string
  nationalAthleteAwards: number
  ministerAwards: number
  studyGuidanceAwards: number
  competitionGuidanceAwards: number
  qualification: string
  english: string
  tee: string
  preference: string
  integrityContribution: boolean
}

export interface TransferScoreInput {
  evaluationDate: string
  careerPeriods: CareerPeriodInput[]
  educationActivityMonths: Record<string, number>
  additional: AdditionalScoreInput
}

export interface ScoreBreakdownItem {
  id: string
  label: string
  detail: string
  score: number
}

export interface TransferScoreResult {
  workCareerScore: number
  workCareerMonths: number
  careerPeriodResults: CareerPeriodResult[]
  evaluationCareerMonths: number
  longServiceBaseScore: number
  longServiceExtraScore: number
  educationActivityScore: number
  educationItems: ScoreBreakdownItem[]
  additionalScore: number
  additionalItems: ScoreBreakdownItem[]
  totalScore: number
  warnings: string[]
}

const DAY_MS = 86_400_000

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function subtractUtcYears(date: Date, years: number): Date {
  const year = date.getUTCFullYear() - years
  const month = date.getUTCMonth()
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  return new Date(Date.UTC(year, month, day))
}

function periodWindowStart(evaluationDate: Date, years: number): Date {
  return subtractUtcYears(addUtcDays(evaluationDate, 1), years)
}

export function roundScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export function roundedMonthsInclusive(startValue: string, endValue: string): number {
  const start = parseDate(startValue)
  const end = parseDate(endValue)
  if (!start || !end || end < start) return 0

  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth()
  if (end.getUTCDate() < start.getUTCDate()) months -= 1

  const anchorYear = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + months) / 12)
  const anchorMonth = (start.getUTCMonth() + months + 1200) % 12
  const anchorDay = Math.min(start.getUTCDate(), new Date(Date.UTC(anchorYear, anchorMonth + 1, 0)).getUTCDate())
  const anchor = new Date(Date.UTC(anchorYear, anchorMonth, anchorDay))
  const remainingDays = Math.floor((end.getTime() - anchor.getTime()) / DAY_MS) + 1
  if (remainingDays >= 15) months += 1
  return Math.max(0, months)
}

export function scoreMonths(months: number, annualPoint: number): number {
  const safeMonths = Math.max(0, Math.floor(months))
  const fullYears = Math.floor(safeMonths / 12)
  const remainder = safeMonths % 12
  const monthlyPoint = roundScore(annualPoint / 12)
  return roundScore(fullYears * annualPoint + remainder * monthlyPoint)
}

function overlapRange(startValue: string, endValue: string, windowStart: Date, windowEnd: Date) {
  const start = parseDate(startValue)
  const end = parseDate(endValue)
  if (!start || !end || end < start) return null
  const appliedStart = start > windowStart ? start : windowStart
  const appliedEnd = end < windowEnd ? end : windowEnd
  if (appliedEnd < appliedStart) return null
  return { start: appliedStart, end: appliedEnd }
}

function mergeRanges(ranges: Array<{ start: Date; end: Date }>) {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: Array<{ start: Date; end: Date }> = []
  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (!previous || range.start.getTime() > addUtcDays(previous.end, 1).getTime()) {
      merged.push({ ...range })
    } else if (range.end > previous.end) {
      previous.end = range.end
    }
  }
  return merged
}

function hasOverlappingRanges(ranges: Array<{ start: Date; end: Date }>): boolean {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime())
  let latestEnd: Date | null = null
  for (const range of sorted) {
    if (latestEnd && range.start <= latestEnd) return true
    if (!latestEnd || range.end > latestEnd) latestEnd = range.end
  }
  return false
}

function bandScore(totalMonths: number, startExclusive: number, endInclusive: number, annualPoint: number): number {
  const months = Math.max(0, Math.min(totalMonths, endInclusive) - startExclusive)
  return scoreMonths(months, annualPoint)
}

export function calculateLongServiceBonus(totalMonths: number) {
  const months = Math.max(0, Math.min(60, Math.floor(totalMonths)))
  const base = roundScore(
    bandScore(months, 12, 24, 1)
    + bandScore(months, 24, 36, 2)
    + bandScore(months, 36, 48, 3)
    + bandScore(months, 48, 60, 3),
  )
  const extra = roundScore(bandScore(months, 36, 48, 2) + bandScore(months, 48, 60, 2))
  return { base, extra, total: roundScore(base + extra) }
}

function findOption(options: SelectOption[], id: string): SelectOption {
  return options.find(option => option.id === id) ?? options[0]
}

function countScore(count: number, point: number, maxCount: number): number {
  return roundScore(Math.max(0, Math.min(maxCount, Math.floor(Number(count) || 0))) * point)
}

export function calculateTransferScore(input: TransferScoreInput): TransferScoreResult {
  const warnings: string[] = []
  const evaluationDate = parseDate(input.evaluationDate)
  if (!evaluationDate) {
    return {
      workCareerScore: 0, workCareerMonths: 0, careerPeriodResults: [], evaluationCareerMonths: 0,
      longServiceBaseScore: 0, longServiceExtraScore: 0, educationActivityScore: 0, educationItems: [],
      additionalScore: 0, additionalItems: [], totalScore: 0, warnings: ['평정기준일을 확인해주세요.'],
    }
  }

  const workWindowStart = periodWindowStart(evaluationDate, 3)
  const evaluationWindowStart = periodWindowStart(evaluationDate, 5)
  const validRawRanges: Array<{ start: Date; end: Date }> = []
  const careerPeriodResults: CareerPeriodResult[] = []

  for (const period of input.careerPeriods) {
    const rawStart = parseDate(period.startDate)
    const rawEnd = parseDate(period.endDate)
    if (!rawStart || !rawEnd) continue
    if (rawEnd < rawStart) {
      warnings.push(`${period.schoolName || '근무경력'}의 종료일이 시작일보다 빠릅니다.`)
      continue
    }
    const evaluationRange = overlapRange(period.startDate, period.endDate, evaluationWindowStart, evaluationDate)
    if (evaluationRange) validRawRanges.push(evaluationRange)
    const applied = overlapRange(period.startDate, period.endDate, workWindowStart, evaluationDate)
    if (!applied) continue
    const months = roundedMonthsInclusive(formatDate(applied.start), formatDate(applied.end))
    const annualPoint = TRANSFER_GRADE_POINTS[period.grade]
    careerPeriodResults.push({
      ...period,
      appliedStartDate: formatDate(applied.start),
      appliedEndDate: formatDate(applied.end),
      months,
      annualPoint,
      score: scoreMonths(months, annualPoint),
    })
  }

  if (input.careerPeriods.every(period => !period.startDate || !period.endDate)) {
    warnings.push('현임교 근무기간을 입력해주세요.')
  }
  if (input.careerPeriods.some(period => Boolean(period.startDate) !== Boolean(period.endDate))) {
    warnings.push('시작일 또는 종료일만 입력된 근무경력이 있습니다.')
  }
  if (hasOverlappingRanges(validRawRanges)) {
    warnings.push('근무기간이 서로 겹칩니다. 급지 변경 구간은 날짜가 중복되지 않도록 나눠 입력해주세요.')
  }

  const mergedEvaluationRanges = mergeRanges(validRawRanges)
  const evaluationCareerMonths = Math.min(60, mergedEvaluationRanges.reduce(
    (sum, range) => sum + roundedMonthsInclusive(formatDate(range.start), formatDate(range.end)),
    0,
  ))
  const workCareerMonths = careerPeriodResults.reduce((sum, period) => sum + period.months, 0)
  if (workCareerMonths > 36) warnings.push('최근 3년 근무월수가 36개월을 초과합니다. 입력 기간의 중복 여부를 확인해주세요.')
  const workCareerScore = roundScore(careerPeriodResults.reduce((sum, period) => sum + period.score, 0))

  const longService = calculateLongServiceBonus(evaluationCareerMonths)
  const educationItems: ScoreBreakdownItem[] = []
  if (longService.base > 0) {
    educationItems.push({ id: 'long_base', label: '근무경력부가점(기본 누진)', detail: `${evaluationCareerMonths}개월 · 2~5년차 연 1·2·3·3점`, score: longService.base })
  }
  if (longService.extra > 0) {
    educationItems.push({ id: 'long_extra', label: '근무경력부가점(장기 추가)', detail: `${evaluationCareerMonths}개월 · 최근 3년 초과~5년 연 2점`, score: longService.extra })
  }

  for (const definition of EDUCATION_ACTIVITY_DEFINITIONS) {
    const months = Math.max(0, Math.min(60, Math.floor(Number(input.educationActivityMonths[definition.id]) || 0)))
    if (!months) continue
    let score = scoreMonths(months, definition.annualPoint)
    if (definition.cap !== undefined) score = Math.min(score, definition.cap)
    educationItems.push({ id: definition.id, label: definition.label, detail: `${months}개월 · 연 ${definition.annualPoint.toFixed(2)}점${definition.cap ? ` · 상한 ${definition.cap.toFixed(2)}점` : ''}`, score: roundScore(score) })
  }
  const educationActivityScore = roundScore(educationItems.reduce((sum, item) => sum + item.score, 0))

  const additionalItems: ScoreBreakdownItem[] = []
  const pushOption = (group: string, option: SelectOption) => {
    if (option.score > 0) additionalItems.push({ id: `${group}:${option.id}`, label: option.label, detail: '별표4 선택 항목', score: option.score })
  }
  pushOption('commendation', findOption(COMMENDATION_OPTIONS, input.additional.commendation))

  const counted = [
    ['national_athlete', '전국소년체육대회·전국체육대회 학생 지도', input.additional.nationalAthleteAwards, 0.75, 5],
    ['minister_award', '교육감상·장관상·국무총리상·대통령상', input.additional.ministerAwards, 0.5, 5],
    ['study_guidance', '교수학습지도연구대회 등 학습지도 실적', input.additional.studyGuidanceAwards, 0.75, 99],
    ['competition_guidance', '별표4 인정 대회 학생 지도 실적', input.additional.competitionGuidanceAwards, 0.5, 5],
  ] as const
  for (const [id, label, count, point, maxCount] of counted) {
    const appliedCount = Math.max(0, Math.min(maxCount, Math.floor(Number(count) || 0)))
    const score = countScore(count, point, maxCount)
    if (score > 0) additionalItems.push({ id, label, detail: `${appliedCount}회 × ${point.toFixed(2)}점`, score })
  }
  if ((Number(input.additional.nationalAthleteAwards) || 0) + (Number(input.additional.ministerAwards) || 0) > 5) {
    warnings.push('상장은 같은 학년도에 하나만 인정되므로 최근 5년 인정 횟수 합계는 최대 5회입니다.')
  }
  const recognitionGroupsUsed = [
    input.additional.commendation ? 1 : 0,
    input.additional.nationalAthleteAwards > 0 ? 1 : 0,
    input.additional.ministerAwards > 0 ? 1 : 0,
    input.additional.competitionGuidanceAwards > 0 ? 1 : 0,
  ].reduce((sum, used) => sum + used, 0)
  if (recognitionGroupsUsed > 1) {
    warnings.push('표창·상장·대회지도는 동일 실적을 중복 적용할 수 없고, 상장·대회지도는 같은 학년도에 하나만 인정됩니다.')
  }

  pushOption('qualification', findOption(QUALIFICATION_OPTIONS, input.additional.qualification))
  pushOption('english', findOption(ENGLISH_OPTIONS, input.additional.english))
  pushOption('tee', findOption(TEE_OPTIONS, input.additional.tee))
  pushOption('preference', findOption(PREFERENCE_OPTIONS, input.additional.preference))
  if (input.additional.integrityContribution) {
    additionalItems.push({ id: 'integrity', label: '청렴도 향상 기여', detail: '현임교 1회', score: 0.5 })
  }

  const additionalScore = roundScore(additionalItems.reduce((sum, item) => sum + item.score, 0))
  const totalScore = roundScore(workCareerScore + educationActivityScore + additionalScore)

  return {
    workCareerScore,
    workCareerMonths,
    careerPeriodResults,
    evaluationCareerMonths,
    longServiceBaseScore: longService.base,
    longServiceExtraScore: longService.extra,
    educationActivityScore,
    educationItems,
    additionalScore,
    additionalItems,
    totalScore,
    warnings,
  }
}
