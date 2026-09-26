import nodemailer from 'nodemailer'
import type { Transporter, SendMailOptions } from 'nodemailer'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { configNumber } from '~/server/utils/serverConfig'

// Single place where SMTP transports are created.
//
// - Pooled connections (one TLS handshake per connection, not per email).
// - DKIM applied to EVERY message the app sends — campaigns, tests and the
//   system emails (double opt-in, unsubscribe/resubscribe confirmations) that
//   used to go out unsigned and failed DMARC alignment.
// - Several SMTP profiles (providers) with ordered failover.

export interface SmtpProfile {
  id: string
  name: string
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromEmail?: string
  fromName?: string
  replyTo?: string
  dkimDomain?: string
  dkimSelector?: string
  dkimPrivateKey?: string
  /** Extra pace limit for this provider (0 = none) */
  maxPerSecond?: number
  /** Provider-side daily quota (0 = none) */
  dailyLimit?: number
  /** Used automatically when the campaign's profile is unreachable */
  backup?: boolean
  enabled?: boolean
  priority?: number
}

/** The legacy top-level SMTP settings, exposed as the 'default' profile. */
export function defaultProfileFromConfig(config: Record<string, any>): SmtpProfile | null {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) return null
  return {
    id: 'default',
    name: 'Principal',
    host: String(config.smtpHost),
    port: Number(config.smtpPort || 465),
    secure: config.smtpSecure === undefined ? true : String(config.smtpSecure) !== 'false' && config.smtpSecure !== false,
    user: String(config.smtpUser),
    pass: String(config.smtpPass),
    fromEmail: String(config.smtpFromEmail || config.smtpUser),
    fromName: String(config.smtpFromName || 'TurboMailer'),
    replyTo: config.smtpReplyTo ? String(config.smtpReplyTo) : undefined,
    dkimDomain: config.dkimDomain ? String(config.dkimDomain) : undefined,
    dkimSelector: config.dkimSelector ? String(config.dkimSelector) : undefined,
    dkimPrivateKey: config.dkimPrivateKey ? String(config.dkimPrivateKey) : undefined,
    maxPerSecond: 0,
    dailyLimit: configNumber(config, 'smtpDailyLimit', 0),
    backup: false,
    enabled: true,
    priority: 0,
  }
}

export function getSmtpProfiles(config: Record<string, any>): SmtpProfile[] {
  const out: SmtpProfile[] = []
  const def = defaultProfileFromConfig(config)
  if (def) out.push(def)
  const extra = Array.isArray(config.smtpProfiles) ? config.smtpProfiles : []
  for (const p of extra) {
    if (!p || typeof p !== 'object' || !p.id || !p.host || !p.user) continue
    if (p.enabled === false) continue
    out.push({
      ...p,
      id: String(p.id),
      name: String(p.name || p.host),
      port: Number(p.port || 465),
      secure: p.secure !== false,
      priority: Number(p.priority ?? 10),
    })
  }
  return out.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
}

/**
 * Profiles to try for a campaign, in order: the chosen one (or default),
 * then every profile flagged as backup.
 */
export function profilesForSend(config: Record<string, any>, preferredId?: string | null): SmtpProfile[] {
  const all = getSmtpProfiles(config)
  if (!all.length) return []
  const primary = (preferredId && all.find(p => p.id === preferredId)) || all[0]
  const backups = all.filter(p => p.id !== primary.id && p.backup)
  return [primary, ...backups]
}

// ── Transport cache ──────────────────────────────────────────────────────

const transports = new Map<string, { key: string; transport: Transporter; lastUsed: number }>()

function settingsKey(p: SmtpProfile, maxConnections: number): string {
  return createHash('sha256')
    .update(JSON.stringify([p.host, p.port, p.secure, p.user, p.pass, p.dkimDomain, p.dkimSelector, p.dkimPrivateKey, maxConnections]))
    .digest('hex')
}

function dkimFor(p: SmtpProfile) {
  if (!p.dkimDomain || !p.dkimSelector || !p.dkimPrivateKey) return undefined
  return {
    domainName: p.dkimDomain,
    keySelector: p.dkimSelector,
    privateKey: p.dkimPrivateKey.replace(/\\n/g, '\n'),
  }
}

export function getTransport(profile: SmtpProfile, config: Record<string, any>): Transporter {
  const maxConnections = Math.min(10, Math.max(1, configNumber(config, 'smtpMaxConnections', 2)))
  const key = settingsKey(profile, maxConnections)
  const cached = transports.get(profile.id)
  if (cached && cached.key === key) {
    cached.lastUsed = Date.now()
    return cached.transport
  }
  // Settings changed (or first use): retire the old pool
  if (cached) {
    try { cached.transport.close() } catch {}
  }
  const transport = nodemailer.createTransport({
    pool: true,
    maxConnections,
    maxMessages: 100,
    host: profile.host,
    port: profile.port,
    secure: profile.secure,
    auth: { user: profile.user, pass: profile.pass },
    dkim: dkimFor(profile),
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  } as any)
  transports.set(profile.id, { key, transport, lastUsed: Date.now() })
  return transport
}

/** Closes pools idle for more than `idleMs` (called by the scheduler). */
export function closeIdleTransports(idleMs = 10 * 60_000): void {
  const now = Date.now()
  for (const [id, t] of transports) {
    if (now - t.lastUsed > idleMs) {
      try { t.transport.close() } catch {}
      transports.delete(id)
    }
  }
}

export function closeAllTransports(): void {
  for (const t of transports.values()) {
    try { t.transport.close() } catch {}
  }
  transports.clear()
}

// ── Identity & headers ───────────────────────────────────────────────────

export function domainOf(email: string): string {
  return String(email).split('@').pop()?.toLowerCase().trim() || 'localhost'
}

export function senderIdentity(profile: SmtpProfile, config: Record<string, any>) {
  const email = profile.fromEmail || String(config.smtpFromEmail || profile.user)
  const name = profile.fromName || String(config.smtpFromName || 'TurboMailer')
  const replyTo = profile.replyTo || (config.smtpReplyTo ? String(config.smtpReplyTo) : undefined)
  return { email, name, replyTo, domain: domainOf(email) }
}

/** RFC 5322 display-name quoting — a name with quotes can't break the header. */
export function formatAddress(name: string, email: string): string {
  const clean = String(name ?? '').replace(/[\r\n]+/g, ' ').replace(/(["\\])/g, '\\$1').trim()
  return clean ? `"${clean}" <${email}>` : email
}

export function newMessageId(fromDomain: string): string {
  return `<${randomUUID()}@${fromDomain}>`
}

function shortSig(secret: string, purpose: string, value: string | number): string {
  return createHmac('sha256', `${secret}:${purpose}`).update(String(value)).digest('hex').slice(0, 10)
}

/** Signed per-send tag carried in X-TM-ID; bounce/complaint reports echo it back. */
export function signSendTag(sendId: number, secret: string): string {
  return `${sendId}.${shortSig(secret, 'tmid', sendId)}`
}

export function verifySendTag(tag: string, secret: string): number | null {
  const m = String(tag).trim().match(/^(\d+)\.([a-f0-9]{10})$/i)
  if (!m) return null
  const id = Number(m[1])
  return shortSig(secret, 'tmid', id) === m[2].toLowerCase() ? id : null
}

/**
 * VERP return path: bounces+b123.sig@domain. Requires a bounce mailbox that
 * accepts plus-addressing (config.bounceAddress). Providers that rewrite the
 * envelope sender (Gmail, M365) simply ignore it — X-TM-ID and Message-ID
 * still attribute the bounce.
 */
export function verpAddress(bounceAddress: string | undefined, kind: 'b' | 'u', sendId: number, secret: string): string | null {
  const addr = String(bounceAddress || '').trim()
  const m = addr.match(/^([^@+\s]+)@([^@\s]+)$/)
  if (!m) return null
  return `${m[1]}+${kind}${sendId}.${shortSig(secret, `verp-${kind}`, sendId)}@${m[2]}`
}

export function parseVerpAddress(address: string, secret: string): { kind: 'b' | 'u'; sendId: number } | null {
  const m = String(address).toLowerCase().match(/\+([bu])(\d+)\.([a-f0-9]{10})@/)
  if (!m) return null
  const kind = m[1] as 'b' | 'u'
  const sendId = Number(m[2])
  return shortSig(secret, `verp-${kind}`, sendId) === m[3] ? { kind, sendId } : null
}

// ── System emails ────────────────────────────────────────────────────────

/**
 * Sends an app-generated email (double opt-in, (re)subscription notices...)
 * through the default profile with DKIM and a proper Message-ID. Falls over
 * to backup profiles on connection/auth failures.
 */
export async function sendSystemEmail(
  config: Record<string, any>,
  mail: { to: string; subject: string; html: string; text?: string; headers?: Record<string, string> },
): Promise<void> {
  const profiles = profilesForSend(config)
  if (!profiles.length) throw new Error('SMTP not configured')
  let lastErr: unknown = null
  for (const profile of profiles) {
    const id = senderIdentity(profile, config)
    const options: SendMailOptions = {
      from: formatAddress(id.name, id.email),
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: id.replyTo,
      messageId: newMessageId(id.domain),
      headers: { 'Auto-Submitted': 'auto-generated', ...(mail.headers ?? {}) },
    }
    try {
      await getTransport(profile, config).sendMail(options)
      return
    } catch (err: any) {
      lastErr = err
      // Recipient-level errors won't improve on another provider
      if (err?.responseCode && err.responseCode >= 400 && err.responseCode !== 421) throw err
    }
  }
  throw lastErr
}
