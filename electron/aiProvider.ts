export type AiProvider = 'minimax' | 'deepseek'

export interface AiConfig {
  provider: AiProvider
  apiKey: string
  baseUrl: string
  model: string
}

type EnvLike = Record<string, string | undefined>

const MINIMAX_URL = 'https://api.minimax.io/v1/chat/completions'
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

function normalizeProvider(value: string | undefined): AiProvider | null {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'minimax') return 'minimax'
  if (normalized === 'deepseek') return 'deepseek'
  return null
}

function defaultModel(provider: AiProvider): string {
  if (provider === 'minimax') return 'MiniMax-M3'
  if (provider === 'deepseek') return 'deepseek-v4-pro'
}

function baseUrl(provider: AiProvider): string {
  if (provider === 'minimax') return MINIMAX_URL
  return DEEPSEEK_URL
}

export function resolveAiConfig(env: EnvLike): AiConfig | null {
  const explicitProvider = normalizeProvider(env.BUJO_AI_PROVIDER)

  if (explicitProvider) {
    const keyByProvider: Record<AiProvider, string | undefined> = {
      minimax: env.MINIMAX_API_KEY,
      deepseek: env.DEEPSEEK_API_KEY,
    }
    const apiKey = env.BUJO_AI_KEY || keyByProvider[explicitProvider]
    if (apiKey) {
      return {
        provider: explicitProvider,
        apiKey,
        baseUrl: baseUrl(explicitProvider),
        model: env.BUJO_AI_MODEL || defaultModel(explicitProvider),
      }
    }
  }

  if (env.BUJO_AI_KEY) {
    const provider = explicitProvider || (env.MINIMAX_API_KEY ? 'minimax' : 'deepseek')
    return {
      provider,
      apiKey: env.BUJO_AI_KEY,
      baseUrl: baseUrl(provider),
      model: env.BUJO_AI_MODEL || defaultModel(provider),
    }
  }

  if (env.MINIMAX_API_KEY) {
    const provider: AiProvider = 'minimax'
    return {
      provider,
      apiKey: env.MINIMAX_API_KEY,
      baseUrl: baseUrl(provider),
      model: env.BUJO_AI_MODEL || defaultModel(provider),
    }
  }

  if (env.DEEPSEEK_API_KEY) {
    const provider: AiProvider = 'deepseek'
    return {
      provider,
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: baseUrl(provider),
      model: env.BUJO_AI_MODEL || defaultModel(provider),
    }
  }

  return null
}

export function buildChatCompletionRequest(
  config: AiConfig,
  systemPrompt: string,
  userContent: string,
  maxTokens = 2048
): { url: string; headers: Record<string, string>; body: string } {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }

  return {
    url: config.baseUrl,
    headers,
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  }
}

export type ChatCompletionResult = { ok: true; content: string } | { ok: false; error: string }

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Pick<Response, 'ok' | 'status' | 'statusText' | 'json'>>

export async function callChatCompletion(
  config: AiConfig,
  systemPrompt: string,
  userContent: string,
  maxTokens = 2048,
  fetchImpl: FetchLike = fetch
): Promise<ChatCompletionResult> {
  const request = buildChatCompletionRequest(config, systemPrompt, userContent, maxTokens)
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })

    const data = await response.json().catch(() => ({})) as any
    if (!response.ok) {
      const message = data?.error?.message || response.statusText || 'request failed'
      return { ok: false, error: `AI provider error: ${response.status} ${message}` }
    }

    const content = data?.choices?.[0]?.message?.content?.trim()
    if (!content) return { ok: false, error: 'AI provider returned no content' }
    return { ok: true, content }
  } catch (err: any) {
    return { ok: false, error: `AI provider request failed: ${err?.message || 'unknown error'}` }
  }
}
