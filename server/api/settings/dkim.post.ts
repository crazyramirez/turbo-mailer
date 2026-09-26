import { generateKeyPairSync } from 'node:crypto'
import { getSmtpProfiles } from '~/server/utils/mailer'

// Generates a 2048-bit DKIM key pair for a sender profile and returns the DNS
// TXT record to publish. The private key is only returned here; the UI saves
// it into the profile (encrypted at rest) once the user confirms.
export default defineEventHandler(async (event) => {
  const b = await readBody<{ id?: string; domain?: string; selector?: string }>(event)
  const config = useServerConfig()
  const profile = getSmtpProfiles(config).find(p => p.id === (b?.id || 'default'))
  const domain = String(b?.domain || profile?.fromEmail?.split('@')[1] || '').trim().toLowerCase()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw createError({ statusCode: 400, statusMessage: 'Dominio no válido' })
  const selector = String(b?.selector || `tm${new Date().getFullYear()}`).trim().toLowerCase()
  if (!/^[a-z0-9-]{1,63}$/.test(selector)) throw createError({ statusCode: 400, statusMessage: 'Selector no válido' })

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const p = publicKey.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '')
  return {
    domain,
    selector,
    privateKey,
    dnsName: `${selector}._domainkey.${domain}`,
    dnsValue: `v=DKIM1; k=rsa; p=${p}`,
  }
})
