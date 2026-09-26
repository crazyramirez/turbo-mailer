import { sqlite } from '~/server/db/index'
import { verifyMany } from '~/server/utils/email-verify'
import { suppress } from '~/server/utils/suppression'

// Background list verification (one job at a time, progress in memory).

export interface VerifyJob {
  running: boolean
  total: number
  done: number
  counts: { valid: number; risky: number; invalid: number }
  startedAt: string
  finishedAt: string | null
  error: string | null
}

let job: VerifyJob | null = null

export function verifyJobStatus(): VerifyJob | null {
  return job
}

export function startVerifyJob(opts: { listId?: number | null; onlyUnverified?: boolean; suppressInvalid?: boolean }): VerifyJob {
  if (job?.running) throw createError({ statusCode: 409, statusMessage: 'Ya hay una verificación en curso' })
  const where: string[] = [`c.status IN ('active', 'inactive')`]
  const params: unknown[] = []
  if (opts.listId) { where.push('c.id IN (SELECT contact_id FROM list_contacts WHERE list_id = ?)'); params.push(opts.listId) }
  if (opts.onlyUnverified) where.push('c.verification IS NULL')
  const rows = sqlite.prepare(`SELECT c.id, c.email FROM contacts c WHERE ${where.join(' AND ')}`).all(...params) as { id: number; email: string }[]

  job = { running: true, total: rows.length, done: 0, counts: { valid: 0, risky: 0, invalid: 0 }, startedAt: new Date().toISOString(), finishedAt: null, error: null }
  const current = job

  void (async () => {
    try {
      const upd = sqlite.prepare('UPDATE contacts SET verification = ? WHERE id = ?')
      // Chunks keep memory flat and persist progress as we go
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500)
        const res = await verifyMany(chunk.map(r => r.email), 8)
        sqlite.transaction(() => {
          for (const r of chunk) {
            const v = res.get(r.email)
            if (!v) continue
            upd.run(JSON.stringify(v), r.id)
            current.counts[v.status]++
            if (v.status === 'invalid' && opts.suppressInvalid) suppress(r.email, 'invalid', v.reasons.join(','), 'verification')
          }
        })()
        current.done = Math.min(rows.length, i + chunk.length)
      }
    } catch (err: any) {
      current.error = String(err?.message || err)
    } finally {
      current.running = false
      current.finishedAt = new Date().toISOString()
    }
  })()

  return job
}
