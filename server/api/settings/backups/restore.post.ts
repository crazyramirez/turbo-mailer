import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { readZip } from '~/server/utils/zip'
import { decryptBackup } from '~/server/utils/backup'
import { dataDir } from '~/server/utils/data-dir'
import { dbPath } from '~/server/db/index'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Stages a restore from an uploaded backup (.zip, or the encrypted .zip.enc
// from S3). The database is validated, written as restore-pending.db and
// swapped in on the next start (db/index.ts), keeping the current DB as
// pre-restore-<ts>.db. Templates/uploads are restored immediately if asked.
export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  const file = form?.find(f => f.name === 'file' && f.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'Sube un archivo de backup' })
  const withFiles = form?.find(f => f.name === 'withFiles')?.data.toString() === 'true'

  let zipBuf = file.data
  if (/\.enc$/i.test(file.filename || '')) {
    try {
      zipBuf = decryptBackup(file.data, useServerConfig())
    } catch (err: any) {
      throw createError({ statusCode: 400, statusMessage: `No se pudo descifrar: ${err?.message}` })
    }
  }

  let entries
  try {
    entries = readZip(zipBuf)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'El archivo no es un backup ZIP válido' })
  }
  const dbEntry = entries.find(e => e.name === 'turbomailer.db')
  if (!dbEntry) throw createError({ statusCode: 400, statusMessage: 'El backup no contiene turbomailer.db' })

  // Validate the database before staging it
  const tmp = path.join(dataDir, `restore-check-${Date.now()}.db`)
  writeFileSync(tmp, dbEntry.data())
  let stats: Record<string, number> = {}
  try {
    const check = new Database(tmp, { readonly: true })
    const ok = (check.prepare('PRAGMA integrity_check').get() as any)?.integrity_check
    if (ok !== 'ok') throw new Error(`integrity_check: ${ok}`)
    for (const t of ['contacts', 'campaigns', 'sends', 'lists']) {
      stats[t] = (check.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as any).n
    }
    check.close()
  } catch (err: any) {
    try { unlinkSync(tmp) } catch {}
    throw createError({ statusCode: 400, statusMessage: `Base de datos del backup no válida: ${err?.message}` })
  }
  const pending = path.join(path.dirname(dbPath), 'restore-pending.db')
  try { unlinkSync(pending) } catch {}
  writeFileSync(pending, dbEntry.data())
  try { unlinkSync(tmp) } catch {}

  let restoredFiles = 0
  if (withFiles) {
    for (const e of entries) {
      const m = e.name.match(/^(templates|uploads)\/(.+)$/)
      if (!m) continue
      const rel = path.normalize(m[2])
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue
      const dest = path.join(dataDir, m[1], rel)
      if (!dest.startsWith(path.join(dataDir, m[1]))) continue
      mkdirSync(path.dirname(dest), { recursive: true })
      writeFileSync(dest, e.data())
      restoredFiles++
    }
  }

  logAudit('backup.restore_staged', { file: file.filename, stats, restoredFiles }, getClientIp(event))
  return { ok: true, stats, restoredFiles, restartRequired: true }
})
