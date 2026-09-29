import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { replaceInHtml, replaceInText, type TextEdit } from '~/server/utils/email-repair'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Applies the AI review's corrections (find → replace on the subject,
// preheader or visible text). Each edit reports whether it matched; the
// previous content comes back so the UI can undo.

const EDITABLE: ('draft' | 'scheduled' | 'paused')[] = ['draft', 'scheduled', 'paused']
const TARGETS = new Set(['subject', 'subjectB', 'preheader', 'body'])
const MAX_EDITS = 30

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ edits?: unknown }>(event)
  const raw = Array.isArray(body?.edits) ? body.edits.slice(0, MAX_EDITS) : []
  const edits: TextEdit[] = raw.map((e: any) => ({
    target: TARGETS.has(e?.target) ? e.target : 'body',
    find: String(e?.find ?? '').slice(0, 500),
    replace: String(e?.replace ?? '').slice(0, 2000),
    occurrence: Math.max(0, Math.min(1000, Math.floor(Number(e?.occurrence) || 0))),
  }))
  if (!edits.length) throw createError({ statusCode: 400, statusMessage: 'No hay correcciones que aplicar' })

  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id))
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (!EDITABLE.includes(c.status as typeof EDITABLE[number])) {
    throw createError({ statusCode: 409, statusMessage: 'Solo se pueden editar campañas en borrador, programadas o pausadas' })
  }

  const next = { subject: c.subject || '', subjectB: c.subjectB, preheader: c.preheader, templateHtml: c.templateHtml || '' }
  const applied: number[] = []
  const failed: number[] = []
  edits.forEach((edit, i) => {
    let hits = 0
    if (edit.target === 'body') {
      const r = replaceInHtml(next.templateHtml, edit)
      next.templateHtml = r.html
      hits = r.hits
    } else {
      const field = edit.target
      const current = next[field]
      if (current) {
        const r = replaceInText(current, edit)
        next[field] = r.text
        hits = r.hits
      }
      // The assembled HTML carries its own hidden copy of the preheader
      if (field === 'preheader') {
        const r = replaceInHtml(next.templateHtml, edit)
        next.templateHtml = r.html
        hits += r.hits
      }
    }
    ;(hits ? applied : failed).push(i)
  })
  if (!applied.length) return { applied, failed, previous: null }

  const [row] = await db.update(campaigns).set({
    subject: next.subject.trim().slice(0, 255),
    subjectB: next.subjectB?.trim().slice(0, 255) || null,
    preheader: next.preheader?.trim().slice(0, 255) || null,
    templateHtml: next.templateHtml ? sanitizeEmailHtml(next.templateHtml) : null,
  }).where(and(eq(campaigns.id, id), inArray(campaigns.status, EDITABLE))).returning({ id: campaigns.id })
  if (!row) throw createError({ statusCode: 409, statusMessage: 'La campaña ya no se puede editar' })

  logAudit('campaign.ai_edits_applied', { campaignId: id, applied: applied.length, failed: failed.length }, getClientIp(event))
  return {
    applied,
    failed,
    previous: { subject: c.subject, subjectB: c.subjectB, preheader: c.preheader, templateHtml: c.templateHtml },
  }
})
