import type { ParsedWorkbook } from './fileParser/types'
import { parseFile } from './fileParser'
import type { StudentRosterEntry } from './rosterAttendance'
import { canonicalStudentId } from './studentId'

export interface ExtractedStudentIdentity {
  studentId: string
  name: string
  source: string
  context: string
}

export type StudentIdentityIssueKind = 'nameMismatch' | 'studentIdMismatch' | 'ambiguousName' | 'notInRoster'

export interface StudentIdentityIssue {
  key: string
  kind: StudentIdentityIssueKind
  studentId: string
  name: string
  expectedStudentIds: string[]
  expectedNames: string[]
  sources: string[]
  contexts: string[]
  occurrences: number
}

export interface StudentIdentityAuditResult {
  extracted: ExtractedStudentIdentity[]
  issues: StudentIdentityIssue[]
  matchedCount: number
  uniquePairCount: number
}

const ID_PATTERN = /^[1-3]\d{3}$/
const NAME_PATTERN = /^[가-힣]{2,5}$/
const ID_HEADERS = new Set(['학번', '학생번호', '학생학번'])
const NAME_HEADERS = new Set(['성명', '이름', '학생명', '학생이름'])

const compact = (value: unknown) => String(value ?? '').replace(/\s+/g, '').trim()
const cleanId = (value: unknown) => canonicalStudentId(compact(value))
const cleanName = (value: unknown) => compact(value).replace(/[^가-힣]/g, '')
const validId = (value: string) => ID_PATTERN.test(value)
const validName = (value: string) => NAME_PATTERN.test(value)

function pair(studentId: string, name: string, source: string, context: string): ExtractedStudentIdentity | null {
  const id = cleanId(studentId)
  const normalizedName = cleanName(name)
  return validId(id) && validName(normalizedName) ? { studentId: id, name: normalizedName, source, context } : null
}

export function extractPairsFromCell(value: unknown, source: string, context: string): ExtractedStudentIdentity[] {
  const text = String(value ?? '').replace(/\r/g, ' ').trim()
  if (!text) return []
  const found: ExtractedStudentIdentity[] = []
  const patterns = [
    /(?:^|[^0-9])(\d{4,5})\s*[()\[\]{}|,;:/·._-]*\s*([가-힣]{2,5})(?=$|[^가-힣])/g,
    /(?:^|[^가-힣])([가-힣]{2,5})\s*[()\[\]{}|,;:/·._-]*\s*(\d{4,5})(?=$|[^0-9])/g,
  ]
  for (const [index, pattern] of patterns.entries()) {
    for (const match of text.matchAll(pattern)) {
      const candidate = index === 0
        ? pair(match[1], match[2], source, context)
        : pair(match[2], match[1], source, context)
      if (candidate) found.push(candidate)
    }
  }
  return found.filter((item, index, all) => all.findIndex(other => other.studentId === item.studentId && other.name === item.name) === index)
}

function extractPairsFromMatrix(matrix: string[][], source: string): ExtractedStudentIdentity[] {
  const structured: ExtractedStudentIdentity[] = []
  for (let headerIndex = 0; headerIndex < matrix.length; headerIndex += 1) {
    const header = matrix[headerIndex].map(compact)
    header.forEach((label, idColumn) => {
      if (!ID_HEADERS.has(label)) return
      const nameColumns = header
        .map((nameLabel, column) => ({ nameLabel, column }))
        .filter(item => NAME_HEADERS.has(item.nameLabel) && Math.abs(item.column - idColumn) <= 6)
        .sort((a, b) => Math.abs(a.column - idColumn) - Math.abs(b.column - idColumn))
      const nameColumn = nameColumns[0]?.column
      if (nameColumn === undefined) return
      let emptyRows = 0
      for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
        const row = matrix[rowIndex] ?? []
        const id = cleanId(row[idColumn])
        const name = cleanName(row[nameColumn])
        if (ID_HEADERS.has(compact(row[idColumn])) || NAME_HEADERS.has(compact(row[nameColumn]))) break
        if (!id && !name) {
          emptyRows += 1
          if (emptyRows >= 5) break
          continue
        }
        emptyRows = 0
        const candidate = pair(id, name, source, `${source} · ${rowIndex + 1}행`)
        if (candidate) structured.push(candidate)
      }
    })
  }

  // 한 문서 안에서도 표의 일부는 학번·이름이 옆 칸에 있고, 다른 일부는 한 칸에
  // 합쳐져 있을 수 있으므로 헤더 기반 추출 결과와 통합 셀 결과를 함께 보존한다.
  const combinedCells = matrix.flatMap((row, rowIndex) => {
    const rowSource = `${source} · ${rowIndex + 1}행`
    return row.flatMap(cell => extractPairsFromCell(cell, source, rowSource))
  })
  if (structured.length) return uniqueOccurrences([...structured, ...combinedCells])

  const generic: ExtractedStudentIdentity[] = []
  matrix.forEach((row, rowIndex) => {
    const rowSource = `${source} · ${rowIndex + 1}행`
    row.forEach(cell => generic.push(...extractPairsFromCell(cell, source, rowSource)))
    const ids = row.map((cell, column) => ({ value: cleanId(cell), column })).filter(item => validId(item.value))
    const names = row.map((cell, column) => ({ value: cleanName(cell), column })).filter(item => validName(item.value))
    ids.forEach(id => {
      const nearest = names
        .filter(name => Math.abs(name.column - id.column) <= 4)
        .sort((a, b) => Math.abs(a.column - id.column) - Math.abs(b.column - id.column))[0]
      if (!nearest) return
      const candidate = pair(id.value, nearest.value, source, rowSource)
      if (candidate) generic.push(candidate)
    })
  })
  return uniqueOccurrences(generic)
}

function uniqueOccurrences(items: ExtractedStudentIdentity[]) {
  return items.filter((item, index, all) => all.findIndex(other =>
    other.studentId === item.studentId && other.name === item.name && other.context === item.context,
  ) === index)
}

export function extractPairsFromWorkbook(workbook: ParsedWorkbook, fileName: string): ExtractedStudentIdentity[] {
  return uniqueOccurrences(workbook.sheets.flatMap(sheet => {
    const matrix = [sheet.headers, ...sheet.rows.map(row => row.map(cell => cell?.raw ?? ''))]
    return extractPairsFromMatrix(matrix, `${fileName} · ${sheet.name}`)
  }))
}

export function extractPairsFromText(text: string, source = '붙여넣기'): ExtractedStudentIdentity[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const matrix = lines.map(line => line.includes('\t')
    ? line.split('\t')
    : line.includes('|')
      ? line.split('|')
      : line.split(/\s{2,}|[,;]/),
  )
  const matrixPairs = extractPairsFromMatrix(matrix, source)
  const linePairs = lines.flatMap((line, index) => extractPairsFromCell(line, source, `${source} · ${index + 1}행`))
  return uniqueOccurrences([...matrixPairs, ...linePairs])
}

function rosterMaps(roster: StudentRosterEntry[]) {
  const byId = new Map<string, StudentRosterEntry>()
  const byName = new Map<string, StudentRosterEntry[]>()
  roster.forEach(student => {
    const id = cleanId(student.studentId)
    const normalizedStudent = { ...student, studentId: id }
    byId.set(id, normalizedStudent)
    const name = cleanName(student.name)
    byName.set(name, [...(byName.get(name) ?? []), normalizedStudent])
  })
  return { byId, byName }
}

export function auditStudentIdentities(extracted: ExtractedStudentIdentity[], roster: StudentRosterEntry[]): StudentIdentityAuditResult {
  const { byId, byName } = rosterMaps(roster)
  let matchedCount = 0
  const issueMap = new Map<string, StudentIdentityIssue>()

  extracted.forEach(item => {
    const rosterById = byId.get(item.studentId)
    const rosterByName = byName.get(cleanName(item.name)) ?? []
    if (rosterById && cleanName(rosterById.name) === cleanName(item.name)) {
      matchedCount += 1
      return
    }

    let kind: StudentIdentityIssueKind
    let expectedStudentIds: string[] = []
    let expectedNames: string[] = []
    if (rosterById) {
      kind = 'nameMismatch'
      expectedNames = [rosterById.name]
      expectedStudentIds = rosterByName.map(student => student.studentId)
    } else if (rosterByName.length === 1) {
      kind = 'studentIdMismatch'
      expectedStudentIds = [rosterByName[0].studentId]
    } else if (rosterByName.length > 1) {
      kind = 'ambiguousName'
      expectedStudentIds = rosterByName.map(student => student.studentId)
    } else {
      kind = 'notInRoster'
    }

    const key = `${kind}\u0000${item.studentId}\u0000${item.name}`
    const previous = issueMap.get(key)
    if (previous) {
      previous.occurrences += 1
      if (!previous.sources.includes(item.source)) previous.sources.push(item.source)
      if (!previous.contexts.includes(item.context)) previous.contexts.push(item.context)
    } else {
      issueMap.set(key, {
        key, kind, studentId: item.studentId, name: item.name,
        expectedStudentIds: [...new Set(expectedStudentIds)], expectedNames: [...new Set(expectedNames)],
        sources: [item.source], contexts: [item.context], occurrences: 1,
      })
    }
  })

  return {
    extracted,
    issues: [...issueMap.values()].sort((a, b) => a.studentId.localeCompare(b.studentId, 'ko') || a.name.localeCompare(b.name, 'ko')),
    matchedCount,
    uniquePairCount: new Set(extracted.map(item => `${item.studentId}\u0000${item.name}`)).size,
  }
}

interface PdfLayoutResult {
  success?: boolean
  totalChars?: number
  pages?: Array<{ page: number; items: Array<{ x: number; y: number; str: string }> }>
}

function textFromPdfLayout(result: PdfLayoutResult) {
  return (result.pages ?? []).flatMap(page => {
    const lines: Array<{ y: number; items: Array<{ x: number; str: string }> }> = []
    page.items.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach(item => {
      let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= 3)
      if (!line) {
        line = { y: item.y, items: [] }
        lines.push(line)
      }
      line.items.push({ x: item.x, str: item.str })
    })
    return lines.sort((a, b) => a.y - b.y).map(line =>
      line.items.sort((a, b) => a.x - b.x).map(item => item.str.trim()).filter(Boolean).join('\t'),
    )
  }).join('\n')
}

export async function extractStudentIdentitiesFromFile(filePath: string, fileName: string) {
  const extension = fileName.toLowerCase().split('.').pop() ?? ''
  if (extension === 'pdf') {
    const layout = await window.electron.extractPdfLayout(filePath) as PdfLayoutResult
    if (layout.success && Number(layout.totalChars) > 0) {
      const pairs = extractPairsFromText(textFromPdfLayout(layout), fileName)
      if (pairs.length) return pairs
    }
  }
  const parsed = await parseFile(filePath, fileName)
  if (parsed.kind === 'excel') return extractPairsFromWorkbook(parsed, fileName)
  if (parsed.kind === 'doc') return extractPairsFromText(parsed.markdown, fileName)
  return extractPairsFromText(parsed.text, fileName)
}
