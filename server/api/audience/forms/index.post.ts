import { sqlite } from '~/server/db/index'
import { newPublicId, loadForm } from '~/server/utils/forms'
import { formInput } from '~/server/utils/form-input'

export default defineEventHandler(async (event) => {
  const v = formInput(await readBody(event))
  const now = Math.floor(Date.now() / 1000)
  const id = Number(sqlite.prepare(
    `INSERT INTO forms (public_id, name, list_id, fields, tags, double_opt_in, title, description, button_text, success_message, redirect_url, consent_text, theme, enabled, submissions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(newPublicId(), v.name, v.listId, v.fields, v.tags, v.doubleOptIn, v.title, v.description, v.buttonText, v.successMessage, v.redirectUrl, v.consentText, v.theme, v.enabled, now, now).lastInsertRowid)
  return loadForm('id', id)
})
