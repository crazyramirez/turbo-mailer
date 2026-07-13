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
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  statusIdx: index('contacts_status_idx').on(t.status),
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
  status: text('status', { enum: ['draft', 'scheduled', 'sending', 'sent', 'paused'] }).notNull().default('draft'),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  totalRecipients: integer('total_recipients').default(0),
  sentCount: integer('sent_count').default(0),
  openCount: integer('open_count').default(0),
  clickCount: integer('click_count').default(0),
  failCount: integer('fail_count').default(0),
  unsubEmailSubject: text('unsub_email_subject'),
  unsubEmailMessage: text('unsub_email_message'),
  resubEmailSubject: text('resub_email_subject'),
  resubEmailMessage: text('resub_email_message'),
}, (t) => ({
  statusIdx: index('campaigns_status_idx').on(t.status),
}))

export const sends = sqliteTable('sends', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  email: text('email').notNull(),
  personalizedSubject: text('personalized_subject'),
  status: text('status', { enum: ['pending', 'sent', 'failed', 'bounced', 'opened'] }).notNull().default('pending'),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  errorMsg: text('error_msg'),
}, (t) => ({
  campaignStatusIdx: index('sends_campaign_status_idx').on(t.campaignId, t.status),
  sentAtIdx: index('sends_sent_at_idx').on(t.sentAt),
}))

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  ip: text('ip').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
})

export const refreshTokens = sqliteTable('refresh_tokens', {
  token: text('token').primaryKey(),
  ip: text('ip').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
})

export const trackingEvents = sqliteTable('tracking_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sendId: integer('send_id').references(() => sends.id, { onDelete: 'cascade' }),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  eventType: text('event_type', { enum: ['open', 'click'] }).notNull(),
  url: text('url'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  campaignIdx: index('te_campaign_idx').on(t.campaignId),
  sendIdx: index('te_send_idx').on(t.sendId),
  typeIdx: index('te_type_idx').on(t.eventType),
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
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  createdAtIdx: index('audit_log_created_at_idx').on(t.createdAt),
  actionIdx: index('audit_log_action_idx').on(t.action),
}))
