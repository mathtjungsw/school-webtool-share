export type AchievementCurriculumRevision = '2015' | '2022'

export interface AchievementStandardSubjectRecord {
  curriculumRevision: AchievementCurriculumRevision
  officialSubjectName: string
  codePrefix: string | null
  matchPattern: string | null
  status: 'verified' | 'no-coded-standards-in-source' | string
  exampleCodes?: string[]
}

export interface AchievementStandardDataset {
  schemaVersion: number
  records: AchievementStandardSubjectRecord[]
}

export function normalizeOfficialSubjectKey(value: string) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\s·ㆍ()\[\]{}_-]+/g, '')
    .replace(/[Ⅰ]/g, '1')
    .replace(/[Ⅱ]/g, '2')
    .toLowerCase()
}

export function curriculumRevisionForCurrentGrade(grade: 1 | 2 | 3): AchievementCurriculumRevision {
  return grade === 3 ? '2015' : '2022'
}

export function findAchievementStandardRecord(
  dataset: AchievementStandardDataset,
  subject: string,
  grade: 1 | 2 | 3,
) {
  const revision = curriculumRevisionForCurrentGrade(grade)
  const subjectKey = normalizeOfficialSubjectKey(subject)
  return dataset.records.find((record) => (
    record.curriculumRevision === revision
    && normalizeOfficialSubjectKey(record.officialSubjectName) === subjectKey
  )) ?? null
}

/**
 * 학교알리미 변환 결과에서 흔히 생기는 전각 괄호·여러 종류의 하이픈·코드 내부 공백만
 * 정규화한다. 일반 본문은 바꾸지 않아 과목명 부분 문자열이 코드처럼 오인되지 않게 한다.
 */
export function normalizeAchievementCodeSyntax(value: string) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[‐‑‒–—―−﹘﹣]/g, '-')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function equivalentSafeCodePattern(codePrefix: string, global = false) {
  const flexiblePrefix = Array.from(codePrefix.normalize('NFKC'))
    .map((character) => escapeRegex(character))
    .join('\\s*')
  // 접두부 바로 뒤에는 반드시 두 자리 영역 번호(또는 -와 두 자리 번호)가 와야 한다.
  // 따라서 12미는 12미영/12미적Ⅰ과, 12정은 12정치와 일치하지 않는다.
  return new RegExp(
    `(?<![0-9A-Za-z가-힣])(\\[?\\s*${flexiblePrefix}\\s*-?\\s*\\d{2}\\s*-\\s*\\d{2}\\s*\\]?)(?![0-9A-Za-z가-힣])`,
    global ? 'gu' : 'u',
  )
}

function displayCode(value: string) {
  return value.replace(/\s+/g, '').replace(/^\[/, '').replace(/\]$/, '')
}

export function findAchievementStandardCodes(
  markdown: string,
  record: AchievementStandardSubjectRecord | null,
  limit = 8,
) {
  if (!record || record.status !== 'verified' || !record.codePrefix || !record.matchPattern || limit <= 0) return []
  const normalized = normalizeAchievementCodeSyntax(markdown)
  const found = new Set<string>()
  try {
    const compactBracketCodes = normalized.replace(
      /\[([^\]\r\n]{1,80})\]/g,
      (_, code: string) => `[${code.replace(/\s+/g, '')}]`,
    )
    const strictPattern = new RegExp(record.matchPattern, 'gu')
    for (const match of compactBracketCodes.matchAll(strictPattern)) {
      found.add(displayCode(match[0]))
      if (found.size >= limit) return [...found]
    }

    const flexiblePattern = equivalentSafeCodePattern(record.codePrefix, true)
    for (const match of normalized.matchAll(flexiblePattern)) {
      found.add(displayCode(match[1] ?? match[0]))
      if (found.size >= limit) break
    }
  } catch {
    return []
  }
  return [...found]
}

/**
 * 데이터 파일의 안전한 완전 코드 정규식을 사용한다.
 * 단순 startsWith/substring 판정을 하지 않으며, 접두부 뒤에 숫자 영역과 성취기준 번호가
 * 완전하게 이어지는 대괄호 코드만 인정한다.
 */
export function hasAchievementStandardCode(
  markdown: string,
  record: AchievementStandardSubjectRecord | null,
) {
  return findAchievementStandardCodes(markdown, record, 1).length > 0
}
