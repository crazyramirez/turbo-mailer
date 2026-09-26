import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf-8')

// contacts.email carries a UNIQUE index. Both write paths must translate a
// collision into a 409 rather than letting the constraint surface as a 500.
describe('duplicate email handling', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE contacts (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE
      );
      INSERT INTO contacts (id, email) VALUES (1, 'a@x.com'), (2, 'b@x.com');
    `)
  })

  /** Mirrors the pre-flight check in [id].put.ts */
  const clashOnUpdate = (id: number, email: string) =>
    db.prepare('SELECT id FROM contacts WHERE email = ? AND id != ? LIMIT 1').get(email, id)

  it('detects an update that would collide with another contact', () => {
    expect(clashOnUpdate(1, 'b@x.com')).toBeTruthy()
  })

  it('allows a contact to keep its own email', () => {
    expect(clashOnUpdate(1, 'a@x.com')).toBeFalsy()
  })

  it('allows an update to a genuinely free email', () => {
    expect(clashOnUpdate(1, 'new@x.com')).toBeFalsy()
  })

  it('the unique index really would reject the collision', () => {
    expect(() => db.prepare('UPDATE contacts SET email = ? WHERE id = 1').run('b@x.com')).toThrow()
  })
})

describe('duplicate email endpoints', () => {
  it('POST rejects an existing email with 409', () => {
    const src = read('server/api/contacts/index.post.ts')
    expect(src).toMatch(/statusCode: 409/)
  })

  it('PUT checks for a collision before writing', () => {
    const src = read('server/api/contacts/[id].put.ts')
    expect(src).toMatch(/email = \? COLLATE NOCASE AND id != \?/)
    expect(src).toMatch(/statusCode: 409, statusMessage: 'Email already exists'/)
    // The guard must run before the UPDATE, not after.
    expect(src.indexOf("'Email already exists'")).toBeLessThan(src.indexOf('UPDATE contacts SET email'))
  })
})

describe('contacts page error handling', () => {
  const src = read('pages/contacts.vue')

  // saveContact had no try/catch: a 409 threw an unhandled FetchError, the Vue
  // handler crashed and the modal stayed open with no explanation.
  it('handles save failures instead of throwing', () => {
    expect(src).toMatch(/async function saveContact[\s\S]*?try \{/)
    expect(src).toMatch(/catch \(e: any\)/)
  })

  it('reports the duplicate-email case specifically', () => {
    expect(src).toMatch(/status === 409/)
    expect(src).toMatch(/contacts_page\.error_email_exists/)
  })

  it('guards against double submission', () => {
    expect(src).toMatch(/savingContact/)
    expect(src).toMatch(/:disabled="savingContact"/)
  })
})

describe('i18n coverage for the new error strings', () => {
  const en = JSON.parse(read('i18n/locales/en.json'))
  const es = JSON.parse(read('i18n/locales/es.json'))

  it('defines the error keys in both locales', () => {
    for (const key of ['error_email_exists', 'error_save']) {
      expect(en.contacts_page[key], `en.${key}`).toBeTruthy()
      expect(es.contacts_page[key], `es.${key}`).toBeTruthy()
    }
  })

  it('keeps en and es at full key parity', () => {
    const flat = (o: any, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : [p + k],
      )
    const a = new Set(flat(en))
    const b = new Set(flat(es))
    expect([...a].filter(k => !b.has(k)), 'keys missing from es').toEqual([])
    expect([...b].filter(k => !a.has(k)), 'keys missing from en').toEqual([])
  })
})

describe('stale contact references after delete', () => {
  const src = read('pages/contacts.vue')

  // The activity popover holds a contact snapshot. After deleting contacts the
  // popover kept rendering and ContactTimeline re-requested
  // /api/contacts/<id>/timeline for a row that no longer existed -> 404.
  it('closes the activity popover when its contact disappears', () => {
    expect(src).toMatch(/hoverContact\.value &&\s*\n?\s*!contacts\.value\.some/)
    expect(src).toMatch(/closeHoverPopover\(\)/)
  })

  it('prunes selections that no longer exist', () => {
    expect(src).toMatch(/stillValid/)
    expect(src).toMatch(/visible\.has\(id\)/)
  })

  it('runs the cleanup inside fetchContacts so every path is covered', () => {
    const fetchStart = src.indexOf('async function fetchContacts')
    const fetchEnd = src.indexOf('let searchTimer')
    const body = src.slice(fetchStart, fetchEnd)
    expect(body).toMatch(/closeHoverPopover/)
    expect(body).toMatch(/stillValid/)
  })
})

describe('sidebar labelling', () => {
  it('uses a dedicated key, not the nav label', () => {
    const src = read('pages/contacts.vue')
    expect(src).toMatch(/contacts_page\.lists_sidebar_title/)
    // Reusing nav.contacts would rename the navigation entry too.
    expect(src).not.toMatch(/<h3>\{\{ t\("nav\.contacts"\) \}\}<\/h3>/)
  })

  it('defines the label in both locales', () => {
    const en = JSON.parse(read('i18n/locales/en.json'))
    const es = JSON.parse(read('i18n/locales/es.json'))
    expect(en.contacts_page.lists_sidebar_title).toBe('Contacts List')
    expect(es.contacts_page.lists_sidebar_title).toBeTruthy()
  })
})
