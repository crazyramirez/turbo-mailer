// Shared bot / privacy-proxy classification for the tracking endpoints.
//
// Three distinct kinds of non-human traffic hit the pixel and the click
// redirect, and they must NOT be treated the same way:
//
//  - 'bot'    Crawlers and link-safety scanners (SafeLinks, Proofpoint,
//             Googlebot...). They fetch without a human involved and carry no
//             signal at all. Never recorded.
//
//  - 'proxy'  Privacy relays that prefetch images on the recipient's behalf:
//             Apple Mail Privacy Protection, Gmail image proxy, Yahoo proxy.
//             Since iOS 15, MPP prefetches the pixel EVEN IF THE MAIL IS NEVER
//             OPENED, so counting these as opens inflates the open rate by an
//             unknown amount. They are recorded but flagged, so the UI can
//             report confirmed opens separately from proxy-inflated totals.
//
//  - 'human'  Everything else.
//
// A click is a much stronger signal than an open: proxies prefetch images, not
// links. A proxy-classified *click* is therefore still a real interaction and
// is counted normally.

export type TrafficKind = 'bot' | 'proxy' | 'human'

// Crawlers, monitoring and corporate link-scanners. A hit from any of these
// means no human saw anything.
const BOT_UA_PATTERN =
  /bot|crawler|spider|slurp|pingdom|lighthouse|preview|monitor|curl|wget|python-requests|okhttp|java\/|go-http-client|headless|phantomjs|puppeteer|playwright|SafeLinks|UrlScan|LinkScan|Microsoft.*(?:Security|Office Existence Discovery)|Barracuda|Mimecast|Proofpoint|Symantec|Sophos|IronPort|MessageLabs|MSRBOT|TrendMicro|Forcepoint|Cisco.*Email|ZeroFOX|Agari|Abnormal|Avanan|Tessian|Inky|GreatHorn|MailMarshal|Hornetsecurity|SpamTitan|AppRiver|Cloudmark|Postini|McAfee.*Email|Webroot|SolarWinds|Vade/i

// Privacy relays that prefetch remote images on the recipient's behalf.
const PROXY_UA_PATTERN =
  /GoogleImageProxy|ggpht\.com|YahooMailProxy|ProxyMail|Mail\.ru|Yandex.*Mail|GoogleDocs|via ggpht/i

/**
 * Apple Mail Privacy Protection sends a plain Safari/AppleWebKit UA with no
 * distinguishing token, so it cannot be identified by UA alone. What gives it
 * away is that the fetch is a *prefetch*: it has no Referer, and it asks for an
 * image while advertising a browser-document Accept header, which a real inline
 * image load in a mail client never does.
 *
 * Deliberately conservative: this only fires for Apple-family UAs, so a normal
 * desktop browser opening the pixel directly is not misclassified.
 */
function looksLikeApplePrivacyProxy(ua: string, accept: string, referer: string): boolean {
  const isAppleUa = /AppleWebKit/i.test(ua) && !/Chrome|Chromium|Edg\//i.test(ua)
  if (!isAppleUa) return false
  // A genuine <img> load sends `Accept: image/*` and usually a Referer.
  // MPP's prefetch sends neither.
  if (referer) return false
  return !accept || !/^image\//i.test(accept.trim())
}

/**
 * Classifies a tracking-pixel request (open).
 *
 * `accept` and `referer` are used to catch Apple MPP, which is invisible to
 * UA matching alone.
 */
export function classifyOpen(ua: string, accept = '', referer = ''): TrafficKind {
  if (!ua) return 'bot'
  if (BOT_UA_PATTERN.test(ua)) return 'bot'
  if (PROXY_UA_PATTERN.test(ua)) return 'proxy'
  if (looksLikeApplePrivacyProxy(ua, accept, referer)) return 'proxy'
  return 'human'
}

/**
 * Classifies a click-redirect request.
 *
 * Link scanners are the dominant false positive here. Real browsers always
 * advertise text/html on a top-level navigation; scanners typically send `*​/*`
 * or nothing at all.
 */
export function classifyClick(ua: string, accept = ''): TrafficKind {
  if (!ua) return 'bot'
  if (BOT_UA_PATTERN.test(ua)) return 'bot'
  if (accept && !accept.includes('text/html') && !accept.includes('text/*')) return 'bot'
  // Image relays don't follow links; a click carrying a relay UA is a human
  // who happens to sit behind one. Count it.
  return 'human'
}
