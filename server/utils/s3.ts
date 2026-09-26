import { createHash, createHmac } from 'node:crypto'

// Minimal S3 client (AWS Signature V4, path-style) — enough for off-site
// backups on AWS S3, Cloudflare R2, Backblaze B2, Wasabi or MinIO without
// pulling in the AWS SDK.

export interface S3Config {
  endpoint: string // https://s3.eu-west-1.amazonaws.com | https://<acct>.r2.cloudflarestorage.com | http://minio:9000
  region: string
  bucket: string
  accessKey: string
  secretKey: string
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest()

function encodeKey(key: string): string {
  return key.split('/').map(p => encodeURIComponent(p)).join('/')
}

function sign(cfg: S3Config, method: string, path: string, query: Record<string, string>, body: Buffer | string, extraHeaders: Record<string, string> = {}) {
  const url = new URL(cfg.endpoint.replace(/\/$/, '') + path)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256(body)
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  }
  const sortedQuery = Object.keys(query).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join('&')
  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map(h => `${h}:${String(headers[h]).trim()}\n`).join('')
  const canonicalRequest = [method, url.pathname, sortedQuery, canonicalHeaders, signedHeaderNames.join(';'), payloadHash].join('\n')
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n')
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${cfg.secretKey}`, dateStamp), cfg.region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`
  delete headers.host
  return { url: `${url.origin}${url.pathname}${sortedQuery ? `?${sortedQuery}` : ''}`, headers }
}

export async function s3Put(cfg: S3Config, key: string, body: Buffer, contentType = 'application/octet-stream'): Promise<void> {
  const { url, headers } = sign(cfg, 'PUT', `/${cfg.bucket}/${encodeKey(key)}`, {}, body, { 'content-type': contentType })
  const res = await fetch(url, { method: 'PUT', headers, body, signal: AbortSignal.timeout(300_000) })
  if (!res.ok) throw new Error(`S3 PUT ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

export async function s3List(cfg: S3Config, prefix: string): Promise<{ key: string; size: number; lastModified: string }[]> {
  const { url, headers } = sign(cfg, 'GET', `/${cfg.bucket}`, { 'list-type': '2', prefix }, '')
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`S3 LIST ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const xml = await res.text()
  return [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(m => ({
    key: m[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? '',
    size: Number(m[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0),
    lastModified: m[1].match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? '',
  }))
}

export async function s3Delete(cfg: S3Config, key: string): Promise<void> {
  const { url, headers } = sign(cfg, 'DELETE', `/${cfg.bucket}/${encodeKey(key)}`, {}, '')
  const res = await fetch(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(30_000) })
  if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${res.status}`)
}

export async function s3Get(cfg: S3Config, key: string): Promise<Buffer> {
  const { url, headers } = sign(cfg, 'GET', `/${cfg.bucket}/${encodeKey(key)}`, {}, '')
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(300_000) })
  if (!res.ok) throw new Error(`S3 GET ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export function s3ConfigFrom(config: Record<string, any>): S3Config | null {
  const c = {
    endpoint: String(config.s3Endpoint || '').trim(),
    region: String(config.s3Region || 'auto').trim() || 'auto',
    bucket: String(config.s3Bucket || '').trim(),
    accessKey: String(config.s3AccessKey || '').trim(),
    secretKey: String(config.s3SecretKey || '').trim(),
  }
  return c.endpoint && c.bucket && c.accessKey && c.secretKey ? c : null
}
