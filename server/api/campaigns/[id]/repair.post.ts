import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { repairEmailHtml } from '~/server/utils/email-repair'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// One-click repair from the pre-send check (see email-repair.ts). Saves the
// repaired template and returns the previous one so the UI can undo.

const EDITABLE: ('draft' | 'scheduled' | 'paused')[] = ['draft', 'scheduled', 'paused']

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id))
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (!EDITABLE.includes(c.status as typeof EDITABLE[number])) {
    throw createError({ statusCode: 409, statusMessage: 'Solo se pueden reparar campañas en borrador, programadas o pausadas' })
  }
  if (!c.templateHtml?.trim()) throw createError({ statusCode: 400, statusMessage: 'La campaña no tiene contenido' })

  const { html, changes } = await repairEmailHtml(c.templateHtml, { localOrigin: String(useServerConfig().trackingBaseUrl || '') || null })
  if (!changes.length) return { changes, previous: null }

  // Images take a moment: only write if nobody edited or sent it meanwhile
  const [row] = await db.update(campaigns).set({ templateHtml: sanitizeEmailHtml(html) })
    .where(and(eq(campaigns.id, id), eq(campaigns.templateHtml, c.templateHtml), inArray(campaigns.status, EDITABLE)))
    .returning({ id: campaigns.id })
  if (!row) throw createError({ statusCode: 409, statusMessage: 'La campaña cambió mientras se reparaba; vuelve a intentarlo' })

  logAudit('campaign.repaired', { campaignId: id, changes }, getClientIp(event))
  return { changes, previous: { templateHtml: c.templateHtml } }
})
