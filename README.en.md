# 🚀 TurboMailer

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**[Versión en Español](README.md)**

**Complete Email Marketing Platform with simple CRM, HTML Template Editor, AI, Analytics, Tracking, and much more.**

TurboMailer is a **self-hosted, single-account application designed for VPS deployment**, providing a high-performance email marketing platform built with **Nuxt 3**. It is a secure, robust tool with a well-structured architecture focused on data sovereignty. It includes complete contact and list management, a visual HTML template editor with drag & drop blocks, a campaign system with open and click tracking, real-time analytics, AI integration for copywriting, and a multi-language interface (ES/EN). All with real persistence in a SQLite database and mass sending via any SMTP service (Gmail, Outlook, Amazon SES, etc.).

## 🛡️ Your Information, Only Yours (Data Sovereignty)

What makes **TurboMailer** an extremely powerful tool is its **privacy**. Being a self-hosted application on your own server:

- **Eliminate Intermediaries**: You don't hand over your company's, business's, or clients' valuable information to any external platform.
- **Professional Privacy**: There is only a direct connection between your private instance and your chosen email service.

![TurboMailer — Dashboard preview](public/images/ogimage.jpg)

## 📸 Project Interface

<table>
  <tr>
    <td><img src="public/images/screen_1.webp"></td>
    <td><img src="public/images/screen_2.webp"></td>
  </tr>
  <tr>
    <td><img src="public/images/screen_3.webp"></td>
    <td><img src="public/images/screen_4.webp"></td>
  </tr>
  <tr>
    <td><img src="public/images/screen_5.webp"></td>
    <td><img src="public/images/screen_6.webp"></td>
  </tr>
  <tr>
    <td><img src="public/images/screen_7.webp"></td>
    <td><img src="public/images/screen_8.webp"></td>
  </tr>
</table>

---

## ✨ Key Features

### 👥 CRM Contacts

- Self-generated SQLite database with **complete contact details**: email, name, company, phone, LinkedIn, URL, YouTube, Instagram, tags, and status (`active / unsubscribed / bounced`)
- **Distribution list** management with name, description, and customizable color
- Real-time search by email, name, or company
- Filtering by list and subscription status
- Pagination (50 per page), multiple selection, and drag-to-list
- **Bulk import** from Excel (`.xlsx`, `.xls`, `.csv`) with column auto-detection
- Complete **CSV export** of contacts
- **Smart Database**: Fully automatic schema generation and synchronization. No manual migration commands required.
- Full CRUD for contacts and lists from the UI

### 📣 Campaign Management

- 4-step Wizard: name + subject → list selection → template → review and send
- Campaign statuses: `draft / scheduled / sending / sent / paused`
- Detailed campaign view with recipient list, their statuses, and individual metrics
- Automatic injection of **tracking pixel** (opens) and **tracked links** (clicks) into the HTML before sending
- Dynamic variables (English/Spanish): `{{Company}} / {{Empresa}}`, `{{Name}} / {{Nombre}}`, `{{URL}}`, `{{Linkedin}}`, `{{Instagram}}`, `{{Youtube}}`
- Bulk sending via SMTP with real-time success and failure reporting
- **Professional Retry Management**: Automatic retry system at the SMTP level and a manual "Retry Failed" button in the campaign dashboard to recover from temporary errors.
- **Background Sending**: When a campaign is launched, the overlay auto-dismisses after 4 seconds and the send continues in the background. No need to keep the window open.
- **Persistent Progress Badge**: Floating indicator (bottom-right) visible across the entire app while a send is active. Shows `Sending X / Y` with a real-time progress bar, a cancel button, and a resume button when paused.
- **Full Send Control**: Pause the send from the badge with one click. Resume from the badge or from the status banner on the campaign detail page, without losing progress.
- **Individual Resend**: In the campaign recipients table, a per-row button to resend a specific email that failed or is still pending. Automatically opens the badge and monitors the resend.

### 📊 Advanced Analytics

- Real-time KPI Dashboard: total contacts, campaigns sent, average open and click rates.
- **Delivery Funnel**: Direct visualization of the delivery flow: Sent → Opened → Clicked.
- **Interactive Charts**:
  - Open and click trends for the last 14 days with visibility toggles.
  - Device distribution (Desktop/Mobile) with dynamic doughnut charts and central total.
  - Comparative campaign performance (Open Rate vs Click Rate) with horizontal bar charts.
- **Detailed Event Log**: Records of the latest opens with device icons, contact names, companies, and timestamps.
- **Auto-refresh**: Metrics automatically update every 30 seconds for live monitoring.

### 📡 Email Tracking

- Transparent 1×1 pixel (GIF) served by `/api/track/open` — records open and increments campaign counter
- Tracked redirect at `/api/track/click` — records click, increments counter, and redirects to the original destination
- `trackingEvents` table in SQLite with `sendId`, `campaignId`, `contactId`, `eventType`, `url`, `ip`, `userAgent`

### 🔕 Unsubscribe

- Personalized unsubscribe link for each recipient in every email
- `/unsubscribe` page with confirmation, "already-unsubscribed" state, and error handling
- Automatic confirmation email upon unsubscription
- Marks the contact as `unsubscribed` in the database

### 📧 Deliverability & Reputation (Anti-Spam)

TurboMailer is optimized to comply with strict regulations from **Apple (iCloud)**, **Gmail**, and other providers to prevent your emails from ending up in SPAM:

- **List-Unsubscribe Headers**: Automatic injection of headers to allow one-click unsubscription directly from the email client (Apple Mail, Gmail).
- **Bounce Management**: Intelligent detection of permanent errors (5xx). If an email bounces, the contact is automatically marked as `bounced` to protect your sender reputation.
- **Native DKIM Signing**: Support for configurable RSA-2048 digital signatures. Includes a utility to generate your keys: `node scripts/generate-dkim.js yourdomain.com`.
- **DNS Readiness**: Designed to work with SPF, DKIM, and DMARC records (required by Apple Postmaster).
- **Rate Control**: Configurable delay and random variation (`jitter`) between sends to avoid robotic sending pattern detection.

### 🎨 Visual Template Editor

- Accessible at `/editor`
- **Available Blocks**: Header, Hero, Card (standard/premium), Buttons, Image, Text, Divider, Footer
- Editing panel: font, size, text and background color, alignment per block
- Layers panel: visual tree with drag & drop reordering
- **AI per block**: improve text for an individual block with one click
- **Bulk AI**: improve all template blocks at once
- **Keyboard shortcuts**: `Ctrl+S` save · `Ctrl+Z` undo · `Ctrl+Y` redo · `Delete` delete block
- Autosave upon detecting changes
- **Template Gallery**: library to save, load, rename, and delete your own HTML templates
- Live Preview with desktop / mobile / dark mode toggle

### 🤖 AI Copywriting Assistant

- Integration with OpenAI (GPT-4o-mini configurable to other OpenAI models)
- Improves individual blocks while preserving HTML and dynamic variables

### 🌐 Multi-language (i18n)

- Complete interface in **Spanish** and **English** (i18n)
- Real-time language switching without reload
- Translation of the entire UI: navigation, steps, contacts, campaigns, analytics, unsubscribe

### 🧹 Selective Reset (Maintenance)

From the Dashboard, the **Reset** button opens an advanced modal viewer that allows for surgical data cleanup:

- **Everything (Aggressive Reset)**: Deletes absolutely all records from the database and physically deletes all HTML template files created in `/data/templates`.
- **Database Only**: Clears all records for contacts, lists, campaigns, sends, and analytics, but preserves your design templates.
- **Reset by Module**:
  - **Contacts**: Deletes only the contact database and its associated lists.
  - **Campaigns**: Clears campaign history and send reports.
  - **Analytics**: Exclusively clears tracking events (opens and clicks) to restart metrics.
- **🛡️ Automatic Backup**: Before executing any mass reset process (Everything or DB Only), the system automatically generates a `.zip` file with the full backup of the database and templates. The backup path is displayed on screen upon completion for your peace of mind.

### 🔒 Privacy and SEO (Anti-Indexing)

To ensure your data privacy and prevent the platform from appearing in search engines, TurboMailer is configured to **not be indexed or cached**:

- **No-Index**: `meta` tags (`robots` and `googlebot`) have been included with `noindex` and `nofollow` directives.
- **Anti-Cache**: The `noarchive` directive is activated to prevent Google from saving cached copies of the interface.
- **Robots.txt**: The `robots.txt` file explicitly blocks access to all crawlers (`User-agent: *`, `Disallow: /`).

---

## 🛠️ Technologies

| Area          | Technology                                                                     |
| ------------- | ------------------------------------------------------------------------------ |
| Framework     | [Nuxt 3](https://nuxt.com/) — SPA mode (`ssr: false`)                          |
| Database      | [SQLite](https://www.sqlite.org/) via [Drizzle ORM](https://orm.drizzle.team/) |
| Emailing      | [Nodemailer](https://nodemailer.com/) — SMTP (Gmail, Outlook, etc.)            |
| Data Handling | [XLSX (SheetJS)](https://sheetjs.com/)                                         |
| AI            | [OpenAI API](https://platform.openai.com/) — GPT-4o-mini (configurable)        |
| i18n          | [@nuxtjs/i18n](https://i18n.nuxtjs.org/)                                       |
| Icons         | [Lucide Vue Next](https://lucide.dev/)                                         |
| PWA           | `@vite-pwa/nuxt`                                                               |

---

## 🗄️ Database (Zero-CLI)

TurboMailer manages the database **100% automatically**.

- **Auto-Installation**: On the first start, it creates the SQLite file and all tables.
- **Auto-Migration**: If you edit the schema in the code, the app detects changes and updates the database upon restart.
- **Auto-Recreation**: If you delete the `.db` file, the app regenerates it instantly.

SQLite in `./data/turbomailer.db` managed with Drizzle ORM. Main tables:

| Table            | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `contacts`       | Contacts with all their fields and subscription status |
| `lists`          | Distribution lists with name, description, and color   |
| `listContacts`   | M×N relationship contacts ↔ lists (cascade delete)     |
| `campaigns`      | Campaigns with status, counters, and timestamps        |
| `sends`          | Individual sends per recipient with status and error   |
| `trackingEvents` | Open and click events with metadata                    |

---

## 🚀 Workflow

1. **Contacts** — Import from Excel or add manually. Organize into lists with colors.
2. **Campaign** — Create a campaign in the 4-step wizard: name, list, template, review.
3. **Editor** — Design your template in the visual editor or load an existing one from the gallery.
4. **Sending** — Preview and send. Tracking is automatically injected.
5. **Analytics** — Monitor opens, clicks, and performance per campaign on the dashboard.

---

## 🚀 Quick Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-user/TurboMailer.git
   cd TurboMailer
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   Rename `.env.template` to `.env` in the project root and complete the fields:

   ```env
    # Acceso a la Aplicación (requerido)
    APP_PASSWORD=tu-contraseña-de-acceso
    PORTAL_KEY=admin

    # SMTP Configuration (requerido para enviar)
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=465
    SMTP_USER=tu-correo@gmail.com
    SMTP_PASS=tu-password-de-aplicacion
    SMTP_SECURE=true
    SMTP_FROM_NAME=TurboMailer
    SMTP_FROM_EMAIL=tu-correo@gmail.com

    # Inteligencia Artificial (opcional)
    OPENAI_API_KEY=sk-...
    OPENAI_MODEL=gpt-4o-mini

    # Tracking (URL base de la app, para generar pixels y links trackeados)
    TRACKING_BASE_URL=https://url-de-tu-web.xxx

    # Seguridad: secreto HMAC para firmar links de unsubscribe
    UNSUBSCRIBE_SECRET=change-me-use-openssl-rand-hex-32

    # Delay between emails (ms) to respect SMTP provider rate limits. Default: 2000ms
    SMTP_SEND_DELAY_MS=2000
    # Random variation (jitter) in milliseconds to avoid robotic pattern detection (e.g., +/- 500ms)
    SMTP_SEND_JITTER_MS=500

    # Retry configuration for temporary SMTP server errors (e.g., 421 Busy)
    SMTP_MAX_RETRIES=3
    SMTP_RETRY_DELAY_MS=5000

    # DKIM Signing (OPCIONAL pero altamente recomendado)
    # --------------------------------------------------------------------------
    # Si dejas estos campos vacíos, TurboMailer funcionará pero tus correos tienen
    # más riesgo de ser bloqueados o marcados como SPAM por Apple/Gmail.
    # Si usas un servicio SMTP externo (Gmail, SES), ellos suelen firmar por ti,
    # pero tener tu propia firma mejora la reputación de tu dominio.
    # Generar con: node scripts/generate-dkim.js tudominio.com

    # DKIM_DOMAIN=tudominio.com
    # DKIM_SELECTOR=default
    # DKIM_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   ```

4. **Start the application**

   ```bash
   npm run dev
   ```

   _You don't need to run database commands or migrations. The application will detect the schema and configure SQLite automatically upon startup._

---

## 🎯 First Use — Demo Database

When opening the app for the first time (or after a full reset), the dashboard automatically detects that the database is empty and shows a welcome screen with two options:

### Option A — Load sample data (Explore the app)

Click **"Sample Data"** in the welcome modal. The app automatically copies `data/turbomailer_demo.db` over `data/turbomailer.db` and reloads the page. You will immediately see:

- Sample contacts and distribution lists
- Campaigns with real statistics (sent, opens, clicks)
- Populated tracking events and analytics

This allows you to explore all functions without configuring anything. When you want to start with your own data, open the **Reset** button on the dashboard and choose **"Everything (Aggressive Reset)"** — it deletes everything and shows the welcome screen again.

### Option B — Start from scratch

Click **"Start from scratch"** to begin directly with an empty database and import your own contacts.

> **Note:** `data/turbomailer_demo.db` is never deleted. You can reload the demo data at any time by doing a **Reset → Everything** from the dashboard.

---

## 👻 Invisible Security (Ghost Mode)

To ensure maximum privacy, TurboMailer is designed to be invisible to curious visitors or crawlers.

1. **Decoy Root**: Accessing the domain root (`/`) displays a technical status page simulating an operational SMTP node. The administration panel is "hidden" at `/dashboard`.
2. **Hidden Login (Backdoor)**: If you try to access `/login` directly, the application will display a **fake 404 error** (Apache/Ubuntu).
3. **How to Access**: You must add the secret parameter defined in your `.env` file (`PORTAL_KEY`).
   - **Access URL**: `yourdomain.com/login?portal=admin` (if using the default value).

> **Important**: Once you log in, you can navigate the dashboard normally. If you log out or the session expires, you will see the technical decoy page again.

## 🔑 Example: Configuration with Gmail

The app uses Gmail SMTP with a 16-digit app password (not your normal password).

1. **Enable 2-Step Verification**: [Google Account → Security](https://myaccount.google.com/security)
2. **Generate Password**: Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Enter a name (e.g., `Turbo Mailer`) and click **Create**
4. Copy the 16-character code (without spaces) and paste it into `SMTP_PASS`. Make sure `SMTP_HOST` is `smtp.gmail.com` and `SMTP_PORT` is `465`.

---

## 📡 API Reference

### Auth

| Method | Route              | Description                |
| ------ | ------------------ | -------------------------- |
| POST   | `/api/auth/login`  | Login with master password |
| GET    | `/api/auth/check`  | Check active session       |
| POST   | `/api/auth/logout` | Log out                    |

### Contacts

| Method | Route                  | Description                              |
| ------ | ---------------------- | ---------------------------------------- |
| GET    | `/api/contacts`        | List with search, filter, and pagination |
| POST   | `/api/contacts`        | Create contact                           |
| GET    | `/api/contacts/[id]`   | Detail with associated lists             |
| PUT    | `/api/contacts/[id]`   | Update fields and tags                   |
| DELETE | `/api/contacts/[id]`   | Delete contact                           |
| POST   | `/api/contacts/import` | Bulk import from array                   |
| GET    | `/api/contacts/export` | Export full CSV                          |

### Lists

| Method | Route                                  | Description                   |
| ------ | -------------------------------------- | ----------------------------- |
| GET    | `/api/lists`                           | List with contact count       |
| POST   | `/api/lists`                           | Create list                   |
| PUT    | `/api/lists/[id]`                      | Update name/description/color |
| DELETE | `/api/lists/[id]`                      | Delete list (cascade)         |
| POST   | `/api/lists/[id]/contacts`             | Add contacts in batch         |
| DELETE | `/api/lists/[id]/contacts/[contactId]` | Remove contact from list      |

### Campaigns

| Method | Route                                       | Description                       |
| ------ | ------------------------------------------- | --------------------------------- |
| GET    | `/api/campaigns`                            | List campaigns (filter by status) |
| POST   | `/api/campaigns`                            | Create draft                      |
| GET    | `/api/campaigns/[id]`                       | Detail with metrics               |
| PUT    | `/api/campaigns/[id]`                       | Update campaign                   |
| DELETE | `/api/campaigns/[id]`                       | Delete campaign                   |
| POST   | `/api/campaigns/[id]/send`                  | Launch send                       |
| POST   | `/api/campaigns/[id]/retry`                 | Retry failed sends                |
| POST   | `/api/campaigns/[id]/pause`                 | Pause active send                 |
| GET    | `/api/campaigns/[id]/progress`              | Real-time send progress           |
| POST   | `/api/campaigns/[id]/sends/[sendId]/resend` | Resend individual recipient       |
| GET    | `/api/campaigns/[id]/sends`                 | List individual sends             |

### Tracking & Analytics

| Method | Route              | Description          |
| ------ | ------------------ | -------------------- |
| GET    | `/api/track/open`  | Open pixel (GIF 1×1) |
| GET    | `/api/track/click` | Tracked redirect     |
| GET    | `/api/analytics`   | Dashboard KPIs       |
| GET    | `/api/unsubscribe` | Unsubscribe          |
| DELETE | `/api/reset`       | Selective data reset |

---

- **Privacy**: Contact and campaign data persist in your local SQLite database. Your data **never** leaves your server and is not accessible by third parties.
- **Ghost Mode**: High-level obfuscation for maximum privacy (see the Ghost Mode section above for access details).

---

## 📄 Demo Templates

Find a professional sample template at: `data/demo/email_demo.html`
Two contact lists are also available for testing: `data/demo/contacts_demo.csv` and `data/demo/contacts_demo.xlsx`.

---

## 📝 ToDo / Pending

- [x] **Campaigns** — Review full functionalities (wizard, sending, statuses, injected tracking). Functional and basic tested, but requires in-depth testing.
- [x] **Contacts** — Review CRUD, Excel import, CSV export, drag-to-list, pagination, and filters. Functional and basic tested, but requires in-depth testing.
- [x] **Analytics** — Review KPIs, last opens, top campaigns, and tracking events. Functional and basic tested, but requires in-depth testing.
- [x] **Internationalize Editor** — Visual editor viewer internationalization (currently only in Spanish).
- [ ] **Responsive Editor** — Complex and not very useful on mobile due to many options; the editor is designed for desktop use.

---

## ⚖️ License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

### 🔑 Key Requirements

- **Copyleft**: Any modifications must be released under the same license.
- **Network Interaction**: If you run a modified version as a service (SaaS), you **must** provide the source code to your users.
- **Commercial Use**: Free for personal and open-source projects. For commercial use without opening your source code, a **private commercial license** is required.

For commercial licensing inquiries, please contact me.

---

⚠️ **Responsible Use:** Designed for legitimate and permission-based mailings (newsletters, B2B). **Spam is strictly prohibited.** By using this tool, you agree to comply with Google's policies and privacy laws (GDPR, etc.) under your own responsibility.

## ⚖️ Legal Disclaimer

This project is a development tool. Misuse for unsolicited communications (SPAM) is prohibited. Ensure compliance with local regulations (GDPR, CAN-SPAM Act, LSSI-CE) before performing bulk mailings.

---

**Developed with ❤️ by Crazyramirez while devouring countless YouTube podcasts in the background.**
