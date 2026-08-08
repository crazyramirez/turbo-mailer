import { describe, it, expect } from 'vitest'
import { classifyOpen, classifyClick } from '~/server/utils/bot-detect'

// Real user agents observed in the wild.
const UA = {
  appleMpp: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
  gmailProxy: 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)',
  yahooProxy: 'Mozilla/5.0 (compatible; YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html)',
  safeLinks: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Microsoft Office Existence Discovery',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  proofpoint: 'Mozilla/5.0 (compatible; Proofpoint/2.0)',
  chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  curl: 'curl/8.4.0',
}

describe('classifyOpen', () => {
  it('treats crawlers and link scanners as bots', () => {
    expect(classifyOpen(UA.googlebot)).toBe('bot')
    expect(classifyOpen(UA.safeLinks)).toBe('bot')
    expect(classifyOpen(UA.proofpoint)).toBe('bot')
    expect(classifyOpen(UA.curl)).toBe('bot')
  })

  it('treats an empty user agent as a bot', () => {
    expect(classifyOpen('')).toBe('bot')
  })

  it('detects image relays by user agent', () => {
    expect(classifyOpen(UA.gmailProxy)).toBe('proxy')
    expect(classifyOpen(UA.yahooProxy)).toBe('proxy')
  })

  it('detects Apple MPP prefetch (no referer, non-image Accept)', () => {
    expect(classifyOpen(UA.appleMpp, '*/*', '')).toBe('proxy')
    expect(classifyOpen(UA.appleMpp, '', '')).toBe('proxy')
  })

  it('does not flag a genuine Apple image load as a proxy', () => {
    // A real inline image request asks for image/* and carries a referer.
    expect(classifyOpen(UA.iphoneSafari, 'image/webp,image/*', 'https://mail.example.com/')).toBe('human')
    expect(classifyOpen(UA.appleMpp, 'image/webp,*/*;q=0.8', '')).toBe('human')
  })

  it('does not misclassify non-Apple browsers as MPP', () => {
    expect(classifyOpen(UA.chromeDesktop, '*/*', '')).toBe('human')
  })

  it('counts an ordinary human open', () => {
    expect(classifyOpen(UA.chromeDesktop, 'image/webp', 'https://mail.example.com/')).toBe('human')
  })
})

describe('classifyClick', () => {
  it('rejects scanners that pre-fetch links', () => {
    expect(classifyClick(UA.safeLinks, 'text/html')).toBe('bot')
    expect(classifyClick(UA.proofpoint, 'text/html')).toBe('bot')
    expect(classifyClick(UA.googlebot, 'text/html')).toBe('bot')
  })

  it('rejects requests that do not accept html', () => {
    expect(classifyClick(UA.chromeDesktop, 'image/*')).toBe('bot')
    expect(classifyClick(UA.chromeDesktop, 'application/json')).toBe('bot')
  })

  it('rejects an empty user agent', () => {
    expect(classifyClick('', 'text/html')).toBe('bot')
  })

  it('counts a real browser navigation', () => {
    expect(classifyClick(UA.chromeDesktop, 'text/html,application/xhtml+xml')).toBe('human')
    expect(classifyClick(UA.iphoneSafari, 'text/html')).toBe('human')
  })

  it('counts a click from behind an image relay as human', () => {
    // Relays prefetch images, not links: a click carrying such a UA is a person.
    expect(classifyClick(UA.appleMpp, 'text/html')).toBe('human')
  })

  it('tolerates a missing Accept header from a real browser', () => {
    expect(classifyClick(UA.chromeDesktop, '')).toBe('human')
  })
})
