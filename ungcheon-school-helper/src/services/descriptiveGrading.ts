import {
  generateStructuredGemini, analyzeFileStructuredGemini,
  generateText, analyzeFile, Type,
} from './llm'
import type { AppConfig } from '../types'

// 원본: 29-google-ai-studio/ai-descriptive-grading-assistant (services/geminiService.ts, types.ts)
// 서·논술형 답안(텍스트/이미지) → 루브릭 채점·피드백. 프롬프트·스키마는 원본 그대로 보존.

export interface GradingContext {
  target: string
  subject: string
  problem: string
}

export interface CriterionFeedback {
  name: string
  score: number
  feedback: string
}

export interface OverallFeedback {
  summary: string
  strengths: string[]
  improvements: string[]
}

export interface GradingResult {
  isGradable: boolean
  totalScore: number
  criteria: CriterionFeedback[]
  overallFeedback: OverallFeedback
}

export interface Answer {
  text?: string
  image?: { mimeType: string; data: string }
}

const rubricSchema = {
  type: Type.OBJECT,
  properties: {
    isGradable: { type: Type.BOOLEAN, description: '답안이 채점 가능한지 여부. (예: 내용이 없거나 관련 없는 경우 false)' },
    criteria: {
      type: Type.ARRAY,
      description: '채점 가능한 경우의 항목별 평가 목록. 채점 불가 시 빈 배열.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: '평가 기준 (예: 논리성, 내용, 표현력)' },
          score: { type: Type.INTEGER, description: '기준별 점수 (10점 만점)' },
          feedback: { type: Type.STRING, description: '기준별 상세 피드백' },
        },
        required: ['name', 'score', 'feedback'],
      },
    },
    overallFeedback: {
      type: Type.OBJECT,
      description: '답안 전체에 대한 종합적인 피드백.',
      properties: {
        summary: { type: Type.STRING, description: '종합적인 요약 피드백. 채점 불가 시, 그 사유를 여기에 작성.' },
        strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: '학생 답안의 강점 목록. 채점 불가 시 빈 배열.' },
        improvements: { type: Type.ARRAY, items: { type: Type.STRING }, description: '학생 답안의 개선 방안 목록. 채점 불가 시 빈 배열.' },
      },
      required: ['summary', 'strengths', 'improvements'],
    },
  },
  required: ['isGradable', 'criteria', 'overallFeedback'],
}

const SYSTEM_INSTRUCTION = `
당신은 학생들의 성장을 돕는 데 열정을 가진, 경험 많고 친절한 AI 논술 지도사입니다.
당신의 핵심 역할은 단순 채점을 넘어, 학생들이 자신의 강점을 인식하고 개선점을 명확히 이해하도록 돕는 것입니다.
모든 피드백은 학생의 노력을 존중하며, 긍정적이고 격려하는 어조를 유지해야 합니다.
구체적인 예시를 통해 학생들이 쉽게 이해하고 다음 글쓰기에 적용할 수 있도록 도와주세요.
제공된 JSON 스키마를 엄격히 준수하여, 항상 구조화된 형식으로 응답해야 합니다.
`.trim()

function taskPrompt(context: GradingContext): string {
  return `
아래의 채점 기준표와 수행 지침에 따라 주어진 학생 답안을 평가해주세요.

**평가 맥락:**
*   **대상:** ${context.target}
*   **교과:** ${context.subject}
*   **문제:** ${context.problem}

**채점 기준표:**
1.  **논리성 (10점 만점):** 주장이 명확하고 근거가 타당하며, 글의 흐름이 논리적인가?
2.  **내용 (10점 만점):** 문제의 요구사항을 잘 이해하고 핵심 내용을 충실하게 담고 있는가?
3.  **표현력 (10점 만점):** 어휘와 문장 구조가 적절하고, 표현이 명확하며 설득력 있는가?

**수행 지침:**
1.  먼저 학생의 답안이 채점 가능한지 판단해주세요.
2.  반드시 제공된 스키마와 일치하는 JSON 객체로만 응답해야 합니다.
3.  모든 피드백 문장은 한국어 경어체(예: '-습니다', '-합니다')를 일관되게 사용해주세요.
`.trim()
}

const SHAPE_HINT = `{ "isGradable": true, "criteria": [{ "name": "", "score": 0, "feedback": "" }], "overallFeedback": { "summary": "", "strengths": [""], "improvements": [""] } }`

function finalizeScore(result: GradingResult): GradingResult {
  let totalScore = 0
  if (result.isGradable && result.criteria.length > 0) {
    const criteriaSum = result.criteria.reduce((sum, c) => sum + (c.score || 0), 0)
    const maxScore = result.criteria.length * 10
    totalScore = maxScore > 0 ? Math.round((criteriaSum / maxScore) * 100) : 0
  }
  return { ...result, totalScore }
}

export async function gradeAnswer(
  config: AppConfig,
  context: GradingContext,
  answer: Answer,
  signal?: AbortSignal,
): Promise<GradingResult> {
  const provider = config.aiProvider ?? 'gemini'
  const base = taskPrompt(context)

  if (!answer.image && !answer.text) throw new Error('답안 내용이 없습니다.')

  // ── Gemini: 구조화 출력 ──
  if (provider === 'gemini') {
    const apiKey = config.geminiApiKey
    if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.')
    let raw: GradingResult
    if (answer.image) {
      const prompt = `${base}\n\n아래 이미지에 포함된 학생의 답안을 채점해주세요.`
      raw = await analyzeFileStructuredGemini<GradingResult>(
        apiKey, answer.image.data, answer.image.mimeType, prompt, rubricSchema, SYSTEM_INSTRUCTION, signal,
      )
    } else {
      const prompt = `${base}\n\n[학생 답안]\n${answer.text}`
      raw = await generateStructuredGemini<GradingResult>(apiKey, prompt, rubricSchema, SYSTEM_INSTRUCTION, signal)
    }
    return finalizeScore(raw)
  }

  // ── Claude / OpenAI: 텍스트 응답 JSON 파싱 ──
  const jsonInstruction = `\n\n반드시 아래 JSON 형식만 반환하세요 (설명·마크다운 없이):\n${SHAPE_HINT}`
  let rawText: string
  if (answer.image) {
    const prompt = `${base}\n\n아래 이미지에 포함된 학생의 답안을 채점해주세요.${jsonInstruction}`
    rawText = await analyzeFile(config, answer.image.data, answer.image.mimeType, prompt, SYSTEM_INSTRUCTION, signal)
  } else {
    const prompt = `${base}\n\n[학생 답안]\n${answer.text}${jsonInstruction}`
    rawText = await generateText(config, prompt, SYSTEM_INSTRUCTION, signal)
  }
  try {
    const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim()) as GradingResult
    return finalizeScore(parsed)
  } catch {
    throw new Error('AI 응답을 분석할 수 없습니다. Gemini 모델 사용을 권장합니다.')
  }
}
