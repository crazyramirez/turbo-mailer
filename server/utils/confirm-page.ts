import { escapeHtml } from '~/server/utils/template'

// Minimal standalone pages for the double opt-in flow (served as HTML by the
// API route, no SPA needed).

const STYLE = `body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
.card{background:#1e293b;border-radius:18px;padding:40px 32px;max-width:420px;text-align:center;}
.icon{font-size:44px;margin-bottom:16px;}
h1{font-size:20px;margin:0 0 12px;}
p{font-size:14px;color:#94a3b8;line-height:1.6;margin:0;}
button{margin-top:24px;background:#6366f1;color:#fff;border:0;border-radius:12px;padding:14px 32px;font-size:15px;font-weight:700;cursor:pointer;}`

export function htmlPage(title: string, message: string, ok: boolean, form?: { action: string; fields: Record<string, string>; button: string }): string {
  const formHtml = form
    ? `<form method="post" action="${escapeHtml(form.action)}">${Object.entries(form.fields)
      .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`).join('')}<button type="submit">${escapeHtml(form.button)}</button></form>`
    : ''
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style></head>
<body><div class="card">
  <div class="icon">${ok ? '✅' : form ? '✉️' : '⚠️'}</div>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  ${formHtml}
</div></body></html>`
}
