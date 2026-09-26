import { sqlite } from '~/server/db/index'
import { SEGMENT_OPS } from '~/server/utils/segments'
import { listCustomFields } from '~/server/utils/custom-fields'

// Catalog for the segment builder UI: fields, their operators and pickers.
export default defineEventHandler(() => {
  const builtin = [
    { key: 'email', kind: 'string' }, { key: 'email_domain', kind: 'string' }, { key: 'name', kind: 'string' },
    { key: 'company', kind: 'string' }, { key: 'role', kind: 'string' }, { key: 'phone', kind: 'string' },
    { key: 'locale', kind: 'string' }, { key: 'source', kind: 'string' }, { key: 'status', kind: 'status' },
    { key: 'created_at', kind: 'date' }, { key: 'last_engaged_at', kind: 'date' }, { key: 'last_sent_at', kind: 'date' },
    { key: 'engagement_score', kind: 'number' }, { key: 'sent_since_engaged', kind: 'number' },
    { key: 'tags', kind: 'tags' }, { key: 'list', kind: 'list' }, { key: 'verification', kind: 'verification' },
    { key: 'behavior', kind: 'behavior' },
  ]
  const custom = listCustomFields().map(d => ({
    key: `custom.${d.key}`,
    label: d.label,
    kind: d.type === 'number' ? 'number' : d.type === 'date' ? 'date' : d.type === 'boolean' ? 'boolean' : 'string',
    options: d.options,
  }))
  return {
    fields: [...builtin, ...custom],
    ops: SEGMENT_OPS,
    lists: sqlite.prepare('SELECT id, name FROM lists ORDER BY name').all(),
    campaigns: sqlite.prepare(`SELECT id, name FROM campaigns WHERE kind = 'regular' AND status IN ('sent', 'sending', 'paused') ORDER BY id DESC LIMIT 100`).all(),
    tags: sqlite.prepare(`SELECT j.value AS tag, COUNT(*) AS n FROM contacts c, json_each(COALESCE(c.tags, '[]')) j GROUP BY LOWER(j.value) ORDER BY n DESC LIMIT 200`).all(),
  }
})
