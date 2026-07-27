import { GoogleGenAI, Type } from '@google/genai'
import type { AppConfig } from '../types'

const GEMINI_MODEL = 'gemini-2.5-flash'
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const OPENAI_MODEL = 'gpt-4o'

function getApiKey(config: AppConfig): string {
  const provider = config.aiProvider ?? 'gemini'
  const key =
    provider === 'claude' ? config.claudeApiKey :
    provider === 'openai' ? config.openaiApiKey :
    config.geminiApiKey
  if (!key) throw new Error(`${provider} API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.`)
  return key
}

// Gemini SDK 호출을 AbortSignal로 감싸는 래퍼.
// 한계: 클라이언트 측에서 Promise를 즉시 reject해 UI는 멈추지만,
// 이미 전송된 Gemini 요청은 서버에서 계속 처리되며 토큰 사용량은 그대로 과금된다.
// (Gemini API 자체 제약 — SDK의 네이티브 abortSignal도 동일하게 "client-only"라 명시됨.
//  Claude/OpenAI는 fetch에 signal을 직접 넘겨 실제 요청까지 취소된다.)
export function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new DOMException('생성이 중단되었습니다.', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('생성이 중단되었습니다.', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      v => { signal.removeEventListener('abort', onAbort); resolve(v) },
      e => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}

export async function generateText(
  config: AppConfig,
  prompt: string,
  systemPrompt?: string,
  signal?: AbortSignal,
): Promise<string> {
  const provider = config.aiProvider ?? 'gemini'
  const apiKey = getApiKey(config)

  if (provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey })
    const geminiCall = ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: systemPrompt ? { systemInstruction: systemPrompt } : undefined,
    }).then(res => res.text ?? '')
    return withSignal(geminiCall, signal)
  }

  if (provider === 'claude') {
    const body: Record<string, unknown> = {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }
    if (systemPrompt) body.system = systemPrompt
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) throw new Error(`Claude API 오류: ${res.status}`)
    const data = await res.json() as { content: Array<{ type: string; text: string }> }
    return data.content.find(c => c.type === 'text')?.text ?? ''
  }

  // OpenAI
  const messages: Array<{ role: string; content: string }> = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: OPENAI_MODEL, messages }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenAI API 오류: ${res.status}`)
  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content ?? ''
}

export async function analyzeFileWithGemini(
  apiKey: string,
  base64: string,
  mimeType: string,
  prompt: string,
  systemPrompt?: string,
  responseSchema?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const geminiCall = ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: base64 } },
      ],
    },
    config: {
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      ...(responseSchema ? { responseMimeType: 'application/json', responseSchema } : {}),
    },
  }).then(res => res.text ?? '')
  return withSignal(geminiCall, signal)
}

export async function analyzeFile(
  config: AppConfig,
  base64: string,
  mimeType: string,
  prompt: string,
  systemPrompt?: string,
  signal?: AbortSignal,
): Promise<string> {
  const provider = config.aiProvider ?? 'gemini'
  const apiKey = getApiKey(config)

  if (provider === 'gemini') {
    return analyzeFileWithGemini(apiKey, base64, mimeType, prompt, systemPrompt, undefined, signal)
  }

  if (provider === 'claude') {
    const contentBlock = mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }
    const content: unknown[] = [contentBlock, { type: 'text', text: prompt }]
    const body: Record<string, unknown> = {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    }
    if (systemPrompt) body.system = systemPrompt
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) throw new Error(`Claude API 오류: ${res.status}`)
    const data = await res.json() as { content: Array<{ type: string; text: string }> }
    return data.content.find(c => c.type === 'text')?.text ?? ''
  }

  // OpenAI supports vision for images only — PDFs are not supported
  if (mimeType === 'application/pdf') {
    throw new Error('OpenAI는 PDF 파일을 직접 지원하지 않습니다. Gemini 또는 Claude 모델을 사용해주세요.')
  }
  const messages: Array<{ role: string; content: unknown }> = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      { type: 'text', text: prompt },
    ],
  })
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: OPENAI_MODEL, messages }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenAI API 오류: ${res.status}`)
  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content ?? ''
}

export async function generateStructuredGemini<T>(
  apiKey: string,
  prompt: string,
  responseSchema: Record<string, unknown>,
  systemPrompt?: string,
  signal?: AbortSignal,
): Promise<T> {
  const ai = new GoogleGenAI({ apiKey })
  const geminiCall = ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    },
  }).then(res => {
    const text = res.text ?? ''
    const stripped = text.replace(/^```[\w]*\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    try { return JSON.parse(stripped) as T }
    catch { throw new Error('AI 응답을 분석할 수 없습니다. 잠시 후 다시 시도해주세요.') }
  })
  return withSignal(geminiCall, signal)
}

export async function analyzeFileStructuredGemini<T>(
  apiKey: string,
  base64: string,
  mimeType: string,
  prompt: string,
  responseSchema: Record<string, unknown>,
  systemPrompt?: string,
  signal?: AbortSignal,
): Promise<T> {
  const text = await analyzeFileWithGemini(apiKey, base64, mimeType, prompt, systemPrompt, responseSchema, signal)
  try {
    const stripped = text.replace(/^```[\w]*\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    return JSON.parse(stripped) as T
  } catch {
    throw new Error('AI 응답을 분석할 수 없습니다. 파일 형식을 확인하거나 Gemini 모델 사용을 권장합니다.')
  }
}

export async function testConnection(config: AppConfig): Promise<string> {
  const provider = config.aiProvider ?? 'gemini'
  try {
    const result = await generateText(config, '안녕하세요. 연결 테스트입니다. "연결 성공"이라고 짧게 답해주세요.')
    if (result) return `${providerLabel(provider)} 연결 성공 ✓`
    throw new Error('빈 응답')
  } catch (e) {
    throw new Error(`${providerLabel(provider)} 연결 실패: ${(e as Error).message}`)
  }
}

function providerLabel(provider: string) {
  return provider === 'claude' ? 'Claude' : provider === 'openai' ? 'ChatGPT' : 'Gemini'
}

// Re-export Type for use in structured generation
export { Type }
