import { describe, it, expect, beforeEach, vi } from 'vitest'

const env = await vi.hoisted(async () => {
  const h = await import('./harness')
  return h.bootIsolatedEnv({ doubleOptIn: false })
})

const smtp = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; headers: Record<string, string>; text: string }[] }))
vi.mock('~/server/utils/mailer', async (importOriginal) => {
  const orig = await importOriginal<typeof import('~/server/utils/mailer')>()
  return {
    ...orig,
    getTransport: () => ({
      sendMail: async (opts: any) => { smtp.sent.push({ to: opts.to, subject: opts.subject, headers: opts.headers ?? {}, text: opts.text }); return {} },
      close: () => {},
    }),
  }
})

const { sqlite } = await import('~/server/db/index')
const seg = await import('~/server/utils/segments')
const { waitForCampaign, activeRunIds } = await import('~/server/utils/send-engine')
const auto = await import('~/server/utils/automation-engine')
const { emitContactEvent, invalidateAutomationCache } = await import('~/server/utils/contact-events')
const { subscribeContact } = await import('~/server/utils/subscribe')
const { suppress, getSuppression } = await import('~/server/utils/suppression')
const { createApiKey, requireApiKey } = await import('~/server/utils/api-keys')
const { queueTransactional } = await import('~/server/utils/transactional')
const { formToken, checkFormToken, sanitizeFields } = await import('~/server/utils/forms')
const { eraseContact, exportContactData } = await import('~/server/utils/gdpr')
const { _resetLimiterState } = await import('~/server/utils/send-limiter')

const now = () => Math.floor(Date.now() / 1000)
function contact(email: string, extra: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = { email, status: 'active', created_at: now(), updated_at: now(), ...extra }
  const cols = Object.keys(row)
  const vals = Object.values(row)
  return Number(sqlite.prepare(`INSERT INTO contacts (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals as any[]).lastInsertRowid)
}
async function drainEngine() {
  for (let i = 0; i < 50 && activeRunIds().length; i++) {
    await Promise.all(activeRunIds().map(id => waitForCampaign(id)))
  }
}

beforeEach(() => {
  smtp.sent.length = 0
  _resetLimiterState()
  sqlite.exec(`DELETE FROM automation_runs; DELETE FROM automations; DELETE FROM tracking_events; DELETE FROM send_payloads; DELETE FROM sends;
    DELETE FROM campaigns; DELETE FROM list_contacts; DELETE FROM contacts; DELETE FROM lists; DELETE FROM suppressions; DELETE FROM custom_fields;
    DELETE FROM api_keys; DELETE FROM idempotency_keys; DELETE FROM consent_log;`)
  invalidateAutomationCache()
})

describe('segments', () => {
  it('compiles nested AND/OR rules with tags, custom fields and behavior', async () => {
    sqlite.prepare(`INSERT INTO custom_fields (key, label, type, sort_order, created_at) VALUES ('plan', 'Plan', 'select', 1, ?), ('points', 'Puntos', 'number', 2, ?)`).run(now(), now())
    const { invalidateCustomFieldCache } = await import('~/server/utils/custom-fields')
    invalidateCustomFieldCache()
    const a = contact('a@x.com', { tags: '["vip","es"]', custom: '{"plan":"Pro","points":120}' })
    contact('b@x.com', { tags: '["es"]', custom: '{"plan":"Free","points":10}' })
    contact('c@gmail.com', { tags: '[]', custom: '{"plan":"Pro","points":500}', status: 'unsubscribed' })
    const rules = {
      match: 'all',
      rules: [
        { field: 'custom.plan', op: 'eq', value: 'pro' },
        { match: 'any', rules: [{ field: 'tags', op: 'has_any', value: ['VIP'] }, { field: 'custom.points', op: 'gt', value: 400 }] },
      ],
    } as any
    const active = seg.evaluateSegmentRules(rules, { onlyActive: true })
    expect(active.map(r => r.id)).toEqual([a])
    expect(seg.countSegmentRules(rules, false)).toBe(2)
    expect(seg.countSegmentRules({ match: 'all', rules: [{ field: 'email_domain', op: 'eq', value: 'gmail.com' }] } as any, false)).toBe(1)
  })

  it('rejects unknown fields/operators and injection attempts', () => {
    expect(() => seg.validateSegment({ match: 'all', rules: [{ field: 'email; DROP TABLE contacts', op: 'eq', value: 1 }] })).toThrow()
    expect(() => seg.validateSegment({ match: 'all', rules: [{ field: 'email', op: 'gt', value: 1 }] })).toThrow()
    const id = contact('x@x.com')
    expect(seg.evaluateSegmentRules({ match: 'all', rules: [{ field: 'name', op: 'eq', value: "' OR 1=1 --" }] } as any)).toHaveLength(0)
    expect(id).toBeGreaterThan(0)
  })

  it('behavior rules use human engagement only', () => {
    const cid = Number(sqlite.prepare(`INSERT INTO campaigns (name, subject, status, kind, created_at) VALUES ('C','s','sent','regular',?)`).run(now()).lastInsertRowid)
    const opener = contact('o@x.com')
    const proxyOnly = contact('p@x.com')
    const s1 = Number(sqlite.prepare(`INSERT INTO sends (campaign_id, contact_id, email, status) VALUES (?, ?, 'o@x.com', 'opened')`).run(cid, opener).lastInsertRowid)
    const s2 = Number(sqlite.prepare(`INSERT INTO sends (campaign_id, contact_id, email, status) VALUES (?, ?, 'p@x.com', 'opened')`).run(cid, proxyOnly).lastInsertRowid)
    sqlite.prepare(`INSERT INTO tracking_events (send_id, campaign_id, contact_id, event_type, is_proxy, created_at) VALUES (?, ?, ?, 'open', 0, ?), (?, ?, ?, 'open', 1, ?)`)
      .run(s1, cid, opener, now(), s2, cid, proxyOnly, now())
    const ids = seg.evaluateSegmentRules({ match: 'all', rules: [{ field: 'behavior', op: 'opened_campaign', value: cid }] } as any).map(r => r.id)
    expect(ids).toEqual([opener])
  })
})

describe('automations', () => {
  it('path navigation in and out of condition branches', () => {
    const steps: any[] = [
      { id: 'a', type: 'tag' },
      { id: 'b', type: 'condition', yes: [{ id: 'y1', type: 'tag' }, { id: 'y2', type: 'tag' }], no: [] },
      { id: 'c', type: 'exit' },
    ]
    expect(auto.nextPath(steps, [0])).toEqual([1])
    expect(auto.nextPath(steps, [1, 'yes', 0])).toEqual([1, 'yes', 1])
    expect(auto.nextPath(steps, [1, 'yes', 1])).toEqual([2])
    expect(auto.nextPath(steps, [2])).toBeNull()
    expect(auto.stepAt(steps, [1, 'yes', 1])?.id).toBe('y2')
  })

  it('welcome flow: subscribe → email now → wait → condition branch → tag', async () => {
    const listId = Number(sqlite.prepare(`INSERT INTO lists (name, created_at) VALUES ('Newsletter', ?)`).run(now()).lastInsertRowid)
    const steps = auto.validateSteps([
      { type: 'email', subject: 'Bienvenido {{name | "amigo"}}', templateHtml: '<p>Hola</p><a href="{{UNSUBSCRIBE_URL}}">baja</a>' },
      { type: 'wait', amount: 2, unit: 'days' },
      { type: 'condition', condition: { kind: 'opened_last' }, yes: [{ type: 'tag', action: 'add', tag: 'engaged' }], no: [{ type: 'tag', action: 'add', tag: 'cold' }] },
    ])
    const autoId = Number(sqlite.prepare(`INSERT INTO automations (name, status, "trigger", steps, allow_reentry, created_at, updated_at) VALUES ('Welcome', 'active', ?, '[]', 0, ?, ?)`)
      .run(JSON.stringify({ type: 'subscribed', listId }), now(), now()).lastInsertRowid)
    auto.syncCarrierCampaigns(autoId, 'Welcome', steps)
    sqlite.prepare('UPDATE automations SET steps = ? WHERE id = ?').run(JSON.stringify(steps), autoId)
    invalidateAutomationCache()

    const r = subscribeContact({ raw: { email: 'new@x.com', name: 'Ana' }, listIds: [listId], source: 'test' })
    expect(r.status).toBe('subscribed')
    await auto.processDueRuns()
    await drainEngine()
    expect(smtp.sent.map(m => m.subject)).toEqual(['Bienvenido Ana'])
    // Automation (marketing) email keeps one-click unsubscribe
    expect(smtp.sent[0].headers['List-Unsubscribe']).toContain('one-click')

    const run = sqlite.prepare('SELECT * FROM automation_runs').get() as any
    expect(run.status).toBe('waiting')
    // Jump past the wait
    sqlite.prepare('UPDATE automation_runs SET next_run_at = ? WHERE id = ?').run(now() - 1, run.id)
    await auto.processDueRuns()
    const done = sqlite.prepare('SELECT status FROM automation_runs WHERE id = ?').get(run.id) as any
    expect(done.status).toBe('done')
    const tags = JSON.parse((sqlite.prepare(`SELECT tags FROM contacts WHERE email = 'new@x.com'`).get() as any).tags)
    expect(tags).toContain('cold')
  })

  it('does not re-enroll when re-entry is off, exits unsubscribed contacts', async () => {
    const autoId = Number(sqlite.prepare(`INSERT INTO automations (name, status, "trigger", steps, allow_reentry, created_at, updated_at) VALUES ('T', 'active', ?, ?, 0, ?, ?)`)
      .run(JSON.stringify({ type: 'tag_added', tag: 'lead' }), JSON.stringify([{ id: 'w', type: 'wait', amount: 1, unit: 'days' }, { id: 't', type: 'tag', action: 'add', tag: 'x' }]), now(), now()).lastInsertRowid)
    invalidateAutomationCache()
    const cid = contact('t@x.com')
    emitContactEvent({ type: 'tag_added', contactId: cid, tag: 'LEAD' })
    emitContactEvent({ type: 'tag_added', contactId: cid, tag: 'lead' })
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM automation_runs WHERE automation_id = ?').get(autoId) as any).n).toBe(1)
    await auto.processDueRuns()
    sqlite.prepare(`UPDATE contacts SET status = 'unsubscribed' WHERE id = ?`).run(cid)
    sqlite.prepare('UPDATE automation_runs SET next_run_at = ?').run(now() - 1)
    await auto.processDueRuns()
    expect((sqlite.prepare('SELECT status FROM automation_runs').get() as any).status).toBe('exited')
  })
})

describe('subscription rules', () => {
  it('bounced/complained addresses are refused; former unsubscribers need confirmation', () => {
    suppress('bad@x.com', 'bounced')
    expect(subscribeContact({ raw: { email: 'bad@x.com' }, source: 't' })).toMatchObject({ status: 'rejected', reason: 'suppressed' })
    const id = contact('gone@x.com', { status: 'unsubscribed' })
    suppress('gone@x.com', 'unsubscribed')
    const r = subscribeContact({ raw: { email: 'gone@x.com' }, source: 't' })
    expect(r).toMatchObject({ status: 'pending_confirmation', contactId: id })
    expect((sqlite.prepare('SELECT status FROM contacts WHERE id = ?').get(id) as any).status).toBe('inactive')
    expect(getSuppression('gone@x.com')?.reason).toBe('unsubscribed')
  })
})

describe('public API', () => {
  it('scoped keys, transactional send with payload, no unsubscribe headers', async () => {
    const { key } = createApiKey('shop', ['send'])
    const ev = (k: string) => ({ node: { req: { headers: { authorization: `Bearer ${k}` } } } }) as any
    // h3 getHeader reads event.node.req.headers
    expect(requireApiKey(ev(key), 'send').name).toBe('shop')
    expect(() => requireApiKey(ev(key), 'contacts:write')).toThrow(/scope/)
    expect(() => requireApiKey(ev('tm_nope'), 'send')).toThrow(/invalid/i)

    const q = queueTransactional({ to: 'buyer@x.com', subject: 'Pedido {{order}}', html: '<p>Gracias {{name | "cliente"}}, pedido {{order}}</p>', variables: { order: 'A-17' } }, 1)
    await drainEngine()
    expect(q.status).toBe('queued')
    const m = smtp.sent.find(x => x.to === 'buyer@x.com')!
    expect(m.subject).toBe('Pedido A-17')
    expect(m.headers['List-Unsubscribe']).toBeUndefined()
    expect(m.text).not.toContain('Darse de baja')
    // Receipts ignore marketing opt-outs but never hard bounces
    suppress('optout@x.com', 'unsubscribed')
    suppress('dead@x.com', 'bounced')
    queueTransactional({ to: 'optout@x.com', subject: 'R', html: '<p>r</p>' }, 1)
    queueTransactional({ to: 'dead@x.com', subject: 'R', html: '<p>r</p>' }, 1)
    await drainEngine()
    const tos = smtp.sent.map(x => x.to)
    expect(tos).toContain('optout@x.com')
    expect(tos).not.toContain('dead@x.com')
  })
})

describe('forms & GDPR', () => {
  it('form token rejects too-fast and forged submissions', async () => {
    const t = formToken('abcdefgh')
    expect(checkFormToken('abcdefgh', t)).toBe('too_fast')
    const old = `${Date.now() - 5000}.${'0'.repeat(32)}`
    expect(checkFormToken('abcdefgh', old)).toBe('invalid')
    expect(sanitizeFields([{ key: 'name', label: 'Nombre' }, { key: '../evil', label: 'x' }]).map(f => f.key)).toEqual(['email', 'name'])
  })

  it('erasure anonymizes history and keeps the address suppressed', () => {
    const cid = contact('me@x.com', { name: 'Me' })
    const camp = Number(sqlite.prepare(`INSERT INTO campaigns (name, subject, status, kind, created_at) VALUES ('C','s','sent','regular',?)`).run(now()).lastInsertRowid)
    sqlite.prepare(`INSERT INTO sends (campaign_id, contact_id, email, status) VALUES (?, ?, 'me@x.com', 'sent')`).run(camp, cid)
    const exp = exportContactData(cid)!
    expect((exp.contact as any).email).toBe('me@x.com')
    expect(exp.emails).toHaveLength(1)
    eraseContact(cid)
    expect(sqlite.prepare('SELECT 1 FROM contacts WHERE id = ?').get(cid)).toBeUndefined()
    expect((sqlite.prepare('SELECT email FROM sends').get() as any).email).toMatch(/@erased\.invalid$/)
    expect(getSuppression('me@x.com')).not.toBeNull()
    expect(subscribeContact({ raw: { email: 'me@x.com' }, source: 't' }).status).not.toBe('subscribed')
  })
})

void env
