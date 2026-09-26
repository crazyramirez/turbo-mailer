import { getSmtpProfiles } from '~/server/utils/mailer'

// Sender identities for the campaign "From" picker. Only what an editor
// needs to choose one — no hosts, users or credentials.
export default defineEventHandler(() => {
  const config = useServerConfig()
  return getSmtpProfiles(config)
    .filter(p => !p.backup)
    .map(p => ({
      id: p.id,
      name: p.name,
      fromEmail: p.fromEmail ?? config.smtpFromEmail ?? null,
      fromName: p.fromName ?? config.smtpFromName ?? null,
      dkim: !!p.dkimPrivateKey,
    }))
})
