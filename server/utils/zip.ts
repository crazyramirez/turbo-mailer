import { inflateRawSync } from 'node:zlib'

// Minimal ZIP reader (stored + deflate, no zip64) — enough for our own backup
// archives and DMARC report attachments. Entry names are returned as-is;
// callers must validate them before touching the filesystem.

export interface ZipEntry {
  name: string
  data: () => Buffer
  size: number
}

export function readZip(buf: Buffer): ZipEntry[] {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt ZIP central directory')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf-8')
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    entries.push({
      name,
      size,
      data: () => {
        if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Corrupt ZIP entry')
        const ln = buf.readUInt16LE(localOffset + 26)
        const le = buf.readUInt16LE(localOffset + 28)
        const start = localOffset + 30 + ln + le
        const raw = buf.subarray(start, start + compSize)
        if (method === 0) return Buffer.from(raw)
        if (method === 8) return inflateRawSync(raw)
        throw new Error(`Unsupported ZIP compression method ${method}`)
      },
    })
  }
  return entries
}
