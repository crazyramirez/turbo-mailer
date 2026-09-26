import { assertPublicHttpUrl } from '~/server/utils/ssrf-guard'
import { saveImage } from '~/server/utils/uploads'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // 15MB

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const imageUrl = body.url

  if (!imageUrl) {
    throw createError({ statusCode: 400, statusMessage: 'No URL provided' })
  }

  // SSRF guard: only public http(s) hosts, no private/metadata ranges
  const safeUrl = await assertPublicHttpUrl(imageUrl)

  try {
    // Follow redirects manually so every hop is re-validated against private ranges
    let response: Response | null = null
    let currentUrl = safeUrl
    for (let hop = 0; hop < 4; hop++) {
      response = await fetch(currentUrl.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      })
      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get('location')
        if (!loc) throw new Error('Redirect without Location header')
        currentUrl = await assertPublicHttpUrl(new URL(loc, currentUrl).href)
        continue
      }
      break
    }
    if (!response) throw new Error('Fetch failed')
    if (response.status >= 300 && response.status < 400) {
      throw new Error('Too many redirects')
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`URL did not return a valid image type. Type: ${contentType}`)
    }

    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > MAX_IMAGE_BYTES) {
      throw new Error('Image too large (max 15MB)')
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error('Image too large (max 15MB)')
    }

    // Decoded, validated and re-encoded like any upload
    const saved = await saveImage(buffer, 'ai-image.jpg', 'ai_')
    return { url: saved.url }
  } catch (error: any) {
    console.error('Error downloading external image:', error.message)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Error processing external image'
    })
  }
})
