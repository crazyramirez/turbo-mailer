import Database from 'better-sqlite3'
import archiver from 'archiver'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const MAX_BACKUPS = 10

export async function createBackup(): Promise<string> {
  const cwd = process.cwd()
  const backupDir = path.join(cwd, 'data', 'backup')
  await fsp.mkdir(backupDir, { recursive: true })

  const ts = new Date()
    .toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .slice(0, 19)

  const dbPath = path.join(cwd, 'data', 'turbomailer.db')
  const dbSnapshotPath = path.join(backupDir, `snapshot_${ts}.db`)
  const zipPath = path.join(backupDir, `backup_${ts}.zip`)

  // WAL-safe consistent snapshot via better-sqlite3 .backup()
  if (fs.existsSync(dbPath)) {
    const src = new Database(dbPath, { readonly: true })
    await src.backup(dbSnapshotPath)
    src.close()
  }

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)

    if (fs.existsSync(dbSnapshotPath)) {
      archive.file(dbSnapshotPath, { name: 'turbomailer.db' })
    }

    const templatesDir = path.join(cwd, 'data', 'templates')
    if (fs.existsSync(templatesDir)) {
      archive.directory(templatesDir, 'templates')
    }

    archive.finalize()
  })

  // Remove the intermediate snapshot file
  await fsp.unlink(dbSnapshotPath).catch(() => {})

  // Rotate: keep only MAX_BACKUPS most recent
  await rotateBackups(backupDir)

  return zipPath
}

async function rotateBackups(backupDir: string): Promise<void> {
  try {
    const files = await fsp.readdir(backupDir)
    const zips = files
      .filter(f => f.startsWith('backup_') && f.endsWith('.zip'))
      .sort()

    if (zips.length > MAX_BACKUPS) {
      const toDelete = zips.slice(0, zips.length - MAX_BACKUPS)
      await Promise.all(toDelete.map(f => fsp.unlink(path.join(backupDir, f)).catch(() => {})))
    }
  } catch {
    // Non-fatal
  }
}
