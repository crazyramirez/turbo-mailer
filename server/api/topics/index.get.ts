import { sqlite } from '~/server/db/index'

export default defineEventHandler(() => {
  const topics = sqlite.prepare('SELECT id, name, description, is_public AS isPublic, sort_order AS sortOrder FROM topics ORDER BY sort_order, id').all() as any[]
  // How many active contacts opted out of each topic
  const outs = sqlite.prepare(
    `SELECT CAST(j.value AS INTEGER) AS id, COUNT(*) AS n FROM contacts c, json_each(COALESCE(c.topic_opt_outs, '[]')) j
     WHERE c.status = 'active' GROUP BY CAST(j.value AS INTEGER)`,
  ).all() as { id: number; n: number }[]
  const map = new Map(outs.map(o => [o.id, o.n]))
  return topics.map(t => ({ ...t, isPublic: !!t.isPublic, optedOut: map.get(t.id) ?? 0 }))
})
