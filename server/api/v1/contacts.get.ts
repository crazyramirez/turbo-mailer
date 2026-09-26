import { sqlite } from '~/server/db/index'
import { requireApiKey } from '~/server/utils/api-keys'
import { getSuppression } from '~/server/utils/suppression'

// GET /api/v1/contacts?email=… — one contact with its lists and suppression state.
export default defineEventHandler((event) => {
  requireApiKey(event, 'contacts:read')
  const email = String(getQuery(event).email || '').trim()
  if (!email) throw createError({ statusCode: 400, statusMessage: 'email query parameter is required' })
  const c = sqlite.prepare(
    `SELECT id, email, name, company, role, phone, tags, custom, status, locale, engagement_score AS engagementScore,
            created_at AS createdAt, last_engaged_at AS lastEngagedAt FROM contacts WHERE email = ? COLLATE NOCASE`,
  ).get(email) as any
  const suppression = getSuppression(email)
  if (!c) return { found: false, suppressed: suppression?.reason ?? null }
  const lists = sqlite.prepare('SELECT list_id AS id FROM list_contacts WHERE contact_id = ?').all(c.id).map((r: any) => r.id)
  const j = (v: any) => { try { return v ? JSON.parse(v) : null } catch { return null } }
  return {
    found: true,
    ...c,
    tags: j(c.tags) ?? [],
    custom: j(c.custom) ?? {},
    createdAt: c.createdAt ? new Date(c.createdAt * 1000).toISOString() : null,
    lastEngagedAt: c.lastEngagedAt ? new Date(c.lastEngagedAt * 1000).toISOString() : null,
    listIds: lists,
    suppressed: suppression?.reason ?? null,
  }
})
