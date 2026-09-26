import { aiJson, AiError, resolveProvider } from '~/server/utils/ai/provider'

// Round-trip check of the configured AI provider with a tiny structured call.
export default defineEventHandler(async () => {
  const p = resolveProvider()
  if (!p) return { ok: false, error: 'No hay proveedor de IA configurado' }
  const started = Date.now()
  try {
    const out = await aiJson<{ ok: boolean; greeting: string }>({
      feature: 'settings_test',
      effort: 'low',
      maxTokens: 500,
      system: 'Responde en JSON.',
      messages: [{ role: 'user', content: 'Di "hola" en greeting y ok=true.' }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'greeting'],
        properties: { ok: { type: 'boolean' }, greeting: { type: 'string' } },
      },
    })
    return { ok: out.ok === true, provider: p.name, model: p.model, ms: Date.now() - started }
  } catch (err) {
    return { ok: false, provider: p.name, model: p.model, error: err instanceof AiError ? err.message : String((err as Error)?.message || err) }
  }
})
