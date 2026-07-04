import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// SSRF protection for server-side fetches of user-supplied URLs.
// Blocks non-HTTP schemes and any host resolving to private/reserved ranges.

const PRIVATE_V4 = [
  /^0\./,                          // "this" network
  /^10\./,                         // private
  /^127\./,                        // loopback
  /^169\.254\./,                   // link-local / cloud metadata
  /^172\.(1[6-9]|2\d|3[01])\./,    // private
  /^192\.168\./,                   // private
  /^192\.0\.0\./,                  // IETF protocol assignments
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
]

// Converts an IPv4-mapped IPv6 tail to dotted form.
// Handles both "::ffff:10.0.0.1" and the URL-normalized hex form "::ffff:a00:1".
function mappedV4(addr: string): string | null {
  const m = /^::ffff:(.+)$/i.exec(addr)
  if (!m) return null
  const tail = m[1]
  if (isIP(tail) === 4) return tail
  const groups = tail.split(':')
  if (groups.length > 2 || groups.some(g => !/^[0-9a-f]{1,4}$/i.test(g))) return null
  const n = groups.length === 2
    ? (parseInt(groups[0], 16) << 16 >>> 0) + parseInt(groups[1], 16)
    : parseInt(groups[0], 16)
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
}

function isPrivateAddress(addr: string): boolean {
  const v4 = isIP(addr) === 4 ? addr : mappedV4(addr)
  if (v4) return PRIVATE_V4.some(r => r.test(v4))
  const lower = addr.toLowerCase()
  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fe80:') ||   // link-local
    lower.startsWith('fc') ||      // unique local fc00::/7
    lower.startsWith('fd')
  )
}

/**
 * Validates that a URL is a public http(s) resource.
 * Resolves DNS and rejects if ANY resolved address is private/reserved.
 * Throws createError(400) on violation; returns parsed URL otherwise.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(String(rawUrl))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'Only http/https URLs allowed' })
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw createError({ statusCode: 400, statusMessage: 'URL resolves to a private address' })
    }
    return url
  }

  let addresses: { address: string }[]
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not resolve host' })
  }
  if (!addresses.length || addresses.some(a => isPrivateAddress(a.address))) {
    throw createError({ statusCode: 400, statusMessage: 'URL resolves to a private address' })
  }
  return url
}
