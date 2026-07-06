import { describe, expect, it } from 'vitest'
import { buildChatCompletionRequest, callChatCompletion, resolveAiConfig } from '../aiProvider'

describe('resolveAiConfig', () => {
  it('uses MiniMax direct when configured', () => {
    const config = resolveAiConfig({
      MINIMAX_API_KEY: 'minimax-key',
    })

    expect(config).toEqual({
      provider: 'minimax',
      apiKey: 'minimax-key',
      baseUrl: 'https://api.minimax.io/v1/chat/completions',
      model: 'MiniMax-M3',
    })
  })

  it('allows BUJO_AI_KEY to override env provider keys while using the configured provider/model', () => {
    const config = resolveAiConfig({
      BUJO_AI_KEY: 'manual-key',
      BUJO_AI_PROVIDER: 'minimax',
      BUJO_AI_MODEL: 'MiniMax-M2.7',
      DEEPSEEK_API_KEY: 'deepseek-key',
    })

    expect(config?.provider).toBe('minimax')
    expect(config?.apiKey).toBe('manual-key')
    expect(config?.baseUrl).toBe('https://api.minimax.io/v1/chat/completions')
    expect(config?.model).toBe('MiniMax-M2.7')
  })

  it('uses DeepSeek direct when configured', () => {
    const config = resolveAiConfig({
      BUJO_AI_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'deepseek-key',
    })

    expect(config).toEqual({
      provider: 'deepseek',
      apiKey: 'deepseek-key',
      baseUrl: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-v4-pro',
    })
  })

})

describe('callChatCompletion', () => {
  const config = {
    provider: 'minimax' as const,
    apiKey: 'minimax-key',
    baseUrl: 'https://api.minimax.io/v1/chat/completions',
    model: 'MiniMax-M3',
  }

  it('returns trimmed message content from a successful provider response', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '  useful answer  ' } }] }),
    }) as Response

    await expect(callChatCompletion(config, 'system', 'user', 500, fetchImpl)).resolves.toEqual({
      ok: true,
      content: 'useful answer',
    })
  })

  it('returns structured error for non-OK provider responses without leaking request headers', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: { message: 'bad key' } }),
    }) as Response

    await expect(callChatCompletion(config, 'system', 'user', 500, fetchImpl)).resolves.toEqual({
      ok: false,
      error: 'AI provider error: 401 bad key',
    })
  })

  it('returns structured error when the provider response has no content', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ choices: [] }),
    }) as Response

    await expect(callChatCompletion(config, 'system', 'user', 500, fetchImpl)).resolves.toEqual({
      ok: false,
      error: 'AI provider returned no content',
    })
  })
})
