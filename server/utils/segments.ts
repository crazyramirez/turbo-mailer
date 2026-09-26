import { sqlite } from '~/server/db/index'
import { listCustomFields, FIELD_KEY_RE } from '~/server/utils/custom-fields'

// Dynamic segments: a rule tree compiled to a parameterized SQL WHERE clause.
// Every field is whitelisted, every value bound — user input never reaches
// the SQL text. Evaluated at send time, so a segment is always current.
//
//   { match: 'all' | 'any', rules: [ Rule | Group ] }   (max depth 3, 60 rules)

export interface SegmentRule { field: string; op: string; value?: unknown }
export interface SegmentGroup { match: 'all' | 'any'; rules: (SegmentRule | SegmentGroup)[] }

type FieldKind = 'string' | 'number' | 'date' | 'boolean' | 'status' | 'tags' | 'list' | 'behavior' | 'verification'

// Built-in fields → SQL expression + kind
const BUILTIN: Record<string, { sql: string; kind: FieldKind }> = {
  email: { sql: 'c.email', kind: 'string' },
  email_domain: { sql: `LOWER(SUBSTR(c.email, INSTR(c.email, '@') + 1))`, kind: 'string' },
  name: { sql: 'c.name', kind: 'string' },
  company: { sql: 'c.company', kind: 'string' },
  role: { sql: 'c.role', kind: 'string' },
  phone: { sql: 'c.phone', kind: 'string' },
  url: { sql: 'c.url', kind: 'string' },
  locale: { sql: 'c.locale', kind: 'string' },
  source: { sql: 'c.source', kind: 'string' },
  status: { sql: 'c.status', kind: 'status' },
  created_at: { sql: 'c.created_at', kind: 'date' },
  last_engaged_at: { sql: 'c.last_engaged_at', kind: 'date' },
  last_sent_at: { sql: 'c.last_sent_at', kind: 'date' },
  engagement_score: { sql: 'COALESCE(c.engagement_score, 0)', kind: 'number' },
  sent_since_engaged: { sql: 'COALESCE(c.sent_since_engaged, 0)', kind: 'number' },
  tags: { sql: 'c.tags', kind: 'tags' },
  list: { sql: 'c.id', kind: 'list' },
  verification: { sql: `json_extract(c.verification, '$.status')`, kind: 'verification' },
  behavior: { sql: 'c.id', kind: 'behavior' },
}

export const SEGMENT_OPS: Record<FieldKind, string[]> = {
  string: ['eq', 'neq', 'contains', 'not_contains', 'starts', 'ends', 'empty', 'not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'],
  date: ['before', 'after', 'within_days', 'older_than_days', 'empty', 'not_empty', 'anniversary_in_days'],
  boolean: ['is_true', 'is_false', 'empty'],
  status: ['eq', 'neq'],
  tags: ['has_any', 'has_all', 'has_none'],
  list: ['in', 'not_in'],
  verification: ['eq', 'neq', 'empty'],
  behavior: ['opened_campaign', 'not_opened_campaign', 'clicked_campaign', 'not_clicked_campaign', 'received_campaign', 'not_received_campaign',
    'clicked_url_contains', 'engaged_within_days', 'not_engaged_within_days', 'received_within_days'],
}

function fieldInfo(field: string): { sql: string; kind: FieldKind } | null {
  if (BUILTIN[field]) return BUILTIN[field]
  const m = field.match(/^custom\.(.+)$/)
  if (!m || !FIELD_KEY_RE.test(m[1])) return null
  const def = listCustomFields().find(d => d.key === m[1])
  if (!def) return null
  const path = `json_extract(c.custom, '$.${m[1]}')`
  const kind: FieldKind = def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : def.type === 'boolean' ? 'boolean' : 'string'
  return { sql: path, kind }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`)

function num(v: unknown, what = 'value'): number {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`${what}: número no válido`)
  return n
}

function compileRule(rule: SegmentRule, params: unknown[]): string {
  const info = fieldInfo(rule.field)
  if (!info) throw new Error(`Campo desconocido: ${rule.field}`)
  if (!SEGMENT_OPS[info.kind].includes(rule.op)) throw new Error(`Operador «${rule.op}» no válido para ${rule.field}`)
  const f = info.sql
  const v = rule.value
  const now = Math.floor(Date.now() / 1000)
  const isCustomDate = info.kind === 'date' && f.startsWith('json_extract')
  // Dates: builtin columns are unix seconds; custom dates are 'YYYY-MM-DD'
  const dateExpr = isCustomDate ? `CAST(strftime('%s', ${f}) AS INTEGER)` : f

  switch (info.kind) {
    case 'string':
    case 'verification': {
      const s = String(v ?? '').toLowerCase()
      switch (rule.op) {
        case 'eq': params.push(s); return `LOWER(COALESCE(${f}, '')) = ?`
        case 'neq': params.push(s); return `LOWER(COALESCE(${f}, '')) != ?`
        case 'contains': params.push(`%${escapeLike(s)}%`); return `LOWER(COALESCE(${f}, '')) LIKE ? ESCAPE '\\'`
        case 'not_contains': params.push(`%${escapeLike(s)}%`); return `LOWER(COALESCE(${f}, '')) NOT LIKE ? ESCAPE '\\'`
        case 'starts': params.push(`${escapeLike(s)}%`); return `LOWER(COALESCE(${f}, '')) LIKE ? ESCAPE '\\'`
        case 'ends': params.push(`%${escapeLike(s)}`); return `LOWER(COALESCE(${f}, '')) LIKE ? ESCAPE '\\'`
        case 'empty': return `COALESCE(${f}, '') = ''`
        case 'not_empty': return `COALESCE(${f}, '') != ''`
      }
      break
    }
    case 'number':
      if (rule.op === 'empty') return `${f} IS NULL`
      if (rule.op === 'not_empty') return `${f} IS NOT NULL`
      params.push(num(v))
      return `CAST(${f} AS REAL) ${{ eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }[rule.op]} ?`
    case 'date': {
      switch (rule.op) {
        case 'empty': return `${f} IS NULL`
        case 'not_empty': return `${f} IS NOT NULL`
        case 'before':
        case 'after': {
          const t = Date.parse(String(v))
          if (!Number.isFinite(t)) throw new Error('Fecha no válida')
          params.push(Math.floor(t / 1000))
          return `${dateExpr} ${rule.op === 'before' ? '<' : '>'} ?`
        }
        case 'within_days': params.push(now - num(v, 'días') * 86400); return `${dateExpr} >= ?`
        case 'older_than_days': params.push(now - num(v, 'días') * 86400); return `(${f} IS NOT NULL AND ${dateExpr} < ?)`
        case 'anniversary_in_days': {
          // Birthdays / anniversaries: month-day equals today + N days
          const d = new Date(Date.now() + num(v, 'días') * 86400_000)
          params.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
          return isCustomDate ? `strftime('%m-%d', ${f}) = ?` : `strftime('%m-%d', ${f}, 'unixepoch', 'localtime') = ?`
        }
      }
      break
    }
    case 'boolean':
      if (rule.op === 'empty') return `${f} IS NULL`
      return rule.op === 'is_true' ? `${f} IN (1, 'true')` : `(${f} IS NULL OR ${f} IN (0, 'false'))`
    case 'status':
      if (!['active', 'unsubscribed', 'bounced', 'inactive'].includes(String(v))) throw new Error('Estado no válido')
      params.push(String(v))
      return `c.status ${rule.op === 'eq' ? '=' : '!='} ?`
    case 'tags': {
      const tags = (Array.isArray(v) ? v : [v]).map(t => String(t ?? '').trim().toLowerCase()).filter(Boolean).slice(0, 30)
      if (!tags.length) throw new Error('Indica al menos una etiqueta')
      const one = `EXISTS (SELECT 1 FROM json_each(COALESCE(c.tags, '[]')) j WHERE LOWER(TRIM(j.value)) = ?)`
      if (rule.op === 'has_any') { params.push(...tags); return `(${tags.map(() => one).join(' OR ')})` }
      if (rule.op === 'has_all') { params.push(...tags); return `(${tags.map(() => one).join(' AND ')})` }
      params.push(...tags)
      return `NOT (${tags.map(() => one).join(' OR ')})`
    }
    case 'list':
      params.push(num(v, 'lista'))
      return `c.id ${rule.op === 'in' ? 'IN' : 'NOT IN'} (SELECT contact_id FROM list_contacts WHERE list_id = ?)`
    case 'behavior': {
      const human = `(te.event_type = 'click' OR (te.event_type = 'open' AND COALESCE(te.is_proxy, 0) = 0))`
      switch (rule.op) {
        case 'opened_campaign':
        case 'not_opened_campaign':
          params.push(num(v, 'campaña'))
          return `${rule.op.startsWith('not') ? 'NOT ' : ''}EXISTS (SELECT 1 FROM tracking_events te WHERE te.contact_id = c.id AND te.campaign_id = ? AND ${human})`
        case 'clicked_campaign':
        case 'not_clicked_campaign':
          params.push(num(v, 'campaña'))
          return `${rule.op.startsWith('not') ? 'NOT ' : ''}EXISTS (SELECT 1 FROM tracking_events te WHERE te.contact_id = c.id AND te.campaign_id = ? AND te.event_type = 'click')`
        case 'received_campaign':
        case 'not_received_campaign':
          params.push(num(v, 'campaña'))
          return `${rule.op.startsWith('not') ? 'NOT ' : ''}EXISTS (SELECT 1 FROM sends s WHERE s.contact_id = c.id AND s.campaign_id = ? AND s.status IN ('sent', 'opened'))`
        case 'clicked_url_contains':
          params.push(`%${escapeLike(String(v ?? '').toLowerCase())}%`)
          return `EXISTS (SELECT 1 FROM tracking_events te WHERE te.contact_id = c.id AND te.event_type = 'click' AND LOWER(te.url) LIKE ? ESCAPE '\\')`
        case 'engaged_within_days':
          params.push(now - num(v, 'días') * 86400)
          return `COALESCE(c.last_engaged_at, 0) >= ?`
        case 'not_engaged_within_days':
          params.push(now - num(v, 'días') * 86400)
          return `COALESCE(c.last_engaged_at, 0) < ?`
        case 'received_within_days':
          params.push(now - num(v, 'días') * 86400)
          return `COALESCE(c.last_sent_at, 0) >= ?`
      }
    }
  }
  throw new Error(`Regla no soportada: ${rule.field} ${rule.op}`)
}

let ruleCount = 0

function compileGroup(group: SegmentGroup, params: unknown[], depth: number): string {
  if (depth > 3) throw new Error('Demasiados niveles de anidación (máx. 3)')
  if (!group || !Array.isArray(group.rules)) throw new Error('Grupo de reglas no válido')
  const parts: string[] = []
  for (const r of group.rules) {
    if (++ruleCount > 60) throw new Error('Demasiadas reglas (máx. 60)')
    if ((r as SegmentGroup).rules) parts.push(`(${compileGroup(r as SegmentGroup, params, depth + 1)})`)
    else parts.push(compileRule(r as SegmentRule, params))
  }
  if (!parts.length) return '1 = 1'
  return parts.join(group.match === 'any' ? ' OR ' : ' AND ')
}

export function compileSegment(group: SegmentGroup): { where: string; params: unknown[] } {
  ruleCount = 0
  const params: unknown[] = []
  const where = compileGroup(group, params, 1)
  return { where, params }
}

/** Throws a user-facing error when the rules are invalid. */
export function validateSegment(group: unknown): SegmentGroup {
  const g = group as SegmentGroup
  if (!g || (g.match !== 'all' && g.match !== 'any') || !Array.isArray(g.rules)) throw new Error('Estructura de reglas no válida')
  compileSegment(g)
  return g
}

export function evaluateSegmentRules(group: SegmentGroup, opts: { onlyActive?: boolean; limit?: number; contactId?: number } = {}) {
  const { where, params } = compileSegment(group)
  const extra: string[] = []
  const p = [...params]
  if (opts.onlyActive) extra.push(`c.status = 'active'`)
  if (opts.contactId) { extra.push('c.id = ?'); p.push(opts.contactId) }
  const sql = `SELECT c.* FROM contacts c WHERE (${where})${extra.length ? ` AND ${extra.join(' AND ')}` : ''}${opts.limit ? ` LIMIT ${Math.max(1, Math.floor(opts.limit))}` : ''}`
  return sqlite.prepare(sql).all(...p) as Record<string, any>[]
}

export function countSegmentRules(group: SegmentGroup, onlyActive = true): number {
  const { where, params } = compileSegment(group)
  return (sqlite.prepare(`SELECT COUNT(*) AS n FROM contacts c WHERE (${where})${onlyActive ? ` AND c.status = 'active'` : ''}`).get(...params) as { n: number }).n
}

/** Does one contact match? (automation conditions) */
export function contactMatches(group: SegmentGroup, contactId: number): boolean {
  return evaluateSegmentRules(group, { contactId, limit: 1 }).length > 0
}

// Rows from raw SQL use snake_case — map them to the Drizzle contact shape
// the send pipeline expects.
export function rowToContact(r: Record<string, any>) {
  const json = (v: any, fb: any) => { try { return v ? JSON.parse(v) : fb } catch { return fb } }
  const ts = (v: any) => (v ? new Date(Number(v) * 1000) : null)
  return {
    id: r.id, email: r.email, name: r.name, company: r.company, role: r.role, phone: r.phone,
    linkedin: r.linkedin, url: r.url, youtube: r.youtube, instagram: r.instagram,
    tags: json(r.tags, []), status: r.status, preferences: json(r.preferences, null),
    failCount: r.fail_count, subChangeCount: r.sub_change_count, subChangeWindowStart: ts(r.sub_change_window_start),
    custom: json(r.custom, null), locale: r.locale, source: r.source, topicOptOuts: json(r.topic_opt_outs, null),
    lastSentAt: ts(r.last_sent_at), lastEngagedAt: ts(r.last_engaged_at), sentSinceEngaged: r.sent_since_engaged,
    engagementScore: r.engagement_score, bestSendHour: r.best_send_hour, verification: json(r.verification, null),
    createdAt: ts(r.created_at), updatedAt: ts(r.updated_at),
  }
}

export async function evaluateSegmentById(segmentId: number) {
  const row = sqlite.prepare('SELECT rules FROM segments WHERE id = ?').get(segmentId) as { rules: string } | undefined
  if (!row) return []
  const rules = JSON.parse(row.rules) as SegmentGroup
  return evaluateSegmentRules(rules, { onlyActive: true }).map(rowToContact) as any[]
}
