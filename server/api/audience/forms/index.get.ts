import { sqlite } from '~/server/db/index'
import { loadForm } from '~/server/utils/forms'

export default defineEventHandler(() => {
  const ids = sqlite.prepare('SELECT id FROM forms ORDER BY id DESC').all() as { id: number }[]
  const base = String(useServerConfig().trackingBaseUrl || '').replace(/\/$/, '')
  return ids.map(({ id }) => {
    const f = loadForm('id', id)!
    return { ...f, hostedUrl: `${base}/f/${f.publicId}`, embedCode: `<script src="${base}/f/${f.publicId}/embed.js" async></script>` }
  })
})
