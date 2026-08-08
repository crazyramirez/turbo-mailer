import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf-8')
const ACCENTED = 'Andrés Ramírez'

describe('CSV import encoding', () => {
  const parse = (opts: XLSX.ParsingOptions) => {
    const csv = `email,name\ntest@x.com,${ACCENTED}\n`
    const wb = XLSX.read(new Uint8Array(Buffer.from(csv, 'utf8')), opts)
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
      wb.Sheets[wb.SheetNames[0]], { defval: '' },
    )
    return rows[0].name
  }

  it('mangles UTF-8 without an explicit codepage (the original bug)', () => {
    expect(parse({ type: 'array' })).toBe('AndrÃ©s RamÃ­rez')
  })

  it('reads accents correctly with codepage 65001', () => {
    expect(parse({ type: 'array', codepage: 65001 })).toBe(ACCENTED)
  })

  it('leaves .xlsx parsing unaffected', () => {
    const buf = fs.readFileSync(path.resolve(process.cwd(), 'data/demo/contacts_demo.xlsx'))
    const rowsOf = (opts: XLSX.ParsingOptions) => {
      const wb = XLSX.read(new Uint8Array(buf), opts)
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
    }
    expect(rowsOf({ type: 'array', codepage: 65001 })).toEqual(rowsOf({ type: 'array' }))
  })
})

describe('import call sites set the codepage', () => {
  for (const file of ['pages/contacts.vue', 'composables/useContactImport.ts']) {
    it(`${file} passes codepage 65001`, () => {
      const src = read(file)
      expect(src).toMatch(/codepage:\s*65001/)
      expect(src).not.toMatch(/XLSX\.read\([^)]*\{\s*type:\s*['"]array['"]\s*\}/)
    })
  }
})

describe('CSV export encoding', () => {
  it('prefixes a UTF-8 BOM so Excel renders accents', () => {
    const src = read('server/api/contacts/export.get.ts')
    const match = src.match(/return '(.*)' \+ csv/)
    expect(match, 'BOM prefix present').toBeTruthy()
    expect(match![1]).toBe('\ufeff')
  })

  it('still declares utf-8 in the content type', () => {
    expect(read('server/api/contacts/export.get.ts')).toMatch(/charset=utf-8/)
  })
})
