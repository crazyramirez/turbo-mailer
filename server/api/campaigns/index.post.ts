import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'
import { sqlite } from '~/server/db/index'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { name, subject, templateName, listId, status, scheduledAt,
    unsubEmailSubject, unsubEmailMessage, resubEmailSubject, resubEmailMessage } = body
  const templateHtml = body.templateHtml ? sanitizeEmailHtml(String(body.templateHtml)) : body.templateHtml

  if (!name?.trim()) throw createError({ statusCode: 400, statusMessage: 'name required' })
  if (!subject?.trim()) throw createError({ statusCode: 400, statusMessage: 'subject required' })
  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
  if (status === 'scheduled') {
    if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'scheduledAt required to schedule' })
    }
    if (scheduledDate.getTime() < Date.now() - 60_000) {
      throw createError({ statusCode: 400, statusMessage: 'scheduledAt must be in the future' })
    }
  }
  const segmentId = body.segmentId ? Number(body.segmentId) : null
  if (segmentId && !sqlite.prepare('SELECT 1 FROM segments WHERE id = ?').get(segmentId)) {
    throw createError({ statusCode: 400, statusMessage: 'Segment not found' })
  }

  const [row] = await db.insert(campaigns).values({
    name: name.trim(),
    subject: subject.trim(),
    subjectB: body.subjectB == null ? null : String(body.subjectB).trim().slice(0, 255) || null,
    followUpSubject: body.followUpSubject == null ? null : String(body.followUpSubject).trim().slice(0, 255) || null,
    templateName: templateName || null,
    templateHtml: templateHtml || null,
    listId: listId ? Number(listId) : null,
    segmentId,
    preheader: typeof body.preheader === 'string' ? body.preheader.trim().slice(0, 255) || null : null,
    status: status === 'scheduled' ? 'scheduled' : 'draft',
    createdAt: new Date(),
    unsubEmailSubject: unsubEmailSubject?.trim() || null,
    unsubEmailMessage: unsubEmailMessage?.trim() || null,
    resubEmailSubject: resubEmailSubject?.trim() || null,
    resubEmailMessage: resubEmailMessage?.trim() || null,
    // Explicitly reset stats and state for new/cloned campaigns
    totalRecipients: 0,
    sentCount: 0,
    openCount: 0,
    clickCount: 0,
    failCount: 0,
    startedAt: null,
    finishedAt: null,
    scheduledAt: scheduledDate,
  }).returning()

  return row
})
