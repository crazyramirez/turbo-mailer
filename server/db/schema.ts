import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  company: text('company'),
  phone: text('phone'),
  linkedin: text('linkedin'),
  url: text('url'),
  youtube: text('youtube'),
  instagram: text('instagram'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  status: text('status', { enum: ['active', 'unsubscribed', 'bounced'] }).notNull().default('active'),
  subChangeCount: integer('sub_change_count').default(0),
  subChangeWindowStart: integer('sub_change_window_start', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

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
})

export const campaigns = sqliteTable('campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  templateName: text('template_name'),
  templateHtml: text('template_html'),
  listId: integer('list_id').references(() => lists.id),
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
})

export const sends = sqliteTable('sends', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id),
  email: text('email').notNull(),
  personalizedSubject: text('personalized_subject'),
  status: text('status', { enum: ['pending', 'sent', 'failed', 'bounced', 'opened'] }).notNull().default('pending'),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  errorMsg: text('error_msg'),
})

export const sessions = sqliteTable('sessions', {
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
})
