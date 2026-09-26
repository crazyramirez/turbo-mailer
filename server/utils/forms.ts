import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { sqlite } from '~/server/db/index'
import { escapeHtml } from '~/server/utils/template'

// Hosted / embeddable subscription forms.
//
// Anti-abuse without annoying humans: a honeypot field, a signed render
// timestamp (too-fast or stale submissions rejected), per-IP rate limit and
// optional Cloudflare Turnstile.

export interface FormField {
  key: string // email | name | company | role | phone | custom.<key>
  label: string
  type: 'email' | 'text' | 'tel' | 'select' | 'checkbox' | 'date' | 'number'
  required?: boolean
  options?: string[]
}

export interface FormRow {
  id: number
  publicId: string
  name: string
  listId: number | null
  fields: FormField[]
  tags: string[]
  doubleOptIn: boolean
  title: string | null
  description: string | null
  buttonText: string | null
  successMessage: string | null
  redirectUrl: string | null
  consentText: string | null
  theme: { accent?: string; background?: string; text?: string; radius?: number } | null
  enabled: boolean
  submissions: number
}

export function newPublicId(): string {
  return randomBytes(9).toString('base64url')
}

export function loadForm(where: 'id' | 'public', value: string | number): FormRow | null {
  const r = sqlite.prepare(`SELECT * FROM forms WHERE ${where === 'id' ? 'id' : 'public_id'} = ?`).get(value) as any
  if (!r) return null
  const j = (v: any, fb: any) => { try { return v ? JSON.parse(v) : fb } catch { return fb } }
  return {
    id: r.id, publicId: r.public_id, name: r.name, listId: r.list_id, fields: j(r.fields, []), tags: j(r.tags, []),
    doubleOptIn: !!r.double_opt_in, title: r.title, description: r.description, buttonText: r.button_text,
    successMessage: r.success_message, redirectUrl: r.redirect_url, consentText: r.consent_text,
    theme: j(r.theme, null), enabled: !!r.enabled, submissions: r.submissions ?? 0,
  }
}

const FIELD_TYPES = ['email', 'text', 'tel', 'select', 'checkbox', 'date', 'number']
const BUILTIN_KEYS = ['email', 'name', 'company', 'role', 'phone', 'url']

export function sanitizeFields(input: unknown): FormField[] {
  const list = Array.isArray(input) ? input : []
  const out: FormField[] = []
  const seen = new Set<string>()
  for (const f of list.slice(0, 20)) {
    const key = String(f?.key || '')
    if (!(BUILTIN_KEYS.includes(key) || /^custom\.[a-z][a-z0-9_]{0,39}$/.test(key)) || seen.has(key)) continue
    seen.add(key)
    const type = FIELD_TYPES.includes(f?.type) ? f.type : key === 'email' ? 'email' : 'text'
    out.push({
      key,
      label: String(f?.label || key).slice(0, 80),
      type: key === 'email' ? 'email' : type,
      required: key === 'email' ? true : !!f?.required,
      options: type === 'select' ? (Array.isArray(f?.options) ? f.options.map((o: unknown) => String(o).slice(0, 80)).slice(0, 50) : []) : undefined,
    })
  }
  if (!out.some(f => f.key === 'email')) out.unshift({ key: 'email', label: 'Email', type: 'email', required: true })
  return out
}

// ── Anti-abuse ──────────────────────────────────────────────────────────────

function sigKey(): string {
  return createHmac('sha256', String(useServerConfig().unsubscribeSecret || 'tm')).update('purpose:form').digest('hex')
}

export function formToken(publicId: string): string {
  const ts = Date.now()
  const sig = createHmac('sha256', sigKey()).update(`${publicId}:${ts}`).digest('hex').slice(0, 32)
  return `${ts}.${sig}`
}

export function checkFormToken(publicId: string, token: string): 'ok' | 'too_fast' | 'expired' | 'invalid' {
  const [tsRaw, sig] = String(token || '').split('.')
  const ts = Number(tsRaw)
  if (!ts || !sig) return 'invalid'
  const expected = createHmac('sha256', sigKey()).update(`${publicId}:${ts}`).digest('hex').slice(0, 32)
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalid'
  const age = Date.now() - ts
  if (age < 2500) return 'too_fast'
  if (age > 24 * 3600_000) return 'expired'
  return 'ok'
}

const hits = new Map<string, number[]>()
export function rateLimited(key: string, max = 5, windowMs = 10 * 60_000): boolean {
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  arr.push(now)
  hits.set(key, arr)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k)
  return arr.length > max
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = String(useServerConfig().turnstileSecret || '')
  if (!secret) return true
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token || '', remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json() as { success?: boolean }
    return json.success === true
  } catch {
    return false
  }
}

// ── Hosted page ─────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i

export function renderFormPage(form: FormRow, opts: { nonce: string; embedded: boolean; siteKey: string | null; lang: string }): string {
  const t = form.theme ?? {}
  const accent = HEX.test(String(t.accent)) ? t.accent : '#6366f1'
  const bg = HEX.test(String(t.background)) ? t.background : '#ffffff'
  const fg = HEX.test(String(t.text)) ? t.text : '#0f172a'
  const radius = Math.min(24, Math.max(0, Number(t.radius ?? 10)))
  const en = opts.lang.startsWith('en')
  const e = escapeHtml

  const fieldsHtml = form.fields.map((f, i) => {
    const id = `f${i}`
    const req = f.required ? ' required' : ''
    const name = e(f.key)
    if (f.type === 'checkbox') {
      return `<label class="chk"><input type="checkbox" name="${name}" value="true"${req}> ${e(f.label)}</label>`
    }
    if (f.type === 'select') {
      return `<label for="${id}">${e(f.label)}${f.required ? ' *' : ''}</label><select id="${id}" name="${name}"${req}><option value=""></option>${(f.options ?? []).map(o => `<option>${e(o)}</option>`).join('')}</select>`
    }
    const type = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'
    const auto = f.key === 'email' ? ' autocomplete="email"' : f.key === 'name' ? ' autocomplete="name"' : ''
    return `<label for="${id}">${e(f.label)}${f.required ? ' *' : ''}</label><input id="${id}" type="${type}" name="${name}"${auto}${req} maxlength="255">`
  }).join('\n')

  const consent = form.consentText
    ? `<label class="chk consent"><input type="checkbox" name="__consent" value="true" required> ${e(form.consentText)}</label>`
    : ''
  const captcha = opts.siteKey ? `<div class="cf-turnstile" data-sitekey="${e(opts.siteKey)}"></div>` : ''

  return `<!DOCTYPE html>
<html lang="${e(opts.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${e(form.title || form.name)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:${opts.embedded ? 'transparent' : '#f1f5f9'};color:${fg}}
.wrap{max-width:480px;margin:${opts.embedded ? '0' : '48px'} auto;padding:${opts.embedded ? '4px' : '0 16px'}}
.card{background:${bg};border-radius:${radius + 6}px;padding:28px;box-shadow:${opts.embedded ? 'none' : '0 10px 40px rgba(15,23,42,.08)'}}
h1{font-size:22px;margin:0 0 8px}p.desc{margin:0 0 20px;opacity:.75;line-height:1.5;font-size:15px}
label{display:block;font-size:13px;font-weight:600;margin:14px 0 6px}
input,select{width:100%;padding:11px 12px;border:1px solid rgba(15,23,42,.18);border-radius:${radius}px;font-size:15px;background:#fff;color:#0f172a}
input:focus,select:focus{outline:2px solid ${accent};border-color:transparent}
.chk{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:13px;line-height:1.4}.chk input{width:auto;margin-top:2px}
.consent{opacity:.85}
button{margin-top:20px;width:100%;padding:13px;border:0;border-radius:${radius}px;background:${accent};color:#fff;font-size:15px;font-weight:700;cursor:pointer}
button:disabled{opacity:.6}.hp{position:absolute;left:-9999px;top:-9999px}
.msg{margin-top:14px;font-size:14px;line-height:1.5}.msg.err{color:#dc2626}.ok{text-align:center;padding:12px 0}.ok h2{margin:8px 0}
.cf-turnstile{margin-top:14px}
</style></head>
<body><div class="wrap"><div class="card" id="card">
${form.title ? `<h1>${e(form.title)}</h1>` : ''}${form.description ? `<p class="desc">${e(form.description)}</p>` : ''}
<form id="tmf" novalidate>
${fieldsHtml}
${consent}
<div class="hp" aria-hidden="true"><label>Website<input type="text" name="website_url" tabindex="-1" autocomplete="off"></label></div>
${captcha}
<button type="submit" id="btn">${e(form.buttonText || (en ? 'Subscribe' : 'Suscribirme'))}</button>
<div class="msg" id="msg" role="status"></div>
</form></div></div>
${opts.siteKey ? `<script nonce="${opts.nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ''}
<script nonce="${opts.nonce}">
(function(){
var f=document.getElementById('tmf'),b=document.getElementById('btn'),m=document.getElementById('msg');
var token=${JSON.stringify('__TOKEN__')};
function resize(){try{parent.postMessage({tmForm:${JSON.stringify(form.publicId)},height:document.documentElement.scrollHeight},'*')}catch(e){}}
window.addEventListener('load',resize);new ResizeObserver(resize).observe(document.body);
f.addEventListener('submit',function(ev){ev.preventDefault();m.className='msg';m.textContent='';
if(!f.checkValidity()){f.reportValidity();return}
b.disabled=true;var data={};new FormData(f).forEach(function(v,k){data[k]=v});data.__t=token;
fetch('/api/forms/${encodeURIComponent(form.publicId)}/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
.then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
.then(function(res){if(!res.ok){throw new Error(res.j&&(res.j.message||res.j.statusMessage)||'Error')}
if(res.j.redirect){(window.top||window).location.href=res.j.redirect;return}
document.getElementById('card').innerHTML='<div class="ok"><div style="font-size:36px">✓</div><h2></h2><p class="desc"></p></div>';
document.querySelector('.ok h2').textContent=res.j.title;document.querySelector('.ok p').textContent=res.j.message;resize();})
.catch(function(err){m.className='msg err';m.textContent=err.message;b.disabled=false;resize()});});
})();
</script></body></html>`
}
