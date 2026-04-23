const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, '../data/turbomailer_demo.db')

const db = new Database(dbPath)

// Drop all existing tables
db.exec(`
  DROP TABLE IF EXISTS tracking_events;
  DROP TABLE IF EXISTS sends;
  DROP TABLE IF EXISTS campaigns;
  DROP TABLE IF EXISTS list_contacts;
  DROP TABLE IF EXISTS lists;
  DROP TABLE IF EXISTS contacts;
`)

db.exec(`
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
    status TEXT NOT NULL DEFAULT 'active',
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
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE
  );
  CREATE TABLE campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    template_name TEXT,
    template_html TEXT,
    list_id INTEGER REFERENCES lists(id),
    status TEXT NOT NULL DEFAULT 'draft',
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
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at INTEGER,
    error_msg TEXT
  );
  CREATE TABLE tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    send_id INTEGER REFERENCES sends(id),
    campaign_id INTEGER REFERENCES campaigns(id),
    contact_id INTEGER REFERENCES contacts(id),
    event_type TEXT NOT NULL,
    url TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER
  );
`)

const now = Date.now()
const d = (daysAgo) => Math.floor((now - daysAgo * 86400000) / 1000)

// 15 contacts
const contactsData = [
  ['alice@techcorp.io', 'Alice Martínez', 'TechCorp Solutions', '+34 612 345 678', 'linkedin.com/in/alicemartinez', 'https://techcorp.io', null, null, '["cliente","B2B"]', 'active'],
  ['bob@designstudio.com', 'Bob Chen', 'Design Studio Co.', '+1 415 555 0101', 'linkedin.com/in/bobchen', 'https://designstudio.com', null, 'instagram.com/bobchen_design', '["agencia","diseño"]', 'active'],
  ['carol@marketingpro.es', 'Carol López', 'Marketing Pro SL', '+34 699 876 543', 'linkedin.com/in/carollopez', 'https://marketingpro.es', null, null, '["B2B","marketing"]', 'active'],
  ['david@startup.xyz', 'David Kim', 'Startup XYZ', '+1 650 555 0202', 'linkedin.com/in/davidkim', 'https://startup.xyz', 'youtube.com/@davidkim', null, '["startup","tech"]', 'active'],
  ['eva@consulting.eu', 'Eva Fischer', 'Fischer Consulting', '+49 89 55012345', 'linkedin.com/in/evafischer', 'https://fischer-consulting.eu', null, null, '["consultoría","B2B"]', 'active'],
  ['frank@ecommerce.shop', 'Frank Torres', 'EcomShop Inc.', '+34 623 456 789', 'linkedin.com/in/franktorres', 'https://ecomshop.es', null, 'instagram.com/ecomshop', '["ecommerce","cliente"]', 'active'],
  ['grace@agency.io', 'Grace Nakamura', 'Nakamura Agency', '+81 3 1234 5678', 'linkedin.com/in/gracenakamura', 'https://nakamura.io', null, null, '["agencia","B2B"]', 'active'],
  ['hector@fintech.com', 'Héctor Ruiz', 'FinTech Global', '+34 611 222 333', 'linkedin.com/in/hectorruiz', 'https://fintechglobal.com', null, null, '["fintech","VIP"]', 'active'],
  ['iris@healthcare.org', 'Iris Wang', 'HealthCare Plus', '+1 212 555 0303', 'linkedin.com/in/iriswang', 'https://healthcareplus.org', null, null, '["salud","B2B"]', 'active'],
  ['jorge@mediagroup.tv', 'Jorge Sánchez', 'Media Group TV', '+34 600 111 222', 'linkedin.com/in/jorgesanchez', 'https://mediagroup.tv', 'youtube.com/@mediagrouptv', 'instagram.com/mediagrouptv', '["media","cliente"]', 'active'],
  ['kate@saas.dev', 'Kate Müller', 'SaaS Dev GmbH', '+49 30 9876543', 'linkedin.com/in/katmuller', 'https://saas.dev', null, null, '["SaaS","tech"]', 'active'],
  ['luis@retail.es', 'Luis García', 'Retail España SA', '+34 933 445 566', 'linkedin.com/in/luisgarcia', 'https://retailespana.es', null, 'instagram.com/retailespana', '["retail","B2C"]', 'active'],
  ['mia@content.studio', 'Mia Johnson', 'Content Studio LLC', '+1 310 555 0404', 'linkedin.com/in/miajohnson', 'https://contentstudio.io', 'youtube.com/@miajohnson', 'instagram.com/mia.content', '["contenido","agencia"]', 'active'],
  ['nora@legal.es', 'Nora Patel', 'Legal Partners SLP', '+34 915 678 900', 'linkedin.com/in/norapatel', 'https://legalpartners.es', null, null, '["legal","B2B"]', 'unsubscribed'],
  ['oscar@logistics.eu', 'Óscar Blanco', 'Logistics EU S.A.', '+34 944 321 654', 'linkedin.com/in/oscarblanco', 'https://logisticseu.com', null, null, '["logística","B2B"]', 'active'],
]

const insertContact = db.prepare(
  'INSERT INTO contacts (email, name, company, phone, linkedin, url, youtube, instagram, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
)
contactsData.forEach((c, i) => {
  insertContact.run(...c, d(30 - i * 2), d(5 - i))
})

// Lists
const insertList = db.prepare('INSERT INTO lists (name, description, color, created_at) VALUES (?, ?, ?, ?)')
insertList.run('Clientes B2B', 'Empresas cliente con contrato activo', '#6366f1', d(25))
insertList.run('Newsletter Tech', 'Suscriptores al boletín de novedades tecnológicas', '#10b981', d(20))
insertList.run('Agencias & Partners', 'Agencias colaboradoras y socios estratégicos', '#f59e0b', d(15))

// list_contacts
const insertLC = db.prepare('INSERT INTO list_contacts (list_id, contact_id) VALUES (?, ?)')
;[1, 3, 5, 8, 9, 11, 14, 15].forEach(cid => insertLC.run(1, cid))
;[1, 2, 4, 6, 7, 10, 11, 12, 13].forEach(cid => insertLC.run(2, cid))
;[2, 7, 13].forEach(cid => insertLC.run(3, cid))

const templateHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="color:#6366f1">Turbo-Mailer PRO</h1>
  <p>Hola {{Contacto}},</p>
  <p>Te escribimos desde <strong>{{Empresa}}</strong> para compartirte nuestras últimas novedades.</p>
  <p>Visita nuestro sitio para más información:</p>
  <a href="{{URL}}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Ver más</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="font-size:12px;color:#9ca3af">Si no deseas recibir más correos, puedes <a href="%UNSUBSCRIBE_URL%">darte de baja aquí</a>.</p>
</div>`

// Campaigns
const insertCampaign = db.prepare(
  'INSERT INTO campaigns (name, subject, template_name, template_html, list_id, status, started_at, finished_at, created_at, total_recipients, sent_count, open_count, click_count, fail_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
)
insertCampaign.run('Lanzamiento Q1 2026', '🚀 Novedades Q1 — Turbo-Mailer PRO', 'Lanzamiento', templateHtml, 1, 'sent', d(20), d(20), d(22), 8, 8, 5, 3, 0)
insertCampaign.run('Newsletter Marzo', '📬 Boletín Mensual — Marzo 2026', 'Newsletter', templateHtml, 2, 'sent', d(12), d(12), d(14), 9, 8, 4, 2, 1)
insertCampaign.run('Promoción Abril', '🎁 Oferta especial Abril para ti', 'Promo', templateHtml, 1, 'draft', null, null, d(3), 0, 0, 0, 0, 0)
insertCampaign.run('Seguimiento Agencias', '🤝 Actualización para nuestros partners', 'Partners', templateHtml, 3, 'sent', d(5), d(5), d(7), 3, 3, 2, 1, 0)

// Sends — campaign 1 (8 contacts from list 1)
const insertSend = db.prepare(
  'INSERT INTO sends (campaign_id, contact_id, email, personalized_subject, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)'
)
const c1 = [
  [1, 1, 'alice@techcorp.io'],
  [1, 3, 'carol@marketingpro.es'],
  [1, 5, 'eva@consulting.eu'],
  [1, 8, 'hector@fintech.com'],
  [1, 9, 'iris@healthcare.org'],
  [1, 11, 'kate@saas.dev'],
  [1, 14, 'nora@legal.es'],
  [1, 15, 'oscar@logistics.eu'],
]
c1.forEach(([cid, ctid, email]) => insertSend.run(cid, ctid, email, '🚀 Novedades Q1 — Turbo-Mailer PRO', 'sent', d(20)))

// Sends — campaign 2 (9 contacts from list 2, last failed)
const c2 = [
  [2, 1, 'alice@techcorp.io'],
  [2, 2, 'bob@designstudio.com'],
  [2, 4, 'david@startup.xyz'],
  [2, 6, 'frank@ecommerce.shop'],
  [2, 7, 'grace@agency.io'],
  [2, 10, 'jorge@mediagroup.tv'],
  [2, 11, 'kate@saas.dev'],
  [2, 12, 'luis@retail.es'],
  [2, 13, 'mia@content.studio'],
]
c2.forEach(([cid, ctid, email], i) => {
  const status = i === 8 ? 'failed' : 'sent'
  insertSend.run(cid, ctid, email, '📬 Boletín Mensual — Marzo 2026', status, d(12))
})

// Sends — campaign 4 (3 contacts from list 3)
const c4 = [
  [4, 2, 'bob@designstudio.com'],
  [4, 7, 'grace@agency.io'],
  [4, 13, 'mia@content.studio'],
]
c4.forEach(([cid, ctid, email]) => insertSend.run(cid, ctid, email, '🤝 Actualización para nuestros partners', 'sent', d(5)))

// Tracking events
const insertEvent = db.prepare(
  'INSERT INTO tracking_events (send_id, campaign_id, contact_id, event_type, url, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
)
const uas = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
]

// Opens campaign 1 (5 opens on sends 1-5)
;[
  [1, 1, 1, d(19)],
  [2, 1, 3, d(19)],
  [3, 1, 5, d(18)],
  [4, 1, 8, d(18)],
  [5, 1, 9, d(17)],
].forEach(([sid, cid, ctid, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'open', null, `85.${i}.12.${i}`, uas[i % 3], ts)
})

// Clicks campaign 1 (3 clicks)
;[
  [1, 1, 1, 'https://techcorp.io', d(18)],
  [3, 1, 5, 'https://fischer-consulting.eu', d(17)],
  [5, 1, 9, 'https://healthcareplus.org', d(16)],
].forEach(([sid, cid, ctid, url, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'click', url, `85.${i}.12.${i}`, uas[i % 3], ts)
})

// Opens campaign 2 (4 opens on sends 9-12)
;[
  [9, 2, 1, d(11)],
  [10, 2, 2, d(11)],
  [11, 2, 4, d(10)],
  [12, 2, 6, d(10)],
].forEach(([sid, cid, ctid, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'open', null, `62.${i}.33.${i}`, uas[i % 3], ts)
})

// Clicks campaign 2 (2 clicks)
;[
  [9, 2, 1, 'https://techcorp.io', d(10)],
  [10, 2, 2, 'https://designstudio.com', d(10)],
].forEach(([sid, cid, ctid, url, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'click', url, `62.${i}.33.${i}`, uas[i % 3], ts)
})

// Opens campaign 4 (2 opens on sends 18-19)
;[
  [18, 4, 2, d(4)],
  [19, 4, 7, d(3)],
].forEach(([sid, cid, ctid, ts], i) => {
  insertEvent.run(sid, cid, ctid, 'open', null, `91.${i}.44.${i}`, uas[i % 3], ts)
})

// Click campaign 4
insertEvent.run(18, 4, 2, 'click', 'https://designstudio.com', '91.0.44.0', uas[0], d(4))

db.close()
console.log('turbomailer_demo.db created successfully')
