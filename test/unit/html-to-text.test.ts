import { describe, it, expect } from 'vitest'
import { htmlToText } from '~/server/utils/html-to-text'

describe('htmlToText', () => {
  it('strips tags and keeps text', () => {
    expect(htmlToText('<p>Hola <b>mundo</b></p>')).toBe('Hola mundo')
  })

  it('renders links as "label (url)"', () => {
    expect(htmlToText('<a href="https://x.com/a">Ver más</a>'))
      .toBe('Ver más (https://x.com/a)')
  })

  it('does not duplicate url when label equals href', () => {
    expect(htmlToText('<a href="https://x.com">https://x.com</a>')).toBe('https://x.com')
  })

  it('drops tracking pixels but keeps meaningful alt text', () => {
    expect(htmlToText('<img src="pixel.gif"><img src="logo.png" alt="ACME">')).toBe('ACME')
  })

  it('removes style/script blocks entirely', () => {
    expect(htmlToText('<style>p{color:red}</style><script>alert(1)</script>Hi')).toBe('Hi')
  })

  it('converts list items to bullets and blocks to newlines', () => {
    const out = htmlToText('<ul><li>Uno</li><li>Dos</li></ul><p>Fin</p>')
    expect(out).toBe('• Uno\n• Dos\nFin')
  })

  it('decodes entities', () => {
    expect(htmlToText('Tom &amp; Jerry &copy; &#8364;5')).toBe('Tom & Jerry © €5')
  })

  it('collapses excessive blank lines', () => {
    const out = htmlToText('<p>a</p><p></p><p></p><p>b</p>')
    expect(out).toBe('a\n\nb')
  })

  it('handles empty input', () => {
    expect(htmlToText('')).toBe('')
  })
})
