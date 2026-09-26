import { sqlite } from '~/server/db/index'
import { suppress, normalizeEmail } from '~/server/utils/suppression'
import { isValidEmail } from '~/server/utils/validate'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Manually suppress addresses (e.g. a customer asked by phone to stop).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ emails?: string[] | string; note?: string }>(event)
  const raw = Array.isArray(body?.emails) ? body.emails : String(body?.emails ?? '').split(/[\s,;]+/)
  const emails = [...new Set(raw.map(e => normalizeEmail(e)).filter(e => e && isValidEmail(e)))].slice(0, 10_000)
  if (!emails.length) throw createError({ statusCode: 400, statusMessage: 'No valid emails' })

  const note = String(body?.note ?? '').slice(0, 200) || 'manual'
  const now = Math.floor(Date.now() / 1000)
  sqlite.transaction(() => {
    for (const e of emails) {
      suppress(e, 'manual', note, 'manual')
      sqlite.prepare(`UPDATE contacts SET status = 'unsubscribed', updated_at = ? WHERE email = ? COLLATE NOCASE AND status = 'active'`).run(now, e)
    }
  })()
  logAudit('suppression.add', { count: emails.length, note }, getClientIp(event))
  return { added: emails.length }
})
