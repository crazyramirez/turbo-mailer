import type { BlockFields, PlannedBlock } from '~/utils/emailAssembler'

export const AI_GRID_LAYOUT_RULE = 'Distribuye las tarjetas en filas de como máximo dos elementos: usa grid-2. Para tres elementos usa grid-2 seguido de card; para cuatro o más, varios grid-2 y una card final si sobra uno. Conserva todos los elementos y su orden, sin comprimirlos en tres o cuatro columnas.'

export function isWideAiGrid(id: string): boolean {
  return id === 'grid-3' || id === 'grid-4'
}

type GridFields = { title: string[]; subtitle: string[]; images: string[] }
type PairedGrid = { id: 'grid-2' | 'card'; fields: GridFields }

/** Keep each image aligned with its copy, including deliberately empty slots. */
export function splitWideAiGrid(id: string, fields: Pick<BlockFields, 'title' | 'subtitle' | 'images'>): PairedGrid[] | null {
  if (!isWideAiGrid(id)) return null
  const count = id === 'grid-3' ? 3 : 4
  const slots = (value: string | string[] | undefined): string[] => {
    const input = Array.isArray(value) ? value : [value]
    return Array.from({ length: count }, (_, index) => input[index] ?? '')
  }
  const title = slots(fields.title), subtitle = slots(fields.subtitle), images = slots(fields.images)
  const blocks: PairedGrid[] = []
  for (let start = 0; start < count; start += 2) {
    blocks.push({
      id: count - start === 1 ? 'card' : 'grid-2',
      fields: { title: title.slice(start, start + 2), subtitle: subtitle.slice(start, start + 2), images: images.slice(start, start + 2) },
    })
  }
  return blocks
}

/** Apply only to generated plans; manually inserted grid modules remain available. */
export function pairAiGrids(blocks: PlannedBlock[]): PlannedBlock[] {
  return blocks.flatMap(block => splitWideAiGrid(block.id, block.fields) ?? [block])
}
