import { describe, it, expect } from 'vitest'
import { contactMatchesTags, sanitizeTagFilter } from '~/server/utils/segment'

describe('contactMatchesTags', () => {
  it('matches everyone when filter is empty or absent', () => {
    expect(contactMatchesTags(['vip'], [])).toBe(true)
    expect(contactMatchesTags(['vip'], undefined)).toBe(true)
    expect(contactMatchesTags(null, [])).toBe(true)
  })

  it('matches when contact has at least one filter tag', () => {
    expect(contactMatchesTags(['vip', 'madrid'], ['vip'])).toBe(true)
    expect(contactMatchesTags(['madrid'], ['vip', 'madrid'])).toBe(true)
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(contactMatchesTags(['VIP '], ['vip'])).toBe(true)
    expect(contactMatchesTags(['cliente'], [' CLIENTE'])).toBe(true)
  })

  it('rejects contacts without matching tags', () => {
    expect(contactMatchesTags(['barcelona'], ['madrid'])).toBe(false)
    expect(contactMatchesTags([], ['vip'])).toBe(false)
    expect(contactMatchesTags(null, ['vip'])).toBe(false)
  })

  it('tolerates malformed tag data', () => {
    expect(contactMatchesTags('not-an-array', ['vip'])).toBe(false)
    expect(contactMatchesTags([123, null], ['123'])).toBe(true)
  })
})

describe('sanitizeTagFilter', () => {
  it('trims, dedupes case-insensitively, drops empties', () => {
    expect(sanitizeTagFilter([' vip ', 'VIP', '', 'madrid'])).toEqual(['vip', 'madrid'])
  })

  it('returns empty array for non-array input', () => {
    expect(sanitizeTagFilter(undefined)).toEqual([])
    expect(sanitizeTagFilter('vip')).toEqual([])
    expect(sanitizeTagFilter({})).toEqual([])
  })

  it('caps at 20 tags and 50 chars per tag', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`)
    expect(sanitizeTagFilter(many)).toHaveLength(20)
    expect(sanitizeTagFilter(['x'.repeat(80)])[0]).toHaveLength(50)
  })
})
