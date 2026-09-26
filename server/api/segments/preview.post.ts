import { validateSegment, countSegmentRules, evaluateSegmentRules } from '~/server/utils/segments'

// Live count + sample while the user builds the rules.
export default defineEventHandler(async (event) => {
  const b = await readBody<{ rules?: unknown }>(event)
  let rules
  try { rules = validateSegment(b?.rules) } catch (err: any) {
    return { ok: false, error: err.message }
  }
  const sample = evaluateSegmentRules(rules, { onlyActive: true, limit: 8 })
    .map(c => ({ id: c.id, email: c.email, name: c.name, company: c.company }))
  return { ok: true, count: countSegmentRules(rules, true), total: countSegmentRules(rules, false), sample }
})
