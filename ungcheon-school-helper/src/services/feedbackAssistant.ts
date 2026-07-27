import { generateStructuredGemini, generateText, Type } from './llm'
import type { AppConfig } from '../types'

// 원본: 29-google-ai-studio/ai-feedback-assistant (services/geminiService.ts, types.ts)
// 학생 과제 텍스트 → AI 피드백. 일반(general)/루브릭(rubric) 두 모드. 프롬프트·스키마 원본 보존.

export enum FeedbackStyle {
  FORMAL = '정중하고 격식있는',
  CONCISE = '간결하고 핵심적인',
  ENCOURAGING = '따뜻하고 격려하는',
  DETAILED = '상세하고 분석적인',
}

export interface LevelDescriptor {
  level: number
  description: string
}

export interface CustomRubricCriterion {
  id: string
  name: string
  levelDescriptors: LevelDescriptor[]
}

export interface CustomRubric {
  targetAudience: string
  subjectGroup: string
  standard: string
  topic: string
  evaluationPurpose: string
  achievementStandard: string
  directive: string
  criteria: CustomRubricCriterion[]
  numberOfLevels: number
}

export interface FeedbackItem {
  category: string
  feedback: string
  score: number
}

export interface RubricFeedback {
  type: 'rubric'
  summary: string
  feedbackItems: FeedbackItem[]
}

export interface GeneralFeedback {
  type: 'general'
  summary: string
  strengths: string[]
  areasForImprovement: string[]
}

export type AIFeedback = RubricFeedback | GeneralFeedback

export interface GeneralContext {
  targetAudience: string
  subject: string
  assignment: string
}

export interface FeedbackParams {
  text: string
  style: FeedbackStyle
  fileType: string
  mode: 'rubric' | 'general'
  rubric?: CustomRubric
  generalContext?: GeneralContext
}

interface RubricAIResponse {
  summary: string
  feedbackItems: { category: string; feedback: string; score: number }[]
}
interface GeneralAIResponse {
  summary: string
  strengths: string[]
  areasForImprovement: string[]
}

export async function generateFeedback(
  config: AppConfig,
  params: FeedbackParams,
  signal?: AbortSignal,
): Promise<AIFeedback> {
  const { text, style, fileType, mode, rubric, generalContext } = params
  const provider = config.aiProvider ?? 'gemini'

  if (mode === 'rubric' && !rubric) throw new Error('루브릭 평가를 위해 루브릭을 정의해주세요.')

  // ── 루브릭 모드 ──
  if (mode === 'rubric' && rubric) {
    const rubricSchema = {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: '과제에 대한 1-2문장의 전반적인 총평입니다.' },
        feedbackItems: {
          type: Type.ARRAY,
          description: '각 평가 항목에 대한 상세 피드백입니다.',
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, enum: rubric.criteria.map(c => c.name), description: '피드백의 평가 항목입니다.' },
              feedback: { type: Type.STRING, description: '해당 항목에 대한 구체적인 피드백 문장입니다.' },
              score: { type: Type.INTEGER, description: `해당 항목에 대한 1점에서 ${rubric.numberOfLevels}점 사이의 정수 점수입니다.` },
            },
            required: ['category', 'feedback', 'score'],
          },
        },
      },
      required: ['summary', 'feedbackItems'],
    }

    const prompt = `
당신은 ${rubric.targetAudience}을(를) 가르치는 ${rubric.subjectGroup} 전문 교사입니다.
과제 주제는 '${rubric.topic}'이며, 평가 목표는 다음과 같습니다.
- 목적: ${rubric.evaluationPurpose}
- 성취기준: ${rubric.achievementStandard}

다음은 학생이 제출한 '${fileType}' 형식의 파일에서 추출된 텍스트입니다.
아래에 제시된 상세 평가 기준과 레벨별 단계 기술어에 따라 텍스트를 분석하고, JSON 형식으로 구조화된 피드백을 생성해주세요.

각 평가 기준에 대해 1점에서 ${rubric.numberOfLevels}점 사이의 점수를 부여해야 합니다. 점수는 레벨별 단계 기술어를 가장 잘 만족하는 레벨에 해당합니다.
피드백은 학생들이 이해하기 쉽도록 작성하고, 다음 지시어를 참고하여 일관성을 유지해주세요: "${rubric.directive}".
피드백의 전체적인 어조는 '${style}' 스타일을 유지해야 합니다.

---
${rubric.criteria.map(criterion => `
평가 기준: "${criterion.name}"
${criterion.levelDescriptors.map(ld => `- 레벨 ${ld.level}: ${ld.description}`).join('\n')}
`).join('\n---\n')}
---

분석할 텍스트:
---
${text}
---
`.trim()

    let parsed: RubricAIResponse
    if (provider === 'gemini') {
      const apiKey = config.geminiApiKey
      if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.')
      parsed = await generateStructuredGemini<RubricAIResponse>(apiKey, prompt, rubricSchema, undefined, signal)
    } else {
      const raw = await generateText(config, `${prompt}\n\n반드시 JSON만 반환: { "summary": "", "feedbackItems": [{ "category": "", "feedback": "", "score": 0 }] }`, undefined, signal)
      try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as RubricAIResponse }
      catch { throw new Error('AI 응답을 분석할 수 없습니다. Gemini 모델 사용을 권장합니다.') }
    }

    // 기준 순서대로 정렬 + 누락 보정
    const sorted = rubric.criteria.map(c => {
      const found = parsed.feedbackItems.find(it => it.category === c.name)
      return found ?? { category: c.name, feedback: '피드백을 생성하지 못했습니다.', score: 0 }
    })
    return { type: 'rubric', summary: parsed.summary, feedbackItems: sorted }
  }

  // ── 일반 모드 ──
  const generalSchema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING, description: '과제에 대한 1-2문장의 전반적인 총평입니다.' },
      strengths: { type: Type.ARRAY, description: '과제의 잘한 점, 칭찬할 점 (2-3개).', items: { type: Type.STRING } },
      areasForImprovement: { type: Type.ARRAY, description: '개선할 점, 보완할 점 (2-3개).', items: { type: Type.STRING } },
    },
    required: ['summary', 'strengths', 'areasForImprovement'],
  }

  const prompt = `
당신은 ${generalContext?.targetAudience || '학생'}을(를) 가르치는 ${generalContext?.subject || '과목'} 전문 교사입니다.
과제 주제는 "${generalContext?.assignment || '제시된 과제'}"입니다.
다음은 학생이 제출한 '${fileType}' 형식의 파일에서 추출된 텍스트입니다.
이 텍스트를 분석하여, 학생의 성장에 도움이 될 종합적인 피드백을 JSON 형식으로 생성해주세요.

피드백에는 다음 내용을 포함해야 합니다:
1. 총평 (summary): 과제에 대한 1-2문장의 전반적인 요약.
2. 잘한 점 (strengths): 구체적인 예시를 들어 2-3가지 칭찬할 점.
3. 개선할 점 (areasForImprovement): 학생이 다음 과제에서 성장할 수 있도록 2-3가지 구체적이고 실행 가능한 조언.

피드백의 전체적인 어조는 '${style}' 스타일을 유지해야 합니다.

분석할 텍스트:
---
${text}
---
`.trim()

  let parsed: GeneralAIResponse
  if (provider === 'gemini') {
    const apiKey = config.geminiApiKey
    if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.')
    parsed = await generateStructuredGemini<GeneralAIResponse>(apiKey, prompt, generalSchema, undefined, signal)
  } else {
    const raw = await generateText(config, `${prompt}\n\n반드시 JSON만 반환: { "summary": "", "strengths": [""], "areasForImprovement": [""] }`, undefined, signal)
    try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as GeneralAIResponse }
    catch { throw new Error('AI 응답을 분석할 수 없습니다. Gemini 모델 사용을 권장합니다.') }
  }
  return { type: 'general', ...parsed }
}

// 레벨 수 변경 시 기술어 배열을 보존하며 길이 맞춤
export function resizeLevelDescriptors(descriptors: LevelDescriptor[], n: number): LevelDescriptor[] {
  return Array.from({ length: n }, (_, i) => descriptors[i] ?? { level: i + 1, description: `${i + 1}/${n} 수준` })
    .map((d, i) => ({ level: i + 1, description: d.description }))
}

export function defaultRubric(): CustomRubric {
  const N = 8
  const mkCriterion = (name: string, tmpl: (i: number) => string): CustomRubricCriterion => ({
    id: `criterion-${Math.random().toString(36).slice(2)}`,
    name,
    levelDescriptors: Array.from({ length: N }, (_, i) => ({ level: i + 1, description: tmpl(i + 1) })),
  })
  return {
    targetAudience: '고등학교 1학년',
    subjectGroup: '국어',
    standard: '서술형 평가',
    topic: '시 분석 및 감상문 작성',
    evaluationPurpose: '작품의 주제와 정서를 파악하고 자신의 감상을 논리적으로 표현하는 능력을 평가한다.',
    achievementStandard: '문학 작품을 읽고 내용, 형식, 표현상의 특징과 작품에 드러난 작가의 개성을 파악한다.',
    directive: '평가 기준에 명시된 내용에 근거하여 객관적으로 평가한다.',
    numberOfLevels: N,
    criteria: [
      mkCriterion('내용 이해 및 분석', i => `작품의 핵심 내용을 ${i}/${N} 수준으로 이해하고 분석함.`),
      mkCriterion('구조의 논리성', i => `글의 구조가 ${i}/${N} 수준으로 논리적이고 일관됨.`),
      mkCriterion('표현의 창의성', i => `자신만의 독창적인 표현을 ${i}/${N} 수준으로 사용함.`),
    ],
  }
}
