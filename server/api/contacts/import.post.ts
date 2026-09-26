import { sqlite } from '~/server/db/index'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'
import { suppressedAmong, emailHash, type SuppressionReason } from '~/server/utils/suppression'
import { sanitizeCustomValues } from '~/server/utils/custom-fields'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

type ImportMode = 'upsert' | 'skipExisting' | 'updateOnly'

const FIELDS = ['name', 'company', 'role', 'phone', 'linkedin', 'url', 'youtube', 'instagram'] as const

// Bulk import (the UI sends big files in chunks of ≤5000 rows).
//
// Rules that keep a list clean and legal:
// - Existing contacts keep their status: an import never re-subscribes
//   someone who unsubscribed or bounced.
// - New addresses on the suppression list are created with the matching
//   non-active status (or skipped), never as active.
// - Empty cells don't wipe existing data; custom fields are merged.
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { rows, listId, importMode = 'upsert', tags, source } = (body ?? {}) as {
    rows: any[]; listId?: number; importMode?: ImportMode; tags?: string[]; source?: string
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'rows array required' })
  }
  if (rows.length > 5000) {
    throw createError({ statusCode: 400, statusMessage: 'Maximum 5000 rows per import' })
  }
  if (!['upsert', 'skipExisting', 'updateOnly'].includes(importMode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid importMode' })
  }
  const list = listId ? Number(listId) : null
  if (list && !sqlite.prepare('SELECT 1 FROM lists WHERE id = ?').get(list)) {
    throw createError({ statusCode: 400, statusMessage: 'List not found' })
  }
  const extraTags = (Array.isArray(tags) ? tags : []).map(t => String(t).trim().slice(0, 50)).filter(Boolean).slice(0, 20)
  const src = `import${source ? `:${String(source).slice(0, 80)}` : ''}`

  // Validate, sanitize and de-duplicate within the file (last row wins)
  const byEmail = new Map<string, { fields: ReturnType<typeof sanitizeContactFields>; custom: Record<string, unknown>; tags: string[] }>()
  let invalidCount = 0
  let duplicatesInFile = 0
  for (const row of rows) {
    const fields = sanitizeContactFields(row ?? {})
    if (!fields.email || !isValidEmail(fields.email)) { invalidCount++; continue }
    if (byEmail.has(fields.email)) duplicatesInFile++
    const custom = row?.custom && typeof row.custom === 'object' ? sanitizeCustomValues(row.custom) : {}
    const rowTags = typeof row?.tags === 'string' ? row.tags.split(/[,;|]/) : Array.isArray(row?.tags) ? row.tags : []
    byEmail.set(fields.email, {
      fields,
      custom,
      tags: [...new Set([...rowTags.map((t: unknown) => String(t).trim().slice(0, 50)).filter(Boolean), ...extraTags])],
    })
  }
  const valid = [...byEmail.values()]
  const suppressed = suppressedAmong(valid.map(v => v.fields.email))
  const reasonOf = sqlite.prepare('SELECT reason FROM suppressions WHERE email_hash = ?')

  const findStmt = sqlite.prepare('SELECT id, tags, custom FROM contacts WHERE email = ? COLLATE NOCASE')
  const insertStmt = sqlite.prepare(
    `INSERT INTO contacts (email, name, company, role, phone, linkedin, url, youtube, instagram, tags, custom, source, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const linkStmt = sqlite.prepare('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) VALUES (?, ?)')

  let inserted = 0
  let updated = 0
  let duplicates = 0
  let skipped = 0
  let suppressedCount = 0
  const now = Math.floor(Date.now() / 1000)

  sqlite.transaction(() => {
    for (const { fields, custom, tags: rowTags } of valid) {
      const existing = findStmt.get(fields.email) as { id: number; tags: string | null; custom: string | null } | undefined

      if (existing) {
        if (importMode === 'skipExisting') {
          duplicates++
          if (list) linkStmt.run(list, existing.id)
          continue
        }
        // Update only the non-empty cells; merge tags and custom fields
        const sets: string[] = []
        const args: unknown[] = []
        for (const f of FIELDS) {
          if (fields[f]) { sets.push(`${f} = ?`); args.push(fields[f]) }
        }
        if (rowTags.length) {
          const cur: string[] = (() => { try { return JSON.parse(existing.tags || '[]') } catch { return [] } })()
          sets.push('tags = ?')
          args.push(JSON.stringify([...new Set([...cur, ...rowTags])].slice(0, 50)))
        }
        const customEntries = Object.entries(custom).filter(([, v]) => v !== null && v !== '')
        if (customEntries.length) {
          const cur = (() => { try { return JSON.parse(existing.custom || '{}') || {} } catch { return {} } })()
          sets.push('custom = ?')
          args.push(JSON.stringify({ ...cur, ...Object.fromEntries(customEntries) }))
        }
        if (sets.length) {
          sets.push('updated_at = ?')
          args.push(now)
          sqlite.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...args, existing.id)
        }
        updated++
        if (list) linkStmt.run(list, existing.id)
        continue
      }

      if (importMode === 'updateOnly') { skipped++; continue }

      // New address: suppressed ones never come in as active
      let status = 'active'
      if (suppressed.has(emailHash(fields.email))) {
        const reason = (reasonOf.get(emailHash(fields.email)) as { reason: SuppressionReason } | undefined)?.reason
        status = reason === 'bounced' || reason === 'invalid' ? 'bounced' : 'unsubscribed'
        suppressedCount++
      }
      const customClean = Object.fromEntries(Object.entries(custom).filter(([, v]) => v !== null && v !== ''))
      const id = Number(insertStmt.run(
        fields.email, fields.name, fields.company, fields.role, fields.phone, fields.linkedin, fields.url, fields.youtube, fields.instagram,
        JSON.stringify(rowTags.slice(0, 50)), Object.keys(customClean).length ? JSON.stringify(customClean) : null,
        src, status, now, now,
      ).lastInsertRowid)
      inserted++
      if (list) linkStmt.run(list, id)
    }
  })()

  logAudit('contacts.import', {
    importMode, total: rows.length, inserted, updated, duplicates, skipped, invalidCount, suppressed: suppressedCount, duplicatesInFile, source: src,
  }, getClientIp(event))
  return { inserted, updated, duplicates, skipped, invalidCount, suppressed: suppressedCount, duplicatesInFile, total: rows.length }
})
