import { generateStructuredGemini, generateText, Type } from './llm'
import type { AppConfig } from '../types'

// 원본: 29-google-ai-studio/면접닥터-(interview-doctor) (services/geminiService.ts)
// 대입 면접 스크립트 → 구조화 피드백. 시스템 프롬프트·스키마는 원본 그대로 보존.

export interface InterviewAnalysis {
  overallSummary: string
  goodPoints: string[]
  areasForImprovement: string[]
  finalAdvice: string
}

const SYSTEM_INSTRUCTION =
  "당신은 '면접닥터'라는 이름의 대한민국 대입 면접 전문 AI 코치입니다. 당신의 목표는 학생부종합전형 및 심층 면접을 준비하는 수험생에게 실질적인 도움을 주는 것입니다. 답변은 반드시 한국어로, 격려하는 동시에 매우 구체적이고 전문적인 톤을 유지해야 합니다. 피드백을 제공할 때는, 칭찬할 점과 개선할 점에 대해 사용자가 제출한 스크립트의 특정 구절을 '인용'하여 근거를 명확히 제시해야 합니다. 예를 들어, '\"...\"라고 답변한 부분은 매우 훌륭합니다' 또는 '\"...\" 부분은 조금 더 구체적인 경험을 덧붙이면 좋을 것 같습니다' 와 같이 설명해주세요. 답변의 명확성, 논리적 구조, 표현력, 그리고 학생의 경험과 역량이 잘 드러나는지를 중심으로 심도 있게 분석해주세요."

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    overallSummary: {
      type: Type.STRING,
      description: '면접 스크립트에 대한 전반적인 총평을 1~2문장으로 요약합니다.',
    },
    goodPoints: {
      type: Type.ARRAY,
      description: '면접에서 잘한 점 2~3가지를 구체적으로 칭찬합니다.',
      items: { type: Type.STRING },
    },
    areasForImprovement: {
      type: Type.ARRAY,
      description: '개선이 필요한 점 2~3가지를 구체적이고 건설적인 방식으로 제안합니다.',
      items: { type: Type.STRING },
    },
    finalAdvice: {
      type: Type.STRING,
      description: '다음 면접을 위한 격려와 함께 마지막 조언을 한 문장으로 제공합니다.',
    },
  },
  required: ['overallSummary', 'goodPoints', 'areasForImprovement', 'finalAdvice'],
}

const SHAPE_HINT = `{ "overallSummary": "", "goodPoints": [""], "areasForImprovement": [""], "finalAdvice": "" }`

export async function analyzeInterview(
  config: AppConfig,
  script: string,
  signal?: AbortSignal,
): Promise<InterviewAnalysis> {
  const provider = config.aiProvider ?? 'gemini'
  const prompt = `다음 면접 스크립트를 분석해주세요:\n\n---\n${script}\n---`

  if (provider === 'gemini') {
    const apiKey = config.geminiApiKey
    if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.')
    return generateStructuredGemini<InterviewAnalysis>(apiKey, prompt, responseSchema, SYSTEM_INSTRUCTION, signal)
  }

  const textPrompt = `${prompt}\n\n반드시 아래 JSON 형식만 반환하세요 (설명·마크다운 없이):\n${SHAPE_HINT}`
  const raw = await generateText(config, textPrompt, SYSTEM_INSTRUCTION, signal)
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim()) as InterviewAnalysis
  } catch {
    throw new Error('AI 응답을 분석할 수 없습니다. Gemini 모델 사용을 권장합니다.')
  }
}
