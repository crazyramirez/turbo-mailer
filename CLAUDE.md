# TurboMailer — Project Notes

## Stack

Nuxt 3 (SSR: false, SPA), Nitro server, SQLite + Drizzle ORM (migrations in
`server/db/migrations`, generated with `drizzle-kit generate`), Nodemailer,
better-sqlite3, imapflow + mailparser, sharp, official Anthropic SDK. Tests:
vitest (`test/unit`, `test/integration` with an isolated DATA_DIR per run).

`DATA_DIR` relocates all runtime data (db, config.json, templates, uploads,
backups). Never point tests or manual experiments at the real `data/`.

## Deployment constraint: persistent Node process only

The send engine (`server/utils/send-engine.ts`) and the scheduler
(`server/plugins/scheduler.ts` + `server/utils/jobs.ts`) run inside the Node
process. Works on a VPS, bare metal or Docker (`Dockerfile`,
`docker-compose.yml`; set `ENCRYPTION_KEY`, data in the `/data` volume).

**Do not deploy on serverless platforms** (Vercel, Netlify Functions, Lambda,
Workers): background sends and jobs would be killed. Serverless would need a
real queue (BullMQ + Redis, pg-boss, Inngest…) behind `startCampaign()`.

## Send engine

- One run per campaign (`runs` map). Sends are claimed atomically
  `pending → sending` (UPDATE…RETURNING); eligibility (status, suppression,
  topic, frequency, sunset) is re-checked per send.
- SMTP errors are classified (`smtp-classify.ts`): connection/auth/rate-limit
  pause or fail over to backup sender profiles; soft bounces retry with backoff;
  hard bounces suppress; policy blocks (5.7.x) never mark the contact bounced.
- Circuit breaker pauses the campaign (`pause_reason`) on bounce/block/complaint
  rates, SMTP outage or provider throttling. Global, per-profile and
  per-provider pacers + warm-up daily caps.
- Crash recovery: a send left in `sending` is closed as `failed` (at-most-once,
  never a duplicate); campaigns left in `sending` auto-resume after boot —
  except `ab_phase = 'waiting'`, which idles until the scheduler picks the winner.

## Email output quality

- `finalizeEmailHtml` (email-compile.ts) runs at send/precheck time only:
  Outlook ghost table, bulletproof buttons, and `emailSafeCss` (var()/calc()
  out of `<style>`, inline var() resolved, no transitions, solid fallback
  before each inline rgba()). Stored/editor HTML keeps the original CSS.
- `repairEmailHtml` (email-repair.ts) persists fixes into the template:
  duplicate modules, double-escaped alt, "haz clic aquí" unsubscribe, WebP →
  JPEG/PNG, cover images cropped to their box + width/height attrs estimated
  at Outlook's 800px. Precheck shows a dry run; `POST /campaigns/:id/repair`
  applies it; the AI assistants call `/api/email/repair` on every draft.
- AI review issues carry `edit` (find/replace); `POST /campaigns/:id/apply-edits`
  applies them to visible text nodes only. Both endpoints return `previous`
  for undo.
- Empty merge tags tidy their punctuation (`{{Empresa}}, ¿qué…` → `¿Qué…`).

## Campaign status machine

Only `draft | scheduled | paused` are writable via PUT (partial updates;
fields not sent are untouched). `sending` and `sent` are set by the engine.

## A/B subject test

`subjectB` → `setupCampaignSends` (send-setup.ts) sends a random sample split
50/50 (`sends.variant`), holds the rest as `held`. After `abWaitMinutes` the
scheduler picks the winner with `pickAbWinner` (ab-stats.ts): clicks first,
then confirmed opens, only if p < 0.05 — otherwise A. Needs ≥10 recipients.

## Audience

- Suppression list (`suppressions`, SHA-256 of the email) is the source of
  truth for "never email again": survives contact deletion and re-imports.
  Manual create/edit returns 409 `suppressed:<reason>` unless `liftSuppression`;
  complaints can't be lifted from the contact screen. Imports never activate a
  suppressed address and never change an existing contact's status.
- Segments (`segments.ts`): rule tree → parameterized SQL, whitelisted fields,
  `custom.<key>` via json_extract. Evaluated at send time. AI can build them
  (`/api/ai/segment`, output validated by the same compiler).
- Custom fields, topics (preference center), hosted forms (`/f/:id`, public
  submit under `/api/forms/`; admin CRUD is `/api/audience/forms`).

## Automations

Step tree with cursors like `2.yes.0` (`automation-engine.ts`), runs in
`automation_runs`, processed every minute. Each email step has a hidden
carrier campaign (`kind = 'automation'`) so sends go through the normal
engine (suppression, DKIM, tracking, breaker). Triggers come from
`emitContactEvent` (subscribed, list/tag/form, open/click, API event) plus a
daily date trigger job.

## Auth model

- No users → legacy single-password mode (`appPassword`), sessions act as owner.
- Team accounts (Settings → Account & team → activate): email + password +
  optional TOTP 2FA (RFC 6238, replay-protected, 10 hashed recovery codes).
  Roles owner > admin > editor > viewer, enforced centrally in
  `server/middleware/auth.ts` via `requiredRoleFor()` (users.ts): reads = viewer,
  writes = editor, settings/users/reset/audit = admin. Owner-only: manage owners.
- Sessions (7 days) and rotating refresh tokens in SQLite, bound to `user_id`.
  Disabling a user, resetting a password or enabling 2FA revokes their sessions.
- Login rate limit in `login_attempts` (per IP, survives restarts).
- Audit entries are attributed automatically (Nitro asyncContext → `useEvent()`).
- Public API v1: `tm_` keys (SHA-256 stored), scopes, 600 req/min,
  `Idempotency-Key` replay.

## HMAC signing

Public links are HMAC-signed with `UNSUBSCRIBE_SECRET` (purpose-derived keys):
open pixel, click redirect (open redirects blocked), unsubscribe (RFC 8058
one-click POST + scanner-safe GET confirmation page), preferences, DOI confirm.
Missing secret → 500, not silent failure. Opt-out tokens stay valid after
expiry (only for opting out).

## Settings & secrets

Everything editable goes through `settings-schema.ts` (whitelist + validation)
and `writeServerConfig()` (atomic write). Secrets in config.json are
AES-256-GCM encrypted with `ENCRYPTION_KEY` (falls back to hostname — set it!).
The API never returns secrets, only `{ set: true }`.

## AI

`server/utils/ai/provider.ts`: Anthropic (default `claude-opus-5`, SDK with
server-side fallbacks), OpenAI or any OpenAI-compatible endpoint. JSON-schema
outputs validated + one retry; usage per month in settings. Features: two-click
campaigns (SSE), subject lab, pre-send review, insights, ask-your-data (only
aggregated numbers reach the model), segments from text, brand kit from URL.

## Data limits

- Contact import: max 5000 rows per request (the UI chunks larger files)
- AI improve: max 100KB per request
- Template names: `[a-zA-Z0-9_-]`, max 100 chars (path traversal protection)
- Contact fields: email ≤254, name/company ≤255, phone ≤50, urls ≤500
- Backups: local + optional S3 (encrypted TMBK1), WAL-safe `.backup()`,
  restore is staged and applied on next start

## Security notes

- Template values are HTML-escaped; unknown merge tags render empty
- Stored HTML (campaigns, automations, templates) goes through `sanitizeEmailHtml`
- Outgoing HTTP (webhooks, brand extraction, link checks) is SSRF-guarded
- `timingSafeEqual` for every HMAC, token, API key and password comparison
- Uploads: SVG blocked, served with nosniff; CSP with hashed inline script
- `/api/metrics` (Prometheus) is off until a metrics token is set
