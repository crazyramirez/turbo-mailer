// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import PreSendChecklist from '~/components/campaigns/PreSendChecklist.vue'
import es from '~/i18n/locales/es.json'

const fetch = vi.fn()
let app: App | null = null
let updated = 0

function translate(key: string, values?: Record<string, unknown>) {
  const value = key.split('.').reduce<any>((node, part) => node?.[part], es)
  return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (match, name) => String(values?.[name] ?? match)) : key
}
async function flush() {
  for (let i = 0; i < 3; i++) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}
const text = (selector: string) => [...document.querySelectorAll(selector)].map(el => el.textContent?.replace(/\s+/g, ' ').trim())
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(b => b.textContent?.includes(label))
  if (!found) throw new Error(`Missing button: ${label}`)
  return found as HTMLButtonElement
}
const calls = (url: string) => fetch.mock.calls.filter(([u]) => u === url)

const precheck = (repairable: { id: string; count: number }[]) => ({
  items: [{ id: 'compat', group: 'content', status: 'pass' }], blocked: false, warnings: 0, active: 12, score: 1, etaMinutes: 1,
  repairable, editable: true,
})
const review = {
  verdict: 'Correcto, con detalles a pulir.',
  issues: [
    { severity: 'medium', category: 'CTA', problem: 'Dos «Más información»', fix: 'Cambia el segundo', edit: { target: 'body', find: 'Más información', replace: 'Ver casos', occurrence: 2 } },
    { severity: 'medium', category: 'Asunto', problem: 'Variable sin respaldo', fix: 'Añade respaldo', edit: { target: 'subject', find: '{{Empresa}},', replace: '{{Empresa | "Tu equipo"}},', occurrence: 0 } },
    { severity: 'low', category: 'Enlace', problem: 'Enlace repetido', fix: 'Usa otra URL', edit: { target: 'none', find: '', replace: '', occurrence: 0 } },
  ],
}

beforeEach(() => {
  fetch.mockReset()
  updated = 0
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('useI18n', () => ({ t: translate, te: (key: string) => translate(key) !== key }))
  let repaired = false
  fetch.mockImplementation(async (url: string, options?: any) => {
    if (url === '/api/ai/status') return { configured: true }
    if (url.startsWith('/api/campaigns/7/precheck')) return precheck(repaired ? [] : [{ id: 'webp', count: 1 }, { id: 'image_crop', count: 6 }])
    if (url === '/api/campaigns/7/repair') { repaired = true; return { changes: [{ id: 'webp', count: 1 }, { id: 'image_crop', count: 6 }], previous: { templateHtml: '<p>antes</p>' } } }
    if (url === '/api/ai/review') return review
    if (url === '/api/campaigns/7/apply-edits') {
      // The second edit of a batch "doesn't match" in the stored text
      return { applied: [0], failed: options.body.edits.length > 1 ? [1] : [], previous: { subject: 'orig', templateHtml: '<p>editado</p>' } }
    }
    if (url === '/api/campaigns/7') return {}
    throw new Error(`Unexpected request: ${url}`)
  })
})
afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(PreSendChecklist, { campaignId: 7, onUpdated: () => updated++ })
  app.mount(host)
  await flush()
}

describe('pre-send checklist: one-click fixes', () => {
  it('lists what can be repaired, repairs it and undoes everything back to the original', async () => {
    await mount()
    expect(text('.pc-repair-list li')).toEqual([
      '1 imagen(es) WebP → JPG/PNG (Outlook Windows no muestra WebP)',
      '6 imagen(es) recortadas a su caja para que no se deformen donde se ignora object-fit',
    ])
    button('Reparar ahora').click()
    await flush()
    expect(calls('/api/campaigns/7/repair')).toHaveLength(1)
    expect(updated).toBe(1)
    expect(text('.pc-repair .pc-ai-verdict')).toEqual(['Plantilla reparada:'])
    // Refreshed without the slow live probes
    expect(fetch.mock.calls.map(([u]) => u)).toContain('/api/campaigns/7/precheck')

    button('Deshacer').click()
    await flush()
    const put = calls('/api/campaigns/7').at(-1)!
    expect(put[1]).toEqual({ method: 'PUT', body: { templateHtml: '<p>antes</p>' } })
    expect(text('.pc-undo')).toEqual(['Cambios deshechos'])
    expect(updated).toBe(2)
  })

  it('applies AI corrections one by one or all at once, and marks manual ones', async () => {
    await mount()
    button('Revisar').click()
    await flush()
    expect(text('.pc-ai-list .pc-ai-state')).toEqual(['Corrección manual'])
    expect(button('Aplicar todas (2)')).toBeTruthy()

    button('Aplicar todas (2)').click()
    await flush()
    const [, options] = calls('/api/campaigns/7/apply-edits')[0]!
    expect(options.body.edits).toEqual([review.issues[0].edit, review.issues[1].edit])
    expect(text('.pc-ai-list .pc-ai-state')).toEqual(['Aplicada', 'No se encontró el texto: corrígelo a mano', 'Corrección manual'])
    expect(updated).toBe(1)
    // Undo restores the values from before the first change
    button('Deshacer').click()
    await flush()
    expect(calls('/api/campaigns/7').at(-1)![1].body).toEqual({ subject: 'orig', templateHtml: '<p>editado</p>' })
  })
})
