// Lightweight email HTML sanitizer.
// Removes script injection vectors without stripping valid email HTML/CSS.

const SCRIPT_RE = /<script[\s\S]*?<\/script>/gi
const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_HREF_RE = /(href|src)\s*=\s*(['"])\s*javascript:/gi
const DATA_URI_SCRIPT_RE = /(href|src)\s*=\s*(['"])\s*data:[^"']*?text\/(?:javascript|html)/gi

/**
 * Sanitizes HTML intended for email templates.
 * Removes XSS vectors while preserving valid email markup.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return html
  return html
    .replace(SCRIPT_RE, '')
    .replace(EVENT_HANDLER_RE, '')
    .replace(JS_HREF_RE, '$1=$2#')
    .replace(DATA_URI_SCRIPT_RE, '$1=$2about:blank')
}
