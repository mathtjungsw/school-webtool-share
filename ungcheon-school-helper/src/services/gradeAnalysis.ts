import * as XLSX from 'xlsx'
import { generateText } from './llm'
import type { AppConfig } from '../types'

// 원본: 29-google-ai-studio/내신분석(5등급제-2022-개정-교육과정)
//  - utils/gradeAnalysis.ts (순수 계산 로직 — 그대로 보존, CDN XLSX→import / File→bytes 로만 변경)
//  - components/AICounselor.tsx (대입 컨설팅 프롬프트 → 공용 llm.ts generateText 로 일원화)

export interface SubjectScore {
  subjectName: string
  rank: number
  totalStudents: number
  originalScore: number
  subjectAverage: number
  standardDeviation: number
  fiveGrade: number
  nineGrade: number
  percentile: number
  zScore: number
}

export interface Student {
  id: string
  class: string
  number: string
  name: string
  scores: SubjectScore[]
  averageFiveGrade: number
  averageNineGrade: number
  classRank: number
}

export interface ClassAnalysisData {
  totalStudents: number
  overallAverageFiveGrade: number
  gradeDistribution: { name: string; value: number }[]
  subjectMetrics: { subjectName: string; averageGrade: number; standardDeviation: number }[]
}

// ── 순수 계산 (원본 그대로) ───────────────────────────────────────────────
const calculateFiveGrade = (rank: number, totalStudents: number): number => {
  const percentile = (rank / totalStudents) * 100
  if (percentile <= 10) return 1
  if (percentile <= 34) return 2 // 10 + 24
  if (percentile <= 66) return 3 // 34 + 32
  if (percentile <= 90) return 4 // 66 + 24
  return 5
}

const convertPercentileToNineGrade = (percentile: number): number => {
  if (percentile <= 4) return 1
  if (percentile <= 11) return 2
  if (percentile <= 23) return 3
  if (percentile <= 40) return 4
  if (percentile <= 60) return 5
  if (percentile <= 77) return 6
  if (percentile <= 89) return 7
  if (percentile <= 96) return 8
  return 9
}

const calculatePercentile = (rank: number, totalStudents: number): number =>
  ((rank - 0.5) / totalStudents) * 100

const calculateStandardDeviation = (numbers: number[]): number => {
  if (numbers.length < 2) return 0
  const n = numbers.length
  const mean = numbers.reduce((a, b) => a + b) / n
  const variance = numbers.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return Math.sqrt(variance)
}

/** NEIS '학기말성적종합일람표' xlsx 바이트를 분석. (원본 analyzeExcelData 의 동기 버전) */
export function analyzeExcelBytes(bytes: Uint8Array | number[]): { students: Student[]; classAnalysisData: ClassAnalysisData } {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const workbook = XLSX.read(data, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const json: (string | number)[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

  // 헤더 행 / 데이터 시작 행 탐색
  let headerRowIndex = -1
  let dataStartIndex = -1
  for (let i = 0; i < json.length; i++) {
    const row = json[i]
    if (row && row.some(cell => typeof cell === 'string' && (cell.includes('학번') || cell.includes('성명') || cell.includes('반')))) {
      headerRowIndex = i
      dataStartIndex = i + 1
      break
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("엑셀 파일에서 '학번', '성명' 또는 '반' 헤더를 찾을 수 없습니다. NEIS '학기말성적종합일람표' 형식이 맞는지 확인해주세요.")
  }

  const rawHeaders = json[headerRowIndex]
  const headers = rawHeaders.map(h => String(h || '').trim().replace(/\s/g, ''))

  const nameIndex = headers.findIndex(h => h.includes('성명'))
  const studentIdIndex = headers.findIndex(h => h.includes('학번'))
  const classIndex = headers.findIndex(h => h === '반')
  const numberIndex = headers.findIndex(h => h === '번호')

  if (nameIndex === -1) throw new Error("필수 열인 '성명'을 찾을 수 없습니다.")
  if (studentIdIndex === -1 && (classIndex === -1 || numberIndex === -1)) {
    throw new Error("학생 식별을 위한 '학번' 또는 '반'/'번호' 열을 찾을 수 없습니다.")
  }

  const studentData = json.slice(dataStartIndex).filter(row => row && row.length > nameIndex && row[nameIndex])

  const subjectHeaders: { name: string; scoreIndex?: number; rankIndex?: number; avgIndex?: number; stdDevIndex?: number }[] = []
  const ignoredKeywords = ['학번', '성명', '반', '번호', '계', '평균']

  headers.forEach((header, index) => {
    if (header && !ignoredKeywords.some(key => header.includes(key))) {
      const originalHeader = String(rawHeaders[index] || '')
      const subjectName = originalHeader.replace(/(원점수|과목평균\(표준편차\)|석차\/수강자수)/, '').trim()

      let subject = subjectHeaders.find(s => s.name === subjectName)
      if (!subject) {
        subject = { name: subjectName }
        subjectHeaders.push(subject)
      }
      if (header.includes('원점수')) subject.scoreIndex = index
      if (header.includes('석차')) subject.rankIndex = index
      if (header.includes('과목평균')) subject.avgIndex = index
    }
  })

  const students: Student[] = []
  for (const row of studentData) {
    let studentClass = ''
    let studentNumber = ''

    if (studentIdIndex !== -1) {
      const studentId = String(row[studentIdIndex] || '')
      if (studentId.length === 5 && studentId.startsWith('1')) {
        studentClass = String(parseInt(studentId.substring(1, 3), 10))
        studentNumber = String(parseInt(studentId.substring(3, 5), 10))
      }
    }

    if ((!studentClass || !studentNumber) && classIndex !== -1 && numberIndex !== -1) {
      studentClass = String(row[classIndex] || '').replace(/[^0-9]/g, '')
      studentNumber = String(row[numberIndex] || '').replace(/[^0-9]/g, '')
    }

    if (!studentClass || !studentNumber) continue

    const student: Student = {
      id: `${studentClass}-${studentNumber}`,
      class: studentClass,
      number: studentNumber,
      name: String(row[nameIndex]),
      scores: [],
      averageFiveGrade: 0,
      averageNineGrade: 0,
      classRank: 0,
    }

    for (const sHeader of subjectHeaders) {
      if (sHeader.rankIndex === undefined || sHeader.scoreIndex === undefined || sHeader.avgIndex === undefined) continue

      const rankStr = String(row[sHeader.rankIndex] || '')
      const [rank, totalStudents] = rankStr.split('/').map(s => parseInt(s.trim(), 10))

      if (!isNaN(rank) && !isNaN(totalStudents) && totalStudents > 0) {
        const avgStdDevStr = String(row[sHeader.avgIndex] || '')
        const matches = avgStdDevStr.match(/(\d+\.?\d*)/g)
        const subjectAverage = matches && matches[0] ? parseFloat(matches[0]) : 0
        const standardDeviation = matches && matches[1] ? parseFloat(matches[1]) : 0
        const originalScore = Number(row[sHeader.scoreIndex] || 0)

        const fiveGrade = calculateFiveGrade(rank, totalStudents)
        const percentile = calculatePercentile(rank, totalStudents)
        const nineGrade = convertPercentileToNineGrade(percentile)
        const zScore = standardDeviation > 0 ? (originalScore - subjectAverage) / standardDeviation : 0

        student.scores.push({
          subjectName: sHeader.name,
          rank,
          totalStudents,
          originalScore,
          subjectAverage,
          standardDeviation,
          fiveGrade,
          nineGrade,
          percentile,
          zScore,
        })
      }
    }

    if (student.scores.length > 0) {
      student.averageFiveGrade = student.scores.reduce((acc, s) => acc + s.fiveGrade, 0) / student.scores.length
      student.averageNineGrade = student.scores.reduce((acc, s) => acc + s.nineGrade, 0) / student.scores.length
      students.push(student)
    }
  }

  if (students.length === 0) {
    throw new Error('학생 데이터를 추출할 수 없습니다. 파일이 비어있거나 형식이 올바르지 않습니다.')
  }

  // 반 석차
  students.sort((a, b) => a.averageFiveGrade - b.averageFiveGrade)
  let currentRank = 0
  let lastScore = -1
  students.forEach((student, index) => {
    if (student.averageFiveGrade > lastScore) currentRank = index + 1
    student.classRank = currentRank
    lastScore = student.averageFiveGrade
  })

  // 학급 분석
  const allScores = students.flatMap(s => s.scores)
  const gradeCounts: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  allScores.forEach(score => { gradeCounts[score.fiveGrade]++ })

  const gradeDistribution = Object.entries(gradeCounts).map(([grade, count]) => ({
    name: `${grade}등급`,
    value: count,
  }))

  const subjectMetrics = subjectHeaders
    .map(sHeader => {
      const subjectScores = allScores.filter(s => s.subjectName === sHeader.name)
      if (subjectScores.length === 0) return null
      const grades = subjectScores.map(s => s.fiveGrade)
      const averageGrade = grades.reduce((acc, g) => acc + g, 0) / grades.length
      const standardDeviation = calculateStandardDeviation(grades)
      return {
        subjectName: sHeader.name,
        averageGrade: isNaN(averageGrade) ? 0 : averageGrade,
        standardDeviation: isNaN(standardDeviation) ? 0 : standardDeviation,
      }
    })
    .filter((m): m is Exclude<typeof m, null> => m !== null && m.averageGrade > 0)

  const overallAverageFiveGrade = students.reduce((acc, s) => acc + s.averageFiveGrade, 0) / students.length

  return {
    students,
    classAnalysisData: {
      totalStudents: students.length,
      overallAverageFiveGrade,
      gradeDistribution,
      subjectMetrics,
    },
  }
}

// ── AI 대입 컨설팅 (원본 AICounselor 프롬프트 → 공용 llm.ts) ────────────────
export async function generateAdmissionConsultation(
  config: AppConfig,
  student: Student,
  signal?: AbortSignal,
): Promise<string> {
  const prompt = `
너는 대한민국 고등학교 진학 상담 교사야. 2022 개정 교육과정에 따라 고등학교 1학년 학생의 5등급제 성적 데이터를 기반으로 대학 입시 전략을 세워줘야 해.

학생 정보:
- 이름: ${student.name}
- 반/번호: ${student.class}반 ${student.number}번
- 5등급제 평균: ${student.averageFiveGrade.toFixed(2)}
- 9등급제 환산 평균: ${student.averageNineGrade.toFixed(2)}

상세 과목 성적 (과목명, 5등급, Z-Score, 백분위):
${student.scores.map(s => `- ${s.subjectName}: ${s.fiveGrade}등급 (Z:${s.zScore.toFixed(2)}, 백분위:${s.percentile.toFixed(1)}%)`).join('\n')}

위 데이터를 바탕으로 다음 내용을 포함하여 분석해줘:
1. 전반적인 학업 성취 수준 분석
2. 주요 강점 과목 및 이를 활용한 학과 추천
3. 보완이 필요한 과목 및 학습 방향
4. 현재 성적 기준 지원 가능한 대학 수준 (대략적으로)
5. 학생부 종합 전형 및 교과 전형 중 유리한 전략 제안

응답은 가독성이 좋게 마크다운 형식을 사용하고, 전문적이면서도 따뜻한 격려의 어조로 작성해줘.
  `.trim()
  return generateText(config, prompt, undefined, signal)
}
