import { defineEventHandler, setHeader } from 'h3'
import { getEditorAssistantContext } from '~/server/utils/ai/editor-context'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  return getEditorAssistantContext()
})
