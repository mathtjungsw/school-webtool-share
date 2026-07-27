import { analyzeFileStructuredGemini, analyzeFile, Type } from './llm'
import type { AppConfig } from '../types'

export interface ChecklistItem {
  id: number
  category: string
  title: string
}

export interface AnalysisResult {
  id: number
  title: string
  category: string
  has_issue: boolean
  issue_description: string | null
  suggestion: string | null
  source_guideline: string | null
}

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 1,  category: '기본 원칙',          title: '문법, 맞춤법, 띄어쓰기 등 표기 오류' },
  { id: 2,  category: '기본 원칙',          title: '학교폭력 관련 내용 기재 금지' },
  { id: 3,  category: '사교육 유발 요인',   title: '공인어학시험 참여 사실 및 성적/수상 실적 기재 금지' },
  { id: 4,  category: '사교육 유발 요인',   title: '교내·외 대회 참여 사실 및 성적/수상 실적 기재 금지' },
  { id: 5,  category: '사교육 유발 요인',   title: '교외 기관 수상 실적(교외상) 기재 금지' },
  { id: 6,  category: '사교육 유발 요인',   title: '교내·외 인증시험 참여 사실 및 성적 기재 금지' },
  { id: 7,  category: '사교육 유발 요인',   title: '모의고사·전국연합학력평가 성적 및 관련 수상 실적 기재 금지' },
  { id: 8,  category: '사교육 유발 요인',   title: '논문 등재·발표 사실 기재 금지' },
  { id: 9,  category: '사교육 유발 요인',   title: '도서 출간 사실 기재 금지' },
  { id: 10, category: '사교육 유발 요인',   title: '지식재산권(특허 등) 출원·등록 사실 기재 금지' },
  { id: 11, category: '사교육 유발 요인',   title: '어학연수 등 해외 활동실적 기재 금지' },
  { id: 12, category: '사교육 유발 요인',   title: '부모(친인척)의 사회·경제적 지위 암시 내용 기재 금지' },
  { id: 13, category: '사교육 유발 요인',   title: '장학생·장학금 관련 내용 기재 금지' },
  { id: 14, category: '사교육 유발 요인',   title: '구체적인 특정 대학명, 기관명, 상호명, 강사명 등 기재 금지' },
  { id: 15, category: '사교육 유발 요인',   title: '자격증 명칭 및 취득 사실 타 항목 기재 금지' },
  { id: 16, category: '고교 블라인드',      title: '학교명, 재단명 등 학교 식별 정보 기재 금지' },
  { id: 17, category: '기재 금지 사항',     title: '항목과 무관하거나 기록 불가 내용 기재 금지' },
  { id: 18, category: '기재 금지 사항',     title: '사실 과장, 부풀리기, 허위 사실 기재 금지' },
  { id: 19, category: '기재 금지 사항',     title: '학생이 작성한 내용 제출받아 기재 금지' },
  { id: 20, category: '서식',              title: '문자 표기(한글/영문) 원칙 준수' },
  { id: 21, category: '서식',              title: '학적변동 학생 중복기간 자료 삭제' },
  { id: 22, category: '서식',              title: '글자 깨짐(복사/붙여넣기 오류) 확인' },
  { id: 23, category: '서식',              title: '서술형 문장 명사형 종결어미 사용' },
  { id: 24, category: '출결 특기사항',     title: '학교폭력 조치사항(8, 9호) 기재 (3학년)' },
  { id: 25, category: '출결 특기사항',     title: '장기결석 및 기타결석 사유 기재' },
  { id: 26, category: '출결 특기사항',     title: "'개근' 기재 원칙 준수" },
  { id: 27, category: '출결 특기사항',     title: '학교폭력 조치사항(4, 5, 6호) 기재 (3학년)' },
  { id: 28, category: '출결 특기사항',     title: '전·편입학생 과목별 출석률 산출' },
  { id: 29, category: '수상경력',          title: '교내상 관련 내용 타 항목 기재 금지' },
  { id: 30, category: '수상경력',          title: '교외상 기재 금지 원칙 준수' },
  { id: 31, category: '수상경력',          title: '교과우수상 입력 원칙 준수' },
  { id: 32, category: '수상경력',          title: '등위, 수여기관, 참가대상(인원) 정확히 기재' },
  { id: 33, category: '수상경력',          title: '단체수상, 임명장, 인증서 기재 금지' },
  { id: 34, category: '수상경력',          title: '유의사항 금지 실적 및 야간자율학습 근거 수상 기재 금지' },
  { id: 35, category: '자격증 및 인증',    title: '기재 가능 자격증 범위 준수' },
  { id: 36, category: '자격증 및 인증',    title: '자격증 번호 정확히 기재' },
  { id: 37, category: '창의적 체험활동',   title: '영역별 특기사항에 개별적 특성 드러나게 기재' },
  { id: 38, category: '창의적 체험활동',   title: '자율·동아리·진로활동 특기사항 기재 지침 준수' },
  { id: 39, category: '창의적 체험활동',   title: '자율탐구활동 기재 지침 준수' },
  { id: 40, category: '창의적 체험활동',   title: '기재 가능 체험활동 범위(장소) 준수' },
  { id: 41, category: '창의적 체험활동',   title: '임원 재임기간 정확히 입력' },
  { id: 42, category: '창의적 체험활동',   title: '자율동아리 기재 방식 준수' },
  { id: 43, category: '창의적 체험활동',   title: '청소년단체 활동 기재 금지' },
  { id: 44, category: '창의적 체험활동',   title: '정규교육과정 외 학교스포츠클럽 기재 방식' },
  { id: 45, category: '창의적 체험활동',   title: '진로희망사항 기재 방식' },
  { id: 46, category: '봉사활동',          title: '활동 내용의 객관성 유지(정성적 평가 제외)' },
  { id: 47, category: '교과학습발달상황',  title: '세부능력 및 특기사항 모든 학생 대상 입력' },
  { id: 48, category: '독서활동상황',      title: '기재 형식(도서명(저자)) 및 중복 기재 금지' },
  { id: 49, category: '행동특성 및 종합의견', title: '학생의 성장, 발전 가능성 중심으로 구체적 작성' },
]

const SYSTEM_INSTRUCTION = `당신은 대한민국 교육부의 '2025학년도 학교생활기록부 기재요령'을 완벽하게 숙지한 생기부 감사 전문가입니다.

[분석 대원칙]
1. 보수적 판단: 조금이라도 의심되는 단어(토익, 소논문, 부모 직업, 특정 대학명 등)는 즉시 검토 필요 항목으로 분류하십시오.
2. 문맥적 이해: 단순히 단어만 찾는 것이 아니라, 전체적인 문맥을 파악하여 오탐을 줄이십시오.
3. 수정 제안: 지침을 준수하면서도 학생의 우수성이 잘 드러날 수 있는 문장으로 수정을 제안하십시오.
4. 블라인드 점검: 학교명, 지역명 등 식별 가능한 정보가 포함되어 있는지 철저히 확인하십시오.

반드시 한국어로 답변하며, 요청한 JSON 형식을 엄격히 준수하십시오.`

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id:                { type: Type.INTEGER },
      has_issue:         { type: Type.BOOLEAN },
      issue_description: { type: Type.STRING, nullable: true },
      suggestion:        { type: Type.STRING, nullable: true },
      source_guideline:  { type: Type.STRING, nullable: true },
    },
    required: ['id', 'has_issue'],
  },
}

type RawResult = {
  id: number
  has_issue: boolean
  issue_description?: string | null
  suggestion?: string | null
  source_guideline?: string | null
}

function mergeWithChecklist(rawResults: RawResult[]): AnalysisResult[] {
  return CHECKLIST_ITEMS.map(item => {
    const r = rawResults.find(x => x.id === item.id)
    return {
      id: item.id,
      title: item.title,
      category: item.category,
      has_issue: r?.has_issue ?? false,
      issue_description: r?.issue_description ?? null,
      suggestion: r?.suggestion ?? null,
      source_guideline: r?.source_guideline ?? null,
    }
  })
}

export async function analyzeStudentReport(
  config: AppConfig,
  base64: string,
  signal?: AbortSignal,
): Promise<AnalysisResult[]> {
  const provider = config.aiProvider ?? 'gemini'

  const prompt = `다음 학교생활기록부 PDF를 분석하여 총 ${CHECKLIST_ITEMS.length}개의 점검 항목에 대해 교육부 지침 준수 여부를 판단하십시오.

각 항목에 대해 id, has_issue, issue_description(위반 시 구체적 원문 인용), suggestion(개선 문장 예시), source_guideline(근거 지침)을 포함한 배열을 반환하십시오.`

  if (provider === 'gemini') {
    const apiKey = config.geminiApiKey
    if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.')

    const results = await analyzeFileStructuredGemini<RawResult[]>(
      apiKey, base64, 'application/pdf', prompt, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION, signal,
    )
    return mergeWithChecklist(results)
  }

  // Claude / OpenAI: 텍스트 응답에서 JSON 파싱
  const textPrompt = `${prompt}

점검 항목 목록:
${CHECKLIST_ITEMS.map(i => `${i.id}. [${i.category}] ${i.title}`).join('\n')}

반드시 아래 JSON 배열 형식만 반환하세요 (설명 없이):
[{"id":1,"has_issue":false,"issue_description":null,"suggestion":null,"source_guideline":null}, ...]`

  const raw = await analyzeFile(config, base64, 'application/pdf', textPrompt, SYSTEM_INSTRUCTION, signal)
  let parsed: RawResult[]
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as RawResult[]
  } catch {
    throw new Error('AI 응답을 분석할 수 없습니다. Gemini 모델 사용을 권장합니다.')
  }
  return mergeWithChecklist(parsed)
}

export function getCategorySummary(results: AnalysisResult[]) {
  const map = new Map<string, { total: number; issues: number }>()
  for (const r of results) {
    const entry = map.get(r.category) ?? { total: 0, issues: 0 }
    entry.total++
    if (r.has_issue) entry.issues++
    map.set(r.category, entry)
  }
  return map
}
