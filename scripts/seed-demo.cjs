const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, '../data/turbomailer_demo.db')
const templateHtml = fs.readFileSync(path.join(__dirname, '../data/demo/email_demo.html'), 'utf8')

const db = new Database(dbPath)

db.exec(`
  DROP TABLE IF EXISTS tracking_events;
  DROP TABLE IF EXISTS sends;
  DROP TABLE IF EXISTS campaigns;
  DROP TABLE IF EXISTS list_contacts;
  DROP TABLE IF EXISTS lists;
  DROP TABLE IF EXISTS contacts;
`)

db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;

  CREATE TABLE contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    company TEXT,
    phone TEXT,
    linkedin TEXT,
    url TEXT,
    youtube TEXT,
    instagram TEXT,
    tags TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','unsubscribed','bounced')),
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    created_at INTEGER
  );

  CREATE TABLE list_contacts (
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, contact_id)
  );

  CREATE TABLE campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    template_name TEXT,
    template_html TEXT,
    list_id INTEGER REFERENCES lists(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','sent','paused')),
    scheduled_at INTEGER,
    started_at INTEGER,
    finished_at INTEGER,
    created_at INTEGER,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0
  );

  CREATE TABLE sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id),
    email TEXT NOT NULL,
    personalized_subject TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','bounced','opened')),
    sent_at INTEGER,
    error_msg TEXT
  );

  CREATE TABLE tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    send_id INTEGER REFERENCES sends(id),
    campaign_id INTEGER REFERENCES campaigns(id),
    contact_id INTEGER REFERENCES contacts(id),
    event_type TEXT NOT NULL CHECK(event_type IN ('open','click')),
    url TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER
  );
`)

const now = Date.now()
// Returns Unix timestamp (seconds) for N days ago
const d = (daysAgo) => Math.floor((now - daysAgo * 86400000) / 1000)

// ── CONTACTS (20) ─────────────────────────────────────────────────────────────
const contactsData = [
  // id 1
  ['alice@techcorp.io', 'Alice Martínez', 'TechCorp Solutions', '+34 612 345 678', 'linkedin.com/in/alicemartinez', 'https://techcorp.io', null, null, '["cliente","B2B","VIP"]', 'active'],
  // id 2
  ['bob@designstudio.com', 'Bob Chen', 'Design Studio Co.', '+1 415 555 0101', 'linkedin.com/in/bobchen', 'https://designstudio.com', null, 'instagram.com/bobchen_design', '["agencia","diseño"]', 'active'],
  // id 3
  ['carol@marketingpro.es', 'Carol López', 'Marketing Pro SL', '+34 699 876 543', 'linkedin.com/in/carollopez', 'https://marketingpro.es', null, null, '["B2B","marketing"]', 'active'],
  // id 4
  ['david@startup.xyz', 'David Kim', 'Startup XYZ', '+1 650 555 0202', 'linkedin.com/in/davidkim', 'https://startup.xyz', 'youtube.com/@davidkim', null, '["startup","tech"]', 'active'],
  // id 5
  ['eva@consulting.eu', 'Eva Fischer', 'Fischer Consulting', '+49 89 55012345', 'linkedin.com/in/evafischer', 'https://fischer-consulting.eu', null, null, '["consultoría","B2B"]', 'active'],
  // id 6
  ['frank@ecommerce.shop', 'Frank Torres', 'EcomShop Inc.', '+34 623 456 789', 'linkedin.com/in/franktorres', 'https://ecomshop.es', null, 'instagram.com/ecomshop', '["ecommerce","cliente"]', 'active'],
  // id 7
  ['grace@agency.io', 'Grace Nakamura', 'Nakamura Agency', '+81 3 1234 5678', 'linkedin.com/in/gracenakamura', 'https://nakamura.io', null, null, '["agencia","B2B"]', 'active'],
  // id 8
  ['hector@fintech.com', 'Héctor Ruiz', 'FinTech Global', '+34 611 222 333', 'linkedin.com/in/hectorruiz', 'https://fintechglobal.com', null, null, '["fintech","VIP"]', 'active'],
  // id 9
  ['iris@healthcare.org', 'Iris Wang', 'HealthCare Plus', '+1 212 555 0303', 'linkedin.com/in/iriswang', 'https://healthcareplus.org', null, null, '["salud","B2B"]', 'active'],
  // id 10
  ['jorge@mediagroup.tv', 'Jorge Sánchez', 'Media Group TV', '+34 600 111 222', 'linkedin.com/in/jorgesanchez', 'https://mediagroup.tv', 'youtube.com/@mediagrouptv', 'instagram.com/mediagrouptv', '["media","cliente"]', 'active'],
  // id 11
  ['kate@saas.dev', 'Kate Müller', 'SaaS Dev GmbH', '+49 30 9876543', 'linkedin.com/in/katemuller', 'https://saas.dev', null, null, '["SaaS","tech"]', 'active'],
  // id 12
  ['luis@retail.es', 'Luis García', 'Retail España SA', '+34 933 445 566', 'linkedin.com/in/luisgarcia', 'https://retailespana.es', null, 'instagram.com/retailespana', '["retail","B2C"]', 'active'],
  // id 13
  ['mia@content.studio', 'Mia Johnson', 'Content Studio LLC', '+1 310 555 0404', 'linkedin.com/in/miajohnson', 'https://contentstudio.io', 'youtube.com/@miajohnson', 'instagram.com/mia.content', '["contenido","agencia"]', 'active'],
  // id 14
  ['nora@legal.es', 'Nora Patel', 'Legal Partners SLP', '+34 915 678 900', 'linkedin.com/in/norapatel', 'https://legalpartners.es', null, null, '["legal","B2B"]', 'unsubscribed'],
  // id 15
  ['oscar@logistics.eu', 'Óscar Blanco', 'Logistics EU S.A.', '+34 944 321 654', 'linkedin.com/in/oscarblanco', 'https://logisticseu.com', null, null, '["logística","B2B"]', 'active'],
  // id 16
  ['paula@innova.tech', 'Paula Ramos', 'Innova Technologies', '+34 655 789 012', 'linkedin.com/in/paularamos', 'https://innova.tech', null, 'instagram.com/innova.tech', '["tech","startup","VIP"]', 'active'],
  // id 17
  ['rafael@arquitectura.com', 'Rafael Moreno', 'Moreno Arquitectos', '+34 912 345 678', 'linkedin.com/in/rafaelmoreno', 'https://morenoarquitectos.com', null, null, '["construcción","B2B"]', 'active'],
  // id 18
  ['sarah@globalhr.com', 'Sarah Thompson', 'Global HR Solutions', '+1 646 555 0505', 'linkedin.com/in/sarahthompson', 'https://globalhr.com', null, null, '["RRHH","B2B"]', 'active'],
  // id 19
  ['tomas@adagencia.es', 'Tomás Vega', 'AD Agencia Creativa', '+34 618 901 234', 'linkedin.com/in/tomasvega', 'https://adagencia.es', null, 'instagram.com/adagencia', '["agencia","creatividad"]', 'active'],
  // id 20
  ['ursula@pharma.eu', 'Úrsula Kowalski', 'PharmaCorp EU', '+48 22 555 0101', 'linkedin.com/in/ursulakowalski', 'https://pharmacorp.eu', null, null, '["farma","B2B"]', 'bounced'],
]

const insertContact = db.prepare(
  'INSERT INTO contacts (email, name, company, phone, linkedin, url, youtube, instagram, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
)
contactsData.forEach((c, i) => {
  insertContact.run(...c, d(45 - i * 2), d(3 + i))
})

// ── LISTS (4) ────────────────────────────────────────────────────────────────
const insertList = db.prepare('INSERT INTO lists (name, description, color, created_at) VALUES (?, ?, ?, ?)')
insertList.run('Clientes B2B',        'Empresas cliente con contrato activo',                '#6366f1', d(40))  // id 1
insertList.run('Newsletter Tech',     'Suscriptores al boletín de novedades tecnológicas',   '#10b981', d(35))  // id 2
insertList.run('Agencias & Partners', 'Agencias colaboradoras y socios estratégicos',        '#f59e0b', d(30))  // id 3
insertList.run('VIP & Especiales',    'Contactos de alto valor y atención prioritaria',      '#ef4444', d(20))  // id 4

// ── LIST_CONTACTS ─────────────────────────────────────────────────────────────
const insertLC = db.prepare('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) VALUES (?, ?)')

// List 1 — Clientes B2B (10 contacts)
;[1, 3, 5, 6, 8, 9, 11, 15, 17, 18].forEach(cid => insertLC.run(1, cid))

// List 2 — Newsletter Tech (12 contacts)
;[1, 2, 4, 6, 7, 10, 11, 12, 13, 16, 19, 20].forEach(cid => insertLC.run(2, cid))

// List 3 — Agencias & Partners (5 contacts)
;[2, 7, 13, 19, 3].forEach(cid => insertLC.run(3, cid))

// List 4 — VIP & Especiales (4 contacts)
;[1, 8, 16, 18].forEach(cid => insertLC.run(4, cid))

// ── CAMPAIGNS (5) ────────────────────────────────────────────────────────────
const insertCampaign = db.prepare(
  `INSERT INTO campaigns
    (name, subject, template_name, template_html, list_id, status,
     started_at, finished_at, created_at,
     total_recipients, sent_count, open_count, click_count, fail_count)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
)

// id 1 — sent, list 1 (10 recipients, 9 sent, 1 failed)
insertCampaign.run(
  'Lanzamiento Q1 2026', '🚀 Novedades Q1 — Turbo-Mailer PRO', 'email_demo', templateHtml,
  1, 'sent', d(30), d(30), d(32),
  10, 9, 6, 4, 1
)

// id 2 — sent, list 2 (12 recipients, 11 sent, 1 failed)
insertCampaign.run(
  'Newsletter Marzo 2026', '📬 Boletín mensual — Marzo 2026', 'email_demo', templateHtml,
  2, 'sent', d(18), d(18), d(20),
  12, 11, 7, 3, 1
)

// id 3 — sent, list 3 (5 recipients, 5 sent)
insertCampaign.run(
  'Seguimiento Agencias Q1', '🤝 Actualización para nuestros partners', 'email_demo', templateHtml,
  3, 'sent', d(10), d(10), d(12),
  5, 5, 3, 2, 0
)

// id 4 — sent, list 4 (4 VIP recipients, all sent)
insertCampaign.run(
  'VIP — Oferta Exclusiva Abril', '🎁 Propuesta exclusiva para ti, {{Contacto}}', 'email_demo', templateHtml,
  4, 'sent', d(5), d(5), d(7),
  4, 4, 3, 2, 0
)

// id 5 — draft, list 1
insertCampaign.run(
  'Campaña Mayo 2026', '✨ Novedades de Mayo — ¿Hablamos?', 'email_demo', templateHtml,
  1, 'draft', null, null, d(1),
  0, 0, 0, 0, 0
)

// ── SENDS ────────────────────────────────────────────────────────────────────
const insertSend = db.prepare(
  `INSERT INTO sends (campaign_id, contact_id, email, personalized_subject, status, sent_at, error_msg)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
)

// Campaign 1 sends (list 1: contacts 1,3,5,6,8,9,11,15,17,18)
const c1sends = [
  [1, 1,  'alice@techcorp.io',        '🚀 Novedades Q1 — Turbo-Mailer PRO', 'sent',   d(30), null],
  [1, 3,  'carol@marketingpro.es',    '🚀 Novedades Q1 — Turbo-Mailer PRO', 'opened', d(30), null],
  [1, 5,  'eva@consulting.eu',        '🚀 Novedades Q1 — Turbo-Mailer PRO', 'sent',   d(30), null],
  [1, 6,  'frank@ecommerce.shop',     '🚀 Novedades Q1 — Turbo-Mailer PRO', 'opened', d(30), null],
  [1, 8,  'hector@fintech.com',       '🚀 Novedades Q1 — Turbo-Mailer PRO', 'opened', d(30), null],
  [1, 9,  'iris@healthcare.org',      '🚀 Novedades Q1 — Turbo-Mailer PRO', 'sent',   d(30), null],
  [1, 11, 'kate@saas.dev',            '🚀 Novedades Q1 — Turbo-Mailer PRO', 'opened', d(30), null],
  [1, 15, 'oscar@logistics.eu',       '🚀 Novedades Q1 — Turbo-Mailer PRO', 'sent',   d(30), null],
  [1, 17, 'rafael@arquitectura.com',  '🚀 Novedades Q1 — Turbo-Mailer PRO', 'opened', d(30), null],
  [1, 18, 'sarah@globalhr.com',       '🚀 Novedades Q1 — Turbo-Mailer PRO', 'failed', null,  'SMTP 550: Mailbox unavailable'],
]
c1sends.forEach(r => insertSend.run(...r))
// send ids: 1-10

// Campaign 2 sends (list 2: contacts 1,2,4,6,7,10,11,12,13,16,19,20)
const c2sends = [
  [2, 1,  'alice@techcorp.io',     '📬 Boletín mensual — Marzo 2026', 'opened', d(18), null],
  [2, 2,  'bob@designstudio.com',  '📬 Boletín mensual — Marzo 2026', 'sent',   d(18), null],
  [2, 4,  'david@startup.xyz',     '📬 Boletín mensual — Marzo 2026', 'opened', d(18), null],
  [2, 6,  'frank@ecommerce.shop',  '📬 Boletín mensual — Marzo 2026', 'sent',   d(18), null],
  [2, 7,  'grace@agency.io',       '📬 Boletín mensual — Marzo 2026', 'opened', d(18), null],
  [2, 10, 'jorge@mediagroup.tv',   '📬 Boletín mensual — Marzo 2026', 'sent',   d(18), null],
  [2, 11, 'kate@saas.dev',         '📬 Boletín mensual — Marzo 2026', 'opened', d(18), null],
  [2, 12, 'luis@retail.es',        '📬 Boletín mensual — Marzo 2026', 'sent',   d(18), null],
  [2, 13, 'mia@content.studio',    '📬 Boletín mensual — Marzo 2026', 'opened', d(18), null],
  [2, 16, 'paula@innova.tech',     '📬 Boletín mensual — Marzo 2026', 'sent',   d(18), null],
  [2, 19, 'tomas@adagencia.es',    '📬 Boletín mensual — Marzo 2026', 'opened', d(18), null],
  [2, 20, 'ursula@pharma.eu',      '📬 Boletín mensual — Marzo 2026', 'failed', null,  'SMTP 550: User unknown'],
]
c2sends.forEach(r => insertSend.run(...r))
// send ids: 11-22

// Campaign 3 sends (list 3: contacts 2,7,13,19,3)
const c3sends = [
  [3, 2,  'bob@designstudio.com', '🤝 Actualización para nuestros partners', 'opened', d(10), null],
  [3, 7,  'grace@agency.io',      '🤝 Actualización para nuestros partners', 'sent',   d(10), null],
  [3, 13, 'mia@content.studio',   '🤝 Actualización para nuestros partners', 'opened', d(10), null],
  [3, 19, 'tomas@adagencia.es',   '🤝 Actualización para nuestros partners', 'opened', d(10), null],
  [3, 3,  'carol@marketingpro.es','🤝 Actualización para nuestros partners', 'sent',   d(10), null],
]
c3sends.forEach(r => insertSend.run(...r))
// send ids: 23-27

// Campaign 4 sends (list 4: contacts 1,8,16,18)
const c4sends = [
  [4, 1,  'alice@techcorp.io',   '🎁 Propuesta exclusiva para ti, Alice',   'opened', d(5), null],
  [4, 8,  'hector@fintech.com',  '🎁 Propuesta exclusiva para ti, Héctor',  'opened', d(5), null],
  [4, 16, 'paula@innova.tech',   '🎁 Propuesta exclusiva para ti, Paula',   'opened', d(5), null],
  [4, 18, 'sarah@globalhr.com',  '🎁 Propuesta exclusiva para ti, Sarah',   'sent',   d(5), null],
]
c4sends.forEach(r => insertSend.run(...r))
// send ids: 28-31

// ── TRACKING EVENTS ───────────────────────────────────────────────────────────
const insertEvent = db.prepare(
  `INSERT INTO tracking_events (send_id, campaign_id, contact_id, event_type, url, ip, user_agent, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
)

const uas = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
]
const ips = ['85.12.44.101', '62.33.18.200', '91.44.77.55', '213.98.11.6', '37.15.88.44', '178.60.22.9']
const ua = (i) => uas[i % uas.length]
const ip = (i) => ips[i % ips.length]

// Campaign 1 opens (sends 2,4,5,7,9 — status=opened or sent-and-opened)
const c1Opens = [
  [2,  1, 3,  d(29)],
  [4,  1, 6,  d(29)],
  [5,  1, 8,  d(28)],
  [7,  1, 11, d(28)],
  [9,  1, 17, d(28)],
  [1,  1, 1,  d(27)],  // alice also opened
]
c1Opens.forEach(([sid, cid, ctid, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'open', null, ip(i), ua(i), ts)
})

// Campaign 1 clicks (4 clicks)
const c1Clicks = [
  [2,  1, 3,  'https://marketingpro.es',    d(29)],
  [4,  1, 6,  'https://ecomshop.es',         d(28)],
  [5,  1, 8,  'https://fintechglobal.com',   d(27)],
  [1,  1, 1,  'https://techcorp.io',         d(26)],
]
c1Clicks.forEach(([sid, cid, ctid, url, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'click', url, ip(i + 2), ua(i + 1), ts)
})

// Campaign 2 opens (sends 11,13,15,17,19,21 — those with opened status)
const c2Opens = [
  [11, 2, 1,  d(17)],
  [13, 2, 4,  d(17)],
  [15, 2, 7,  d(16)],
  [17, 2, 11, d(16)],
  [19, 2, 13, d(15)],
  [21, 2, 19, d(15)],
  [12, 2, 2,  d(14)],  // bob also opened after initial send
]
c2Opens.forEach(([sid, cid, ctid, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'open', null, ip(i), ua(i), ts)
})

// Campaign 2 clicks (3 clicks)
const c2Clicks = [
  [11, 2, 1,  'https://techcorp.io',       d(17)],
  [13, 2, 4,  'https://startup.xyz',       d(16)],
  [19, 2, 13, 'https://contentstudio.io',  d(15)],
]
c2Clicks.forEach(([sid, cid, ctid, url, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'click', url, ip(i + 1), ua(i + 2), ts)
})

// Campaign 3 opens (sends 23,25,26)
const c3Opens = [
  [23, 3, 2,  d(9)],
  [25, 3, 13, d(9)],
  [26, 3, 19, d(8)],
]
c3Opens.forEach(([sid, cid, ctid, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'open', null, ip(i + 3), ua(i), ts)
})

// Campaign 3 clicks (2 clicks)
const c3Clicks = [
  [23, 3, 2,  'https://designstudio.com', d(9)],
  [25, 3, 13, 'https://contentstudio.io', d(8)],
]
c3Clicks.forEach(([sid, cid, ctid, url, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'click', url, ip(i + 4), ua(i + 1), ts)
})

// Campaign 4 opens (sends 28,29,30)
const c4Opens = [
  [28, 4, 1,  d(4)],
  [29, 4, 8,  d(4)],
  [30, 4, 16, d(3)],
]
c4Opens.forEach(([sid, cid, ctid, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'open', null, ip(i + 2), ua(i + 3), ts)
})

// Campaign 4 clicks (2 clicks)
const c4Clicks = [
  [28, 4, 1,  'https://techcorp.io',   d(4)],
  [30, 4, 16, 'https://innova.tech',   d(3)],
]
c4Clicks.forEach(([sid, cid, ctid, url, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'click', url, ip(i + 5), ua(i), ts)
})

db.close()
console.log('✓ turbomailer_demo.db created at data/turbomailer_demo.db')
console.log('  20 contacts | 4 lists | 5 campaigns | 31 sends | 22 tracking events')
