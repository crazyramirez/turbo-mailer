import { db, sqlite } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'
import { sanitizeTagFilter } from '~/server/utils/segment'
import { getSmtpProfiles } from '~/server/utils/mailer'

// Partial update: only keys PRESENT in the body change. Which keys are
// editable depends on the campaign state:
//
//   draft / scheduled  everything
//   paused             content only (name, subject, preheader, HTML...) — the
//                      recipient set is already materialized
//   sent               name only
//   sending            nothing (409) — pause first
//
// Status here only moves between draft and scheduled; pausing, resuming and
// manual overrides have their own endpoints.

const CONTENT_KEYS = ['name', 'subject', 'subjectB', 'preheader', 'templateHtml', 'templateName',
  'unsubEmailSubject', 'unsubEmailMessage', 'resubEmailSubject', 'resubEmailMessage'] as const

function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = (await readBody(event)) ?? {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  const [current] = await db.select().from(campaigns).where(eq(campaigns.id, id))
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  if (current.status === 'sending') {
    throw createError({ statusCode: 409, statusMessage: 'Campaign is sending — pause it before editing' })
  }

  const editable = new Set<string>(
    current.status === 'sent'
      ? ['name']
      : current.status === 'paused'
        ? CONTENT_KEYS
        : [...CONTENT_KEYS, 'listId', 'segmentId', 'topicId', 'tagFilter', 'abSamplePct', 'abWaitMinutes',
            'followUpSubject', 'followUpDelayHours', 'senderProfileId', 'stoEnabled', 'ignoreSunset',
            'utmParams', 'status', 'scheduledAt'],
  )

  const patch: Record<string, unknown> = {}
  const set = (key: string, value: unknown) => {
    if (has(key) && editable.has(key)) patch[key] = value
  }

  if (has('name') && !str(body.name, 255)) throw createError({ statusCode: 400, statusMessage: 'name required' })
  set('name', str(body.name, 255))
  set('subject', str(body.subject, 255) ?? '')
  set('subjectB', str(body.subjectB, 255))
  set('preheader', str(body.preheader, 255))
  set('templateName', str(body.templateName, 100))
  if (has('templateHtml')) set('templateHtml', body.templateHtml ? sanitizeEmailHtml(String(body.templateHtml)) : null)
  set('unsubEmailSubject', str(body.unsubEmailSubject, 255))
  set('unsubEmailMessage', str(body.unsubEmailMessage, 2000))
  set('resubEmailSubject', str(body.resubEmailSubject, 255))
  set('resubEmailMessage', str(body.resubEmailMessage, 2000))

  set('listId', body.listId ? Number(body.listId) : null)
  set('tagFilter', sanitizeTagFilter(body.tagFilter))
  set('abSamplePct', Math.min(50, Math.max(5, Number(body.abSamplePct) || 20)))
  set('abWaitMinutes', Math.min(7 * 24 * 60, Math.max(10, Number(body.abWaitMinutes) || 240)))
  set('followUpSubject', str(body.followUpSubject, 255))
  set('followUpDelayHours', Math.min(30 * 24, Math.max(1, Number(body.followUpDelayHours) || 48)))
  set('stoEnabled', Boolean(body.stoEnabled))
  set('ignoreSunset', Boolean(body.ignoreSunset))

  if (has('segmentId') && editable.has('segmentId')) {
    const segId = body.segmentId ? Number(body.segmentId) : null
    if (segId && !sqlite.prepare('SELECT 1 FROM segments WHERE id = ?').get(segId)) {
      throw createError({ statusCode: 400, statusMessage: 'Segment not found' })
    }
    patch.segmentId = segId
  }
  if (has('topicId') && editable.has('topicId')) {
    const topicId = body.topicId ? Number(body.topicId) : null
    if (topicId && !sqlite.prepare('SELECT 1 FROM topics WHERE id = ?').get(topicId)) {
      throw createError({ statusCode: 400, statusMessage: 'Topic not found' })
    }
    patch.topicId = topicId
  }
  if (has('senderProfileId') && editable.has('senderProfileId')) {
    const pid = str(body.senderProfileId, 64)
    if (pid && !getSmtpProfiles(useServerConfig()).some(p => p.id === pid)) {
      throw createError({ statusCode: 400, statusMessage: 'Sender profile not found' })
    }
    patch.senderProfileId = pid
  }
  if (has('utmParams') && editable.has('utmParams')) {
    const u = body.utmParams
    patch.utmParams = u && typeof u === 'object'
      ? {
          source: str(u.source, 100) ?? undefined,
          medium: str(u.medium, 100) ?? undefined,
          campaign: str(u.campaign, 100) ?? undefined,
        }
      : null
    const p = patch.utmParams as any
    if (p && !p.source && !p.medium && !p.campaign) patch.utmParams = null
  }

  if (editable.has('status') && has('status')) {
    const target = String(body.status)
    if (target === 'scheduled') {
      const when = body.scheduledAt ? new Date(body.scheduledAt) : current.scheduledAt
      if (!when || Number.isNaN(new Date(when).getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'scheduledAt required to schedule' })
      }
      if (new Date(when).getTime() < Date.now() - 60_000) {
        throw createError({ statusCode: 400, statusMessage: 'scheduledAt must be in the future' })
      }
      patch.status = 'scheduled'
      patch.scheduledAt = new Date(when)
    } else if (target === 'draft') {
      patch.status = 'draft'
      patch.scheduledAt = null
    }
    // Other targets are ignored here (see header comment)
  } else if (editable.has('scheduledAt') && has('scheduledAt') && current.status === 'scheduled') {
    const when = body.scheduledAt ? new Date(body.scheduledAt) : null
    if (when && !Number.isNaN(when.getTime())) patch.scheduledAt = when
  }

  if (Object.keys(patch).length === 0) return current

  const [row] = await db.update(campaigns).set(patch as any).where(eq(campaigns.id, id)).returning()
  return row
})
