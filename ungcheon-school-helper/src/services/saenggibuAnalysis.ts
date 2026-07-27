// 학생부 분석 강화 서비스
// - 성적 정밀 분석(사회 포함·9/5등급·진로선택 A/B/C·학기별 추이·내신 평균 JS 계산)
// - 대입 전형 적합도 + 대학 라인
// - 세특 품질 진단(구체성·탐구성·진로연계)
// 모든 provider(Gemini 구조화 / Claude·OpenAI 텍스트-JSON)를 내부에서 분기 처리한다.
import {
  analyzeFileStructuredGemini,
  generateStructuredGemini,
  analyzeFile,
  generateText,
  Type,
} from './llm'
import type { AppConfig } from '../types'

// ── 입력 타입 ────────────────────────────────────────────────────────────────
export type FileInput = { base64: string; mimeType: string } | { text: string }

// ── 1. 성적 정밀 분석 ─────────────────────────────────────────────────────────
export type GradeType = '공통/일반선택' | '진로선택' | '체육예술'

export interface SubjectGrade {
  area: string                 // 교과영역(표준명)
  name: string                 // 과목명
  credits: number | null       // 학점/단위
  type: GradeType
  rank: number | null          // 석차등급(공통/일반선택)
  achievement: string | null   // 성취도 A/B/C(진로선택·체육예술)
}
export interface SemesterGrades {
  label: string                // 예: "1학년 1학기"
  subjects: SubjectGrade[]
}
export interface AreaAverage {
  area: string
  avg: number
  count: number
}
export interface GradeReport {
  entranceYear: number | null
  gradingSystem: string        // '9등급' | '5등급' | '미상'
  semesters: SemesterGrades[]
  mainSubjectAverage: number | null  // 주요교과(국·수·영·사·과·한국사) 가중평균 — JS 계산
  allSubjectAverage: number | null   // 석차등급 전 과목 가중평균 — JS 계산
  areaAverages: AreaAverage[]        // 교과영역별 평균 — JS 계산
  trendComment: string
  strongAreas: string[]
  weakAreas: string[]
  summary: string
}

const MAIN_AREAS = ['국어', '수학', '영어', '사회', '과학', '한국사']

// 석차등급이 있는 과목만으로 내신 평균을 결정적으로 계산한다(AI 수치를 신뢰하지 않음).
export function computeGradeAverages(semesters: SemesterGrades[]): {
  mainSubjectAverage: number | null
  allSubjectAverage: number | null
  areaAverages: AreaAverage[]
} {
  const ranked: Array<{ area: string; rank: number; credits: number }> = []
  for (const sem of semesters ?? []) {
    for (const s of sem.subjects ?? []) {
      const isRanked = s.rank != null && s.rank >= 1 && s.type !== '진로선택' && s.type !== '체육예술'
      if (isRanked) {
        ranked.push({
          area: s.area ?? '',
          rank: s.rank as number,
          credits: s.credits && s.credits > 0 ? s.credits : 1,
        })
      }
    }
  }
  const wavg = (rows: typeof ranked): number | null => {
    if (!rows.length) return null
    const w = rows.reduce((a, r) => a + r.credits, 0)
    const sum = rows.reduce((a, r) => a + r.rank * r.credits, 0)
    return w ? Math.round((sum / w) * 100) / 100 : null
  }
  const main = ranked.filter(r => MAIN_AREAS.some(a => r.area.includes(a)))

  const byArea = new Map<string, { sum: number; w: number; count: number }>()
  for (const r of ranked) {
    const key = r.area || '기타'
    const e = byArea.get(key) ?? { sum: 0, w: 0, count: 0 }
    e.sum += r.rank * r.credits
    e.w += r.credits
    e.count++
    byArea.set(key, e)
  }
  const areaAverages: AreaAverage[] = [...byArea.entries()]
    .map(([area, e]) => ({ area, avg: Math.round((e.sum / e.w) * 100) / 100, count: e.count }))
    .sort((a, b) => a.avg - b.avg)

  return { mainSubjectAverage: wavg(main), allSubjectAverage: wavg(ranked), areaAverages }
}

const GRADE_SYSTEM = `당신은 대한민국 고등학교 학교생활기록부의 '교과학습발달상황'을 정밀 판독하는 성적 분석 전문가입니다.
표의 모든 행을 누락 없이 정확히 읽고, 석차등급 숫자를 임의로 바꾸지 마십시오. 반드시 한국어로, 요청한 JSON 형식만 반환합니다.`

const GRADE_PROMPT = `첨부된 학교생활기록부에서 '교과학습발달상황'(성적)을 분석하세요.

[판독 규칙]
1) 학적사항에서 고등학교 입학연도를 파악해 entranceYear에 기재하고, 입학연도가 2024년 이하이면 gradingSystem="9등급", 2025년 이상이면 "5등급"으로 표기(불명확하면 "미상").
2) 모든 학기·모든 과목을 한 행도 빠짐없이 semesters에 추출. 각 과목:
   - area: 교과영역을 다음 표준명 중 하나로 정규화 — 국어, 수학, 영어, 사회, 과학, 한국사, 체육, 예술, 기술·가정, 제2외국어, 한문, 교양. (예: 통합사회·동아시아사·생활과윤리·정치와법·세계사 → "사회", 문학·언어와매체·독서 → "국어")
   - name: 실제 과목명(문학, 동아시아사 등)
   - credits: 학점수(단위수) 정수, 없으면 null
   - type: "공통/일반선택"(석차등급이 매겨지는 과목) | "진로선택"(성취도 A/B/C, 석차등급 없음) | "체육예술"(성취도만)
   - rank: 석차등급 정수(공통/일반선택만). 진로선택·체육예술은 null.
   - achievement: 성취도 A/B/C(진로선택·체육예술). 없으면 null.
3) trendComment: 학기별 등급 추이(상승/하락/유지)를 서술.
4) strongAreas/weakAreas: 등급이 강한/약한 교과영역명 배열.
5) summary: 전체 성적 총평 2~3문장.`

const GRADE_JSON_HINT = `{"entranceYear":2024,"gradingSystem":"9등급","semesters":[{"label":"1학년 1학기","subjects":[{"area":"국어","name":"국어","credits":4,"type":"공통/일반선택","rank":1,"achievement":null}]}],"trendComment":"...","strongAreas":["국어"],"weakAreas":["수학"],"summary":"..."}`

const GRADE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    entranceYear: { type: Type.INTEGER, nullable: true },
    gradingSystem: { type: Type.STRING },
    semesters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          subjects: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                area: { type: Type.STRING },
                name: { type: Type.STRING },
                credits: { type: Type.INTEGER, nullable: true },
                type: { type: Type.STRING, enum: ['공통/일반선택', '진로선택', '체육예술'] },
                rank: { type: Type.INTEGER, nullable: true },
                achievement: { type: Type.STRING, nullable: true },
              },
              required: ['area', 'name', 'type'],
            },
          },
        },
        required: ['label', 'subjects'],
      },
    },
    trendComment: { type: Type.STRING },
    strongAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
    weakAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
  },
  required: ['gradingSystem', 'semesters', 'trendComment', 'strongAreas', 'weakAreas', 'summary'],
}

export async function analyzeGrades(
  config: AppConfig,
  input: FileInput,
  signal?: AbortSignal,
): Promise<GradeReport> {
  const report = await runStructured<GradeReport>(
    config, input, GRADE_PROMPT, GRADE_SCHEMA, GRADE_JSON_HINT, GRADE_SYSTEM, signal,
  )
  const computed = computeGradeAverages(report.semesters ?? [])
  return { ...report, ...computed }
}

// ── 2. 대입 전형 적합도 + 대학 라인 ──────────────────────────────────────────
export type FitLevel = 'High' | 'Medium' | 'Low'
export interface AdmissionTypeFit {
  type: string          // '학생부종합' | '학생부교과' | '정시'
  fit: FitLevel
  reason: string
}
export interface UniversityLine {
  tier: string          // '도전' | '적정' | '안정'
  examples: string[]
  note: string
}
export interface AdmissionFit {
  overallComment: string
  byType: AdmissionTypeFit[]
  universityLines: UniversityLine[]
  disclaimer: string
}

const ADMISSION_SYSTEM = `당신은 15년 경력의 대입 진학지도 컨설턴트입니다.
내신 성적·세특·창의적 체험활동을 근거로 수시(학생부종합/학생부교과)와 정시의 적합도를 신중하게 진단하고, 참고용 대학 라인을 제시합니다.
합격을 단정하지 말고 '참고 의견'으로 제시하며, 반드시 한국어로 JSON만 반환합니다.`

const ADMISSION_PROMPT = `첨부된 학교생활기록부를 근거로 이 학생의 대입 전략을 분석하세요.

1) byType: 다음 3개 전형 각각에 대해 적합도(fit: High/Medium/Low)와 근거(reason)를 제시.
   - "학생부종합": 세특·활동·진로 일관성 중심
   - "학생부교과": 내신 등급 중심
   - "정시": 수능 중심(생기부만으로는 추정이 제한적임을 감안해 신중히)
2) universityLines: 내신과 계열을 고려해 '도전'/'적정'/'안정' 3개 tier로 나누고, 각 tier에 어울리는 대학·학과 예시(examples, 3~5개)와 note를 제시. 권역(수도권/지역거점국립대 등)도 함께 언급.
3) overallComment: 종합 전략 2~3문장(어떤 전형에 집중할지).
4) disclaimer: 실제 합격은 모집요강·경쟁률·수능 결과 등에 따라 달라지는 참고용 추정이라는 취지의 문구.`

const ADMISSION_JSON_HINT = `{"overallComment":"...","byType":[{"type":"학생부종합","fit":"High","reason":"..."}],"universityLines":[{"tier":"적정","examples":["OO대 국어국문학과"],"note":"..."}],"disclaimer":"..."}`

const ADMISSION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallComment: { type: Type.STRING },
    byType: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          fit: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
          reason: { type: Type.STRING },
        },
        required: ['type', 'fit', 'reason'],
      },
    },
    universityLines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tier: { type: Type.STRING },
          examples: { type: Type.ARRAY, items: { type: Type.STRING } },
          note: { type: Type.STRING },
        },
        required: ['tier', 'examples', 'note'],
      },
    },
    disclaimer: { type: Type.STRING },
  },
  required: ['overallComment', 'byType', 'universityLines', 'disclaimer'],
}

export async function analyzeAdmissionFit(
  config: AppConfig,
  input: FileInput,
  signal?: AbortSignal,
): Promise<AdmissionFit> {
  return runStructured<AdmissionFit>(
    config, input, ADMISSION_PROMPT, ADMISSION_SCHEMA, ADMISSION_JSON_HINT, ADMISSION_SYSTEM, signal,
  )
}

// ── 3. 세특 품질 진단 ────────────────────────────────────────────────────────
export interface SehakSubjectScore {
  subject: string
  concreteness: number  // 구체성 1~5
  inquiry: number       // 탐구성 1~5
  careerLink: number    // 진로연계 1~5
  comment: string
  improvement: string
}
export interface SehakQuality {
  overallScore: number  // 0~100
  overallComment: string
  subjects: SehakSubjectScore[]
}

const SEHAK_SYSTEM = `당신은 학교생활기록부 세부능력 및 특기사항(세특) 평가 전문가입니다.
각 과목 세특을 구체성·탐구성·진로연계 세 관점에서 1~5점으로 평가하고, 개선 문장을 제안합니다. 반드시 한국어로 JSON만 반환합니다.`

const SEHAK_PROMPT = `첨부된 학교생활기록부의 '교과학습발달상황' 내 과목별 세부능력 및 특기사항(세특)을 평가하세요.

1) subjects: 세특이 기재된 주요 과목마다
   - subject: 과목명
   - concreteness(구체성, 1~5): 활동·근거·수치가 구체적인가
   - inquiry(탐구성, 1~5): 단순 수업참여를 넘어 스스로 질문·탐구·확장했는가
   - careerLink(진로연계, 1~5): 학생의 진로/전공과 연결되는가
   - comment: 한 줄 평가
   - improvement: 더 좋게 만들 구체적 개선 방향 1문장
2) overallScore(0~100): 세특 전반의 완성도 점수
3) overallComment: 세특 전반 총평 2~3문장`

const SEHAK_JSON_HINT = `{"overallScore":82,"overallComment":"...","subjects":[{"subject":"국어","concreteness":5,"inquiry":4,"careerLink":5,"comment":"...","improvement":"..."}]}`

const SEHAK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallScore: { type: Type.INTEGER },
    overallComment: { type: Type.STRING },
    subjects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          concreteness: { type: Type.INTEGER },
          inquiry: { type: Type.INTEGER },
          careerLink: { type: Type.INTEGER },
          comment: { type: Type.STRING },
          improvement: { type: Type.STRING },
        },
        required: ['subject', 'concreteness', 'inquiry', 'careerLink', 'comment', 'improvement'],
      },
    },
  },
  required: ['overallScore', 'overallComment', 'subjects'],
}

export async function analyzeSehakQuality(
  config: AppConfig,
  input: FileInput,
  signal?: AbortSignal,
): Promise<SehakQuality> {
  return runStructured<SehakQuality>(
    config, input, SEHAK_PROMPT, SEHAK_SCHEMA, SEHAK_JSON_HINT, SEHAK_SYSTEM, signal,
  )
}

// ── 공통 실행기 ──────────────────────────────────────────────────────────────
// Gemini는 구조화 출력(JSON Schema), Claude/OpenAI는 텍스트→JSON 파싱으로 분기.
async function runStructured<T>(
  config: AppConfig,
  input: FileInput,
  prompt: string,
  geminiSchema: Record<string, unknown>,
  jsonHint: string,
  systemPrompt: string,
  signal?: AbortSignal,
): Promise<T> {
  const provider = config.aiProvider ?? 'gemini'

  if (provider === 'gemini') {
    const apiKey = config.geminiApiKey
    if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.')
    return 'base64' in input
      ? analyzeFileStructuredGemini<T>(apiKey, input.base64, input.mimeType, prompt, geminiSchema, systemPrompt, signal)
      : generateStructuredGemini<T>(apiKey, `${prompt}\n\n${input.text}`, geminiSchema, systemPrompt, signal)
  }

  const fullPrompt = `${prompt}\n\n반드시 아래 JSON 형식만 반환하세요(코드블록/설명 없이):\n${jsonHint}`
  const raw = 'base64' in input
    ? await analyzeFile(config, input.base64, input.mimeType, fullPrompt, systemPrompt, signal)
    : await generateText(config, `${fullPrompt}\n\n${input.text}`, systemPrompt, signal)
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim()) as T
  } catch {
    throw new Error('AI 응답을 분석할 수 없습니다. Gemini 모델 사용을 권장합니다.')
  }
}
