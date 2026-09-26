import { assertPublicHttpUrl } from '~/server/utils/ssrf-guard'

// fetch() for user-supplied URLs: public hosts only, every redirect hop
// re-validated, size-capped body.
export async function safeFetch(url: string, opts: { maxBytes?: number; timeoutMs?: number; accept?: string } = {}): Promise<{ url: string; status: number; contentType: string; body: Buffer }> {
  let current = await assertPublicHttpUrl(url)
  const maxBytes = opts.maxBytes ?? 3 * 1024 * 1024
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TurboMailer/1.0; +brand-kit)',
        Accept: opts.accept ?? 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('Redirect without Location')
      current = await assertPublicHttpUrl(new URL(loc, current).href)
      continue
    }
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > maxBytes) throw new Error('Response too large')
    const reader = res.body?.getReader()
    const chunks: Buffer[] = []
    let total = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        if (total > maxBytes) { await reader.cancel(); break }
        chunks.push(Buffer.from(value))
      }
    }
    return { url: current.href, status: res.status, contentType: res.headers.get('content-type') || '', body: Buffer.concat(chunks) }
  }
  throw new Error('Too many redirects')
}
