// Email-client compatibility lint (knowledge from caniemail.com). Flags CSS
// and markup that renders badly in major clients. The compile step
// (email-compile.ts) already fixes what can be fixed automatically — Outlook
// ghost tables, bulletproof buttons, stacking columns, var()/calc() and rgba()
// fallbacks — so these are the leftovers a human should know about.

export interface LintIssue {
  id: string
  severity: 'warn' | 'info'
  clients: string[]
  count: number
}

interface Rule {
  id: string
  severity: 'warn' | 'info'
  clients: string[]
  test: RegExp | ((src: string) => number)
}

const STYLE_ATTR = /\sstyle=(?:"([^"]*)"|'([^']*)')/gi

function declarations(style: string): { prop: string; value: string }[] {
  return style.split(';').map((d) => {
    const i = d.indexOf(':')
    return i < 0 ? null : { prop: d.slice(0, i).trim().toLowerCase(), value: d.slice(i + 1).trim() }
  }).filter((d): d is { prop: string; value: string } => !!d && !!d.prop)
}

/** rgba() that Outlook would drop without a solid colour to fall back on. Shadows and gradients don't count: Outlook ignores them whole. */
function unguardedRgba(src: string): number {
  let count = 0
  for (const m of src.matchAll(STYLE_ATTR)) {
    const solid = new Set<string>()
    for (const { prop, value } of declarations((m[1] ?? m[2] ?? '').replace(/&quot;/g, '"'))) {
      if (/shadow$/.test(prop) || /gradient\(|url\(/i.test(value)) continue
      if (!/rgba\(/i.test(value)) { solid.add(prop); continue }
      if (!solid.has(prop)) count++
    }
  }
  return count
}

/** object-fit only matters where the client can't size the image from its width/height attributes. */
function unsizedObjectFit(src: string): number {
  return [...src.matchAll(/<img\b[^>]*>/gi)]
    .filter(m => /object-fit\s*:/i.test(m[0]) && !(/\swidth=["']?\d/i.test(m[0]) && /\sheight=["']?\d/i.test(m[0])))
    .length
}

const RULES: Rule[] = [
  { id: 'css_grid', severity: 'warn', clients: ['Outlook', 'Gmail app'], test: /display\s*:\s*(inline-)?grid/gi },
  // Degrades gracefully: items stack vertically in Outlook
  { id: 'flexbox', severity: 'info', clients: ['Outlook Windows'], test: /display\s*:\s*(inline-)?flex/gi },
  { id: 'position', severity: 'info', clients: ['Gmail', 'Outlook'], test: /position\s*:\s*absolute/gi },
  { id: 'position_fixed', severity: 'warn', clients: ['Gmail', 'Outlook', 'Apple Mail'], test: /position\s*:\s*(fixed|sticky)/gi },
  { id: 'css_variables', severity: 'warn', clients: ['Gmail', 'Outlook'], test: /var\(--/gi },
  { id: 'calc', severity: 'info', clients: ['Outlook Windows', 'Gmail app'], test: /calc\(/gi },
  { id: 'svg', severity: 'warn', clients: ['Gmail', 'Outlook'], test: /<svg\b|src=["'][^"']+\.svg(\?[^"']*)?["']/gi },
  { id: 'webp', severity: 'warn', clients: ['Outlook Windows'], test: /src=["'][^"']+\.webp(\?[^"']*)?["']/gi },
  { id: 'video_audio', severity: 'warn', clients: ['Gmail', 'Outlook', 'Yahoo'], test: /<(video|audio)\b/gi },
  { id: 'background_image', severity: 'info', clients: ['Outlook Windows'], test: /background(-image)?\s*:\s*[^;"]*url\(/gi },
  { id: 'external_css', severity: 'warn', clients: ['Gmail', 'Outlook'], test: /<link\b[^>]*rel=["']?stylesheet|@import\b/gi },
  { id: 'object_fit', severity: 'info', clients: ['Outlook', 'Gmail'], test: unsizedObjectFit },
  { id: 'box_shadow', severity: 'info', clients: ['Outlook', 'Gmail'], test: /box-shadow\s*:/gi },
  // text-transform is safe everywhere: only real motion/transform counts
  { id: 'animation', severity: 'info', clients: ['Outlook', 'Gmail'], test: /(?<![\w-])(?:-webkit-)?(?:animation|transition|transform)\s*:/gi },
  { id: 'rgba', severity: 'info', clients: ['Outlook Windows'], test: unguardedRgba },
  { id: 'form', severity: 'info', clients: ['Gmail', 'Outlook', 'Apple Mail (parcial)'], test: /<(form|input|select|textarea)\b/gi },
  { id: 'min_max_width_div', severity: 'info', clients: ['Outlook Windows'], test: /<div\b[^>]*style=["'][^"']*max-width/gi },
]

export function lintEmailHtml(html: string): LintIssue[] {
  if (!html) return []
  // Our own preheader uses mso-hide and harmless inline styles; editor-only
  // attributes are stripped at send time and are not part of the output.
  const src = html.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/gi, '')
  const issues: LintIssue[] = []
  for (const rule of RULES) {
    const count = typeof rule.test === 'function' ? rule.test(src) : src.match(rule.test)?.length ?? 0
    if (count) issues.push({ id: rule.id, severity: rule.severity, clients: rule.clients, count })
  }
  return issues.sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'warn' ? -1 : 1))
}
