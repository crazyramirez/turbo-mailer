import { sqlite } from '~/server/db/index'
import { loadForm } from '~/server/utils/forms'
import { formInput } from '~/server/utils/form-input'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!loadForm('id', id)) throw createError({ statusCode: 404, statusMessage: 'Form not found' })
  const v = formInput(await readBody(event))
  sqlite.prepare(
    `UPDATE forms SET name = ?, list_id = ?, fields = ?, tags = ?, double_opt_in = ?, title = ?, description = ?, button_text = ?,
       success_message = ?, redirect_url = ?, consent_text = ?, theme = ?, enabled = ?, updated_at = ? WHERE id = ?`,
  ).run(v.name, v.listId, v.fields, v.tags, v.doubleOptIn, v.title, v.description, v.buttonText, v.successMessage, v.redirectUrl, v.consentText, v.theme, v.enabled, Math.floor(Date.now() / 1000), id)
  return loadForm('id', id)
})
