// Campaign segmentation: tag-based recipient filtering.
// A contact matches when it has at least one of the campaign's filter tags
// (case-insensitive). An empty/absent filter matches everyone.

export function contactMatchesTags(contactTags: unknown, filter: unknown): boolean {
  if (!Array.isArray(filter) || filter.length === 0) return true
  if (!Array.isArray(contactTags) || contactTags.length === 0) return false
  const wanted = new Set(filter.map(t => String(t).trim().toLowerCase()).filter(Boolean))
  if (wanted.size === 0) return true
  return contactTags.some(t => wanted.has(String(t).trim().toLowerCase()))
}

/** Normalizes a user-provided tag filter: trims, drops empties, dedupes, caps at 20. */
export function sanitizeTagFilter(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const tag = String(raw).trim().slice(0, 50)
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 20) break
  }
  return out
}
