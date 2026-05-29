/**
 * Cached intro audio service.
 *
 * Wraps the LLM + TTS pipeline behind a blob-existence cache. The blob
 * path itself is the cache key (no DB row needed):
 *
 *   intros/{personaVersion}_{promptVersion}/{seedKey}/{djId}.wav
 *
 * `getOrGenerateIntro({ seedKey, djId, personaSlug, generate })`
 *   - returns the cached blob URL when the path already exists
 *   - otherwise runs `generate()` (which must return `{ wavBuffer, text }`)
 *     and uploads the result to blob, returning the new URL
 *
 * `generate()` is async and arbitrary — callers compose the LLM call,
 * the TTS call, and the WAV header construction themselves. This
 * module owns only the caching layer.
 *
 * Concurrent first-time callers may race and both pay the generation
 * cost. That's acceptable: blob upload is idempotent, the second
 * uploadBuffer just overwrites the first with byte-identical content,
 * and the duplicate cost is bounded by request rate (no thundering
 * herd because the generators are already throttled by Gemini's rate
 * limits).
 */

const blobStore = require('../storage/blobStore')
const { introBlobPath } = require('./introCacheKey')
const logger = require('../logger')
const { trackEvent } = require('../telemetry')

async function getOrGenerateIntro({
  seedKey,
  djId,
  personaSlug,
  generate,
}) {
  if (!seedKey) throw new Error('getOrGenerateIntro: seedKey required')
  if (!djId) throw new Error('getOrGenerateIntro: djId required')
  if (!personaSlug) throw new Error('getOrGenerateIntro: personaSlug required')
  if (typeof generate !== 'function') {
    throw new Error('getOrGenerateIntro: generate fn required')
  }

  const blobPath = introBlobPath({ seedKey, djId, personaSlug })

  const exists = await blobStore.objectExists(blobPath)
  if (exists) {
    const audioUrl = blobStore.getPublicUrl(blobPath)
    logger.info({ seedKey, djId, blobPath }, 'intro.cache.hit')
    trackEvent('intro.cache.hit', { seedKey, djId, personaSlug })
    return { audioUrl, text: null, cached: true, blobPath }
  }

  logger.info({ seedKey, djId, blobPath }, 'intro.cache.miss')
  trackEvent('intro.cache.miss', { seedKey, djId, personaSlug })

  const t0 = Date.now()
  const { wavBuffer, text } = await generate()
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length === 0) {
    throw new Error('getOrGenerateIntro: generate() returned empty wavBuffer')
  }

  const audioUrl = await blobStore.uploadBuffer(blobPath, wavBuffer, {
    contentType: 'audio/wav',
    cacheControl: 'public, max-age=31536000, immutable',
  })

  trackEvent(
    'intro.generated',
    { seedKey, djId, personaSlug },
    { ms: Date.now() - t0, bytes: wavBuffer.length }
  )

  return { audioUrl, text, cached: false, blobPath }
}

module.exports = { getOrGenerateIntro }
