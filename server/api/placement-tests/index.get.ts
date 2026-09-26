import { sqlite } from '~/server/db/index'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getQuery(event).campaignId) || null
  const rows = sqlite.prepare(
    `SELECT p.id, p.campaign_id AS campaignId, c.name AS campaignName, p.status, p.results, p.created_at AS createdAt, p.finished_at AS finishedAt
     FROM placement_tests p LEFT JOIN campaigns c ON c.id = p.campaign_id
     ${campaignId ? 'WHERE p.campaign_id = ?' : ''}
     ORDER BY p.id DESC LIMIT 30`,
  ).all(...(campaignId ? [campaignId] : [])) as any[]
  return rows.map(r => ({
    ...r,
    results: (() => { try { return JSON.parse(r.results || '[]') } catch { return [] } })(),
    createdAt: r.createdAt ? new Date(r.createdAt * 1000).toISOString() : null,
    finishedAt: r.finishedAt ? new Date(r.finishedAt * 1000).toISOString() : null,
  }))
})
