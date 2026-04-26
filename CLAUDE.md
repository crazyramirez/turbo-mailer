# Turbo-Mailer PRO — Project Notes

## Stack
Nuxt 3 (SSR: false, SPA), Nitro server, SQLite + Drizzle ORM, Nodemailer, better-sqlite3.

## Deployment constraint: persistent Node process only
Campaign sends run as a detached Promise inside the Nitro request handler.
This is intentional and works correctly on a traditional VPS or bare-metal server
where the Node process stays alive between requests.

**Do not deploy on serverless platforms** (Vercel, Netlify Functions, AWS Lambda, Cloudflare Workers).
The background send job will be killed when the function exits.
For serverless, replace `processCampaign(...).catch(...)` in
`server/api/campaigns/[id]/send.post.ts` with a proper job queue
(BullMQ + Redis, pg-boss, Inngest, etc.).

## Auth model
Single-user password auth. Session tokens stored in SQLite `sessions` table (24h TTL).
Rate limiting stored in SQLite `login_attempts` table — survives restarts.
All `/api/*` routes except login, track/open, track/click, unsubscribe require session cookie.

## HMAC signing
All public tracking links are HMAC-signed with `UNSUBSCRIBE_SECRET` (env var, required):
- `/api/track/open?s=ID&sig=...` — open pixel
- `/api/track/click?s=ID&u=URL&sig=...` — click redirect
- `/api/unsubscribe?s=ID&t=...` — unsubscribe link

Missing `UNSUBSCRIBE_SECRET` → 500 at runtime, not silent failure.

## Campaign status machine
Only `draft | scheduled | paused` are writable via PUT.
`sending` and `sent` are set exclusively by the send pipeline.
Campaigns stuck in `sending` after a crash are reset to `paused` on startup.

## Data limits
- Contact import: max 5000 rows per request
- AI improve: max 100KB per request
- Template names: `[a-zA-Z0-9_-]`, max 100 chars (path traversal protection)
- Contact fields: email ≤254, name/company ≤255, phone ≤50, urls ≤500
- Backups: max 10 kept in `data/backup/`, WAL-safe via `better-sqlite3 .backup()`

## Security notes
- `applyVars` HTML-escapes all contact values before substitution
- Open redirects blocked: only `http:`/`https:` and valid HMAC sig accepted
- Unsubscribe IDs not enumerable: requires valid HMAC token
- `timingSafeEqual` used for all HMAC comparisons and password check
