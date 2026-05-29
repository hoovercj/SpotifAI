/**
 * Short content hash for a DJ persona file.
 *
 * Used as the first segment of the intro-audio cache key — when a
 * persona's markdown is edited (style, context, voiceID, ttsDirection,
 * etc.) the hash changes, the cache path changes, and the next
 * request regenerates fresh audio. Stale blobs are naturally orphaned.
 *
 * Hashes are computed lazily and memoized per-process. Reading 28
 * small files at boot is fine; restart the server after editing a
 * persona to pick up the new version.
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const PERSONAS_DIR = path.resolve(__dirname, '..', '..', '..', 'personas')

const cache = new Map()

function personaVersion(slug) {
  if (!slug) return 'unknown'
  if (cache.has(slug)) return cache.get(slug)
  const filePath = path.join(PERSONAS_DIR, `${slug}.md`)
  let v
  try {
    const buf = fs.readFileSync(filePath)
    v = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8)
  } catch {
    // Missing file = stable "missing" version. Cache so we don't
    // re-hit the FS on every request for an unknown DJ.
    v = 'missing'
  }
  cache.set(slug, v)
  return v
}

module.exports = { personaVersion }
