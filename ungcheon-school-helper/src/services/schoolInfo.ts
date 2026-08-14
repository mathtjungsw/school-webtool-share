export interface SchoolInfoSchool {
  name: string
  shlIdfCd: string
  schoolCode: string
  sido: string
  sgg: string
  dong: string
  kind: string
  foundation: string
  address: string
}

export interface SchoolInfoEvaluationFile {
  seq: string
  filename: string
  sizeKB: number
  downloadUrl: string
}

export interface SchoolInfoEvaluationRequest {
  school: SchoolInfoSchool
  year: number
  semester: 1 | 2
  grade: 1 | 2 | 3
  subject: string
  force?: boolean
}

export interface SchoolInfoEvaluationResponse {
  school: SchoolInfoSchool
  year: number
  semester: 1 | 2
  grade: 1 | 2 | 3
  subject: string
  markdown: string
  originalLength: number
  scope: 'subject' | 'document'
  matchStatus: 'exact' | 'review' | 'not-found'
  matchBasis: 'achievement-code' | 'subject-name' | 'none'
  achievementCodePrefix: string | null
  achievementCodeStatus: string
  matchedAchievementCodes: string[]
  files: SchoolInfoEvaluationFile[]
  primaryFile: SchoolInfoEvaluationFile | null
  fetchedAt: string
  cached: boolean
  privacyNote: string
}

export interface SchoolInfoSearchResponse {
  schools: SchoolInfoSchool[]
  fetchedAt: string
  cached: boolean
}

export async function searchSchoolInfoSchools(query: string, force = false) {
  return window.electron.schoolInfoSearchSchools(query, force)
}

export async function searchSchoolInfoSchoolsByRegion(sido: string, sgg: string, force = false) {
  return window.electron.schoolInfoSearchSchoolsByRegion(sido, sgg, force)
}

export async function getSchoolInfoEvaluationPlan(request: SchoolInfoEvaluationRequest) {
  return window.electron.schoolInfoGetEvaluationPlan(request)
}

export function clearSchoolInfoCache() {
  return window.electron.schoolInfoClearCache()
}

export function cleanEvaluationPlanText(markdown: string) {
  const decoded = markdown
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|p|div|table)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' │ ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')

  return decoded
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^>\s?/, '')
      .replace(/^\|\s*/, '')
      .replace(/\s*\|\s*$/, '')
      .replace(/\s*\|\s*/g, ' │ ')
      .replace(/\\~/g, '~')
      .trim())
    .filter((line) => line && !/^(?:---+|(?:\s*:?---+:?\s*│?)+)$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}
