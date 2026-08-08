// Lightweight email HTML sanitizer.
// Removes script injection vectors without stripping valid email HTML/CSS.
//
// This runs on a trust boundary: template HTML is stored and later re-served as
// text/html (template preview) and mailed out, so a stored payload here becomes
// a stored XSS in the operator's own session. The rules below are written to be
// bypass-resistant rather than minimal - see test/unit/html-sanitize.test.ts.

// Unclosed `<script>` still executes when the browser auto-closes it at EOF,
// so an optional closing tag must not be required to strip the block.
const SCRIPT_RE = /<script\b[\s\S]*?(?:<\/script\s*>|$)/gi

// Tags that can execute or exfiltrate inside an HTML email preview. None of
// them are valid email markup, so removing them outright is safe.
const DANGEROUS_TAG_RE =
  /<\s*\/?\s*(?:script|iframe|frame|frameset|object|embed|applet|base|meta|link|form|svg|math|template|portal)\b[^>]*>/gi

// Event handlers may be preceded by any whitespace OR by `/` (`<svg/onload=..>`),
// and the value may be double-quoted, single-quoted, or bare.
const EVENT_HANDLER_RE = /[\s/]+on[a-z][a-z0-9-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi

// Every attribute that can carry a URL, in any quoting style.
const URL_ATTR_RE =
  /\b(href|src|xlink:href|background|action|formaction|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'cid'])

/** Decode the entity/escape forms a browser resolves *before* scheme parsing. */
function normalizeUrlForSchemeCheck(value: string): string {
  return value
    // &#106; &#x6a; &#106 (trailing semicolon is optional in browsers)
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(?:tab|newline|NewLine);/gi, '')
    // URL parsers strip whitespace and C0/C1 control characters, so
    // `java\tscript:` and `java\nscript:` both still reach the JS scheme.
    .replace(new RegExp('[\\s\\u0000-\\u0020\\u007f-\\u009f]+', 'g'), '')
    .toLowerCase()
}

/** True when the URL resolves to a scheme outside the email-safe allowlist. */
function isDangerousUrl(rawValue: string): boolean {
  const normalized = normalizeUrlForSchemeCheck(rawValue)
  const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/)?.[1]
  // Schemeless URLs (relative, anchors, `{{VARS}}`, protocol-relative) are fine.
  if (!scheme) return false
  return !ALLOWED_SCHEMES.has(scheme)
}

/**
 * Sanitizes HTML intended for email templates.
 * Removes XSS vectors while preserving valid email markup.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return html
  return html
    .replace(SCRIPT_RE, '')
    .replace(DANGEROUS_TAG_RE, '')
    .replace(EVENT_HANDLER_RE, '')
    .replace(URL_ATTR_RE, (match, attr, dq, sq, bare) => {
      const value = dq ?? sq ?? bare ?? ''
      if (!isDangerousUrl(value)) return match
      // Preserve the original quoting style so surrounding markup stays intact.
      if (sq !== undefined) return `${attr}='#'`
      return `${attr}="#"`
    })
}
