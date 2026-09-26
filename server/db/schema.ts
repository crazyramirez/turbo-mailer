import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'

export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  company: text('company'),
  role: text('role'),
  phone: text('phone'),
  linkedin: text('linkedin'),
  url: text('url'),
  youtube: text('youtube'),
  instagram: text('instagram'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  status: text('status', { enum: ['active', 'unsubscribed', 'bounced', 'inactive'] }).notNull().default('active'),
  preferences: text('preferences', { mode: 'json' }).$type<{ frequency?: 'all' | 'weekly' | 'monthly' }>(),
  failCount: integer('fail_count').default(0),
  subChangeCount: integer('sub_change_count').default(0),
  subChangeWindowStart: integer('sub_change_window_start', { mode: 'timestamp' }),
  // Typed custom fields (definitions in custom_fields), keyed by field key
  custom: text('custom', { mode: 'json' }).$type<Record<string, string | number | boolean | null>>(),
  locale: text('locale'),
  // Where the contact came from: import, api, form:<id>, manual...
  source: text('source'),
  // Preference-center topics the contact opted OUT of (ids from topics)
  topicOptOuts: text('topic_opt_outs', { mode: 'json' }).$type<number[]>(),
  lastSentAt: integer('last_sent_at', { mode: 'timestamp' }),
  // Last human engagement (confirmed open or click) — drives sunset policy
  lastEngagedAt: integer('last_engaged_at', { mode: 'timestamp' }),
  // Marketing emails delivered since the last engagement (sunset policy)
  sentSinceEngaged: integer('sent_since_engaged').default(0),
  engagementScore: integer('engagement_score').default(0),
  // Local hour (0-23) with the most human engagement — send-time optimization
  bestSendHour: integer('best_send_hour'),
  verification: text('verification', { mode: 'json' }).$type<{
    status: 'valid' | 'risky' | 'invalid'
    reasons: string[]
    suggestion?: string
    checkedAt: string
  }>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  statusIdx: index('contacts_status_idx').on(t.status),
  lastEngagedIdx: index('contacts_last_engaged_idx').on(t.lastEngagedAt),
}))

export const lists = sqliteTable('lists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#6366f1'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const listContacts = sqliteTable('list_contacts', {
  listId: integer('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.listId, t.contactId] }),
}))

export const campaigns = sqliteTable('campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  templateName: text('template_name'),
  templateHtml: text('template_html'),
  listId: integer('list_id').references(() => lists.id),
  // Segmentation: if non-empty, only list contacts having at least one of these tags receive the campaign
  tagFilter: text('tag_filter', { mode: 'json' }).$type<string[]>().default([]),
  // Follow-up campaigns: when set, recipients come from the source campaign's
  // delivered-but-unopened sends instead of the list
  resendOfId: integer('resend_of_id'),
  // A/B subject test: when subjectB is set, a sample split between A/B is sent
  // first; after abWaitMinutes the variant with more opens goes to the rest
  subjectB: text('subject_b'),
  abSamplePct: integer('ab_sample_pct').default(20),
  abWaitMinutes: integer('ab_wait_minutes').default(240),
  abPhase: text('ab_phase', { enum: ['sample', 'waiting', 'final'] }),
  abDecideAt: integer('ab_decide_at', { mode: 'timestamp' }),
  abWinner: text('ab_winner', { enum: ['A', 'B'] }),
  // Auto follow-up (drip): once the campaign finishes, after followUpDelayHours
  // the scheduler sends followUpSubject to recipients who never opened.
  // followUpDoneAt marks the trigger as consumed; followUpCampaignId links the
  // created follow-up (null when there was nobody left to contact).
  followUpSubject: text('follow_up_subject'),
  followUpDelayHours: integer('follow_up_delay_hours').default(48),
  followUpDoneAt: integer('follow_up_done_at', { mode: 'timestamp' }),
  followUpCampaignId: integer('follow_up_campaign_id'),
  status: text('status', { enum: ['draft', 'scheduled', 'sending', 'sent', 'paused'] }).notNull().default('draft'),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  totalRecipients: integer('total_recipients').default(0),
  sentCount: integer('sent_count').default(0),
  // openCount includes privacy-proxy prefetches (Apple MPP and friends), which
  // fire even when the mail is never opened. confirmedOpenCount excludes them
  // and is the honest number; both are kept so the UI can show the gap.
  openCount: integer('open_count').default(0),
  confirmedOpenCount: integer('confirmed_open_count').default(0),
  clickCount: integer('click_count').default(0),
  failCount: integer('fail_count').default(0),
  unsubEmailSubject: text('unsub_email_subject'),
  unsubEmailMessage: text('unsub_email_message'),
  resubEmailSubject: text('resub_email_subject'),
  resubEmailMessage: text('resub_email_message'),
  // Hidden inbox preview text shown next to the subject
  preheader: text('preheader'),
  // regular = user campaign; automation/transactional = hidden carriers whose
  // sends belong to an automation step or the transactional API
  kind: text('kind', { enum: ['regular', 'automation', 'transactional'] }).notNull().default('regular'),
  // Dynamic segment used instead of (or on top of) the list
  segmentId: integer('segment_id'),
  // Preference-center topic: contacts who opted out of it are skipped
  topicId: integer('topic_id'),
  // SMTP profile to send through (null = default profile with failover)
  senderProfileId: text('sender_profile_id'),
  // Send-time optimization: each contact gets the mail at their best hour
  stoEnabled: integer('sto_enabled', { mode: 'boolean' }).default(false),
  // Include contacts the sunset policy would otherwise exclude
  ignoreSunset: integer('ignore_sunset', { mode: 'boolean' }).default(false),
  utmParams: text('utm_params', { mode: 'json' }).$type<{ source?: string; medium?: string; campaign?: string } | null>(),
  // Why the pipeline paused the campaign by itself (circuit breaker, SMTP down)
  pauseReason: text('pause_reason'),
  // Hard bounces (sync + async), spam complaints and unsubscribes it caused
  bounceCount: integer('bounce_count').default(0),
  complaintCount: integer('complaint_count').default(0),
  unsubscribeCount: integer('unsubscribe_count').default(0),
  aiInsights: text('ai_insights', { mode: 'json' }).$type<Record<string, unknown> | null>(),
}, (t) => ({
  statusIdx: index('campaigns_status_idx').on(t.status),
}))

export const sends = sqliteTable('sends', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  email: text('email').notNull(),
  personalizedSubject: text('personalized_subject'),
  // 'held' = A/B holdout waiting for the winning variant to be decided
  // 'sending' = claimed by the engine, SMTP transaction in flight
  // 'skipped' = deliberately not sent (unsubscribed meanwhile, suppressed,
  //             frequency cap, topic opt-out...) — reason in errorMsg
  status: text('status', { enum: ['pending', 'sending', 'sent', 'failed', 'bounced', 'opened', 'held', 'skipped'] }).notNull().default('pending'),
  variant: text('variant', { enum: ['A', 'B'] }),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  errorMsg: text('error_msg'),
  // True when this send reached 'opened' only through a privacy-proxy prefetch.
  // Cleared as soon as a human open or any click confirms real engagement.
  openedByProxy: integer('opened_by_proxy', { mode: 'boolean' }).default(false),
  // Our Message-ID — lets bounce/complaint reports be matched to this exact send
  messageId: text('message_id'),
  // Not before this instant (send-time optimization, transient-failure backoff)
  scheduledFor: integer('scheduled_for', { mode: 'timestamp' }),
  attempts: integer('attempts').default(0),
  // SMTP profile that actually delivered it
  profileId: text('profile_id'),
  // hard | soft | block | complaint — how a failed/bounced send failed
  bounceClass: text('bounce_class'),
}, (t) => ({
  campaignStatusIdx: index('sends_campaign_status_idx').on(t.campaignId, t.status),
  sentAtIdx: index('sends_sent_at_idx').on(t.sentAt),
  messageIdIdx: index('sends_message_id_idx').on(t.messageId),
  contactIdx: index('sends_contact_idx').on(t.contactId),
  emailIdx: index('sends_email_idx').on(t.email),
}))

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  ip: text('ip').notNull(),
  // null = legacy single-password session (acts as owner)
  userId: integer('user_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
})

export const refreshTokens = sqliteTable('refresh_tokens', {
  token: text('token').primaryKey(),
  ip: text('ip').notNull(),
  userId: integer('user_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
})

export const trackingEvents = sqliteTable('tracking_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sendId: integer('send_id').references(() => sends.id, { onDelete: 'cascade' }),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  eventType: text('event_type', { enum: ['open', 'click', 'unsubscribe', 'bounce', 'complaint'] }).notNull(),
  url: text('url'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  // Machine-generated prefetch (Apple MPP, Gmail image proxy...) rather than a
  // human opening the mail. Kept as data instead of discarded, so historical
  // rates stay reconstructable either way.
  isProxy: integer('is_proxy', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  campaignIdx: index('te_campaign_idx').on(t.campaignId),
  sendIdx: index('te_send_idx').on(t.sendId),
  typeIdx: index('te_type_idx').on(t.eventType),
  // Both dedup queries filter on createdAt within a send; without this they
  // degrade to a scan of the send's whole event history.
  sendTypeCreatedIdx: index('te_send_type_created_idx').on(t.sendId, t.eventType, t.createdAt),
}))

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const loginAttempts = sqliteTable('login_attempts', {
  ip: text('ip').primaryKey(),
  count: integer('count').notNull().default(0),
  firstAttempt: integer('first_attempt', { mode: 'timestamp' }).notNull(),
  blockedUntil: integer('blocked_until', { mode: 'timestamp' }),
})

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(),
  detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
  ip: text('ip'),
  userId: integer('user_id'),
  userEmail: text('user_email'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  createdAtIdx: index('audit_log_created_at_idx').on(t.createdAt),
  actionIdx: index('audit_log_action_idx').on(t.action),
}))

// Global suppression list. Keyed by a SHA-256 of the normalized address so it
// survives contact deletion (GDPR erasure) without keeping the address itself.
export const suppressions = sqliteTable('suppressions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  emailHash: text('email_hash').notNull().unique(),
  // Masked address (a***@gmail.com) so the list is readable without storing PII
  emailHint: text('email_hint'),
  reason: text('reason', { enum: ['unsubscribed', 'bounced', 'complained', 'manual', 'invalid'] }).notNull(),
  detail: text('detail'),
  source: text('source'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// DNS blocklist checks of the sending infrastructure (IPs and domains)
export const blocklistChecks = sqliteTable('blocklist_checks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  target: text('target').notNull(),
  targetType: text('target_type', { enum: ['ip', 'domain'] }).notNull(),
  zone: text('zone').notNull(),
  // 'unknown' = the list refused to answer (e.g. Spamhaus via a public
  // resolver). Never reported as listed — that would be a false alarm.
  result: text('result', { enum: ['listed', 'clean', 'unknown'] }).notNull(),
  detail: text('detail'),
  checkedAt: integer('checked_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  checkedIdx: index('blocklist_checked_idx').on(t.checkedAt),
}))

// Parsed DMARC aggregate (rua) reports received over IMAP
export const dmarcReports = sqliteTable('dmarc_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reportKey: text('report_key').notNull().unique(),
  orgName: text('org_name'),
  domain: text('domain'),
  policy: text('policy'),
  dateBegin: integer('date_begin', { mode: 'timestamp' }),
  dateEnd: integer('date_end', { mode: 'timestamp' }),
  total: integer('total').default(0),
  dmarcPass: integer('dmarc_pass').default(0),
  spfAligned: integer('spf_aligned').default(0),
  dkimAligned: integer('dkim_aligned').default(0),
  sources: text('sources', { mode: 'json' }).$type<{ ip: string; count: number; disposition: string; dkim: string; spf: string }[]>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Inbox placement tests against the user's own seed mailboxes
export const placementTests = sqliteTable('placement_tests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
  results: text('results', { mode: 'json' }).$type<{ seed: string; provider: string; placement: 'inbox' | 'promotions' | 'spam' | 'missing' | 'error' | 'pending'; folder?: string; detail?: string }[]>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
})

// GDPR consent trail: every subscribe / confirm / unsubscribe / resubscribe /
// complaint with its source and evidence. Keyed by hash as well, so the trail
// survives erasure of the contact row.
export const consentLog = sqliteTable('consent_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: integer('contact_id'),
  emailHash: text('email_hash').notNull(),
  action: text('action', { enum: ['subscribe', 'confirm', 'unsubscribe', 'resubscribe', 'complaint', 'import', 'erase', 'manual'] }).notNull(),
  source: text('source'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  // Exact consent wording shown to the person (forms)
  consentText: text('consent_text'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  hashIdx: index('consent_hash_idx').on(t.emailHash),
  contactIdx: index('consent_contact_idx').on(t.contactId),
}))

// ── Platform: users, API keys ──────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['owner', 'admin', 'editor', 'viewer'] }).notNull().default('editor'),
  // AES-GCM encrypted base32 TOTP secret
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).default(false),
  // Last accepted TOTP time step — a code can't be replayed within its window
  totpLastStep: integer('totp_last_step'),
  // JSON array of SHA-256 hashes of unused one-time recovery codes
  recoveryCodes: text('recovery_codes', { mode: 'json' }).$type<string[]>(),
  disabled: integer('disabled', { mode: 'boolean' }).default(false),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const apiKeys = sqliteTable('api_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  // First chars of the key, shown in the UI to tell keys apart
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  scopes: text('scopes', { mode: 'json' }).$type<string[]>().notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Idempotency-Key replay store for the public API (24h)
export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  apiKeyId: integer('api_key_id'),
  statusCode: integer('status_code').notNull(),
  response: text('response').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// ── Audience ────────────────────────────────────────────────────────────────

export const customFields = sqliteTable('custom_fields', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  type: text('type', { enum: ['text', 'number', 'date', 'boolean', 'select'] }).notNull().default('text'),
  options: text('options', { mode: 'json' }).$type<string[]>(),
  sortOrder: integer('sort_order').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Preference-center topics (news, offers...)
export const topics = sqliteTable('topics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  isPublic: integer('is_public', { mode: 'boolean' }).default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Dynamic segments: rule trees evaluated at send time
export const segments = sqliteTable('segments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  rules: text('rules', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  cachedCount: integer('cached_count'),
  cachedAt: integer('cached_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Hosted / embeddable subscription forms
export const forms = sqliteTable('forms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  publicId: text('public_id').notNull().unique(),
  name: text('name').notNull(),
  listId: integer('list_id').references(() => lists.id, { onDelete: 'set null' }),
  fields: text('fields', { mode: 'json' }).$type<{ key: string; label: string; type: string; required?: boolean }[]>().notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  doubleOptIn: integer('double_opt_in', { mode: 'boolean' }).default(true),
  title: text('title'),
  description: text('description'),
  buttonText: text('button_text'),
  successMessage: text('success_message'),
  redirectUrl: text('redirect_url'),
  consentText: text('consent_text'),
  theme: text('theme', { mode: 'json' }).$type<{ accent?: string; background?: string; text?: string; radius?: number }>(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  submissions: integer('submissions').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// ── Automation ─────────────────────────────────────────────────────────────

export const automations = sqliteTable('automations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  status: text('status', { enum: ['draft', 'active', 'paused'] }).notNull().default('draft'),
  trigger: text('trigger', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  steps: text('steps', { mode: 'json' }).$type<Record<string, unknown>[]>().notNull(),
  // Allow the same contact to enter again after finishing
  allowReentry: integer('allow_reentry', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const automationRuns = sqliteTable('automation_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  automationId: integer('automation_id').notNull().references(() => automations.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['active', 'waiting', 'done', 'exited', 'failed'] }).notNull().default('active'),
  // Path of the current step inside the step tree
  cursor: text('cursor'),
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  context: text('context', { mode: 'json' }).$type<Record<string, unknown>>(),
  lastError: text('last_error'),
  startedAt: integer('started_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
}, (t) => ({
  dueIdx: index('automation_runs_due_idx').on(t.status, t.nextRunAt),
  contactIdx: index('automation_runs_contact_idx').on(t.automationId, t.contactId),
}))

// ── Editor ──────────────────────────────────────────────────────────────────

export const savedBlocks = sqliteTable('saved_blocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  category: text('category'),
  html: text('html').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Per-send content for transactional API emails (each request has its own
// subject/HTML/variables; regular campaigns render from the campaign row)
export const sendPayloads = sqliteTable('send_payloads', {
  sendId: integer('send_id').primaryKey().references(() => sends.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  html: text('html').notNull(),
  text: text('text'),
  vars: text('vars', { mode: 'json' }).$type<Record<string, unknown>>(),
  apiKeyId: integer('api_key_id'),
  idempotencyKey: text('idempotency_key'),
})
