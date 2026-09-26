import { signClickToken, signOpenToken, signUnsubscribeToken } from '~/server/utils/auth'
import { compileTemplate, escapeHtml, type CompiledTemplate } from '~/server/utils/template'
import { htmlToText } from '~/server/utils/html-to-text'
import { finalizeEmailHtml } from '~/server/utils/email-compile'

// Turns a campaign template into the exact HTML/text that goes on the wire
// for one recipient. Shared by the send engine, test sends and previews so
// what you preview is what gets sent.

export interface UtmParams {
  source?: string
  medium?: string
  campaign?: string
}

const TRACKABLE_HREF = /<a\s+([^>]*?)href=(["'])((?:https?:\/\/|www\.)[^"'\s]+)\2([^>]*?)>/gi

/**
 * Wraps every http(s) link in a signed click-tracking redirect and appends the
 * open pixel. Links marked `data-notrack` are left alone.
 */
export function injectTracking(html: string, sendId: number, baseUrl: string, secret: string): string {
  const tracked = html.replace(TRACKABLE_HREF, (match, pre, _quote, url, post) => {
    if (/data-notrack/i.test(pre) || /data-notrack/i.test(post)) return match
    // Editors emit HTML-entity-encoded hrefs (&amp;); decode so the signed
    // URL matches the real destination and the redirect isn't malformed
    const decodedUrl = url.replace(/&amp;/g, '&')
    const fullUrl = /^https?:\/\//i.test(decodedUrl) ? decodedUrl : `https://${decodedUrl}`
    const sig = signClickToken(sendId, fullUrl, secret)
    const trackUrl = `${baseUrl}/api/track/click?s=${sendId}&amp;u=${encodeURIComponent(fullUrl)}&amp;sig=${sig}`
    return `<a ${pre}href="${trackUrl}"${post}>`
  })

  const openSig = signOpenToken(sendId, secret)
  const pixel = `<img src="${baseUrl}/api/track/open?s=${sendId}&amp;sig=${openSig}" width="1" height="1" border="0" style="display:block;width:1px;height:1px;border:0;" alt="" />`
  return /<\/body>/i.test(tracked)
    ? tracked.replace(/<\/body>/i, `${pixel}</body>`)
    : tracked + pixel
}

/** Adds utm_* to http(s) links that don't carry UTM parameters already. */
export function applyUtm(html: string, utm: UtmParams | null | undefined, baseUrl: string): string {
  if (!utm || !(utm.source || utm.medium || utm.campaign)) return html
  let own = ''
  try { own = new URL(baseUrl).host } catch {}
  return html.replace(/(<a\s[^>]*?href=)(["'])(https?:\/\/[^"'\s]+)\2/gi, (match, pre, q, rawUrl) => {
    const decoded = rawUrl.replace(/&amp;/g, '&')
    let u: URL
    try { u = new URL(decoded) } catch { return match }
    if (own && u.host === own) return match // our own unsubscribe/preference pages
    if ([...u.searchParams.keys()].some(k => k.toLowerCase().startsWith('utm_'))) return match
    if (utm.source) u.searchParams.set('utm_source', utm.source)
    if (utm.medium) u.searchParams.set('utm_medium', utm.medium)
    if (utm.campaign) u.searchParams.set('utm_campaign', utm.campaign)
    return `${pre}${q}${u.toString().replace(/&/g, '&amp;')}${q}`
  })
}

/**
 * Relative URLs (`/uploads/x.png`) and URLs pointing at localhost resolve to
 * nothing in a recipient's inbox. Rewrite them onto the public base URL.
 */
export function absolutizeUrls(html: string, baseUrl: string): string {
  if (!baseUrl) return html
  const base = baseUrl.replace(/\/$/, '')
  const isLocalBase = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(base)
  let out = html.replace(/(\s(?:src|href|background)=)(["'])(\/(?!\/)[^"']*)\2/gi, (_m, attr, q, path) => `${attr}${q}${base}${path}${q}`)
  if (!isLocalBase) {
    out = out.replace(/(\s(?:src|href|background)=)(["'])https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(\/[^"']*)\2/gi,
      (_m, attr, q, path) => `${attr}${q}${base}${path}${q}`)
  }
  return out
}

// Invisible filler after the preheader so the client doesn't pull body text
// into the inbox preview line.
const PREHEADER_FILLER = '&#847;&zwnj;&nbsp;'.repeat(60)

export function injectPreheader(html: string, preheaderHtml: string): string {
  if (!preheaderHtml.trim()) return html
  const block = `<div style="display:none;font-size:1px;color:transparent;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheaderHtml}${PREHEADER_FILLER}</div>`
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, `<body$1>${block}`)
  return block + html
}

export interface CompiledCampaign {
  html: CompiledTemplate
  subjectA: CompiledTemplate
  subjectB: CompiledTemplate | null
  winnerSubject: CompiledTemplate
  preheader: CompiledTemplate | null
}

export function compileCampaign(c: { templateHtml: string | null; subject: string; subjectB?: string | null; abWinner?: string | null; preheader?: string | null }): CompiledCampaign {
  const html = compileTemplate(c.templateHtml || '')
  const subjectA = compileTemplate(c.subject || '')
  const subjectB = c.subjectB?.trim() ? compileTemplate(c.subjectB) : null
  return {
    html,
    subjectA,
    subjectB,
    winnerSubject: c.abWinner === 'B' && subjectB ? subjectB : subjectA,
    // Plain text field: escape it before variables are substituted
    preheader: c.preheader?.trim() ? compileTemplate(escapeHtml(c.preheader.trim())) : null,
  }
}

export interface RenderInput {
  compiled: CompiledCampaign
  variant: 'A' | 'B' | null
  vars: Record<string, any>
  sendId: number
  baseUrl: string
  secret: string
  utm?: UtmParams | null
  companyAddress?: string
  /** false for test sends and previews: no pixel, no click wrapping */
  track: boolean
  /** Append the unsubscribe line to the plain-text part (off for transactional) */
  unsubscribeFooter?: boolean
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
  unsubscribeUrl: string
  oneClickUrl: string
}

export function unsubscribeUrls(sendId: number, baseUrl: string, secret: string) {
  const t = signUnsubscribeToken(sendId, secret)
  return {
    page: `${baseUrl}/unsubscribe?s=${sendId}&t=${t}`,
    preferences: `${baseUrl}/preferences?s=${sendId}&t=${t}`,
    oneClick: `${baseUrl}/api/unsubscribe/one-click?s=${sendId}&t=${t}`,
  }
}

function subjectFor(compiled: CompiledCampaign, variant: 'A' | 'B' | null) {
  if (variant === 'B' && compiled.subjectB) return compiled.subjectB
  if (variant === 'A') return compiled.subjectA
  return compiled.winnerSubject
}

/** Subject lines are plain text: decode the entities the escaper introduced. */
export function decodeSubject(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[\r\n]+/g, ' ').trim()
}

export function renderEmail(input: RenderInput): RenderedEmail {
  const { compiled, vars, sendId, baseUrl, secret } = input
  const urls = input.track
    ? unsubscribeUrls(sendId, baseUrl, secret)
    : { page: baseUrl, preferences: baseUrl, oneClick: baseUrl }

  const address = escapeHtml(input.companyAddress || '')
  // Placeholders stay in place until after click-wrapping, so the
  // unsubscribe/preference links are never turned into tracked redirects
  let body = compiled.html.applyTo(vars)
    .replace(/\{\{\s*COMPANY_ADDRESS\s*\}\}/gi, address)

  body = absolutizeUrls(body, baseUrl)
  body = applyUtm(body, input.utm, baseUrl)
  if (compiled.preheader) body = injectPreheader(body, compiled.preheader.applyTo(vars))
  body = finalizeEmailHtml(body)

  const fillLinks = (h: string) => h
    .replace(/\{\{\s*UNSUBSCRIBE_URL\s*\}\}/gi, urls.page)
    .replace(/\{\{\s*PREFERENCES_URL\s*\}\}/gi, urls.preferences)

  // Plain-text alternative from the untracked HTML (no pixel/click-wrapped
  // URLs), with the real unsubscribe link appended.
  const text = htmlToText(fillLinks(body)) + (input.track && input.unsubscribeFooter !== false ? `\n\n--\nDarse de baja / Unsubscribe: ${urls.page}` : '')
  const html = fillLinks(input.track ? injectTracking(body, sendId, baseUrl, secret) : body)

  return {
    subject: decodeSubject(subjectFor(compiled, input.variant).applyTo(vars)),
    html,
    text,
    unsubscribeUrl: urls.page,
    oneClickUrl: urls.oneClick,
  }
}
