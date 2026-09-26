import { saveImage } from '~/server/utils/uploads'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const results: { name: string; url: string }[] = []
  const errors: { file: string; error: string }[] = []

  for (const field of formData) {
    // Some browsers or libraries send 'files', 'files[]', or just 'file'
    if (!field.filename || !(field.name === 'files' || field.name === 'file' || field.name?.includes('files'))) continue
    try {
      results.push(await saveImage(field.data, field.filename))
    } catch (err: any) {
      errors.push({ file: field.filename, error: err?.message || 'Error' })
    }
  }

  if (!results.length && errors.length) {
    throw createError({ statusCode: 400, statusMessage: errors[0].error })
  }
  return results
})
