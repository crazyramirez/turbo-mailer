import { assembleEmail, imageRefToUrl, type PlannedBlock, type BrandLite } from '~/utils/emailAssembler'

// Two-click campaign generation shared by the campaign wizard and the
// automation builder: stream the plan from /api/ai/campaign (SSE), then
// assemble it into editor-compatible HTML with every image self-hosted.

export interface AiCampaignBody {
  brief: string
  goal?: string
  url?: string
  listId?: number | null
  language?: string
  tone?: string
  useBrandKit?: boolean
  aiImages?: boolean
}

async function csrfToken(): Promise<string> {
  const state = useState<string>('csrfToken', () => '')
  if (!state.value) {
    try {
      state.value = (await $fetch<{ token: string }>('/api/auth/csrf')).token
    } catch {}
  }
  return state.value
}

/** Streams the generation; resolves with { campaign, assets } or throws a readable error. */
export async function streamAiCampaign(body: AiCampaignBody, onProgress?: (chars: number) => void): Promise<any> {
  const res = await fetch('/api/ai/campaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrfToken() },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null)
    throw new Error(j?.statusMessage || j?.message || `HTTP ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let final: any = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const data = chunk.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('')
      if (!data) continue
      const msg = JSON.parse(data)
      if (msg.type === 'progress') onProgress?.(msg.chars)
      else if (msg.type === 'error') throw new Error(msg.message)
      else if (msg.type === 'result') final = msg.data
    }
  }
  if (!final) throw new Error(useNuxtApp().$i18n.t('aiwiz.no_result'))
  return final
}

async function downloadImage(url: string): Promise<string | null> {
  try {
    const r = await $fetch<{ url: string }>('/api/ai/download-image', { method: 'POST', body: { url } })
    return r.url
  } catch {
    return null
  }
}

/**
 * Server-side finishing pass for freshly assembled HTML (see email-repair.ts):
 * WebP → JPEG/PNG, images cropped to their boxes and sized for Outlook,
 * clean alt text. Best effort: the unrepaired HTML is still a valid email.
 */
export async function repairAssembledHtml(html: string, signal?: AbortSignal): Promise<string> {
  try {
    const r = await $fetch<{ html: string }>('/api/email/repair', { method: 'POST', body: { html }, signal })
    return typeof r?.html === 'string' && r.html.trim() ? r.html : html
  } catch {
    return html
  }
}

/** Generated plan → final HTML (images downloaded into /uploads, then repaired). */
export async function assembleAiResult(
  result: any,
  opts: { brand?: BrandLite | null; language?: string; aiImages?: boolean; onImage?: (n: number) => void },
): Promise<string> {
  const c = result.campaign
  const assets: string[] = result.assets ?? []
  const blocks: PlannedBlock[] = c.blocks.map((b: any) => ({
    id: b.id,
    fields: {
      badge: b.badge, title: b.title, subtitle: b.subtitle, button: b.button, buttonUrl: b.buttonUrl,
      images: b.images, price: b.price, code: b.code, contact: b.contact, ps: b.ps,
    },
  }))
  let n = 0
  const html = await assembleEmail({
    blocks,
    styleId: c.styleId,
    brand: opts.brand ?? null,
    language: opts.language,
    onProgress: () => opts.onImage?.(++n),
    resolveImage: async (ref) => {
      const url = imageRefToUrl(ref, assets, !!opts.aiImages)
      if (!url) return null
      // Host every image ourselves: hotlinked images break, get blocked or change
      if (url.startsWith('/uploads/')) return url
      return downloadImage(url)
    },
  })
  return repairAssembledHtml(html)
}
