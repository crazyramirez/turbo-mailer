import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiJson, type AiJsonRequest } from '~/server/utils/ai/provider'

const db = vi.hoisted(() => ({
  get: vi.fn(),
  run: vi.fn(),
}))

// Importing the provider must never initialize or write to the real database.
vi.mock('~/server/db/index', () => ({
  sqlite: { prepare: vi.fn(() => db) },
}))

const fetchMock = vi.fn<typeof fetch>()
const config = vi.fn()
const request: AiJsonRequest = {
  feature: 'email.generate',
  system: 'Write a welcome email.',
  messages: [{ role: 'user', content: 'Welcome new subscribers.' }],
  schema: {
    type: 'object',
    properties: { subject: { type: 'string' } },
    required: ['subject'],
    additionalProperties: false,
  },
}

function completion(value: unknown) {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 8 },
  })
}

function providerError(message: string, status = 400) {
  return Response.json({ error: { message } }, { status })
}

function sentBody(index = 0) {
  return JSON.parse(fetchMock.mock.calls[index]![1]!.body as string)
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  config.mockReturnValue({
    aiProvider: 'openai',
    openaiApiKey: 'test-openai-key',
    openaiModel: 'gpt-5',
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('useServerConfig', config)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenAI JSON generation parameters', () => {
  it.each(['gpt-5', 'o3', 'gpt-4o-mini'])('uses supported token parameters for %s', async (model) => {
    config.mockReturnValue({ aiProvider: 'openai', openaiApiKey: 'test-openai-key', openaiModel: model })
    fetchMock.mockResolvedValueOnce(completion({ subject: 'Welcome!' }))

    await expect(aiJson(request)).resolves.toEqual({ subject: 'Welcome!' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.openai.com/v1/chat/completions')
    expect(sentBody()).toMatchObject({
      model,
      max_completion_tokens: 8000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'email_generate', schema: request.schema, strict: true },
      },
    })
    expect(sentBody()).not.toHaveProperty('max_tokens')
    expect(sentBody()).not.toHaveProperty('temperature')
  })

  it.each([
    [2048, 2048],
    [32000, 16000],
  ])('limits a requested budget of %i to %i completion tokens', async (maxTokens, expected) => {
    fetchMock.mockResolvedValueOnce(completion({ subject: 'Welcome!' }))

    await aiJson({ ...request, maxTokens })

    expect(sentBody().max_completion_tokens).toBe(expected)
    expect(sentBody()).not.toHaveProperty('max_tokens')
  })

  it('preserves local OpenAI-compatible endpoint parameters', async () => {
    config.mockReturnValue({
      aiProvider: 'compatible',
      aiBaseUrl: 'http://localhost:11434/v1/',
      aiModel: 'llama3.1',
    })
    fetchMock.mockResolvedValueOnce(completion({ subject: 'Local welcome' }))

    await expect(aiJson({ ...request, maxTokens: 32000 })).resolves.toEqual({ subject: 'Local welcome' })

    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/v1/chat/completions')
    expect(sentBody()).toMatchObject({
      model: 'llama3.1',
      max_tokens: 16000,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })
    expect(sentBody()).not.toHaveProperty('max_completion_tokens')
  })
})

describe('OpenAI JSON fallback and error handling', () => {
  it('keeps completion parameters when retrying an unsupported JSON schema as JSON mode', async () => {
    fetchMock
      .mockResolvedValueOnce(providerError('response_format json_schema is not supported'))
      .mockResolvedValueOnce(completion({ subject: 'Welcome after fallback' }))

    await expect(aiJson({ ...request, maxTokens: 4096 })).resolves.toEqual({ subject: 'Welcome after fallback' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentBody(1)).toEqual({ ...sentBody(0), response_format: { type: 'json_object' } })
    expect(sentBody(1).max_completion_tokens).toBe(4096)
    expect(sentBody(1)).not.toHaveProperty('max_tokens')
    expect(sentBody(1)).not.toHaveProperty('temperature')
  })

  it.each([400, 200])('rejects a provider error with HTTP %i instead of returning a generated email', async (status) => {
    fetchMock.mockResolvedValueOnce(providerError('Unsupported parameter: max_tokens', status))

    await expect(aiJson(request)).rejects.toMatchObject({
      name: 'AiError',
      code: 'provider_error',
      message: 'Error de la IA: Unsupported parameter: max_tokens',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(db.run).not.toHaveBeenCalled()
  })

})
