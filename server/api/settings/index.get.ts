import { publicSettings } from '~/server/utils/settings-schema'
import { getSmtpProfiles } from '~/server/utils/mailer'
import { getImapConfig } from '~/server/utils/bounce-processor'
import { APP_VERSION } from '~/utils/version'

export default defineEventHandler(async () => {
  const config = useServerConfig()
  return {
    settings: publicSettings(config),
    senders: getSmtpProfiles(config).map(p => ({
      id: p.id,
      name: p.name,
      host: p.host,
      port: p.port,
      secure: p.secure,
      user: p.user,
      fromEmail: p.fromEmail ?? null,
      fromName: p.fromName ?? null,
      replyTo: p.replyTo ?? null,
      dkimDomain: p.dkimDomain ?? null,
      dkimSelector: p.dkimSelector ?? null,
      dkimConfigured: !!p.dkimPrivateKey,
      maxPerSecond: p.maxPerSecond ?? 0,
      dailyLimit: p.dailyLimit ?? 0,
      backup: !!p.backup,
      priority: p.priority ?? 0,
    })),
    imap: getImapConfig() ? { host: getImapConfig()!.host, user: getImapConfig()!.user } : null,
    env: {
      encryptionKeySet: !!process.env.ENCRYPTION_KEY,
      dataDir: process.env.DATA_DIR || null,
      version: APP_VERSION,
      node: process.version,
    },
  }
})
