import { describe, it, expect, beforeEach, vi } from 'vitest'

const env = await vi.hoisted(async () => {
  const h = await import('./harness')
  return h.bootIsolatedEnv({ cbMinSample: 20, smtpOutageBackoffMs: 5 })
})

// Fake SMTP: records every message, fails per-recipient on demand
const smtp = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; html: string; headers: Record<string, string>; envelope?: any }[],
  failFor: new Map<string, () => Error>(),
  delayMs: 0,
}))

vi.mock('~/server/utils/mailer', async (importOriginal) => {
  const orig = await importOriginal<typeof import('~/server/utils/mailer')>()
  return {
    ...orig,
    getTransport: () => ({
      sendMail: async (opts: any) => {
        if (smtp.delayMs) await new Promise(r => setTimeout(r, smtp.delayMs))
        const fail = smtp.failFor.get(String(opts.to))
        if (fail) throw fail()
        smtp.sent.push({ to: opts.to, subject: opts.subject, html: opts.html, headers: opts.headers, envelope: opts.envelope })
        return { accepted: [opts.to], rejected: [] }
      },
      close: () => {},
    }),
  }
})

const { sqlite } = await import('~/server/db/index')
const { setupCampaignSends } = await import('~/server/utils/send-setup')
const { resolveRecipients } = await import('~/server/utils/recipients')
const { startCampaign, waitForCampaign } = await import('~/server/utils/send-engine')
const { suppress, isSuppressed } = await import('~/server/utils/suppression')
const { signalPause, clearSignal } = await import('~/server/utils/campaign-state')
const { _resetLimiterState } = await import('~/server/utils/send-limiter')

function smtpError(code: number, message: string, extra: Record<string, unknown> = {}) {
  return () => Object.assign(new Error(message), { responseCode: code, response: message, command: 'RCPT TO', ...extra })
}

let listId = 0

function seedContacts(n: number, prefix = 'user'): number[] {
  const ids: number[] = []
  const ins = sqlite.prepare(`INSERT INTO contacts (email, name, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`)
  const link = sqlite.prepare('INSERT INTO list_contacts (list_id, contact_id) VALUES (?, ?)')
  const now = Math.floor(Date.now() / 1000)
  sqlite.transaction(() => {
    for (let i = 0; i < n; i++) {
      const r = ins.run(`${prefix}${i}@example.org`, `${prefix} ${i}`, now, now)
      link.run(listId, Number(r.lastInsertRowid))
      ids.push(Number(r.lastInsertRowid))
    }
  })()
  return ids
}

function createCampaign(extra: Record<string, unknown> = {}): number {
  const r = sqlite.prepare(
    `INSERT INTO campaigns (name, subject, template_html, list_id, status, created_at, kind)
     VALUES (?, ?, ?, ?, 'draft', ?, 'regular')`,
  ).run('Test', 'Hola {{name}}', '<html><body><p>Hola {{name}}</p><a href="https://example.com/x">x</a> <a href="{{UNSUBSCRIBE_URL}}">baja</a></body></html>', listId, Math.floor(Date.now() / 1000))
  const id = Number(r.lastInsertRowid)
  for (const [k, v] of Object.entries(extra)) sqlite.prepare(`UPDATE campaigns SET ${k} = ? WHERE id = ?`).run(v as any, id)
  return id
}

async function launch(campaignId: number) {
  const campaign = (await import('~/server/db/index')).db
  const { campaigns } = await import('~/server/db/schema')
  const { eq } = await import('drizzle-orm')
  const [row] = await campaign.select().from(campaigns).where(eq(campaigns.id, campaignId))
  const { recipients } = await resolveRecipients(row, env.cfg)
  await setupCampaignSends(row, recipients)
  startCampaign(campaignId)
  await waitForCampaign(campaignId)
}

const campaignRow = (id: number) => sqlite.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as any
const sendsOf = (id: number) => sqlite.prepare('SELECT * FROM sends WHERE campaign_id = ? ORDER BY id').all(id) as any[]

beforeEach(() => {
  smtp.sent.length = 0
  smtp.failFor.clear()
  smtp.delayMs = 0
  _resetLimiterState()
  sqlite.exec('DELETE FROM tracking_events; DELETE FROM sends; DELETE FROM campaigns; DELETE FROM list_contacts; DELETE FROM contacts; DELETE FROM lists; DELETE FROM suppressions;')
  listId = Number(sqlite.prepare(`INSERT INTO lists (name, created_at) VALUES ('L', ?)`).run(Math.floor(Date.now() / 1000)).lastInsertRowid)
})

describe('send engine', () => {
  it('delivers to every active contact once, with one-click unsubscribe headers', async () => {
    seedContacts(3)
    const id = createCampaign()
    await launch(id)

    expect(smtp.sent).toHaveLength(3)
    expect(new Set(smtp.sent.map(s => s.to)).size).toBe(3)
    const c = campaignRow(id)
    expect(c.status).toBe('sent')
    expect(c.sent_count).toBe(3)
    for (const m of smtp.sent) {
      expect(m.headers['List-Unsubscribe']).toMatch(/^<https:\/\/mail\.example\.com\/api\/unsubscribe\/one-click\?s=\d+&t=/)
      expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
      expect(m.headers['X-TM-ID']).toMatch(/^\d+\.[a-f0-9]{10}$/)
      expect(m.subject).toMatch(/^Hola user \d$/)
      expect(m.html).toContain('/api/track/open?s=')
    }
    expect(sendsOf(id).every(s => s.status === 'sent' && s.message_id)).toBe(true)
  })

  it('subject lines are plain text (no HTML entities from escaping)', async () => {
    const [cid] = seedContacts(1)
    sqlite.prepare(`UPDATE contacts SET name = ? WHERE id = ?`).run(`O'Brien & Co`, cid)
    const id = createCampaign()
    await launch(id)
    expect(smtp.sent[0].subject).toBe(`Hola O'Brien & Co`)
  })

  it('skips a contact who unsubscribed after the campaign was prepared', async () => {
    const [a, b] = seedContacts(2)
    const id = createCampaign()
    const { db } = await import('~/server/db/index')
    const { campaigns } = await import('~/server/db/schema')
    const { eq } = await import('drizzle-orm')
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id))
    const { recipients } = await resolveRecipients(row, env.cfg)
    await setupCampaignSends(row, recipients)
    // Unsubscribes (e.g. during the A/B wait) before the engine reaches them
    sqlite.prepare(`UPDATE contacts SET status = 'unsubscribed' WHERE id = ?`).run(b)
    startCampaign(id)
    await waitForCampaign(id)

    expect(smtp.sent.map(s => s.to)).toEqual([`user0@example.org`])
    const skipped = sendsOf(id).find(s => s.contact_id === b)
    expect(skipped.status).toBe('skipped')
    expect(skipped.error_msg).toMatch(/baja/i)
    expect(a).toBeGreaterThan(0)
  })

  it('never mails a suppressed address, whatever list it is in', async () => {
    seedContacts(2)
    suppress('user1@example.org', 'complained')
    const id = createCampaign()
    await launch(id)
    expect(smtp.sent.map(s => s.to)).toEqual(['user0@example.org'])
  })

  it('hard bounce: contact bounced + suppressed', async () => {
    const [, b] = seedContacts(2)
    smtp.failFor.set('user1@example.org', smtpError(550, '550 5.1.1 <user1@example.org>: Recipient address rejected: User unknown'))
    const id = createCampaign()
    await launch(id)
    const s = sendsOf(id).find(x => x.contact_id === b)
    expect(s.status).toBe('bounced')
    expect(s.bounce_class).toBe('hard')
    expect((sqlite.prepare('SELECT status FROM contacts WHERE id = ?').get(b) as any).status).toBe('bounced')
    expect(isSuppressed('user1@example.org')).toBe(true)
    expect(campaignRow(id).bounce_count).toBe(1)
  })

  it('policy block (5.7.26 DMARC) fails the send but does NOT bounce the contact', async () => {
    const [, b] = seedContacts(2)
    smtp.failFor.set('user1@example.org', smtpError(550, '550-5.7.26 This mail is unauthenticated, which poses a security risk to the sender and Gmail users'))
    const id = createCampaign()
    await launch(id)
    const s = sendsOf(id).find(x => x.contact_id === b)
    expect(s.status).toBe('failed')
    expect(s.bounce_class).toBe('block')
    expect((sqlite.prepare('SELECT status FROM contacts WHERE id = ?').get(b) as any).status).toBe('active')
    expect(isSuppressed('user1@example.org')).toBe(false)
  })

  it('SMTP outage pauses the campaign and keeps sends pending — the list is not burned', async () => {
    seedContacts(5)
    for (let i = 0; i < 5; i++) {
      smtp.failFor.set(`user${i}@example.org`, () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNECTION' }))
    }
    const id = createCampaign()
    await launch(id)
    const c = campaignRow(id)
    expect(c.status).toBe('paused')
    expect(c.pause_reason).toBe('smtp_unavailable')
    const rows = sendsOf(id)
    expect(rows.every(r => r.status === 'pending')).toBe(true)
    const statuses = sqlite.prepare('SELECT DISTINCT status FROM contacts').all() as any[]
    expect(statuses.map(s => s.status)).toEqual(['active'])
  }, 60_000)

  it('temporary failure (greylisting) is retried later, not failed', async () => {
    seedContacts(1)
    smtp.failFor.set('user0@example.org', smtpError(451, '451 4.7.1 Greylisted, please come back later'))
    const id = createCampaign()
    // Engine will wait for the retry — stop it once the requeue happened
    const { db } = await import('~/server/db/index')
    const { campaigns } = await import('~/server/db/schema')
    const { eq } = await import('drizzle-orm')
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id))
    const { recipients } = await resolveRecipients(row, env.cfg)
    await setupCampaignSends(row, recipients)
    startCampaign(id)
    await new Promise(r => setTimeout(r, 300))
    const s = sendsOf(id)[0]
    expect(s.status).toBe('pending')
    expect(s.attempts).toBe(1)
    expect(s.scheduled_for).toBeGreaterThan(Math.floor(Date.now() / 1000))
    signalPause(id)
    sqlite.prepare(`UPDATE campaigns SET status = 'paused' WHERE id = ?`).run(id)
    await waitForCampaign(id)
  })

  it('circuit breaker pauses on an abnormal hard-bounce rate', async () => {
    seedContacts(40)
    for (let i = 0; i < 40; i += 3) {
      smtp.failFor.set(`user${i}@example.org`, smtpError(550, '550 5.1.1 User unknown'))
    }
    const id = createCampaign()
    await launch(id)
    const c = campaignRow(id)
    expect(c.status).toBe('paused')
    expect(c.pause_reason).toBe('bounce_rate')
    expect(smtp.sent.length).toBeLessThan(40)
  })

  it('pause → immediate resume never sends anyone twice', async () => {
    seedContacts(30)
    smtp.delayMs = 5
    const id = createCampaign()
    const { db } = await import('~/server/db/index')
    const { campaigns } = await import('~/server/db/schema')
    const { eq } = await import('drizzle-orm')
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id))
    const { recipients } = await resolveRecipients(row, env.cfg)
    await setupCampaignSends(row, recipients)
    startCampaign(id)
    await new Promise(r => setTimeout(r, 40))
    // pause...
    signalPause(id)
    sqlite.prepare(`UPDATE campaigns SET status = 'paused' WHERE id = ?`).run(id)
    // ...and resume right away while the first loop may still be in flight
    sqlite.prepare(`UPDATE campaigns SET status = 'sending' WHERE id = ?`).run(id)
    clearSignal(id)
    startCampaign(id)
    await waitForCampaign(id)

    const tos = smtp.sent.map(s => s.to)
    expect(new Set(tos).size).toBe(tos.length)
    expect(tos.length).toBe(30)
    expect(campaignRow(id).status).toBe('sent')
  })

  it('handles lists far beyond SQLite variable limits (20k recipients)', async () => {
    seedContacts(20_000, 'bulk')
    const id = createCampaign()
    const { db } = await import('~/server/db/index')
    const { campaigns } = await import('~/server/db/schema')
    const { eq } = await import('drizzle-orm')
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id))
    const { recipients } = await resolveRecipients(row, env.cfg)
    expect(recipients).toHaveLength(20_000)
    await setupCampaignSends(row, recipients)
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM sends WHERE campaign_id = ?').get(id) as any).n).toBe(20_000)
    expect(campaignRow(id).total_recipients).toBe(20_000)
  }, 60_000)

  it('respects the weekly frequency preference', async () => {
    const [a] = seedContacts(2)
    sqlite.prepare(`UPDATE contacts SET preferences = ?, last_sent_at = ? WHERE id = ?`)
      .run(JSON.stringify({ frequency: 'weekly' }), Math.floor(Date.now() / 1000) - 86400, a)
    const id = createCampaign()
    await launch(id)
    expect(smtp.sent.map(s => s.to)).toEqual(['user1@example.org'])
  })

  it('A/B campaign stops after the sample and waits for the winner', async () => {
    seedContacts(50)
    const id = createCampaign({ subject_b: 'Otra {{name}}', ab_sample_pct: 20 })
    await launch(id)
    const c = campaignRow(id)
    expect(c.status).toBe('sending')
    expect(c.ab_phase).toBe('waiting')
    const held = sendsOf(id).filter(s => s.status === 'held')
    expect(held.length).toBe(40)
    expect(smtp.sent).toHaveLength(10)
  })
})
