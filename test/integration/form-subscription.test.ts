import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as h3 from 'h3'

const env = await vi.hoisted(async () => {
  const { bootIsolatedEnv } = await import('./harness')
  return bootIsolatedEnv({ doubleOptIn: false })
})
const sendSystemEmail = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('~/server/utils/mailer', () => ({ sendSystemEmail }))

for (const key of ['defineEventHandler', 'readBody', 'getRouterParam', 'getHeader', 'getQuery', 'setHeader', 'setResponseStatus'] as const) {
  vi.stubGlobal(key, h3[key])
}

const { sqlite } = await import('~/server/db/index')
const { formToken } = await import('~/server/utils/forms')
const { signConfirmToken } = await import('~/server/utils/auth')
const { suppress } = await import('~/server/utils/suppression')
const router = h3.createRouter()
router.post('/api/audience/forms', (await import('~/server/api/audience/forms/index.post')).default)
router.post('/api/forms/:publicId/submit', (await import('~/server/api/forms/[publicId]/submit.post')).default)
router.get('/api/contacts', (await import('~/server/api/contacts/index.get')).default)
router.put('/api/contacts/:id', (await import('~/server/api/contacts/[id].put')).default)
router.get('/api/confirm', (await import('~/server/api/confirm.get')).default)
router.post('/api/confirm', (await import('~/server/api/confirm.post')).default)
const handle = h3.toWebHandler(h3.createApp().use(router))

function request(path: string, body?: Record<string, unknown>, method = 'POST') {
  return handle(new Request(`http://localhost${path}`, body ? {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  } : undefined))
}

async function createForm(doubleOptIn: boolean) {
  const response = await request('/api/audience/forms', {
    name: 'Newsletter', doubleOptIn,
    fields: [{ key: 'email', label: 'Email', type: 'email', required: true }],
  })
  expect(response.status).toBe(200)
  return response.json() as Promise<{ publicId: string }>
}

async function submit(publicId: string, email: string) {
  // Generate a valid token from three seconds ago to respect the real anti-bot gate.
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 3000)
  let token: string
  try { token = formToken(publicId) } finally { clock.mockRestore() }
  const response = await request(`/api/forms/${publicId}/submit`, { email, __t: token })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true })
}

function savedContact(email: string) {
  return sqlite.prepare('SELECT id, email, name, status FROM contacts WHERE email = ?').get(email) as
    { id: number; email: string; name: string | null; status: string } | undefined
}

beforeEach(() => {
  env.cfg.doubleOptIn = false
  sendSystemEmail.mockClear()
  sqlite.exec('DELETE FROM forms; DELETE FROM contacts; DELETE FROM suppressions; DELETE FROM consent_log; DELETE FROM audit_log;')
})
afterAll(() => {
  sqlite.close()
  vi.unstubAllGlobals()
})

describe('public form subscription status', () => {
  it('creates an active contact when the form disables confirmation, even if the global setting enables it', async () => {
    env.cfg.doubleOptIn = true
    const form = await createForm(false)
    await submit(form.publicId, 'active@example.com')
    expect(savedContact('active@example.com')?.status).toBe('active')
    expect(sendSystemEmail).not.toHaveBeenCalled()
    const response = await request('/api/contacts?status=active')
    expect(await response.json()).toMatchObject({ total: 1, data: [{ email: 'active@example.com', status: 'active' }] })
  })

  it('keeps double opt-in contacts inactive until explicit confirmation and separate from bounced contacts', async () => {
    const form = await createForm(true)
    await submit(form.publicId, 'pending@example.com')
    const contact = savedContact('pending@example.com')!
    expect(contact.status).toBe('inactive')
    expect(sendSystemEmail).toHaveBeenCalledTimes(1)
    const inactive = await request('/api/contacts?status=inactive')
    expect(await inactive.json()).toMatchObject({ total: 1, data: [{ status: 'inactive', suppressed: null }] })
    const bounced = await request('/api/contacts?status=bounced')
    expect(await bounced.json()).toMatchObject({ total: 0, data: [] })

    const token = signConfirmToken(contact.id, env.cfg.unsubscribeSecret)
    const preview = await request(`/api/confirm?c=${contact.id}&t=${token}`)
    expect(preview.status).toBe(200)
    expect(savedContact(contact.email)?.status).toBe('inactive')
    const confirm = await request('/api/confirm', { c: contact.id, t: token })
    expect(confirm.status).toBe(200)
    expect(savedContact(contact.email)?.status).toBe('active')
  })

  it('preserves an inactive status when editing contact details', async () => {
    const form = await createForm(true)
    await submit(form.publicId, 'edit@example.com')
    const contact = savedContact('edit@example.com')!
    const response = await request(`/api/contacts/${contact.id}`, { ...contact, name: 'Updated' }, 'PUT')
    expect(response.status).toBe(200)
    expect(savedContact(contact.email)).toMatchObject({ name: 'Updated', status: 'inactive' })
  })

  it.each(['bounced', 'complained'] as const)('does not activate addresses suppressed as %s', async (reason) => {
    const form = await createForm(false)
    suppress('blocked@example.com', reason)
    await submit(form.publicId, 'blocked@example.com')
    expect(savedContact('blocked@example.com')).toBeUndefined()
    expect(sendSystemEmail).not.toHaveBeenCalled()
  })
})
