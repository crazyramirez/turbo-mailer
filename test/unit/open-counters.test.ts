import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

// Mirrors the counter transitions in server/api/track/open.get.ts and
// server/api/track/click.get.ts against a real SQLite database.
//
// The invariant under test: openCount and confirmedOpenCount may each move at
// most ONCE per send, no matter how many events arrive or in what order.
// Getting this wrong is silent — the numbers just drift — so it is pinned here.

let db: Database.Database

function setup() {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE campaigns (
      id INTEGER PRIMARY KEY,
      open_count INTEGER DEFAULT 0,
      confirmed_open_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0
    );
    CREATE TABLE sends (
      id INTEGER PRIMARY KEY,
      campaign_id INTEGER,
      status TEXT DEFAULT 'sent',
      opened_by_proxy INTEGER DEFAULT 0
    );
    INSERT INTO campaigns (id) VALUES (1);
    INSERT INTO sends (id, campaign_id, status) VALUES (1, 1, 'sent');
  `)
  return d
}

/** Applies the open-endpoint counter logic for one pixel hit. */
function recordOpen(isProxy: boolean) {
  const send = db.prepare('SELECT * FROM sends WHERE id = 1').get() as any

  const wasUnopened = send.status === 'sent'
  const isFirstHumanOpen = !isProxy && (wasUnopened || send.opened_by_proxy === 1)

  if (wasUnopened) {
    db.prepare("UPDATE sends SET status = 'opened', opened_by_proxy = ? WHERE id = 1 AND status = 'sent'")
      .run(isProxy ? 1 : 0)
    db.prepare('UPDATE campaigns SET open_count = open_count + 1 WHERE id = 1').run()
  }
  if (isFirstHumanOpen) {
    db.prepare('UPDATE sends SET opened_by_proxy = 0 WHERE id = 1').run()
    db.prepare('UPDATE campaigns SET confirmed_open_count = confirmed_open_count + 1 WHERE id = 1').run()
  }
}

/** Applies the click-endpoint counter logic for one click. */
function recordClick() {
  const send = db.prepare('SELECT * FROM sends WHERE id = 1').get() as any

  const wasUnopened = send.status === 'sent'
  const isFirstHumanProof = wasUnopened || send.opened_by_proxy === 1

  if (wasUnopened) {
    db.prepare("UPDATE sends SET status = 'opened', opened_by_proxy = 0 WHERE id = 1 AND status = 'sent'").run()
    db.prepare('UPDATE campaigns SET open_count = open_count + 1 WHERE id = 1').run()
  }
  if (isFirstHumanProof) {
    db.prepare('UPDATE sends SET opened_by_proxy = 0 WHERE id = 1').run()
    db.prepare('UPDATE campaigns SET confirmed_open_count = confirmed_open_count + 1 WHERE id = 1').run()
  }
}

const counters = () =>
  db.prepare('SELECT open_count AS open, confirmed_open_count AS confirmed FROM campaigns WHERE id = 1').get() as any
const sendRow = () => db.prepare('SELECT * FROM sends WHERE id = 1').get() as any

beforeEach(() => {
  db = setup()
})

describe('open counters', () => {
  it('a single human open counts once in both metrics', () => {
    recordOpen(false)
    expect(counters()).toEqual({ open: 1, confirmed: 1 })
  })

  it('a proxy prefetch counts as an open but never as confirmed', () => {
    recordOpen(true)
    expect(counters()).toEqual({ open: 1, confirmed: 0 })
    expect(sendRow().opened_by_proxy).toBe(1)
  })

  it('a human open after a proxy prefetch upgrades without double-counting', () => {
    recordOpen(true)
    recordOpen(false)
    expect(counters()).toEqual({ open: 1, confirmed: 1 })
    expect(sendRow().opened_by_proxy).toBe(0)
  })

  it('repeated proxy prefetches never inflate anything', () => {
    for (let i = 0; i < 10; i++) recordOpen(true)
    expect(counters()).toEqual({ open: 1, confirmed: 0 })
  })

  it('repeated human opens never inflate anything', () => {
    for (let i = 0; i < 10; i++) recordOpen(false)
    expect(counters()).toEqual({ open: 1, confirmed: 1 })
  })

  it('a proxy prefetch arriving after a human open cannot downgrade it', () => {
    recordOpen(false)
    recordOpen(true)
    expect(counters()).toEqual({ open: 1, confirmed: 1 })
    expect(sendRow().opened_by_proxy).toBe(0)
  })

  it('interleaved proxy and human opens stay at one each', () => {
    recordOpen(true)
    recordOpen(false)
    recordOpen(true)
    recordOpen(false)
    expect(counters()).toEqual({ open: 1, confirmed: 1 })
  })
})

describe('click confirms opens', () => {
  it('a click with no prior open counts an open and a confirmed open', () => {
    recordClick()
    expect(counters()).toEqual({ open: 1, confirmed: 1 })
  })

  it('a click after a proxy-only open confirms it exactly once', () => {
    recordOpen(true)
    expect(counters()).toEqual({ open: 1, confirmed: 0 })
    recordClick()
    expect(counters()).toEqual({ open: 1, confirmed: 1 })
  })

  it('multiple clicks never inflate the open counters', () => {
    recordOpen(true)
    for (let i = 0; i < 5; i++) recordClick()
    expect(counters()).toEqual({ open: 1, confirmed: 1 })
  })

  it('a click after a human open changes nothing', () => {
    recordOpen(false)
    recordClick()
    expect(counters()).toEqual({ open: 1, confirmed: 1 })
  })

  it('confirmed opens never exceed raw opens under any event order', () => {
    const events = [
      () => recordOpen(true),
      () => recordOpen(false),
      () => recordClick(),
      () => recordOpen(true),
      () => recordClick(),
    ]
    for (const e of events) {
      e()
      const c = counters()
      expect(c.confirmed).toBeLessThanOrEqual(c.open)
      expect(c.open).toBeLessThanOrEqual(1)
    }
  })
})
