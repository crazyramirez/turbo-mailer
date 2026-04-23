import archiver from 'archiver'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export async function createBackup(): Promise<string> {
  const cwd = process.cwd()
  const backupDir = path.join(cwd, 'data', 'backup')
  await fsp.mkdir(backupDir, { recursive: true })

  const ts = new Date()
    .toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .slice(0, 19)

  const zipPath = path.join(backupDir, `backup_${ts}.zip`)

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)

    const dbPath = path.join(cwd, 'data', 'turbomailer.db')
    if (fs.existsSync(dbPath)) {
      archive.file(dbPath, { name: 'turbomailer.db' })
    }

    const templatesDir = path.join(cwd, 'data', 'templates')
    if (fs.existsSync(templatesDir)) {
      archive.directory(templatesDir, 'templates')
    }

    archive.finalize()
  })

  return zipPath
}
