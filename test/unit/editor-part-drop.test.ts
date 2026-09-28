// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPartDrop } from '~/utils/editorPartDrop'

function fixture(rects: number[][]) {
  document.body.innerHTML = '<div class="editable-block"></div>'
  const block = document.querySelector<HTMLElement>('.editable-block')!
  const parts = rects.map((rect, index) => {
    const part = document.createElement('div')
    part.textContent = `Part ${index}`
    block.appendChild(part)
    vi.spyOn(part, 'getBoundingClientRect').mockReturnValue(new DOMRect(...rect))
    return part
  })
  const hit = vi.spyOn(document, 'elementFromPoint')
  const drop = (source: number, hovered: Element, x: number, y: number) => {
    hit.mockReturnValue(hovered)
    return getPartDrop(block, parts[source], x, y)
  }
  return { block, parts, drop }
}

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })

describe('visible module insertion slots', () => {
  it('uses a single guide across both edges and the margin between elements', () => {
    const { block, parts, drop } = fixture([[0, 0, 200, 40], [0, 64, 200, 40], [0, 128, 200, 40], [0, 192, 200, 40]])
    const fromAbove = drop(3, parts[0], 50, 35)
    const inMargin = drop(3, block, 50, 50)
    const fromBelow = drop(3, parts[1], 50, 70)
    expect(fromAbove).toEqual(fromBelow)
    expect(inMargin).toEqual(fromAbove)
    expect(fromAbove).toEqual({ target: parts[1], after: false, guide: { left: 0, top: 50.5, width: 200, height: 3 } })
  })

  it('does not offer either side of the original position as a new destination', () => {
    const { block, parts, drop } = fixture([[0, 0, 200, 40], [0, 64, 200, 40], [0, 128, 200, 40]])
    expect(drop(1, parts[0], 50, 35)).toBeNull()
    expect(drop(1, parts[2], 50, 130)).toBeNull()
    expect(drop(1, block, 50, 52)).toBeNull()
    expect(drop(1, parts[1], 50, 80)).toBeNull()
  })

  it('ignores invisible elements rather than creating an extra insertion slot', () => {
    const { block, parts, drop } = fixture([[0, 0, 200, 40], [0, 48, 200, 10], [0, 64, 200, 40], [0, 128, 200, 40]])
    parts[1].style.visibility = 'hidden'
    expect(drop(3, block, 50, 52)).toEqual({ target: parts[2], after: false, guide: { left: 0, top: 50.5, width: 200, height: 3 } })
    parts[1].style.visibility = 'visible'
    parts[1].style.display = 'none'
    expect(drop(3, block, 50, 52)?.target).toBe(parts[2])
  })

  it('ignores zero-size elements and empty spacer divs', () => {
    const { block, parts, drop } = fixture([[0, 0, 200, 40], [0, 48, 200, 0], [0, 64, 200, 40], [0, 128, 200, 40]])
    const spacer = document.createElement('div')
    spacer.innerHTML = '<br>'
    parts[1].after(spacer)
    expect(drop(3, spacer, 50, 52)?.target).toBe(parts[2])
    expect(drop(3, block, 50, 52)?.guide.top).toBe(50.5)
  })

  it('uses the target row orientation when dragging between grid rows', () => {
    const { block, parts, drop } = fixture([[0, 0, 100, 80], [120, 0, 100, 80], [0, 100, 100, 80], [120, 100, 100, 80]])
    const rightOfThird = drop(0, parts[2], 90, 110)
    const leftOfFourth = drop(0, parts[3], 130, 110)
    expect(rightOfThird).toEqual(leftOfFourth)
    expect(drop(0, block, 110, 110)).toEqual(rightOfThird)
    expect(rightOfThird).toEqual({ target: parts[3], after: false, guide: { left: 108.5, top: 100, width: 3, height: 80 } })
  })

  it('keeps one canonical slot across the wrap between two rows', () => {
    const { parts, drop } = fixture([[0, 0, 100, 80], [120, 0, 100, 80], [0, 100, 100, 80], [120, 100, 100, 80]])
    const endOfFirstRow = drop(0, parts[1], 210, 40)
    const startOfSecondRow = drop(0, parts[2], 10, 140)
    expect(endOfFirstRow).toEqual(startOfSecondRow)
    expect(endOfFirstRow?.guide).toEqual({ left: -1.5, top: 100, width: 3, height: 80 })
  })

  it('switches to vertical guides when responsive cards stack', () => {
    const { parts, drop } = fixture([[0, 0, 280, 80], [0, 100, 280, 80], [0, 200, 280, 80]])
    expect(drop(0, parts[1], 270, 110)).toBeNull()
    expect(drop(0, parts[1], 10, 170)?.guide).toEqual({ left: 0, top: 188.5, width: 280, height: 3 })
  })

  it('handles the leading and trailing edges of an inline row', () => {
    const { parts, drop } = fixture([[0, 0, 100, 80], [120, 0, 100, 80], [240, 0, 100, 80]])
    expect(drop(2, parts[0], 10, 40)?.guide.left).toBe(-1.5)
    expect(drop(0, parts[2], 330, 40)).toEqual({ target: parts[2], after: true, guide: { left: 338.5, top: 0, width: 3, height: 80 } })
  })

  it('does not interpret indented, vertically stacked elements as an inline row', () => {
    const { parts, drop } = fixture([[0, 0, 280, 40], [30, 64, 220, 40], [0, 128, 280, 40]])
    expect(drop(0, parts[1], 240, 95)?.guide).toEqual({ left: 0, top: 114.5, width: 280, height: 3 })
  })

  it('never targets another module or a different nested container', () => {
    const { parts, drop } = fixture([[0, 0, 200, 40], [0, 64, 200, 40], [0, 128, 200, 40]])
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    expect(drop(0, outside, 20, 90)).toBeNull()
    const container = document.createElement('div')
    parts[0].before(container)
    container.appendChild(parts[0])
    expect(drop(0, parts[1], 20, 90)).toBeNull()
  })
})
