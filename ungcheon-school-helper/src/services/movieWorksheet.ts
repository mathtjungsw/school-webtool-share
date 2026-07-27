import { generateStructuredGemini, generateText, Type } from './llm'
import type { AppConfig } from '../types'

// 원본: 29-google-ai-studio/movie-story-학습지-제작-도우미 (services/geminiService.ts, types.ts)
// 영화 제목 → 중3 수준 영화 논술 학습지(JSON) 생성. 프롬프트·스키마는 원본 그대로 보존.

export interface Actor {
  name: string
  role: string
}

export interface QuestionAnswer {
  question: string
  answer: string
}

export interface WorksheetData {
  movieTitle: string
  basicInfo: {
    year: string
    naverRating: string
    ageRating: string
  }
  synopsis: string
  directorAndActors: {
    director: string
    actors: Actor[]
  }
  contentQuestions: QuestionAnswer[]
  essayQuestions: QuestionAnswer[]
  selfReflectionQuestions: QuestionAnswer[]
}

const worksheetSchema = {
  type: Type.OBJECT,
  properties: {
    movieTitle: { type: Type.STRING },
    basicInfo: {
      type: Type.OBJECT,
      properties: {
        year: { type: Type.STRING },
        naverRating: { type: Type.STRING },
        ageRating: { type: Type.STRING },
      },
      required: ['year', 'naverRating', 'ageRating'],
    },
    synopsis: { type: Type.STRING },
    directorAndActors: {
      type: Type.OBJECT,
      properties: {
        director: { type: Type.STRING },
        actors: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
            },
            required: ['name', 'role'],
          },
        },
      },
      required: ['director', 'actors'],
    },
    contentQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
        required: ['question', 'answer'],
      },
    },
    essayQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
        required: ['question', 'answer'],
      },
    },
    selfReflectionQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
        required: ['question', 'answer'],
      },
    },
  },
  required: [
    'movieTitle',
    'basicInfo',
    'synopsis',
    'directorAndActors',
    'contentQuestions',
    'essayQuestions',
    'selfReflectionQuestions',
  ],
}

function buildPrompt(movieTitle: string): string {
  return `
당신은 30년차 베테랑 국어 교사입니다. 당신의 임무는 사용자가 제공한 영화 제목을 바탕으로 중학교 3학년 수준의 '영화 논술 수업용 학습지'를 만드는 것입니다. 친절하고 전문적인 교사의 말투를 사용해 주세요.

영화 제목: "${movieTitle}"

아래의 요구사항과 JSON 스키마에 따라 학습지 내용을 생성해 주세요. 모든 내용은 한국어로 작성해야 합니다.

**학습지 구성 요구사항:**
1.  **영화 기본정보**: 제작년도, 네이버 영화 평점, 관람등급을 찾아 기입해 주세요. 정보가 없다면 "정보 없음"으로 표기해 주세요.
2.  **시놉시스**: 영화의 전체 줄거리를 20줄 내외의 분량으로 요약하여 작성해 주세요. 학생들이 영화를 이해하는 데 도움이 되도록 명확하고 흥미롭게 서술해야 합니다.
3.  **감독, 배우**: 감독 이름과 주요 배우들의 이름 및 역할 이름을 기입해 주세요.
4.  **문제 만들기**:
    *   **내용 관련 문제 (10개)**: 영화의 내용과 관련된 객관식 또는 서술형 문제를 10개 만들어 주세요. 문제 바로 뒤에 답을 포함해야 합니다.
    *   **심화 논술형 문제 (5개)**: 영화의 주제, 인물의 갈등, 사회적 메시지 등과 관련된 심화 논술 문제를 5개 만들어 주세요. 답은 150자 내외의 예시 답안으로 작성해야 합니다.
    *   **'나'와 관련된 문제 (3개)**: "만약 나라면 어떻게 행동했을까?"와 같이 학생 자신을 돌아볼 수 있는 질문을 3개 만들어 주세요. 답은 학생들의 사고를 유도할 수 있는 예시 답안으로 작성해야 합니다.

문제의 난이도는 중학교 3학년 학생들이 충분히 생각하고 답할 수 있는 수준으로 조절해 주세요.
  `.trim()
}

const SHAPE_HINT = `{
  "movieTitle": "",
  "basicInfo": { "year": "", "naverRating": "", "ageRating": "" },
  "synopsis": "",
  "directorAndActors": { "director": "", "actors": [{ "name": "", "role": "" }] },
  "contentQuestions": [{ "question": "", "answer": "" }],
  "essayQuestions": [{ "question": "", "answer": "" }],
  "selfReflectionQuestions": [{ "question": "", "answer": "" }]
}`

export async function generateWorksheet(
  config: AppConfig,
  movieTitle: string,
  signal?: AbortSignal,
): Promise<WorksheetData> {
  const provider = config.aiProvider ?? 'gemini'
  const prompt = buildPrompt(movieTitle)

  if (provider === 'gemini') {
    const apiKey = config.geminiApiKey
    if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.')
    return generateStructuredGemini<WorksheetData>(apiKey, prompt, worksheetSchema, undefined, signal)
  }

  // Claude / OpenAI: 텍스트 응답에서 JSON 파싱
  const textPrompt = `${prompt}

반드시 아래 JSON 형식만 반환하세요 (설명·마크다운 없이):
${SHAPE_HINT}`
  const raw = await generateText(config, textPrompt, undefined, signal)
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim()) as WorksheetData
  } catch {
    throw new Error('AI 응답을 분석할 수 없습니다. Gemini 모델 사용을 권장합니다.')
  }
}
