import Database from 'better-sqlite3'
import archiver from 'archiver'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { dataDir, dataPath } from '~/server/utils/data-dir'
import { s3ConfigFrom, s3Put, s3List, s3Delete } from '~/server/utils/s3'
import { configNumber } from '~/server/utils/serverConfig'
import { sendAlert } from '~/server/utils/alerts'
import { dbPath } from '~/server/db/index'

// Backups: consistent SQLite snapshot (online .backup(), WAL-safe) + config,
// templates and uploaded images, zipped. Kept locally (rotated) and, when S3
// is configured, uploaded ENCRYPTED (AES-256-GCM) off-site.

const MAGIC = Buffer.from('TMBK1')

export const backupDir = dataPath('backup')

function backupKey(config: Record<string, any>): Buffer {
  const pass = String(config.backupPassphrase || process.env.ENCRYPTION_KEY || '')
  if (!pass) throw new Error('Configura ENCRYPTION_KEY o una frase de cifrado de backups para copias externas')
  return scryptSync(pass, 'turbomailer-backup-v1', 32)
}

export function encryptBackup(buf: Buffer, config: Record<string, any>): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', backupKey(config), iv)
  const enc = Buffer.concat([cipher.update(buf), cipher.final()])
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc])
}

export function decryptBackup(buf: Buffer, config: Record<string, any>): Buffer {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('No es un backup cifrado de TurboMailer')
  const iv = buf.subarray(MAGIC.length, MAGIC.length + 12)
  const tag = buf.subarray(MAGIC.length + 12, MAGIC.length + 28)
  const decipher = createDecipheriv('aes-256-gcm', backupKey(config), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(buf.subarray(MAGIC.length + 28)), decipher.final()])
}

export async function createBackup(): Promise<string> {
  await fsp.mkdir(backupDir, { recursive: true })

  const ts = new Date().toISOString().replace('T', '_').replace(/:/g, '-').slice(0, 19)
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
    if (fs.existsSync(dbSnapshotPath)) archive.file(dbSnapshotPath, { name: 'turbomailer.db' })
    const cfg = path.join(dataDir, 'config.json')
    if (fs.existsSync(cfg)) archive.file(cfg, { name: 'config.json' })
    for (const dir of ['templates', 'uploads']) {
      const p = path.join(dataDir, dir)
      if (fs.existsSync(p)) archive.directory(p, dir)
    }
    archive.finalize()
  })

  await fsp.unlink(dbSnapshotPath).catch(() => {})
  await rotateLocal(configNumber(useServerConfig(), 'backupKeepLocal', 10))
  return zipPath
}

async function rotateLocal(keep: number): Promise<void> {
  try {
    const files = await fsp.readdir(backupDir)
    const zips = files.filter(f => f.startsWith('backup_') && f.endsWith('.zip')).sort()
    if (zips.length > keep) {
      await Promise.all(zips.slice(0, zips.length - keep).map(f => fsp.unlink(path.join(backupDir, f)).catch(() => {})))
    }
  } catch {}
}

export async function listLocalBackups() {
  try {
    const files = (await fsp.readdir(backupDir)).filter(f => /^backup_.*\.zip$/.test(f)).sort().reverse()
    return Promise.all(files.map(async f => {
      const st = await fsp.stat(path.join(backupDir, f))
      return { name: f, size: st.size, createdAt: st.mtime.toISOString() }
    }))
  } catch {
    return []
  }
}

/** Daily job: local backup + encrypted off-site copy when S3 is configured. */
export async function runScheduledBackup(): Promise<{ local: string; remote: string | null }> {
  const config = useServerConfig()
  let local: string
  try {
    local = await createBackup()
  } catch (err: any) {
    sendAlert('critical', 'Fallo en la copia de seguridad', String(err?.message || err), 'backup:local')
    throw err
  }
  const s3 = s3ConfigFrom(config)
  if (!s3) return { local, remote: null }
  try {
    const enc = encryptBackup(await fsp.readFile(local), config)
    const key = `turbomailer/${path.basename(local)}.enc`
    await s3Put(s3, key, enc)
    const keep = Math.max(1, configNumber(config, 's3Retention', 14))
    const remote = (await s3List(s3, 'turbomailer/backup_')).sort((a, b) => a.key.localeCompare(b.key))
    for (const old of remote.slice(0, Math.max(0, remote.length - keep))) await s3Delete(s3, old.key)
    return { local, remote: key }
  } catch (err: any) {
    sendAlert('critical', 'Fallo al subir la copia externa (S3)', String(err?.message || err), 'backup:s3')
    return { local, remote: null }
  }
}
