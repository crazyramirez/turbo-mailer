// Segment rule tree as edited in the UI (mirrors server/utils/segments.ts).

export interface SegRule { field: string; op: string; value?: any }
export interface SegGroup { match: 'all' | 'any'; rules: (SegRule | SegGroup)[] }
export interface SegMeta {
  fields: { key: string; kind: string; label?: string; options?: string[] | null }[]
  ops: Record<string, string[]>
  lists: { id: number; name: string }[]
  campaigns: { id: number; name: string }[]
  tags: { tag: string; n: number }[]
}
