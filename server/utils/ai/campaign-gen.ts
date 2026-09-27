import { sqlite } from '~/server/db/index'
import { safeFetch } from '~/server/utils/safe-fetch'
import { htmlToText } from '~/server/utils/html-to-text'
import { getBrandKit, brandBrief } from '~/server/utils/ai/brand-kit'
import { aiJson } from '~/server/utils/ai/provider'
import { AI_GRID_LAYOUT_RULE, splitWideAiGrid } from '~/utils/aiGridLayout'

// "Two-click campaign": brief (+ optional landing URL) → complete campaign:
// subject A/B, preheader, block layout with copy, CTA links, image plan,
// follow-up and a send-time suggestion. The browser assembles the HTML with
// the editor's own block library, so the result stays fully editable.

export const BLOCK_CATALOG: Record<string, string> = {
  'header-pro': 'Cabecera con logo, etiqueta (badge), título grande y subtítulo. Casi siempre el primer bloque.',
  hero: 'Portada con badge, título, subtítulo y un botón principal.',
  text: 'Párrafo de texto largo (title = cuerpo, admite <b>, <i>, <br>).',
  button: 'Botón de llamada a la acción suelto.',
  image: 'Imagen a ancho completo.',
  card: 'Tarjeta: imagen + badge + título + texto.',
  'grid-2': '2 columnas (imagen, título, texto) — beneficios, productos.',
  note: 'Nota destacada: badge + título + texto (aviso, garantía, P.D.).',
  testimonials: 'Testimonio: cita (subtitle), autor (title), badge.',
  pricing: '3 planes: badge, nombre (title), precio/descr. (subtitle), botón.',
  faq: 'Preguntas frecuentes: badge + 3 pares pregunta (title) / respuesta (subtitle).',
  metrics: '3 cifras destacadas: número (title) + etiqueta (subtitle).',
  product: 'Producto: imagen, badge, nombre (title), descripción (subtitle), precio, botón.',
  coupon: 'Cupón: badge, título, texto y código.',
  divider: 'Separador visual.',
  spacer: 'Espacio en blanco.',
  signature: 'Firma: foto, nombre (title), cargo/empresa (subtitle), 2-3 datos de contacto, P.D.',
  unsubscribe: 'Pie con enlace de baja (subtitle = texto legal). Obligatorio, siempre el último.',
}

export const STYLE_IDS = ['default', 'viseni', 'corporate', 'tech-noir', 'dark-gold', 'midnight-gold']

const strings = { type: 'array', items: { type: 'string' } }

export const CAMPAIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'subject', 'subjectB', 'preheader', 'styleId', 'blocks', 'followUpSubject', 'sendTime', 'rationale'],
  properties: {
    name: { type: 'string' },
    subject: { type: 'string' },
    subjectB: { type: 'string' },
    preheader: { type: 'string' },
    styleId: { type: 'string', enum: STYLE_IDS },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'badge', 'title', 'subtitle', 'button', 'buttonUrl', 'images', 'price', 'code', 'contact', 'ps'],
        properties: {
          id: { type: 'string', enum: Object.keys(BLOCK_CATALOG) },
          badge: strings,
          title: strings,
          subtitle: strings,
          button: strings,
          buttonUrl: strings,
          images: strings,
          price: strings,
          code: strings,
          contact: strings,
          ps: strings,
        },
      },
    },
    followUpSubject: { type: 'string' },
    sendTime: {
      type: 'object',
      additionalProperties: false,
      required: ['weekday', 'hour', 'reason'],
      properties: {
        weekday: { type: 'string', enum: ['any', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
        hour: { type: 'integer' },
        reason: { type: 'string' },
      },
    },
    rationale: { type: 'string' },
  },
}

export interface GeneratedBlock {
  id: string
  badge: string[]
  title: string[]
  subtitle: string[]
  button: string[]
  buttonUrl: string[]
  images: string[]
  price: string[]
  code: string[]
  contact: string[]
  ps: string[]
}

export interface GeneratedCampaign {
  name: string
  subject: string
  subjectB: string
  preheader: string
  styleId: string
  blocks: GeneratedBlock[]
  followUpSubject: string
  sendTime: { weekday: string; hour: number; reason: string }
  rationale: string
}

export interface CampaignBrief {
  brief: string
  goal: 'sell' | 'inform' | 'nurture' | 'reactivate' | 'event' | 'announce'
  url?: string
  listId?: number | null
  language: string
  tone?: string
  useBrandKit?: boolean
  aiImages?: boolean
}

const GOALS: Record<string, string> = {
  sell: 'vender: conseguir compras o reservas',
  inform: 'informar: newsletter con valor, sin venta agresiva',
  nurture: 'nutrir: educar y generar confianza',
  reactivate: 'reactivar a contactos que llevan tiempo sin interactuar',
  event: 'conseguir inscripciones a un evento/webinar',
  announce: 'anunciar una novedad, lanzamiento o cambio',
}

export function pastPerformance(): string {
  // Best and worst subjects by human clicks — the model learns YOUR audience
  const rows = sqlite.prepare(
    `SELECT subject, sent_count AS sent, click_count AS clicks, confirmed_open_count AS opens
     FROM campaigns WHERE status = 'sent' AND kind = 'regular' AND COALESCE(sent_count, 0) >= 50
     ORDER BY finished_at DESC LIMIT 40`,
  ).all() as { subject: string; sent: number; clicks: number; opens: number }[]
  if (rows.length < 3) return ''
  const scored = rows.map(r => ({ ...r, ctr: r.clicks / r.sent, or: r.opens / r.sent })).sort((a, b) => b.ctr - a.ctr)
  const fmt = (r: typeof scored[number]) => `«${r.subject}» — ${(r.ctr * 100).toFixed(1)}% clics, ${(r.or * 100).toFixed(0)}% aperturas`
  return `HISTÓRICO DE ESTA AUDIENCIA (aprende de lo que funciona):\nMejores:\n${scored.slice(0, 4).map(fmt).join('\n')}\nPeores:\n${scored.slice(-3).map(fmt).join('\n')}`
}

export function audienceContext(listId?: number | null): string {
  if (!listId) return ''
  const list = sqlite.prepare('SELECT name, description FROM lists WHERE id = ?').get(listId) as { name: string; description: string | null } | undefined
  if (!list) return ''
  const size = (sqlite.prepare(`SELECT COUNT(*) AS n FROM list_contacts lc JOIN contacts c ON c.id = lc.contact_id WHERE lc.list_id = ? AND c.status = 'active'`).get(listId) as { n: number }).n
  const tags = sqlite.prepare(
    `SELECT j.value AS tag, COUNT(*) AS n FROM list_contacts lc JOIN contacts c ON c.id = lc.contact_id, json_each(c.tags) j
     WHERE lc.list_id = ? GROUP BY j.value ORDER BY n DESC LIMIT 8`,
  ).all(listId) as { tag: string; n: number }[]
  const withCompany = (sqlite.prepare(`SELECT COUNT(*) AS n FROM list_contacts lc JOIN contacts c ON c.id = lc.contact_id WHERE lc.list_id = ? AND COALESCE(c.company, '') != ''`).get(listId) as { n: number }).n
  return [
    `LISTA: «${list.name}»${list.description ? ` (${list.description})` : ''} — ${size} contactos activos.`,
    tags.length ? `Etiquetas más comunes: ${tags.map(t => `${t.tag} (${t.n})`).join(', ')}.` : '',
    withCompany > size * 0.5 ? 'La mayoría tiene empresa: es una audiencia B2B.' : '',
  ].filter(Boolean).join('\n')
}

export async function gatherPageContext(url: string): Promise<{ text: string; images: string[]; title: string }> {
  const page = await safeFetch(url, { maxBytes: 3 * 1024 * 1024 })
  const html = page.body.toString('utf-8')
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)?.[0]?.match(/content=["']([^"']+)["']/i)?.[1]
  const abs = (u?: string | null) => { try { return u ? new URL(u, page.url).href : '' } catch { return '' } }
  const images = [...new Set([abs(og), ...[...html.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/gi)].map(m => abs(m[1]))])]
    .filter(u => /^https?:\/\//.test(u) && !/\.svg(\?|$)|logo|icon|sprite|pixel|avatar|data:/i.test(u)).slice(0, 10)
  return { text: htmlToText(html).replace(/\s+/g, ' ').slice(0, 9000), images, title }
}

export async function generateCampaign(input: CampaignBrief, onProgress?: (chars: number) => void): Promise<{ campaign: GeneratedCampaign; assets: string[]; links: string[] }> {
  const kit = input.useBrandKit === false ? null : getBrandKit()
  let page: Awaited<ReturnType<typeof gatherPageContext>> | null = null
  if (input.url) {
    try { page = await gatherPageContext(input.url) } catch (err: any) {
      throw createError({ statusCode: 422, statusMessage: `No se pudo leer la URL: ${String(err?.message || err).slice(0, 150)}` })
    }
  }
  const assets = page?.images ?? []
  const links = [input.url, kit?.website].filter((u): u is string => !!u && /^https?:\/\//.test(u))
  const lang = input.language || kit?.language || 'es'

  const system = [
    'Eres director creativo y copywriter senior de email marketing. Diseñas campañas que llegan a la bandeja de entrada y convierten: asunto irresistible pero honesto, un único objetivo claro, jerarquía visual limpia, copy concreto (beneficios, pruebas, urgencia real solo si existe) y una llamada a la acción inequívoca.',
    'Reglas de entregabilidad: nada de MAYÚSCULAS gritadas, ni "!!!", ni promesas exageradas, ni frases típicas de spam ("gana dinero", "100% gratis", "haz clic aquí"). Asunto ≤ 60 caracteres, preheader 40-90 que complemente (no repita) el asunto. Personaliza con {{name | "fallback"}} solo donde suene natural.',
    `Escribe TODO el contenido en el idioma: ${lang}.`,
    'Estructura: 4-8 bloques. Empieza por header-pro o hero, termina SIEMPRE con unsubscribe (subtitle: texto legal breve que incluya {{COMPANY_ADDRESS}}). Usa firma (signature) solo en emails personales/B2B.',
    'Campos por bloque: rellena solo los que el bloque usa (arrays vacíos para el resto); los arrays llevan un elemento por cada hueco del bloque (grid-2 → 2 títulos). En "text" el title es el cuerpo y admite <b>, <i> y <br>.',
    AI_GRID_LAYOUT_RULE,
    `buttonUrl: usa SOLO estas URLs: ${links.length ? links.join(', ') : '(ninguna disponible: usa "{{URL}}")'}.`,
    assets.length
      ? `images: puedes usar imágenes reales de la página con "asset:N" (N = índice de esta lista): ${assets.map((a, i) => `${i}=${a}`).join(' ')}`
      : 'No hay imágenes reales disponibles.',
    input.aiImages
      ? 'Si no hay imagen adecuada, escribe en images un prompt EN INGLÉS para generarla (fotografía profesional, iluminación cinematográfica, sin texto en la imagen).'
      : 'NO inventes imágenes: si no hay assets, evita bloques cuya gracia sea la imagen (image, card, grid con fotos) o deja images vacío.',
    'styleId: elige el estilo visual más acorde a la marca y el sector.',
    'sendTime: mejor día/hora (hora local del remitente, 0-23) para esta audiencia y objetivo, con una razón breve.',
    'rationale: 2-3 frases explicando la estrategia (para el usuario).',
    'followUpSubject: asunto alternativo para un reenvío a quien no abra.',
  ].join('\n')

  const user = [
    `OBJETIVO: ${GOALS[input.goal] ?? input.goal}`,
    `BRIEF DEL USUARIO:\n${input.brief}`,
    input.tone ? `TONO PEDIDO: ${input.tone}` : '',
    kit ? brandBrief(kit) : '',
    audienceContext(input.listId),
    pastPerformance(),
    page ? `PÁGINA DE REFERENCIA (${input.url}) — «${page.title}»:\n${page.text}` : '',
  ].filter(Boolean).join('\n\n')

  let chars = 0
  const campaign = await aiJson<GeneratedCampaign>({
    feature: 'campaign_generate',
    system,
    messages: [{ role: 'user', content: user }],
    schema: CAMPAIGN_SCHEMA,
    effort: 'high',
    maxTokens: 24000,
  }, { onText: (d) => { chars += d.length; onProgress?.(chars) } })

  // Post-validation: links must be real, the unsubscribe block must close the email
  const fallbackUrl = links[0] ?? '{{URL}}'
  for (const b of campaign.blocks) {
    b.buttonUrl = b.buttonUrl.map(u => (links.includes(u) || u === '{{URL}}' ? u : fallbackUrl))
    b.images = b.images.map(img => {
      const m = img.match(/^asset:(\d+)$/)
      if (m) return assets[Number(m[1])] ? img : ''
      return input.aiImages ? img : ''
    })
  }
  campaign.blocks = campaign.blocks.filter(b => b.id !== 'unsubscribe').flatMap(b => {
    const paired = splitWideAiGrid(b.id, b)
    return paired ? paired.map(({ id, fields }) => ({
      id, ...fields, badge: [], button: [], buttonUrl: [], price: [], code: [], contact: [], ps: [],
    })) : [b]
  })
  campaign.blocks.push({
    id: 'unsubscribe', badge: [], title: [], button: [], buttonUrl: [], images: [], price: [], code: [], contact: [], ps: [],
    subtitle: [lang.startsWith('en')
      ? 'You receive this email because you subscribed. {{COMPANY_ADDRESS}}'
      : 'Recibes este email porque te suscribiste. {{COMPANY_ADDRESS}}'],
  })
  campaign.sendTime.hour = Math.min(23, Math.max(0, Math.round(campaign.sendTime.hour)))
  campaign.subject = campaign.subject.slice(0, 150)
  campaign.subjectB = campaign.subjectB.slice(0, 150)
  campaign.preheader = campaign.preheader.slice(0, 200)
  return { campaign, assets, links }
}
