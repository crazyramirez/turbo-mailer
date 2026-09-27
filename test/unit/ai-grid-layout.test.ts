import { describe, expect, it } from 'vitest'
import { isWideAiGrid, pairAiGrids, splitWideAiGrid } from '~/utils/aiGridLayout'
import type { PlannedBlock } from '~/utils/emailAssembler'

describe('AI grid layouts', () => {
  it.each([
    ['grid-3', ['grid-2', 'card']],
    ['grid-4', ['grid-2', 'grid-2']],
  ])('splits %s into pairs without dropping or reordering its content', (id, expectedIds) => {
    const count = id === 'grid-3' ? 3 : 4
    const fields = {
      title: Array.from({ length: count }, (_, i) => `Producto ${i + 1}`),
      subtitle: Array.from({ length: count }, (_, i) => `Descripción ${i + 1}`),
      images: Array.from({ length: count }, (_, i) => `asset:${i}`),
    }
    const original = structuredClone(fields)
    const result = splitWideAiGrid(id as string, fields)!

    expect(result.map(block => block.id)).toEqual(expectedIds)
    for (const key of ['title', 'subtitle', 'images'] as const) {
      expect(result.flatMap(block => block.fields[key])).toEqual(fields[key])
    }
    expect(fields).toEqual(original)
  })

  it('keeps empty slots aligned with the correct title when some images and descriptions are missing', () => {
    expect(splitWideAiGrid('grid-3', {
      title: ['Primero', 'Segundo', 'Tercero'],
      subtitle: ['', 'Descripción del segundo', ''],
      images: ['', '', 'asset:2'],
    })).toEqual([
      { id: 'grid-2', fields: { title: ['Primero', 'Segundo'], subtitle: ['', 'Descripción del segundo'], images: ['', ''] } },
      { id: 'card', fields: { title: ['Tercero'], subtitle: [''], images: ['asset:2'] } },
    ])
  })

  it('pads omitted slots and accepts the scalar fields found in existing drafts', () => {
    expect(splitWideAiGrid('grid-3', { title: 'Primero', images: ['', '', 'asset:2'] })).toEqual([
      { id: 'grid-2', fields: { title: ['Primero', ''], subtitle: ['', ''], images: ['', ''] } },
      { id: 'card', fields: { title: [''], subtitle: [''], images: ['asset:2'] } },
    ])
  })

  it.each(['grid-2', 'card', 'pricing', 'metrics', 'unknown'])('does not rewrite a non-grid module (%s)', id => {
    expect(isWideAiGrid(id)).toBe(false)
    expect(splitWideAiGrid(id, { title: ['Uno', 'Dos', 'Tres'] })).toBeNull()
  })

  it('preserves the surrounding CTA, signature and footer when pairing a saved plan', () => {
    const blocks: PlannedBlock[] = [
      { id: 'hero', fields: { title: 'Colección', button: 'Ver colección', buttonUrl: 'https://marca.es/coleccion' } },
      { id: 'grid-3', fields: { title: ['Uno', 'Dos', 'Tres'], subtitle: ['A', 'B', 'C'], images: ['asset:0', '', 'asset:2'] } },
      { id: 'signature', fields: { title: 'Ana García', contact: ['ana@marca.es'], ps: 'Hablamos pronto.' } },
      { id: 'unsubscribe', fields: { subtitle: 'Recibes este email porque te suscribiste. {{COMPANY_ADDRESS}}' } },
    ]
    const original = structuredClone(blocks)
    const output = pairAiGrids(blocks)

    expect(output.map(block => block.id)).toEqual(['hero', 'grid-2', 'card', 'signature', 'unsubscribe'])
    expect(output[0]).toEqual(original[0])
    expect(output.slice(-2)).toEqual(original.slice(-2))
    expect(blocks).toEqual(original)
    expect(pairAiGrids(output)).toEqual(output)
  })
})
