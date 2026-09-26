import { sqlite } from '~/server/db/index'
import { isPaused, clearSignal, pauseCampaign } from '~/server/utils/campaign-state'
import { compileCampaign, renderEmail, type CompiledCampaign } from '~/server/utils/email-render'
import {
  profilesForSend, getTransport, senderIdentity, formatAddress, newMessageId,
  signSendTag, verpAddress, type SmtpProfile,
} from '~/server/utils/mailer'
import { acquireSendSlot, dailyCapBlock, recordSentToday, penalizeGlobal, penalizeProvider, sleep } from '~/server/utils/send-limiter'
import { classifySmtpError, describeFailure } from '~/server/utils/smtp-classify'
import { getSuppression, suppress } from '~/server/utils/suppression'
import { blockedByFrequency } from '~/server/utils/recipients'
import { configNumber } from '~/server/utils/serverConfig'
import { emitWebhook } from '~/server/utils/webhook'
import { sendAlert } from '~/server/utils/alerts'
import { getImapConfig, processBounces } from '~/server/utils/bounce-processor'

// The campaign send engine.
//
// Guarantees:
//  - At most one run per campaign (pause→resume can no longer start a second
//    loop over the same pending rows → no duplicate emails).
//  - Every send is CLAIMED atomically (pending → sending) before SMTP; a crash
//    mid-transaction never re-sends it (see crash recovery in db/index.ts).
//  - Eligibility is re-checked right before each email: a contact who
//    unsubscribed, bounced, got suppressed or was deleted after the campaign
//    started does not get it.
//  - Failures are classified (smtp-classify.ts): only real "address doesn't
//    exist" answers bounce a contact; outages fail over to backup SMTP
//    profiles and then pause instead of burning the list.
//  - Circuit breaker: abnormal hard-bounce or block rates pause the campaign
//    before the sender's reputation is destroyed.

type Campaign = {
  id: number
  name: string
  kind: string
  status: string
  subject: string
  subjectB: string | null
  abWinner: string | null
  abPhase: string | null
  abWaitMinutes: number | null
  templateHtml: string | null
  preheader: string | null
  listId: number | null
  topicId: number | null
  senderProfileId: string | null
  utmParams: string | null
}

type Contact = {
  id: number
  email: string
  status: string
  name: string | null
  company: string | null
  role: string | null
  phone: string | null
  linkedin: string | null
  url: string | null
  youtube: string | null
  instagram: string | null
  tags: string | null
  custom: string | null
  preferences: string | null
  topic_opt_outs: string | null
  last_sent_at: number | null
  locale: string | null
}

interface Job { id: number; contactId: number | null; email: string; variant: 'A' | 'B' | null; attempts: number }

interface RunState {
  promise: Promise<void>
  restartRequested: boolean
  throttle: { reason: string; until: number } | null
  profileId: string | null
}

const runs = new Map<number, RunState>()

export function isCampaignRunning(id: number): boolean {
  return runs.has(id)
}

export function getRunInfo(id: number): { running: boolean; throttle: { reason: string; until: number } | null; profileId: string | null } {
  const r = runs.get(id)
  return r ? { running: true, throttle: r.throttle, profileId: r.profileId } : { running: false, throttle: null, profileId: null }
}

/** For tests and graceful shutdown. */
export async function waitForCampaign(id: number): Promise<void> {
  while (runs.has(id)) await runs.get(id)!.promise
}

export function activeRunIds(): number[] {
  return [...runs.keys()]
}

const nowSec = () => Math.floor(Date.now() / 1000)

function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined || v === '') return fallback
  if (typeof v !== 'string') return v as T
  try { return JSON.parse(v) as T } catch { return fallback }
}

/**
 * Starts (or keeps) the engine for a campaign whose status is 'sending'.
 * Safe to call repeatedly: if a run exists, it is asked to re-scan when it
 * finishes instead of starting a parallel loop.
 */
export function startCampaign(campaignId: number): void {
  const existing = runs.get(campaignId)
  if (existing) {
    existing.restartRequested = true
    return
  }
  const state: RunState = { promise: Promise.resolve(), restartRequested: false, throttle: null, profileId: null }
  runs.set(campaignId, state)
  state.promise = (async () => {
    try {
      await runCampaign(campaignId, state)
    } catch (err: any) {
      console.error(`[engine] campaign ${campaignId} fatal error:`, err)
      pauseCampaign(campaignId, `engine_error: ${String(err?.message || err).slice(0, 200)}`)
    } finally {
      runs.delete(campaignId)
      if (state.restartRequested) {
        const row = sqlite.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId) as { status: string } | undefined
        if (row?.status === 'sending') startCampaign(campaignId)
      }
    }
  })()
}

export { pauseCampaign }

// ── Prepared statements (lazily, the tables exist after migrations) ──────────

let stmts: ReturnType<typeof prepare> | null = null
function prepare() {
  return {
    campaign: sqlite.prepare(
      `SELECT id, name, kind, status, subject, subject_b AS subjectB, ab_winner AS abWinner, ab_phase AS abPhase,
              ab_wait_minutes AS abWaitMinutes, template_html AS templateHtml, preheader, list_id AS listId,
              topic_id AS topicId, sender_profile_id AS senderProfileId, utm_params AS utmParams
       FROM campaigns WHERE id = ?`),
    status: sqlite.prepare('SELECT status FROM campaigns WHERE id = ?'),
    claim: sqlite.prepare(
      `UPDATE sends SET status = 'sending', attempts = COALESCE(attempts, 0) + 1
       WHERE id = (
         SELECT id FROM sends
         WHERE campaign_id = ? AND status = 'pending' AND (scheduled_for IS NULL OR scheduled_for <= ?)
         ORDER BY id LIMIT 1
       )
       RETURNING id, contact_id AS contactId, email, variant, attempts`),
    nextPending: sqlite.prepare(
      `SELECT COUNT(*) AS n, MIN(COALESCE(scheduled_for, 0)) AS next FROM sends WHERE campaign_id = ? AND status = 'pending'`),
    contact: sqlite.prepare(
      `SELECT id, email, status, name, company, role, phone, linkedin, url, youtube, instagram, tags, custom,
              preferences, topic_opt_outs, last_sent_at, locale
       FROM contacts WHERE id = ?`),
    release: sqlite.prepare(
      `UPDATE sends SET status = 'pending', attempts = MAX(COALESCE(attempts, 1) - 1, 0), scheduled_for = ? WHERE id = ? AND status = 'sending'`),
    requeue: sqlite.prepare(
      `UPDATE sends SET status = 'pending', scheduled_for = ?, error_msg = ? WHERE id = ? AND status = 'sending'`),
    sent: sqlite.prepare(
      `UPDATE sends SET status = 'sent', sent_at = ?, error_msg = NULL, personalized_subject = ?, message_id = ?, profile_id = ?, bounce_class = NULL
       WHERE id = ?`),
    failed: sqlite.prepare(
      `UPDATE sends SET status = ?, sent_at = ?, error_msg = ?, bounce_class = ?, profile_id = ? WHERE id = ?`),
    skipped: sqlite.prepare(
      `UPDATE sends SET status = 'skipped', error_msg = ?, sent_at = NULL WHERE id = ?`),
    contactSent: sqlite.prepare(
      `UPDATE contacts SET last_sent_at = ?, sent_since_engaged = COALESCE(sent_since_engaged, 0) + ?, fail_count = 0 WHERE id = ?`),
    contactSoftFail: sqlite.prepare(
      `UPDATE contacts SET fail_count = COALESCE(fail_count, 0) + 1,
         status = CASE WHEN COALESCE(fail_count, 0) + 1 >= 5 AND status = 'active' THEN 'inactive' ELSE status END,
         updated_at = ?
       WHERE id = ?`),
    contactBounced: sqlite.prepare(`UPDATE contacts SET status = 'bounced', updated_at = ? WHERE id = ?`),
    incSent: sqlite.prepare('UPDATE campaigns SET sent_count = COALESCE(sent_count, 0) + 1 WHERE id = ?'),
    incFail: sqlite.prepare('UPDATE campaigns SET fail_count = COALESCE(fail_count, 0) + 1 WHERE id = ?'),
    incBounce: sqlite.prepare('UPDATE campaigns SET bounce_count = COALESCE(bounce_count, 0) + 1 WHERE id = ?'),
    bounceEvent: sqlite.prepare(
      `INSERT INTO tracking_events (send_id, campaign_id, contact_id, event_type, url, created_at) VALUES (?, ?, ?, 'bounce', ?, ?)`),
    payload: sqlite.prepare('SELECT subject, html, vars FROM send_payloads WHERE send_id = ?'),
    finalStats: sqlite.prepare(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('sent', 'opened')) AS sent,
         COUNT(*) FILTER (WHERE status IN ('failed', 'bounced')) AS failed,
         COUNT(*) FILTER (WHERE status = 'held') AS held,
         COUNT(*) FILTER (WHERE status IN ('pending', 'sending')) AS open
       FROM sends WHERE campaign_id = ?`),
  }
}
function S() {
  return (stmts ??= prepare())
}

// ── Eligibility ───────────────────────────────────────────────────────────

const STATUS_SKIP: Record<string, string> = {
  unsubscribed: 'Se dio de baja antes de que le llegara el envío',
  bounced: 'Dirección marcada como rebotada',
  inactive: 'Contacto inactivo',
}

export function skipReason(contact: Contact | undefined | null, campaign: Pick<Campaign, 'kind' | 'topicId'>, email: string): string | null {
  if (campaign.kind === 'transactional') {
    // Receipts & account mail ignore marketing opt-outs (and may go to
    // addresses that aren't contacts), but never to hard failures
    const sup = getSuppression(email)
    if (sup && (sup.reason === 'bounced' || sup.reason === 'complained' || sup.reason === 'invalid')) {
      return `En lista de supresión (${sup.reason})`
    }
    if (contact?.status === 'bounced') return STATUS_SKIP.bounced
    return null
  }
  if (!contact) return 'El contacto fue eliminado'
  if (contact.status !== 'active') return STATUS_SKIP[contact.status] ?? `Estado del contacto: ${contact.status}`
  const sup = getSuppression(email)
  if (sup) return `En lista de supresión (${sup.reason})`
  if (campaign.topicId) {
    const outs = parseJson<number[]>(contact.topic_opt_outs, [])
    if (Array.isArray(outs) && outs.map(Number).includes(Number(campaign.topicId))) return 'Desactivó este tema en sus preferencias'
  }
  if (campaign.kind === 'regular') {
    const prefs = parseJson<{ frequency?: 'all' | 'weekly' | 'monthly' }>(contact.preferences, {})
    if (blockedByFrequency({ preferences: prefs, lastSentAt: contact.last_sent_at ? new Date(contact.last_sent_at * 1000) : null })) {
      return 'Frecuencia elegida por el contacto (ya recibió un email en el periodo)'
    }
  }
  return null
}

function contactVars(contact: Contact | undefined | null, email: string): Record<string, any> {
  if (!contact) return { email }
  const custom = parseJson<Record<string, unknown>>(contact.custom, {})
  return {
    ...custom,
    email: contact.email,
    name: contact.name,
    company: contact.company,
    role: contact.role,
    phone: contact.phone,
    linkedin: contact.linkedin,
    url: contact.url,
    youtube: contact.youtube,
    instagram: contact.instagram,
    locale: contact.locale,
  }
}

// ── Breaker settings ────────────────────────────────────────────────────────

function breakerSettings(config: Record<string, any>) {
  return {
    minSample: Math.max(10, configNumber(config, 'cbMinSample', 50)),
    maxHardRate: Math.min(1, Math.max(0.005, configNumber(config, 'cbMaxHardBounceRate', 0.05))),
    maxBlockRate: Math.min(1, Math.max(0.01, configNumber(config, 'cbMaxBlockRate', 0.1))),
  }
}

const SOFT_BACKOFF_SEC = [60, 300, 900]

async function sleepUntil(untilMs: number, stop: () => boolean): Promise<void> {
  while (Date.now() < untilMs) {
    if (stop()) return
    await sleep(Math.min(1000, untilMs - Date.now()))
  }
}

// ── The run ─────────────────────────────────────────────────────────────────

async function runCampaign(campaignId: number, state: RunState): Promise<void> {
  const config = useServerConfig()
  const secret = String(config.unsubscribeSecret || '')
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET not configured')
  const baseUrl = String(config.trackingBaseUrl || 'http://localhost:3000').replace(/\/$/, '')

  const campaign = S().campaign.get(campaignId) as Campaign | undefined
  if (!campaign) return
  if (campaign.status !== 'sending') return
  // Transactional carriers render each send from its own payload
  if (!campaign.templateHtml && campaign.kind !== 'transactional') {
    pauseCampaign(campaignId, 'no_template')
    return
  }
  clearSignal(campaignId)

  const profiles = profilesForSend(config, campaign.senderProfileId)
  if (!profiles.length) {
    pauseCampaign(campaignId, 'smtp_not_configured')
    sendAlert('critical', 'SMTP sin configurar', `La campaña «${campaign.name}» no puede enviarse: no hay ningún perfil SMTP configurado.`, 'smtp:none')
    return
  }

  const compiled: CompiledCampaign = compileCampaign(campaign)
  const utm = parseJson<{ source?: string; medium?: string; campaign?: string } | null>(campaign.utmParams, null)
  const breaker = breakerSettings(config)
  const maxSoftAttempts = Math.max(1, Math.min(6, configNumber(config, 'smtpMaxRetries', 3)))
  const concurrency = Math.max(1, Math.min(10, configNumber(config, 'smtpConcurrency', 1)))
  const bounceAddress = String(config.bounceAddress || '').trim()
  const imapReady = !!getImapConfig()
  const companyAddress = String(config.companyAddress || '')
  const outageBackoffMs = Math.max(0, configNumber(config, 'smtpOutageBackoffMs', 5000))

  let profileIdx = 0
  state.profileId = profiles[0].id
  const stats = { attempted: 0, hard: 0, block: 0, consecutiveInfra: 0, consecutiveRate: 0 }
  let stop: null | 'paused' | 'breaker' = null
  let lastStatusCheck = 0

  const shouldStop = (): boolean => {
    if (stop) return true
    if (isPaused(campaignId)) { stop = 'paused'; return true }
    if (Date.now() - lastStatusCheck > 3000) {
      lastStatusCheck = Date.now()
      const row = S().status.get(campaignId) as { status: string } | undefined
      if (!row || row.status !== 'sending') { stop = 'paused'; return true }
    }
    return false
  }

  const trip = (reason: string, detail: string) => {
    if (stop === 'breaker') return
    stop = 'breaker'
    pauseCampaign(campaignId, reason)
    sendAlert('critical', `Campaña pausada automáticamente: ${campaign.name}`, detail, `breaker:${campaignId}:${reason}`)
    emitWebhook('campaign.paused', { campaignId, reason, detail })
    console.warn(`[engine] campaign ${campaignId} paused by breaker: ${reason} — ${detail}`)
  }

  const checkBreaker = () => {
    if (campaign.kind === 'transactional' || stats.attempted < breaker.minSample) return
    const hardRate = stats.hard / stats.attempted
    const blockRate = stats.block / stats.attempted
    if (hardRate > breaker.maxHardRate) {
      trip('bounce_rate', `Tasa de rebote duro ${(hardRate * 100).toFixed(1)}% (${stats.hard}/${stats.attempted}) supera el ${(breaker.maxHardRate * 100).toFixed(1)}%. Revisa la calidad de la lista antes de reanudar.`)
    } else if (blockRate > breaker.maxBlockRate) {
      trip('blocked_by_provider', `El ${(blockRate * 100).toFixed(1)}% de los envíos (${stats.block}/${stats.attempted}) fue rechazado por política/reputación. Revisa SPF/DKIM/DMARC, contenido y listas negras antes de reanudar.`)
    }
  }

  const processOne = async (job: Job) => {
    const contact = job.contactId ? S().contact.get(job.contactId) as Contact | undefined : undefined
    const skip = skipReason(contact, campaign, job.email)
    if (skip) {
      S().skipped.run(skip, job.id)
      return
    }

    const profile: SmtpProfile = profiles[profileIdx]
    state.profileId = profile.id

    // Warm-up / provider daily quotas
    const cap = dailyCapBlock(config, profile)
    if (cap) {
      S().release.run(null, job.id)
      state.throttle = { reason: cap.reason, until: cap.until.getTime() }
      await sleepUntil(cap.until.getTime() + Math.floor(Math.random() * 60_000), shouldStop)
      state.throttle = null
      return
    }

    await acquireSendSlot(config, { profileId: profile.id, profileMaxPerSecond: profile.maxPerSecond, recipient: job.email })
    if (shouldStop()) {
      S().release.run(null, job.id)
      return
    }

    let vars = contactVars(contact, job.email)
    let sendCompiled = compiled
    if (campaign.kind === 'transactional') {
      const payload = S().payload.get(job.id) as { subject: string; html: string; vars: string | null } | undefined
      if (!payload) {
        S().skipped.run('Sin contenido (payload) para este envío', job.id)
        return
      }
      sendCompiled = compileCampaign({ templateHtml: payload.html, subject: payload.subject })
      vars = { ...vars, ...parseJson<Record<string, unknown>>(payload.vars, {}) }
    }
    const rendered = renderEmail({
      compiled: sendCompiled, variant: job.variant, vars, sendId: job.id, baseUrl, secret, utm, companyAddress, track: true,
      unsubscribeFooter: campaign.kind !== 'transactional',
    })
    const identity = senderIdentity(profile, config)
    const messageId = newMessageId(identity.domain)
    const listUnsub = [`<${rendered.oneClickUrl}>`]
    const mailtoUnsub = imapReady ? verpAddress(bounceAddress, 'u', job.id, secret) : null
    if (mailtoUnsub) listUnsub.push(`<mailto:${mailtoUnsub}?subject=unsubscribe>`)
    const headers: Record<string, string> = {
      'X-TM-ID': signSendTag(job.id, secret),
      'Feedback-ID': `c${campaignId}:${campaign.kind}:l${campaign.listId ?? 0}:turbomailer`,
    }
    // Bulk/marketing mail must offer one-click unsubscribe; receipts must not
    if (campaign.kind !== 'transactional') {
      headers['List-Unsubscribe'] = listUnsub.join(', ')
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
    }
    if (campaign.listId) headers['List-Id'] = `<list${campaign.listId}.${identity.domain}>`
    const envelopeFrom = verpAddress(bounceAddress, 'b', job.id, secret)

    try {
      await getTransport(profile, config).sendMail({
        from: formatAddress(identity.name, identity.email),
        to: job.email,
        replyTo: identity.replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        messageId,
        headers,
        ...(envelopeFrom ? { envelope: { from: envelopeFrom, to: job.email } } : {}),
      })
      const at = nowSec()
      sqlite.transaction(() => {
        S().sent.run(at, rendered.subject, messageId, profile.id, job.id)
        S().incSent.run(campaignId)
        if (contact) S().contactSent.run(at, campaign.kind === 'transactional' ? 0 : 1, contact.id)
      })()
      recordSentToday(profile.id)
      stats.attempted++
      stats.consecutiveInfra = 0
      stats.consecutiveRate = 0
      return
    } catch (err) {
      const f = classifySmtpError(err)
      const msg = describeFailure(f)

      if (f.kind === 'connection' || f.kind === 'auth') {
        // Not the recipient's fault: the send goes back to the queue untouched
        S().release.run(null, job.id)
        stats.consecutiveInfra++
        const limit = f.kind === 'auth' ? 1 : 3
        if (stats.consecutiveInfra >= limit) {
          if (profileIdx + 1 < profiles.length) {
            const from = profiles[profileIdx].name
            profileIdx++
            stats.consecutiveInfra = 0
            sendAlert('warning', 'Conmutación de SMTP', `«${from}» falla (${msg}). La campaña «${campaign.name}» continúa por «${profiles[profileIdx].name}».`, `failover:${from}`)
          } else {
            trip('smtp_unavailable', `El servidor SMTP no responde o rechaza las credenciales: ${msg}. La campaña se reanudará donde se quedó.`)
          }
        } else {
          await sleepUntil(Date.now() + outageBackoffMs * stats.consecutiveInfra, shouldStop)
        }
        return
      }

      if (f.kind === 'rate_limit') {
        stats.consecutiveRate++
        penalizeProvider(job.email, 60_000)
        penalizeGlobal(15_000 * Math.min(stats.consecutiveRate, 8))
        if (job.attempts < 6) {
          S().requeue.run(nowSec() + 60 * Math.min(job.attempts, 5), msg, job.id)
        } else {
          sqlite.transaction(() => {
            S().failed.run('failed', nowSec(), msg, 'soft', profile.id, job.id)
            S().incFail.run(campaignId)
          })()
        }
        if (stats.consecutiveRate >= 20) {
          trip('provider_throttling', `El proveedor está limitando la velocidad de forma continuada (${msg}). Reduce la velocidad en Ajustes antes de reanudar.`)
        }
        return
      }

      stats.consecutiveInfra = 0
      stats.consecutiveRate = 0

      if (f.kind === 'soft') {
        if (job.attempts < maxSoftAttempts) {
          const wait = SOFT_BACKOFF_SEC[Math.min(job.attempts - 1, SOFT_BACKOFF_SEC.length - 1)]
          S().requeue.run(nowSec() + wait, msg, job.id)
          return
        }
        sqlite.transaction(() => {
          S().failed.run('failed', nowSec(), msg, 'soft', profile.id, job.id)
          S().incFail.run(campaignId)
          if (contact) S().contactSoftFail.run(nowSec(), contact.id)
        })()
        stats.attempted++
        checkBreaker()
        return
      }

      if (f.kind === 'hard') {
        const at = nowSec()
        sqlite.transaction(() => {
          S().failed.run('bounced', at, msg, 'hard', profile.id, job.id)
          S().incFail.run(campaignId)
          S().incBounce.run(campaignId)
          if (contact) S().contactBounced.run(at, contact.id)
          S().bounceEvent.run(job.id, campaignId, contact?.id ?? null, null, at)
        })()
        suppress(job.email, 'bounced', msg.slice(0, 250), `campaign:${campaignId}`)
        emitWebhook('email.bounced', { sendId: job.id, campaignId, contactId: contact?.id ?? null, email: job.email, type: 'hard', detail: msg })
        stats.hard++
        stats.attempted++
        checkBreaker()
        return
      }

      // block: the receiver refused OUR mail — the address is fine
      sqlite.transaction(() => {
        S().failed.run('failed', nowSec(), msg, 'block', profile.id, job.id)
        S().incFail.run(campaignId)
      })()
      stats.block++
      stats.attempted++
      checkBreaker()
    }
  }

  const worker = async () => {
    while (!shouldStop()) {
      const job = S().claim.get(campaignId, nowSec()) as Job | undefined
      if (!job) {
        const next = S().nextPending.get(campaignId) as { n: number; next: number | null }
        if (!next?.n) return
        // Nothing due yet (send-time optimization / retry backoff): wait
        const dueAt = Math.max(Date.now() + 1000, Math.min((next.next ?? 0) * 1000, Date.now() + 30_000))
        state.throttle = (next.next ?? 0) * 1000 > Date.now() + 5000 ? { reason: 'scheduled', until: (next.next ?? 0) * 1000 } : null
        await sleepUntil(dueAt, shouldStop)
        continue
      }
      state.throttle = null
      try {
        await processOne(job)
      } catch (err) {
        // Rendering bug or DB error for this one send: record it, keep going
        console.error(`[engine] send ${job.id} unexpected error:`, err)
        S().failed.run('failed', nowSec(), `Error interno: ${String((err as any)?.message || err).slice(0, 200)}`, 'soft', null, job.id)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  if (stop) return // paused (by user or breaker): status already handled

  // Finished: everything claimable is done
  const fin = S().finalStats.get(campaignId) as { sent: number; failed: number; held: number; open: number }
  if (fin.open > 0) {
    // Someone re-queued sends while we were finishing (retry/resume) — go again
    state.restartRequested = true
    return
  }
  const fresh = S().campaign.get(campaignId) as Campaign | undefined
  if (!fresh || fresh.status !== 'sending') return

  if (fin.held > 0 && fresh.abPhase === 'sample') {
    const waitMinutes = Math.max(10, Number(fresh.abWaitMinutes) || 240)
    sqlite.prepare(`UPDATE campaigns SET sent_count = ?, fail_count = ?, ab_phase = 'waiting', ab_decide_at = ? WHERE id = ?`)
      .run(fin.sent, fin.failed, nowSec() + waitMinutes * 60, campaignId)
    return
  }

  sqlite.prepare(`UPDATE campaigns SET status = 'sent', finished_at = ?, sent_count = ?, fail_count = ?, pause_reason = NULL WHERE id = ?`)
    .run(nowSec(), fin.sent, fin.failed, campaignId)
  if (fresh.kind === 'regular') emitWebhook('campaign.finished', { campaignId, name: fresh.name, sent: fin.sent, failed: fin.failed })

  // NDRs need a moment to arrive — check the bounce mailbox shortly after
  if (fresh.kind === 'regular' && imapReady) {
    setTimeout(() => {
      const imapCfg = getImapConfig()
      if (imapCfg) processBounces(imapCfg).catch(() => {})
    }, 15_000)
  }
}

/** Resumes every campaign left in 'sending' (boot after crash/deploy). */
export function resumeInterruptedCampaigns(): number[] {
  const rows = sqlite.prepare(
    `SELECT id FROM campaigns WHERE status = 'sending' AND (ab_phase IS NULL OR ab_phase != 'waiting')`,
  ).all() as { id: number }[]
  rows.forEach(r => startCampaign(r.id))
  return rows.map(r => r.id)
}
