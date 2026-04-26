# Turbo-Mailer PRO

Self-hosted email marketing tool. Manage contacts, build campaigns, send bulk emails, and track opens/clicks — all from your own server.

## Stack

- **Nuxt 3** (SPA mode) + **Nitro** server
- **SQLite** + **Drizzle ORM** (auto-migrations on startup)
- **Nodemailer** for SMTP delivery
- **i18n** ES/EN

## Requirements

- Node.js 18+
- A **persistent server process** (VPS, bare-metal, PM2, Docker). **Not compatible with serverless platforms** (Vercel, Netlify Functions, Lambda) — campaign sends run as background Node jobs that require a long-lived process.

## Quick start

```bash
cp .env.example .env
# Fill in .env (see Configuration below)
npm install
npm run dev
```

Open `http://localhost:3000` and log in with your `APP_PASSWORD`.

## Configuration

All settings via environment variables in `.env`:

```env
# Required
APP_PASSWORD=your-secret-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@example.com
SMTP_PASS=your-app-password
SMTP_SECURE=true
SMTP_FROM_NAME=Your Name
SMTP_FROM_EMAIL=you@example.com

# Required for tracking links and unsubscribe
TRACKING_BASE_URL=https://your-domain.com
UNSUBSCRIBE_SECRET=<generate with: openssl rand -hex 32>

# Optional
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
SMTP_SEND_DELAY_MS=200   # delay between emails (default 200ms)
```

> `UNSUBSCRIBE_SECRET` is required. The app throws 500 at runtime if missing.
> Generate a strong secret: `openssl rand -hex 32`

## Features

- **Contacts** — import CSV/Excel, full CRUD, list segmentation, export CSV
- **Campaigns** — 4-step wizard, HTML template editor with AI improve, preview
- **Sending** — bulk send with per-contact personalisation (`{{Name}}`, `{{Company}}`, etc.), background processing, 3-attempt retry, configurable SMTP delay
- **Pause / Resume** — pause a running campaign mid-send; resume picks up remaining recipients
- **Tracking** — open pixel + click redirect, both HMAC-signed. Stats: open rate, click rate, per-campaign breakdown
- **Unsubscribe** — HMAC-signed links, one-click opt-out, confirmation email
- **Analytics** — dashboard with KPI cards, recent opens, top campaigns
- **Templates** — save/load HTML templates, AI copywriting improvement
- **Backups** — automatic WAL-safe backup before any destructive reset, 10 backups retained

## Security

| Control | Implementation |
|---------|---------------|
| Auth | Single-password, session cookie (httpOnly, SameSite=strict, 24h TTL) |
| Sessions | SQLite-backed — survive server restarts |
| Rate limiting | 10 attempts / 15 min per IP, SQLite-backed |
| API protection | Server middleware blocks all `/api/*` without valid session (except tracking/unsubscribe) |
| Tracking links | HMAC-SHA256 signed (`UNSUBSCRIBE_SECRET`). Invalid signature → rejected |
| Unsubscribe links | HMAC-signed token prevents ID enumeration |
| Open redirect | Protocol whitelist (http/https only) + HMAC signature on click URLs |
| HTML injection | Contact values HTML-escaped before template substitution |
| Path traversal | Template names restricted to `[a-zA-Z0-9_-]`, path verified inside `data/templates/` |
| Timing attacks | `timingSafeEqual` for all HMAC comparisons and password check |
| Status integrity | `sending`/`sent` campaign states only writable by send pipeline |
| Crash recovery | Campaigns stuck in `sending` reset to `paused` on startup |

## Data directory

```
data/
  turbomailer.db       # SQLite database
  templates/           # HTML email templates
  backup/              # Auto-backups (max 10, WAL-safe zip)
  demo/                # Demo data (optional)
```

## API overview

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | — | Sets session cookie |
| GET | `/api/contacts` | ✓ | |
| POST | `/api/contacts/import` | ✓ | Max 5000 rows |
| GET | `/api/contacts/export` | ✓ | CSV download |
| GET | `/api/campaigns` | ✓ | |
| POST | `/api/campaigns/:id/send` | ✓ | Returns `{ queued: true }` immediately |
| POST | `/api/campaigns/:id/pause` | ✓ | |
| GET | `/api/track/open` | — | HMAC-signed pixel |
| GET | `/api/track/click` | — | HMAC-signed redirect |
| GET | `/api/unsubscribe` | — | HMAC-signed opt-out |
| GET | `/api/analytics` | ✓ | |
| DELETE | `/api/reset` | ✓ | Backup created first |

## Production deployment (PM2 example)

```bash
npm run build
pm2 start .output/server/index.mjs --name turbo-mailer
pm2 save
```

Reverse-proxy with nginx/Caddy, set `TRACKING_BASE_URL` to your public domain.
