import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'

const TABLES_DELETE_ORDER = [
  'tracking_events',
  'sends',
  'list_contacts',
  'campaigns',
  'contacts',
  'lists',
]

const TABLES_INSERT_ORDER = [
  'lists',
  'contacts',
  'campaigns',
  'list_contacts',
  'sends',
  'tracking_events',
]

export default defineEventHandler(async () => {
  const cwd = process.cwd()
  const demoPath = resolve(cwd, 'data', 'turbomailer_demo.db')
  const mainPath = resolve(cwd, 'data', 'turbomailer.db')

  if (!existsSync(demoPath)) {
    throw createError({ statusCode: 404, message: 'Demo database not found at data/turbomailer_demo.db' })
  }

  // Open a separate connection so the drizzle singleton keeps running
  const conn = new Database(mainPath)
  conn.pragma('journal_mode = WAL')

  try {
    conn.pragma('foreign_keys = OFF')
    // Normalize path separators for SQLite ATTACH (forward slashes required)
    const demoPathNorm = demoPath.replace(/\\/g, '/')
    conn.exec(`ATTACH DATABASE '${demoPathNorm}' AS demo`)

    conn.exec('BEGIN')

    for (const table of TABLES_DELETE_ORDER) {
      conn.exec(`DELETE FROM main."${table}"`)
    }

    for (const table of TABLES_INSERT_ORDER) {
      conn.exec(`INSERT INTO main."${table}" SELECT * FROM demo."${table}"`)
    }

    // Reset AUTOINCREMENT sequences
    try {
      conn.exec(`DELETE FROM main.sqlite_sequence`)
      conn.exec(`INSERT OR IGNORE INTO main.sqlite_sequence SELECT * FROM demo.sqlite_sequence`)
    } catch {
      // sqlite_sequence may not exist if demo is pristine
    }

    conn.exec('COMMIT')
  } catch (err) {
    try { conn.exec('ROLLBACK') } catch {}
    conn.exec('DETACH DATABASE demo')
    conn.pragma('foreign_keys = ON')
    conn.close()
    throw createError({ statusCode: 500, message: `Failed to load demo data: ${(err as Error).message}` })
  }

  conn.exec('DETACH DATABASE demo')
  conn.pragma('foreign_keys = ON')
  conn.close()

  // Copy demo template to templates folder
  const sourceTemplate = resolve(cwd, 'data', 'demo', 'email_demo.html')
  const targetDir = resolve(cwd, 'data', 'templates')
  const targetTemplate = resolve(targetDir, 'email_demo.html')

  try {
    if (existsSync(sourceTemplate)) {
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
      }
      copyFileSync(sourceTemplate, targetTemplate)
    }
  } catch (err) {
    console.error('Failed to copy demo template:', err)
    // We don't throw here to not break the whole process if only the template copy fails,
    // although the user might prefer it to fail. Given the context, it's better to log.
  }

  return { ok: true }
})
