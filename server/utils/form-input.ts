import { sanitizeFields } from '~/server/utils/forms'

const HEX = /^#[0-9a-f]{6}$/i

/** Validated form settings from an admin request body. */
export function formInput(b: Record<string, any>) {
  const name = String(b?.name || '').trim().slice(0, 120)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'El formulario necesita un nombre' })
  const redirect = String(b?.redirectUrl || '').trim()
  if (redirect && !/^https?:\/\//i.test(redirect)) throw createError({ statusCode: 400, statusMessage: 'URL de redirección no válida' })
  const theme = b?.theme && typeof b.theme === 'object' ? {
    accent: HEX.test(b.theme.accent) ? b.theme.accent : undefined,
    background: HEX.test(b.theme.background) ? b.theme.background : undefined,
    text: HEX.test(b.theme.text) ? b.theme.text : undefined,
    radius: Math.min(24, Math.max(0, Number(b.theme.radius) || 10)),
  } : null
  return {
    name,
    listId: b?.listId ? Number(b.listId) : null,
    fields: JSON.stringify(sanitizeFields(b?.fields)),
    tags: JSON.stringify((Array.isArray(b?.tags) ? b.tags : []).map((t: unknown) => String(t).trim().slice(0, 50)).filter(Boolean).slice(0, 20)),
    doubleOptIn: b?.doubleOptIn === false ? 0 : 1,
    title: String(b?.title || '').slice(0, 200) || null,
    description: String(b?.description || '').slice(0, 1000) || null,
    buttonText: String(b?.buttonText || '').slice(0, 60) || null,
    successMessage: String(b?.successMessage || '').slice(0, 500) || null,
    redirectUrl: redirect || null,
    consentText: String(b?.consentText || '').slice(0, 1000) || null,
    theme: theme ? JSON.stringify(theme) : null,
    enabled: b?.enabled === false ? 0 : 1,
  }
}
