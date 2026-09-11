import assert from 'node:assert/strict'

// Run against an isolated server with a fresh empty data directory, never a live campaign database.
const base = process.env.TM_TEST_URL || 'http://127.0.0.1:3102'
for (const path of ['/login', '/dashboard', '/api/auth/check', '/api/campaigns', '/api/contacts']) {
  const response = await fetch(`${base}${path}`, { redirect: 'manual' })
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', path)
  assert.equal(response.headers.get('cache-control'), 'private, no-store', path)
  if (path.startsWith('/api/')) {
    assert.ok([401, 503].includes(response.status), `Anonymous request blocked: ${path}`)
  } else {
    assert.equal(response.status, 200, path)
    assert.match(await response.text(), /<meta name="robots" content="noindex, nofollow">/)
  }
}
const robots = await (await fetch(`${base}/robots.txt`)).text()
assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots), 'Crawlers must be able to read noindex')
console.log('Privacy checks passed: noindex, no-store and anonymous API access restrictions.')
