import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { sqlite } from '~/server/db/index'

// One interface for every AI feature, three backends:
//
//   anthropic   Claude through the official SDK — structured outputs
//               (output_config.format json_schema) + server-side refusal
//               fallback enabled by default
//   openai      OpenAI Chat Completions (existing installs keep working)
//   compatible  any OpenAI-compatible endpoint: Ollama, LM Studio, vLLM,
//               Groq, OpenRouter... (local/private AI)
//
// Features ask for JSON that matches a schema; the answer is validated here
// before anyone uses it, whatever the backend.

export type AiProviderName = 'anthropic' | 'openai' | 'compatible'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface AiImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  base64: string
}

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  images?: AiImage[]
}

export interface AiJsonRequest {
  feature: string
  system: string
  messages: AiMessage[]
  schema: Record<string, unknown>
  effort?: Effort
  maxTokens?: number
}

export class AiError extends Error {
  constructor(message: string, public code: 'not_configured' | 'refusal' | 'invalid_output' | 'provider_error' | 'truncated' = 'provider_error') {
    super(message)
    this.name = 'AiError'
  }
}

export const DEFAULT_MODELS: Record<AiProviderName, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-4o-mini',
  compatible: 'llama3.1',
}

export interface ResolvedProvider {
  name: AiProviderName
  model: string
  apiKey: string
  baseUrl?: string
}

/** Which backend is configured (explicit choice, else whatever has a key). */
export function resolveProvider(config: Record<string, any> = useServerConfig()): ResolvedProvider | null {
  const explicit = String(config.aiProvider || '').trim() as AiProviderName | ''
  const anthropicKey = String(config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '')
  const openaiKey = String(config.openaiApiKey || process.env.OPENAI_API_KEY || '')
  const baseUrl = String(config.aiBaseUrl || '').replace(/\/$/, '')
  const order: AiProviderName[] = explicit ? [explicit] : ['anthropic', 'openai', 'compatible']
  for (const name of order) {
    if (name === 'anthropic' && anthropicKey) {
      return { name, apiKey: anthropicKey, model: String(config.anthropicModel || DEFAULT_MODELS.anthropic) }
    }
    if (name === 'openai' && openaiKey) {
      return { name, apiKey: openaiKey, model: String(config.openaiModel || DEFAULT_MODELS.openai) }
    }
    if (name === 'compatible' && baseUrl) {
      return { name, apiKey: String(config.aiApiKey || ''), baseUrl, model: String(config.aiModel || DEFAULT_MODELS.compatible) }
    }
  }
  return null
}

export function aiConfigured(): boolean {
  return !!resolveProvider()
}

// ── Usage accounting (per month, per provider) ─────────────────────────────

function recordUsage(provider: AiProviderName, feature: string, input: number, output: number) {
  try {
    const month = new Date().toISOString().slice(0, 7)
    const key = `ai:usage:${month}`
    const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    const cur = row ? JSON.parse(row.value) : { calls: 0, input: 0, output: 0, byFeature: {} as Record<string, number>, byProvider: {} as Record<string, number> }
    cur.calls++
    cur.input += input
    cur.output += output
    cur.byFeature[feature] = (cur.byFeature[feature] ?? 0) + 1
    cur.byProvider[provider] = (cur.byProvider[provider] ?? 0) + 1
    sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(key, JSON.stringify(cur), Math.floor(Date.now() / 1000))
  } catch {}
}

export function aiUsageThisMonth() {
  const month = new Date().toISOString().slice(0, 7)
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(`ai:usage:${month}`) as { value: string } | undefined
  return row ? JSON.parse(row.value) : { calls: 0, input: 0, output: 0, byFeature: {}, byProvider: {} }
}

// ── Schema validation (defensive, all providers) ────────────────────────────

export function validateAgainstSchema(schema: any, value: unknown, path = '$'): string | null {
  if (!schema || typeof schema !== 'object') return null
  if (Array.isArray(schema.anyOf)) {
    const errs = schema.anyOf.map((s: any) => validateAgainstSchema(s, value, path))
    return errs.some((e: string | null) => e === null) ? null : errs[0]
  }
  if (schema.enum && !schema.enum.includes(value)) return `${path}: not in enum`
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path}: expected object`
      for (const req of schema.required ?? []) {
        if (!(req in (value as any))) return `${path}.${req}: missing`
      }
      for (const [k, sub] of Object.entries(schema.properties ?? {})) {
        if (k in (value as any)) {
          const e = validateAgainstSchema(sub, (value as any)[k], `${path}.${k}`)
          if (e) return e
        }
      }
      return null
    }
    case 'array':
      if (!Array.isArray(value)) return `${path}: expected array`
      for (let i = 0; i < value.length; i++) {
        const e = validateAgainstSchema(schema.items, value[i], `${path}[${i}]`)
        if (e) return e
      }
      return null
    case 'string': return typeof value === 'string' ? null : `${path}: expected string`
    case 'integer': return Number.isInteger(value) ? null : `${path}: expected integer`
    case 'number': return typeof value === 'number' ? null : `${path}: expected number`
    case 'boolean': return typeof value === 'boolean' ? null : `${path}: expected boolean`
    case 'null': return value === null ? null : `${path}: expected null`
    default: return null
  }
}

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try { return JSON.parse(t) } catch {}
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1))
  throw new AiError('La IA no devolvió JSON válido', 'invalid_output')
}

// ── Anthropic (official SDK) ─────────────────────────────────────────────────

const clients = new Map<string, Anthropic>()
function anthropicClient(apiKey: string): Anthropic {
  let c = clients.get(apiKey)
  if (!c) {
    c = new Anthropic({ apiKey, maxRetries: 2, timeout: 10 * 60_000 })
    clients.set(apiKey, c)
  }
  return c
}

function anthropicMessages(messages: AiMessage[]): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((m) => {
    if (!m.images?.length) return { role: m.role, content: m.content }
    return {
      role: m.role,
      content: [
        ...m.images.map(img => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 },
        })),
        { type: 'text' as const, text: m.content },
      ],
    }
  })
}

// Fable/Opus-5-class models accept server-side refusal fallbacks
function supportsFallbacks(model: string) {
  return /^claude-(opus-5|fable-5|opus-5-5)/.test(model)
}

async function anthropicJson(p: ResolvedProvider, req: AiJsonRequest, onText?: (delta: string) => void): Promise<{ text: string; input: number; output: number }> {
  const client = anthropicClient(p.apiKey)
  const params: BetaMessageStreamParams = {
    model: p.model,
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    messages: anthropicMessages(req.messages),
    output_config: {
      effort: req.effort ?? 'high',
      format: { type: 'json_schema', schema: req.schema },
    },
    // A policy refusal is re-run on the fallback model inside the same call
    ...(supportsFallbacks(p.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  }
  try {
    const stream = client.beta.messages.stream(params)
    if (onText) stream.on('text', (delta: string) => onText(delta))
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') {
      throw new AiError('La IA ha rechazado esta petición por política de seguridad', 'refusal')
    }
    if (msg.stop_reason === 'max_tokens') {
      throw new AiError('La respuesta de la IA se cortó (límite de tokens)', 'truncated')
    }
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as any).text as string).join('')
    return { text, input: msg.usage.input_tokens ?? 0, output: msg.usage.output_tokens ?? 0 }
  } catch (err) {
    if (err instanceof AiError) throw err
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('Clave de API de Anthropic no válida', 'not_configured')
    if (err instanceof Anthropic.RateLimitError) throw new AiError('Límite de uso de la API de Anthropic alcanzado — inténtalo en un momento')
    if (err instanceof Anthropic.BadRequestError) throw new AiError(`Petición rechazada por la API: ${err.message}`)
    if (err instanceof Anthropic.APIError) throw new AiError(`Error de la API de Anthropic (${err.status}): ${err.message}`)
    throw new AiError(`No se pudo contactar con Anthropic: ${(err as Error)?.message}`)
  }
}

// ── OpenAI & OpenAI-compatible (HTTP) ────────────────────────────────────────

async function openaiCompatibleJson(p: ResolvedProvider, req: AiJsonRequest, onText?: (delta: string) => void): Promise<{ text: string; input: number; output: number }> {
  const base = p.name === 'openai' ? 'https://api.openai.com/v1' : p.baseUrl!
  const messages = [
    { role: 'system', content: `${req.system}\n\nResponde SOLO con un objeto JSON válido que cumpla este JSON Schema:\n${JSON.stringify(req.schema)}` },
    ...req.messages.map(m => m.images?.length
      ? { role: m.role, content: [...m.images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mediaType};base64,${i.base64}` } })), { type: 'text', text: m.content }] }
      : { role: m.role, content: m.content }),
  ]
  const body: any = {
    model: p.model,
    messages,
    temperature: 0.7,
    max_tokens: Math.min(req.maxTokens ?? 8000, 16000),
  }
  // Strict schema mode on OpenAI; plain JSON mode for local servers
  body.response_format = p.name === 'openai'
    ? { type: 'json_schema', json_schema: { name: req.feature.replace(/[^a-zA-Z0-9_-]/g, '_'), schema: req.schema, strict: true } }
    : { type: 'json_object' }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`
  const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(300_000) })
  const data = await res.json().catch(() => null) as any
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `HTTP ${res.status}`
    // Older OpenAI models don't know json_schema: retry in JSON mode
    if (p.name === 'openai' && /json_schema|response_format/i.test(msg)) {
      body.response_format = { type: 'json_object' }
      const r2 = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(300_000) })
      const d2 = await r2.json().catch(() => null) as any
      if (!r2.ok || d2?.error) throw new AiError(`Error de la IA: ${d2?.error?.message || r2.status}`)
      const text2 = d2.choices?.[0]?.message?.content ?? ''
      onText?.(text2)
      return { text: text2, input: d2.usage?.prompt_tokens ?? 0, output: d2.usage?.completion_tokens ?? 0 }
    }
    throw new AiError(`Error de la IA: ${msg}`)
  }
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') throw new AiError('La respuesta de la IA se cortó (límite de tokens)', 'truncated')
  if (choice?.message?.refusal) throw new AiError('La IA ha rechazado esta petición', 'refusal')
  const text = choice?.message?.content ?? ''
  onText?.(text)
  return { text, input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Structured generation: returns JSON validated against `schema`. One retry
 * with the validation error fed back when a non-Claude backend returns junk.
 */
export async function aiJson<T>(req: AiJsonRequest, opts: { onText?: (delta: string) => void } = {}): Promise<T> {
  const p = resolveProvider()
  if (!p) throw new AiError('No hay ningún proveedor de IA configurado (Ajustes → IA)', 'not_configured')
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = attempt === 0 ? req.messages : [
      ...req.messages,
      { role: 'user' as const, content: `Tu respuesta anterior no cumplía el esquema (${lastErr}). Devuelve de nuevo el JSON completo y válido.` },
    ]
    const r = p.name === 'anthropic'
      ? await anthropicJson(p, { ...req, messages }, opts.onText)
      : await openaiCompatibleJson(p, { ...req, messages }, opts.onText)
    recordUsage(p.name, req.feature, r.input, r.output)
    let parsed: unknown
    try {
      parsed = extractJson(r.text)
    } catch (e: any) {
      lastErr = e.message
      continue
    }
    const err = validateAgainstSchema(req.schema, parsed)
    if (!err) return parsed as T
    lastErr = err
  }
  throw new AiError(`La IA devolvió una respuesta con formato incorrecto (${lastErr})`, 'invalid_output')
}

/** Maps AI errors to HTTP errors for API routes. */
export function aiHttpError(err: unknown): never {
  if (err instanceof AiError) {
    const status = err.code === 'not_configured' ? 422 : err.code === 'refusal' ? 409 : 502
    throw createError({ statusCode: status, statusMessage: err.message })
  }
  throw err
}
